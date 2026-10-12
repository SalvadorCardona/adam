/**
 * HUD.
 *
 * Du DOM au-dessus du canvas, pas du texte Pixi : sur mobile le texte système
 * est net à toutes les densités, se met à l'échelle avec les réglages
 * d'accessibilité, et ne coûte pas un atlas de police.
 *
 * Le HUD **lit** le monde et s'abonne à ses événements. Il ne le modifie
 * jamais — c'est le rôle des commandes.
 *
 * Ce qu'il montre :
 * - la **quête** en haut : l'objectif en cours (`data/objectives.ts`) — le
 *   chantier de la mairie avec une barre par ressource, puis une jauge par
 *   condition — sous lequel restent la santé de la mairie, la nuit et son
 *   compte à rebours ;
 * - la **météo** dessous, en capsule : ce qui arrive et dans combien de
 *   temps, puis ce qui tombe et pour combien de temps encore ;
 * - un **conseil** sous la quête, qui suit ce que fait le joueur (couper,
 *   casser, livrer, construire, se défendre) et se tait quand il a compris —
 *   c'est Ève qui le dit, son portrait devant ; au bout de cinq secondes, il
 *   se replie en ampoule à côté du titre ;
 * - sur un téléphone, la quête se **replie** en une ligne : l'icône et le
 *   titre de l'objectif, sa progression, une mini-barre des PV de la mairie
 *   et l'horloge de la nuit. Un tap sur la ligne la déplie six secondes ;
 *   elle se déplie d'elle-même quatre secondes quand un objectif est
 *   atteint, quand une vague commence ou quand la mairie passe sous la
 *   moitié de ses PV. Le conseil s'ouvre sous la ligne, l'ampoule y reste ;
 * - dans la ligne de la mairie, le **compteur d'ouvriers** : un tap déplie
 *   leur détail par bâtiment, et ce que font les porteurs ; il se replie
 *   seul au bout de cinq secondes, ou dès qu'on touche ailleurs ;
 * - la **quête d'Ève** en cours, une fois qu'elle est arrivée ;
 * - la **bulle** d'Ève au-dessus de sa tête : son arrivée, ses quêtes, ce
 *   qu'elle répond quand on la tape. Courte, jamais bloquante ;
 * - les boutons pause et réglages (l'engrenage) à droite de la quête, et dessous les deux
 *   stocks, en version compacte : la **ville** (le coffre de la mairie) et
 *   le **sac** d'Adam avec son remplissage — un tap sur le sac ouvre le
 *   panneau inventaire (`inventoryPanel.ts`). Sur un téléphone, les deux
 *   cartes n'en font plus qu'une, repliée en pastille : la jauge du sac, ce
 *   que compte la ville, et la ressource que réclame le conseil — le
 *   détail est dans le panneau ;
 * - des **bulles** empilées pour les événements, des gains qui flottent
 *   au-dessus de la tête d'Adam, et le nom d'un bâtiment achevé qui monte
 *   de son toit (« Mairie bâtie ! ») ;
 * - le **bandeau** des vagues : « Nuit 4 — 2 mutants arrivent par l'est ! »
 *   (« Renforts » pour les vagues suivantes de la nuit) trois secondes avant,
 *   avec une flèche tournée vers leur point d'apparition, puis « Nuit 4 —
 *   vague repoussée ! » quand le dernier tombe ; un gros mutant s'annonce à part ;
 * - l'**alarme** quand la mairie est frappée hors de l'écran : bord rouge
 *   qui clignote, et vibration du téléphone s'il en a une ;
 * - la **célébration** d'un objectif réussi : un bandeau, une pluie de feuilles ;
 * - l'écran de **victoire**, avec le bilan de la partie, et celui de
 *   **défaite**, avec en plus les graines qu'elle laisse au jardin des souvenirs ;
 * - les statistiques de debug, seulement avec `?debug` (ou la touche `²`/`` ` ``).
 */

import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { COMPANIONS, COMPANION_CLASSES } from '../data/companions.ts';
import type { ItemId } from '../data/items.ts';
import { NEED_IDS, type NeedId } from '../data/needs.ts';
import { SIGNAL_WAVES } from '../data/artDirection.ts';
import { OBJECTIVES, type Goal } from '../data/objectives.ts';
import { seedsFor } from '../data/perks.ts';
import { QUESTS, type QuestReward } from '../data/quests.ts';
import { RESEARCH } from '../data/research.ts';
import { WEATHER, WEATHER_CALENDAR } from '../data/weather.ts';
import { dayDialSvg, type UiIcon } from '../art/ui.ts';
import type { AtlasStats } from '../render/spriteLibrary.ts';
import type { WaterStats } from '../render/waterLayer.ts';
import type { RoadRejection } from '../sim/commands.ts';
import type { Compass } from '../sim/enemies.ts';
import type { Trend } from '../sim/flows.ts';
import { nameOf } from '../sim/inhabitants.ts';
import type { Entity, Mobile, MobileId } from '../sim/types.ts';
import { DIAL_ARCS } from '../sim/dayNight.ts';
import { currentQuest, questProgress } from '../sim/eve.ts';
import { moodOf } from '../sim/housing.ts';
import { currentObjective, goalProgress, goalWait, type GoalWait } from '../sim/objectives.ts';
import { TICKS_PER_SECOND, type Inhabitant, type Workforce, type World } from '../sim/world.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import { carriesWanted, harvestRefusedText, tutorialAdvice, type Advice } from './hint.ts';
import { MAX_LEVEL } from '../data/levels.ts';
import { levelProgress } from '../sim/levels.ts';
import { buildingIcon, dayDialUrl, itemAmount, itemIcon, prestigeIcon, uiIcon } from './icons.ts';
import { effectLine } from './researchText.ts';
import { moodMeter } from './moodMeter.ts';
import { needMeter } from './needMeter.ts';
import { personText } from './personText.ts';
import { footingText } from './placementReason.ts';
import { mapUrl, seedLine } from './seed.ts';
import { setTip, Tooltips } from './tooltip.ts';

/** Durée de l'alarme après le dernier coup reçu par la mairie hors de l'écran, en ms. */
const ALARM_MS = 2500;

/** Motif de vibration de l'alarme, et le délai minimal entre deux vibrations, en ms. */
const ALARM_VIBRATION = [140, 80, 140];
const ALARM_VIBRATION_EVERY_MS = 4000;

/** Durée de vie d'un « +N Prestige », en ms (cf. `.hud-float-prestige` dans le CSS). */
const PRESTIGE_FLOAT_MS = 1600;

/** Durée de vie d'un gain flottant, en ms (cf. `hud-float-up` dans le CSS). */
const FLOAT_MS = 1000;

/** Le temps où la flèche de l'aube reste à côté du Bonheur de la ville, en ms. */
const MOOD_TREND_MS = 6000;

/** Durée de vie du « Mairie bâtie ! » qui monte d'un bâtiment achevé, en ms (cf. `hud-built-up` dans le CSS). */
const BUILT_MS = 1800;

/** Durée d'affichage d'une bulle, et combien peuvent s'empiler. */
const TOAST_MS = 2600;
const MAX_TOASTS = 3;

/** Durée d'une réplique d'Ève : un socle, plus le temps de lire. */
const SPEECH_BASE_MS = 1600;
const SPEECH_PER_CHAR_MS = 45;
/** Sous la quête, la bulle garde ce jeu (ses 10 px de flottement compris). */
const SPEECH_GAP = 14;
/** Le temps de lire l'infobulle d'un habitant, en ms. */
const PERSON_MS = 4200;

/**
 * Un conseil inchangé se replie au bout de ce délai, compté en ticks : il ne
 * se replie ni derrière l'écran titre ni pendant la pause.
 */
const HINT_FOLD_TICKS = 5 * TICKS_PER_SECOND;

/** Le détail des ouvriers se replie seul au bout de ce délai, compté en ticks comme le conseil. */
const CREW_FOLD_TICKS = 5 * TICKS_PER_SECOND;

/**
 * Sur un téléphone, la quête dépliée d'un tap se replie au bout de ce délai
 * sans qu'on la touche ; dépliée d'elle-même (objectif, vague, mairie
 * abîmée), au bout du second. Comptés en ticks comme le conseil.
 */
const QUEST_TAP_TICKS = 6 * TICKS_PER_SECOND;

/** Le détail de l'horloge (« Jour 2 · nuit dans 1:31 ») reste affiché ce temps-là après un tap. */
const CLOCK_TIP_TICKS = 4 * TICKS_PER_SECOND;

/** Le cadran de l'horloge à l'écran, en pixels CSS : il déborde à peine de la ligne de 24 px. */
const CLOCK_SIZE = 28;

/** Crans de l'aiguille sur un tour : le cadran ne se redessine qu'en changeant de cran. */
const DIAL_STEPS = 240;
const QUEST_ALERT_TICKS = 4 * TICKS_PER_SECOND;

/** Sous cette part de ses PV, la mairie déplie la quête repliée. */
const QUEST_ALERT_HP = 0.5;

/** Largeur du bandeau d'objectif réussi rangé sous la barre, en px. */
const CELEBRATION_WIDTH = 380;

/** Durée du bandeau d'objectif réussi, en ms (cf. `celebration-in` dans le CSS). */
const CELEBRATION_MS = 4200;
/** Rangé sous la quête quand une fenêtre est ouverte, le bandeau en garde ce jeu. */
const CELEBRATION_GAP = 8;

/** Feuilles de la pluie de confettis, et combien il en tombe. */
const CONFETTI: readonly UiIcon[] = ['leafMint', 'leafMint', 'leafYellow', 'petal'];
const CONFETTI_COUNT = 36;
const CONFETTI_MS = 3200;

/** Le bandeau d'une vague reste le temps de l'annonce, et s'efface quand les flaques bouillonnent ; celui de la victoire, un peu moins. */
const BANNER_WAVE_MS = 4200;
const BANNER_CLEARED_MS = 3200;

type ToastTone = 'info' | 'good' | 'bad';

/** Projette un point monde en pixels écran — fourni par le renderer, via `main.ts`. */
export type Projector = (x: number, y: number) => { x: number; y: number };

export class Hud {
  public readonly root: HTMLElement;

