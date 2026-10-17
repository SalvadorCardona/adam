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
 * - la **quête** en haut : le chapitre en cours (`data/objectives.ts`) et
 *   une ligne par objectif, l'objectif choisi déplié en jauges — le chantier
 *   de la mairie avec une barre par ressource, sinon une par condition —,
 *   sous lesquels restent la santé de la mairie, la nuit et son compte à
 *   rebours ;
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
 *   fenêtre du sac (`bagPanel.ts`). Sur un téléphone, les deux
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

import type { ObjectiveId } from '../data/objectives.ts';
import type { ItemId } from '../data/items.ts';
import type { ResearchId } from '../data/research.ts';
import type { AtlasStats } from '../render/spriteLibrary.ts';
import type { WaterStats } from '../render/waterLayer.ts';
import type { MobileId } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import type { SaveStats } from '../storage/localSave.ts';
import { Disposer } from './disposer.ts';
import { EventStack } from './eventStack.ts';
import { haptics } from './haptics.ts';
import type { PerfReading } from './perfMeter.ts';
import { Tooltips } from './tooltip.ts';
import { Advice } from './hud/advice.ts';
import { BagButton } from './hud/bag.ts';
import { WaveBanner } from './hud/banner.ts';
import { ControlButtons } from './hud/buttons.ts';
import { Celebration } from './hud/celebration.ts';
import type { HudContext, Projector } from './hud/context.ts';
import { DayClock } from './hud/dayClock.ts';
import { Death } from './hud/death.ts';
import { DebugStats } from './hud/debug.ts';
import { Defeat } from './hud/defeat.ts';
import { element } from './hud/dom.ts';
import { EveSpeech } from './hud/eve.ts';
import { Favors } from './hud/favors.ts';
import { Floats } from './hud/floats.ts';
import { HungerAlert } from './hud/hunger.ts';
import { NightControls } from './hud/night.ts';
import { People } from './hud/people.ts';
import { PersonTip } from './hud/person.ts';
import { Quest } from './hud/quest.ts';
import { Reactions } from './hud/reactions.ts';
import { Toasts, type ToastHandle, type ToastTone } from './hud/toasts.ts';
import { t } from '../i18n/locale.ts';
import { TownBanner } from './hud/town.ts';
import { Victory } from './hud/victory.ts';
import { WaveWatch } from './hud/wave.ts';
import { WeatherChip } from './hud/weather.ts';

export type { Projector } from './hud/context.ts';
export { clock } from './hud/dom.ts';
export { defeatRows } from './hud/defeat.ts';

/** Durée de l'alarme après le dernier coup reçu par la mairie hors de l'écran, en ms. */
const ALARM_MS = 2500;

/**
 * La racine du HUD : elle crée les composants (`hud/`), les range dans le
 * DOM, relit la mise en page du haut et leur délègue tout le reste. Chaque
 * composant tient sa section — son DOM, ses caches, ce qu'il a branché hors
 * de lui — et `dispose()` les défait tous.
 */
export class Hud {
  public readonly root: HTMLElement;

  /** La Volée d'Adam : un bouton du groupe `.hud-actions` (`main.ts`), recharge en anneau ; visible du crépuscule à l'aube. */
  public readonly skillButton: HTMLButtonElement;
  /** Ouvre les cartes de l'aube ; `main.ts` y branche `BoonPanel`. */
  public onBoonOpen: () => void = () => undefined;
  /** Ouvre les talents d'Adam ; `main.ts` y branche `TalentPanel`. */
  public onTalentOpen: () => void = () => undefined;
  /** Le groupe des boutons du joueur, en haut à droite : l'habillage, le sac, « Bâtir ». */
  public readonly actions: HTMLElement;
  /** Le sac, compact : un bouton qui ouvre le panneau inventaire. */
  public readonly bag: HTMLButtonElement;
  /** Au bout du bandeau de la ville : ouvre le panneau des ressources (`main.ts` le branche). */
  public readonly resourcesButton: HTMLButtonElement;
  /** L'engrenage : il ouvre le menu des réglages (`settingsPanel.ts`). */
  public readonly settingsButton: HTMLButtonElement;
  public readonly pauseButton: HTMLButtonElement;
  /** « Inviter un ami », à portée de doigt sans passer par la pause (`main.ts` le pose s'il y a un serveur). */
  public readonly inviteButton: HTMLButtonElement;

