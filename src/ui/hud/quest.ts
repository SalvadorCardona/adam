/**
 * La quête : l'objectif dans la barre du haut (icône, progression), et la
 * fenêtre qu'il ouvre dessous — le chapitre en cours, une ligne par
 * objectif, l'objectif choisi déplié en jauges, puis la santé de la mairie,
 * les habitants, le compteur d'ouvriers (un tap déplie leur détail), le défi
 * du jour et la quête d'Ève. Elle s'ouvre seule le temps de se lire : un
 * objectif réussi, une vague, la mairie qui faiblit.
 */

import { TILE_SIZE } from '../../core/grid.ts';
import { BUILDINGS } from '../../data/buildings.ts';
import type { ObjectiveId } from '../../data/objectives.ts';
import { currentQuest, questProgress } from '../../sim/eve.ts';
import { chapterObjectives, currentChapter, firstOpenObjective, labSpot, objectiveLock, openObjectives } from '../../sim/objectives.ts';
import { TICKS_PER_SECOND, type Workforce } from '../../sim/world.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { buildingIcon, uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { bar, chip, element, text } from './dom.ts';
import {
  chapterHead,
  chapterLabel,
  chapterStrip,
  dailyRow,
  objectiveDetail,
  objectiveLine,
  objectiveRow,
  type ObjectiveLine,
  type ObjectiveRowView,
} from './objectives.ts';

/** Le détail des ouvriers se replie seul au bout de ce délai, compté en ticks comme le conseil. */
const CREW_FOLD_TICKS = 5 * TICKS_PER_SECOND;

/**
 * Sur un téléphone, la quête dépliée d'un tap se replie au bout de ce délai
 * sans qu'on la touche ; dépliée d'elle-même (objectif, vague, mairie
 * abîmée), au bout du second. Comptés en ticks comme le conseil.
 */
const QUEST_TAP_TICKS = 6 * TICKS_PER_SECOND;
export const QUEST_ALERT_TICKS = 4 * TICKS_PER_SECOND;

/** Sous cette part de ses PV, la mairie déplie la quête repliée. */
const QUEST_ALERT_HP = 0.5;

export class Quest {
  /** La fenêtre de la quête, sous la barre. */
  public readonly root: HTMLElement;
  /** Sa tête : le titre, puis l'ampoule du conseil (`Advice`). */
  public readonly head: HTMLElement;
  /** L'objectif dans la barre du haut, tout à droite : icône, progression (et intitulé court dès 600 px). Un tap ouvre la quête. */
  public readonly objective: HTMLButtonElement;
  /** Un objectif vient d'être choisi : le conseil le suit (`Hud` y branche `Advice`). */
  public onChosen: () => void = () => undefined;

  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly strip: HTMLElement;
  /** Les lignes des objectifs du chapitre, dans la fenêtre de la quête. */
  private readonly objectiveList: HTMLElement;
  private readonly objectiveRows = new Map<ObjectiveId, ObjectiveRowView>();
  /** L'objectif touché dans le panneau ; `null` : le premier qui reste. Rien de la simulation. */
  private chosenObjective: ObjectiveId | null = null;
  /** Tick jusqu'auquel la quête reste ouverte (en fenêtre sous la barre) ; fermée au-delà. */
  private openUntil = 0;
  /** La mairie est déjà sous `QUEST_ALERT_HP` : elle ne déplie la quête qu'en y passant. */
  private hallLow = false;
  private last = '';
  /** Le détail des ouvriers, déplié d'un tap sur leur compteur. */
  private crewOpen = false;
  /** Tick où le détail des ouvriers a été déplié. */
  private crewSince = 0;

  private readonly ctx: HudContext;
  private readonly disposer = new Disposer();

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.root = element('div', 'panel hud-quest');
    this.title = element('div', 'hud-quest-title');
    this.body = element('div', 'hud-quest-body');

