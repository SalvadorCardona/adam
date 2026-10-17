/**
 * Les morceaux de la quête qui ne gardent rien : la ligne d'un objectif et
 * sa jauge, le détail de l'objectif choisi, la tête et la case du chapitre,
 * le défi du jour. Des fonctions du monde vers le DOM ; seule la ligne d'un
 * objectif est un bouton gardé d'une mise à jour à l'autre.
 */

import { BUILDINGS } from '../../data/buildings.ts';
import { CHALLENGES, type ChallengeId } from '../../data/challenges.ts';
import type { ItemId } from '../../data/items.ts';
import { CHAPTERS, objectiveProto, type Goal, type ObjectiveId } from '../../data/objectives.ts';
import { goalProgress, goalWait, objectiveLock, type GoalWait, type ObjectiveLock } from '../../sim/objectives.ts';
import { researchCost } from '../../sim/research.ts';
import { TICKS_PER_SECOND, type World } from '../../sim/world.ts';
import { locale, t } from '../../i18n/locale.ts';
import { buildingIcon, itemIcon, uiIcon } from '../icons.ts';
import { bar, clock, element, text, tipped } from './dom.ts';

/** « Chapitre 3/10 », ou « Après le Signal » une fois la partie bouclée : la partie sans fin. */
export function chapterLabel(index: number): string {
  return index < CHAPTERS.length ? t().hud.quest.chapter(index + 1, CHAPTERS.length) : t().hud.quest.afterSignal;
}

/** La case de la barre : la vignette du chapitre, son nom, ses objectifs réussis sur le total. */
export function chapterStrip(index: number, done: number, total: number): HTMLElement[] {
  const proto = CHAPTERS[index];

  if (!proto) return [uiIcon('goal', 20), text('hud-strip-title', t().hud.quest.afterSignal)];
  return [buildingIcon(proto.icon, 22), text('hud-strip-title', t().chapters[index]!.title), text('hud-strip-value', `${done}/${total}`)];
}

/** La tête de la liste, dans la fenêtre : la vignette du chapitre, son nom, « 2/4 ». */
export function chapterHead(index: number, done: number, total: number): HTMLElement {
  const head = element('div', 'hud-quest-goal hud-chapter-head');

  head.append(...chapterStrip(index, done, total));
  return head;
}

/** Où en est un objectif, pour sa ligne : réussi, et sa jauge — la condition seule, ou les conditions remplies. */
export interface ObjectiveLine {
  id: ObjectiveId;
  done: boolean;
  have: number;
  need: number;
  icon: Goal;
  /** Le bâtiment qu'il demande n'est pas au menu : la recherche du labo qui l'ouvre. */
  lock: ObjectiveLock | null;
}

export function objectiveLine(world: World, id: ObjectiveId, goals: readonly Goal[]): ObjectiveLine {
  const done = world.objectivesDone.has(id);
  const icon = goals[0]!;
  const lock = objectiveLock(world, id);
  const hall = world.entities.get(world.townHallId);

  // La mairie en chantier se compte en objets livrés : la jauge avance à chaque bois.
  if (!done && icon.type === 'build' && icon.building === 'townHall' && hall?.kind === 'site') {
    const cost = Object.entries(BUILDINGS[hall.proto].cost) as [ItemId, number][];

    return {
      id,
      done,
      have: cost.reduce((sum, [item, needed]) => sum + Math.min(hall.delivered[item] ?? 0, needed), 0),
      need: cost.reduce((sum, [, needed]) => sum + needed, 0),
      icon,
      lock,
    };
  }
  if (goals.length === 1) {
    const { have, need } = goalProgress(world, icon);

    return { id, done, have: done ? need : have, need, icon, lock };
  }

  const met = goals.filter((goal) => {
    const { have, need } = goalProgress(world, goal);

    return have >= need;
  }).length;

  return { id, done, have: done ? goals.length : met, need: goals.length, icon, lock };
}