  private readonly top: HTMLElement;
  private readonly bar: HTMLElement;
  /** À gauche de la barre (ou sous elle, sur un téléphone) : le Prestige, la ville et son alerte de vivres. */
  private readonly left: HTMLElement;
  /** La rangée des contrôles (Pause, Réglages, carte, zoom), posée dans le haut par `mountControls`. */
  private controls: HTMLElement = document.createElement('div');
  /** À droite de la barre (ou sous elle) : la météo et l'horloge du jour. */
  private readonly events: EventStack;
  /** Le bandeau de la ville, la population et l'horloge du jour : les trois premiers blocs du groupe de gauche. */
  private readonly town: HTMLElement;
  private readonly people: HTMLElement;
  private readonly dayClock: HTMLElement;
  /** Le libellé des icônes, au survol, au focus et à l'appui long (`tooltip.ts`). */
  private readonly tips: Tooltips;

  private readonly quest: Quest;
  private readonly advice: Advice;
  private readonly dial: DayClock;
  private readonly night: NightControls;
  private readonly favors: Favors;
  private readonly bagButton: BagButton;
  private readonly stock: TownBanner;
  private readonly census: People;
  private readonly hunger: HungerAlert;
  private readonly wave: WaveWatch;
  private readonly weather: WeatherChip;
  private readonly person: PersonTip;
  private readonly eve: EveSpeech;
  private readonly banner: WaveBanner;
  private readonly toasts: Toasts;
  private readonly floats: Floats;
  private readonly debug: DebugStats;
  private readonly celebration: Celebration;
  private readonly victory: Victory;
  private readonly death: Death;
  private readonly defeat: Defeat;
  private readonly buttons: ControlButtons;
  private readonly reactions: Reactions;
  /** Ce que la racine a branché hors d'elle : le redimensionnement de la fenêtre. */
  private readonly disposer = new Disposer();

  /**
   * La mise en page du haut, relue seulement quand un de ses blocs change de
   * taille (`ResizeObserver`) ou que l'écran tourne — jamais à chaque frame :
   * le bas des rangées du haut (`topInset`), les rectangles que les repères de
   * bord contournent, la barre et le bas de `.hud-top` où se range le bandeau.
   */
  private layoutDirty = true;
  private readonly resize: ResizeObserver;
  private topInsetPx = 0;
  /** La largeur de l'écran, relue au redimensionnement : les bulles qui suivent la caméra s'y bornent sans la relire à chaque frame. */
  private viewWidth = window.innerWidth;
  private obstacleRects: DOMRect[] = [];
  private barRect: DOMRect | null = null;
  private topRowBottom = 0;
  /** Le nombre de mutants, compté une fois par tick de simulation (`countedTick`), pas à chaque lecture. */
  private mutants = 0;
  private countedTick = -1;

  /** Fin de l'alarme en cours, en ms (`performance.now()`). */
  private alarmUntil = 0;

  private project: Projector = (x, y) => ({ x, y });
  private onFocus: (x: number, y: number) => void = () => {};

  private readonly world: World;