  private readonly top: HTMLElement;
  private readonly quest: HTMLElement;
  private readonly questTitle: HTMLElement;
  private readonly questBody: HTMLElement;
  /** L'objectif dans la barre du haut, tout à droite : icône, progression (et intitulé court dès 600 px). Un tap ouvre la quête. */
  private readonly objective: HTMLButtonElement;
  private readonly questStrip: HTMLElement;
  /** Tick jusqu'auquel la quête reste ouverte (en fenêtre sous la barre) ; fermée au-delà. */
  private questOpenUntil = 0;
  /** La mairie est déjà sous `QUEST_ALERT_HP` : elle ne déplie la quête qu'en y passant. */
  private hallLow = false;
  private readonly hint: HTMLElement;
  private readonly hintText: HTMLElement;
  private readonly hintBulb: HTMLButtonElement;
  /** L'horloge du jour et de la nuit, dans la tête de la quête : cadran, numéro du jour, détail au tap. */
  private readonly dayClock: HTMLButtonElement;
  private readonly dayClockDial: HTMLImageElement;
  private readonly dayClockDay: HTMLElement;
  private readonly dayClockTip: HTMLElement;
  private lastClock = '';
  private clockTipUntil = 0;
  /** Le groupe des boutons du joueur, en haut à droite : l'habillage, le sac, « Bâtir ». */
  public readonly actions: HTMLElement;
  /** La rangée des contrôles (Pause, Réglages, carte, zoom), posée dans le haut par `mountControls`. */
  private controls: HTMLElement = document.createElement('div');
  /** Le sac, compact : un bouton qui ouvre le panneau inventaire. */
  public readonly bag: HTMLButtonElement;
  /** Au bout du bandeau de la ville : ouvre le panneau des ressources (`main.ts` le branche). */
  public readonly resourcesButton: HTMLButtonElement;
  /** Le stock de la ville, compact. */
  private readonly town: HTMLElement;
  /** Le Prestige de la colonie : son icône et son compte, en haut à gauche. */
  private readonly prestige: HTMLElement;
  /** Le niveau d'Adam et sa barre d'XP, en tête du bandeau de la ville. */
  private readonly level: HTMLElement;
  /** À gauche de la barre (ou sous elle, sur un téléphone) : le Prestige, la ville et son alerte de vivres. */
  private readonly left: HTMLElement;
  /** À droite de la barre (ou sous elle) : la météo et l'horloge du jour. */
  private readonly right: HTMLElement;
  private lastPrestige = '';
  private lastLevel = '';
  /** La population de la ville : au travail, inactifs, enfants. */
  private readonly people: HTMLElement;
  private lastPeople = '';
  /** Le sens où l'aube a fait bouger le Bonheur de la ville, et jusqu'à quand la flèche le montre. */
  private moodTrend: { up: boolean; until: number } | null = null;
  /** Rang, dans `World.idleWorkers()`, du prochain inactif que montre un tap sur leur compteur. */
  private idleCursor = 0;
  /** L'alerte de nourriture : la ville va en manquer. Un tap montre qui a faim, puis le suivant. */
  private readonly hunger: HTMLButtonElement;
  private lastHunger = '';
  /** Le besoin que dit l'alerte : son tap montre qui en manque. */
  private hungerNeed: NeedId | undefined = undefined;
  private hungryCursor = 0;
  /** L'infobulle d'un habitant : son id, et l'heure (`performance.now()`) où elle s'efface. */
  private readonly person: HTMLElement;
  private personId: MobileId | null = null;
  private personUntil = 0;
  private personHeight = 0;
  private personKey = '';
  private onFocus: (x: number, y: number) => void = () => {};
  private readonly bar: HTMLElement;
  private readonly floats: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly toasts: HTMLElement;
  /** Le libellé des icônes, au survol, au focus et à l'appui long (`tooltip.ts`). */
  private readonly tips: Tooltips;
  private readonly countdown: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerArrow: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerText: HTMLElement;
  /** Le point monde que la flèche du bandeau montre ; `null` sans flèche. */
  private bannerTarget: { x: number; y: number } | null = null;
  private bannerTimer = 0;
  /** La vague déjà annoncée (nuit et rang) : le bandeau ne repart pas à chaque seconde du compte à rebours. */
  private announced = '';
  private readonly weather: HTMLElement;
  private readonly defeat: HTMLElement;
  private readonly death: HTMLElement;
  private readonly deathCount: HTMLElement;
  private lastDeathSeconds = -1;
  private readonly defeatStats: HTMLElement;
  private readonly victory: HTMLElement;
  private readonly victoryStats: HTMLElement;
  private readonly celebration: HTMLElement;
  private readonly confetti: HTMLElement;
  private celebrationTimer = 0;
  private onContinue: () => void = () => {};
  private readonly speech: HTMLElement;
  private readonly defeatSeeds: HTMLElement;
  /** L'engrenage : il ouvre le menu des réglages (`settingsPanel.ts`). */
  public readonly settingsButton: HTMLButtonElement;
  public readonly pauseButton: HTMLButtonElement;
  private lastBag = '';
  private lastTown = '';
  private lastQuest = '';
  /** Le détail des ouvriers, déplié d'un tap sur leur compteur. */
  private crewOpen = false;
  /** Tick où le détail des ouvriers a été déplié. */
  private crewSince = 0;
  /** Un toucher hors du compteur replie le détail des ouvriers. */
  private readonly foldCrewOnTouch = (event: PointerEvent): void => {
    if (!this.crewOpen) return;
    if (event.target instanceof Element && event.target.closest('.hud-quest-crew')) return;
    this.crewOpen = false;
  };
  private lastHint = '';
  /** La langue du conseil affiché : en changer réécrit le conseil sans le relancer. */
  private hintLocale = locale();
  /** Tick où le conseil a été montré (ou déplié) : il se replie `HINT_FOLD_TICKS` plus tard. */
  private hintSince = 0;
  private wanted: ItemId | null = null;

  /** Les répliques d'Ève en attente, et l'heure où la réplique affichée s'en va. */
  private readonly speechQueue: string[] = [];
  private speechUntil = 0;
  /** Ce qu'elle a déjà dit quand on la tape : elle ne radote pas. */
  private chatterIndex = 0;
  private talks = 0;
  /** Hauteur de la bulle, lue une fois par réplique : son texte ne change pas entre-temps. */
  private speechHeight = 0;
  private lastWeather = '';
  private debug: boolean;

  /** Ce que le joueur a déjà fait : un conseil compris ne revient pas. */
  private harvestedWood = false;
  private harvestedStone = false;
  private delivered = false;
  private repaired = false;

  /** Fin de l'alarme en cours, et dernière vibration, en ms (`performance.now()`). */
  private alarmUntil = 0;
  private lastVibration = -Infinity;

  private project: Projector = (x, y) => ({ x, y });

  private readonly world: World;

