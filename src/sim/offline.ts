/**
 * La production hors ligne : le rattrapage d'une absence (`catchUp`).
 *
 * L'absence se mesure hors de `sim/` — l'horloge de l'appareil, lue par
 * `main.ts` — et entre par la commande `catchUp`. Elle est d'abord rendue
 * sûre (`awayMs`) : une horloge reculée donne zéro, une absence illisible
 * aussi ; puis `catchUp` la borne au plafond (`OFFLINE.maxMs`) et la
 * rejoue par pas agrégés. Ce module tient la mesure de l'absence, la jauge
 * d'un besoin sur un pas, le récap, et le rattrapage lui-même, avec ce que
 * `World` lui prête (`OfflineContext`).
 */

import type { Emitter } from '../core/events.ts';
import type { BuildingId } from '../data/buildings.ts';
import { NURSERY_CARE } from '../data/inhabitants.ts';
import type { ItemId } from '../data/items.ts';
import { NEED_ALERT, NEED_IDS, NEEDS, type NeedId } from '../data/needs.ts';
import { OFFLINE, OFFLINE_ALERTS, type OfflineAlertId } from '../data/offline.ts';
import { PIG_FARM } from '../data/pigs.ts';
import { RECIPES, type RecipeProto } from '../data/recipes.ts';
import { RESEARCH, type ResearchId, type ResearchStat } from '../data/research.ts';
import { CROPS } from '../data/resources.ts';
import { forgeRecipe } from './consumers.ts';
import type { FieldTile } from './farmer.ts';
import type { TownFlows } from './flows.ts';
import { treesInRange } from './lumberjacks.ts';
import { DRILL_RECIPE, NURSERY_RECIPE, amountsOf, hasInputs, quarryRecipe, totalOf } from './recipes.ts';
import { isCollecting, labWants, researchCost } from './research.ts';
import type { ResourceIndex } from './resources.ts';
import { employs, type Staffing } from './staffing.ts';
import type { Store } from './store.ts';
import type { Building, Entity, EntityId, Farm, Forge, Kid, Lab, LumberCamp, Nursery, PigPen, TownHall, Worker } from './types.ts';
import type { Inhabitant, WorldEvents } from './world.ts';

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
 * donc chaque repas rend `1 - seekBelow`. Sans de quoi sous le seuil, il est affamé
 * et sa jauge reprend au retour à `OFFLINE.returnGauge` :
 * jamais mort hors ligne, ni condamné à l'être au retour.
 */