    this.strip = element('div', 'hud-quest-strip');
    this.objectiveList = element('div', 'hud-objectives');
    this.objective = element('button', 'hud-objective');
    this.objective.type = 'button';
    this.objective.setAttribute('aria-haspopup', 'true');
    this.objective.setAttribute('aria-expanded', 'false');
    this.objective.append(this.strip, element('span', 'hud-objective-chevron'));
    this.objective.lastElementChild?.append(uiIcon('chevron', 16));
    this.objective.addEventListener('click', () => this.toggle());

    // La quête est une fenêtre sous la barre : son objectif la rouvre, sa tête la referme.
    this.head = element('div', 'hud-quest-head');
    this.head.append(this.title);
    this.head.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.hud-hint-bulb')) return;
      this.toggle();
    });
    this.root.append(this.head, this.body);
    this.root.dataset['hint'] = 'none';

    this.disposer.add(onLocale(() => {
      this.last = '';
    }));
    // Un toucher hors du compteur replie le détail des ouvriers.
    this.disposer.listen(document, 'pointerdown', (event) => {
      if (!this.crewOpen) return;
      if (event.target instanceof Element && event.target.closest('.hud-quest-crew')) return;
      this.crewOpen = false;
    }, { capture: true });
  }

  public update(): void {
    const { world } = this.ctx;
    const hall = world.entities.get(world.townHallId);
    const name = t().buildings.townHall.label;
    const words = t().hud.quest;
    let key: string;

    if (!hall) {
      key = 'fallen';
      if (key === this.last) return;
      this.last = key;
      this.root.dataset['mode'] = 'fallen';
      this.title.textContent = words.defeat;
      this.body.replaceChildren(text('hud-quest-goal', words.hallFallen));
      this.strip.replaceChildren(uiIcon('heart', 18), text('hud-strip-title', words.hallFallen));
      return;
    }

    // Les objectifs du chapitre : une ligne chacun, le choisi déplié en jauges.
    const objectives = chapterObjectives(world);
    const selected = this.selected();
    const lines = objectives.map((objective) => objectiveLine(world, objective.id, objective.goals));
    const chapter = currentChapter(world);
    const done = objectives.filter(({ id }) => world.objectivesDone.has(id)).length;
    const detail = selected ? objectiveDetail(world, selected) : [];
    const progressKey = lines.map((line) => `${line.done}:${line.have}/${line.need}`).join(',');
    const detailKey = detail.map((row) => row.key).join(',');

    if (hall.kind === 'site') {
      key = `site:${progressKey}:${detailKey}:${selected}`;
      if (key === this.last) return;
      this.last = key;
      this.root.dataset['mode'] = 'build';
      this.title.textContent = chapterLabel(world.chapter);
      this.renderObjectives(lines, selected);
      this.body.replaceChildren(chapterHead(world.chapter, done, objectives.length), this.objectiveList, ...detail.map((row) => row.node()));
      this.strip.dataset['urgent'] = 'false';
      this.strip.replaceChildren(...chapterStrip(world.chapter, done, objectives.length));
      return;
    }

    const max = BUILDINGS[hall.proto].hp;

    this.hallLow = hall.hp / max < QUEST_ALERT_HP;

    const mutants = this.ctx.mutantCount();
    const { adults, children, workers } = world.population();
    const people = adults + children;
    const crew = world.workforce();
    if (this.crewOpen && world.tickCount - this.crewSince >= CREW_FOLD_TICKS) this.crewOpen = false;

    // L'heure est à l'horloge de la tête ; la ligne ne parle que de l'attaque.
    const status = mutants > 0 ? words.status(world.night, mutants) : '';

    const quest = world.eve()?.state === 'idle' || world.eve()?.state === 'repair' ? currentQuest(world.questsDone) : null;
    const progress = quest ? questProgress(quest, world.entities.values()) : null;

    const daily = world.challenge();

    key = `hall:${world.chapter}:${progressKey}:${detailKey}:${selected}:${hall.hp}:${status}:${people}:${workers}:${world.kills}:${quest}:${progress?.have}:${this.crewOpen && JSON.stringify(crew)}:${daily && `${daily.id}:${daily.have}:${daily.done}:${daily.streak}`}`;
    if (key === this.last) return;
    this.last = key;

    // Les objectifs restent affichés pendant l'attaque : seul le titre crie.
    this.root.dataset['mode'] = mutants > 0 ? 'wave' : 'defend';
    this.title.textContent = mutants > 0 ? words.attack : chapterLabel(world.chapter);

    const hp = element('div', 'hud-meter hud-meter-hp');
    const hpLabel = text('hud-meter-label', name);

    hpLabel.prepend(uiIcon('heart', 18));
    const hpBar = bar(hall.hp / max);
    const hpValue = text('hud-meter-value', `${hall.hp}/${max}`);

    hp.dataset['low'] = String(hall.hp / max < 0.35);
    hp.append(hpLabel, hpBar, hpValue);

    const line = element('div', 'hud-quest-line');
    const chips = element('div', 'hud-quest-chips');

    chips.append(chip('people', people + workers, words.inhabitants), this.crewChip(crew.free, crew.total), chip('mutant', world.kills, words.kills));
    if (status) line.append(text('hud-quest-wave', status));
    line.append(chips);
    this.renderObjectives(lines, selected);
    this.body.replaceChildren(
      ...(chapter
        ? [chapterHead(world.chapter, done, objectives.length), this.objectiveList, ...detail.map((row) => row.node())]
        : [text('hud-quest-goal', words.endless)]),
      hp,
      line,
    );
    if (this.crewOpen) this.body.append(crewDetail(crew));
    if (daily) this.body.append(dailyRow(daily));

    if (quest && progress) {
      const row = element('div', 'hud-quest-eve');

      row.append(uiIcon('eve', 18), text('hud-quest-eve-label', t().quests[quest].label), text('hud-meter-value', `${progress.have}/${progress.need}`));
      this.body.append(row);
    }

    // La ligne repliée : le chapitre et son avancement, l'attaque si elle crie.
    const stripHp = element('div', 'hud-strip-hp');

    stripHp.append(bar(hall.hp / max));
    setTip(stripHp, `${name} ${hall.hp}/${max}`);
    stripHp.dataset['low'] = hp.dataset['low'];
    this.strip.dataset['urgent'] = String(mutants > 0);
    this.strip.replaceChildren(
      ...(mutants > 0
        ? [uiIcon('mutant', 20), text('hud-strip-title', words.attack)]
        : chapter
          ? chapterStrip(world.chapter, done, objectives.length)
          : [uiIcon('goal', 20), text('hud-strip-title', words.afterSignal)]),
      stripHp,
    );
  }

  /**
   * L'objectif choisi dans le panneau : celui que le joueur a touché, tant
   * qu'il reste à réussir ; sinon le premier qui reste. Son conseil passe
   * à l'ampoule, ses jauges se déplient sous sa ligne.
   */
  public selected(): ObjectiveId | null {
    const { world } = this.ctx;
    const open = openObjectives(world);
    const chosen = this.chosenObjective;

    if (chosen && open.some(({ id }) => id === chosen)) return chosen;
    return firstOpenObjective(world);
  }

  /** La mairie frappée, à `ratio` de ses PV : en passant sous `QUEST_ALERT_HP`, elle déplie la quête. */
  public hallHit(ratio: number): void {
    const low = ratio < QUEST_ALERT_HP;

    if (low && !this.hallLow) this.unfold(QUEST_ALERT_TICKS);
    this.hallLow = low;
  }

  /** Déplie la quête repliée pour `ticks`, sans raccourcir un dépliage plus long. */
  public unfold(ticks: number): void {
    this.openUntil = Math.max(this.openUntil, this.ctx.world.tickCount + ticks);
    this.updateFold();
  }

  /** Ouverte ou fermée : la quête n'est une fenêtre sous la barre que le temps de la lire (cf. `style.css`). */
  public updateFold(): void {
    const folded = String(this.ctx.world.tickCount >= this.openUntil);

    if (this.root.dataset['folded'] !== folded) {
      this.root.dataset['folded'] = folded;
      this.objective.setAttribute('aria-expanded', String(folded === 'false'));
    }
  }

  /** Les lignes des objectifs, gardées d'une mise à jour à l'autre : le focus de la manette ne saute pas. */
  private renderObjectives(lines: ObjectiveLine[], selected: ObjectiveId | null): void {
    const ids = lines.map((line) => line.id).join(',');

    if (this.objectiveList.dataset['ids'] !== ids) {
      this.objectiveList.dataset['ids'] = ids;
      this.objectiveRows.clear();
      this.objectiveList.replaceChildren(
        ...lines.map((line) => {
          const row = objectiveRow(line.id, () => this.choose(line.id));

          this.objectiveRows.set(line.id, row);
          return row.node;
        }),
      );
    }
    for (const line of lines) this.objectiveRows.get(line.id)?.update(line, line.id === selected);
  }

  /** Un tap sur la ligne d'un objectif le choisit : ses jauges, et son conseil à l'ampoule. */
  private choose(id: ObjectiveId): void {
    const { world } = this.ctx;

    this.chosenObjective = id;
    // Fermé au menu : le doigt va au labo — ou à son chantier — où la recherche se lance.
    const lab = objectiveLock(world, id) ? labSpot(world) : null;

    if (lab) this.ctx.focus((lab.tx + lab.width / 2) * TILE_SIZE, (lab.ty + lab.height / 2) * TILE_SIZE);
    this.unfold(QUEST_TAP_TICKS);
    this.update();
    this.onChosen();
  }

  /** Un tap sur l'objectif ouvre la quête ; un autre, ou un tap sur sa tête, la ferme. */
  private toggle(): void {
    this.openUntil = this.root.dataset['folded'] === 'false' ? 0 : this.ctx.world.tickCount + QUEST_TAP_TICKS;
    this.updateFold();
  }

  /**
   * Le compteur d'ouvriers, « libres/total » : ce qui reste pour pourvoir un
   * bâtiment. Un tap déplie leur détail sous la ligne, un autre le replie — le temps s'en charge sinon.
   */
  private crewChip(free: number, total: number): HTMLElement {
    const node = text('hud-quest-chip hud-quest-crew', `${free}/${total}`, 'button');

    node.setAttribute('type', 'button');
    node.setAttribute('aria-expanded', String(this.crewOpen));
    node.prepend(uiIcon('worker', 18));
    setTip(node, t().hud.quest.crew(free, total));
    node.addEventListener('click', () => {
      this.crewOpen = !this.crewOpen;
      this.crewSince = this.ctx.world.tickCount;
      this.unfold(QUEST_TAP_TICKS);
      this.update();
    });
    return node;
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}