  public constructor(world: World, debug = false) {
    this.world = world;
    this.debug = debug;
    this.root = element('div', 'hud');

    this.quest = element('div', 'panel hud-quest');
    this.questTitle = element('div', 'hud-quest-title');
    this.questBody = element('div', 'hud-quest-body');

    // Replié, le conseil n'est plus qu'une ampoule à côté du titre : un tap le déplie.
    this.hintBulb = element('button', 'hud-hint-bulb');
    this.hintBulb.type = 'button';
    this.hintBulb.append(uiIcon('hint', 20));
    this.hintBulb.addEventListener('click', () => this.unfoldHint());

    this.questStrip = element('div', 'hud-quest-strip');
    this.objective = element('button', 'hud-objective');
    this.objective.type = 'button';
    this.objective.setAttribute('aria-haspopup', 'true');
    this.objective.setAttribute('aria-expanded', 'false');
    this.objective.append(this.questStrip);
    this.objective.addEventListener('click', () => this.toggleQuest());

    // La quête est une fenêtre sous la barre : son objectif la rouvre, sa tête la referme.
    const head = element('div', 'hud-quest-head');

    // L'horloge : un tap dit l'heure en toutes lettres, sans déplier la quête.
    this.dayClock = element('button', 'hud-clock');
    this.dayClock.type = 'button';
    this.dayClock.hidden = true;
    this.dayClockDial = element('img', 'hud-clock-dial');
    this.dayClockDial.width = this.dayClockDial.height = CLOCK_SIZE;
    this.dayClockDial.alt = '';
    this.dayClockDial.draggable = false;
    this.dayClockDay = text('hud-clock-day', '');
    this.dayClockTip = text('hud-clock-tip', '');
    this.dayClockTip.setAttribute('aria-hidden', 'true');
    this.dayClock.append(this.dayClockDial, this.dayClockDay, this.dayClockTip);
    this.dayClock.addEventListener('click', () => {
      this.clockTipUntil = this.world.tickCount < this.clockTipUntil ? 0 : this.world.tickCount + CLOCK_TIP_TICKS;
      this.updateClock();
    });

    head.append(this.questTitle, this.hintBulb);
    head.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.hud-hint-bulb')) return;
      this.toggleQuest();
    });
    this.quest.append(head, this.questBody);
    this.quest.dataset['hint'] = 'none';

    // Le conseil s'ouvre et se referme en douceur dans son pli : la quête
    // grandit sans à-coup, et rien n'est posé dessous qui puisse sauter.
    const fold = element('div', 'hud-hint-fold');

    this.hint = element('div', 'hud-hint');
    this.hintText = element('span', 'hud-hint-text');
    this.hint.append(uiIcon('eve', 22), this.hintText);
    const clip = element('div', 'hud-hint-clip');

    clip.append(this.hint);
    fold.append(clip);

    // Les boutons du joueur, en haut à droite : le sac, avec l'habillage d'Adam et « Bâtir » (`main.ts`).
    this.actions = element('div', 'hud-actions');
    this.bag = element('button', 'hud-bag');
    this.bag.type = 'button';
    this.bag.setAttribute('aria-keyshortcuts', 'I');
    this.town = element('div', 'panel hud-stock hud-town');
    // Le bandeau d'un écran large défile de côté : la molette aussi, et son
    // bord droit s'estompe tant qu'il reste des objets cachés.
    this.town.addEventListener('wheel', (event) => {
      const items = this.townItems();

      if (!items || items.scrollWidth <= items.clientWidth) return;
      event.preventDefault();
      items.scrollLeft += event.deltaX + event.deltaY;
    }, { passive: false });
    this.town.addEventListener('scroll', () => this.markTownOverflow(), true);
    this.resourcesButton = element('button', 'hud-resources');
    this.resourcesButton.type = 'button';
    this.resourcesButton.setAttribute('aria-haspopup', 'dialog');
    this.resourcesButton.append(uiIcon('stats', 20));
    onLocale(() => setTip(this.resourcesButton, t().resourcePanel.open));
    window.addEventListener('resize', () => this.markTownOverflow());
    this.prestige = element('div', 'hud-prestige');
    this.prestige.hidden = true;
    this.prestige.setAttribute('role', 'status');
    this.level = element('div', 'hud-level');
    this.level.setAttribute('role', 'status');
    this.people = element('div', 'panel hud-people');
    this.people.hidden = true;
    this.person = element('div', 'hud-speech hud-person');
    this.person.hidden = true;
    this.hunger = element('button', 'panel hud-hunger');
    this.hunger.type = 'button';
    this.hunger.hidden = true;
    this.hunger.addEventListener('click', () => this.focusHungry());
    this.floats = element('div', 'hud-floats');
    this.stats = element('div', 'panel hud-stats');
    this.stats.hidden = !debug;
    this.toasts = element('div', 'hud-toasts');
    this.toasts.setAttribute('aria-live', 'polite');
    this.countdown = element('div', 'hud-countdown');
    this.speech = element('div', 'hud-speech');
    this.speech.hidden = true;
    this.speech.setAttribute('aria-live', 'polite');
    this.weather = element('div', 'hud-weather');
    this.weather.hidden = true;

    this.banner = element('div', 'hud-banner');
    this.banner.hidden = true;
    this.banner.setAttribute('role', 'status');
    this.bannerArrow = element('div', 'hud-banner-arrow');
    this.bannerArrow.append(uiIcon('direction', 26));

    const bannerBody = element('div', 'hud-banner-body');

    this.bannerTitle = element('div', 'hud-banner-title');
    this.bannerText = element('div', 'hud-banner-text');
    bannerBody.append(this.bannerTitle, this.bannerText);
    this.banner.append(this.bannerArrow, bannerBody);

    // Pause et Réglages : les deux premiers disques de la rangée des contrôles, en haut à droite (`main.ts`).
    this.pauseButton = element('button', 'hud-button hud-pause');
    this.pauseButton.type = 'button';
    this.pauseButton.append(uiIcon('pause'));

    this.settingsButton = element('button', 'hud-button hud-settings');
    this.settingsButton.type = 'button';
    this.settingsButton.setAttribute('aria-haspopup', 'dialog');
    this.settingsButton.append(uiIcon('settings'));
    onLocale(() => setTip(this.settingsButton, t().settings.title));

    this.defeat = element('div', 'overlay hud-defeat');
    this.defeat.hidden = true;

    const defeatPanel = element('div', 'panel overlay-panel');
    const defeatTitle = element('h2', 'overlay-title');
    const defeatText = element('p', 'overlay-text');
    const replay = element('button', 'button-primary');
    const fresh = element('button', 'button-secondary');

    this.defeatStats = element('dl', 'overlay-stats');
    this.defeatSeeds = element('div', 'overlay-seeds');
    // La sauvegarde est déjà effacée : l'adresse seule décide de la carte.
    replay.type = 'button';
    replay.addEventListener('click', () => window.location.assign(mapUrl(window.location.href, world.seed)));
    fresh.type = 'button';
    fresh.addEventListener('click', () => window.location.assign(mapUrl(window.location.href, null)));
    defeatPanel.append(defeatTitle, defeatText, this.defeatStats, this.defeatSeeds, replay, fresh, seedLine(world.seed));
    this.defeat.append(defeatPanel);

    // « Vous êtes mort » : plein écran, sans bouton — le décompte de la sim décide seul.
    this.death = element('div', 'overlay hud-death');
    this.death.hidden = !world.dead;
    this.death.setAttribute('role', 'alert');

    const deathTitle = element('h2', 'death-title');

    this.deathCount = element('p', 'death-count');
    this.death.append(deathTitle, this.deathCount);

    this.victory = element('div', 'overlay hud-victory');
    this.victory.hidden = true;

    const victoryPanel = element('div', 'panel overlay-panel');
    const victoryTitle = element('h2', 'overlay-title');
    const victoryText = element('p', 'overlay-text');
    const endless = element('button', 'button-primary');

    this.victoryStats = element('dl', 'overlay-stats');
    endless.type = 'button';
    endless.addEventListener('click', () => {
      this.victory.hidden = true;
      this.onContinue();
    });
    victoryPanel.append(uiIcon('goal', 56), victoryTitle, victoryText, this.victoryStats, endless);
    this.victory.append(victoryPanel);

    this.celebration = element('div', 'hud-celebration');
    this.celebration.hidden = true;
    this.celebration.setAttribute('role', 'status');
    this.confetti = element('div', 'hud-confetti');

    // Le haut de l'écran : une seule rangée, collée en haut, de blocs de même
    // hauteur (`--hud-h`) — à gauche la ville (le Prestige en tête), la
    // population, l'horloge du jour et l'alerte de vivres, au centre la barre
    // (l'objectif), à droite la météo. Sur un écran
    // trop étroit, les deux groupes passent ensemble sur une rangée dessous.
    this.top = element('div', 'hud-top');

    // La barre : l'objectif ; la quête s'ouvre en fenêtre sous lui.
    this.bar = element('div', 'panel hud-topbar');
    this.bar.append(this.objective);

    const main = element('div', 'hud-main');

    this.quest.append(fold);
    main.append(this.bar, this.quest);
    this.left = element('div', 'hud-left');
    // L'horloge du jour juste à droite de la population.
    this.left.append(this.town, this.people, this.dayClock, this.hunger);
    this.right = element('div', 'hud-right');
    this.right.append(this.weather);
    this.top.append(this.left, main, this.right);

    this.root.append(
      // Les confettis d'abord : ils tombent derrière les cartes du HUD et les fenêtres.
      this.confetti,
      this.top,
      this.actions,
      this.countdown,
      this.speech,
      this.person,
      this.banner,
      this.toasts,
      this.floats,
      this.stats,
      this.celebration,
      this.victory,
      this.death,
      this.defeat,
    );
    this.tips = new Tooltips(this.root);

    // Les libellés fixes se réécrivent au changement de langue ; les rendus
    // en cache repartent de zéro, et un écran de fin ouvert se réécrit.
    onLocale(() => {
      const text = t().hud;

      setTip(this.hintBulb, text.hintBulb);
      setTip(this.pauseButton, text.pause);
      deathTitle.textContent = text.death.title;
      this.lastDeathSeconds = -1;
      defeatTitle.textContent = text.defeat.title;
      defeatText.textContent = text.defeat.text;
      replay.textContent = text.defeat.replay;
      fresh.textContent = text.defeat.fresh;
      victoryTitle.textContent = t().lore.signal.title;
      victoryText.textContent = t().lore.signal.text;
      endless.textContent = text.victory.endless;
      this.lastQuest = '';
      this.lastClock = '';
      this.lastBag = '';
      this.lastTown = '';
      this.lastPrestige = '';
      this.lastLevel = '';
      this.lastPeople = '';
      this.lastWeather = '';
      if (!this.defeat.hidden) this.renderDefeat();
      if (!this.victory.hidden) this.renderVictory();
    });

    document.addEventListener('pointerdown', this.foldCrewOnTouch, { capture: true });

    world.events.on('placementRejected', ({ reason, ore }) =>
      this.notify(reason === 'footing' ? footingText(ore) : t().hud.rejection[reason], 'bad'),
    );
    world.events.on('roadPaved', ({ fromBag }) => {
      if (fromBag > 0) this.float('stone', -fromBag);
    });
    world.events.on('roadRemoved', ({ toBag }) => {
      if (toBag > 0) this.float('stone', toBag);
    });
    world.events.on('roadRejected', ({ reason, paved }) => this.notify(roadLabel(reason, paved), 'bad'));
    world.events.on('resourceHarvested', ({ item, amount }) => {
      if (item === 'wood') this.harvestedWood = true;
      if (item === 'stone') this.harvestedStone = true;
      this.float(item, amount);
    });
    world.events.on('siteDelivered', ({ item, amount, source }) => {
      this.delivered = true;
      // Ce que la ville donne ne sort pas du sac : rien ne tombe de la tête d'Adam.
      if (source === 'bag') this.float(item, -amount);
    });
    world.events.on('townDeposited', ({ item, amount }) => this.float(item, -amount));
    world.events.on('itemDropped', ({ item, amount }) => this.float(item, -amount));
    world.events.on('depositRejected', ({ reason }) => {
      if (reason === 'outOfReach') this.notify(t().hud.toast.depositFar, 'bad');
      if (reason === 'noTown') this.notify(t().hud.toast.depositNoTown, 'bad');
    });
    world.events.on('siteRejected', ({ reason }) => {
      if (reason === 'outOfReach') this.notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'nothingToGive') this.notify(t().hud.toast.siteNothing, 'bad');
    });
    world.events.on('storeTaken', ({ item, amount }) => this.float(item, amount));
    world.events.on('buildingSupplied', ({ item, amount, source }) => {
      if (source === 'bag') this.float(item, -amount);
    });
    world.events.on('supplyRejected', ({ reason }) => {
      if (reason === 'outOfReach') this.notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'nothingToGive') this.notify(t().hud.toast.supplyNothing, 'bad');
    });
    world.events.on('nurseryHungry', () => this.notify(t().hud.toast.nurseryHungry, 'bad'));
    world.events.on('takeRejected', ({ reason }) => {
      if (reason === 'outOfReach') this.notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'empty') this.notify(t().hud.toast.chestEmpty, 'bad');
      if (reason === 'bagFull') this.notify(t().hud.toast.bagFullTake, 'bad');
    });
    world.events.on('transferRejected', ({ reason }) => {
      if (reason === 'outOfReach') this.notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'bagFull') this.notify(t().hud.toast.bagFullTake, 'bad');
    });
    world.events.on('inventoryFull', () => this.notify(this.bagFullMessage(), 'bad'));
    world.events.on('harvestRefused', ({ item, wanted, plenty }) => {
      this.refused(item);
      this.notify(harvestRefusedText(item, wanted, plenty), 'info');
    });
    world.events.on('buildingCompleted', ({ id }) => {
      const entity = world.entities.get(id);

      if (entity) this.celebrate(entity, t().hud.float.built(t().buildings[entity.proto].label));
    });
    // Un coffre ouvert : « Coffre ouvert ! » monte au-dessus de lui.
    world.events.on('chestOpened', ({ tx, ty }) => this.celebrate({ tx, ty, width: 1, height: 1 }, t().wardrobe.chestOpened));
    world.events.on('prestigeGained', ({ amount, x, y }) => this.floatPrestige(amount, x, y));
    world.events.on('xpGained', ({ amount, x, y }) => this.floatXp(amount, x, y));
    world.events.on('levelUp', ({ level, maxHp, bowDamage }) => {
      this.notify(t().hud.toast.levelUp(level, maxHp, bowDamage), 'good');
      this.level.dataset['up'] = 'true';
      window.setTimeout(() => delete this.level.dataset['up'], 1400);
    });
    world.events.on('buildingUpgraded', ({ id, level, fromBag }) => {
      const entity = world.entities.get(id);

      for (const [item, amount] of fromBag) this.float(item, -amount);
      if (entity) this.celebrate(entity, t().hud.float.upgraded(levelLabel(entity.proto, level)));
    });
    world.events.on('enemyBaseResisted', ({ level }) =>
      this.notify(t().hud.toast.betterGear(t().gear[Math.min(level, t().gear.length - 1)] ?? '', level), 'bad'),
    );
    world.events.on('enemyBaseShielded', () => this.notify(t().hud.toast.baseShielded, 'bad'));
    world.events.on('enemyChiefDefeated', ({ prestige }) => this.notify(t().hud.toast.chiefDefeated(prestige), 'good'));
    world.events.on('enemyZoneEntered', ({ level }) => this.notify(t().hud.toast.enemyZone(level), 'info'));
    // Le « +N Prestige » monte déjà de la base (`prestigeGained`) : il ne reste que le bandeau.
    world.events.on('enemyBaseDestroyed', ({ prestige }) => this.notify(t().hud.toast.baseDestroyed(prestige), 'good'));
    world.events.on('gearCrafted', ({ level, fromBag }) => {
      for (const [item, amount] of fromBag) this.float(item, -amount);
      this.notify(t().hud.toast.gearCrafted(t().gear[level] ?? '', level), 'good');
    });
    world.events.on('companionTraining', ({ role, endTick, fromBag }) => {
      for (const [item, amount] of fromBag) this.float(item, -amount);
      this.notify(t().hud.toast.companionTraining(t().companionClasses[role].label, Math.ceil((endTick - world.tickCount) / TICKS_PER_SECOND)), 'info');
    });
    world.events.on('companionJoined', ({ role }) => this.notify(t().hud.toast.companionJoined(t().companionClasses[role].label), 'good'));
    world.events.on('companionDied', ({ role }) => this.notify(t().hud.toast.companionDied(t().companionClasses[role].label), 'bad'));
    world.events.on('recruitRejected', ({ reason }) => {
      if (reason !== 'missing') this.notify(t().hud.recruit[reason], 'bad');
    });
    world.events.on('gearRejected', ({ reason }) => {
      if (reason !== 'missing') this.notify(t().hud.gear[reason], 'bad');
    });
    world.events.on('upgradeRejected', ({ reason }) => {
      if (reason === 'outOfReach') this.notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'missingItems') this.notify(t().hud.toast.upgradeMissing, 'bad');
    });
    world.events.on('playerRepaired', ({ item, amount, fromBag }) => {
      this.repaired = true;
      if (fromBag > 0) this.float(item, -fromBag);
      if (amount > fromBag) this.notify(t().hud.toast.repairedFromTown(amount - fromBag, t().items[item]), 'good');
    });
    world.events.on('repairRejected', ({ reason }) => {
      if (reason !== 'missing') this.notify(t().hud.repair[reason], 'bad');
    });
    world.events.on('waveCountdown', ({ seconds, night, wave, count, bases, boss, queen, from, targetProto, x, y }) => {
      this.showCountdown(String(seconds));
      this.announce(night, wave, count, bases, boss, queen, from, targetProto, { x, y });
    });
    // La veille au soir : Ève prévient, dans sa bulle — ou par radio si elle n'est pas là.
    world.events.on('queenAnnounced', () => {
      if (world.eve()) this.say([t().eve.queen]);
      else this.notify(t().hud.toast.eveRadio(t().eve.queen), 'bad');
    });
    world.events.on('queenSlain', ({ night }) =>
      this.showBanner('cleared', t().hud.wave.queenSlain, t().hud.wave.queenSlainText(night), null, BANNER_CLEARED_MS),
    );
    world.events.on('duskFell', () => this.notify(t().hud.toast.dusk, 'bad'));
    // Une vague qui n'a pas eu son compte à rebours (partie reprise pile avant) s'annonce quand même.
    world.events.on('waveStarted', ({ night, wave, count, bases, boss, queen, from, targetProto, x, y }) => {
      this.announce(night, wave, count, bases, boss, queen, from, targetProto, { x, y });
      this.unfoldQuest(QUEST_ALERT_TICKS);
    });
    world.events.on('buildingDamaged', ({ id, hp }) => {
      const hall = world.entities.get(id);

      if (id !== world.townHallId || !hall) return;

      const low = hp / BUILDINGS[hall.proto].hp < QUEST_ALERT_HP;

      if (low && !this.hallLow) this.unfoldQuest(QUEST_ALERT_TICKS);
      this.hallLow = low;
    });
    world.events.on('waveCleared', ({ night }) =>
      this.showBanner('cleared', t().hud.wave.cleared(night), t().hud.wave.clearedText, null, BANNER_CLEARED_MS),
    );
    world.events.on('lootPicked', ({ item, amount }) => this.float(item, amount));
    world.events.on('happinessChanged', ({ from, to }) => {
      this.moodTrend = to === from ? null : { up: to > from, until: performance.now() + MOOD_TREND_MS };
    });
    world.events.on('dawnBroke', ({ night, reward }) => {
      this.notify(t().hud.toast.dawn(night), 'good');
      for (const [item, amount] of reward) this.float(item, amount);
    });
    world.events.on('buildingDestroyed', ({ proto }) => this.notify(t().hud.toast.destroyed(t().buildings[proto].label), 'bad'));
    world.events.on('siteCancelled', ({ proto, toTown }) =>
      this.notify(t().hud.toast.siteCancelled(t().buildings[proto].label, toTown), 'info'),
    );
    world.events.on('childBorn', () => this.notify(t().hud.toast.childBorn, 'good'));
    world.events.on('mutantStunned', () => this.notify(t().hud.toast.mutantStunned, 'good'));
    world.events.on('patientFollowing', () => this.notify(t().hud.toast.patientFollowing, 'good'));
    world.events.on('patientAdmitted', () => this.notify(t().hud.toast.patientAdmitted, 'good'));
    world.events.on('mutantHealed', () => this.notify(t().hud.toast.mutantHealed, 'good'));
    world.events.on('kidGrewUp', ({ name }) => this.notify(t().hud.toast.kidGrewUp(name), 'good'));
    world.events.on('starving', ({ name, need, seconds }) => this.notify(t().hud.toast.starving[need](name, seconds), 'bad'));
    world.events.on('workerStarved', ({ name, need }) => this.notify(t().hud.toast.workerStarved[need](name), 'bad'));
    world.events.on('growthStunted', ({ name, need }) => this.notify(t().hud.toast.growthStunted[need](name), 'bad'));
    world.events.on('townHallDestroyed', () => this.showDefeat());
    world.events.on('playerKnockedOut', () => (this.death.hidden = false));
    world.events.on('playerRespawned', () => (this.death.hidden = true));
    world.events.on('weatherAnnounced', ({ id, seconds }) => {
      const { label, advice } = t().weather[id];

      this.notify(t().hud.toast.weatherSoon(label, seconds, advice), WEATHER[id].harsh ? 'bad' : 'info');
    });
    world.events.on('weatherEnded', ({ id }) => this.notify(t().hud.toast.weatherEnded(t().weather[id].label), 'good'));
    world.events.on('playerKnockedOut', () => this.notify(t().hud.toast.knockedOut, 'bad'));
    world.events.on('eveArriving', () => this.notify(t().hud.toast.eveArriving, 'good'));
    world.events.on('caravanArriving', () => {
      this.notify(t().hud.toast.caravanArriving, 'good');
      this.say([t().eve.caravan]);
    });
    world.events.on('caravanLeaving', () => this.notify(t().hud.toast.caravanLeaving, 'info'));
    world.events.on('traded', ({ fromBag, stored }) => {
      for (const [item, amount] of fromBag) this.float(item, -amount);
      for (const [item, amount] of Object.entries(stored) as [ItemId, number][]) {
        if (amount > 0) this.notify(t().hud.toast.storedAtHall(t().hud.toast.storedItem(amount, t().items[item])), 'info');
      }
    });
    world.events.on('tradeRejected', ({ reason }) => {
      if (reason === 'outOfReach') this.notify(t().hud.toast.tradeFar, 'bad');
      if (reason === 'missingItems') this.notify(t().hud.toast.tradeMissing, 'bad');
      if (reason === 'done') this.notify(t().hud.toast.tradeDone, 'bad');
      if (reason === 'missing') this.notify(t().hud.toast.tradeGone, 'bad');
    });
    world.events.on('eveArrived', () => {
      this.notify(t().hud.toast.eveArrived, 'good');
      this.say(t().eve.arrival);
    });
    world.events.on('questStarted', ({ quest }) => this.say([t().quests[quest].give]));
    world.events.on('questCompleted', ({ quest }) => {
      this.say([t().quests[quest].done]);
      this.notify(rewardLabel(QUESTS[quest].reward), 'good');
    });
    world.events.on('labSupplied', ({ item, amount, source }) => {
      if (source === 'bag') this.float(item, -amount);
    });
    world.events.on('researchStarted', ({ research }) => this.notify(t().hud.toast.researchStarted(t().research[research].label), 'info'));
    world.events.on('researchCompleted', ({ research }) =>
      this.notify(
        t().hud.toast.researchCompleted(
          RESEARCH[research].effect === null ? t().research[research].label : effectLine(research, world.researchDone, world.perks),
        ),
        'good',
      ),
    );
    world.events.on('buildingsUnlocked', ({ buildings }) => {
      const labels = buildings.map((building) => t().buildings[building].label).join(', ');

      this.notify(t().hud.toast.buildingsUnlocked(buildings.length, labels), 'good');
    });
    world.events.on('researchRejected', ({ reason }) => {
      if (reason === 'busy') this.notify(t().hud.toast.researchBusy, 'bad');
      if (reason === 'taken') this.notify(t().hud.toast.researchTaken, 'bad');
      if (reason === 'locked') this.notify(t().hud.toast.researchLocked, 'bad');
      if (reason === 'outOfReach') this.notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'nothingToGive') this.notify(t().hud.toast.researchNothing, 'bad');
    });
    world.events.on('objectiveCompleted', ({ index, stored }) => {
      // Le dernier objectif, c'est l'écran de victoire qui le fête.
      if (index < OBJECTIVES.length - 1) this.celebrateObjective(index);
      this.unfoldQuest(QUEST_ALERT_TICKS);

      const kept = (Object.entries(stored) as [ItemId, number][]).filter(([, amount]) => amount > 0);

      if (kept.length > 0) {
        const list = kept.map(([item, amount]) => t().hud.toast.storedItem(amount, t().items[item])).join(', ');

        this.notify(t().hud.toast.storedAtHall(list), 'info');
      }
    });
    // L'antenne s'allume d'abord, ses ondes couvrent l'écran : l'écran du Signal vient après.
    world.events.on('victory', () => window.setTimeout(() => this.showVictory(), SIGNAL_WAVES.durationMs));
    world.events.on('antennaRaised', ({ floor, lureNight }) => {
      this.notify(t().hud.toast.antennaRaised(floor, lureNight), 'info');
    });
    world.events.on('antennaFell', ({ floor }) => this.notify(t().hud.toast.antennaFell(floor), 'bad'));
    world.events.on('signalSent', () => {
      // Ève le dit tout de suite, à la place de ce qu'elle disait.
      this.speechQueue.length = 0;
      this.speechQueue.push(t().lore.signal.answer);
      this.speechUntil = 0;
    });
    world.events.on('survivorsArrived', ({ count }) =>
      this.notify(t().hud.toast.survivors(count), 'good'),
    );
  }

  /** Ce que fait « Continuer sans fin » : `main.ts` relance l'horloge. */
  public setOnContinue(onContinue: () => void): void {
    this.onContinue = onContinue;
  }

  /* -------------------------------------------------------------------- Ève */

  /** Des répliques à la suite dans la bulle d'Ève. */
  private say(lines: readonly string[]): void {
    this.speechQueue.push(...lines);
  }

  /**
   * Ève tapée : elle répond sur-le-champ, à la place de ce qu'elle disait.
   * Pendant une attaque, elle a mieux à faire ; sinon, une fois sur deux elle
   * rappelle la quête, l'autre elle dit ce qui lui passe par la tête.
   */
  public talkToEve(): void {
    const quest = currentQuest(this.world.questsDone);
    let line: string;

    if (this.mutantCount() > 0) {
      line = t().eve.busy;
    } else if (this.talks++ % 2 === 0) {
      line = quest ? t().quests[quest].give : t().eve.allDone;
    } else {
      const { chatter } = t().eve;

      line = chatter[this.chatterIndex++ % chatter.length]!;
    }

    this.speechQueue.length = 0;
    this.speechQueue.push(line);
    this.speechUntil = 0;
  }

  /** La bulle suit Ève à l'écran ; elle passe à la réplique suivante quand le temps de lecture est écoulé. */
  private updateSpeech(): void {
    const eve = this.world.eve();
    const now = performance.now();

    if (!eve) {
      this.speech.hidden = true;
      return;
    }

    if (now >= this.speechUntil) {
      const line = this.speechQueue.shift();

      if (line === undefined) {
        this.speech.hidden = true;
        return;
      }
      this.speech.textContent = line;
      this.speech.hidden = false;
      this.speechUntil = now + SPEECH_BASE_MS + line.length * SPEECH_PER_CHAR_MS;

      // Relance l'animation d'entrée à chaque réplique ; le reflow qu'il faut
      // pour ça donne aussi la hauteur de la bulle.
      this.speech.style.animation = 'none';
      this.speechHeight = this.speech.offsetHeight;
      this.speech.style.animation = '';
    }

    // La quête grandit pendant qu'Ève parle (une quête commence, un conseil
    // s'ouvre) : son bas se relit à chaque frame où la bulle est là.
    const questBottom = this.topInset();
    // Au-dessus de la tête — plus haut en selle —, sans sortir de l'écran.
    const head = eve.state === 'arriving' ? 62 : 50;
    const { x, y } = this.project(eve.x, eve.y - head);
    const margin = Math.min(130, window.innerWidth / 2);

    this.speech.style.left = `${Math.round(Math.min(Math.max(x, margin), window.innerWidth - margin))}px`;
    // `top` est le bas de la bulle, qui flotte 10 px au-dessus : tout entière sous la quête.
    this.speech.style.top = `${Math.round(Math.max(y, questBottom + this.speechHeight + SPEECH_GAP))}px`;
  }

  /** Le renderer sait centrer la caméra ; le HUD non. `main.ts` fait le lien. */
  public setFocus(focus: (x: number, y: number) => void): void {
    this.onFocus = focus;
  }

  /**
   * L'infobulle d'un habitant — prénom, âge, ce qu'il fait —, au-dessus de
   * lui, le temps de la lire. Elle le suit s'il marche.
   */
  public showPerson(id: MobileId): void {
    this.personId = id;
    this.personUntil = performance.now() + PERSON_MS;
    this.person.style.animation = 'none';
    this.person.replaceChildren();
    this.personKey = '';
    this.person.hidden = false;
    void this.person.offsetWidth;
    this.person.style.animation = '';
  }

  private updatePerson(): void {
    const mobile = this.personId === null ? undefined : this.world.mobiles.get(this.personId);

    if (!mobile || !isInhabitant(mobile) || (mobile.kind !== 'kid' && mobile.inside) || performance.now() >= this.personUntil) {
      this.personId = null;
      this.person.hidden = true;
      return;
    }

    const line = personText(nameOf(this.world.seed, mobile.id, mobile.sex), mobile.age, this.world.occupation(mobile));
    // La jauge avance par centièmes : l'infobulle ne se refait pas à chaque tick.
    const gauges = NEED_IDS.map((need) => Math.round(mobile.needs[need] * 100));
    const happiness = mobile.kind === 'kid' ? null : mobile.happiness;
    const key = `${line}|${gauges.join(':')}|${happiness === null ? '' : Math.round(happiness)}`;

    if (key !== this.personKey) {
      this.personKey = key;
      this.person.replaceChildren(
        text('hud-person-line', line),
        ...NEED_IDS.map((need) => needMeter(need, mobile.needs[need])),
        ...(happiness === null ? [] : [moodMeter(happiness)]),
      );
      this.personHeight = this.person.offsetHeight;
    }

    const { x, y } = this.project(mobile.x, mobile.y - (mobile.kind === 'kid' ? 30 : 40));
    const margin = Math.min(130, window.innerWidth / 2);

    this.person.style.left = `${Math.round(Math.min(Math.max(x, margin), window.innerWidth - margin))}px`;
    this.person.style.top = `${Math.round(Math.max(y, this.topInset() + this.personHeight + SPEECH_GAP))}px`;
  }

  /**
   * La population de la ville : au travail, inactifs, enfants. Les inactifs
   * sont un bouton, en corail dès qu'il y en a un : un tap centre la caméra
   * sur l'un d'eux, le tap suivant sur le suivant.
   */
  private updatePeople(): void {
    const { working, idle, children } = this.world.census();
    const { housed, population } = this.world.housing();
    const mood = this.world.happiness();

    if (this.moodTrend && performance.now() >= this.moodTrend.until) this.moodTrend = null;
    const trend = this.moodTrend ? (this.moodTrend.up ? 'up' : 'down') : '';
    const troop = this.world.companions();
    const training = this.world.companionCount() - troop.length;
    const troopHp = troop.reduce((sum, companion) => sum + companion.hp, 0);
    const troopMax = troop.reduce((sum, companion) => sum + COMPANION_CLASSES[companion.role].hp, 0);
    const key = `${working}:${idle}:${children}:${housed}/${population}:${mood.total}:${mood.unhappy}:${trend}:${troop.length}/${training}/${troopHp}/${troopMax}`;

    if (key === this.lastPeople) return;
    const label = t().hud.people;

    this.lastPeople = key;

    const count = (icon: 'toil' | 'child', value: number, label: string): HTMLElement => {
      const node = text('hud-people-count', String(value));

      node.prepend(uiIcon(icon, 18));
      setTip(node, label);
      return node;
    };
    const lazy = text('hud-people-count hud-people-idle', String(idle), 'button');

    lazy.setAttribute('type', 'button');
    lazy.dataset['alert'] = String(idle > 0);
    lazy.prepend(uiIcon('idle', 18));
    setTip(lazy, label.idle(idle));
    lazy.addEventListener('click', () => this.focusIdle());

    // L'Habitation, logés / habitants : en corail dès que quelqu'un dort dehors.
    const housing = text('hud-people-count hud-people-housing', `${housed}/${population}`);

    housing.dataset['alert'] = String(housed < population);
    housing.prepend(uiIcon('home', 18));
    setTip(housing, label.housing(housed, population));

    // Le Bonheur de la ville, à côté : en corail quand l'habitant moyen est malheureux.
    // L'aube qui le fait bouger y pose une flèche, le temps de la voir.
    const happiness = text('hud-people-count hud-people-happiness', String(mood.total));

    happiness.dataset['alert'] = String(population > 0 && moodOf(mood.average) === 'unhappy');
    happiness.prepend(uiIcon('townMood', 18));
    if (trend) {
      happiness.dataset['trend'] = trend;
      happiness.append(uiIcon(trend === 'up' ? 'trendUp' : 'trendDown', 14));
    }
    setTip(happiness, label.happiness(mood.total, mood.average, mood.unhappy));

    // L'armée : compagnons / plafond, et une jauge de leur santé réunie — en corail dès qu'ils sont à moins du tiers.
    const army = text('hud-people-count hud-people-army', `${troop.length}/${COMPANIONS.max}`);
    const health = document.createElement('span');
    const fill = document.createElement('span');

    health.className = 'hud-army-bar';
    fill.className = 'hud-army-fill';
    fill.style.width = `${troopMax > 0 ? Math.round((troopHp / troopMax) * 100) : 0}%`;
    health.append(fill);
    army.dataset['alert'] = String(troopMax > 0 && troopHp / troopMax < 1 / 3);
    army.prepend(uiIcon('army', 18));
    army.append(health);
    setTip(army, t().hud.army.label(troop.length, COMPANIONS.max, troopHp, troopMax, training));

    const hasArmy = troop.length + training > 0;

    this.people.hidden = working + idle + children === 0 && !hasArmy;
    this.people.replaceChildren(
      count('toil', working, label.working(working)),
      lazy,
      count('child', children, label.children(children)),
      housing,
      happiness,
      ...(hasArmy ? [army] : []),
    );
  }

  /**
   * L'alerte de nourriture ou d'eau, sous la population : la ville va en manquer —
   * « 3 min » de stock au rythme où il fond, ou plus rien —, en corail. Elle
   * disparaît quand le stock tient.
   */
  private updateHunger(): void {
    const alert = this.world.needAlert();
    const key = alert ? `${alert.item}:${alert.minutes}:${alert.wanting}:${locale()}` : '';

    if (key === this.lastHunger) return;
    this.lastHunger = key;
    this.hungerNeed = alert?.need;
    this.hunger.hidden = alert === null;
    if (!alert) return;

    const words = t().hud.needAlert;
    const item = t().items[alert.item];
    const who = alert.wanting > 0 ? words.wanting[alert.need](alert.wanting) : '';
    const label = alert.minutes === 0 ? words.out(item, who) : words.soon(item, alert.minutes, who);

    this.hunger.title = label;
    this.hunger.setAttribute('aria-label', label);
    this.hunger.replaceChildren(itemIcon(alert.item, 18), text('hud-hunger-text', alert.minutes === 0 ? words.outShort : words.soonShort(alert.minutes)));
  }

  /** Centre la caméra sur un habitant qui a faim (ou soif) — au tap suivant, sur le suivant — et dit qui il est. */
  private focusHungry(): void {
    const hungry = this.world.wantingInhabitants(this.hungerNeed);

    if (hungry.length === 0) return;

    const mobile = hungry[this.hungryCursor % hungry.length]!;

    this.hungryCursor = (this.hungryCursor + 1) % hungry.length;
    this.onFocus(mobile.x, mobile.y);
    this.showPerson(mobile.id);
  }

  /** Centre la caméra sur un ouvrier qui glande — au tap suivant, sur le suivant — et dit qui il est. */
  private focusIdle(): void {
    const idle = this.world.idleWorkers();

    if (idle.length === 0) return;

    const worker = idle[this.idleCursor % idle.length]!;

    this.idleCursor = (this.idleCursor + 1) % idle.length;
    this.onFocus(worker.x, worker.y);
    this.showPerson(worker.id);
  }

  /** Le renderer sait où est Adam à l'écran ; le HUD non. `main.ts` fait le lien. */
  public setProjector(project: Projector): void {
    this.project = project;
  }

  /** Bas des rangées du haut — ou de la quête, ouverte dessous —, en pixels écran : les repères de bord du renderer restent dessous. */
  public topInset(): number {
    const bar = this.top.getBoundingClientRect().bottom;

    return this.quest.dataset['folded'] === 'false' ? Math.max(bar, this.quest.getBoundingClientRect().bottom) : bar;
  }

  /** Range la rangée des contrôles dans le haut de l'écran, en haut à droite. */
  public mountControls(node: HTMLElement): void {
    this.controls = node;
    this.top.append(node);
  }

  /** La barre du haut et ses deux groupes : les repères de bord les contournent. */
  public obstacles(): DOMRect[] {
    return [this.bar, this.left, this.right, this.controls, this.actions].map((node) => node.getBoundingClientRect());
  }

  /** La ressource que le conseil envoie chercher, ou `null` : le renderer y pointe un repère. */
  public wantedItem(): ItemId | null {
    return this.wanted;
  }

  /** Le panneau de debug est-il ouvert ? Ses raccourcis (brouillard) n'agissent qu'alors. */
  public get debugOn(): boolean {
    return this.debug;
  }

  public toggleDebug(): void {
    this.debug = !this.debug;
    this.stats.hidden = !this.debug;
  }

  /** Une bulle empilée ; la plus ancienne part quand il y en a trop. */
  /**
   * Une bulle qui monte puis s'en va. `action` : un bouton dans la bulle —
   * « Essayer » sur une pièce de garde-robe trouvée — qui la ferme en servant.
   */
  public notify(message: string, tone: ToastTone = 'info', action?: { label: string; run: () => void }): void {
    // Deux fois le même message d'affilée : on relance la bulle au lieu d'en empiler une deuxième.
    const last = this.toasts.lastElementChild as HTMLElement | null;

    if (last?.textContent === message && last.dataset['leaving'] !== 'true') {
      last.style.animation = 'none';
      void last.offsetWidth;
      last.style.animation = '';
      return;
    }

    const toast = element('div', 'hud-toast');

    toast.textContent = message;
    toast.dataset['tone'] = tone;
    if (action) {
      const button = element('button', 'hud-toast-action');

      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        toast.remove();
        action.run();
      });
      toast.append(button);
    }
    this.toasts.append(toast);

    while (this.toasts.childElementCount > MAX_TOASTS) this.toasts.firstElementChild?.remove();

    window.setTimeout(() => {
      toast.dataset['leaving'] = 'true';
      window.setTimeout(() => toast.remove(), 240);
    }, TOAST_MS);
  }

  /**
   * Un succès obtenu : une bulle jaune plus large que les autres, le trophée
   * qui rebondit et un reflet qui la traverse. Elle reste un peu plus longtemps.
   */
  public notifyAchievement(title: string, label: string, reward: string | null): void {
    const toast = element('div', 'hud-toast hud-toast-achievement');
    const text = element('div', 'hud-toast-text');
    const kicker = element('span', 'hud-toast-kicker');
    const name = element('strong', 'hud-toast-name');

    toast.dataset['tone'] = 'trophy';
    kicker.textContent = title;
    name.textContent = label;
    text.append(kicker, name);
    if (reward) text.append(Object.assign(element('span', 'hud-toast-reward'), { textContent: reward }));
    toast.append(uiIcon('trophy', 34), text);
    this.toasts.append(toast);

    while (this.toasts.childElementCount > MAX_TOASTS) this.toasts.firstElementChild?.remove();

    window.setTimeout(() => {
      toast.dataset['leaving'] = 'true';
      window.setTimeout(() => toast.remove(), 240);
    }, TOAST_MS * 1.5);
  }

  /**
   * Le bandeau d'une vague, une seule fois par vague ; `boss` : un gros
   * mutant ou la Reine (`queen`) mène la charge. Il dit ce qu'elle vise : la
   * mairie, ou l'usine.
   */
  private announce(
    night: number,
    wave: number,
    count: number,
    bases: number,
    boss: boolean,
    queen: boolean,
    from: Compass,
    target: BuildingId,
    origin: { x: number; y: number },
  ): void {
    const key = `${night}:${wave}`;

    if (key === this.announced) return;
    this.announced = key;

    const text = t().hud.wave;
    const direction = t().hud.from[from];
    const aim = t().buildings[target].label;

    this.showBanner(
      'wave',
      wave === 1 ? text.night(night) : text.reinforcements,
      queen ? text.queen(direction) : boss ? text.boss(direction, aim) : text.mutants(count, bases, direction, aim),
      origin,
      BANNER_WAVE_MS,
    );
  }

  /**
   * La mairie vient d'être frappée hors de l'écran : bord rouge qui clignote
   * tant que les coups continuent, et une vibration de temps en temps — pas
   * à chaque coup, un téléphone qui vibre sans arrêt se pose sur la table.
   */
  public alarm(): void {
    const now = performance.now();

    this.alarmUntil = now + ALARM_MS;
    this.root.dataset['alarm'] = 'true';

    if (now - this.lastVibration < ALARM_VIBRATION_EVERY_MS) return;
    this.lastVibration = now;

    // Absente sur iOS et sur ordinateur : l'alarme visuelle suffit alors.
    try {
      navigator.vibrate?.(ALARM_VIBRATION);
    } catch {
      // Refusée par le navigateur : rien à faire.
    }
  }

  /**
   * Le soir d'une nuit de Reine, le bandeau compte jusqu'à sa sortie, du
   * crépuscule à sa vague. Un autre bandeau (une vague, une victoire) passe
   * devant le temps de se lire ; le compte revient ensuite.
   */
  private updateQueenBanner(): void {
    const ticks = this.world.queenCountdown();
    const counting = this.banner.dataset['tone'] === 'queen';

    if (ticks === null) {
      if (counting) this.banner.hidden = true;
      return;
    }
    if (!this.banner.hidden && !counting) return;

    const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
    const text = t().hud.wave.queenIn(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    const title = t().hud.wave.queenNight(this.world.clock()!.cycle);

    if (this.banner.hidden) {
      this.showBanner('queen', title, text, null, Infinity);
    } else {
      // Le titre ne change qu'avec la langue.
      if (this.bannerTitle.textContent !== title) this.bannerTitle.textContent = title;
      if (this.bannerText.textContent !== text) this.bannerText.textContent = text;
    }
  }

  /** Le bandeau, au-dessus du compte à rebours ; sa flèche suit `target` tant qu'il est là. */
  private showBanner(tone: 'wave' | 'cleared' | 'queen', title: string, body: string, target: { x: number; y: number } | null, ms: number): void {
    this.banner.dataset['tone'] = tone;
    this.bannerTitle.textContent = title;
    this.bannerText.textContent = body;
    this.bannerTarget = target;
    this.bannerArrow.hidden = target === null;
    this.banner.hidden = false;
    this.aimBanner();

    // Relance l'animation d'entrée.
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';

    window.clearTimeout(this.bannerTimer);
    // `Infinity` : il reste jusqu'à ce qu'un autre le remplace (le compte à rebours de la Reine).
    if (!Number.isFinite(ms)) return;
    this.bannerTimer = window.setTimeout(() => {
      this.banner.hidden = true;
      this.bannerTarget = null;
    }, ms);
  }

  /** Tourne la flèche du bandeau d'Adam vers le point d'apparition, à l'écran. */
  private aimBanner(): void {
    if (!this.bannerTarget) return;

    const { player } = this.world;
    const from = this.project(player.x, player.y);
    const to = this.project(this.bannerTarget.x, this.bannerTarget.y);

    this.bannerArrow.style.transform = `rotate(${Math.atan2(to.y - from.y, to.x - from.x).toFixed(3)}rad)`;
  }

  /** Un chiffre géant au centre, qui frappe et s'efface — le rythme de l'alarme. */
  private showCountdown(label: string): void {
    this.countdown.textContent = label;
    this.countdown.style.animation = 'none';
    void this.countdown.offsetWidth;
    this.countdown.style.animation = '';
  }

  /** Une icône et un delta qui montent de la tête d'Adam et s'effacent. */
  private float(item: ItemId, delta: number): void {
    const { player } = this.world;
    const { x, y } = this.project(player.x, player.y - 44);
    const floater = element('span', 'hud-float');

    floater.dataset['out'] = String(delta < 0);
    floater.style.left = `${Math.round(x + (Math.random() - 0.5) * 18)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(`${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, itemIcon(item, 18));
    this.floats.append(floater);
    window.setTimeout(() => floater.remove(), FLOAT_MS);
  }

  /** « +N Prestige » qui monte du bâtiment achevé ou de l'ennemi vaincu, en `x`, `y` pixels monde. */
  private floatPrestige(amount: number, worldX: number, worldY: number): void {
    const { x, y } = this.project(worldX, worldY - 28);
    const floater = element('span', 'hud-float hud-float-prestige');

    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(t().hud.float.prestige(amount), prestigeIcon(18));
    this.floats.append(floater);
    window.setTimeout(() => floater.remove(), PRESTIGE_FLOAT_MS);
  }

  /** « +N XP » qui monte de l'ennemi abattu. */
  private floatXp(amount: number, worldX: number, worldY: number): void {
    const { x, y } = this.project(worldX, worldY - 20);
    const floater = element('span', 'hud-float hud-float-prestige hud-float-xp');

    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(t().hud.float.xp(amount));
    this.floats.append(floater);
    window.setTimeout(() => floater.remove(), PRESTIGE_FLOAT_MS);
  }

  /** L'icône de l'objet refusé, qui tressaute au-dessus d'Adam : il n'en prend plus. */
  private refused(item: ItemId): void {
    const { player } = this.world;
    const { x, y } = this.project(player.x, player.y - 44);
    const floater = element('span', 'hud-float');

    floater.dataset['refused'] = 'true';
    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(itemIcon(item, 18), t().hud.float.enough);
    this.floats.append(floater);
    window.setTimeout(() => floater.remove(), FLOAT_MS);
  }

  /** « Sac plein » dit où vider : la ville, le chantier qui attend ce qu'Adam porte, ou le sol. */
  private bagFullMessage(): string {
    const text = t().hud.toast;

    if (this.world.townStock()) return text.bagFullTown;
    return carriesWanted(this.world) ? text.bagFullSite : text.bagFullDrop;
  }

  /** « Mairie bâtie ! » qui monte du toit d'un bâtiment achevé et s'efface. */
  private celebrate(entity: Pick<Entity, 'tx' | 'ty' | 'width' | 'height'>, message: string): void {
    const { x, y } = this.project((entity.tx + entity.width / 2) * TILE_SIZE, (entity.ty - 1) * TILE_SIZE);
    const floater = element('span', 'hud-built');

    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.textContent = message;
    this.floats.append(floater);
    window.setTimeout(() => floater.remove(), BUILT_MS);
  }

  /** `fps`, `chunks`, `atlas` et `water` viennent du renderer : le monde ne les connaît pas. */
  public update(fps: number, chunks: number, atlas: AtlasStats, water: WaterStats, weatherParticles = 0): void {
    this.updateQuest();
    this.updateClock();
    this.updateFold();
    this.updateHint();
    this.updateBag();
    this.updateTown();
    this.updatePrestige();
    this.updateLevel();
    this.updatePeople();
    this.updateHunger();
    this.updateSpeech();
    this.updatePerson();
    this.updateWeather();
    this.updateDeath();
    this.placeCelebration();
    this.updateQueenBanner();
    this.tips.refresh();
    this.root.dataset['danger'] = String(this.mutantCount() > 0 && !this.world.defeated);
    if (!this.banner.hidden) this.aimBanner();
    if (this.root.dataset['alarm'] === 'true' && (performance.now() > this.alarmUntil || this.world.defeated)) {
      this.root.dataset['alarm'] = 'false';
    }

    if (this.debug) this.updateStats(fps, chunks, atlas, water, weatherParticles);
  }

  private mutantCount(): number {
    let count = 0;

    for (const mobile of this.world.mobiles.values()) {
      if (mobile.kind === 'mutant') count += 1;
    }
    return count;
  }

  /* ----------------------------------------------------------------- quête */

  private updateQuest(): void {
    const { world } = this;
    const hall = world.entities.get(world.townHallId);
    const name = t().buildings.townHall.label;
    const words = t().hud.quest;
    let key: string;

    if (hall?.kind === 'site') {
      key = `site:${JSON.stringify(hall.delivered)}`;
      if (key === this.lastQuest) return;
      this.lastQuest = key;

      const cost = Object.entries(BUILDINGS[hall.proto].cost) as [ItemId, number][];

      this.quest.dataset['mode'] = 'build';
      this.questTitle.textContent = objectiveLabel(world.objective);
      this.questBody.replaceChildren(
        text('hud-quest-goal', words.buildHall),
        ...cost.map(([item, needed]) => meter(item, hall.delivered[item] ?? 0, needed)),
      );

      const have = cost.reduce((sum, [item, needed]) => sum + Math.min(hall.delivered[item] ?? 0, needed), 0);
      const need = cost.reduce((sum, [, needed]) => sum + needed, 0);

      this.questStrip.replaceChildren(buildingIcon(hall.proto, 22), text('hud-strip-title', words.buildHall), text('hud-strip-value', `${have}/${need}`));
      return;
    }

    if (!hall) {
      key = 'fallen';
      if (key === this.lastQuest) return;
      this.lastQuest = key;
      this.quest.dataset['mode'] = 'fallen';
      this.questTitle.textContent = words.defeat;
      this.questBody.replaceChildren(text('hud-quest-goal', words.hallFallen));
      this.questStrip.replaceChildren(uiIcon('heart', 18), text('hud-strip-title', words.hallFallen));
      return;
    }

    const max = BUILDINGS[hall.proto].hp;

    this.hallLow = hall.hp / max < QUEST_ALERT_HP;

    const mutants = this.mutantCount();
    const { adults, children, workers } = world.population();
    const people = adults + children;
    const crew = world.workforce();
    if (this.crewOpen && world.tickCount - this.crewSince >= CREW_FOLD_TICKS) this.crewOpen = false;

    // L'heure est à l'horloge de la tête ; la ligne ne parle que de l'attaque.
    const status = mutants > 0 ? words.status(world.night, mutants) : '';

    const quest = world.eve()?.state === 'idle' || world.eve()?.state === 'repair' ? currentQuest(world.questsDone) : null;
    const progress = quest ? questProgress(quest, world.entities.values()) : null;

    const objective = currentObjective(world);
    const goals = objective?.goals ?? [];
    const reached = goals.map((goal) => goalProgress(world, goal));
    const waits = goals.map((goal) => goalWait(world, goal));
    const waiting = goals.map((goal, i) => waitLabel(goal, waits[i]!));

    key = `hall:${world.objective}:${reached.map(({ have }) => have).join(',')}:${waiting.join(',')}:${hall.hp}:${status}:${people}:${workers}:${world.kills}:${quest}:${progress?.have}:${this.crewOpen && JSON.stringify(crew)}`;
    if (key === this.lastQuest) return;
    this.lastQuest = key;

    // L'objectif reste affiché pendant l'attaque : seul le titre crie.
    this.quest.dataset['mode'] = mutants > 0 ? 'wave' : 'defend';
    this.questTitle.textContent = mutants > 0 ? words.attack : objectiveLabel(world.objective);

    const title = objective ? t().objectives[world.objective]!.title : words.endless;
    const goal = text('hud-quest-goal', title);
    const meters = goals.map((condition, i) => goalMeter(condition, reached[i]!.have, reached[i]!.need, waits[i]!));

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
    this.questBody.replaceChildren(goal, ...meters, hp, line);
    if (this.crewOpen) this.questBody.append(crewDetail(crew));

    if (quest && progress) {
      const row = element('div', 'hud-quest-eve');

      row.append(uiIcon('eve', 18), text('hud-quest-eve-label', t().quests[quest].label), text('hud-meter-value', `${progress.have}/${progress.need}`));
      this.questBody.append(row);
    }

    // La ligne repliée : la première condition qui reste à remplir, l'attaque si elle crie.
    const shown = Math.max(0, reached.findIndex(({ have, need }) => have < need));
    const condition = goals[shown];
    // Une naissance qui se fait attendre prend la place du titre et du « 0/1 » : la ligne n'a pas la place des deux.
    const stripWait = condition?.type === 'births' && mutants === 0 ? stripTitle(condition, waits[shown]!, waiting[shown]!) : null;
    const stripHp = element('div', 'hud-strip-hp');

    stripHp.append(bar(hall.hp / max));
    setTip(stripHp, `${name} ${hall.hp}/${max}`);
    stripHp.dataset['low'] = hp.dataset['low'];
    this.questStrip.dataset['urgent'] = String(mutants > 0);
    this.questStrip.replaceChildren(
      mutants > 0 ? uiIcon('mutant', 20) : condition ? goalIcon(condition) : uiIcon('goal', 20),
      ...(stripWait
        ? [stripWait]
        : [
            text('hud-strip-title', mutants > 0 ? words.attack : title),
            ...(condition && mutants === 0 ? [text('hud-strip-value', `${reached[shown]!.have}/${reached[shown]!.need}`)] : []),
          ]),
      stripHp,
    );
  }

  /**
   * L'horloge : le cadran (`World.dayDial`) et « J2 » d'un coup d'œil, le
   * détail en toutes lettres au tap et pour les lecteurs d'écran. Cachée tant
   * que la mairie est en chantier — le cycle n'a pas commencé.
   */
  private updateClock(): void {
    const dial = this.world.dayDial();

    if (this.dayClock.hidden !== !dial) this.dayClock.hidden = !dial;
    if (!dial) return;

    const left = clock(Math.ceil(dial.left / TICKS_PER_SECOND));
    const detail = dial.night ? t().hud.clock.night(dial.day, left) : t().hud.clock.day(dial.day, left);
    const tip = this.world.tickCount < this.clockTipUntil;
    const step = Math.round(dial.progress * DIAL_STEPS) % DIAL_STEPS;
    const key = `${step}:${dial.night}:${dial.warning}:${detail}:${tip}`;

    if (key === this.lastClock) return;

    const [lastStep, lastNight, lastWarning] = this.lastClock.split(':');

    this.lastClock = key;
    if (String(step) !== lastStep || String(dial.night) !== lastNight || String(dial.warning) !== lastWarning) {
      this.dayClockDial.src = dayDialUrl(dayDialSvg(DIAL_ARCS, step / DIAL_STEPS, dial.night, dial.warning));
    }
    this.dayClockDay.textContent = t().hud.clock.short(dial.day);
    this.dayClockTip.textContent = detail;
    this.dayClock.dataset['phase'] = dial.phase;
    this.dayClock.dataset['warning'] = String(dial.warning);
    this.dayClock.dataset['tip'] = String(tip);
    setTip(this.dayClock, detail);
  }

  /** Déplie la quête repliée pour `ticks`, sans raccourcir un dépliage plus long. */
  private unfoldQuest(ticks: number): void {
    this.questOpenUntil = Math.max(this.questOpenUntil, this.world.tickCount + ticks);
    this.updateFold();
  }

  /** Ouverte ou fermée : la quête n'est une fenêtre sous la barre que le temps de la lire (cf. `style.css`). */
  private updateFold(): void {
    const folded = String(this.world.tickCount >= this.questOpenUntil);

    if (this.quest.dataset['folded'] !== folded) {
      this.quest.dataset['folded'] = folded;
      this.objective.setAttribute('aria-expanded', String(folded === 'false'));
    }
  }

  /** Un tap sur l'objectif ouvre la quête ; un autre, ou un tap sur sa tête, la ferme. */
  private toggleQuest(): void {
    this.questOpenUntil = this.quest.dataset['folded'] === 'false' ? 0 : this.world.tickCount + QUEST_TAP_TICKS;
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
      this.crewSince = this.world.tickCount;
      this.unfoldQuest(QUEST_TAP_TICKS);
      this.updateQuest();
    });
    return node;
  }

  /* --------------------------------------------------------------- conseil */

  /** Le conseil sous la quête, cf. `hint.ts`. */
  private currentAdvice(): Advice | null {
    const { world } = this;
    const towers = [...world.entities.values()].some((entity) => entity.kind === 'tower');

    return tutorialAdvice(
      world,
      {
        harvestedWood: this.harvestedWood,
        harvestedStone: this.harvestedStone,
        delivered: this.delivered,
        repaired: this.repaired,
      },
      towers,
      this.mutantCount(),
    );
  }

  private updateHint(): void {
    const advice = this.currentAdvice();
    const hint = advice?.text ?? '';

    this.wanted = advice?.wants ?? null;

    // La langue vient de changer : le même conseil, dans l'autre langue, sans le relancer ni le déplier.
    if (hint !== this.lastHint && this.hintLocale !== locale()) {
      this.hintLocale = locale();
      this.lastHint = hint;
      if (hint !== '') this.hintText.textContent = hint;
    } else if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.hintSince = this.world.tickCount;
      if (hint !== '') this.unfoldQuest(HINT_FOLD_TICKS);
      // Le texte reste en place quand le conseil se tait : il part en se repliant.
      if (hint !== '') this.hintText.textContent = hint;

      // Relance l'animation d'entrée à chaque nouveau conseil.
      this.hint.style.animation = 'none';
      void this.hint.offsetWidth;
      this.hint.style.animation = '';
    }

    const folded = this.world.tickCount - this.hintSince >= HINT_FOLD_TICKS;
    const state = hint === '' ? 'none' : folded ? 'folded' : 'open';

    if (this.quest.dataset['hint'] !== state) this.quest.dataset['hint'] = state;
  }

  /** Le tap sur l'ampoule : le conseil revient pour cinq secondes. */
  private unfoldHint(): void {
    this.hintSince = this.world.tickCount;
    this.quest.dataset['hint'] = this.lastHint === '' ? 'none' : 'open';
    this.unfoldQuest(HINT_FOLD_TICKS);
  }

  /* ----------------------------------------------------------------- météo */

  /** La capsule météo : l'annonce et son compte à rebours, puis le temps qu'il reste. */
  private updateWeather(): void {
    const { world } = this;
    const spell = world.weather();
    const next = spell ? null : world.nextWeather();
    const coming = next && next.start - world.tickCount <= WEATHER_CALENDAR.announceTicks ? next : null;
    const shown = spell ?? coming;
    let label = '';

    if (shown) {
      const seconds = Math.ceil(((spell ? shown.end : shown.start) - world.tickCount) / TICKS_PER_SECOND);
      const name = t().weather[shown.id].label;

      label = spell ? `${name} · ${clock(seconds)}` : t().hud.weather.soon(name, seconds);
    }

    if (label === this.lastWeather) return;
    this.lastWeather = label;
    this.weather.hidden = !shown;
    if (!shown) return;

    this.weather.dataset['soon'] = String(!spell);
    this.weather.dataset['harsh'] = String(WEATHER[shown.id].harsh);
    this.weather.textContent = label;
  }

  /* ------------------------------------------------------------------- sac */

  /**
   * Le sac : un gros bouton violet en bas à gauche, le pendant de « Bâtir » —
   * son pictogramme, « Sac », « 7/60 » dans une capsule qui se remplit,
   * l'objet que le conseil réclame et la touche I. Le détail est dans le
   * panneau qu'il ouvre. Le DOM n'est reconstruit que si le contenu change —
   * comparer une clé texte coûte moins qu'un diff.
   */
  private updateBag(): void {
    const { inventory } = this.world.player;
    const entries = inventory.entries();
    const stock = this.world.townStock();
    const town = stock?.entries().reduce((sum, [, amount]) => sum + amount, 0) ?? null;
    const wanted = this.wanted;
    const key = `${inventory.total()}/${inventory.capacity}|${entries.map(([item, amount]) => `${item}:${amount}`).join(',')}|${town}|${wanted}|${locale()}`;

    if (key === this.lastBag) return;
    this.lastBag = key;

    const label = t().hud.stock;
    const full = inventory.freeSpace() <= 0;
    const count = text('hud-bag-count', `${inventory.total()}/${inventory.capacity}`);
    const hint = element('kbd', 'key-hint');

    count.dataset['full'] = String(full);
    count.style.setProperty('--fill', `${Math.round((inventory.total() / inventory.capacity) * 100)}%`);
    hint.textContent = t().menu.keys.inventory;
    this.bag.replaceChildren(uiIcon('bagButton', 28), count);
    if (wanted) {
      const chip = itemAmount(wanted, inventory.count(wanted));

      chip.classList.add('hud-bag-wanted');
      setTip(chip, label.wanted(t().items[wanted], inventory.count(wanted)));
      this.bag.append(chip);
    }
    this.bag.append(hint);
    this.bag.dataset['full'] = String(full);
    setTip(this.bag, label.bagTip(inventory.total(), inventory.capacity));
    this.bag.setAttribute(
      'aria-label',
      town === null ? label.bagLabel(inventory.total(), inventory.capacity) : label.bagLabelTown(inventory.total(), inventory.capacity, town),
    );
  }

  /**
   * La ville : le stock commun, ce que les chantiers et les porteurs
   * consomment. Tant que la mairie est en chantier, il n'y a pas de ville —
   * la carte le dit au lieu de montrer un stock vide. À côté de chaque objet,
   * sa tendance sur la dernière minute de jeu (`TownFlows.trend`) : une
   * flèche menthe s'il monte, corail s'il baisse, rien s'il stagne. Au bout
   * du bandeau, le bouton du panneau des ressources.
   */
  private updateTown(): void {
    const stock = this.world.townStock();
    const entries = stock?.entries() ?? [];
    const { flows } = this.world;
    const key = stock ? entries.map(([item, amount]) => `${item}:${amount}:${flows.trend(item)}`).join(',') : 'none';

    if (key === this.lastTown) return;
    this.lastTown = key;

    const title = element('div', 'hud-bag-title');

    const label = t().hud.stock;

    title.append(uiIcon('town', 20));
    if (!stock) title.append(text('hud-town-state', label.toBuild));
    setTip(title, label.townTitle);

    const items = element('div', 'hud-stock-items');

    items.append(...entries.map(([item, amount]) => townEntry(item, amount, flows.trend(item))));
    this.town.dataset['empty'] = String(entries.length === 0);
    this.resourcesButton.hidden = !stock;
    const scroll = this.townItems()?.scrollLeft ?? 0;

    // Le niveau d'Adam et le Prestige ouvrent le bandeau, avant la ville et ses objets ; le bouton des ressources le ferme.
    this.town.replaceChildren(this.level, this.prestige, title, items, this.resourcesButton);
    items.scrollLeft = scroll;
    this.markTownOverflow();
  }

  private townItems(): HTMLElement | null {
    return this.town.querySelector<HTMLElement>('.hud-stock-items');
  }

  /** Le bandeau de la ville cache-t-il encore des objets à droite ? */
  private markTownOverflow(): void {
    const items = this.townItems();

    if (!items) return;
    items.dataset['more'] = String(items.scrollLeft + items.clientWidth < items.scrollWidth - 1);
  }

  /** Le Prestige : caché tant que la colonie n'en a pas, puis toujours là, en tête du bandeau de la ville. */
  private updatePrestige(): void {
    const { prestige } = this.world;
    const key = String(prestige);

    if (key === this.lastPrestige) return;
    this.lastPrestige = key;

    const label = t().hud.stock;

    this.prestige.hidden = prestige <= 0;
    this.prestige.replaceChildren(prestigeIcon(18), text('hud-prestige-count', key));
    setTip(this.prestige, label.prestigeLabel(prestige));
  }

  /** Le niveau d'Adam : « Niv. 3 » et une fine barre d'XP dessous, en tête du bandeau de la ville. */
  private updateLevel(): void {
    const { level, into, needed } = levelProgress(this.world.player.xp);
    const max = level >= MAX_LEVEL;
    const key = `${level}:${into}`;

    if (key === this.lastLevel) return;
    this.lastLevel = key;

    const label = t().hud.stock;
    const bar = element('span', 'hud-level-bar');
    const fill = element('span', 'hud-level-fill');

    fill.style.width = `${Math.round((into / needed) * 100)}%`;
    bar.append(fill);
    this.level.replaceChildren(text('hud-level-label', label.level(level)), bar);
    setTip(this.level, label.levelTip(level, into, needed, max));
  }

  /* ------------------------------------------------------------ célébration */

  /** Un objectif réussi : un bandeau qui dit ce qu'il rapporte, et des feuilles qui pleuvent. */
  private celebrateObjective(index: number): void {
    const objective = OBJECTIVES[index];

    if (!objective) return;

    const words = t().objectives[index]!;
    const title = text('hud-celebration-title', words.banner || t().hud.objectiveDone);

    title.prepend(uiIcon('goal', 28));
    this.celebration.replaceChildren(
      title,
      text('hud-celebration-goal', words.title),
      text('hud-celebration-text', words.celebration),
    );
    this.celebration.hidden = false;
    this.objective.dataset['done'] = 'true';
    this.celebration.style.animation = 'none';
    void this.celebration.offsetWidth;
    this.celebration.style.animation = '';

    window.clearTimeout(this.celebrationTimer);
    this.celebrationTimer = window.setTimeout(() => {
      this.celebration.hidden = true;
      delete this.objective.dataset['done'];
    }, CELEBRATION_MS);

    this.rainLeaves();
  }

  /**
   * Une fenêtre ouverte (bâtiment ou sac) : le bandeau ne se pose pas dessus.
   * Il se range sous la barre, à sa largeur, et la fenêtre se tasse sous lui
   * (`--celebration-bottom`, cf. le CSS) — jamais deux cartes l'une sur l'autre.
   */
  private placeCelebration(): void {
    const docked = !this.celebration.hidden && this.root.querySelector('.building-panel:not([hidden])') !== null;

    if (!docked) {
      if (this.root.dataset['celebration'] !== 'docked') return;
      delete this.root.dataset['celebration'];
      this.celebration.style.removeProperty('top');
      this.celebration.style.removeProperty('left');
      this.celebration.style.removeProperty('width');
      return;
    }

    const bar = this.bar.getBoundingClientRect();
    // Sur un téléphone, le Prestige, la ville et l'horloge font une rangée sous la barre.
    const above = this.top.getBoundingClientRect().bottom;
    const width = Math.min(bar.width, CELEBRATION_WIDTH);

    this.root.dataset['celebration'] = 'docked';
    this.celebration.style.top = `${Math.round(above + CELEBRATION_GAP)}px`;
    this.celebration.style.left = `${Math.round(bar.left + bar.width / 2)}px`;
    this.celebration.style.width = `${Math.round(width)}px`;
    // Le bas sans l'animation (qui le fait rebondir) : la fenêtre ne bouge pas avec.
    const bottom = this.celebration.offsetTop + this.celebration.offsetHeight;

    this.root.style.setProperty('--celebration-bottom', `${bottom}px`);
  }

  /** Des feuilles, des pétales : la pluie de confettis, en CSS. Chacune part au bout de sa chute. */
  private rainLeaves(): void {
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      const leaf = uiIcon(CONFETTI[i % CONFETTI.length]!, 18 + Math.round(Math.random() * 12));

      leaf.classList.add('hud-leaf');
      leaf.style.left = `${Math.round(Math.random() * 100)}%`;
      leaf.style.setProperty('--delay', `${Math.round(Math.random() * 900)}ms`);
      leaf.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 120)}px`);
      leaf.style.setProperty('--spin', `${Math.round((Math.random() - 0.5) * 900)}deg`);
      this.confetti.append(leaf);
      window.setTimeout(() => leaf.remove(), CONFETTI_MS + 1000);
    }
  }

  /* ---------------------------------------------------------------- victoire */

  private showVictory(): void {
    this.renderVictory();
    this.victory.hidden = false;
    this.rainLeaves();
  }

  /** Le bilan de la victoire, dans la langue du moment. */
  private renderVictory(): void {
    const { world } = this;
    const label = t().hud.victory;
    const { adults, children, workers } = world.population();
    let buildings = 0;

    for (const entity of world.entities.values()) if (entity.kind !== 'site') buildings += 1;

    const rows: [string, string][] = [
      [label.nights, String(world.stats.nightsSurvived)],
      [label.kills, String(world.kills)],
      [label.inhabitants, String(adults + children + workers)],
      [label.buildings, String(buildings)],
      [label.playTime, clock(Math.floor(world.victoryTick / TICKS_PER_SECOND))],
    ];

    this.victoryStats.replaceChildren(
      ...rows.flatMap(([name, value]) => [text('', name, 'dt'), text('', value, 'dd')]),
    );
  }

  /* ------------------------------------------------------------------ mort */

  /** Le compte à rebours de la mort, réécrit seulement quand la seconde change. */
  private updateDeath(): void {
    if (this.death.hidden) return;

    const seconds = this.world.respawnSeconds();

    if (seconds === this.lastDeathSeconds) return;
    this.lastDeathSeconds = seconds;
    this.deathCount.textContent = t().hud.death.countdown(seconds);
  }

  /* ---------------------------------------------------------------- défaite */

  private showDefeat(): void {
    this.renderDefeat();
    this.defeat.hidden = false;
  }

  /** Le bilan de la défaite et ses graines, dans la langue du moment. */
  private renderDefeat(): void {
    const { world } = this;
    const rows = defeatRows(world);

    this.defeatStats.replaceChildren(
      ...rows.flatMap(([label, value]) => [text('', label, 'dt'), text('', value, 'dd')]),
    );

    // Les mêmes graines que `main.ts` verse au jardin : le barème est une fonction pure du bilan.
    const seeds = seedsFor(world.colonyScore());
    const amount = text('overlay-seeds-amount', t().hud.defeat.seeds(seeds));

    amount.prepend(uiIcon('seed', 28));
    this.defeatSeeds.replaceChildren(amount, text('overlay-seeds-hint', t().hud.defeat.seedsHint));
  }

  /* ------------------------------------------------------------------ debug */

  private updateStats(fps: number, chunks: number, atlas: AtlasStats, water: WaterStats, weatherParticles: number): void {
    const { cx, cy } = this.world.playerChunk();
    const lines = [
      `tick ${this.world.tickCount}   ${fps.toFixed(0)} fps   seed ${this.world.seed}`,
      `chunk ${cx},${cy}   ${chunks} blocs de sol   ${this.world.resources.size()} tuiles entamées`,
      `eau ${water.blocks} bloc(s) à l'écran, ${water.tiles} tuile(s) au shader`,
      `atlas ${atlas.images} images → ${atlas.pages} texture(s), ${atlas.megapixels.toFixed(1)} Mpx @${atlas.resolution}x, ${atlas.ms} ms`,
      `${this.world.entities.size} bâtiment(s)   ${this.world.mobiles.size} mobile(s)   ${this.world.pendingWakes()} réveil(s)`,
      `météo ${this.world.weather()?.id ?? 'calme'}   ${weatherParticles} particule(s)`,
      `brouillard ${this.world.fog.enabled ? 'oui' : 'levé'} (F)   ${this.world.fog.exploredCount()} case(s) explorée(s), ${this.world.fog.sourceCount} source(s)`,
    ];

    for (const entity of this.world.entities.values()) {
      if (entity.kind === 'site') continue;

      const contents = entity.store
        .entries()
        .map(([item, amount]) => `${t().items[item]} ${amount}`)
        .join(', ');
      const stopped = (entity.kind === 'drill' || entity.kind === 'forge') && entity.blocked ? ' — arrêtée' : '';

      lines.push(`#${entity.id} ${t().buildings[entity.proto].label} : ${contents || 'vide'}${stopped}`);
    }

    this.stats.textContent = lines.join('\n');
  }

  public destroy(): void {
    document.removeEventListener('pointerdown', this.foldCrewOnTouch, { capture: true });
    this.root.remove();
  }
}