  public constructor(world: World, debug = false, saveStats: () => SaveStats | null = () => null) {
    this.world = world;
    this.root = element('div', 'hud');

    const ctx: HudContext = {
      world,
      project: (x, y) => this.project(x, y),
      focus: (x, y) => this.onFocus(x, y),
      topInset: () => this.topInsetPx,
      viewWidth: () => this.viewWidth,
      mutantCount: () => this.mutantCount(),
    };
    const openTalent = (): void => this.onTalentOpen();

    this.quest = new Quest(ctx);
    this.advice = new Advice(ctx, this.quest);
    this.quest.onChosen = () => {
      this.advice.update();
      this.advice.unfold();
    };
    this.dial = new DayClock(ctx, () => this.updateClock());

    // Les boutons du joueur, en bas à droite : le sac (inventaire et habillement) et « Bâtir » (`main.ts`).
    this.actions = element('div', 'hud-actions');
    this.bagButton = new BagButton(ctx);
    this.bag = this.bagButton.root;
    this.stock = new TownBanner(ctx, openTalent);
    this.resourcesButton = this.stock.resourcesButton;
    this.person = new PersonTip(ctx);
    this.census = new People(ctx, (id) => this.showPerson(id));
    this.hunger = new HungerAlert(ctx, (id) => this.showPerson(id));
    this.wave = new WaveWatch(ctx);
    this.night = new NightControls(ctx);
    this.skillButton = this.night.skillButton;
    this.favors = new Favors(ctx, this.stock.level, () => this.onBoonOpen(), openTalent);
    this.toasts = new Toasts();
    this.floats = new Floats(ctx, this.bag, this.stock.root);
    this.debug = new DebugStats(world, debug, saveStats);
    this.banner = new WaveBanner(ctx);
    this.eve = new EveSpeech(ctx);
    this.weather = new WeatherChip(ctx);

    this.buttons = new ControlButtons();
    this.pauseButton = this.buttons.pause;
    this.settingsButton = this.buttons.settings;
    this.inviteButton = this.buttons.invite;

    this.defeat = new Defeat(world);
    this.death = new Death(world);
    this.celebration = new Celebration(this.root, this.quest.objective, this.toasts, () => ({ bar: this.barRect, topRowBottom: this.topRowBottom }));
    this.victory = new Victory(world, () => this.celebration.rainLeaves());

    // Le haut de l'écran : une seule rangée, collée en haut, de blocs de même
    // hauteur (`--hud-h`) — à gauche la ville (le Prestige en tête), la
    // population, l'horloge du jour et l'alerte de vivres, au centre la barre
    // (l'objectif), à droite la météo. Sur un écran
    // trop étroit, les deux groupes passent ensemble sur une rangée dessous.
    this.top = element('div', 'hud-top');

    // La barre : l'objectif ; la quête s'ouvre en fenêtre sous lui.
    this.bar = element('div', 'panel hud-topbar');
    this.bar.append(this.quest.objective);

    const main = element('div', 'hud-main');

    main.append(this.bar, this.quest.root);
    this.left = element('div', 'hud-left');
    // L'horloge du jour juste à droite de la population.
    // Faveur, vague, vivres, météo, combo, « Passer la nuit » : une pile, le plus pressant devant.
    this.events = new EventStack();
    this.events.add('hasten', this.night.hastenButton);
    this.events.add('combo', this.night.comboChip);
    this.events.add('boon', this.favors.boonButton);
    this.events.add('talent', this.favors.talentButton);
    this.events.add('wave', this.wave.soon);
    this.events.add('hunger', this.hunger.root);
    this.events.add('weather', this.weather.root);
    this.town = this.stock.root;
    this.people = this.census.root;
    this.dayClock = this.dial.root;
    this.left.append(this.town, this.people, this.dayClock, this.events.root);
    // Le compteur abattus/sortis suit la pile, à côté de la capsule de vague.
    this.left.append(this.wave.tally);
    this.top.append(this.left, main);

    this.root.append(
      // Les confettis d'abord : ils tombent derrière les cartes du HUD et les fenêtres.
      this.celebration.confetti,
      this.wave.vignette,
      this.wave.edge,
      this.top,
      this.actions,
      this.banner.countdown,
      this.eve.root,
      this.person.root,
      this.banner.root,
      this.toasts.root,
      this.floats.root,
      this.debug.stats,
      this.debug.perf,
      this.celebration.root,
      this.victory.root,
      this.death.root,
      this.defeat.root,
    );
    this.resize = new ResizeObserver((entries) => {
      this.layoutDirty = true;
      for (const entry of entries) {
        // L'infobulle d'un habitant : sa hauteur, sans la relire à chaque nouveau contenu.
        if (entry.target === this.person.root) this.person.height = entry.borderBoxSize[0]?.blockSize ?? this.person.height;
        if (entry.target !== this.celebration.root) continue;
        // La hauteur sans l'animation (qui le fait rebondir) : la fenêtre ne bouge pas avec.
        this.celebration.resized(entry.borderBoxSize[0]?.blockSize ?? this.celebration.root.offsetHeight);
      }
    });
    for (const node of [this.top, this.quest.root, this.bar, this.left, this.actions, this.celebration.root, this.person.root]) this.resize.observe(node);
    this.disposer.listen(window, 'resize', () => {
      this.layoutDirty = true;
      this.viewWidth = window.innerWidth;
    });

    // Une infobulle ne recouvre jamais la bulle d'Ève (ni celle d'un habitant) : elle se décale.
    this.tips = new Tooltips(this.root, () => [this.eve.root, this.person.root].filter((node) => !node.hidden).map((node) => node.getBoundingClientRect()));

    this.reactions = new Reactions(world, {
      toasts: this.toasts,
      floats: this.floats,
      advice: this.advice,
      quest: this.quest,
      banner: this.banner,
      wave: this.wave,
      people: this.census,
      eve: this.eve,
      celebration: this.celebration,
      town: this.stock,
      death: this.death,
      defeat: this.defeat,
      victory: this.victory,
      openTalent,
      focus: (x, y) => this.onFocus(x, y),
    });
  }

