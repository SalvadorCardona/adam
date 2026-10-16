/**
 * Le joueur simulé : un bot qui joue une partie sans rendu, comme un joueur
 * qui suit les objectifs, et mesure ce qui s'y passe.
 *
 * Il ne touche jamais l'état : il lit le monde et pousse des commandes —
 * `setMoveAxis` pour marcher, `placeBuilding`, `transferToSite`,
 * `transferToLab`, `startResearch`, `depositToTown`, `repairBuilding` —,
 * exactement ce que l'UI enverrait. Sa stratégie est simple, et voulue telle :
 * - récolter ce que réclame l'objectif ouvert (le chantier, puis le labo) ;
 * - poser le bâtiment demandé au plus près de la mairie, dans son rayon ;
 * - lancer la recherche qui l'ouvre, labo compris ;
 * - rentrer près de la mairie au crépuscule, y réparer et y attendre l'aube.
 * La variante `afk` bâtit la mairie, puis ne fait plus rien : elle mesure ce
 * que la colonie tient seule.
 *
 * Le rapport (`PlaytestReport`) dit, pour une graine : les jalons (mairie,
 * chaque chapitre, Ève, la première naissance) en temps de jeu et en temps
 * réel, les morts par cause et par nuit, l'effectif de chaque vague et les PV
 * de la mairie à l'aube, le temps passé sans rien à faire, la nuit de la chute.
 * `src/tools/playtest.ts` en lance des dizaines et en fait un tableau.
 *
 * Tout est déterministe : la graine et la stratégie redonnent la même partie
 * (le temps réel mis à part).
 */

import { TILE_SIZE, floorDiv } from '../core/grid.ts';
import { BUILDINGS, buildingLevel, type BuildingId, type BuildingProto } from '../data/buildings.ts';
import { ROCK_OF_ORE, RESOURCES } from '../data/resources.ts';
import type { ItemId } from '../data/items.ts';
import type { NeedId } from '../data/needs.ts';
import { QUESTS } from '../data/quests.ts';
import { RECIPES } from '../data/recipes.ts';
import { RESEARCH, type ResearchId } from '../data/research.ts';
import { currentQuest } from './eve.ts';
import { goalProgress, openObjectives } from './objectives.ts';
import { BUILD_REACH_TILES } from './player.ts';
import { missingRequirements, openingResearch, queueFull, unlockingResearch } from './research.ts';
import type { SiteLine } from './siteLedger.ts';
import { isWalkable, terrainAt, touchesWater } from './terrain.ts';
import type { PlacementRejection } from './commands.ts';
import type { Building, Entity, Lab, Site } from './types.ts';
import { TICKS_PER_SECOND, World } from './world.ts';

/** `base` : la stratégie du joueur qui suit les objectifs ; `afk` : la mairie bâtie, plus rien. */
export type Strategy = 'base' | 'afk';

export interface PlaytestOptions {
  seed: number;
  /** Minutes de jeu à dérouler (20 ticks par seconde). */
  minutes: number;
  strategy?: Strategy;
  /** S'arrêter au crépuscule de cette nuit, s'il tombe avant la fin des `minutes`. */
  untilNight?: number;
  /** L'horloge du temps réel, en millisecondes ; `performance.now` par défaut. */
  now?: () => number;
}

/** Un instant de la partie : en secondes de jeu, et en millisecondes réelles depuis le début de la simulation. */
export interface Milestone {
  gameSeconds: number;
  wallMs: number;
}

/** Ce que fait le bot à un tick donné. `idle` et `stockpile` : rien que demande un objectif. */
export type Activity = 'gather' | 'deliver' | 'place' | 'guard' | 'loot' | 'stockpile' | 'idle' | 'dead';

export interface DeathRecord {
  gameSeconds: number;
  /** La nuit en cours ou à venir (le cycle jour-nuit) ; 0 avant la mairie. */
  night: number;
  cause: NeedId;
  /** De soif, alors qu'un puits avait de l'eau dans son coffre : ce qui ne devrait jamais arriver. */
  wellHadWater: boolean;
}

export interface WaveRecord {
  night: number;
  /** Assaillants sortis cette nuit-là, toutes vagues confondues. */
  count: number;
  /** PV de la mairie à l'aube (0 si elle est tombée), et son maximum. */
  hallHp: number;
  hallMaxHp: number;
}

export interface PlaytestReport {
  seed: number;
  strategy: Strategy;
  /** Temps de jeu simulé, en secondes ; plus court que demandé si la mairie est tombée. */
  gameSeconds: number;
  wallMs: number;
  milestones: {
    townHall: Milestone | null;
    /** Un par chapitre fini, dans l'ordre : `index` 0 est « Le premier toit ». */
    chapters: (Milestone & { index: number })[];
    eve: Milestone | null;
    firstBirth: Milestone | null;
  };
  /** Le début de chaque nuit (le crépuscule), en secondes de jeu, par numéro de nuit. */
  nights: Record<number, number>;
  deaths: {
    total: number;
    byCause: Partial<Record<NeedId, number>>;
    /** Par nuit, puis par cause. */
    byNight: Record<number, Partial<Record<NeedId, number>>>;
    list: DeathRecord[];
  };
  waves: WaveRecord[];
  /** Fois où Adam est tombé (il se relève à la mairie). */
  playerKnockouts: number;
  /** Secondes de jeu par activité du bot. */
  activity: Record<Activity, number>;
  /** Secondes passées sans rien qu'un objectif demande (`idle` + `stockpile`), après la mairie. */
  idleSeconds: number;
  /** La nuit où la mairie est tombée, ou `null`. */
  fallNight: number | null;
  final: {
    chapter: number;
    nightsSurvived: number;
    colonists: number;
    workers: number;
    children: number;
    buildings: number;
  };
}