/* ------------------------------------------------------------------ outils */

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (className) node.className = className;
  return node;
}

function text(className: string, content: string, tag: keyof HTMLElementTagNameMap = 'span'): HTMLElement {
  const node = element(tag, className);

  node.textContent = content;
  return node;
}

function bar(ratio: number): HTMLElement {
  const track = element('div', 'hud-bar');
  const fill = element('div', 'hud-bar-fill');

  fill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  track.append(fill);
  return track;
}

/** Une pastille « pictogramme + nombre » : habitants, mutants abattus. */
function chip(icon: 'people' | 'mutant', value: number, label: string): HTMLElement {
  const node = text('hud-quest-chip', String(value));

  node.prepend(uiIcon(icon, 18));
  setTip(node, label);
  return node;
}

/** `node`, avec son libellé (`setTip`). */
/** Un objet du bandeau de la ville : son icône, sa quantité, et sa flèche s'il monte ou baisse. */
function townEntry(item: ItemId, amount: number, trend: Trend): HTMLElement {
  const label = t().hud.stock;
  const name = t().items[item];
  const entry = itemAmount(item, amount);

  if (trend === 'flat') return tipped(entry, label.inTown(name, amount));

  const arrow = uiIcon(trend === 'up' ? 'trendUp' : 'trendDown', 12);

  arrow.classList.add('hud-trend');
  entry.dataset['trend'] = trend;
  entry.append(arrow);
  return tipped(entry, trend === 'up' ? label.inTownUp(name, amount) : label.inTownDown(name, amount));
}