/**
 * Le détail de l'objectif choisi, sous les lignes : une jauge par objet du
 * chantier de la mairie, ou par condition — seulement s'il en a plusieurs,
 * ou qu'une attend une horloge (la naissance et son compte à rebours). Chaque
 * ligne donne sa clé tout de suite et ne bâtit ses nœuds qu'à la demande :
 * la quête compare les clés d'abord, et ne crée rien si rien n'a changé.
 */
export function objectiveDetail(world: World, id: ObjectiveId): { key: string; node: () => HTMLElement }[] {
  const { goals } = objectiveProto(id);
  const hall = world.entities.get(world.townHallId);
  const first = goals[0];

  if (first?.type === 'build' && first.building === 'townHall' && hall?.kind === 'site') {
    return (Object.entries(BUILDINGS[hall.proto].cost) as [ItemId, number][]).map(([item, needed]) => {
      const have = hall.delivered[item] ?? 0;

      return { key: `${item}:${have}`, node: () => meter(item, have, needed) };
    });
  }

  const reached = goals.map((goal) => goalProgress(world, goal));
  const waits = goals.map((goal) => goalWait(world, goal));

  if (goals.length === 1 && !waits[0]) return [];
  return goals.map((goal, i) => ({
    key: `${reached[i]!.have}:${waitLabel(goal, waits[i]!)}:${waits[i]?.remainingTicks ?? ''}`,
    node: () => goalMeter(goal, reached[i]!.have, reached[i]!.need, waits[i]!),
  }));
}

/** La ligne d'un objectif : un bouton, gardé d'une mise à jour à l'autre, que l'on remet à jour. */
export interface ObjectiveRowView {
  node: HTMLButtonElement;
  update(line: ObjectiveLine, selected: boolean): void;
}

export function objectiveRow(id: ObjectiveId, choose: () => void): ObjectiveRowView {
  const node = element('button', 'hud-objective-row');
  const icon = element('span', 'hud-objective-icon');
  const title = text('hud-objective-title', '');
  const gauge = bar(0);
  const value = text('hud-meter-value', '');
  const lock = element('span', 'hud-objective-lock');
  const lockText = text('hud-objective-lock-text', '');
  let shown = '';
  let locked = '';

  lock.hidden = true;
  lock.append(uiIcon('lock', 16), lockText);
  node.type = 'button';
  node.dataset['objective'] = id;
  node.append(icon, title, gauge, value, lock);
  node.addEventListener('click', choose);
  return {
    node,
    update(line, selected) {
      const look = `${line.done}:${locale()}`;
      const label = t().objectives[id].title;

      if (look !== shown) {
        shown = look;
        icon.replaceChildren(line.done ? uiIcon('check', 18) : goalIcon(line.icon));
      }
      title.textContent = label;
      node.dataset['done'] = String(line.done);
      node.dataset['locked'] = String(line.lock !== null);
      node.setAttribute('aria-pressed', String(selected));

      const hint = line.lock ? labLockText(line.lock) : '';

      lock.hidden = hint === '';
      if (hint !== locked) {
        locked = hint;
        lockText.textContent = hint;
      }
      (gauge.firstElementChild as HTMLElement).style.width = `${Math.round((Math.min(line.have, line.need) / line.need) * 100)}%`;
      value.textContent = `${line.have}/${line.need}`;
      node.setAttribute('aria-label', `${label} ${line.have}/${line.need}${line.done ? ` — ${t().hud.objectiveDone}` : ''}${hint ? ` — ${hint}` : ''}`);
    },
  };
}

/** « Au labo : Bûcheronnage (8 bois, 4 pierres) » : la recherche qui ouvre le bâtiment, et son coût. */
function labLockText({ research }: ObjectiveLock): string {
  const words = t().hud.quest;
  const cost = researchCost(research).map(([item, amount]) => words.labCost(amount, t().items[item]));

  return words.labLock(t().research[research].label, cost.join(', '));
}