/** Le bot réfléchit tous les `THINK_TICKS` ; entre deux, il suit son chemin. */
const THINK_TICKS = 10;
/** Un but abandonné ne se revise pas avant une minute de jeu. */
const GIVE_UP_TICKS = 60 * TICKS_PER_SECOND;
/** Une case du chemin se traverse en 5 ticks : sans en atteindre une en `STUCK_TICKS`, il est coincé. */
const STUCK_TICKS = 40;
/** Chemins recalculés pour un même but avant d'y renoncer. */
const MAX_FAILS = 4;
/** Le centre d'une case est atteint à cette distance, en pixels monde. */
const ARRIVED_PX = 3;
/** Hauteur, depuis le haut de la case, où la boîte d'Adam passe au-dessus d'un tronc. */
const TRUNK_ROW_PX = 12;
/** En deçà, l'axe du joystick raccourcit le pas pour ne pas dépasser le centre. */
const SLOW_PX = 10;
/** Au-delà de ce remplissage du sac, après la mairie, il va déposer en ville. */
const BAG_DEPOSIT = 48;
/** Ce qu'il récolte en réserve pour la ville quand aucun objectif ne demande rien. */
const STOCKPILE = 40;
/** Rayon de fouille des ressources autour d'Adam, en tuiles. */
const SEARCH_TILES = 40;
/** Rayon de recherche d'une place autour de la mairie, en tuiles, au-delà du rayon logistique. */
const PLACE_TILES = 24;
/** Jusqu'où chercher une rive pour le puits : la prairie de départ (30 tuiles), et sa lisière. */
const SHORE_TILES = 34;
/** Une rive visitée couvre ses voisines à cette distance (en tuiles, de Manhattan). */
const SHORE_SEEN_TILES = 10;
/** Le butin au sol qu'il va ramasser, à cette distance de la mairie au plus. */
const LOOT_TILES = 14;
/** Marge du cadre de recherche de chemin autour du départ et de l'arrivée, en tuiles. */
const PATH_MARGIN = 16;
/** Ce que la proximité récolte : arbres et rochers. */
const HARVESTABLE: ReadonlySet<ItemId> = new Set(['wood', 'stone', 'ironOre', 'coal']);

interface Tile {
  tx: number;
  ty: number;
}

/** Ce que le bot veut faire : aller sur une case qui vérifie `goal`, puis `act`. */
interface Intent {
  activity: Activity;
  /** Change quand la destination change : le chemin se recalcule. */
  key: string;
  /** Une case du but, ou proche : le cadre de la recherche de chemin s'étend jusqu'à elle. */
  near: Tile;
  goal: (tx: number, ty: number) => boolean;
  /** Il faut le centre de la case : la récolte n'atteint qu'à 1,25 tuile. */
  precise?: boolean;
  /** Arrivé : les commandes à pousser (au plus une fois par réflexion). */
  act?: () => void;
}

/** Ce qu'un projet attend encore, objet par objet, que ni le sac ni la ville ni les porteurs n'apportent. */
type Shortfall = [ItemId, number][];

/** Un chantier ou un labo à pourvoir. */
interface Project {
  entity: Site | Lab;
  shortfall: Shortfall;
  /** Ce qu'il faut prendre à la mairie pour le porter : le projet est hors de son rayon. */
  fetch: Shortfall;
  /** Le sac a de quoi : il faut y aller. */
  deliverable: boolean;
}

/** Joue une partie et rend son rapport. */
export function playtest(options: PlaytestOptions): PlaytestReport {
  const bot = new PlaytestBot(World.newColony(options.seed), options);
  const { untilNight } = options;

  return bot.run(options.minutes * 60 * TICKS_PER_SECOND, untilNight === undefined ? undefined : (report) => report.nights[untilNight] !== undefined);
}

export class PlaytestBot {
  private readonly strategy: Strategy;
  private readonly now: () => number;
  private readonly start: number;
  private readonly report: PlaytestReport;

  private intent: Intent | null = null;
  private path: Tile[] = [];
  /** Le niveau de tolérance du chemin : 0 évite arbres et zones ennemies, 2 ne craint plus rien. */
  private pathLevel = 0;
  private lastAxis = { x: 0, y: 0 };
  /** Cases où il a buté pour le but en cours : le chemin suivant les contourne. */
  private avoid = new Set<string>();
  /** Ticks depuis la dernière case atteinte, et chemins recalculés pour le même but. */
  private stuck = 0;
  private fails = 0;
  private activity: Activity = 'idle';
  /** Ressource visée par la récolte, gardée jusqu'à ce qu'elle soit vide. */
  private harvest: (Tile & { item: ItemId }) | null = null;
  /** Cases qu'il n'a pas su atteindre, et jusqu'à quel tick il ne les vise plus. */
  private readonly unreachable = new Map<string, number>();
  /** Une intention de placement (ou d'exploration) trouvée en préparant les projets : elle passe devant. */
  private pending: Intent | null = null;
  /** Emprises refusées au placement. */
  private readonly badSpots = new Set<string>();
  private readonly waveCounts = new Map<number, number>();
  /** Rives déjà visitées en cherchant où poser un puits. */
  private readonly shores: Tile[] = [];

  public readonly world: World;

  public constructor(world: World, options: Pick<PlaytestOptions, 'seed' | 'strategy' | 'now'>) {
    this.world = world;
    this.strategy = options.strategy ?? 'base';
    this.now = options.now ?? (() => performance.now());
    this.start = this.now();
    this.report = emptyReport(options.seed, this.strategy);
    this.listen();
  }

  /** Déroule `ticks` ticks — moins si la mairie tombe, ou si `stop` le dit — et rend le rapport. */
  public run(ticks: number, stop?: (report: PlaytestReport) => boolean): PlaytestReport {
    for (let i = 0; i < ticks && !this.world.defeated && !stop?.(this.report); i += 1) this.step();
    return this.finish();
  }