function tipped(node: HTMLElement, label: string): HTMLElement {
  setTip(node, label);
  return node;
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

/** Un enfant, un ouvrier, un bûcheron, un forestier : ce qui a un prénom et une infobulle. */
function isInhabitant(mobile: Mobile): mobile is Inhabitant {
  return mobile.kind === 'kid' || mobile.kind === 'worker' || mobile.kind === 'lumberjack' || mobile.kind === 'forester' || mobile.kind === 'farmer';
}

/** « Objectif 3/7 », ou « Après le Signal » une fois la chaîne bouclée : la partie sans fin. */
function objectiveLabel(index: number): string {
  return index < OBJECTIVES.length ? t().hud.quest.objective(index + 1, OBJECTIVES.length) : t().hud.quest.afterSignal;
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

/** L'attente en version courte, pour la ligne repliée : « bébé 2:41 », « 2 nourritures » ; `null` sans attente. */
function stripTitle(goal: Goal, wait: GoalWait | null, label: string): HTMLElement | null {
  if (!wait) return null;

  const words = t().hud.quest;
  const time = clock(Math.ceil(wait.remainingTicks / TICKS_PER_SECOND));
  const short =
    wait.blockedBy === 'paused'
      ? words.stripPaused
      : wait.blockedBy
        ? words.stripMissing(wait.missing, t().items[wait.blockedBy])
        : goal.type === 'births'
          ? words.stripBaby(time)
          : words.stripNight(time);
  const node = text('hud-strip-title', short);

  setTip(node, label);
  node.dataset['blocked'] = String(wait.blockedBy !== null);
  return node;
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
      : goal.type === 'happiness'
        ? tipped(uiIcon('townMood', 18), t().hud.people.happinessName)
        : uiIcon(goal.type === 'nights' ? 'mutant' : goal.type === 'quests' ? 'eve' : 'people', 18);
}

/** Une ligne de quête : icône, barre, « 7/20 ». */
function meter(item: ItemId, have: number, needed: number): HTMLElement {
  const row = element('div', 'hud-meter');

  row.dataset['done'] = String(have >= needed);
  row.append(tipped(itemIcon(item, 18), t().items[item]), bar(have / needed), text('hud-meter-value', `${have}/${needed}`));
  return row;
}

/** La récompense d'une quête, dite par le jeu. */
function rewardLabel(reward: QuestReward): string {
  return reward.type === 'plan'
    ? t().hud.toast.planReceived(t().buildings[reward.building].label)
    : t().hud.toast.toolReceived(t().tools[reward.tool]);
}

/** Ce que dit la bulle quand un tracé de route n'a pas été pavé en entier ; `paved` tuiles l'ont été. */
function roadLabel(reason: RoadRejection, paved: number): string {
  const text = t().hud.road;

  if (reason !== 'noStone') return text[reason];
  return paved > 0 ? text.noStone(paved) : text.noStoneAtAll;
}

/** Le nom d'un niveau : le bâtiment au niveau 1, son amélioration au-delà. */
function levelLabel(id: BuildingId, level: number): string {
  const words = t().buildings[id];

  return level <= 1 ? words.label : (words.upgrades[level - 2]?.label ?? words.label);
}

/**
 * Le bilan de l'écran de défaite. Les nuits survécues sont les aubes
 * atteintes, comme à la victoire : la mairie peut tomber de jour.
 */
export function defeatRows(world: World): [string, string][] {
  const survived = Math.floor((world.defeatTick || world.tickCount) / TICKS_PER_SECOND);

  return [
    [t().hud.defeat.nights, String(world.stats.nightsSurvived)],
    [t().hud.defeat.kills, String(world.kills)],
    [t().hud.defeat.time, clock(survived)],
  ];
}

/** « 1:05 » ou « 0:09 » à partir d'un nombre de secondes. */
export function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