/**
 * La jauge d'une condition d'objectif : ce qu'elle compte en icône, barre,
 * « 1/3 ». Une condition qui attend une horloge (`goalWait`) dit sous la
 * barre le temps qu'il reste, et sa barre avance avec l'horloge ; retenue
 * (la nurserie sans nourriture), la ligne passe en corail et dit pourquoi.
 */
function goalMeter(goal: Goal, have: number, need: number, wait: GoalWait | null): HTMLElement {
  const row = element('div', 'hud-meter');
  const running = wait && wait.blockedBy === null ? 1 - wait.remainingTicks / wait.durationTicks : 0;

  row.dataset['done'] = String(have >= need);
  row.dataset['blocked'] = String(wait?.blockedBy != null);
  row.append(goalIcon(goal), bar((have + running) / need), text('hud-meter-value', `${have}/${need}`));
  const label = waitLabel(goal, wait);

  if (label) row.append(text('hud-meter-wait', label));
  return row;
}

/**
 * « bébé dans 2:41 », « la nurserie attend 2 nourritures » — vide sans
 * attente. Une nuit à tenir ne dit rien : l'horloge de la tête montre déjà
 * l'aube qui vient, et sa barre avance avec elle.
 */
function waitLabel(goal: Goal, wait: GoalWait | null): string {
  if (!wait) return '';

  const label = t().hud.quest;

  if (wait.blockedBy === 'paused') return label.nurseryPaused;
  if (wait.blockedBy) return label.nurseryWaits(wait.missing, t().items[wait.blockedBy]);

  return goal.type === 'births' ? label.babyIn(clock(Math.ceil(wait.remainingTicks / TICKS_PER_SECOND))) : '';
}

/** Ce que compte une condition d'objectif, en icône. */
function goalIcon(goal: Goal): HTMLElement {
  return goal.type === 'build'
    ? tipped(buildingIcon(goal.building, 22), t().buildings[goal.building].label)
    : goal.type === 'produce'
      ? tipped(itemIcon(goal.item, 18), t().items[goal.item])
      : goal.type === 'happiness' || goal.type === 'mood'
        ? tipped(uiIcon('townMood', 18), t().hud.people.happinessName)
        : goal.type === 'era'
          ? tipped(uiIcon('town', 18), t().eras[goal.count]!.label)
          : uiIcon(goal.type === 'nights' ? 'mutant' : goal.type === 'quests' ? 'eve' : 'people', 18);
}

/** Une ligne de quête : icône, barre, « 7/20 ». */
function meter(item: ItemId, have: number, needed: number): HTMLElement {
  const row = element('div', 'hud-meter');

  row.dataset['done'] = String(have >= needed);
  row.append(tipped(itemIcon(item, 18), t().items[item]), bar(have / needed), text('hud-meter-value', `${have}/${needed}`));
  return row;
}

/** Le défi du jour, sous les objectifs : son icône, son intitulé, sa jauge — cochée une fois réussi. */
export function dailyRow(daily: { id: ChallengeId; have: number; need: number; done: boolean; streak: number }): HTMLElement {
  const row = element('div', 'hud-quest-daily');
  const { icon } = CHALLENGES[daily.id];
  const label = text('hud-quest-daily-label', t().challenges[daily.id]);

  // La série : les jours réussis d'affilée, aujourd'hui compris une fois réussi.
  const days = daily.streak + (daily.done ? 1 : 0);
  const title = text('hud-quest-daily-title', t().hud.daily.title);

  if (days > 1) title.append(text('hud-quest-daily-streak', t().hud.daily.streak(days)));
  row.dataset['done'] = String(daily.done);
  row.append(
    title,
    daily.done ? uiIcon('check', 18) : 'item' in icon ? itemIcon(icon.item, 18) : uiIcon(icon.ui, 18),
    label,
    bar(daily.have / daily.need),
    text('hud-meter-value', `${daily.have}/${daily.need}`),
  );
  return row;
}