  /** Un tick : réfléchir s'il le faut, marcher, puis laisser le monde avancer. */
  public step(): void {
    const { world } = this;

    if (world.tickCount % THINK_TICKS === 0) this.think();
    this.walk();
    world.tick();
    this.report.activity[this.activity] += 1;
  }

  /** Le rapport tel qu'il est maintenant : secondes et compteurs mis au propre. */
  public finish(): PlaytestReport {
    const { world, report } = this;
    const seconds = (ticks: number): number => Math.round(ticks / TICKS_PER_SECOND);

    for (const key of Object.keys(report.activity) as Activity[]) report.activity[key] = seconds(report.activity[key]);
    report.gameSeconds = seconds(world.tickCount);
    report.wallMs = Math.round(this.now() - this.start);
    report.idleSeconds = report.activity.idle + report.activity.stockpile;
    report.final = {
      chapter: world.chapter,
      nightsSurvived: world.stats.nightsSurvived,
      colonists: world.colonists,
      workers: world.population().workers,
      children: world.population().children,
      buildings: [...world.entities.values()].filter((entity) => entity.kind !== 'site').length,
    };
    return report;
  }

  /* ---------------------------------------------------------------- mesure */

  private listen(): void {
    const { world, report } = this;
    const mark = (): Milestone => ({
      gameSeconds: Math.round(world.tickCount / TICKS_PER_SECOND),
      wallMs: Math.round(this.now() - this.start),
    });
    const night = (): number => world.clock()?.cycle ?? 0;

    world.events.on('buildingCompleted', ({ id }) => {
      if (id === world.townHallId && !report.milestones.townHall) report.milestones.townHall = mark();
    });
    world.events.on('chapterCompleted', ({ index }) => report.milestones.chapters.push({ index, ...mark() }));
    world.events.on('eveArrived', () => (report.milestones.eve ??= mark()));
    world.events.on('childBorn', () => (report.milestones.firstBirth ??= mark()));
    world.events.on('duskFell', ({ night: n }) => (report.nights[n] = mark().gameSeconds));
    world.events.on('waveStarted', ({ night: n, count }) => this.waveCounts.set(n, (this.waveCounts.get(n) ?? 0) + count));
    world.events.on('dawnBroke', ({ night: n }) => this.recordWave(n));
    world.events.on('playerKnockedOut', () => (report.playerKnockouts += 1));
    world.events.on('townHallDestroyed', () => {
      report.fallNight = night();
      this.recordWave(night());
    });
    world.events.on('workerStarved', ({ need }) => {
      const at = night();
      const byNight = (report.deaths.byNight[at] ??= {});

      report.deaths.total += 1;
      report.deaths.byCause[need] = (report.deaths.byCause[need] ?? 0) + 1;
      byNight[need] = (byNight[need] ?? 0) + 1;
      report.deaths.list.push({ gameSeconds: mark().gameSeconds, night: at, cause: need, wellHadWater: need === 'thirst' && this.wellHasWater() });
    });
  }

  private recordWave(night: number): void {
    if (this.report.waves.some((wave) => wave.night === night)) return;

    const hall = this.world.entities.get(this.world.townHallId);
    const built = hall && hall.kind !== 'site' ? hall : null;

    this.report.waves.push({
      night,
      count: this.waveCounts.get(night) ?? 0,
      hallHp: built?.hp ?? 0,
      hallMaxHp: buildingLevel('townHall', built?.level ?? 1).hp,
    });
  }

  private wellHasWater(): boolean {
    for (const entity of this.world.entities.values()) {
      if (entity.kind !== 'site' && entity.proto === 'well' && entity.store.count('water') > 0) return true;
    }
    return false;
  }

  /* -------------------------------------------------------------- stratégie */

  private think(): void {
    const intent = this.decide();

    this.activity = intent?.activity ?? (this.world.respawnTicks > 0 ? 'dead' : 'idle');
    if (!intent) {
      this.intent = null;
      this.path = [];
      return;
    }
    if (intent.key !== this.intent?.key) {
      this.intent = intent;
      this.path = [];
      this.pathLevel = 0;
      this.stuck = 0;
      this.fails = 0;
      this.avoid = new Set();
      this.route();
    } else {
      // Même but : on garde le chemin, mais l'action (et le test d'arrivée) peut avoir changé.
      this.intent = intent;
    }

    const here = this.tile();

    if (!intent.goal(here.tx, here.ty)) return;
    // Arrivé, mais poussé hors du centre (un tronc, un arbre abattu sous ses pieds) : on s'y recale.
    if (intent.precise && this.path.length === 0 && !this.centered()) this.path = [here];
    intent.act?.();
  }

  private centered(): boolean {
    const { player } = this.world;
    const here = this.tile();

    return Math.hypot((here.tx + 0.5) * TILE_SIZE - player.x, (here.ty + 0.5) * TILE_SIZE - player.y) <= ARRIVED_PX;
  }

  private decide(): Intent | null {
    const { world } = this;

    if (world.respawnTicks > 0) return null;
    if (!world.warehouse()) {
      const hall = world.entities.get(world.townHallId);

      return hall?.kind === 'site' ? this.workOn(this.project(hall)) : null;
    }
    if (this.strategy === 'afk') return null;

    const phase = world.clock()?.phase;

    if (phase === 'dusk' || phase === 'night') return this.guard();
    if (world.player.inventory.total() >= BAG_DEPOSIT) return this.depositIntent('deliver');

    this.pending = null;

    const projects = this.projects();

    // Poser un chantier passe d'abord : une fois ouvert, porteurs et volontaires y portent aussi.
    if (this.pending) return this.pending;
    for (const project of projects) {
      const intent = this.workOn(project);

      if (intent) return intent;
    }
    return this.loot() ?? this.stockpile();
  }