  /** Le joueur a demandé de hâter l'aube ; `main.ts` le lit à chaque image. */
  public get hastening(): boolean {
    return this.night.hastening;
  }

  public set hastening(on: boolean) {
    this.night.hastening = on;
  }

  /** Ce que fait « Continuer sans fin » : `main.ts` relance l'horloge. */
  /** « Fonder une nouvelle colonie » : `main.ts` verse les graines au jardin et repart sur une carte neuve. */
  public setOnRefound(onRefound: () => void): void {
    this.victory.onRefound = onRefound;
  }

  public setOnContinue(onContinue: () => void): void {
    this.victory.onContinue = onContinue;
  }

  /**
   * Ève tapée : elle répond sur-le-champ, à la place de ce qu'elle disait.
   * Pendant une attaque, elle a mieux à faire ; sinon, une fois sur deux elle
   * rappelle la quête, l'autre elle dit ce qui lui passe par la tête.
   */
  public talkToEve(): void {
    this.eve.talk();
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
    this.person.show(id);
  }

  /** Le renderer sait où est Adam à l'écran ; le HUD non. `main.ts` fait le lien. */
  public setProjector(project: Projector): void {
    this.project = project;
  }

  /** Bas des rangées du haut — ou de la quête, ouverte dessous —, en pixels écran : les repères de bord du renderer restent dessous. */
  public topInset(): number {
    return this.topInsetPx;
  }

  /**
   * Relit la mise en page du haut si un bloc a changé de taille depuis la
   * dernière fois ; vrai si elle a été relue. `main.ts` l'appelle en début de
   * frame, avant toute écriture dans le DOM : la lecture ne force pas de
   * mise en page, la dernière peinte est encore bonne.
   */
  public measureLayout(): boolean {
    const measured = this.layoutDirty;

    if (measured) {
      this.layoutDirty = false;

      const bar = this.topBottom();

      this.topInsetPx = this.quest.root.dataset['folded'] === 'false' ? Math.max(bar, this.quest.root.getBoundingClientRect().bottom) : bar;
      this.obstacleRects = [this.bar, this.left, this.controls, this.actions].map((node) => node.getBoundingClientRect());
      this.barRect = this.bar.getBoundingClientRect();
      this.topRowBottom = this.top.getBoundingClientRect().bottom;
    }
    // Les écritures après les lectures.
    this.stock.measureOverflow();
    if (measured) this.celebration.redock();
    return measured;
  }