/** Le détail des ouvriers : une ligne par bâtiment qui emploie, affectés et libres, puis ce que font les porteurs. */
function crewDetail({ byBuilding, porters, assigned, free, missing }: Workforce): HTMLElement {
  const detail = element('div', 'hud-quest-crew-detail');
  const row = (icon: HTMLElement, label: string, count: number): HTMLElement => {
    const node = element('div', 'hud-quest-crew-row');

    node.append(icon, text('hud-quest-crew-label', label), text('hud-quest-crew-count', String(count)));
    return node;
  };

  const label = t().hud.quest;

  if (byBuilding.length === 0 && free === 0) detail.append(text('hud-quest-crew-label', label.noCrew, 'div'));
  for (const { proto, count } of byBuilding) detail.append(row(buildingIcon(proto, 22), t().buildings[proto].label, count));
  if (byBuilding.length > 0) detail.append(row(uiIcon('worker', 22), label.assigned, assigned));
  // Les ouvriers de la colonie qu'aucun bâtiment n'emploie : dès le départ, les dix.
  if (byBuilding.length > 0 || free > 0) detail.append(row(uiIcon('worker', 22), label.free, free));
  if (missing > 0) detail.append(row(uiIcon('worker', 22), label.emptyPosts, missing));
  if (porters.busy + porters.idle > 0) {
    detail.append(
      row(uiIcon('worker', 22), label.portersBusy, porters.busy),
      row(uiIcon('worker', 22), label.portersIdle, porters.idle),
    );
  }
  return detail;
}