  /** Les chantiers et labos que demandent les objectifs, dans l'ordre du panneau. */
  private projects(): Project[] {
    const projects: Project[] = [];

    for (const building of this.wantedBuildings()) {
      const project = this.prepare(building);

      if (project) projects.push(project);
    }
    // Un chantier ouvert qu'aucun objectif ne demande plus — posé pour un prérequis — s'achève quand même.
    for (const entity of this.world.entities.values()) {
      if (entity.kind === 'site' && !projects.some((project) => project.entity.id === entity.id)) projects.push(this.project(entity));
    }
    return projects;
  }

  /** Ce que les objectifs ouverts demandent de bâtir : leurs bâtiments, ceux qui produisent ce qu'ils comptent. */
  private wantedBuildings(): BuildingId[] {
    const { world } = this;
    const wanted: BuildingId[] = [];
    const add = (building: BuildingId, count: number): void => {
      if (!wanted.includes(building) && this.count(building, true) < count) wanted.push(building);
    };

    for (const objective of openObjectives(world)) {
      for (const goal of objective.goals) {
        if (goalProgress(world, goal).have >= goalProgress(world, goal).need) continue;

        if (goal.type === 'build') add(goal.building, goal.count);
        if (goal.type === 'produce') {
          const recipe = Object.values(RECIPES).find((entry) => (entry.outputs as Partial<Record<ItemId, number>>)[goal.item] !== undefined);

          if (recipe) add(recipe.building, 1);
        }
        if (goal.type === 'births') add('nursery', 1);
        if (goal.type === 'quests') {
          const quest = currentQuest(world.questsDone);

          if (quest) add(QUESTS[quest].goal.building, QUESTS[quest].goal.count);
        }
      }
    }
    return wanted;
  }

  /**
   * Le projet qui rapproche de ce bâtiment : son chantier s'il est ouvert, le
   * chantier qu'on pose, ou le labo et sa recherche. `null` s'il n'y a rien à
   * faire pour lui maintenant — une recherche qui tourne, un plan qu'on n'a pas.
   */
  private prepare(building: BuildingId): Project | null {
    const { world } = this;
    const site = this.siteOf(building);

    if (site) return this.project(site);
    if (world.inMenu(building)) {
      this.place(building);
      return null;
    }

    const research = this.researchFor(building);

    return research ? this.researchProject(research) : null;
  }

  /** La recherche à mener pour ouvrir ce bâtiment : la sienne, ou le premier prérequis qui manque. */
  private researchFor(building: BuildingId): ResearchId | null {
    const { world } = this;
    let research = openingResearch(building) ?? unlockingResearch(building);

    while (research) {
      const missing = missingRequirements(research, world.researchDone);

      if (missing.length === 0) break;
      research = missing[0]!;
    }
    if (!research || world.researchDone.includes(research) || !world.researchOpen(research)) return null;
    return research;
  }

  /** Combien de ce bâtiment debout — et de ses chantiers ouverts, avec `sites`. */
  private count(building: BuildingId, sites: boolean): number {
    let count = 0;

    for (const entity of this.world.entities.values()) {
      if (entity.proto === building && (sites || entity.kind !== 'site')) count += 1;
    }
    return count;
  }

  private siteOf(building: BuildingId): Site | null {
    for (const entity of this.world.entities.values()) {
      if (entity.kind === 'site' && entity.proto === building) return entity;
    }
    return null;
  }

  /** Le labo qui mène (ou mènera) cette recherche : posé, lancé ou mis en file s'il le faut. */
  private researchProject(research: ResearchId): Project | null {
    const { world } = this;
    const lab = world.labs()[0];

    if (!lab) {
      const site = this.siteOf('lab');

      if (site) return this.project(site);
      if (world.inMenu('lab')) this.place('lab');
      return null;
    }
    if (lab.research === research) return lab.endTick === 0 ? this.project(lab) : null;
    if (lab.queue.includes(research)) return null;
    // Le butin d'ennemis ne se récolte pas : on ne lance que si on l'a déjà.
    if (!this.affordsLoot(RESEARCH[research].cost)) return null;
    if (lab.research === null || (lab.endTick > 0 && !queueFull(lab))) {
      world.push({ type: 'startResearch', lab: lab.id, research });
    }
    return null;
  }

  private affordsLoot(cost: Partial<Record<ItemId, number>>): boolean {
    const town = this.world.townStock();

    return (Object.entries(cost) as [ItemId, number][]).every(
      ([item, amount]) => HARVESTABLE.has(item) || this.world.player.inventory.count(item) + (town?.available(item) ?? 0) >= amount,
    );
  }

  /** Ce que le chantier ou le labo attend encore, et que personne n'apporte. */
  private project(entity: Site | Lab): Project {
    const { world } = this;
    const lines: SiteLine[] = entity.kind === 'site' ? world.siteLedger(entity) : world.labLedger(entity);
    const inRange = entity.kind === 'site' ? world.inTownRange(entity) : world.labInTownRange(entity);
    const shortfall: Shortfall = [];
    let deliverable = false;

    const fetch: Shortfall = [];

    for (const line of lines) {
      const bag = world.player.inventory.count(line.item);
      const covered = line.incoming + (inRange ? (line.inTown ?? 0) : 0);
      const short = line.missing - covered - bag;
      // Hors du rayon de la mairie, la ville ne livre pas : Adam y prend ce qu'il faut et le porte.
      const fromTown = inRange ? 0 : Math.min(Math.max(0, short), line.inTown ?? 0);

      if (bag > 0 && line.missing - line.incoming > 0) deliverable = true;
      if (inRange && (line.inTown ?? 0) > 0 && line.missing - line.incoming > 0) deliverable = true;
      if (fromTown > 0) fetch.push([line.item, fromTown]);
      if (short - fromTown > 0) shortfall.push([line.item, short - fromTown]);
    }
    return { entity, shortfall, fetch, deliverable };
  }