  /**
   * Bas de `.hud-top`. Sous 600 px les contrôles forment une colonne sur le bord
   * droit, qui allonge la grille : ce sont des obstacles (`obstacles()`), pas du
   * haut — sinon la zone des repères de bord se réduit à une bande au centre.
   */
  private topBottom(): number {
    const top = this.top.getBoundingClientRect().bottom;
    const controls = this.controls.getBoundingClientRect();

    if (controls.height <= controls.width) return top;

    return Math.max(...[this.bar, this.left].map((node) => node.getBoundingClientRect().bottom));
  }

  /** Range la rangée des contrôles dans le haut de l'écran, en haut à droite. */
  public mountControls(node: HTMLElement): void {
    this.controls = node;
    this.top.append(node);
    this.resize.observe(node);
  }

  /** La barre du haut et ses deux groupes : les repères de bord les contournent. */
  public obstacles(): DOMRect[] {
    return this.obstacleRects;
  }

  /** La ressource que le conseil envoie chercher, ou `null` : le renderer y pointe un repère. */
  /** La recherche que le conseil envoie lancer au labo, ou `null`. */
  public adviceResearch(): ResearchId | null {
    return this.advice.advisedResearch();
  }

  public wantedItem(): ItemId | null {
    return this.advice.wantedItem();
  }

  /** Ce que le repère de bord montre : ce qu'on récolte, ou l'eau où poser le puits. */
  public pointedItem(): ItemId | null {
    return this.advice.pointedItem();
  }

  /** Le bandeau de la ville : là où volent les gains du récap hors ligne. */
  public get townBanner(): HTMLElement {
    return this.stock.root;
  }

  /** Le panneau de debug est-il ouvert ? Ses raccourcis (brouillard) n'agissent qu'alors. */
  public get debugOn(): boolean {
    return this.debug.open;
  }

  public toggleDebug(): void {
    this.debug.toggle();
  }

  /** Affiche ou masque le compteur de performances ; il attend sa première mesure. */
  public setPerf(on: boolean): void {
    this.debug.setPerf(on);
  }

  /** La moyenne de la dernière fenêtre du compteur (`PerfSampler`). */
  public showPerf(reading: PerfReading): void {
    this.debug.showPerf(reading);
  }

  /**
   * Une bulle qui monte puis s'en va. `action` : un bouton dans la bulle —
   * « Essayer » sur une pièce de garde-robe trouvée — qui la ferme en servant.
   */
  public notify(message: string, tone: ToastTone = 'info', action?: { label: string; run: () => void }): ToastHandle | null {
    return this.toasts.notify(message, tone, action);
  }

  /** Une tombe tapée : « Ici repose Lina — travailleuse, morte de soif au jour 4 ». */
  public showGrave(id: number): void {
    const grave = this.world.graves().find((candidate) => candidate.id === id);

    if (!grave) return;

    const text = t().panel.grave;

    this.notify(text.epitaph(grave.name, text.trait[grave.trait][grave.sex], grave.sex === 'female', text.cause[grave.need], grave.day), 'info');
  }

  /**
   * Un succès obtenu : une bulle jaune plus large que les autres, le trophée
   * qui rebondit et un reflet qui la traverse. Elle reste un peu plus longtemps.
   */
  public notifyAchievement(title: string, label: string, reward: string | null): void {
    this.toasts.notifyAchievement(title, label, reward);
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

    // Absente sur iOS et sur ordinateur, coupable dans les réglages : l'alarme visuelle suffit alors.
    haptics.pulse('alarm', now);
  }

