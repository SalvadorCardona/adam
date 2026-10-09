/**
 * La production hors ligne : la part pure du calcul (`World.catchUp` le mène).
 *
 * L'absence se mesure hors de `sim/` — l'horloge de l'appareil, lue par
 * `main.ts` — et entre par la commande `catchUp`. Elle est d'abord rendue
 * sûre (`awayMs`) : une horloge reculée donne zéro, une absence illisible
 * aussi ; puis `World.catchUp` la borne au plafond (`OFFLINE.maxMs`) et la
 * rejoue par pas agrégés. Ce module tient ce qui se calcule sans le monde :
 * la mesure de l'absence, la jauge d'un besoin sur un pas, et le récap.
 */

import { NEEDS, type NeedId } from '../data/needs.ts';
import { OFFLINE, type OfflineAlertId } from '../data/offline.ts';
import type { ItemId } from '../data/items.ts';
import type { ResearchId } from '../data/research.ts';

/** Ce que le récap « Pendant votre absence » raconte. */
export interface OfflineReport {
  /** L'absence réelle, en ms, plafond ignoré. */
  awayMs: number;
  /** Le temps rattrapé, en ticks : l'absence, bornée au plafond. */
  ticks: number;
  /** Vrai si l'absence dépassait le plafond : le reste n'a rien rapporté. */
  capped: boolean;
  /** Objets produits : ce que les bâtiments ont sorti, en ville ou dans leur coffre. */
  gained: Partial<Record<ItemId, number>>;
  /** Objets consommés : repas, gorgées, entrées des forges, nourriture des naissances. */
  spent: Partial<Record<ItemId, number>>;
  /** Recherches finies, dans l'ordre. */
  research: ResearchId[];
  /** Enfants nés. */
  births: number;
  /** Ce qui demande l'attention au retour, dans l'ordre de `OFFLINE_ALERTS`. */
  alerts: OfflineAlertId[];
}

/**
 * L'absence sûre, en ms : le temps écoulé depuis `savedAt` jusqu'à `now`.
 * Une date illisible, absente (0) ou dans le futur — l'horloge de l'appareil
 * reculée — donne 0 : on ne gagne rien à jouer avec l'heure. Une avance de
 * l'horloge, elle, ne rapporte jamais plus que le plafond.
 */
export function awayMs(savedAt: number, now: number): number {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now) || savedAt <= 0) return 0;
  return Math.max(0, now - savedAt);
}

/** L'absence rattrapée, en ms : rien sous `OFFLINE.minMs`, jamais plus que `capMs`. */
export function countedMs(away: number, capMs: number): number {
  if (!Number.isFinite(away) || away < OFFLINE.minMs) return 0;
  return Math.min(away, Math.max(0, capMs));
}

/** Ce qu'est devenue une jauge au bout d'un pas : son niveau, les repas pris, et s'il a manqué. */
export interface FedNeed {
  level: number;
  meals: number;
  starved: boolean;
}

/**
 * Une jauge sur `ticks` de temps agrégé : elle baisse à sa cadence (travail
 * ou repos) ; chaque fois qu'elle passe sous `seekBelow`, l'habitant prend
 * un repas si `take()` le lui donne — en jeu, la jauge remonte à 1 au seuil,
 * donc chaque repas rend `1 - seekBelow`. Sans de quoi, elle s'arrête à
 * `OFFLINE.starvedGauge` : affamé, jamais mort hors ligne.
 */
export function feedNeed(need: NeedId, level: number, ticks: number, working: boolean, take: () => boolean): FedNeed {
  const { seekBelow, restTicks, workTicks } = NEEDS[need];
  let next = level - ticks / (working ? workTicks : restTicks);
  let meals = 0;

  while (next < seekBelow && take()) {
    next += 1 - seekBelow;
    meals += 1;
  }

  const starved = next <= OFFLINE.starvedGauge;

  return { level: Math.min(1, Math.max(OFFLINE.starvedGauge, next)), meals, starved };
}

/** Repas pris par tick, en moyenne, par un habitant pour ce besoin : de quoi dire combien de temps tiendra le stock. */
export function mealsPerTick(need: NeedId, working: boolean): number {
  const { meal, seekBelow, restTicks, workTicks } = NEEDS[need];

  return meal / ((working ? workTicks : restTicks) * (1 - seekBelow));
}

/** Ajoute `amount` à un compte d'objets. */
export function count(into: Partial<Record<ItemId, number>>, item: ItemId, amount: number): void {
  if (amount > 0) into[item] = (into[item] ?? 0) + amount;
}

/**
 * Un débit fractionnaire rendu en unités entières : `carry` garde ce qui ne
 * fait pas encore une unité d'un pas à l'autre. Renvoie les unités du pas.
 */
export function wholeUnits(carry: Map<number, number>, id: number, amount: number): number {
  const total = (carry.get(id) ?? 0) + amount;
  const whole = Math.floor(total + 1e-9);

  carry.set(id, total - whole);
  return whole;
}