  /** Récolter ce qui manque, ou livrer : ce que demande le projet maintenant, ou `null` s'il attend les autres. */
  private workOn(project: Project): Intent | null {
    const gather = project.shortfall.find(([item]) => HARVESTABLE.has(item));
    const bagFull = this.world.player.inventory.total() >= this.world.player.inventory.capacity;

    if (project.fetch.length > 0 && !bagFull) return this.fetchIntent(project.fetch);
    // Le sac a de quoi, et rien d'autre à aller chercher (ou plus de place) : on livre.
    if (project.deliverable && (!gather || bagFull)) return this.deliverIntent(project.entity);
    if (gather && !bagFull) return this.gatherIntent(gather[0], 'gather');
    return null;
  }

  private deliverIntent(entity: Site | Lab): Intent | null {
    const target = this.nearEntity(entity, 4);

    if (this.gaveUp(target.near)) return null;
    return {
      activity: 'deliver',
      key: `deliver:${entity.id}`,
      ...target,
      act: () => this.world.push(entity.kind === 'site' ? { type: 'transferToSite', id: entity.id } : { type: 'transferToLab', id: entity.id }),
    };
  }

  /** Prendre à la mairie, dans le sac, ce qu'un projet hors de son rayon attend. */
  private fetchIntent(fetch: Shortfall): Intent | null {
    const { world } = this;
    const hall = world.warehouse();

    if (!hall) return null;
    return {
      activity: 'deliver',
      key: 'fetch',
      ...this.nearEntity(hall, 4),
      act: () => {
        for (const [item, amount] of fetch) {
          for (let left = amount; left > 0; left -= left >= 10 ? 10 : 1) {
            world.push({ type: 'transferItems', id: hall.id, direction: 'take', quantity: left >= 10 ? 10 : 1, item });
          }
        }
      },
    };
  }

  /** Aller vider le sac à la mairie. */
  private depositIntent(activity: Activity): Intent | null {
    const hall = this.world.warehouse();

    if (!hall) return null;
    return {
      activity,
      key: 'deposit',
      ...this.nearEntity(hall, 4),
      act: () => this.world.push({ type: 'depositToTown' }),
    };
  }

  /** Le crépuscule et la nuit : près de la mairie, le sac vidé, ce qui est abîmé réparé. */
  private guard(): Intent | null {
    const { world } = this;
    const hall = world.warehouse();

    if (!hall) return null;
    return {
      activity: 'guard',
      key: 'guard',
      ...this.nearEntity(hall, 3),
      act: () => {
        if (world.player.inventory.total() > 0) world.push({ type: 'depositToTown' });
        for (const building of this.damaged()) {
          if (world.inReach(building)) world.push({ type: 'repairBuilding', id: building.id });
        }
      },
    };
  }

  private *damaged(): Iterable<Building> {
    for (const entity of this.world.entities.values()) {
      if (entity.kind !== 'site' && entity.hp < buildingLevel(entity.proto, entity.level).hp) yield entity;
    }
  }