export function feedNeed(need: NeedId, level: number, ticks: number, working: boolean, take: () => boolean): FedNeed {
  const { seekBelow, restTicks, workTicks } = NEEDS[need];
  let next = level - ticks / (working ? workTicks : restTicks);
  let meals = 0;

  while (next < seekBelow && take()) {
    next += 1 - seekBelow;
    meals += 1;
  }

  const starved = next < seekBelow;

  return { level: starved ? OFFLINE.returnGauge : Math.min(1, next), meals, starved };
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

/**
 * Ce que le rattrapage voit du monde, et ce qu'il lui demande : `World` le
 * construit à chaque `catchUp` (`offlineContext`), jamais tout le monde.
 */
export interface OfflineContext {
  readonly tickCount: number;
  /** La durée d'un tick, en ms. */
  readonly stepMs: number;
  readonly defeated: boolean;
  readonly entities: ReadonlyMap<EntityId, Entity>;
  readonly resources: ResourceIndex;
  /** La tuile se récolte-t-elle ? Pas dans la zone d'une base mutante debout. */
  readonly harvestable: (tx: number, ty: number) => boolean;
  readonly events: Emitter<WorldEvents>;
  readonly flows: TownFlows;
  /** Le plafond du temps rattrapé, en ms. */
  offlineCapMs(): number;
  warehouse(): TownHall | null;
  townStock(): Store | null;
  workers(): Iterable<Worker>;
  inhabitants(): Iterable<Inhabitant>;
  staffing(building: Building): Staffing | null;
  /** En pause, ou sans ouvrier à son poste. */
  stopped(building: Building): boolean;
  bonus(stat: ResearchStat): number;
  dailyCycle(proto: BuildingId): number;
  farmField(farm: Farm): FieldTile[];
  /** Nourriture d'une case de champ récoltée. */
  cropYield(): number;
  tally(item: ItemId, amount: number): void;
  dirtyTile(tx: number, ty: number): void;
  /** Réveille le bâtiment au tick `at`. */
  schedule(id: EntityId, at: number): void;
  nurseryKids(nursery: Nursery): readonly Kid[];
  bear(nursery: Nursery): void;
  townStockForLab(lab: Lab): Store | null;
  supplyLab(lab: Lab, item: ItemId, amount: number, from: Store, source: 'town'): number;
  startCountdown(lab: Lab): void;
  finishResearch(lab: Lab): void;
  startPigPen(pen: PigPen): void;
}

/**
 * La commande `catchUp` : la ville rattrape `awayMs` d'absence, borné au
 * plafond, en agrégé — par pas de `OFFLINE.stepTicks`, pas tick par tick.
 * À chaque pas, les producteurs rendent leur cadence moyenne, les forges
 * transforment, les nurseries et les labos avancent leur compte à rebours,
 * puis chacun mange et boit. Les porteurs (ou les logisticiens) sont
 * supposés faire leur tournée : avec eux, ce qui sort va en ville et ce
 * qui entre en vient ; sans eux, chaque coffre se remplit seul.
 *
 * L'horloge du jour, elle, ne bouge pas : ni nuit, ni vague, ni mort. Un
 * habitant sans vivres s'arrête affamé (`OFFLINE.returnGauge`), et le
 * récap le dit. Rien sans mairie bâtie, ni sous `OFFLINE.minMs`.
 */
export function catchUp(world: OfflineContext, awayMs: number): void {
  const hall = world.warehouse();
  const counted = countedMs(awayMs, world.offlineCapMs());
  const total = Math.floor(counted / world.stepMs);

  if (!hall || world.defeated || total <= 0) return;

  const report: OfflineReport = {
    awayMs,
    ticks: total,
    capped: awayMs > world.offlineCapMs(),
    gained: {},
    spent: {},
    research: [],
    births: 0,
    alerts: [],
  };
  const alerts = new Set<OfflineAlertId>();
  const carriers = hasCarriers(world);
  const carry = new Map<EntityId, number>();
  const woodLeft = new Map<EntityId, number>();
  const felled = new Map<EntityId, number>();
  const births = new Map<EntityId, number>();
  const research = new Map<EntityId, number>();
  let working = 1;

  for (const entity of world.entities.values()) {
    if (entity.kind === 'nursery') births.set(entity.id, entity.hungry ? 0 : entity.nextBirthTick - world.tickCount);
    if (entity.kind === 'lab' && entity.endTick > 0) research.set(entity.id, entity.endTick - world.tickCount);
    if (entity.kind === 'lumberCamp') woodLeft.set(entity.id, standingWood(world, entity));
  }

  for (let done = 0; done < total; done += OFFLINE.stepTicks) {
    const span = Math.min(OFFLINE.stepTicks, total - done);

    for (const entity of world.entities.values()) {
      if (entity.kind === 'site') continue;

      const made = offlineOutput(world, entity, span * (employs(entity.proto) ? working : 1), woodLeft);

      if (made) {
        const kept = offlineYield(world, entity, made.item, wholeUnits(carry, entity.id, made.amount), carriers, report, alerts);

        if (entity.kind === 'lumberCamp') felled.set(entity.id, (felled.get(entity.id) ?? 0) + kept);
      }
      if (entity.kind === 'forge') offlineForge(world, entity, span * working, carry, carriers, report, alerts);
    }
    for (const entity of world.entities.values()) {
      if (entity.kind === 'nursery') offlineBirths(world, entity, span, births, carriers, report);
      if (entity.kind === 'lab') offlineResearch(world, entity, span, research, carriers, report);
    }
    working = offlineMeals(world, hall.store, span, report, alerts);
  }

  // Le bois rapporté a un prix : les arbres de la cabane, du plus proche au plus loin, perdent autant d'unités.
  for (const [id, units] of felled) {
    const camp = world.entities.get(id);

    if (camp?.kind === 'lumberCamp') fellTrees(world, camp, units);
  }

  // Les comptes à rebours repartent d'où le rattrapage les a laissés ; un ancien réveil, en avance, ne sonne plus pour rien.
  for (const entity of world.entities.values()) {
    if (entity.kind === 'nursery' && !entity.paused) {
      const left = births.get(entity.id) ?? 0;

      if (left > 0) {
        entity.hungry = false;
        entity.nextBirthTick = world.tickCount + left;
        world.schedule(entity.id, entity.nextBirthTick);
      } else {
        entity.nextBirthTick = Math.min(entity.nextBirthTick, world.tickCount);
        if (entity.hungry) alerts.add('nurseryHungry');
      }
    }
    if (entity.kind === 'lab' && entity.endTick > 0) {
      entity.endTick = world.tickCount + Math.max(1, research.get(entity.id) ?? entity.endTick - world.tickCount);
      world.schedule(entity.id, entity.endTick);
    }
    if (entity.kind === 'barracks' && entity.training) {
      entity.training.endTick = Math.max(world.tickCount, entity.training.endTick - total);
    }
    // Le cycle de l'élevage repart d'ici ; un ancien réveil, en avance, ne sonne plus pour rien.
    if (entity.kind === 'pigPen' && entity.pigs > 0 && !entity.blocked) world.startPigPen(entity);
  }

  offlineLowStock(world, hall.store, alerts);
  report.alerts = OFFLINE_ALERTS.filter((alert) => alerts.has(alert));
  // Le stock a sauté d'un coup : les débits de la ville repartent de zéro plutôt que d'afficher ce saut.
  world.flows.reset();
  world.events.emit('offlineCaughtUp', report);
}

/** Des porteurs ou des logisticiens pour faire la tournée des coffres : un ouvrier au travail qui n'est pas bâtisseur. */
function hasCarriers(world: OfflineContext): boolean {
  for (const worker of world.workers()) if (!worker.free && !worker.builder) return true;
  return false;
}

/**
 * Ce qu'un producteur sans entrée sort en `ticks` de travail, à sa cadence
 * moyenne : foreuse, carrière et puits, cabane de bûcheron, ferme. Fractionnaire,
 * `wholeUnits` en fait des unités. `null` s'il ne produit rien.
 */
function offlineOutput(world: OfflineContext, entity: Building, ticks: number, woodLeft: Map<EntityId, number>): { item: ItemId; amount: number } | null {
  if (entity.paused || ticks <= 0) return null;

  const staffing = world.staffing(entity);
  const share = staffing ? staffing.filled / Math.max(1, staffing.max) : 1;

  switch (entity.kind) {
    case 'drill': {
      if (!entity.output) return null;

      const amount = Object.values(RECIPES[DRILL_RECIPE].outputs)[0] ?? 1;

      return { item: entity.output, amount: (amount * ticks) / Math.max(1, RECIPES[DRILL_RECIPE].duration + world.bonus('drillTicks')) };
    }

    case 'quarry': {
      const recipe = quarryRecipe(entity);
      const [item, amount] = (Object.entries(recipe.outputs) as [ItemId, number][])[0] ?? ['stone', 1];

      return { item, amount: (amount * ticks * share) / (recipe.duration * world.dailyCycle(entity.proto)) };
    }

    case 'pigPen':
      return entity.pigs > 0 ? { item: 'meat', amount: (PIG_FARM.meatPerPig * entity.pigs * ticks) / PIG_FARM.cycleTicks } : null;

    case 'lumberCamp': {
      const left = woodLeft.get(entity.id) ?? 0;
      const amount = Math.min(left, (OFFLINE.lumberjackWoodPerMinute * (staffing?.filled ?? 0) * ticks) / (20 * 60));

      woodLeft.set(entity.id, left - amount);
      return { item: 'wood', amount };
    }

    case 'farm': {
      const tiles = world.farmField(entity).filter((tile) => tile.state !== 'blocked').length;

      return { item: CROPS.item, amount: (tiles * world.cropYield() * OFFLINE.farmEfficiency * share * ticks) / CROPS.ripeTicks };
    }

    default:
      return null;
  }
}

/** Range une production hors ligne : en ville si des porteurs font la tournée, sinon dans le coffre du bâtiment, tant qu'il a la place. */
function offlineYield(world: OfflineContext, entity: Building, item: ItemId, amount: number, carriers: boolean, report: OfflineReport, alerts: Set<OfflineAlertId>): number {
  if (amount <= 0) return 0;

  const kept = carriers ? (world.townStock()?.add(item, amount) ?? 0) : entity.store.add(item, Math.min(amount, Math.max(0, entity.store.freeSpace())));

  if (kept < amount) alerts.add('storeFull');
  if (kept <= 0) return 0;
  count(report.gained, item, kept);
  world.tally(item, kept);
  return kept;
}

/** Les unités de bois qui restent aux arbres debout dans le rayon d'une cabane. */
function standingWood(world: OfflineContext, camp: LumberCamp): number {
  let units = 0;

  for (const tree of treesInRange(camp, world.resources, world.harvestable)) units += world.resources.at(tree.tx, tree.ty)?.remaining ?? 0;
  return units;
}

/** Abat `units` unités de bois dans le rayon de la cabane, l'arbre le plus proche d'abord : les mêmes prises qu'un coup de hache. */
function fellTrees(world: OfflineContext, camp: LumberCamp, units: number): void {
  let left = units;

  for (const tree of treesInRange(camp, world.resources, world.harvestable)) {
    while (left > 0) {
      const taken = world.resources.take(tree.tx, tree.ty);

      if (!taken || taken.resource.id !== 'tree') break;
      left -= 1;
      if (taken.stageChanged) world.dirtyTile(tree.tx, tree.ty);
      if (taken.resource.remaining <= 0) break;
    }
    if (left <= 0) return;
  }
}

/**
 * Les cycles d'une forge (ou d'un four à charbon) en `ticks` de travail :
 * ses entrées viennent de son coffre, puis de la ville si des porteurs
 * l'approvisionnent ; il manque de quoi, elle attend la suite.
 */
function offlineForge(world: OfflineContext, forge: Forge, ticks: number, carry: Map<EntityId, number>, carriers: boolean, report: OfflineReport, alerts: Set<OfflineAlertId>): void {
  if (world.stopped(forge) || ticks <= 0) return;

  const recipe = forgeRecipe(forge);
  const town = carriers ? world.townStock() : null;
  const inputs = amountsOf(recipe.inputs);
  let cycles = wholeUnits(carry, -forge.id, ticks / recipe.duration);

  for (; cycles > 0; cycles -= 1) {
    const enough = inputs.every(([item, amount]) => forge.store.count(item) + (town?.available(item) ?? 0) >= amount);
    const room = town !== null || forge.store.freeSpace() + totalOf(recipe.inputs) >= totalOf(recipe.outputs);

    if (!enough || !room) break;
    for (const [item, amount] of inputs) {
      const own = forge.store.remove(item, amount);

      if (own < amount) town?.remove(item, amount - own);
      count(report.spent, item, amount);
    }
    for (const [item, amount] of amountsOf(recipe.outputs)) offlineYield(world, forge, item, amount, carriers, report, alerts);
  }
  if (cycles > 0) carry.set(-forge.id, 0);
}

/** Le compte à rebours d'une nurserie sur `ticks` : chaque fois qu'il arrive au bout, un enfant naît s'il y a de quoi le nourrir et de la place. */
function offlineBirths(world: OfflineContext, nursery: Nursery, ticks: number, births: Map<EntityId, number>, carriers: boolean, report: OfflineReport): void {
  if (nursery.paused) return;

  const recipe: RecipeProto = RECIPES[NURSERY_RECIPE];
  const town = carriers ? world.townStock() : null;
  let left = (births.get(nursery.id) ?? 0) - ticks;

  while (left <= 0) {
    if (world.nurseryKids(nursery).length >= NURSERY_CARE.capacity) {
      nursery.hungry = false;
      left = 0;
      break;
    }
    for (const [item, amount] of amountsOf(recipe.inputs)) {
      const missing = amount - nursery.store.count(item);

      if (town && missing > 0) nursery.store.add(item, town.remove(item, Math.min(missing, town.available(item))));
    }
    if (!hasInputs(nursery.store, recipe)) {
      nursery.hungry = true;
      left = 0;
      break;
    }
    for (const [item, amount] of amountsOf(recipe.inputs)) count(report.spent, item, amount);
    world.bear(nursery);
    report.births += 1;
    left += recipe.duration;
  }
  births.set(nursery.id, left);
}

/**
 * Le compte à rebours d'un labo sur `ticks`. Une recherche finie laisse
 * partir la suivante de la file ; celle qui attend son coût le reçoit de
 * la ville, si des porteurs l'apportent et que le labo est dans son rayon.
 */
function offlineResearch(world: OfflineContext, lab: Lab, ticks: number, running: Map<EntityId, number>, carriers: boolean, report: OfflineReport): void {
  let budget = ticks;

  while (lab.research !== null && budget > 0) {
    if (isCollecting(lab)) {
      const town = carriers ? world.townStockForLab(lab) : null;

      if (!town) return;
      for (const [item] of researchCost(lab.research)) {
        count(report.spent, item, world.supplyLab(lab, item, Math.min(labWants(lab, item), town.available(item)), town, 'town'));
      }
      world.startCountdown(lab);
      if (isCollecting(lab)) return;
      running.set(lab.id, RESEARCH[lab.research].duration);
    }

    const left = (running.get(lab.id) ?? 0) - budget;

    if (left > 0) {
      running.set(lab.id, left);
      return;
    }
    budget = -left;

    const done = lab.research;

    lab.endTick = world.tickCount;
    world.finishResearch(lab);
    report.research.push(done);
    running.set(lab.id, lab.endTick > 0 && lab.research !== null ? RESEARCH[lab.research].duration : 0);
  }
}

/**
 * Les repas d'un pas hors ligne, habitant par habitant, au stock de la
 * ville. Renvoie la part des ouvriers qui travaillent encore : ceux qui
 * n'ont plus rien n'avancent plus leur bâtiment au pas suivant.
 */
function offlineMeals(world: OfflineContext, town: Store, ticks: number, report: OfflineReport, alerts: Set<OfflineAlertId>): number {
  let laborers = 0;
  let stalled = 0;

  for (const mobile of world.inhabitants()) {
    const toiling = mobile.kind !== 'kid' && !(mobile.kind === 'worker' && mobile.free);
    let starved = false;

    for (const need of NEED_IDS) {
      const { item, meal } = NEEDS[need];
      const fed = feedNeed(need, mobile.needs[need], ticks, toiling, () => {
        if (town.available(item) < meal) return false;
        town.remove(item, meal);
        count(report.spent, item, meal);
        return true;
      });

      mobile.needs[need] = fed.level;
      if (fed.starved) {
        starved = true;
        alerts.add(need);
      }
    }
    if (mobile.kind === 'kid') continue;
    laborers += 1;
    if (starved) stalled += 1;
  }
  return laborers === 0 ? 1 : 1 - stalled / laborers;
}

/** La ville ne tiendra pas `NEED_ALERT.runwayTicks` au rythme des habitants : une alerte par besoin qui n'a pas déjà manqué. */
function offlineLowStock(world: OfflineContext, town: Store, alerts: Set<OfflineAlertId>): void {
  for (const need of NEED_IDS) {
    if (alerts.has(need)) continue;

    let rate = 0;

    for (const mobile of world.inhabitants()) rate += mealsPerTick(need, mobile.kind !== 'kid' && !(mobile.kind === 'worker' && mobile.free));
    if (rate > 0 && town.available(NEEDS[need].item) < rate * NEED_ALERT.runwayTicks) alerts.add(need === 'hunger' ? 'lowFood' : 'lowWater');
  }
}