  /**
   * L'objectif choisi dans le panneau : celui que le joueur a touché, tant
   * qu'il reste à réussir ; sinon le premier qui reste. Son conseil passe
   * à l'ampoule, ses jauges se déplient sous sa ligne.
   */
  public selectedObjective(): ObjectiveId | null {
    return this.quest.selected();
  }

  /** Des feuilles, des pétales : la pluie de confettis, en CSS. Chacune part au bout de sa chute. */
  public rainLeaves(): void {
    this.celebration.rainLeaves();
  }

  /**
   * À chaque frame, ce qui suit la caméra ou le doigt : l'infobulle, les bulles
   * d'Ève et d'un habitant, la flèche du bandeau. L'infobulle d'abord : elle
   * lit sa place avant que les bulles n'écrivent la leur.
   */
  public frame(): void {
    this.tips.refresh();
    this.eve.frame();
    this.person.frame();
    this.banner.frame();
  }

  /**
   * Le reste du HUD, à la cadence de l'UI (`ui/uiClock.ts`). `fps`, `chunks`,
   * `atlas` et `water` viennent du renderer : le monde ne les connaît pas.
   */
  public update(fps: number, chunks: number, atlas: AtlasStats, water: WaterStats, weatherParticles = 0): void {
    this.quest.update();
    this.updateClock();
    this.quest.updateFold();
    this.advice.update();
    this.bagButton.update(this.advice.wantedItem());
    this.stock.update();
    this.census.update();
    this.hunger.update();
    this.wave.update();
    this.weather.update();
    this.events.update();
    this.death.update();
    this.celebration.place();
    this.banner.updateQueen();
    const danger = String(this.mutantCount() > 0 && !this.world.defeated);

    if (this.root.dataset['danger'] !== danger) this.root.dataset['danger'] = danger;
    if (this.root.dataset['alarm'] === 'true' && (performance.now() > this.alarmUntil || this.world.defeated)) {
      this.root.dataset['alarm'] = 'false';
    }

    this.debug.update(fps, chunks, atlas, water, weatherParticles);
  }

  /** L'horloge, et les capsules qui la suivent : la Volée, « Passer la nuit », la faveur, le talent. */
  private updateClock(): void {
    this.night.updateSkill();
    this.night.updateHasten();
    this.favors.updateBoon();
    this.favors.updateTalent();
    this.dial.update();
  }

  private mutantCount(): number {
    if (this.world.tickCount === this.countedTick) return this.mutants;

    let count = 0;

    for (const mobile of this.world.mobiles.values()) {
      if (mobile.kind === 'mutant') count += 1;
    }
    this.countedTick = this.world.tickCount;
    this.mutants = count;
    return count;
  }

  /**
   * Défait le HUD : chaque composant débranche ce qu'il a branché hors de lui
   * (événements du monde, langue, fenêtre, document, minuteurs), puis la
   * racine quitte le DOM. Une partie quittée sans recharger n'écoute plus rien.
   */
  public dispose(): void {
    this.reactions.dispose();
    this.events.dispose();
    this.disposer.dispose();
    this.resize.disconnect();
    for (const part of [
      this.quest,
      this.advice,
      this.dial,
      this.night,
      this.favors,
      this.bagButton,
      this.stock,
      this.census,
      this.hunger,
      this.wave,
      this.weather,
      this.person,
      this.eve,
      this.banner,
      this.toasts,
      this.floats,
      this.debug,
      this.celebration,
      this.victory,
      this.death,
      this.defeat,
      this.buttons,
    ]) {
      part.dispose();
    }
    this.root.remove();
  }

  /** L'ancien nom de `dispose()`. */
  public destroy(): void {
    this.dispose();
  }
}