  /** Le butin tombé près de la mairie : la gelée de mutant ouvre des recherches. */
  private loot(): Intent | null {
    const { world } = this;
    const hall = world.warehouse();

    if (!hall || world.player.inventory.total() >= world.player.inventory.capacity) return null;

    const cx = (hall.tx + hall.width / 2) * TILE_SIZE;
    const cy = (hall.ty + hall.height / 2) * TILE_SIZE;
    const reach = LOOT_TILES * TILE_SIZE;
    let best: Tile | null = null;
    let bestDistance = Infinity;

    for (const mobile of world.mobiles.values()) {
      if (mobile.kind !== 'pickup' || mobile.waitForLeave) continue;
      if ((mobile.x - cx) ** 2 + (mobile.y - cy) ** 2 > reach * reach) continue;

      const tile = { tx: floorDiv(mobile.x, TILE_SIZE), ty: floorDiv(mobile.y, TILE_SIZE) };
      const distance = (mobile.x - world.player.x) ** 2 + (mobile.y - world.player.y) ** 2;

      if (!this.gaveUp(tile) && distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
    if (!best) return null;

    const target = best;

    return { activity: 'loot', key: `loot:${keyOf(target)}`, near: target, goal: (tx, ty) => tx === target.tx && ty === target.ty };
  }

  /** Rien à faire pour les objectifs : du bois et de la pierre pour la ville, puis attendre près d'elle. */
  private stockpile(): Intent | null {
    const { world } = this;
    const town = world.townStock();

    if (!town) return null;

    const item = (['wood', 'stone'] as const)
      .filter((id) => !world.townHasPlenty(id) && town.count(id) < STOCKPILE)
      .sort((a, b) => town.count(a) - town.count(b))[0];

    if (item && world.player.inventory.total() < BAG_DEPOSIT) return this.gatherIntent(item, 'stockpile');
    if (world.player.inventory.total() > 0) return this.depositIntent('stockpile');
    return null;
  }

  /** Marcher jusqu'à la ressource de cet objet la plus proche et rester à côté le temps de la vider. */
  private gatherIntent(item: ItemId, activity: Activity): Intent | null {
    const { world } = this;
    let target = this.harvest;

    if (!target || target.item !== item || world.resources.at(target.tx, target.ty) === null || this.gaveUp(target)) {
      const found = this.nearestResource(item);

      target = found ? { ...found, item } : null;
      this.harvest = target;
    }
    if (!target) return null;

    const { tx: rx, ty: ry } = target;

    return {
      activity,
      key: `harvest:${rx},${ry}`,
      near: target,
      precise: true,
      // Une case voisine, d'où la récolte l'atteint — pas sous un arbre : son tronc empêche d'en gagner le centre.
      goal: (tx, ty) => Math.abs(tx - rx) + Math.abs(ty - ry) === 1 && !isTrunk(world, tx, ty),
    };
  }

  /** La tuile de ressource de cet objet la plus proche d'Adam, hors des zones ennemies. */
  private nearestResource(item: ItemId): Tile | null {
    const { world } = this;
    const here = this.tile();
    const rock = ROCK_OF_ORE[item];

    for (let r = 0; r <= SEARCH_TILES; r += 1) {
      let best: Tile | null = null;
      let bestDistance = Infinity;

      for (const { tx, ty } of ring(here, r)) {
        const resource = world.resources.at(tx, ty);

        if (!resource || (rock ? resource.id !== rock : RESOURCES[resource.id].item !== item)) continue;
        if (world.enemyZoneAt(tx, ty) || this.gaveUp({ tx, ty })) continue;

        const distance = (tx - here.tx) ** 2 + (ty - here.ty) ** 2;

        if (distance < bestDistance) {
          best = { tx, ty };
          bestDistance = distance;
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Pose le chantier au plus près de la mairie : marche jusqu'à portée, puis `placeBuilding`. */
  private place(building: BuildingId): void {
    const spot = this.spotFor(building);

    if (!spot) {
      // Pas de place connue : pour un puits, aller voir la rive la plus proche.
      if ((BUILDINGS[building] as BuildingProto).shore) this.pending ??= this.exploreWater();
      return;
    }

    const clutter = this.clutter(building, spot.tx, spot.ty);

    if (clutter.length > 0) {
      this.pending ??= this.clearIntent(clutter[0]!);
      return;
    }

    const proto: BuildingProto = BUILDINGS[building];
    const center = { x: (spot.tx + proto.width / 2) * TILE_SIZE, y: (spot.ty + proto.height / 2) * TILE_SIZE };
    const reach = (BUILD_REACH_TILES - 1) * TILE_SIZE;
    const { world } = this;

    this.pending ??= {
      activity: 'place',
      key: `place:${building}:${keyOf(spot)}`,
      near: spot,
      goal: (tx, ty) => {
        const x = (tx + 0.5) * TILE_SIZE;
        const y = (ty + 0.5) * TILE_SIZE;
        const inside = tx >= spot.tx - 1 && tx <= spot.tx + proto.width && ty >= spot.ty - 1 && ty <= spot.ty + proto.height;

        return !inside && (x - center.x) ** 2 + (y - center.y) ** 2 <= reach * reach;
      },
      act: () => {
        const rejection = world.canPlace(building, spot.tx, spot.ty);

        if (rejection === null) world.push({ type: 'placeBuilding', building, tx: spot.tx, ty: spot.ty });
        else this.badSpots.add(`${building}:${keyOf(spot)}`);
      },
    };
  }

  /** Récolter l'arbre ou le rocher qui encombre une emprise — après avoir vidé le sac, s'il n'en prend plus. */
  private clearIntent(tile: Tile): Intent | null {
    const { world } = this;
    const resource = world.resources.at(tile.tx, tile.ty);

    if (!resource) return null;

    const item = RESOURCES[resource.id].item;

    if (world.player.inventory.count(item) >= world.carryLimit(item) || world.player.inventory.freeSpace() <= 0) return this.depositIntent('place');
    return {
      activity: 'place',
      key: `clear:${keyOf(tile)}`,
      near: tile,
      precise: true,
      goal: (tx, ty) => Math.abs(tx - tile.tx) + Math.abs(ty - tile.ty) === 1 && !isTrunk(world, tx, ty),
    };
  }

  /**
   * La place la plus proche de la mairie : légale (Adam mis à part), entourée
   * d'une allée libre. À défaut, une place qu'encombrent un arbre ou un rocher,
   * qu'on récoltera d'abord — une rive boisée reste une rive.
   */
  private spotFor(building: BuildingId): Tile | null {
    return this.searchSpot(building, false) ?? this.searchSpot(building, true);
  }

  private searchSpot(building: BuildingId, cluttered: boolean): Tile | null {
    const { world } = this;
    const hall = world.warehouse();

    if (!hall) return null;

    const proto: BuildingProto = BUILDINGS[building];
    const cx = hall.tx + Math.floor(hall.width / 2);
    const cy = hall.ty + Math.floor(hall.height / 2);
    // Un puits va jusqu'à la rive, même loin de la mairie.
    const radius = proto.shore ? SHORE_TILES : PLACE_TILES;
    const accepted = (rejection: PlacementRejection | null, x: number, y: number): boolean => {
      if (rejection === null || rejection === 'outOfReach') return true;
      if (rejection === 'onPlayer') return this.legalPastPlayer(building, x, y);
      return cluttered && rejection === 'resource' && this.clutter(building, x, y).length > 0 && this.legalPastPlayer(building, x, y);
    };

    for (let r = 2; r <= radius; r += 1) {
      for (const { tx, ty } of ring({ tx: cx, ty: cy }, r)) {
        const x = tx - Math.floor(proto.width / 2);
        const y = ty - Math.floor(proto.height / 2);

        if (this.badSpots.has(`${building}:${keyOf({ tx: x, ty: y })}`)) continue;
        if (!accepted(world.canPlace(building, x, y), x, y)) continue;
        // Une allée d'une case autour : ni bâtiment ni chantier qui s'y colle, pour que personne ne s'emmure.
        if (!world.chunks.isFree(x - 1, y - 1, proto.width + 2, proto.height + 2)) continue;
        return { tx: x, ty: y };
      }
    }
    return null;
  }

  /** Les arbres et rochers de l'emprise ; vide si ce qui l'encombre ne se récolte pas (une pousse, une culture). */
  private clutter(building: BuildingId, tx: number, ty: number): Tile[] {
    const { world } = this;
    const proto: BuildingProto = BUILDINGS[building];
    const tiles: Tile[] = [];

    for (let y = ty; y < ty + proto.height; y += 1) {
      for (let x = tx; x < tx + proto.width; x += 1) {
        if (world.resources.at(x, y)) tiles.push({ tx: x, ty: y });
        else if (world.resources.isTaken(x, y)) return [];
      }
    }
    return tiles;
  }

  /**
   * Adam est sur l'emprise : `canPlace` s'arrête à « onPlayer », avant les
   * règles qui suivent. On les relit ici, sans quoi Adam ferait l'aller-retour
   * entre deux places qui ne valent que lorsqu'il est dessus.
   */
  private legalPastPlayer(building: BuildingId, tx: number, ty: number): boolean {
    const { world } = this;
    const proto: BuildingProto = BUILDINGS[building];

    for (let y = ty; y < ty + proto.height; y += 1) {
      for (let x = tx; x < tx + proto.width; x += 1) if (world.enemyZoneAt(x, y)) return false;
    }
    if (proto.shore && !touchesWater(world.seed, tx, ty, proto.width, proto.height)) return false;
    if (proto.hallDistance !== undefined && world.nearHall(proto.hallDistance, tx, ty, proto.width, proto.height)) return false;
    return !world.atLimit(building);
  }

  /** La rive la plus proche de la mairie : y aller révèle de quoi poser un puits. */
  private exploreWater(): Intent | null {
    const hall = this.world.warehouse();

    if (!hall) return null;

    const center = { tx: hall.tx + 1, ty: hall.ty + 1 };

    for (let r = 2; r <= SHORE_TILES; r += 1) {
      for (const tile of ring(center, r)) {
        if (isWalkable(terrainAt(this.world.seed, tile.tx, tile.ty)) || this.gaveUp(tile)) continue;
        // Une rive où l'on ne bâtit pas — la zone d'une base — ou déjà vue de près : la suivante.
        if (this.world.enemyZoneAt(tile.tx, tile.ty)) continue;
        if (this.shores.some((seen) => Math.abs(seen.tx - tile.tx) + Math.abs(seen.ty - tile.ty) <= SHORE_SEEN_TILES)) continue;
        return {
          activity: 'place',
          key: `explore:${keyOf(tile)}`,
          near: tile,
          goal: (tx, ty) => Math.abs(tx - tile.tx) + Math.abs(ty - tile.ty) <= 3,
          // Arrivé sans trouver de place : la prochaine fois, une autre rive.
          act: () => this.shores.push(tile),
        };
      }
    }
    return null;
  }

  /* -------------------------------------------------------------- marche */

  /** Le but : une case à moins de `tiles` tuiles du centre de l'emprise, hors d'elle. */
  private nearEntity(entity: Entity, tiles: number): Pick<Intent, 'near' | 'goal'> {
    const cx = entity.tx + entity.width / 2;
    const cy = entity.ty + entity.height / 2;

    return {
      near: { tx: Math.floor(cx), ty: entity.ty + entity.height },
      goal: (tx, ty) => {
        const inside = tx >= entity.tx && tx < entity.tx + entity.width && ty >= entity.ty && ty < entity.ty + entity.height;

        return !inside && (tx + 0.5 - cx) ** 2 + (ty + 0.5 - cy) ** 2 <= tiles * tiles;
      },
    };
  }

  /** A-t-il renoncé à cette case il y a moins de `GIVE_UP_TICKS` ? */
  private gaveUp(tile: Tile): boolean {
    return (this.unreachable.get(keyOf(tile)) ?? 0) > this.world.tickCount;
  }

  private tile(): Tile {
    return { tx: floorDiv(this.world.player.x, TILE_SIZE), ty: floorDiv(this.world.player.y, TILE_SIZE) };
  }

  /** Calcule le chemin vers le but, au niveau de tolérance courant ; sans chemin, monte d'un cran. */
  private route(): void {
    const intent = this.intent;

    if (!intent) return;
    for (; this.pathLevel <= 2; this.pathLevel += 1) {
      const path = findPath(this.world, this.tile(), intent, this.pathLevel, this.avoid);

      if (path) {
        this.path = path;
        return;
      }
    }
    this.giveUp();
  }

  /** Le but est hors d'atteinte : on l'oublie, et la prochaine réflexion en choisira un autre. */
  private giveUp(): void {
    const intent = this.intent;

    if (!intent) return;
    this.unreachable.set(keyOf(intent.near), this.world.tickCount + GIVE_UP_TICKS);
    if (intent.key.startsWith('place:')) this.badSpots.add(intent.key.slice('place:'.length));
    if (this.harvest && keyOf(this.harvest) === keyOf(intent.near)) this.harvest = null;
    this.intent = null;
    this.path = [];
  }

  /** Suit le chemin d'un pas : l'axe du joystick vers le centre de la case suivante, ralenti à l'approche. */
  private walk(): void {
    const { world } = this;
    const { player } = world;
    let axis = { x: 0, y: 0 };

    while (this.path.length > 0) {
      const next = this.path[0]!;
      const target = waypoint(world, this.tile(), next);
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const length = Math.hypot(dx, dy);

      if (length <= ARRIVED_PX) {
        this.path.shift();
        this.stuck = 0;
        continue;
      }

      // Pleine vitesse, un pas fait plus de 7 pixels : près du but, l'axe analogique raccourcit le pas.
      const magnitude = Math.min(1, length / SLOW_PX);

      axis = { x: (dx / length) * magnitude, y: (dy / length) * magnitude };
      break;
    }
    if (axis.x !== this.lastAxis.x || axis.y !== this.lastAxis.y) {
      world.push({ type: 'setMoveAxis', x: axis.x, y: axis.y });
      this.lastAxis = axis;
    }
    if (this.path.length > 0) this.watchStuck();
  }

  /** Une case du chemin qui ne vient pas en `STUCK_TICKS` : un chemin moins regardant, puis on abandonne. */
  private watchStuck(): void {
    this.stuck += 1;
    if (this.stuck < STUCK_TICKS) return;
    this.stuck = 0;
    this.fails += 1;
    if (this.fails > MAX_FAILS) {
      this.giveUp();
      return;
    }
    // La case où il bute est peut-être franchissable pour la carte, pas pour sa boîte : on la contourne.
    const next = this.path[0];

    if (next) this.avoid.add(keyOf(next));
    this.pathLevel = Math.min(2, this.pathLevel + 1);
    this.route();
  }
}

/* ------------------------------------------------------------------ outils */

function emptyReport(seed: number, strategy: Strategy): PlaytestReport {
  return {
    seed,
    strategy,
    gameSeconds: 0,
    wallMs: 0,
    milestones: { townHall: null, chapters: [], eve: null, firstBirth: null },
    nights: {},
    deaths: { total: 0, byCause: {}, byNight: {}, list: [] },
    waves: [],
    playerKnockouts: 0,
    activity: { gather: 0, deliver: 0, place: 0, guard: 0, loot: 0, stockpile: 0, idle: 0, dead: 0 },
    idleSeconds: 0,
    fallNight: null,
    final: { chapter: 0, nightsSurvived: 0, colonists: 0, workers: 0, children: 0, buildings: 0 },
  };
}

function keyOf(tile: Tile): string {
  return `${tile.tx},${tile.ty}`;
}

/** Les cases à distance de Tchebychev `r` de `center`, en anneau. */
function* ring(center: Tile, r: number): Iterable<Tile> {
  if (r === 0) {
    yield center;
    return;
  }
  for (let d = -r; d <= r; d += 1) {
    yield { tx: center.tx + d, ty: center.ty - r };
    yield { tx: center.tx + d, ty: center.ty + r };
  }
  for (let d = -r + 1; d <= r - 1; d += 1) {
    yield { tx: center.tx - r, ty: center.ty + d };
    yield { tx: center.tx + r, ty: center.ty + d };
  }
}

/**
 * Un chemin en largeur, quatre voisins, de `from` à la première case du but —
 * dans un cadre autour des deux. Niveau 0 : ni arbre ni zone ennemie ; 1 : les
 * arbres passent (Adam glisse autour du tronc) ; 2 : les zones aussi. L'eau, le
 * bâti, les rochers et les bases ne passent jamais, ni les cases `avoid`.
 */
function findPath(world: World, from: Tile, intent: Intent, level: number, avoid: ReadonlySet<string>): Tile[] | null {
  const minX = Math.min(from.tx, intent.near.tx) - PATH_MARGIN;
  const minY = Math.min(from.ty, intent.near.ty) - PATH_MARGIN;
  const width = Math.max(from.tx, intent.near.tx) + PATH_MARGIN - minX + 1;
  const height = Math.max(from.ty, intent.near.ty) + PATH_MARGIN - minY + 1;
  const previous = new Int32Array(width * height).fill(-1);
  const index = (tx: number, ty: number): number => (ty - minY) * width + (tx - minX);
  const passable = (tx: number, ty: number): boolean => {
    if (avoid.has(`${tx},${ty}`)) return false;
    if (!isWalkable(terrainAt(world.seed, tx, ty)) || world.chunks.occupantAt(tx, ty) !== undefined || world.enemyBaseAt(tx, ty)) return false;

    if (world.resources.at(tx, ty) && (level === 0 || !isTrunk(world, tx, ty))) return false;
    return level >= 2 || world.enemyZoneAt(tx, ty) === null;
  };
  const queue = [index(from.tx, from.ty)];

  previous[queue[0]!] = queue[0]!;
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head]!;
    const tx = minX + (at % width);
    const ty = minY + Math.floor(at / width);

    if (intent.goal(tx, ty)) {
      const path: Tile[] = [];

      for (let step = at; step !== previous[step]; step = previous[step]!) {
        path.push({ tx: minX + (step % width), ty: minY + Math.floor(step / width) });
      }
      // Déjà sur le but : au centre de sa case, d'où la récolte (1,25 tuile) atteint les quatre voisines.
      return path.length > 0 ? path.reverse() : [from];
    }
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = tx + dx;
      const ny = ty + dy;

      if (nx < minX || ny < minY || nx >= minX + width || ny >= minY + height) continue;

      const next = index(nx, ny);

      if (previous[next] !== -1 || !passable(nx, ny)) continue;
      previous[next] = at;
      queue.push(next);
    }
  }
  return null;
}

/**
 * Le point visé dans la case suivante. Le centre, sauf près d'un arbre : son
 * tronc (bas de la case, au milieu) arrête la boîte d'Adam (20 × 14). On passe
 * alors à l'horizontale par le haut de la case, à la verticale à cheval sur la
 * colonne voisine qui est libre.
 */
function waypoint(world: World, here: Tile, next: Tile): { x: number; y: number } {
  const left = next.tx * TILE_SIZE;
  const top = next.ty * TILE_SIZE;
  const center = { x: left + TILE_SIZE / 2, y: top + TILE_SIZE / 2 };

  if (!isTrunk(world, here.tx, here.ty) && !isTrunk(world, next.tx, next.ty)) return center;
  if (next.ty === here.ty) return { x: center.x, y: top + TRUNK_ROW_PX };
  if (next.tx !== here.tx) return center;

  const free = (tx: number): boolean => !isHardSolid(world, tx, here.ty) && !isHardSolid(world, tx, next.ty);

  if (free(next.tx + 1)) return { x: left + TILE_SIZE - 1, y: center.y };
  if (free(next.tx - 1)) return { x: left + 1, y: center.y };
  return center;
}

/** Ce qui arrête Adam sur toute la case : l'eau, le bâti, un rocher, une base. */
function isHardSolid(world: World, tx: number, ty: number): boolean {
  return world.isSolid(tx, ty) && !isTrunk(world, tx, ty);
}

/** Un arbre : seul son tronc arrête Adam. */
function isTrunk(world: World, tx: number, ty: number): boolean {
  const resource = world.resources.at(tx, ty);

  return resource !== null && RESOURCES[resource.id].hitbox === 'trunk';
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
