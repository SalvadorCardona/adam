/**
 * Le monde : tout l'état de jeu, et le seul endroit qui le modifie.
 *
 * `World` n'importe ni Pixi, ni le DOM, ni rien de `render/` ou `ui/`. Un test
 * Vitest fait `new World(1234)` puis `world.tick()` en boucle, sans canvas.
 * ESLint fait respecter la frontière, pas la discipline.
 *
 * L'extérieur ne touche jamais l'état directement : il pousse une commande
 * avec `push()`, et le tick suivant la consomme. Une partie se résume donc à
 * une seed et à une liste de commandes horodatées. Le PRNG des vagues et des
 * enfants vit ici et n'avance qu'au tick : il fait partie de cette promesse.
 *
 * Le pitch tient dans `data/lore.ts` ; ce qu'il implique ici : la partie
 * commence sur le chantier de la mairie, et Adam récolte à mains nues, par
 * **contact** — un arbre ou un rocher heurté se récolte, un chantier heurté
 * reçoit ce qu'il attend, une foreuse ou une ferme heurtée donne ce que son
 * coffre contient, une nurserie ou une forge heurtée reçoit ce que sa recette
 * consomme, la mairie finie heurtée reçoit tout le sac dans le stock de la
 * ville. Une fois la mairie debout, le jour et la nuit
 * alternent (`sim/dayNight.ts`) : on bâtit le jour, et la nuit les mutants
 * arrivent par vagues et marchent droit dessus ; l'arc d'Adam et les tours de
 * guet tirent seuls. À l'aube, les survivants fuient et le butin tombe. Si la mairie tombe, la partie est perdue. Loin du village, la faune
 * — crabes sur les plages, loups en forêt — s'en prend à Adam s'il approche.
 * Après la troisième vague repoussée, Ève arrive : elle vit à la mairie,
 * répare le bâti entre les vagues et donne les quêtes (`sim/eve.ts`).
 * À partir du quatrième jour, un jour sur deux, une caravane de troc se gare
 * au bord de la clairière et échange les surplus de la ville (`sim/caravan.ts`).
 * Les ouvriers de la maison des constructeurs portent : ils vident foreuses,
 * fermes et cabanes de bûcheron dans la mairie, et livrent les chantiers
 * depuis la mairie. Les bûcherons coupent seuls les arbres autour de leur
 * cabane. Sans rien à faire, un ouvrier flâne devant chez lui, et n'y rentre
 * que pour dormir, la nuit, ou s'abriter d'une vague.
 * Une clinique change le sort des mutants vaincus : certains tombent
 * assommés, suivent Adam qui les touche jusqu'à elle, et en ressortent
 * ex-mutants — des porteurs de plus (`data/clinic.ts`).
 * Et le temps change : pluie acide, coup de vent, brouillard, arc-en-ciel,
 * lus dans la seed (`sim/weather.ts`) ; le monde n'en garde rien.
 *
 * La partie suit des chapitres d'objectifs (`data/objectives.ts`), plusieurs
 * objectifs ouverts à la fois : la mairie d'abord, puis les fondations, les
 * nuits, les demandes d'Ève, la nourriture, l'industrie, une ville où l'on
 * veut vivre, cinq nuits à tenir — la fin de l'acte I. L'acte II est l'Antenne :
 * trois étages livrés l'un après l'autre, chacun attirant toutes les vagues
 * de la nuit suivante. Le dernier lance le Signal : c'est la victoire, et la
 * partie continue sans fin, des survivants arrivant à chaque aube.
 */

import { Emitter } from '../core/events.ts';
import { CHUNK_SIZE, CHUNK_TILES, TILE_SIZE, coordKey, distanceSq, floorDiv, type TileCoord } from '../core/grid.ts';
import { hash3, mulberry32, type StatefulRng } from '../core/rng.ts';
import { BUILDINGS, BUILDING_IDS, MENU_BUILDING_IDS, START_BUILDINGS, REPAIR, RUIN, bedsOf, buildingLevel, nextUpgrade, speedOf, type BuildingId, type BuildingKind, type BuildingProto } from '../data/buildings.ts';
import { CARAVAN, RARE_OFFERS, type RareOfferId } from '../data/caravan.ts';
import { CLINIC } from '../data/clinic.ts';
import { DEATH } from '../data/death.ts';
import { COMPANIONS, COMPANION_CLASSES, type CompanionClassId } from '../data/companions.ts';
import { PIGS, PIG_FARM } from '../data/pigs.ts';
import { DAWN_REWARD, DAY_CYCLE, SURVIVORS } from '../data/dayNight.ts';
import { BOON_OFFER, BOONS, type BoonId } from '../data/boons.ts';
import { boonBonus, drawBoons } from './boons.ts';
import { CHALLENGES, type ChallengeId, type ChallengeStat } from '../data/challenges.ts';
import { drawChallenge, type DailyChallenge } from './challenges.ts';
import {
  CHIEF,
  ENEMIES,
  ENEMY_IDS,
  LOOT_DROPS,
  QUEEN,
  WAVES,
  WAVE_WARNING,
  WILDLIFE,
  WILDLIFE_SPAWN,
  isBossNight,
  isQueenNight,
  nightBosses,
  queenWave,
  type EnemyId,
  type LootTable,
} from '../data/enemies.ts';
import { ENEMY_BASE, FIREBALL, GUARD_RANGE, RAIDS, enemyBaseLevel } from '../data/enemyBases.ts';
import { EVE } from '../data/eve.ts';
import { FOG_VISION } from '../data/fog.ts';
import { GEAR_WORKSHOP, MAX_GEAR, gearOf } from '../data/gear.ts';
import { PIECES, WARDROBE_SPARE, copyLook, isStarter, sameLook, wardrobeDrop, type Look, type LootSource, type PieceId } from '../data/wardrobe.ts';
import { drawPieces, lookRejection, type LookRejection } from './wardrobe.ts';
import { CHESTS } from '../data/chests.ts';
import { PURIFIER } from '../data/contamination.ts';
import { chestOfChunk, type Chest } from './chests.ts';
import { DISCOVERIES, type DiscoveryKind, type RuinReward } from '../data/discoveries.ts';
import { rollDiscoveryLoot, rollRuinReward, spotOfChunk, tierAt, type Spot, type SpotKind } from './discoveries.ts';
import { HOUSING } from '../data/housing.ts';
import { REACTIONS, type ReactionId, type TraitId } from '../data/traits.ts';
import { AGES, COLONY, NURSERY_CARE } from '../data/inhabitants.ts';
import { TOWN_PLENTY, type ItemId } from '../data/items.ts';
import { HUNTING, NEED_ALERT, NEED_IDS, NEEDS, type NeedId } from '../data/needs.ts';
import { LEVEL_GAINS, MAX_LEVEL, type Shooter } from '../data/levels.ts';
import { BUILD_PRESTIGE, KILL_PRESTIGE } from '../data/prestige.ts';
import { PROBLEMS, type ProblemId } from '../data/problems.ts';
import {
  PERKS,
  bagBonus,
  freeSites,
  harvestYieldWith,
  startingItems,
  type ColonyScore,
  type PerkId,
} from '../data/perks.ts';
import { CHAPTERS, objectiveBagBonus, type ChapterProto, type ObjectiveId, type Reward } from '../data/objectives.ts';
import { OFFLINE, OFFLINE_ALERTS, type OfflineAlertId } from '../data/offline.ts';
import type { QuestId } from '../data/quests.ts';
import { RECIPES, recipeOf, type RecipeId, type RecipeProto } from '../data/recipes.ts';
import { ERAS, type EraProto } from '../data/eras.ts';
import { RESEARCH, isResearchId, type ResearchId, type ResearchStat } from '../data/research.ts';
import { CROPS, RESOURCES, SAPLING, type ResourceId } from '../data/resources.ts';
import { WEAPONS } from '../data/weapons.ts';
import { baseXp, killXp, levelBonus, levelHp, levelOf, sharedXp } from './levels.ts';
import { BUILDERS, FARMERS, FORESTERS, IDLE, JOB_PRIORITY, LUMBERJACKS, PORTERS, WORK_PRIORITY, type WorkPriority } from '../data/workers.ts';
import { WEATHER, WEATHER_CALENDAR, type WeatherId } from '../data/weather.ts';
import { ChunkIndex } from './chunk.ts';
import { floorCost, floorMissing, floorNeeds, floorWants } from './antenna.ts';
import { consumerRecipe, consumerRoom, consumerWants, forgeRecipe, isConsumer, isStarving } from './consumers.ts';
import { createCompanion, stepCompanion } from './companions.ts';
import { NO_WIND, fireball, isTargetable, nearestFoe, shoot, spit, stepArrow, stepSpit, type Wind } from './combat.ts';
import { clockAt, CYCLE_TICKS, dayDial, nextWave, ticksToDawn, ticksToWave, waveAt, type DayClock, type DayDial } from './dayNight.ts';
import type {
  Command,
  CommandLogEntry,
  DepositRejection,
  EraRejection,
  GearRejection,
  PlacementRejection,
  RecruitRejection,
  RepairRejection,
  ResearchRejection,
  SiteRejection,
  SupplyRejection,
  TakeRejection,
  TradeRejection,
  TransferRejection,
  UpgradeRejection,
} from './commands.ts';
import { caravanBagBonus, caravanRoute, createCaravan, drawOffers, isCaravanDay, rideTo, tradeCost } from './caravan.ts';
import type { WildlifeId } from '../data/enemies.ts';
import { baseCenter, baseDoor, breed, canDamage, hitsBase, inBaseZone, isShielded, isStanding, onBase, placeEnemyBases } from './enemyBases.ts';
import { waveEraOf, earlyCap, projectedRaiders, reinforcements, waveBounty } from './waves.ts';
import { compassOf, stepMutant, stepQueen, surfacePoint, type Compass, type MutantStep } from './enemies.ts';
import { BIOMES, REGION_GUARDIAN, REGION_RINGS, type BiomeId } from '../data/regions.ts';
import { HOME_REGION_ID, REGION_COUNT, placeRegions, regionAt, type Region } from './regions.ts';
import { createEve, currentQuest, harvestYieldWithTools, isUnlocked, mostDamaged, questProgress, rideHome, walkTo } from './eve.ts';
import { ADAM_SALT, adultAge, bornTrait, canWork, cleanName, foeAge, nameOf, pickName, sexOf, traitOf, yearsToWork } from './inhabitants.ts';
import { KID_SPRINT, stepKid } from './kids.ts';
import { drainNeeds, stuntingNeed, freshNeeds, needState, needsPace, pacedTick, urgentNeed, type Needs } from './needs.ts';
import { decorMoodAt, type DecorSpot } from './decor.ts';
import { assignBeds, freshHousing, moodCauses, nightlyMood, moodOf, type Lodging } from './housing.ts';
import { rollLoot, stepPickup } from './loot.ts';
import { chapterObjectives, copyStats, emptyStats, objectiveDone } from './objectives.ts';
import { eraReady, nextEra, withEraThreat } from './eras.ts';
import { denSize, densOfChunk, stepBeast, type Den } from './wildlife.ts';
import { pigSpotsOfChunk, stepPig as stepPigBody, type PigSpot } from './pigs.ts';
import { FULL_TILE, blockingTile, facingOf, type TileBox } from './motion.ts';
import {
  BUILD_REACH_TILES,
  INVENTORY_CAPACITY,
  PLAYER_CALM_TICKS,
  PLAYER_MAX_HP,
  PLAYER_REGEN_TICKS,
  PLAYER_SPEED_TILES,
  SPARE_CARRY,
  createPlayer,
  playerOverlaps,
  stepPlayer,
} from './player.ts';
import {
  JobBoard,
  PORTER_CREW,
  doorOf,
  inDepotRange,
  inYardRange,
  isProducer,
  siteWork,
  yardWorks,
  type Crew,
  type LineTest,
} from './jobs.ts';
import {
  extraUnits,
  isCollecting,
  labMissing,
  labNeeds,
  labSurplus,
  labWants,
  missingRequirements,
  researchBonus,
  queueFull,
  researchCost,
  researchHolder,
  openingResearch,
  unlockingResearch,
} from './research.ts';
import { TownFlows } from './flows.ts';
import { count, countedMs, feedNeed, mealsPerTick, wholeUnits, type OfflineReport } from './offline.ts';
import { ResourceIndex, type TileLook } from './resources.ts';
import { FogOfWar, type Sight } from './fog.ts';
import { Land } from './contamination.ts';
import type { SavedEntity, SavedPartner, SavedPlayer, WorldState } from './save.ts';
import { PARTNER_LOOK, partnerName, type Partner } from './partner.ts';
import { Scheduler } from './scheduler.ts';
import { Store } from './store.ts';
import { ProblemWatch, type ProblemFacts } from './problems.ts';
import { transferAllPlan, transferAmount, type TransferDirection, type TransferQuantity, type TransferRules } from './transfer.ts';
import { footingAt, type Footing } from './footing.ts';
import { findSpawn, habitatAt, isBuildable, isWalkable, oreAt, terrainAt, touchesWater } from './terrain.ts';
import { inLogisticRange, pointInLogisticRange } from './warehouse.ts';
import { chopSpot, isTree, pickTree, treesInRange } from './lumberjacks.ts';
import { plantSpot, plotTiles, type PlotTile } from './forester.ts';
import { fieldTiles, type FieldState, type FieldTile } from './farmer.ts';
import { labLedger, siteLedger, type SiteLine } from './siteLedger.ts';
import { allocateStaff, canPause, clampStaff, employs, isWorkPriority, type StaffDemand, type StaffPost, type Staffing } from './staffing.ts';
import { carryOf, clearLine, standStill, walkToward, wander, wanderFrom } from './workers.ts';
import { nextWeather, spoilsNight, weatherAt, type WeatherSpell } from './weather.ts';
import type {
  Antenna,
  Beast,
  Born,
  Building,
  Caravan,
  Clinic,
  Companion,
  Contact,
  Depot,
  Drill,
  Entity,
  EnemyBase,
  Eve,
  EntityId,
  Farm,
  Farmer,
  FarmerState,
  Quarry,
  Foe,
  Forester,
  ForesterHouse,
  Forge,
  House,
  Job,
  Kid,
  Lab,
  LumberCamp,
  Lumberjack,
  Mobile,
  MobileId,
  Mutant,
  Nursery,
  Patient,
  Pig,
  PigPen,
  Pickup,
  Player,
  Site,
  Tower,
  TownHall,
  TradeOffer,
  Worker,
  Yard,
  WorldStats,
} from './types.ts';

/** Ce qui remplit un coffre qu'Adam vient vider : foreuse, ferme, forge, cabane de bûcheron. */
type Producer = Drill | Farm | Quarry | PigPen | Forge | LumberCamp;

/** 20 ticks de simulation par seconde. */
export const TICKS_PER_SECOND = 20;

/** Où en est une production à durée : ticks restants, sur la durée totale. */
export interface ProductionTimer {
  left: number;
  total: number;
}

/** Un compte à rebours en « m:ss », pour la carte et les fenêtres : 3 min → « 3:00 ». */
export function timerText(ticks: number): string {
  const seconds = Math.ceil(Math.max(0, ticks) / TICKS_PER_SECOND);

  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export const STEP_MS = 1000 / TICKS_PER_SECOND;
const STEP_SECONDS = 1 / TICKS_PER_SECOND;

/** Les seules commandes qu'on prend d'Adam à terre : celles qui ne sont pas de lui (vue, jardin, brouillard). */
const DEAD_COMMANDS: ReadonlySet<Command['type']> = new Set([
  'setMoveAxis',
  'seeBuilding',
  'seePieces',
  'applyPerks',
  'grantPieces',
  'setFog',
  'catchUp',
  'partnerJoin',
  'partnerLeave',
  'asPartner',
]);

/** Les sources de vision des deux joueurs : hors des ids des bâtiments (pairs) et des mobiles (impairs). */
const ADAM_SIGHT = -1;
const PARTNER_SIGHT = -2;

/** Recette utilisée par une foreuse. Une seule pour l'instant, cf. `data/recipes.ts`. */
const DRILL_RECIPE: RecipeId = 'mineOre';

/** Ce que coûte une naissance à la nurserie, et tous les combien. */
const NURSERY_RECIPE: RecipeId = 'raiseChild';

/** Ticks de contact entre deux objets livrés sur un chantier. Court : le chantier se remplit à vue. */
export const DELIVER_TICKS = 2;

/**
 * Récolte de proximité : un passage toutes les 10 ticks, les ressources dont
 * le centre est à portée d'Adam, de la plus proche à la plus lointaine, une
 * unité chacune, quatre au plus.
 */
export const HARVEST_PASS_TICKS = 10;
export const HARVEST_REACH_TILES = 1.25;
export const HARVEST_MAX_NODES = 4;

/**
 * Le tronc d'un arbre, en pixels dans sa tuile : le pied du sprite, au centre
 * et en bas. Il laisse 22 px entre deux troncs voisins, dans un sens comme
 * dans l'autre — assez pour la boîte d'Adam (20 × 14).
 */
const TRUNK: TileBox = { left: 11, top: 20, right: 21, bottom: 30, glide: true };

/** Secondes annoncées avant chaque vague. */
const WAVE_COUNTDOWN_SECONDS = 3;

/** Adam piétine du butin avec le sac plein : « sac plein » au plus une fois par seconde. */
const LOOT_FULL_TICKS = TICKS_PER_SECOND;

/** Où tombe ce qu'Adam jette, en pixels : un peu devant ses pieds, un tas par objet côte à côte. */
const DROP_AHEAD = 12;
const DROP_SPACING = 14;
/** Distance, en tuiles, du centre d'une base mutante au poste de ses gardiens : devant la palissade. */
const GUARD_POST = 2.6;
/** Celle de ses cracheurs : plus loin, ils tiennent les abords. */
const SPITTER_POST = 4;
/** Hauteur de la bouche d'un cracheur, et du corps d'Adam qu'il vise, en pixels au-dessus des pieds. */
const SPIT_MOUTH = 14;

/** Sel du tirage qui déniche la spécialité d'une région conquise en récoltant (`findSpecialty`). */
const SPECIALTY_SALT = 0x2f1a9c3b;

/** Les espèces que loge une base mutante. */
type GuardKind = 'guardian' | 'spitter' | 'chief';

function guardKind(proto: WildlifeId): GuardKind {
  return proto === 'spitter' || proto === 'chief' ? proto : 'guardian';
}

/** Le bâtiment que la partie ouvre en chantier au démarrage. */
export const STARTING_BUILDING: BuildingId = 'townHall';

/** Un refus de placement, et les cases de l'emprise qui le causent. */
export interface PlacementBlock {
  reason: PlacementRejection;
  /** Les cases fautives pour ce motif-là. */
  tiles: TileCoord[];
  /**
   * Toutes les cases de l'emprise qu'un motif de case refuse — eau, bâti,
   * route, arbre, Adam, zone mutante —, pas seulement celles du premier :
   * le fantôme les peint en corail, les autres en menthe. Absent : `tiles`.
   */
  blocked?: TileCoord[];
  /** Refus `footing` : le filon que la foreuse couvre le plus, `null` sans filon. */
  ore?: ItemId | null;
}

/** D'où « Transférer » tirerait de quoi achever un chantier, lu par sa fenêtre. */
export type SiteCoverage = 'bag' | 'town' | 'both' | 'short';

/**
 * Les ouvriers de la ville, lus par le HUD : le total, bâtiment par
 * bâtiment, et ce que font les porteurs sur pied.
 */
export interface Workforce {
  total: number;
  /** Les bâtiments finis qui emploient, dans l'ordre de `BUILDINGS`, un seul par prototype. */
  byBuilding: { proto: BuildingId; count: number }[];
  /** Les porteurs logés : `busy` ont un job, `idle` attendent du travail. */
  porters: { busy: number; idle: number };
  /** Les postes occupés dans les bâtiments qui emploient ; le reste du `total` est libre. */
  assigned: number;
  free: number;
  /** Postes demandés mais vides, faute d'ouvrier libre. */
  missing: number;
}

/**
 * Ce que fait un habitant, pour le HUD et l'infobulle :
 * - `child` : un enfant, qui travaillera dans `days` aubes ;
 * - `working` : un ouvrier à la tâche, au bâtiment `at` (sa maison s'il est entre deux) ;
 * - `idle` : un ouvrier sans travail, qui glande dehors ;
 * - `home` : chez lui — il dort, ou s'abrite d'une vague ;
 * - `outside` : il dort dehors, faute de lit.
 */
export type Occupation =
  | { kind: 'child'; days: number }
  | { kind: 'working'; at: BuildingId | null }
  | { kind: 'idle' }
  | { kind: 'home' }
  | { kind: 'outside' };

/** Un habitant qu'on peut taper : un enfant, un ouvrier, un bûcheron, un forestier, un fermier. */
export type Inhabitant = Kid | Worker | Lumberjack | Forester | Farmer;

/** Un ouvrier qui vit d'un bâtiment et peut glander : porteur, bûcheron, forestier, fermier. */
export type Laborer = Worker | Lumberjack | Forester | Farmer;

/**
 * L'alerte du HUD quand la ville va manquer de ce qu'un besoin consomme :
 * `wanting` habitants ont faim sans rien à manger, ou `minutes` — le stock
 * au rythme où il fond — sont comptées. `minutes` vaut 0 quand il n'y a plus rien.
 */
export interface NeedAlert {
  need: NeedId;
  item: ItemId;
  wanting: number;
  minutes: number;
}

/** La population détaillée du HUD Ville : au travail, inactifs, enfants. */
/**
 * La prochaine vague, telle qu'on peut l'annoncer (`World.waveForecast`) :
 * dans combien de ticks elle sort, combien elle compte — les assaillants que
 * les bases auront à la tombée de la nuit, ses chefs et ses renforts —, de
 * combien de bases, et d'où sort la tête : la base la plus proche de la
 * mairie, son côté et son centre en pixels monde.
 */
export interface WaveForecast {
  night: number;
  ticks: number;
  count: number;
  bases: number;
  /** Les renforts de l'ère et de la taille de la ville (`WAVE_STRENGTH`), compris dans `count`. */
  reinforcements: number;
  boss: boolean;
  queen: boolean;
  /** Sous `WAVE_WARNING.urgentTicks` : la capsule bat. */
  urgent: boolean;
  from: Compass;
  x: number;
  y: number;
}

export interface Census {
  working: number;
  idle: number;
  children: number;
}

export type WorldEvents = {
  /** Un chantier est ouvert (ou un bâtiment à coût nul, posé fini). */
  buildingPlaced: { id: EntityId; tx: number; ty: number };
  /** Le chantier a reçu son dernier objet : l'entité est devenue le bâtiment, sous le même id, sans autre action du joueur. */
  buildingCompleted: { id: EntityId };
  /** `ore` : pour un refus `footing`, le filon couvert (`PlacementBlock.ore`) ; `null` sinon. */
  placementRejected: { reason: PlacementRejection; ore: ItemId | null };
  /** Une station de dépollution vient de rendre saines ces terres polluées. */
  landCleaned: { tiles: TileCoord[] };
  drillBlocked: { id: EntityId };
  drillProduced: { id: EntityId; item: ItemId };
  /** Adam a arraché une unité à la tuile, et `amount` objets sont allés dans le sac. `remaining` à 0 : elle a disparu. */
  resourceHarvested: { tx: number; ty: number; item: ItemId; amount: number; remaining: number };
  /**
   * `amount` objets viennent d'être posés sur le chantier, pris dans le sac
   * d'Adam ou dans le stock de la ville (`source`). `missing` : ce qui manque
   * encore, tous objets confondus.
   */
  siteDelivered: { id: EntityId; item: ItemId; amount: number; missing: number; source: 'bag' | 'town' };
  /** Un chantier offert par le jardin des souvenirs vient d'ouvrir déjà livré. */
  siteReady: { id: EntityId };
  /** Le chantier a été annulé : ce qui y était livré est retourné à la ville (`toTown`), ou posé au sol. */
  decorRemoved: { id: EntityId; proto: BuildingId; tx: number; ty: number; toTown: boolean };
  siteCancelled: { id: EntityId; proto: BuildingId; tx: number; ty: number; toTown: boolean };
  /**
   * Le bâtiment est passé au niveau `level`, sous le même id : le rendu
   * change de sprite. `fromBag` : ce qui est sorti du sac pour le payer.
   */
  buildingUpgraded: { id: EntityId; level: number; fromBag: [ItemId, number][] };
  /** Une amélioration a été refusée. */
  upgradeRejected: { id: EntityId; reason: UpgradeRejection };
  /** Une commande sur un chantier a été refusée. */
  siteRejected: { id: EntityId; reason: SiteRejection };
  /** Un fermier a rangé sa récolte dans le coffre de la ferme. */
  farmProduced: { id: EntityId; item: ItemId };
  /** La forge a fondu une plaque. */
  forgeProduced: { id: EntityId; item: ItemId };
  /** `amount` objets du sac viennent d'entrer dans le coffre d'une nurserie ou d'une forge. */
  buildingSupplied: { id: EntityId; item: ItemId; amount: number; source: 'bag' | 'town' };
  /** Un « Transférer le sac » vers une nurserie ou une forge a été refusé. */
  supplyRejected: { id: EntityId; reason: SupplyRejection };
  /** L'heure de naître est passée, mais la nurserie n'a pas de quoi nourrir l'enfant. */
  nurseryHungry: { id: EntityId };
  /** Adam a pris `amount` objets dans le coffre d'une foreuse, d'une ferme ou d'une forge. */
  storeTaken: { id: EntityId; item: ItemId; amount: number };
  /** Un « Prendre » a été refusé. */
  takeRejected: { id: EntityId; reason: TakeRejection };
  /** Un échange sac ⇄ coffre a fait passer `moved` dans le sens `direction`. */
  itemsTransferred: { id: EntityId; direction: TransferDirection; moved: [ItemId, number][] };
  /** Un échange sac ⇄ coffre a été refusé. */
  transferRejected: { id: EntityId; reason: TransferRejection };
  /** Le sac est plein : la récolte s'arrête, il faut aller livrer. */
  inventoryFull: Record<string, never>;
  /**
   * Adam heurte un arbre ou un rocher mais porte déjà assez de cet objet
   * (`carryLimit`) : rien n'est pris, et le joueur le voit. `wanted` dit ce
   * que chantiers et recettes en attendent encore (`World.wanted`) : zéro,
   * personne n'en veut ; sinon, le sac en contient assez, il faut livrer.
   * `plenty` : la ville en a déjà assez (`TOWN_PLENTY`), Adam ne le ramasse
   * plus en passant.
   */
  harvestRefused: { tx: number; ty: number; item: ItemId; wanted: number; plenty: boolean };
  /**
   * Plus que `seconds` secondes avant la prochaine vague (3, 2, puis 1) : sa
   * nuit, son rang dans la nuit, son effectif — les assaillants en réserve
   * dans `bases` bases, et ses chefs —, si un gros mutant ou la Reine la mène
   * (`boss`), si c'est la Reine (`queen`), d'où elle vient et le point, en
   * pixels monde, d'où elle va sortir : la base la plus proche de la mairie.
   */
  waveCountdown: {
    seconds: number;
    night: number;
    wave: number;
    count: number;
    bases: number;
    boss: boolean;
    queen: boolean;
    from: Compass;
    /** Le bâtiment qu'elle vise : la mairie, ou un bâtiment de l'usine (`WAVES.targets`). */
    targetProto: BuildingId;
    x: number;
    y: number;
  };
  /**
   * La prochaine vague sortira dans `WAVE_WARNING.leadTicks` : ce que dit
   * `World.waveForecast()` à cet instant. Le HUD le notifie ; il n'y a
   * jamais de vague sans cette annonce, sauf partie reprise en pleine attente.
   */
  waveAnnounced: WaveForecast;
  /** Le crépuscule commence : la nuit `night` tombe dans `DAY_CYCLE.dusk` ticks. */
  duskFell: { night: number };
  /**
   * Les bases viennent de lâcher leurs `count` assaillants (et les chefs de la
   * nuit) : la plus proche de la mairie est du côté `from`, en (x, y), et les
   * siens marchent sur `targetProto` ; `bases` : combien de bases envoient ;
   * `wave` compte à partir de 1 dans la nuit ; `queen` : la Reine des flaques en est.
   */
  waveStarted: {
    night: number;
    wave: number;
    count: number;
    bases: number;
    boss: boolean;
    queen: boolean;
    from: Compass;
    targetProto: BuildingId;
    x: number;
    y: number;
  };
  /** Une base, le jour, a produit un assaillant : elle en a `raiders` en réserve. */
  raiderBred: { id: number; raiders: number };
  /** Au crépuscule, la veille : la Reine des flaques sortira la nuit `night`. */
  queenAnnounced: { night: number };
  /** La Reine pond : `count` larves sortent de terre autour de (x, y). */
  queenLaid: { id: MobileId; count: number; x: number; y: number };
  /** La Reine plonge en (x, y) et ressortira en (toX, toY), près de la tour `prey`. */
  queenDived: { id: MobileId; prey: EntityId; x: number; y: number; toX: number; toY: number };
  /** La Reine est abattue en (x, y) : son cœur est au sol. */
  queenSlain: { id: MobileId; night: number; x: number; y: number };
  /** Le dernier mutant en vie vient de tomber : la vague de la nuit `night` est repoussée. */
  waveCleared: { night: number };
  /** La vague de la nuit `night`, abattue toute avant l'aube, paie sa prime (`WAVE_BOUNTY`) : en ville, ou dans le sac. */
  waveRewarded: { night: number; reward: [ItemId, number][]; to: 'town' | 'bag' };
  /** Un mutant abattu a lâché du butin en (x, y). */
  lootDropped: { id: MobileId; item: ItemId; x: number; y: number };
  /** Adam a ramassé `amount` exemplaires d'un tas au sol, qui sont allés dans son sac. */
  lootPicked: { id: MobileId; item: ItemId; amount: number; x: number; y: number };
  /** `amount` objets du sac viennent d'entrer dans le stock de la ville. */
  townDeposited: { item: ItemId; amount: number };
  /** Un « Déposer en ville » a été refusé. */
  depositRejected: { reason: DepositRejection };
  /** Adam a jeté `amount` objets de son sac : un tas `id` à ses pieds, en (x, y). */
  itemDropped: { id: MobileId; item: ItemId; amount: number; x: number; y: number };
  /**
   * L'aube : la nuit `night` est survécue, les mutants restants ont fui,
   * `reward` est entré en ville ou dans le sac (`to`) ; le reste est tombé au sol en `lootDropped`.
   */
  dawnBroke: { night: number; reward: [ItemId, number][]; to: 'town' | 'bag' };
  /** Le défi d'un nouveau jour (`data/challenges.ts`). */
  challengeStarted: { id: ChallengeId; day: number };
  /** Le défi du jour réussi : ce que sa récompense a versé. */
  challengeCompleted: { id: ChallengeId; reward: [ItemId, number][]; to: 'town' | 'bag'; prestige: number };
  /** L'aube propose ses faveurs (`data/boons.ts`). */
  boonOffered: { night: number; choices: BoonId[] };
  /** Une faveur prise : `reward`, ce que son colis a versé (vide pour un coup de pouce). */
  boonChosen: { boon: BoonId; reward: [ItemId, number][]; to: 'town' | 'bag' };
  /** Un mutant a fui le jour : il disparaît sans compter comme abattu. */
  mutantFled: { id: MobileId; x: number; y: number };
  /** Un arc a tiré, depuis (x, y). */
  arrowShot: { x: number; y: number };
  /** Une flèche a touché un mutant ; `hp` est ce qui lui reste, (dx, dy) la direction du tir, de norme 1. */
  mutantHit: { id: MobileId; hp: number; x: number; y: number; dx: number; dy: number };
  mutantDied: { id: MobileId; x: number; y: number };
  /** Un mutant a frappé un bâtiment ; `hp` est ce qui lui reste. */
  buildingDamaged: { id: EntityId; hp: number };
  /** Le bâtiment est tombé à zéro : la mairie n'existe plus, tout autre redevient son chantier, à moitié livré (`RUIN`). */
  buildingDestroyed: { id: EntityId; proto: BuildingId; tx: number; ty: number };
  /** La mairie est tombée : la partie est perdue. */
  townHallDestroyed: Record<string, never>;
  /** Une flèche a touché une bête ; `hp` est ce qui lui reste. */
  beastHit: { id: MobileId; proto: WildlifeId; hp: number; x: number; y: number };
  /** Une bête est tombée ; son butin suit, en `lootDropped`. */
  beastDied: { id: MobileId; proto: WildlifeId; x: number; y: number };
  /** Du Prestige gagné (`data/prestige.ts`) : `x`, `y`, en pixels monde, d'où il monte ; `total` est le nouveau compte. */
  prestigeGained: { amount: number; total: number; x: number; y: number };
  /** Adam gagne de l'expérience : `amount` rapporté par l'ennemi, `x`, `y` d'où il tombe. */
  xpGained: { amount: number; total: number; x: number; y: number };
  /** Adam passe un niveau : ce qu'il y gagne, pour le message et l'effet. */
  levelUp: { level: number; maxHp: number; bowDamage: number; x: number; y: number };
  /** Une bête — ou le crachat d'un cracheur — a frappé Adam ; `hp` est ce qui lui reste. */
  playerHurt: { by: MobileId; hp: number };
  /** Un cracheur a craché (`spit` est le crachat) : il se gonfle et recule d'un coup. */
  spitShot: { id: MobileId; spit: MobileId; x: number; y: number };
  /** Un crachat s'est écrasé — sur Adam, un mur, ou au sol au bout de sa course. */
  spitSplashed: { x: number; y: number };
  /** Une base charge une boule de feu : une lueur en (x, y), qui part dans `ticks`. */
  baseFireWarned: { id: number; x: number; y: number; ticks: number };
  /** Une base a tiré une boule de feu (`fireball`) depuis (x, y). */
  baseFired: { id: number; fireball: MobileId; x: number; y: number };
  /** Une boule de feu s'est écrasée en (x, y) ; `hit` : sur Adam ou sur un bâtiment. */
  fireballBurst: { x: number; y: number; hit: boolean };
  /** Le chef d'une base lève sa massue : un cercle de `radius` tuiles en (x, y), qui tombe dans `ticks`. */
  chiefSlamWarned: { id: MobileId; x: number; y: number; radius: number; ticks: number };
  /** La massue du chef est tombée en (x, y) ; `hit` : Adam était encore dans le cercle. */
  chiefSlammed: { id: MobileId; x: number; y: number; hit: boolean };
  /** Adam est tombé : il se réveille à la mairie, remis sur pied. */
  playerKnockedOut: { x: number; y: number };
  playerRespawned: { x: number; y: number };
  /** La nurserie a produit un enfant. */
  childBorn: { nurseryId: EntityId; kidId: MobileId; name: string; x: number; y: number };
  /** Une caravane de troc part de loin vers le bord de la clairière : c'est le jour `day`. */
  caravanArriving: { id: MobileId; day: number };
  /** Adam arrive au contact de la caravane garée : la fenêtre Troc s'ouvre. */
  caravanReached: { id: MobileId };
  /** La caravane repart : plus d'échange possible. */
  caravanLeaving: { id: MobileId };
  /**
   * L'échange `offer` de la caravane est fait. `fromBag` : ce qui est sorti du
   * sac pour le payer ; `stored` : ce qui n'a pas tenu dans le sac et attend à la mairie.
   */
  traded: { id: MobileId; offer: number; fromBag: [ItemId, number][]; stored: Partial<Record<ItemId, number>> };
  /** Un échange a été refusé. */
  tradeRejected: { id: MobileId; reason: TradeRejection };
  /** Ève part du bord de la carte sur son vélo-cargo. */
  eveArriving: { id: MobileId };
  /** Ève est arrivée à la mairie : la population compte deux adultes. */
  eveArrived: { id: MobileId; x: number; y: number };
  /** Ève donne une quête. */
  questStarted: { quest: QuestId };
  /** L'objectif est atteint : la récompense est donnée. */
  questCompleted: { quest: QuestId };
  /** Ève a rendu `hp` points de vie au bâtiment. */
  buildingRepaired: { id: EntityId; hp: number };
  /**
   * Adam a réparé le bâtiment avec `amount` objets `item` (`REPAIR`), dont
   * `fromBag` sortis du sac, le reste de la ville ; `hp` est ce qu'il a maintenant.
   */
  playerRepaired: { id: EntityId; hp: number; item: ItemId; amount: number; fromBag: number };
  /** Une réparation a été refusée. */
  repairRejected: { id: EntityId; reason: RepairRejection };
  /** Un porteur a déposé sa charge : sur un chantier, ou dans la mairie. */
  porterDelivered: { workerId: MobileId; id: EntityId; item: ItemId; amount: number };
  /** Un bûcheron a donné un coup de hache : une unité de bois s'est détachée de l'arbre. `remaining` à 0 : il est tombé. */
  treeChopped: { lumberjackId: MobileId; tx: number; ty: number; remaining: number };
  /** Un bâtiment producteur a été mis en pause, ou il repart. */
  buildingPaused: { id: EntityId; paused: boolean };
  /** L'effectif voulu d'un bâtiment a changé. */
  workersChanged: { id: EntityId; staff: number };
  /** La priorité de travail d'un bâtiment a changé. */
  priorityChanged: { id: EntityId; priority: WorkPriority };
  /** Un forestier a planté une pousse en (tx, ty). */
  treePlanted: { foresterId: MobileId; tx: number; ty: number };
  /** Un fermier a semé la case (tx, ty). */
  cropSown: { farmerId: MobileId; tx: number; ty: number };
  /** Un fermier a récolté la case mûre (tx, ty) : `amount` nourritures dans son panier. */
  cropHarvested: { farmerId: MobileId; tx: number; ty: number; amount: number };
  /** Un bûcheron a rangé `amount` bois dans le coffre de sa cabane. */
  woodStored: { lumberjackId: MobileId; id: EntityId; amount: number };
  /** Un mutant vaincu est tombé assommé plutôt que de s'évaporer : `id` est le patient qu'il devient. */
  mutantStunned: { id: MobileId; clinicId: EntityId; x: number; y: number };
  /** Adam a touché le mutant assommé : il le suit en boitillant. */
  patientFollowing: { id: MobileId; x: number; y: number };
  /** Le patient est entré à la clinique : la nuit de soins commence. */
  patientAdmitted: { id: MobileId; clinicId: EntityId };
  /** Il en ressort guéri : `id` est l'ex-mutant, un ouvrier de plus. */
  mutantHealed: { id: MobileId; clinicId: EntityId; x: number; y: number };
  /** La caserne `id` a commencé à former un compagnon de la classe `role`. */
  companionTraining: { id: EntityId; role: CompanionClassId; endTick: number; fromBag: [ItemId, number][] };
  /** Un compagnon sort de la caserne. */
  companionJoined: { id: MobileId; barracksId: EntityId; role: CompanionClassId; x: number; y: number };
  /** Un compagnon est tombé. */
  companionDied: { id: MobileId; role: CompanionClassId; x: number; y: number };
  /** Un compagnon a reçu un coup. */
  companionHurt: { id: MobileId; hp: number };
  /** Un guerrier a frappé. */
  companionStruck: { id: MobileId };
  /** Un soigneur a rendu `amount` points de vie à Adam (`'player'`) ou à un compagnon. */
  companionHealed: { by: MobileId; who: 'player' | MobileId; amount: number; x: number; y: number };
  /** Un recrutement a été refusé. */
  recruitRejected: { reason: RecruitRejection };
  /** Un enfant a eu 14 ans : il devient ouvrier, sous le même id. */
  kidGrewUp: { id: MobileId; name: string; x: number; y: number };
  /** L'habitant `id` a comblé un besoin à la mairie : sa jauge est pleine. */
  needMet: { id: MobileId; need: NeedId; x: number; y: number };
  /** Un ouvrier est à bout de `need` : il meurt dans `seconds` s s'il n'a pas de quoi. */
  starving: { id: MobileId; name: string; need: NeedId; seconds: number; x: number; y: number };
  /** Un ouvrier est mort de faim ou de soif (`need`) : il a quitté la ville. */
  workerStarved: { id: MobileId; name: string; need: NeedId; x: number; y: number };
  /** Un enfant affamé (ou assoiffé : `need`) n'a pas pris d'année à l'aube. */
  growthStunted: { id: MobileId; name: string; need: NeedId };
  /** Le labo `id` a choisi une recherche : il attend son coût. */
  researchChosen: { id: EntityId; research: ResearchId };
  /** La recherche choisie est abandonnée ; ce qui était déposé reste au coffre, son coût payé y revient. */
  researchCancelled: { id: EntityId; research: ResearchId };
  /** Une recherche prend place dans la file du labo, ou en sort (`queued` faux). */
  researchQueued: { id: EntityId; research: ResearchId; queued: boolean };
  /** Le coût est réuni et consommé : le compte à rebours tourne jusqu'à `endTick`. */
  researchStarted: { id: EntityId; research: ResearchId; endTick: number };
  /** La recherche est finie : son effet vaut désormais pour toute la partie. */
  researchCompleted: { id: EntityId; research: ResearchId };
  /**
   * La colonie entre dans l'ère `era` (`data/eras.ts`) : `opened`, les
   * bâtiments qui entrent au menu avec elle ; `fromBag`, ce que le sac a investi.
   */
  eraReached: { era: number; opened: BuildingId[]; fromBag: [ItemId, number][] };
  /** Le passage d'ère a été refusé. */
  eraRejected: { reason: EraRejection };
  /** Ces bâtiments viennent d'entrer au menu de construction : une recherche, un plan, un objectif. */
  buildingsUnlocked: { buildings: BuildingId[] };
  /** Une commande sur le labo a été refusée. */
  researchRejected: { id: EntityId; reason: ResearchRejection };
  /** `amount` objets viennent d'entrer au labo, pris dans le sac d'Adam ou dans le stock de la ville. */
  labSupplied: { id: EntityId; item: ItemId; amount: number; source: 'bag' | 'town' };
  /** Une météo arrive dans `seconds` secondes. */
  weatherAnnounced: { id: WeatherId; seconds: number };
  weatherStarted: { id: WeatherId };
  weatherEnded: { id: WeatherId };
  /** La pluie acide a rongé un bâtiment abîmé ; `hp` est ce qui lui reste. */
  buildingCorroded: { id: EntityId; hp: number };
  /**
   * L'objectif `id` est réussi et sa récompense est tombée. `stored` : ce
   * qui n'a pas tenu dans le sac et attend à la mairie. `closing` : c'était
   * le dernier de son chapitre — `chapterCompleted` suit, qui le fête en grand.
   */
  objectiveCompleted: { id: ObjectiveId; stored: Partial<Record<ItemId, number>>; closing: boolean };
  /** Le chapitre `index` est fini, sa récompense tombée ; le suivant s'ouvre. `stored` : comme un objectif. */
  chapterCompleted: { index: number; stored: Partial<Record<ItemId, number>> };
  /** Le dernier chapitre est fini : le Signal est lancé. La partie continue, sans fin. */
  victory: Record<string, never>;
  /**
   * L'antenne `id` a son étage `floor` (1 à 3) : la nuit `lureNight`, toutes
   * les vagues marcheront sur elle.
   */
  antennaRaised: { id: EntityId; floor: number; lureNight: number };
  /** Abattue, l'antenne a perdu son étage du haut : elle est retombée à `floor`. */
  antennaFell: { id: EntityId; floor: number };
  /** L'émetteur est posé : l'antenne s'allume en (x, y), le centre de son emprise, et quelqu'un répond. */
  signalSent: { id: EntityId; x: number; y: number };
  /** L'aube après le Signal : `count` survivants arrivent à la mairie, en (x, y). */
  survivorsArrived: { count: number; x: number; y: number };
  /** L'aube a fait passer le Bonheur de la ville de `from` à `to` : le HUD montre de quel côté. */
  happinessChanged: { from: number; to: number };
  /** Une flèche a entamé une base mutante. */
  enemyBaseHit: { id: number; hp: number; x: number; y: number };
  /** Une base mutante est tombée : sa zone est libre, le Prestige gagné, son butin au sol. */
  enemyBaseDestroyed: { id: number; level: number; prestige: number; x: number; y: number };
  /** L'arc d'Adam n'entame pas cette base : il lui faut un équipement de son niveau. */
  enemyBaseResisted: { id: number; level: number; gear: number };
  /** La base est sous le bouclier de son chef : il faut l'abattre d'abord. */
  enemyBaseShielded: { id: number };
  /** Le chef d'une base est tombé : le bouclier est levé, le Prestige gagné, son butin au sol. */
  enemyChiefDefeated: { baseId: number; level: number; prestige: number; x: number; y: number };
  /** Adam entre dans la zone d'une base debout : on n'y bâtit ni n'y récolte. */
  enemyZoneEntered: { id: number; level: number };
  /**
   * Adam entre dans une région pas encore conquise : `open`, son gardien
   * l'attend ; `locked`, il faut d'abord l'ère `era` (indice dans `ERAS`).
   */
  regionEntered: { id: number; biome: BiomeId; state: 'open' | 'locked'; era: number };
  /** Le gardien d'une région est tombé : elle est conquise, sa spécialité au sol. */
  regionConquered: { id: number; biome: BiomeId; prestige: number; x: number; y: number };
  /** Adam a déniché la spécialité d'une région conquise en y récoltant. */
  specialtyFound: { item: ItemId; amount: number; tx: number; ty: number };
  /** Un arc forgé : `level` est le nouveau niveau d'équipement. */
  gearCrafted: { level: number; fromBag: [ItemId, number][] };
  gearRejected: { reason: GearRejection };
  /** Adam a changé d'apparence : le rendu recompose ses calques. */
  lookChanged: { look: Look };
  /** L'apparence demandée a été refusée. */
  lookRejected: { reason: LookRejection };
  /** Une pièce de garde-robe trouvée : un objectif, une base, son chef, la Reine, une bête. Elle entre à l'éditeur. */
  pieceFound: { piece: PieceId; source: LootSource | 'achievement' };
  /** Une source donnait des pièces, mais Adam a déjà toute la garde-robe : du Prestige à la place (`WARDROBE_SPARE`). */
  piecesSpared: { source: LootSource; prestige: number };
  /** Un cochon sauvage se laisse apprivoiser : il suit Adam. */
  pigTamed: { id: MobileId; x: number; y: number };
  /** Le cochon qui suivait Adam détale : effrayé par une bête (`scare`), ou resté trop loin (`lost`). Il redeviendra sauvage. */
  pigFled: { id: MobileId; reason: 'scare' | 'lost' };
  /** Un cochon entre dans l'élevage `id`, qui en loge maintenant `pigs`. */
  pigPenned: { id: EntityId; pigs: number };
  /** L'élevage `id` est tombé : `count` cochons s'échappent. */
  pigsEscaped: { id: EntityId; count: number };
  /** Adam ouvre un coffre de la carte, au centre (x, y) de sa case. */
  chestOpened: { id: number; tx: number; ty: number; x: number; y: number };
  /**
   * Adam trouve un point d'intérêt — coffre, ruine ou secret — en (x, y). `items` est ce qui est
   * parti vers le sac (le surplus tombe au sol en `lootDropped`), `plan` le bâtiment dont il
   * reçoit le plan, `reward` ce que donne une ruine.
   */
  discoveryFound: { id: number; kind: DiscoveryKind; tx: number; ty: number; x: number; y: number; items: [ItemId, number][]; plan: BuildingId | null; reward: RuinReward | null };
  /** Le temps d'absence est rattrapé (`catchUp`) : le récap « Pendant votre absence » le raconte. */
  offlineCaughtUp: OfflineReport;
  /** Jouer à deux : l'ami est entré dans la partie (`partnerJoin`). */
  partnerJoined: { name: string };
  /** L'ami est parti : son personnage a disparu (`partnerLeave`). */
  partnerLeft: { name: string };
};

export class World {
  public readonly seed: number;
  public readonly chunks = new ChunkIndex();
  public readonly resources: ResourceIndex;
  /** Les tuiles pavées : une modification du joueur, sauvegardée comme les tuiles entamées. */
  /** Les terres polluées et radioactives de la carte, et celles qu'on a nettoyées (`sim/contamination.ts`). */
  public readonly land: Land;
  /**
   * Le brouillard de guerre : cases explorées, cases vues, et ce qu'on
   * se rappelle de celles qu'on ne voit plus (`sim/fog.ts`). Une case revue
   * oublie sa capture : ses ressources sont à redessiner.
   */
  public readonly fog = new FogOfWar((tx, ty) => this.dirtyTile(tx, ty));
  /** La `revision` du brouillard à la dernière revue des bases : sans case changée, leur vue non plus. */
  private basesSightRevision = -1;
  public readonly entities = new Map<EntityId, Entity>();
  public readonly mobiles = new Map<MobileId, Mobile>();
  public readonly events = new Emitter<WorldEvents>();
  /** Adam, toujours : le personnage de l'hôte, celui que la sauvegarde garde. */
  public readonly adam: Player;
  /** L'ami, quand on joue à deux (`sim/partner.ts`) ; `null` en solo. */
  public partner: Partner | null = null;
  /** Qui agit pendant le tick : Adam, ou l'ami le temps de son pas et de ses commandes (`asPartner`). */
  private acting: Player | null = null;
  /** Le personnage que suit cet écran : Adam chez l'hôte, l'ami chez lui (`viewAsPartner`). Jamais de l'état. */
  private viewer: 'adam' | 'partner' = 'adam';

  /**
   * Le joueur : pendant le tick, celui qui agit ; ailleurs — rendu, HUD,
   * fenêtres —, celui de cet écran. Son sac, sa portée, sa caméra.
   */
  public get player(): Player {
    if (this.acting) return this.acting;

    return this.viewer === 'partner' && this.partner ? this.partner.player : this.adam;
  }

  /** Ce qui entre et sort de la ville, sur les deux dernières minutes : vue, pas état — jamais sauvegardé. */
  public readonly flows = new TownFlows();

  /** Le chantier puis la mairie : l'objectif de départ, et la cible des mutants. */
  public readonly townHallId: EntityId;

  /** Tick courant. Sert d'horodatage aux commandes et de base au scheduler. */
  public tickCount = 0;

  /** Numéro de la dernière nuit tombée ; 0 tant que la première n'est pas venue. */
  public night = 0;

  /** Vrai une fois la mairie détruite. La simulation continue, les vagues s'arrêtent. */
  public defeated = false;

  /** Tick où le toit de la mairie a été posé : le lever du premier jour. 0 tant qu'elle est en chantier. */
  public cycleStartTick = 0;

  /**
   * Le bâtiment que vise la prochaine vague : tiré à son annonce, pour que
   * le bandeau le dise, et gardé jusqu'à son départ. `null` tant qu'elle
   * n'est pas annoncée.
   */
  private nextWaveTarget: EntityId | null = null;
  /** La nuit dont la vague est dehors et paiera sa prime si on l'abat toute avant l'aube ; `null` sinon. */
  private bountyNight: number | null = null;
  /** Les faveurs de l'aube proposées, en attente d'un choix (`data/boons.ts`). */
  private offeredBoons: { night: number; choices: BoonId[] } | null = null;
  /** Le coup de pouce de la journée, jusqu'au tick `until`. */
  private dayBoon: { id: BoonId; until: number } | null = null;
  /**
   * Le défi du jour (`data/challenges.ts`) : son jour, son compte, et pour
   * `explore` les cases déjà connues à son départ.
   */
  private daily: DailyChallenge | null = null;

  /** Mutants abattus depuis le début de la partie — le score de l'écran de fin. */
  public kills = 0;

  /** Le Prestige de la colonie (`data/prestige.ts`) : il ne fait que monter, rien ne le dépense encore. */
  public prestige = 0;

  /**
   * Les emplacements déjà payés en Prestige, `"bâtiment@tx,ty"` : un bâtiment
   * abattu puis rebâti au même endroit ne rapporte qu'une fois.
   */
  private readonly prestigeSites = new Set<string>();

  /** Tick où la mairie est tombée ; 0 tant qu'elle tient. */
  public defeatTick = 0;
  /** Ticks restants avant la réapparition d'Adam ; 0 : il est debout. */
  public respawnTicks = 0;

  /**
   * Quêtes d'Ève déjà finies, dans l'ordre de `QUEST_IDS`. C'est tout l'état
   * des quêtes : la quête en cours, les plans et les outils s'en déduisent.
   */
  public questsDone = 0;

  /** Les bonus du jardin des souvenirs avec lesquels la colonie est partie. Vide en « partie pure ». */
  public perks: readonly PerkId[] = [];

  /**
   * Les recherches finies, dans l'ordre où elles l'ont été. Elles sont à la
   * colonie, pas au labo : elles survivent s'il tombe. La recherche en cours,
   * elle, est l'état du labo (`Lab.research`).
   */
  public researchDone: ResearchId[] = [];

  /**
   * Bâtiments dont la carte du menu a perdu son badge « Nouveau » : choisis
   * ou posés, ou proposés d'emblée quand la mairie a ouvert le menu.
   */
  public seenBuildings = new Set<BuildingId>();

  /**
   * Bâtiments ouverts à la construction sans plan, recherche ni objectif.
   * Tous par défaut (parties scriptées, anciennes sauvegardes) ; une colonie
   * neuve (`World.newColony`) n'ouvre que `START_BUILDINGS`.
   */
  public openBuildings = new Set<BuildingId>(BUILDING_IDS);

  /**
   * L'ère atteinte, index de `ERAS` (`data/eras.ts`) : 0, le Campement, au
   * départ et pour une sauvegarde d'avant les ères. Elle ne fait que monter
   * (`advanceEra`).
   */
  public era = 0;

  /** Ce que le menu proposait au tick d'avant ; `null` avant le premier. Pas de l'état : il se relit. */
  private menuKnown: Set<BuildingId> | null = null;

  /** Ce dont dépendait le menu au dernier compte : tant que rien n'en change, `watchUnlocks` ne recompte pas. */
  private unlockStamp: { hall: boolean; research: number; quests: number; chapter: number; open: number; explored: number; era: number } | null = null;
  private exploredStamp = { revision: -1, count: 0 };

  /**
   * Combien de fois chaque offre rare de la caravane a été prise : leur
   * plafond sur la partie, et les places de sac qu'elles ont données.
   */
  public rareTrades: Partial<Record<RareOfferId, number>> = {};

  /** Chantiers offerts par les bonus et pas encore ouverts : le prochain de ce bâtiment arrive livré. */
  private giftedSites: BuildingId[] = [];

  /** Index du chapitre en cours dans `CHAPTERS` ; leur nombre une fois la partie bouclée. */
  public chapter = 0;

  /** Les objectifs réussis : un objectif réussi le reste, et sa récompense ne retombe jamais. */
  public objectivesDone = new Set<ObjectiveId>();

  /** Vrai une fois le dernier objectif réussi : le Signal est lancé, la partie continue sans fin. */
  public victory = false;

  /** Tick de la victoire ; 0 tant qu'elle n'est pas acquise. */
  public victoryTick = 0;

  /** Nuits survécues au moment du Signal : le record de l'écran titre compte celles d'après. */
  public signalNights = 0;

  /**
   * La nuit dont toutes les vagues marchent sur l'antenne : celle qui suit
   * le dernier étage fini. 0 : aucune.
   */
  public lureNight = 0;

  /**
   * Les ouvriers adultes de la colonie, que les bâtiments qui emploient se
   * répartissent (`roster`) : `COLONY.startingWorkers` au départ, un de plus
   * par enfant devenu grand. Construire n'en crée aucun.
   */
  public colonists: number = COLONY.startingWorkers;

  /**
   * Les bases mutantes, debout ou abattues (`data/enemyBases.ts`) : tirées de
   * la seed à la création de la partie, puis de l'état — leurs points de vie.
   */
  public enemyBases: EnemyBase[] = [];

  /** Les compteurs que les objectifs lisent. */
  public stats: WorldStats = emptyStats();

  /** Les compteurs à l'ouverture du chapitre en cours : « tenir 5 nuits », c'est à partir de là. */
  public chapterBase: WorldStats = emptyStats();

  private readonly scheduler = new Scheduler();
  /** Réveils du scheduler au dernier tick — une mesure pour le compteur de performances, pas de l'état. */
  private woken = 0;
  private readonly queue: Command[] = [];
  private readonly log: CommandLogEntry[] = [];
  private rng: StatefulRng;
  private nextId: EntityId = 1;
  private nextMobileId: MobileId = 1;
  private moveX = 0;
  private moveY = 0;

  /** Tuile contre laquelle Adam pousse, et depuis combien de ticks. */
  private contactKey = '';
  private contactTicks = 0;

  /** Centre de la mairie en pixels monde : ce que les mutants visent. */
  private readonly target: { x: number; y: number };

  /** Où Adam s'est éveillé au début de la partie : il s'y réveille s'il tombe et que la mairie n'est plus. */
  private readonly spawnX: number;
  private readonly spawnY: number;

  /**
   * Les tanières habitées, ou vidées par l'arc : seules les tanières qui ont
   * servi sont de l'état. Les autres se relisent dans la seed.
   */
  private readonly dens = new Map<number, { members: number; readyTick: number }>();

  /** Cache des tanières par chunk : un calcul pur, gardé pour ne pas le refaire à chaque passage. */
  private readonly denCache = new Map<string, Den[]>();
  private readonly pigSpotCache = new Map<string, readonly PigSpot[]>();
  /** Le prénom de chaque habitant vivant, par id : tiré à sa venue sans doublon (`pickName`), sauvegardé sous `names`. */
  private readonly givenNames = new Map<MobileId, string>();
  /** Le coffre de chaque chunk déjà regardé, tel que la seed le pose (`sim/chests.ts`). */
  private readonly chestCache = new Map<string, Chest | null>();
  /** Les coffres qu'Adam a ouverts, par id : c'est tout ce qui est de l'état. */
  private readonly openedChests = new Set<number>();
  /** La ruine et le secret de chaque chunk déjà regardé, tels que la seed les pose (`sim/discoveries.ts`). */
  private readonly spotCache = new Map<string, Spot | null>();
  /** Les ruines fouillées et les secrets trouvés, par id. */
  private readonly foundSpots = new Set<number>();

  /** Les réservations des porteurs. Pas de l'état : elles se relisent dans leurs jobs. */
  private readonly jobs = new JobBoard();

  /** Les arbres qu'un bûcheron vise : aucun autre ne les voit. Pas sauvegardé — rejoué depuis les bûcherons. */
  private readonly claimedTrees = new Set<string>();

  /** Le dernier compte d'arbres d'une cabane, cf. `treesLeft()`. */
  private treeCount: { id: EntityId; tick: number; count: number } | null = null;

  /** La météo du tick en cours : relue dans la seed au début de chaque tick, jamais sauvegardée. */
  private spell: WeatherSpell | null = null;

  /**
   * La répartition des ouvriers, cf. `staffing()` : refaite une fois par tick,
   * ou quand un effectif, un bâtiment fini ou tombé la change. Jamais sauvegardée.
   */
  private duty: { tick: number; filled: Map<EntityId, number>; onDuty: Set<MobileId> } | null = null;

  /**
   * La dernière répartition, d'où part la suivante (`allocateStaff`) : qui
   * garde ses ouvriers, qui vient d'en gagner. Sauvegardée sous `staffPosts`.
   */
  private posts: Map<EntityId, StaffPost> | null = null;

  /** La répartition a changé : maisons, postes et cabanes logent leurs nouveaux ouvriers au prochain tick (`lodgeCrews`). */
  private lodging = false;

  /**
   * Les ouvriers entrés dans chaque bâtiment qui emploie sans équipe sur la
   * carte — ferme, carrière, foreuse, forge… —, et sa porte, d'où ils
   * ressortent libres quand il les rend. Jamais sauvegardé : au chargement,
   * il se refait de la répartition (`hostStaff`).
   */
  private readonly hosted = new Map<EntityId, { count: number; x: number; y: number }>();

  /** Dernier « Il vous faut un meilleur équipement », pour ne pas le répéter à chaque tick. Jamais sauvegardé. */
  private resistTick = -Infinity;

  /** La base dont Adam est dans la zone, pour ne l'annoncer qu'en y entrant. Jamais sauvegardé. */
  private zoneBase: number | null = null;

  /**
   * Les régions de la carte (`sim/regions.ts`) et le repaire de leur gardien :
   * tirés de la seed et des bases mutantes, jamais sauvegardés.
   */
  public readonly regions: readonly Region[];

  /**
   * Les régions conquises, la prairie de départ toujours. Un monde neuf les
   * tient toutes — les tests, une partie de test — ; une colonie neuve
   * (`newColony`) n'a que la prairie. Sauvegardé.
   */
  public conquered = new Set<number>(Array.from({ length: REGION_COUNT }, (_, id) => id));

  /** La vie des gardiens blessés, par région ; absent : intact. Sauvegardé. */
  private readonly guardianHp = new Map<number, number>();

  /** Avance à chaque conquête : le voile et la carte du monde se repeignent. Jamais sauvegardé. */
  public regionRevision = 0;

  /** La région où se tient Adam, pour ne l'annoncer qu'en y entrant. Jamais sauvegardé. */
  private hereRegion: number = HOME_REGION_ID;

  /** Depuis quel tick chaque ouvrier dehors est sans travail, cf. `isIdle()`. Jamais sauvegardé. */
  private readonly idleSince = new Map<MobileId, number>();
  /** Jusqu'à quel tick chacun a peur d'un ennemi vu de près (`REACTIONS.fearTicks`) : la bulle. Rien n'est sauvegardé. */
  private readonly fearUntil = new Map<MobileId, number>();
  /** Ceux qui ont eu peur depuis l'aube : leur nuit pèse sur leur moral (`MOOD.scared`), puis le compte repart. */
  private readonly scared = new Set<MobileId>();
  /** La dernière naissance : de quoi faire sourire quelques ouvriers un instant (`REACTIONS.joyTicks`). */
  private joy: { tick: number; kidId: MobileId } | null = null;
  /** Ticks passés à zéro d'un besoin, par habitant et besoin (`famineKey`). Pas sauvegardé : au chargement, le compte repart. */
  private readonly famine = new Map<number, number>();

  /** Le producteur où un habitant va manger ou boire, quand la mairie n'a rien : absent, c'est la mairie. Non sauvegardé, refait au chargement. */
  private readonly mealSites = new Map<number, EntityId>();

  /** Le problème que montre chaque producteur — coffre plein, ouvrier manquant —, cf. `problem()`. Jamais sauvegardé. */
  private readonly problems = new ProblemWatch();

  /** Une colonie neuve : seuls les bâtiments de départ sont au menu. */
  public static newColony(seed: number): World {
    const world = new World(seed);

    world.openBuildings = new Set(START_BUILDINGS);
    // Une seule région : la prairie de départ. Le reste se conquiert.
    world.conquered = new Set([HOME_REGION_ID]);
    // La clairière est connue d'avance : le premier écran montre où l'on vit.
    world.fog.reveal(floorDiv(world.target.x, TILE_SIZE), floorDiv(world.target.y, TILE_SIZE), FOG_VISION.home);

    return world;
  }

  public constructor(seed: number) {
    this.seed = seed >>> 0;
    this.land = new Land(this.seed);
    this.resources = new ResourceIndex(this.seed);
    this.resources.watch((tx, ty) => this.rememberTile(tx, ty));
    this.rng = mulberry32(this.seed ^ 0x3c6ef372);

    const [sx, sy] = findSpawn(this.seed);
    const proto = BUILDINGS[STARTING_BUILDING];

    // La clairière : la mairie au-dessus, Adam en dessous, et rien qui gêne.
    for (let ty = sy - proto.height; ty <= sy + 2; ty += 1) {
      for (let tx = sx - 2; tx <= sx + 2; tx += 1) {
        this.resources.clear(tx, ty);
      }
    }

    this.spawnX = (sx + 0.5) * TILE_SIZE;
    this.spawnY = (sy + 1.5) * TILE_SIZE;
    this.adam = createPlayer(this.spawnX, this.spawnY, adultAge(this.seed, ADAM_SALT));
    this.townHallId = this.openSite(STARTING_BUILDING, sx - 1, sy - proto.height);
    this.target = { x: (sx + 0.5) * TILE_SIZE, y: (sy - proto.height / 2) * TILE_SIZE };

    // Les anneaux de bases mutantes, autour de la mairie, sur des emprises libres.
    this.enemyBases = placeEnemyBases(
      this.seed,
      { x: this.target.x / TILE_SIZE, y: this.target.y / TILE_SIZE },
      (tx, ty) => isBuildable(terrainAt(this.seed, tx, ty)) && !this.resources.at(tx, ty) && this.chunks.isFree(tx, ty, 1, 1),
    );

    // Les régions, et le repaire de chaque gardien : loin des bases mutantes et de leur zone.
    this.regions = placeRegions(this.seed, (tx, ty) => this.chunks.isFree(tx, ty, 1, 1) && !this.enemyBases.some((base) => inBaseZone(base, tx, ty)));

    // Les dix ouvriers de la colonie attendent, libres, devant le chantier de la mairie.
    this.settleColonists();

    // Au départ, seuls les alentours de la mairie et d'Adam sont connus.
    this.watchSight();
  }

  /* ---------------------------------------------------------------- entrée */

  /**
   * Empile une commande. Appelé par `input/` et `ui/`, jamais par `sim/`.
   * Rien n'est appliqué ici : la commande attend le prochain tick.
   */
  public push(command: Command): void {
    if (this.relay) {
      this.relay(command);
      return;
    }
    this.queue.push(command);
  }

  /**
   * Chez l'ami, qui ne fait pas autorité, ses commandes ne s'appliquent pas
   * ici : elles partent à l'hôte (`net/lockstep.ts`), qui les applique et les
   * renvoie avec le tick où elles sont passées. `null` : on fait autorité.
   */
  public relay: ((command: Command) => void) | null = null;

  /** Une commande venue de l'hôte, rejouée au tick où il l'a appliquée : elle passe, même chez l'ami. */
  public replay(command: Command): void {
    this.queue.push(command);
  }

  /** Journal des commandes : seed + ce journal = la partie rejouable. */
  public commandLog(): readonly CommandLogEntry[] {
    return this.log;
  }

  /* ------------------------------------------------------------ sauvegarde */

  /**
   * L'état complet, en données JSON, pris entre deux ticks. Ce qui se
   * régénère depuis la seed n'y est pas ; les commandes pas encore consommées
   * non plus — la sauvegarde se prend quand la file est vide.
   */
  public snapshot(): WorldState {
    // Les venus depuis la dernière seconde ont leur prénom avant d'être rangés.
    this.settleNames(false);

    const partner = this.partner;

    return {
      seed: this.seed,
      tick: this.tickCount,
      rng: this.rng.state(),
      nextId: this.nextId,
      nextMobileId: this.nextMobileId,
      moveX: this.moveX,
      moveY: this.moveY,
      contactKey: this.contactKey,
      contactTicks: this.contactTicks,
      night: this.night,
      cycleStartTick: this.cycleStartTick,
      ...(this.nextWaveTarget !== null && { nextWaveTarget: this.nextWaveTarget }),
      ...(this.bountyNight !== null && { bountyNight: this.bountyNight }),
      ...(this.offeredBoons !== null && { boonOffer: { night: this.offeredBoons.night, choices: [...this.offeredBoons.choices] } }),
      ...(this.dayBoon !== null && { boon: { ...this.dayBoon } }),
      ...(this.daily !== null && { challenge: { ...this.daily } }),
      ...(this.scared.size > 0 && { scared: [...this.scared] }),
      kills: this.kills,
      prestige: this.prestige,
      prestigeSites: [...this.prestigeSites],
      defeated: this.defeated,
      defeatTick: this.defeatTick,
      ...(this.respawnTicks > 0 && { respawnTicks: this.respawnTicks }),
      questsDone: this.questsDone,
      perks: [...this.perks],
      giftedSites: [...this.giftedSites],
      researchDone: [...this.researchDone],
      seenBuildings: [...this.seenBuildings],
      openBuildings: [...this.openBuildings],
      era: this.era,
      rareTrades: { ...this.rareTrades },
      chapter: this.chapter,
      objectivesDone: [...this.objectivesDone],
      victory: this.victory,
      victoryTick: this.victoryTick,
      signalNights: this.signalNights,
      lureNight: this.lureNight,
      colonists: this.colonists,
      staffPosts: [...(this.posts ?? [])].map(([id, { filled, since }]) => ({ id, filled, since })),
      enemyBases: this.enemyBases.map((base) => ({ ...base })),
      regions: { conquered: [...this.conquered].sort((a, b) => a - b), guardians: [...this.guardianHp].map(([id, hp]) => ({ id, hp })) },
      stats: copyStats(this.stats),
      chapterBase: copyStats(this.chapterBase),
      player: savePlayer(this.adam),
      ...(partner && { partner: { ...partner, player: savePlayer(partner.player) } }),
      resources: this.resources.toJSON(),
      planted: this.resources.plantedJSON(),
      crops: this.resources.cropsJSON(),
      cleaned: this.land.toJSON(),
      fog: this.fog.toJSON(),
      entities: [...this.entities.values()].map(saveEntity),
      mobiles: [...this.mobiles.values()].map(copyMobile),
      dens: [...this.dens].map(([id, den]) => ({ id, ...den })),
      names: [...this.givenNames].map(([id, name]) => ({ id, name })),
      chests: [...this.openedChests],
      spots: [...this.foundSpots],
      scheduler: this.scheduler.toJSON(this.tickCount),
    };
  }

  /**
   * Le monde d'une sauvegarde. La seed refait la carte, la clairière et la
   * cible des mutants ; l'état sauvegardé remplace ensuite tout le reste.
   * `state` doit avoir été validé (`sim/save.ts`).
   */
  public static restore(state: WorldState): World {
    const world = new World(state.seed);

    world.load(state);
    return world;
  }

  private load(state: WorldState): void {
    // Le chantier de départ ouvert par le constructeur laisse la place à ceux de la sauvegarde.
    for (const entity of this.entities.values()) {
      this.chunks.release(entity.id, entity.tx, entity.ty, entity.width, entity.height);
    }
    this.entities.clear();

    this.tickCount = state.tick;
    this.rng = mulberry32(state.rng);
    this.nextId = state.nextId;
    this.nextMobileId = state.nextMobileId;
    this.moveX = state.moveX;
    this.moveY = state.moveY;
    this.contactKey = state.contactKey;
    this.contactTicks = state.contactTicks;
    this.night = state.night;
    this.cycleStartTick = state.cycleStartTick;
    this.nextWaveTarget = state.nextWaveTarget ?? null;
    this.bountyNight = state.bountyNight ?? null;
    this.offeredBoons = state.boonOffer ? { night: state.boonOffer.night, choices: [...state.boonOffer.choices] } : null;
    this.dayBoon = state.boon ? { ...state.boon } : null;
    this.daily = state.challenge ? { ...state.challenge } : null;
    this.scared.clear();
    for (const id of state.scared ?? []) this.scared.add(id);
    this.kills = state.kills;
    this.prestige = state.prestige;
    this.prestigeSites.clear();
    for (const key of state.prestigeSites) this.prestigeSites.add(key);
    this.defeated = state.defeated;
    this.defeatTick = state.defeatTick;
    this.respawnTicks = state.respawnTicks ?? 0;
    this.questsDone = state.questsDone;
    this.perks = [...state.perks];
    this.giftedSites = [...state.giftedSites];
    this.researchDone = [...state.researchDone];
    this.seenBuildings = new Set(state.seenBuildings);
    // Une colonie sauvegardée avant que le labo ne soit un bâtiment de départ le retrouve au menu.
    this.openBuildings = new Set([...(state.openBuildings ?? BUILDING_IDS), ...START_BUILDINGS]);
    this.era = state.era ?? 0;
    this.rareTrades = { ...state.rareTrades };
    this.chapter = state.chapter;
    this.objectivesDone = new Set(state.objectivesDone);
    this.victory = state.victory;
    this.victoryTick = state.victoryTick;
    this.signalNights = state.signalNights ?? 0;
    this.lureNight = state.lureNight ?? 0;
    this.stats = copyStats(state.stats);
    this.chapterBase = copyStats(state.chapterBase);

    const { inventory, ...player } = state.player;
    // La taille du sac se relit dans les bonus, les recherches, les récompenses déjà tombées et les trocs.
    const capacity =
      INVENTORY_CAPACITY +
      bagBonus(this.perks) +
      this.bonus('bagCapacity') +
      objectiveBagBonus(state.objectivesDone, state.chapter) +
      caravanBagBonus(this.rareTrades);

    Object.assign(this.adam, player, {
      look: copyLook(player.look),
      wardrobe: [...player.wardrobe],
      unseenPieces: [...player.unseenPieces],
      inventory: Store.fromJSON(capacity, inventory),
    });
    this.partner = state.partner ? restorePartner(state.partner) : null;
    this.resources.restore(state.resources, state.planted, state.tick, state.crops);
    this.land.restore(state.cleaned ?? {});

    for (const saved of state.entities) {
      const entity: Entity =
        saved.kind === 'site'
          ? { ...saved, delivered: { ...saved.delivered }, work: saved.work }
          : { ...saved, priority: saved.priority ?? WORK_PRIORITY.initial, store: Store.fromJSON(BUILDINGS[saved.proto].storage, saved.store) };

      this.entities.set(entity.id, entity);
      this.chunks.occupy(entity.id, entity.tx, entity.ty, entity.width, entity.height);
    }
    // Les filons ont pris un bord droit (la règle des foreuses) : un rocher né sur une case déjà bâtie ou
    // pavée d'une ancienne sauvegarde n'y pousse pas — la case reste comme le joueur l'a laissée.
    for (const entity of this.entities.values()) {
      for (let ty = entity.ty; ty < entity.ty + entity.height; ty += 1) {
        for (let tx = entity.tx; tx < entity.tx + entity.width; tx += 1) this.clearUnder(tx, ty);
      }
    }

    // Une sauvegarde d'avant le Prestige : ses bâtiments debout ne rapporteront plus rien, même rebâtis.
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site') this.prestigeSites.add(prestigeKey(entity));
    }

    this.mobiles.clear();
    for (const mobile of state.mobiles) this.mobiles.set(mobile.id, copyMobile(mobile));

    // Une sauvegarde d'avant les prénoms uniques garde ceux que la seed tirait : `settleNames` les range tels quels.
    this.givenNames.clear();
    for (const { id, name } of state.names ?? []) this.givenNames.set(id, name);
    this.settleNames(state.names === undefined);

    this.dens.clear();
    for (const { id, members, readyTick } of state.dens) this.dens.set(id, { members, readyTick });

    this.openedChests.clear();
    for (const id of state.chests ?? []) this.openedChests.add(id);
    this.foundSpots.clear();
    for (const id of state.spots ?? []) this.foundSpots.add(id);

    // Une sauvegarde d'avant les bases mutantes les découvre autour de la mairie — sauf celles dont la
    // zone tient déjà du bâti, ou dont l'emprise tomberait sur Adam.
    this.enemyBases =
      state.enemyBases === undefined
        ? this.enemyBases.filter((base) => !this.zoneBuilt(base) && !this.playerOnBase(base))
        : state.enemyBases.map((base) => ({ ...base }));

    // Une sauvegarde d'avant les régions : la prairie, et toute région où tient déjà un bâtiment ou une route.
    this.guardianHp.clear();
    if (state.regions) {
      this.conquered = new Set([HOME_REGION_ID, ...state.regions.conquered]);
      for (const { id, hp } of state.regions.guardians) this.guardianHp.set(id, hp);
    } else {
      this.conquered = this.builtRegions();
    }
    this.hereRegion = this.regionAt(floorDiv(this.adam.x, TILE_SIZE), floorDiv(this.adam.y, TILE_SIZE));

    this.scheduler.restore(state.scheduler);
    this.restoreJobs();
    this.restoreLumberjacks();
    this.restoreFarmers();
    this.restoreMeals();

    // Une sauvegarde d'avant la colonie : ses ouvriers étaient ceux qu'emploient ses bâtiments finis — elle les garde.
    this.colonists = state.colonists ?? this.employedByBuildings();

    // Un enfant d'une sauvegarde d'avant les âges a reçu un âge d'adulte : il est ouvrier.
    for (const mobile of [...this.mobiles.values()]) {
      if (mobile.kind === 'kid' && canWork(mobile.age)) this.growUp(mobile, false);
    }

    // Une sauvegarde d'avant l'achèvement automatique peut garder un chantier livré : il s'achève au
    // chargement — sauf s'il attend les bâtisseurs d'un poste de construction.
    this.settleSites();

    // Une maison d'une sauvegarde d'avant les porteurs : ses ouvriers s'y installent. Les lits se
    // revoient avec : une sauvegarde d'avant eux attribue les siens.
    this.duty = null;
    this.posts = state.staffPosts ? new Map(state.staffPosts.map(({ id, filled, since }) => [id, { filled, since }])) : null;
    this.hostStaff(true);
    this.lodgeCrews();

    // Une sauvegarde d'avant le brouillard connaît déjà les alentours de ce qu'elle a bâti, et d'Adam.
    if (state.fog) {
      this.fog.restore(state.fog);
    } else {
      this.fog.restore({ explored: {}, looks: {}, bases: [] });
      for (const entity of this.entities.values()) {
        const center = centerTile(entity);

        this.fog.reveal(center.tx, center.ty, FOG_VISION.legacy + Math.max(entity.width, entity.height) / 2);
      }
      this.fog.reveal(floorDiv(this.adam.x, TILE_SIZE), floorDiv(this.adam.y, TILE_SIZE), FOG_VISION.legacy);
    }
    this.watchSight();
  }

  /** Les postes de tous les bâtiments finis : la colonie d'une sauvegarde d'avant `colonists`. */
  private employedByBuildings(): number {
    let count = 0;

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site') count += BUILDINGS[entity.proto].workers;
    }
    return count;
  }

  /* ------------------------------------------------------------------ tick */

  public tick(): void {
    // Pendant le tick, le joueur est Adam — sur l'écran de l'ami aussi : la simulation ne dépend pas de qui regarde.
    this.acting = this.adam;
    try {
      this.step();
    } finally {
      this.acting = null;
    }
  }

  private step(): void {
    this.tickCount += 1;
    this.drainCommands();
    this.updateWeather();

    const contact = stepPlayer(
      this.player,
      this.dead ? 0 : this.moveX,
      this.dead ? 0 : this.moveY,
      this.playerObstacleAt,
      STEP_SECONDS,
      this.walkSpeed(),
    );

    if (!this.dead) {
      this.handleContact(contact);
      this.watchZone();
      this.watchRegion();
      this.harvestNearby();
      this.openChests();
      this.searchSpots();
    }
    if (this.partner) this.stepPartner(this.partner);
    this.growForest();
    this.stepClock();
    this.corrode();
    this.purify();
    this.stepMobiles();
    this.recover();
    this.stepRespawn();
    this.stepWildlife();
    this.stepPigs();
    this.stepGuards();
    this.stepRegionGuardians();
    this.stepBaseFire();
    this.watchOverColony();
    if (!this.dead) this.shootPlayerBow();

    const due = this.scheduler.due(this.tickCount);

    this.woken = due.length;
    for (const id of due) {
      const entity = this.entities.get(id);

      if (entity) this.wake(entity);
    }

    this.watchProblems();
    this.checkObjectives();
    this.watchUnlocks();
    this.flows.observe(this.tickCount, this.townStock());
    this.watchSight();
  }

  private drainCommands(): void {
    for (const command of this.queue) {
      this.log.push({ tick: this.tickCount, command });
      this.apply(command);
    }
    this.queue.length = 0;
  }

  private apply(command: Command): void {
    // À terre, Adam ne fait rien : ni pas, ni chantier, ni échange. Seul ce qui n'est pas de lui passe — l'ami, lui, joue.
    if (this.dead && this.acting === this.adam && !DEAD_COMMANDS.has(command.type)) return;

    switch (command.type) {
      case 'setMoveAxis':
        this.moveX = clamp(command.x, -1, 1);
        this.moveY = clamp(command.y, -1, 1);
        break;

      case 'placeBuilding': {
        const block = this.placementBlock(command.building, command.tx, command.ty);

        if (block) {
          this.events.emit('placementRejected', { reason: block.reason, ore: block.ore ?? null });
          break;
        }
        this.openSite(command.building, command.tx, command.ty);
        this.seenBuildings.add(command.building);
        break;
      }

      case 'seeBuilding':
        if (this.inMenu(command.building)) this.seenBuildings.add(command.building);
        break;

      case 'seePieces':
        this.player.unseenPieces = this.player.unseenPieces.filter((piece) => !command.pieces.includes(piece));
        break;

      case 'transferToSite':
        this.transfer(command.id);
        break;

      case 'takeFromBuilding':
        this.takeAll(command.id);
        break;

      case 'supplyBuilding':
        this.supplyAll(command.id);
        break;

      case 'depositToTown':
        this.depositToTown(command.item, command.amount);
        break;

      case 'transferItems':
        this.transferItems(command.id, command.direction, command.quantity, command.item);
        break;

      case 'dropItem':
        this.dropFromBag(command.item, command.amount);
        break;

      case 'upgradeBuilding':
        this.upgrade(command.id);
        break;

      case 'advanceEra':
        this.advanceEra();
        break;

      case 'craftGear':
        this.craftGear(command.forge);
        break;

      case 'dressAdam':
        this.dressAdam(command.look);
        break;

      case 'renameInhabitant':
        this.renameInhabitant(command.id, command.name);
        break;

      case 'recruitCompanion':
        this.recruit(command.barracks, command.role);
        break;

      case 'repairBuilding':
        this.repairAll(command.id);
        break;

      case 'applyPerks':
        this.applyPerks(command.perks);
        break;

      case 'grantPieces':
        this.grantPieces(command.pieces, command.silent === true);
        break;

      case 'setFog':
        this.fog.enabled = command.enabled;
        this.fog.revision += 1;
        break;

      case 'catchUp':
        this.catchUp(command.awayMs);
        break;

      case 'startResearch':
        this.chooseResearch(command.lab, command.research);
        break;

      case 'cancelResearch':
        this.cancelResearch(command.lab);
        break;

      case 'dequeueResearch':
        this.dequeueResearch(command.lab, command.research);
        break;

      case 'transferToLab':
        this.transferToLab(command.id);
        break;

      case 'pauseBuilding':
        this.setPaused(command.id, command.paused);
        break;

      case 'setWorkers':
        this.setStaff(command.id, command.count);
        break;

      case 'setPriority':
        this.setPriority(command.id, command.priority);
        break;

      case 'cancelSite':
        this.cancelSite(command.id);
        break;

      case 'removeDecor':
        this.removeDecor(command.id);
        break;

      case 'chooseBoon':
        this.chooseBoon(command.index);
        break;

      case 'trade':
        this.trade(command.caravan, command.offer);
        break;

      case 'partnerJoin':
        this.partnerJoin(command.name);
        break;

      case 'partnerLeave':
        this.partnerLeave();
        break;

      case 'asPartner': {
        const { partner } = this;

        // Une enveloppe dans l'enveloppe ne passe pas : l'ami n'agit qu'une fois, et en son nom.
        if (partner && command.command.type !== 'asPartner') this.asPartner(partner, () => this.apply(command.command));
        break;
      }
    }
  }

  /* --------------------------------------------------------------- à deux */

  /** La vitesse du joueur qui agit, à pleine amplitude : la base, la recherche, la pluie acide hors de l'abri. */
  private walkSpeed(): number {
    const slowed = this.spell && !this.sheltered(this.player.x, this.player.y);
    const speed = slowed && this.spell ? WEATHER[this.spell.id].playerSpeed : 1;

    return (PLAYER_SPEED_TILES + this.bonus('walkSpeed')) * speed;
  }

  /**
   * Fait agir l'ami : le temps de `act`, le joueur est lui — sa position, son
   * sac, son axe, sa tuile heurtée —, puis Adam reprend sa place.
   */
  private asPartner(partner: Partner, act: () => void): void {
    const saved = { acting: this.acting, moveX: this.moveX, moveY: this.moveY, contactKey: this.contactKey, contactTicks: this.contactTicks };

    this.acting = partner.player;
    this.moveX = partner.moveX;
    this.moveY = partner.moveY;
    this.contactKey = partner.contactKey;
    this.contactTicks = partner.contactTicks;
    try {
      act();
    } finally {
      partner.moveX = this.moveX;
      partner.moveY = this.moveY;
      partner.contactKey = this.contactKey;
      partner.contactTicks = this.contactTicks;
      this.acting = saved.acting;
      this.moveX = saved.moveX;
      this.moveY = saved.moveY;
      this.contactKey = saved.contactKey;
      this.contactTicks = saved.contactTicks;
    }
  }

  /** Le pas de l'ami, comme celui d'Adam : il marche, heurte, récolte, ouvre les coffres et fouille les ruines. */
  private stepPartner(partner: Partner): void {
    this.asPartner(partner, () => {
      const contact = stepPlayer(this.player, this.moveX, this.moveY, this.playerObstacleAt, STEP_SECONDS, this.walkSpeed());

      this.handleContact(contact);
      this.harvestNearby();
      this.openChests();
      this.searchSpots();
    });
  }

  /** L'ami entre : à côté d'Adam, sur une case où l'on marche, sac vide. Déjà là, il change seulement de nom. */
  private partnerJoin(raw: string): void {
    const name = partnerName(raw);

    if (this.partner) {
      this.partner.name = name;
      return;
    }

    const { x, y } = this.adam;
    const tx = floorDiv(x, TILE_SIZE);
    const ty = floorDiv(y, TILE_SIZE);
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !this.isSolid(tx + dx!, ty + dy!)) ?? [0, 0];
    const player = createPlayer(x + beside[0]! * TILE_SIZE, y + beside[1]! * TILE_SIZE, this.adam.age);

    player.look = copyLook(PARTNER_LOOK);
    player.wardrobe = Object.values(PARTNER_LOOK.pieces).filter((piece) => !isStarter(piece));
    this.partner = { name, player, moveX: 0, moveY: 0, contactKey: '', contactTicks: 0 };
    this.events.emit('partnerJoined', { name });
  }

  /** L'ami s'en va : rien de son sac ne se perd, il reste en tas là où il se tenait. */
  private partnerLeave(): void {
    const { partner } = this;

    if (!partner) return;
    this.asPartner(partner, () => this.dropFromBag());
    this.partner = null;
    this.events.emit('partnerLeft', { name: partner.name });
  }

  /**
   * Cet écran est celui de l'ami : le joueur, hors du tick, est son
   * personnage — la caméra le suit, le HUD montre son sac, la portée se
   * mesure de lui. La simulation n'en sait rien.
   */
  public viewAsPartner(): void {
    this.viewer = 'partner';
  }

  /** L'ami agit-il en ce moment (son pas, ses commandes) ? Les événements émis alors sont les siens. */
  public get partnerActing(): boolean {
    return this.acting !== null && this.acting !== this.adam;
  }

  /** Le joueur qui agit en ce moment n'est pas celui de cet écran : ce qu'il gagne ou se voit refuser ne s'affiche pas ici. */
  public get otherActing(): boolean {
    if (!this.acting) return false;

    return this.acting !== (this.viewer === 'partner' && this.partner ? this.partner.player : this.adam);
  }

  /**
   * S'abonne à un événement du joueur de cet écran : ses gains, ses refus,
   * son sac. Ceux de l'autre joueur, quand on joue à deux, passent sans bruit.
   */
  public mine<K extends keyof WorldEvents>(event: K, listener: (payload: WorldEvents[K]) => void): () => void {
    return this.events.on(event, (payload) => {
      if (!this.otherActing) listener(payload);
    });
  }

  /** Cet écran suit-il l'ami plutôt qu'Adam ? */
  public get viewingPartner(): boolean {
    return this.viewer === 'partner' && this.partner !== null;
  }

  /**
   * Une empreinte de l'état, comparée d'un écran à l'autre quand on joue à
   * deux (`net/lockstep.ts`) : le tick, le PRNG, les compteurs d'ids, les
   * deux joueurs, chaque mobile et chaque coffre. Deux mondes qui ont rejoué
   * les mêmes commandes ont la même ; une différence dit qu'ils ont divergé.
   */
  public checksum(): number {
    let hash = 0x811c9dc5;
    const mix = (value: number): void => {
      hash = Math.imul(hash ^ (value | 0), 0x01000193) >>> 0;
    };
    const mixText = (text: string): void => {
      for (let i = 0; i < text.length; i += 1) mix(text.charCodeAt(i));
    };
    const mixPoint = (x: number, y: number): void => {
      mix(Math.round(x * 64));
      mix(Math.round(y * 64));
    };
    const mixStore = (store: Store): void => {
      for (const [item, count] of store.entries()) {
        mixText(item);
        mix(count);
      }
    };

    mix(this.tickCount);
    mix(this.rng.state());
    mix(this.nextId);
    mix(this.nextMobileId);
    mixPoint(this.adam.x, this.adam.y);
    mix(this.adam.hp);
    mixStore(this.adam.inventory);
    if (this.partner) {
      mixPoint(this.partner.player.x, this.partner.player.y);
      mixStore(this.partner.player.inventory);
    }
    for (const mobile of this.mobiles.values()) {
      mix(mobile.id);
      mixText(mobile.kind);
      mixPoint(mobile.x, mobile.y);
    }
    for (const entity of this.entities.values()) {
      mix(entity.id);
      mixText(entity.kind);
      if (entity.kind !== 'site') mixStore(entity.store);
    }
    return hash;
  }

  /** Des pièces offertes par des succès : jamais un doublon, jamais une pièce du départ. */
  private grantPieces(pieces: readonly PieceId[], silent: boolean): void {
    for (const piece of new Set(pieces)) {
      if (!Object.hasOwn(PIECES, piece) || isStarter(piece) || this.player.wardrobe.includes(piece)) continue;
      this.player.wardrobe.push(piece);
      if (silent) continue;
      this.player.unseenPieces.push(piece);
      this.events.emit('pieceFound', { piece, source: 'achievement' });
    }
  }

  /**
   * Les bonus du jardin, au départ de la colonie : un sac plus grand, de quoi
   * démarrer, un chantier offert, une récolte plus vive. Refusés une fois la
   * partie lancée — un bonus ne s'ajoute pas en cours de route — et appliqués
   * une seule fois, doublons écartés.
   */
  private applyPerks(perks: readonly PerkId[]): void {
    if (this.tickCount > 1 || this.perks.length > 0) return;

    const unique = [...new Set(perks)].filter((id) => Object.hasOwn(PERKS, id));

    if (unique.length === 0) return;

    const { inventory } = this.player;

    this.perks = unique;
    this.giftedSites = freeSites(unique);
    this.player.inventory = Store.fromJSON(inventory.capacity + bagBonus(unique), inventory.toJSON());

    for (const [item, amount] of Object.entries(startingItems(unique)) as [ItemId, number][]) {
      this.player.inventory.add(item, amount);
    }
  }

  /* ---------------------------------------------------------------- chantier */

  /** Le chantier existe-t-il encore, et Adam est-il à portée ? */
  private siteFor(id: EntityId): { site: Site } | { reason: SiteRejection } {
    const entity = this.entities.get(id);

    if (entity?.kind !== 'site') return { reason: 'missing' };
    if (!this.inReach(entity)) return { reason: 'outOfReach' };
    return { site: entity };
  }

  /** Adam est-il assez près de l'emprise pour y travailler ? Même portée que le placement. */
  public inReach(entity: Entity): boolean {
    const centerX = (entity.tx + entity.width / 2) * TILE_SIZE;
    const centerY = (entity.ty + entity.height / 2) * TILE_SIZE;
    const reach = BUILD_REACH_TILES * TILE_SIZE;

    return distanceSq(this.player.x, this.player.y, centerX, centerY) <= reach * reach;
  }

  /**
   * Tout ce que le chantier attend, en une fois : le sac d'abord, puis le
   * stock de la ville pour ce qui manque encore, si le chantier est dans le
   * rayon de la mairie. La ville ne donne que son disponible — ce que les
   * porteurs ont déjà promis n'est pas à elle.
   */
  private transfer(id: EntityId): void {
    const found = this.siteFor(id);

    if ('reason' in found) {
      this.events.emit('siteRejected', { id, reason: found.reason });
      return;
    }

    const { site } = found;
    const town = this.townStockFor(site);
    let moved = this.transferFrom(site, this.player.inventory, 'bag');

    if (town) moved += this.transferFrom(site, town, 'town');

    if (moved === 0) {
      this.events.emit('siteRejected', { id, reason: 'nothingToGive' });
      return;
    }
    this.settle(site);
  }

  /**
   * Ce que le chantier attend encore, pris dans `from`. Renvoie le nombre
   * d'objets posés. Le sac livre tout ce qui manque, comme au contact ; la
   * ville ne livre pas ce qu'un porteur apporte déjà.
   */
  private transferFrom(site: Site, from: Store, source: 'bag' | 'town'): number {
    let moved = 0;

    for (const item of Object.keys(BUILDINGS[site.proto].cost) as ItemId[]) {
      const amount = Math.min(this.siteNeeds(site, item, source), from.available(item));

      if (amount <= 0) continue;

      from.remove(item, amount);
      site.delivered[item] = (site.delivered[item] ?? 0) + amount;
      moved += amount;
      this.events.emit('siteDelivered', { id: site.id, item, amount, missing: siteMissing(site), source });
      this.countChallenge('deliver', amount);
    }
    return moved;
  }

  /**
   * Ce qu'un « Transférer » poserait sur le chantier : l'UI grise le bouton
   * sur cette réponse, le tick décide sur la même.
   */
  public canTransfer(site: Site): boolean {
    const town = this.townStockFor(site);

    return (Object.keys(BUILDINGS[site.proto].cost) as ItemId[]).some(
      (item) =>
        (this.siteNeeds(site, item, 'bag') > 0 && this.player.inventory.count(item) > 0) ||
        (this.siteNeeds(site, item, 'town') > 0 && (town?.available(item) ?? 0) > 0),
    );
  }

  private siteNeeds(site: Site, item: ItemId, source: 'bag' | 'town'): number {
    if (source === 'town') return this.jobs.siteWants(site, item);

    const needed = (BUILDINGS[site.proto].cost as Partial<Record<ItemId, number>>)[item] ?? 0;

    return Math.max(0, needed - (site.delivered[item] ?? 0));
  }

  /* ------------------------------------------------------------ amélioration */

  /** La recherche du labo que le niveau suivant attend encore, ou `null` : rien ne le retient. */
  public upgradeLocked(building: Building): ResearchId | null {
    const research = nextUpgrade(building.proto, building.level)?.research;

    return research !== undefined && isResearchId(research) && !this.researchDone.includes(research) ? research : null;
  }

  /**
   * Ce qui manque, objet par objet, pour payer le niveau suivant : ni dans
   * le sac, ni dans le disponible de la ville à portée. Vide si tout y est ;
   * `null` si le bâtiment ne peut plus monter. L'UI écrit ces manques en
   * rouge, le tick décide sur la même réponse.
   */
  public upgradeMissing(building: Building): Partial<Record<ItemId, number>> | null {
    const upgrade = nextUpgrade(building.proto, building.level);

    // L'étage d'une antenne ne s'achète pas : il se livre (`sim/antenna.ts`).
    if (!upgrade || building.kind === 'antenna') return null;

    const town = this.townStockFor(building);
    const missing: Partial<Record<ItemId, number>> = {};

    for (const [item, needed] of Object.entries(upgrade.cost) as [ItemId, number][]) {
      const short = needed - this.player.inventory.available(item) - (town?.available(item) ?? 0);

      if (short > 0) missing[item] = short;
    }
    return missing;
  }

  /**
   * Le niveau suivant, tout de suite, contre son coût entier : le sac
   * d'abord, puis la ville — comme un « Transférer » sur un chantier. Les
   * points de vie gardent leur proportion : une tour à moitié cassée le
   * reste, sur un maximum plus haut.
   */
  private upgrade(id: EntityId): void {
    const building = this.entities.get(id);
    const reject = (reason: UpgradeRejection): void => this.events.emit('upgradeRejected', { id, reason });

    if (!building || building.kind === 'site') return reject('missing');
    if (building.kind === 'antenna') return reject('delivered');
    if (!this.inReach(building)) return reject('outOfReach');

    const upgrade = nextUpgrade(building.proto, building.level);
    const missing = this.upgradeMissing(building);

    if (!upgrade || !missing) return reject('maxLevel');
    if (this.upgradeLocked(building) !== null) return reject('locked');
    if (Object.keys(missing).length > 0) return reject('missingItems');

    const town = this.townStockFor(building);
    const fromBag: [ItemId, number][] = [];

    for (const [item, needed] of Object.entries(upgrade.cost) as [ItemId, number][]) {
      const bag = Math.min(needed, this.player.inventory.available(item));

      if (bag > 0) {
        this.player.inventory.remove(item, bag);
        fromBag.push([item, bag]);
      }
      if (needed > bag) town?.remove(item, needed - bag);
    }

    const before = buildingLevel(building.proto, building.level).hp;

    building.level += 1;
    building.hp = Math.max(1, Math.round((building.hp / before) * upgrade.hp));
    this.events.emit('buildingUpgraded', { id, level: building.level, fromBag });
  }

  /* ------------------------------------------------------------------ ères */

  /**
   * « Passer au Bourg » : toutes les conditions de l'ère suivante tiennent
   * (`sim/eras.ts`), son investissement se paie d'un coup — le sac d'abord,
   * puis la ville —, et elle ouvre ses bâtiments au menu. Son onglet de
   * recherches s'ouvre au labo, sa menace rejoint les nuits.
   */
  private advanceEra(): void {
    const next = nextEra(this.era);

    if (next === null) {
      this.events.emit('eraRejected', { reason: 'lastEra' });
      return;
    }
    if (!eraReady(this)) {
      this.events.emit('eraRejected', { reason: 'notReady' });
      return;
    }

    const proto: EraProto = ERAS[next]!;
    const town = this.townStock();
    const fromBag: [ItemId, number][] = [];

    for (const [item, needed] of Object.entries(proto.requires?.invest ?? {}) as [ItemId, number][]) {
      const bag = Math.min(needed, this.player.inventory.available(item));

      if (bag > 0) {
        this.player.inventory.remove(item, bag);
        fromBag.push([item, bag]);
      }
      if (needed > bag) town?.remove(item, needed - bag);
    }

    const opened = proto.opens.filter((id) => !this.openBuildings.has(id));

    for (const id of proto.opens) this.openBuildings.add(id);
    this.era = next;
    this.events.emit('eraReached', { era: next, opened, fromBag });
  }

  /** La recherche est-elle à la portée de l'ère atteinte ? Son onglet s'ouvre avec son ère. */
  public researchOpen(research: ResearchId): boolean {
    return RESEARCH[research].era <= this.era;
  }

  /* ------------------------------------------------------------ réparation */

  /**
   * Ce qu'Adam peut poser sur le bâtiment pour le réparer, d'ici : le bois
   * du sac, puis celui de la ville si le bâtiment est dans son rayon.
   */
  public repairStock(building: Building): number {
    return this.player.inventory.available(REPAIR.item) + (this.townStockFor(building)?.available(REPAIR.item) ?? 0);
  }

  /** Le bouton « Réparer » : tout le bois qu'il faut, le sac d'abord, puis la ville. */
  private repairAll(id: EntityId): void {
    const building = this.entities.get(id);
    const reject = (reason: RepairRejection): void => this.events.emit('repairRejected', { id, reason });

    if (!building || building.kind === 'site') return reject('missing');
    if (!this.inReach(building)) return reject('outOfReach');
    if (repairCost(building) === 0) return reject('intact');
    if (this.repairStock(building) === 0) return reject('noMaterial');
    this.repair(building, this.townStockFor(building));
  }

  /**
   * Pose sur le bâtiment le bois qu'il lui faut, dans la limite du sac puis
   * de `town` ; chaque objet rend `REPAIR.hp` points de vie.
   */
  private repair(building: Building, town: Store | null): void {
    const cost = repairCost(building);
    const fromBag = Math.min(cost, this.player.inventory.available(REPAIR.item));
    const fromTown = Math.min(cost - fromBag, town?.available(REPAIR.item) ?? 0);
    const amount = fromBag + fromTown;

    if (amount <= 0) return;
    if (fromBag > 0) this.player.inventory.remove(REPAIR.item, fromBag);
    if (fromTown > 0) town?.remove(REPAIR.item, fromTown);

    building.hp = Math.min(buildingLevel(building.proto, building.level).hp, building.hp + amount * REPAIR.hp);
    this.events.emit('playerRepaired', { id: building.id, hp: building.hp, item: REPAIR.item, amount, fromBag });
  }

  /* -------------------------------------------------------------- caravane */

  /** La caravane de troc, si elle est de passage — en route, garée ou sur le départ. */
  public caravan(): Caravan | undefined {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'caravan') return mobile;
    }
    return undefined;
  }

  /** Adam est-il au contact de la charrette ? */
  public caravanInReach(caravan: Caravan): boolean {
    return distanceSq(this.player.x, this.player.y, caravan.x, caravan.y) <= CARAVAN.reach * CARAVAN.reach;
  }

  /** La caravane est-elle dans le rayon de la mairie ? Alors un échange puise aussi dans la ville. */
  public caravanInTownRange(caravan: Caravan): boolean {
    return this.townStockForCaravan(caravan) !== null;
  }

  private townStockForCaravan(caravan: Caravan): Store | null {
    const hall = this.warehouse();

    return hall && pointInLogisticRange(hall, caravan.x, caravan.y) ? hall.store : null;
  }

  /** Ce qui manquerait pour payer l'échange : ni dans le sac, ni dans la ville à portée. Vide : il se paie. */
  public tradeMissing(caravan: Caravan, trade: TradeOffer): [ItemId, number][] {
    const town = this.townStockForCaravan(caravan);

    return tradeCost(trade).flatMap(([item, needed]): [ItemId, number][] => {
      const short = needed - this.player.inventory.available(item) - (town?.available(item) ?? 0);

      return short > 0 ? [[item, short]] : [];
    });
  }

  /**
   * Un échange, tout ou rien : le coût, le sac d'abord, puis la ville si la
   * caravane est dans son rayon — comme « Renforcer » ; puis ce qu'il
   * rapporte, le sac d'abord agrandi, puis rempli, le surplus à la mairie.
   */
  private trade(id: MobileId, index: number): void {
    const caravan = this.mobiles.get(id);
    const reject = (reason: TradeRejection): void => this.events.emit('tradeRejected', { id, reason });

    if (caravan?.kind !== 'caravan' || caravan.state !== 'parked') return reject('missing');

    const trade = caravan.offers[index];

    if (!trade) return reject('missing');
    if (!this.caravanInReach(caravan)) return reject('outOfReach');
    if (trade.done || (trade.rare && (this.rareTrades[trade.rare] ?? 0) >= RARE_OFFERS[trade.rare].limit)) return reject('done');
    if (this.tradeMissing(caravan, trade).length > 0) return reject('missingItems');

    const town = this.townStockForCaravan(caravan);
    const fromBag: [ItemId, number][] = [];

    for (const [item, needed] of tradeCost(trade)) {
      const bag = Math.min(needed, this.player.inventory.available(item));

      if (bag > 0) {
        this.player.inventory.remove(item, bag);
        fromBag.push([item, bag]);
      }
      if (needed > bag) town?.remove(item, needed - bag);
    }

    trade.done = true;
    if (trade.rare) this.rareTrades[trade.rare] = (this.rareTrades[trade.rare] ?? 0) + 1;

    const stored = this.grant({ items: trade.items, bag: trade.bag });

    this.events.emit('traded', { id, offer: index, fromBag, stored });
  }

  /**
   * La caravane part de loin vers le bord de la clairière, ses offres tirées
   * sur ce que la ville a à cet instant. Une seule à la fois.
   */
  private sendCaravan(day: number): void {
    if (this.caravan()) return;

    const town = this.townStock();
    const route = caravanRoute(this.seed, day, this.target, this.isSolid);
    const offers = drawOffers(this.seed, day, (item) => town?.available(item) ?? 0, this.rareTrades);
    const caravan = createCaravan(this.nextMobileId++, day, route, offers);

    this.mobiles.set(caravan.id, caravan);
    this.events.emit('caravanArriving', { id: caravan.id, day });
  }

  /** La charrette roule, attend `CARAVAN.stay` ticks garée — Adam au contact ouvre le troc —, puis repart. */
  private stepCaravan(caravan: Caravan): void {
    switch (caravan.state) {
      case 'arriving':
        if (rideTo(caravan, caravan.parkX, caravan.parkY, STEP_SECONDS)) {
          caravan.state = 'parked';
          caravan.leaveTick = this.tickCount + CARAVAN.stay;
        }
        break;

      case 'parked': {
        const near = this.caravanInReach(caravan);

        caravan.prevX = caravan.x;
        caravan.prevY = caravan.y;
        if (near && !caravan.met) this.events.emit('caravanReached', { id: caravan.id });
        caravan.met = near;

        if (this.tickCount >= caravan.leaveTick) {
          caravan.state = 'leaving';
          caravan.met = false;
          this.events.emit('caravanLeaving', { id: caravan.id });
        }
        break;
      }

      case 'leaving':
        if (rideTo(caravan, caravan.fromX, caravan.fromY, STEP_SECONDS)) this.mobiles.delete(caravan.id);
        break;
    }
  }

  /* ------------------------------------------------------- ville et sac */

  /**
   * Le stock de la ville : le coffre de la mairie, une fois bâtie. `null`
   * tant qu'elle est en chantier, ou si elle est tombée.
   *
   * La frontière est là : le **sac** (`player.inventory`, plafonné) est ce
   * qu'Adam porte sur lui — ce qu'il a récolté, ramassé ou pris dans un
   * coffre et pas encore déposé ; la **ville** est ce qui a été déposé à la
   * mairie, par Adam ou par les porteurs. Les chantiers puisent dans les
   * deux : au contact et au bouton, dans le sac ; au bouton et par les
   * porteurs, dans la ville.
   */
  public townStock(): Store | null {
    return this.warehouse()?.store ?? null;
  }

  /** La mairie finie, dont le coffre est le stock de la ville ; `null` tant qu'elle est en chantier ou tombée. */
  public warehouse(): TownHall | null {
    const hall = this.entities.get(this.townHallId);

    return hall?.kind === 'townHall' ? hall : null;
  }

  /**
   * Le stock de la ville, si le chantier est dans le rayon logistique de la
   * mairie (`logisticRadius`, le cercle jaune du mode construction). Hors du
   * rayon, on livre à la main ou par les porteurs : un stock global trop
   * pratique les rendrait inutiles.
   */
  private townStockFor(entity: Entity): Store | null {
    const hall = this.warehouse();

    return hall && inLogisticRange(hall, entity) ? hall.store : null;
  }

  /** Le chantier (ou le bâtiment) est-il dans le rayon de la mairie finie ? */
  public inTownRange(entity: Entity): boolean {
    return this.townStockFor(entity) !== null;
  }

  /** Ce qui manquerait encore au chantier après « Transférer » : ni dans le sac, ni dans la ville à sa portée. */
  public shortfall(site: Site): number {
    return this.transferPlan(site).short;
  }

  /**
   * D'où viendrait ce que « Transférer » poserait : le sac seul, la ville
   * seule, les deux — ou `short` s'il manque encore de quoi l'achever.
   */
  public siteCoverage(site: Site): SiteCoverage {
    const { fromBag, fromTown, short } = this.transferPlan(site);

    if (short > 0) return 'short';
    if (fromBag > 0 && fromTown > 0) return 'both';
    return fromTown > 0 ? 'town' : 'bag';
  }

  /** Le même calcul que `transferFrom`, sac puis ville, sans rien déplacer. */
  private transferPlan(site: Site): { fromBag: number; fromTown: number; short: number } {
    const town = this.townStockFor(site);
    const plan = { fromBag: 0, fromTown: 0, short: 0 };

    for (const item of Object.keys(BUILDINGS[site.proto].cost) as ItemId[]) {
      const needed = this.siteNeeds(site, item, 'bag');
      const fromBag = Math.min(needed, this.player.inventory.available(item));
      const fromTown = Math.min(Math.max(0, this.siteNeeds(site, item, 'town') - fromBag), town?.available(item) ?? 0);

      plan.fromBag += fromBag;
      plan.fromTown += fromTown;
      plan.short += needed - fromBag - fromTown;
    }
    return plan;
  }

  /** Adam peut-il déposer en ville d'ici ? La mairie doit être debout et à portée. */
  public nearTown(): boolean {
    const hall = this.entities.get(this.townHallId);

    return hall?.kind === 'townHall' && this.inReach(hall);
  }

  /** Le bouton « Déposer en ville » : le sac, ou un seul objet, passe dans le coffre de la mairie. */
  private depositToTown(only?: ItemId, amount?: number): void {
    const town = this.townStock();

    if (!town) {
      this.events.emit('depositRejected', { reason: 'noTown' });
      return;
    }
    if (!this.nearTown()) {
      this.events.emit('depositRejected', { reason: 'outOfReach' });
      return;
    }

    const { inventory } = this.player;
    const entries = bagPart(inventory.entries(), only, amount);

    if (entries.length === 0) {
      this.events.emit('depositRejected', { reason: 'empty' });
      return;
    }

    this.depositFromBag(town, entries);
  }

  /** Passe ces objets du sac dans le coffre de la mairie — au bouton, ou quand Adam la heurte. */
  private depositFromBag(town: Store, entries: [ItemId, number][]): void {
    const { inventory } = this.player;

    for (const [item, count] of entries) {
      const amount = town.add(item, inventory.remove(item, count));

      this.events.emit('townDeposited', { item, amount });
    }
  }

  /**
   * « Jeter » : ce qu'Adam porte tombe à ses pieds, un tas par objet — le
   * même tas que le butin, ramassable en repassant dessus, une fois qu'Adam
   * s'en est éloigné. Rien n'est détruit : le tas s'efface seulement s'il
   * est oublié, comme le butin.
   */
  private dropFromBag(only?: ItemId, amount?: number): void {
    const { inventory } = this.player;
    const dropped = bagPart(inventory.entries(), only, amount);

    // Les tas s'alignent juste devant ses pieds : sous lui, son sprite les cacherait.
    for (const [index, [item, count]] of dropped.entries()) {
      const amount = inventory.remove(item, count);
      const x = this.player.x + (index - (dropped.length - 1) / 2) * DROP_SPACING;
      const pickup = this.spawnPickup(item, amount, x, this.player.y + DROP_AHEAD, true);

      this.events.emit('itemDropped', { id: pickup.id, item, amount, x: pickup.x, y: pickup.y });
    }
  }

  /* -------------------------------------------------------------- collision */

  /**
   * Une tuile est solide si on ne peut pas y marcher : eau, ressource de
   * surface encore debout, ou emprise d'un bâtiment — chantier compris.
   * Fonction fléchée : elle est passée telle quelle à `stepPlayer`.
   */
  public readonly isSolid = (tx: number, ty: number): boolean =>
    !isWalkable(terrainAt(this.seed, tx, ty)) ||
    this.resources.isSolid(tx, ty) ||
    this.chunks.occupantAt(tx, ty) !== undefined;

  /**
   * Ce qui arrête Adam, au pixel près : la tuile pleine, sauf sous un arbre
   * où seul le tronc compte. Une forêt ne l'enferme jamais, sac plein ou non.
   */
  private readonly playerObstacleAt = (tx: number, ty: number): TileBox | null => {
    if (!isWalkable(terrainAt(this.seed, tx, ty)) || this.chunks.occupantAt(tx, ty) !== undefined) return FULL_TILE;
    if (this.enemyBaseAt(tx, ty)) return FULL_TILE;

    const resource = this.resources.at(tx, ty);

    if (!resource) return null;
    return RESOURCES[resource.id].hitbox === 'trunk' ? TRUNK : FULL_TILE;
  };

  /** La tuile est-elle pavée ? Ce que lit le pas d'Adam et des ouvriers ; jamais celui d'un mutant ni d'une bête. */

  /** Ce qui arrête une bête qui se faufile entre les arbres : l'eau et le bâti, rien d'autre. */
  private readonly isOpenGroundSolid = (tx: number, ty: number): boolean =>
    !isWalkable(terrainAt(this.seed, tx, ty)) || this.chunks.occupantAt(tx, ty) !== undefined;

  /* ---------------------------------------------------------------- contact */

  /**
   * Adam n'a pas de bouton d'action : il pousse contre un chantier, et le
   * chantier se remplit ; contre une foreuse ou une ferme, et leur coffre
   * passe dans son sac. Le compteur repart à zéro dès qu'il change de cible
   * ou s'écarte, pour qu'on ne puisse pas « charger » une livraison ailleurs.
   */
  private handleContact(contact: Contact | null): void {
    if (!contact) {
      this.contactKey = '';
      this.contactTicks = 0;
      return;
    }

    const key = coordKey(contact.tx, contact.ty);

    if (key !== this.contactKey) {
      this.contactKey = key;
      this.contactTicks = 0;
    }
    this.contactTicks += 1;

    const occupant = this.chunks.occupantAt(contact.tx, contact.ty);
    const entity = occupant === undefined ? undefined : this.entities.get(occupant);
    const base = this.enemyBaseAt(contact.tx, contact.ty);

    // Une base mutante heurtée avec un arc trop faible, ou sous le bouclier de son chef : le joueur sait pourquoi rien ne bouge.
    if (base && isShielded(base)) this.shielded(base);
    else if (base && !canDamage(base, this.player.gear)) this.resist(base);

    // Un bâtiment abîmé heurté avec du bois dans le sac se répare — avant que la mairie n'avale le sac.
    if (entity && entity.kind !== 'site' && this.contactTicks % DELIVER_TICKS === 0) this.repair(entity, null);

    // La mairie finie heurtée avale tout le sac, une fois par contact.
    if (entity?.kind === 'townHall' && this.contactTicks === DELIVER_TICKS) {
      this.depositFromBag(entity.store, this.player.inventory.entries());
    }

    if (this.contactTicks % DELIVER_TICKS !== 0) return;

    if (entity?.kind === 'site') this.deliver(entity);
    else if (entity?.kind === 'drill' || entity?.kind === 'farm' || entity?.kind === 'quarry' || entity?.kind === 'pigPen' || entity?.kind === 'lumberCamp') {
      this.collect(entity);
    }
    else if (entity?.kind === 'nursery') this.supplyOne(entity);
    else if (entity?.kind === 'lab') this.supplyLabOne(entity);
    else if (entity?.kind === 'antenna') this.supplyFloorOne(entity);
    // La forge prend d'abord ce qu'Adam lui apporte, puis lui rend ses plaques.
    else if (entity?.kind === 'forge' && !this.supplyOne(entity)) this.collect(entity);
  }

  /**
   * La récolte de proximité : Adam s'approche, la récolte est automatique,
   * qu'il marche ou non. Seules les tuiles autour de lui sont interrogées,
   * jamais la carte, et en distances au carré. Sac plein, rien n'est pris et
   * le HUD le dit — rien n'est jeté.
   */
  private harvestNearby(): void {
    if (this.tickCount % HARVEST_PASS_TICKS !== 0) return;

    const { player } = this;
    const reach = HARVEST_REACH_TILES * TILE_SIZE;
    const span = Math.ceil(HARVEST_REACH_TILES);
    const px = floorDiv(player.x, TILE_SIZE);
    const py = floorDiv(player.y, TILE_SIZE);
    const nodes: { tx: number; ty: number; id: ResourceId; d2: number }[] = [];

    player.harvesting = false;

    for (let ty = py - span; ty <= py + span; ty += 1) {
      for (let tx = px - span; tx <= px + span; tx += 1) {
        const resource = this.resources.at(tx, ty);

        // Dans la zone d'une base mutante debout, rien ne se récolte.
        if (!resource || this.enemyZoneAt(tx, ty)) continue;

        const d2 = distanceSq(player.x, player.y, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);

        if (d2 <= reach * reach) nodes.push({ tx, ty, id: resource.id, d2 });
      }
    }

    if (nodes.length === 0) return;
    if (player.inventory.freeSpace() <= 0) {
      this.events.emit('inventoryFull', {});
      return;
    }

    nodes.sort((a, b) => a.d2 - b.d2);

    const refused = new Set<ItemId>();

    for (const node of nodes.slice(0, HARVEST_MAX_NODES)) {
      const { item } = RESOURCES[node.id];

      // Assez de cet objet dans le sac : Adam n'en prend plus, et le joueur le voit.
      if (player.inventory.count(item) >= this.carryLimit(item)) {
        if (!refused.has(item)) {
          const plenty = this.townHasPlenty(item);

          this.events.emit('harvestRefused', { tx: node.tx, ty: node.ty, item, wanted: plenty ? this.awaited(item) : this.wanted(item), plenty });
        }
        refused.add(item);
        continue;
      }
      player.harvesting = true;

      // Hache ou pioche reçues d'Ève : un nœud donne plus d'une unité par passage.
      const pass = this.tickCount / HARVEST_PASS_TICKS;
      const base = harvestYieldWith(this.perks, node.id, harvestYieldWithTools(node.id, this.questsDone), pass);
      // Haches affûtées (labo) : une part de bois en plus, répartie sur les passages.
      const units = item === 'wood' ? base + extraUnits(base, this.bonus('woodYield'), pass) : base;

      for (let i = 0; i < units; i += 1) {
        if (player.inventory.freeSpace() <= 0) {
          this.events.emit('inventoryFull', {});
          return;
        }
        if (player.inventory.count(item) >= this.carryLimit(item)) break;
        this.harvest(node.tx, node.ty);
      }
    }
  }

  private harvest(tx: number, ty: number): void {
    const { inventory } = this.player;
    const taken = this.resources.take(tx, ty);

    if (!taken) return;

    const item = RESOURCES[taken.resource.id].item;
    // L'arc-en-ciel double la récolte ; ce qui ne tient pas dans le sac reste sur place, pas perdu : la tuile n'a perdu qu'une unité.
    const amount = inventory.add(item, this.spell ? WEATHER[this.spell.id].harvestYield : 1);

    // Le chunk ne rebake que si l'aspect de la tuile change : entamé, ou disparu.
    if (taken.stageChanged) this.dirtyTile(tx, ty);

    this.events.emit('resourceHarvested', { tx, ty, item, amount, remaining: taken.resource.remaining });
    this.countChallenge('harvest', amount, item);
    this.findSpecialty(tx, ty, taken.resource.remaining);
  }

  /**
   * Dans une région conquise, une récolte déniche parfois sa spécialité
   * (`BIOMES[].findChance`) — un tirage haché de la tuile, de ce qu'il en
   * reste et du tick, pas du PRNG du monde. Sac plein, elle reste où elle était.
   */
  private findSpecialty(tx: number, ty: number, remaining: number): void {
    const id = this.regionAt(tx, ty);

    if (id === HOME_REGION_ID || !this.conquered.has(id)) return;

    const biome = BIOMES[this.regions[id]!.biome];

    if (!biome.specialty) return;
    if (hash3(hash3(this.seed ^ SPECIALTY_SALT, tx, ty), remaining, this.tickCount) / 4294967296 >= biome.findChance) return;

    const amount = this.player.inventory.add(biome.specialty, 1);

    if (amount > 0) this.events.emit('specialtyFound', { item: biome.specialty, amount, tx, ty });
  }

  /**
   * Ce qui attend encore cet objet : les chantiers ouverts, tous confondus,
   * plus ce que nurseries et forges acceptent pour leur recette. Une fois la
   * mairie debout, la ville prend tout — son coffre est sans fond : tout
   * objet y est utile. C'est ce qui rend un objet utile dans le sac.
   */
  public wanted(item: ItemId): number {
    if (this.townStock()) return Infinity;
    return this.awaited(item);
  }

  /** Ce que chantiers ouverts et recettes attendent encore de cet objet, ville ou pas. */
  private awaited(item: ItemId): number {
    let wanted = 0;

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site') {
        wanted += this.accepts(entity, item);
        continue;
      }
      wanted += this.siteNeeds(entity, item, 'bag');
    }
    return wanted;
  }

  /**
   * Combien Adam accepte d'en porter : ce qui l'attend, plus une petite
   * réserve. Au-delà, la récolte de cet objet est refusée. La ville prend
   * tout, sauf ce dont elle a déjà assez (`TOWN_PLENTY`) : alors on revient
   * à ce que chantiers et recettes attendent.
   */
  public carryLimit(item: ItemId): number {
    if (this.townStock() && !this.townHasPlenty(item)) return Infinity;
    return this.awaited(item) + SPARE_CARRY;
  }

  /** La ville a-t-elle assez de cet objet pour qu'Adam ne le ramasse plus en passant ? */
  public townHasPlenty(item: ItemId): boolean {
    return (this.townStock()?.available(item) ?? 0) >= TOWN_PLENTY;
  }

  /** Pose un objet du sac sur le chantier — le premier qui manque et qu'Adam possède. Au contact, le chantier se remplit à vue. */
  private deliver(site: Site): void {
    const cost = BUILDINGS[site.proto].cost;
    const { inventory } = this.player;

    for (const [item, needed] of Object.entries(cost) as [ItemId, number][]) {
      const delivered = site.delivered[item] ?? 0;

      if (delivered >= needed || inventory.count(item) === 0) continue;

      inventory.remove(item, 1);
      site.delivered[item] = delivered + 1;

      const missing = siteMissing(site);

      this.events.emit('siteDelivered', { id: site.id, item, amount: 1, missing, source: 'bag' });
      this.countChallenge('deliver', 1);

      // Le dernier objet posé achève le chantier : le joueur a déjà fait l'effort. Sauf dans le rayon
      // d'un poste de construction, où les bâtisseurs viennent le bâtir.
      if (missing === 0) this.settle(site);
      return;
    }
  }

  /**
   * Prend un objet du coffre d'une foreuse, d'une ferme ou d'une forge
   * heurtée : au contact, le coffre se vide à vue, comme un chantier se remplit.
   */
  private collect(producer: Producer): void {
    const [item] = this.takeable(producer)[0] ?? [];

    if (!item) return;
    if (this.player.inventory.freeSpace() <= 0) {
      this.events.emit('inventoryFull', {});
      return;
    }
    this.takeInto(producer, item, 1);
  }

  /* ------------------------------------------------------ approvisionnement */

  /**
   * Combien d'unités de `item` le bâtiment accepte encore. Seules la nurserie
   * et la forge consomment ; chaque entrée de leur recette a sa part du
   * coffre, au prorata de la recette — le fer ne prend pas la place du charbon.
   */
  public accepts(entity: Entity, item: ItemId): number {
    return isConsumer(entity) ? consumerRoom(entity, item) : 0;
  }

  /**
   * Un « Transférer » poserait-il quelque chose : du sac, ou de la ville si
   * le bâtiment est dans le rayon de la mairie ? L'UI grise le bouton sur
   * cette réponse, le tick décide sur la même.
   */
  public canSupply(entity: Entity): boolean {
    if (entity.kind === 'antenna') {
      const town = this.townStockFor(entity);

      return floorCost(entity).some(
        ([item]) =>
          (floorNeeds(entity, item) > 0 && this.player.inventory.count(item) > 0) ||
          (floorWants(entity, item) > 0 && (town?.available(item) ?? 0) > 0),
      );
    }
    if (!isConsumer(entity)) return false;

    const town = this.townStockFor(entity);

    return inputItems(consumerRecipe(entity)).some(
      (item) =>
        (consumerRoom(entity, item) > 0 && this.player.inventory.count(item) > 0) ||
        (consumerWants(entity, item) > 0 && (town?.available(item) ?? 0) > 0),
    );
  }

  /**
   * Ce qui arrête la nurserie ou la forge, pour sa fenêtre : la première
   * entrée qui manque au prochain cycle, ce que la ville en a de disponible,
   * et si des porteurs l'apportent déjà — ou sont là pour le faire : un
   * porteur en poste, ou un logisticien dont le poste la couvre (les
   * bâtisseurs ne livrent que les chantiers). `null` si rien ne manque.
   */
  public supplyStatus(consumer: Nursery | Forge): { item: ItemId; inTown: number; coming: boolean; porters: boolean } | null {
    for (const [item, amount] of amountsOf(consumerRecipe(consumer).inputs)) {
      if (consumer.store.count(item) >= amount) continue;

      return {
        item,
        inTown: this.townStock()?.available(item) ?? 0,
        coming: consumer.store.expected(item) > 0,
        porters: [...this.workers()].some((worker) => {
          if (worker.builder || !this.onDuty(worker)) return false;
          if (!worker.logistician) return true;

          const depot = this.entities.get(worker.homeId);

          return depot?.kind === 'depot' && inDepotRange(depot, consumer);
        }),
      };
    }
    return null;
  }

  /** Au contact : un objet du sac entre dans le coffre. Renvoie `false` s'il n'y avait rien à donner. */
  private supplyOne(consumer: Nursery | Forge): boolean {
    const { inventory } = this.player;

    for (const item of inputItems(consumerRecipe(consumer))) {
      if (this.accepts(consumer, item) <= 0 || inventory.count(item) === 0) continue;

      inventory.remove(item, 1);
      consumer.store.add(item, 1);
      this.events.emit('buildingSupplied', { id: consumer.id, item, amount: 1, source: 'bag' });
      this.afterSupply(consumer);
      return true;
    }
    return false;
  }

  /**
   * Le bouton « Transférer » : tout ce que le bâtiment accepte, en une fois —
   * le sac d'abord, puis la ville si le bâtiment est dans le rayon de la
   * mairie, comme sur un chantier. La ville ne donne que son disponible, et
   * pas ce qu'un porteur apporte déjà.
   */
  private supplyAll(id: EntityId): void {
    const entity = this.entities.get(id);

    if (entity?.kind === 'antenna') {
      this.supplyFloor(entity);
      return;
    }
    if (!entity || !isConsumer(entity)) {
      this.events.emit('supplyRejected', { id, reason: 'missing' });
      return;
    }
    if (!this.inReach(entity)) {
      this.events.emit('supplyRejected', { id, reason: 'outOfReach' });
      return;
    }

    const town = this.townStockFor(entity);
    let moved = 0;

    for (const item of inputItems(consumerRecipe(entity))) {
      moved += this.supplyFrom(entity, item, consumerRoom(entity, item), this.player.inventory, 'bag');
      if (town) moved += this.supplyFrom(entity, item, consumerWants(entity, item), town, 'town');
    }

    if (moved === 0) {
      this.events.emit('supplyRejected', { id, reason: 'nothingToGive' });
      return;
    }
    this.afterSupply(entity);
  }

  /** Passe au plus `wanted` objets de `from` au coffre du bâtiment. Renvoie ce qui est passé. */
  private supplyFrom(consumer: Nursery | Forge, item: ItemId, wanted: number, from: Store, source: 'bag' | 'town'): number {
    const amount = Math.min(wanted, from.available(item));

    if (amount <= 0) return 0;

    const moved = consumer.store.add(item, from.remove(item, amount));

    if (moved > 0) this.events.emit('buildingSupplied', { id: consumer.id, item, amount: moved, source });
    return moved;
  }

  /** Une livraison réveille ce qui l'attendait : la naissance en retard, la forge à l'arrêt. */
  private afterSupply(consumer: Nursery | Forge): void {
    if (consumer.kind === 'nursery') {
      if (consumer.hungry && hasInputs(consumer.store, RECIPES[NURSERY_RECIPE])) this.runNursery(consumer);
    } else if (consumer.blocked) {
      this.startForge(consumer);
    }
  }

  /* ---------------------------------------------------------------- antenne */

  /** L'antenne de la colonie — il n'y en a qu'une —, finie, ou `null`. */
  public antenna(): Antenna | null {
    for (const entity of this.entities.values()) {
      if (entity.kind === 'antenna') return entity;
    }
    return null;
  }

  /** Les nuits survécues depuis le Signal — le record de l'écran titre. 0 avant lui. */
  public nightsAfterSignal(): number {
    return this.victory ? Math.max(0, this.stats.nightsSurvived - this.signalNights) : 0;
  }

  /** « Transférer » sur l'antenne : ce que l'étage suivant attend, le sac d'abord, puis la ville dans son rayon. */
  private supplyFloor(antenna: Antenna): void {
    if (!this.inReach(antenna)) {
      this.events.emit('supplyRejected', { id: antenna.id, reason: 'outOfReach' });
      return;
    }

    const town = this.townStockFor(antenna);
    let moved = 0;

    for (const [item] of floorCost(antenna)) {
      moved += this.supplyAntenna(antenna, item, floorNeeds(antenna, item), this.player.inventory, 'bag');
      if (town) moved += this.supplyAntenna(antenna, item, floorWants(antenna, item), town, 'town');
    }

    if (moved === 0) {
      this.events.emit('supplyRejected', { id: antenna.id, reason: 'nothingToGive' });
      return;
    }
    this.raiseFloor(antenna);
  }

  /** Au contact : un objet du sac que l'étage attend entre dans le coffre. */
  private supplyFloorOne(antenna: Antenna): void {
    for (const [item] of floorCost(antenna)) {
      if (this.supplyAntenna(antenna, item, Math.min(1, floorNeeds(antenna, item)), this.player.inventory, 'bag') > 0) {
        this.raiseFloor(antenna);
        return;
      }
    }
  }

  private supplyAntenna(antenna: Antenna, item: ItemId, wanted: number, from: Store, source: 'bag' | 'town'): number {
    const amount = Math.min(wanted, from.available(item), antenna.store.freeSpace());

    if (amount <= 0) return 0;

    const moved = antenna.store.add(item, from.remove(item, amount));

    if (moved > 0) this.events.emit('buildingSupplied', { id: antenna.id, item, amount: moved, source });
    return moved;
  }

  /**
   * Tout l'étage est au coffre : il est consommé, et l'antenne monte d'un
   * niveau — ses points de vie gardent leur proportion, comme une tour
   * renforcée. Le troisième lance le Signal.
   */
  private raiseFloor(antenna: Antenna): void {
    const floor = nextUpgrade(antenna.proto, antenna.level);

    if (!floor || floorMissing(antenna) > 0) return;

    for (const [item, amount] of floorCost(antenna)) antenna.store.remove(item, amount);

    const before = buildingLevel(antenna.proto, antenna.level).hp;

    antenna.level += 1;
    antenna.hp = Math.max(1, Math.round((antenna.hp / before) * floor.hp));
    this.events.emit('buildingUpgraded', { id: antenna.id, level: antenna.level, fromBag: [] });
    this.lure(antenna);
  }

  /**
   * Un étage fini attire les mutants : la nuit qui vient — celle de ce soir
   * le jour, la suivante si la nuit est déjà tombée —, toutes les vagues
   * marchent sur l'antenne. Le dernier étage lance le Signal.
   */
  private lure(antenna: Antenna): void {
    const clock = this.clock();

    this.lureNight = !clock ? 1 : clock.phase === 'day' || clock.phase === 'dusk' ? clock.cycle : clock.cycle + 1;
    this.events.emit('antennaRaised', { id: antenna.id, floor: antenna.level, lureNight: this.lureNight });

    if (nextUpgrade(antenna.proto, antenna.level) === null) {
      this.events.emit('signalSent', { id: antenna.id, ...footprintCenter(antenna) });
    }
  }

  /** Abattue au-dessus du premier étage, l'antenne n'en perd qu'un : le coffre garde ce qui était livré. */
  private dropFloor(antenna: Antenna): void {
    antenna.level -= 1;
    antenna.hp = Math.ceil(buildingLevel(antenna.proto, antenna.level).hp / 2);
    this.events.emit('antennaFell', { id: antenna.id, floor: antenna.level });
  }

  /* ------------------------------------------------------ labo de recherche */

  /**
   * Ce que les recherches finies ajoutent à une statistique : **le** point
   * où la simulation lit leurs effets. L'arc, le sac, la marche d'Adam, les
   * porteurs, la récolte du bois, les foreuses et les fermes l'appellent au
   * moment d'agir ; les données, elles, ne changent jamais. Les niveaux
   * d'Adam (`sim/levels.ts`) s'y ajoutent : un seul cumul, aucun doublon.
   */
  public bonus(stat: ResearchStat): number {
    return researchBonus(this.researchDone, stat) + levelBonus(this.level(), stat) + boonBonus(this.activeBoon()?.id ?? null, stat);
  }

  /* ------------------------------------------------------ faveurs de l'aube */

  /** Les faveurs proposées à la dernière aube, tant qu'aucune n'est choisie. */
  public boonOffer(): { night: number; choices: readonly BoonId[] } | null {
    return this.offeredBoons;
  }

  /** Le coup de pouce de la journée et les ticks qui lui restent, ou `null`. */
  public activeBoon(): { id: BoonId; left: number } | null {
    const boon = this.dayBoon;

    return boon && this.tickCount < boon.until ? { id: boon.id, left: boon.until - this.tickCount } : null;
  }

  /** L'aube propose ses faveurs ; celles d'avant, pas choisies, s'envolent. */
  private offerBoons(): void {
    this.offeredBoons = { night: this.night, choices: drawBoons(this.seed, this.night) };
    this.events.emit('boonOffered', { night: this.night, choices: [...this.offeredBoons.choices] });
  }

  /** Une carte prise : le colis en ville (ou dans le sac), ou le coup de pouce pour la journée. */
  private chooseBoon(index: number): void {
    const offer = this.offeredBoons;
    const boon = offer?.choices[index];

    if (!offer || boon === undefined) return;

    this.offeredBoons = null;

    const { effect } = BOONS[boon];

    if (effect.kind === 'items') {
      const { reward, to } = this.bestow(Object.entries(effect.items) as [ItemId, number][]);

      this.events.emit('boonChosen', { boon, reward, to });
      return;
    }
    this.dayBoon = { id: boon, until: this.tickCount + BOON_OFFER.durationTicks };
    this.events.emit('boonChosen', { boon, reward: [], to: 'town' });
  }

  /* ------------------------------------------------------- défi du jour */

  /** Le défi du jour, son avancement et son but ; `null` avant le premier jour. */
  public challenge(): { id: ChallengeId; have: number; need: number; done: boolean } | null {
    const daily = this.daily;

    if (!daily) return null;

    const need = CHALLENGES[daily.id].goal.count;

    return { id: daily.id, have: Math.min(need, this.challengeProgress(daily)), need, done: daily.done };
  }

  private challengeProgress(daily: DailyChallenge): number {
    return CHALLENGES[daily.id].goal.stat === 'explore' ? Math.max(0, this.fog.exploredCount() - daily.base) : daily.progress;
  }

  private startChallenge(day: number): void {
    const id = drawChallenge(this.seed, day);

    this.daily = { day, id, progress: 0, base: this.fog.exploredCount(), done: false };
    this.events.emit('challengeStarted', { id, day });
  }

  /** Ajoute `amount` à la statistique `stat` (`item` pour une récolte) ; le but atteint, la récompense tombe. */
  private countChallenge(stat: ChallengeStat, amount: number, item?: ItemId): void {
    const daily = this.daily;

    if (!daily || daily.done) return;

    const { goal, reward, prestige } = CHALLENGES[daily.id];

    if (goal.stat !== stat || (goal.stat === 'harvest' && goal.item !== item)) return;
    daily.progress += amount;
    if (this.challengeProgress(daily) < goal.count) return;

    daily.done = true;

    const paid = this.bestow(Object.entries(reward) as [ItemId, number][]);

    this.gainPrestige(prestige, this.player.x, this.player.y);
    this.events.emit('challengeCompleted', { id: daily.id, reward: paid.reward, to: paid.to, prestige });
  }

  /** Le niveau d'Adam, déduit de son XP. */
  public level(): number {
    return levelOf(this.player.xp);
  }

  /** Les points de vie max d'Adam : ceux de base, plus ses niveaux et la recherche. */
  public maxHp(): number {
    return PLAYER_MAX_HP + levelHp(this.level()) + this.bonus('maxHp');
  }

  /**
   * Le pas d'un habitant en secondes de marche, pour `walkToward` : un tick,
   * allongé par la recherche (`workerSpeed`). Adam a sa propre vitesse ; un
   * patient boitille au pas d'un tick.
   */
  private walkStep(): number {
    return STEP_SECONDS * (1 + this.bonus('workerSpeed'));
  }

  /**
   * Les unités de travail d'un geste ce tick : 0 si l'habitant, affamé, le
   * saute ; 1, plus de temps en temps une de plus avec la recherche
   * (`workSpeed`), réparties sur les ticks sans hasard (`extraUnits`).
   */
  private toil(needs: Needs): number {
    if (!pacedTick(this.tickCount, needsPace(needs))) return 0;
    return 1 + extraUnits(1, this.bonus('workSpeed'), this.tickCount);
  }

  /** La part de faim et de soif que la recherche épargne aux habitants. */
  private needResist(): Record<NeedId, number> {
    return { hunger: this.bonus('hungerResist'), thirst: this.bonus('thirstResist') };
  }

  /** Les labos finis de la colonie : chacun mène sa recherche. */
  public labs(): Lab[] {
    const found: Lab[] = [];

    for (const entity of this.entities.values()) {
      if (entity.kind === 'lab') found.push(entity);
    }
    return found;
  }

  /** Le premier labo fini de la colonie, ou `null`. */
  public lab(): Lab | null {
    return this.labs()[0] ?? null;
  }

  /** Le labo désigné par une commande, s'il existe et qu'il est bâti. */
  private labFor(id: EntityId): Lab | null {
    const entity = this.entities.get(id);

    if (entity?.kind === 'lab') return entity;
    this.events.emit('researchRejected', { id, reason: 'missing' });
    return null;
  }

  /**
   * « Lancer » : le labo choisit sa recherche et attend son coût. Un labo ne
   * mène qu'une recherche à la fois : si le compte à rebours d'une autre
   * tourne, celle-ci se met en file et partira à son tour (son coût ne se
   * paie qu'alors). Jamais la même recherche dans deux labos, ni deux fois
   * dans la file. Une recherche qui attendait encore son coût est remplacée,
   * ce qui était déposé reste au coffre et compte pour la nouvelle s'il lui
   * sert. Si le coffre a déjà tout, le compte à rebours part aussitôt.
   */
  private chooseResearch(id: EntityId, research: ResearchId): void {
    const lab = this.labFor(id);

    if (!lab) return;
    if (
      !Object.hasOwn(RESEARCH, research) ||
      this.researchDone.includes(research) ||
      !this.researchOpen(research) ||
      missingRequirements(research, this.researchDone).length > 0
    ) {
      this.events.emit('researchRejected', { id, reason: 'locked' });
      return;
    }
    if (lab.research === research || lab.queue.includes(research)) return;
    if (researchHolder(research, this.labs(), lab)) {
      this.events.emit('researchRejected', { id, reason: 'taken' });
      return;
    }
    // Une recherche est déjà choisie — qu'elle tourne ou attende son coût — : celle-ci se met en file.
    if (lab.research !== null) {
      if (queueFull(lab)) {
        this.events.emit('researchRejected', { id, reason: 'busy' });
        return;
      }
      lab.queue.push(research);
      this.events.emit('researchQueued', { id, research, queued: true });
      return;
    }

    lab.research = research;
    this.events.emit('researchChosen', { id, research });
    this.startCountdown(lab);
  }

  /**
   * « Abandonner » : le labo lâche sa recherche, et la suivante de la file
   * prend sa place. Tant que le coût n'est pas réuni, rien de déposé n'est
   * perdu ; si le compte à rebours tournait, le coût payé retourne au coffre.
   */
  private cancelResearch(id: EntityId): void {
    const lab = this.labFor(id);

    if (!lab) return;
    if (lab.research === null) {
      this.events.emit('researchRejected', { id, reason: 'idle' });
      return;
    }

    const research = lab.research;

    if (lab.endTick > 0) {
      for (const [item, amount] of researchCost(research)) lab.store.add(item, Math.min(amount, lab.store.freeSpace()));
    }
    lab.research = null;
    lab.endTick = 0;
    this.events.emit('researchCancelled', { id, research });
    this.advanceResearchQueue(lab);
  }

  /** Retire une recherche de la file d'un labo : rien n'était payé. */
  private dequeueResearch(id: EntityId, research: ResearchId): void {
    const lab = this.labFor(id);

    if (!lab) return;

    const at = lab.queue.indexOf(research);

    if (at < 0) {
      this.events.emit('researchRejected', { id, reason: 'idle' });
      return;
    }
    lab.queue.splice(at, 1);
    this.events.emit('researchQueued', { id, research, queued: false });
  }

  /** Le labo est libre : la première recherche de la file est choisie, et part si son coût est au coffre. */
  private advanceResearchQueue(lab: Lab): void {
    const next = lab.queue.shift();

    if (next === undefined) return;
    this.events.emit('researchQueued', { id: lab.id, research: next, queued: false });
    lab.research = next;
    this.events.emit('researchChosen', { id: lab.id, research: next });
    this.startCountdown(lab);
  }

  /**
   * « Transférer » : ce que la recherche attend, le sac d'abord, puis le
   * stock de la ville si le labo est dans le rayon de la mairie — comme un
   * chantier. La ville ne donne que son disponible, et pas ce qu'un porteur
   * apporte déjà.
   */
  private transferToLab(id: EntityId): void {
    const lab = this.labFor(id);

    if (!lab) return;

    const reason: ResearchRejection | null = !isCollecting(lab) ? 'idle' : !this.inReach(lab) ? 'outOfReach' : null;

    if (reason) {
      this.events.emit('researchRejected', { id, reason });
      return;
    }

    const town = this.townStockForLab(lab);
    let moved = 0;

    for (const [item] of researchCost(lab.research!)) {
      moved += this.supplyLab(lab, item, Math.min(labNeeds(lab, item), this.player.inventory.count(item)), this.player.inventory, 'bag');
      if (town) moved += this.supplyLab(lab, item, Math.min(labWants(lab, item), town.available(item)), town, 'town');
    }

    if (moved === 0) {
      this.events.emit('researchRejected', { id, reason: 'nothingToGive' });
      return;
    }
    this.startCountdown(lab);
  }

  /** Au contact : un objet du sac que la recherche attend entre au labo. */
  private supplyLabOne(lab: Lab): void {
    if (!isCollecting(lab)) return;

    for (const [item] of researchCost(lab.research!)) {
      if (this.supplyLab(lab, item, Math.min(1, labNeeds(lab, item), this.player.inventory.count(item)), this.player.inventory, 'bag') > 0) {
        this.startCountdown(lab);
        return;
      }
    }
  }

  /** Passe `amount` objets de `from` au coffre du labo. Renvoie ce qui est passé. */
  private supplyLab(lab: Lab, item: ItemId, amount: number, from: Store, source: 'bag' | 'town'): number {
    // Jamais plus que la place libre : ce qui sortirait du sac sans entrer au labo serait perdu.
    const count = Math.min(amount, lab.store.freeSpace());

    if (count <= 0) return 0;

    const moved = lab.store.add(item, from.remove(item, count));

    if (moved > 0) this.events.emit('labSupplied', { id: lab.id, item, amount: moved, source });
    return moved;
  }

  /** Le stock de la ville, si le labo est dans le rayon de la mairie. */
  private townStockForLab(lab: Lab): Store | null {
    const hall = this.warehouse();

    return hall && inLogisticRange(hall, lab) ? hall.store : null;
  }

  /** Un « Transférer » poserait-il quelque chose au labo ? L'UI grise le bouton sur cette réponse. */
  public canTransferToLab(lab: Lab): boolean {
    if (!isCollecting(lab)) return false;

    const town = this.townStockForLab(lab);

    return researchCost(lab.research!).some(
      ([item]) =>
        (labNeeds(lab, item) > 0 && this.player.inventory.count(item) > 0) ||
        (labWants(lab, item) > 0 && (town?.available(item) ?? 0) > 0),
    );
  }

  /** Le labo est-il dans le rayon de la mairie finie ? */
  public labInTownRange(lab: Lab): boolean {
    return this.townStockForLab(lab) !== null;
  }

  /** Le coût est-il réuni ? Alors il est consommé, et le compte à rebours part. */
  private startCountdown(lab: Lab): void {
    if (!isCollecting(lab) || labMissing(lab) > 0) return;

    const research = lab.research!;

    for (const [item, amount] of researchCost(research)) lab.store.remove(item, amount);
    lab.endTick = this.tickCount + RESEARCH[research].duration;
    this.scheduler.schedule(lab.id, lab.endTick, this.tickCount);
    this.events.emit('researchStarted', { id: lab.id, research, endTick: lab.endTick });
  }

  /** Le labo se réveille à la fin du compte à rebours : l'effet vaut pour toute la partie. */
  private finishResearch(lab: Lab): void {
    const research = lab.research;

    if (research === null || lab.endTick === 0 || this.tickCount < lab.endTick) return;

    lab.research = null;
    lab.endTick = 0;
    this.researchDone.push(research);

    // Grand sac : le sac grandit sur-le-champ, avec tout ce qu'il contient.
    const { effect } = RESEARCH[research];

    if (effect?.stat === 'bagCapacity') {
      const { inventory } = this.player;

      this.player.inventory = Store.fromJSON(inventory.capacity + effect.amount, inventory.toJSON());
    }
    // Plus de points de vie : ceux qu'on gagne arrivent pleins.
    if (effect?.stat === 'maxHp' && this.player.hp > 0) this.player.hp = Math.min(this.maxHp(), this.player.hp + effect.amount);
    this.events.emit('researchCompleted', { id: lab.id, research });
    this.advanceResearchQueue(lab);
  }

  /* ------------------------------------------------------------- placement */

  /**
   * Le placement est-il légal ? Renvoie le motif de refus, ou `null` si oui.
   * Raccourci de `placementBlock()`, qui dit aussi quelles cases bloquent.
   */
  public canPlace(building: BuildingId, tx: number, ty: number): PlacementRejection | null {
    return this.placementBlock(building, tx, ty)?.reason ?? null;
  }

  /**
   * Pourquoi le placement est refusé, et **quelles cases** de l'emprise
   * bloquent — ou `null` s'il est légal.
   *
   * Cette fonction est le juge unique : l'aperçu fantôme l'appelle à chaque
   * frame pour se colorer, et le tick l'appelle avant de construire. Deux
   * implémentations qui divergent, c'est un fantôme vert qui refuse de se
   * poser — le genre de bug qui se signale en test utilisateur seulement.
   *
   * Un seul motif à la fois, dans l'ordre où le joueur peut y remédier ; ses
   * cases seulement. Trop loin : toute l'emprise l'est.
   */
  public placementBlock(building: BuildingId, tx: number, ty: number): PlacementBlock | null {
    const proto: BuildingProto = BUILDINGS[building];
    const tiles = (blocks: (x: number, y: number) => boolean): TileCoord[] => {
      const found: TileCoord[] = [];

      for (let y = ty; y < ty + proto.height; y += 1) {
        for (let x = tx; x < tx + proto.width; x += 1) {
          if (blocks(x, y)) found.push({ tx: x, ty: y });
        }
      }
      return found;
    };

    // Pas de plan ou pas encore la vague, pas de chantier : le tick refuse comme le menu.
    if (!this.isUnlocked(building)) return { reason: 'locked', tiles: tiles(() => true) };

    // On ne bâtit pas sur l'inconnu : il faut y être allé. Une case explorée hors de vue suffit.
    const unknown = tiles((x, y) => !this.known(x, y));

    if (unknown.length > 0) return { reason: 'unexplored', tiles: unknown };

    // Une région pas encore conquise : on n'y bâtit pas avant d'avoir vaincu son gardien.
    const unconquered = tiles((x, y) => !this.isConquered(x, y));

    if (unconquered.length > 0) return { reason: 'region', tiles: unconquered };

    // Une foreuse au bord d'un filon : moitié gisement, moitié herbe. L'eau et le sable y sont des cases
    // fautives comme les autres ; le rocher du filon se casse ensuite (« resource »).
    const footing = this.footing(building, tx, ty);

    if (footing && !footing.valid) {
      const wrong = footing.tiles.filter((tile) => tile.state === 'wrong').map(({ tx: x, ty: y }) => ({ tx: x, ty: y }));

      return { reason: 'footing', tiles: wrong, ore: footing.ore };
    }

    const checks: [PlacementRejection, (x: number, y: number) => boolean][] = [
      ['terrain', (x, y) => !isBuildable(terrainAt(this.seed, x, y))],
      // Un coffre pas encore ouvert aussi : on ne l'enterre pas sous un bâtiment.
      ['occupied', (x, y) => !this.chunks.isFree(x, y, 1, 1) || this.chestAt(x, y) !== null],
      // Terre polluée ou radioactive : on n'y bâtit pas. Seule la pollution se nettoie (`purifier`).
      ['polluted', (x, y) => this.land.at(x, y) === 'polluted'],
      ['radioactive', (x, y) => this.land.at(x, y) === 'radioactive'],
      // Une pousse aussi : on ne bâtit pas sur ce que le forestier a planté.
      ['resource', (x, y) => this.resources.isTaken(x, y)],
      // Un bâtiment est solide : le poser sur Adam l'emmurerait.
      ['onPlayer', (x, y) => playerOverlaps(this.player, x, y, 1, 1)],
      // Une base mutante debout tient sa zone.
      ['enemyZone', (x, y) => this.enemyZoneAt(x, y) !== null],
    ];

    for (const [reason, blocks] of checks) {
      const found = tiles(blocks);

      if (found.length > 0) return { reason, tiles: found, blocked: tiles((x, y) => checks.some(([, any]) => any(x, y))) };
    }

    // Le puits puise dans la rivière : il se pose à son bord.
    if (proto.shore && !touchesWater(this.seed, tx, ty, proto.width, proto.height)) {
      return { reason: 'shore', tiles: tiles(() => true) };
    }

    // L'antenne se dresse loin de la mairie : il faudra la défendre.
    if (proto.hallDistance !== undefined && this.nearHall(proto.hallDistance, tx, ty, proto.width, proto.height)) {
      return { reason: 'nearHall', tiles: tiles(() => true) };
    }

    // Portée mesurée depuis le centre de l'emprise, en distances au carré.
    const centerX = (tx + proto.width / 2) * TILE_SIZE;
    const centerY = (ty + proto.height / 2) * TILE_SIZE;
    const reach = BUILD_REACH_TILES * TILE_SIZE;

    if (distanceSq(this.player.x, this.player.y, centerX, centerY) > reach * reach) {
      return { reason: 'outOfReach', tiles: tiles(() => true) };
    }

    // Un seul labo par colonie : le menu le grise déjà, le tick refuse pareil.
    if (this.atLimit(building)) return { reason: 'unique', tiles: tiles(() => true) };

    return null;
  }

  /** Les cases explorées, recomptées seulement quand le brouillard a bougé (`FogOfWar.revision`). */
  private exploredTiles(): number {
    if (this.exploredStamp.revision !== this.fog.revision) this.exploredStamp = { revision: this.fog.revision, count: this.fog.exploredCount() };
    return this.exploredStamp.count;
  }

  /**
   * Le bâtiment est-il débloqué ? Il faut son plan, s'il en demande un (quêtes
   * d'Ève), la recherche qui le débloque, s'il s'obtient au labo, et
   * le chapitre `unlockChapter`, s'il en attend un. Un bâtiment de base est
   * ouvert d'emblée (`openBuildings`) ou par la recherche qui l'ouvre (`opens`).
   */
  public isUnlocked(building: BuildingId): boolean {
    const proto: BuildingProto = BUILDINGS[building];
    const research = unlockingResearch(building);
    const opening = openingResearch(building);

    // Un bâtiment sans plan, recherche ni objectif n'est là que s'il est ouvert.
    const gated = proto.plan || research !== null || proto.unlockChapter !== undefined || proto.unlockExplored !== undefined;
    const open = this.openBuildings.has(building) || (opening !== null && this.researchDone.includes(opening));

    return (
      (gated || open) &&
      isUnlocked(building, this.questsDone) &&
      (research === null || this.researchDone.includes(research)) &&
      this.chapter >= (proto.unlockChapter ?? 0) &&
      this.exploredTiles() >= (proto.unlockExplored ?? 0)
    );
  }

  /**
   * Le bâtiment est-il au menu de construction ? Un bâtiment du menu,
   * débloqué, une fois la mairie debout : avant, tout le bois lui revient.
   * Ce qui n'y est pas ne s'y montre pas, même grisé.
   */
  public inMenu(building: BuildingId): boolean {
    return BUILDINGS[building].menu && this.warehouse() !== null && this.isUnlocked(building);
  }

  /** Sa carte porte-t-elle le badge « Nouveau » ? Au menu, et pas encore choisie ni posée. */
  public isNewInMenu(building: BuildingId): boolean {
    return this.inMenu(building) && !this.seenBuildings.has(building);
  }

  /**
   * Ce qui entre au menu depuis le tick d'avant, et que le joueur n'a pas
   * encore vu : `buildingsUnlocked`. Ce que la mairie ouvre d'emblée est vu
   * dès qu'elle est bâtie (`complete`). Au premier tick après un
   * chargement, rien n'est annoncé.
   */
  private watchUnlocks(): void {
    // Le menu ne bouge qu'avec la mairie, les recherches, les quêtes et le chapitre : sans eux, rien à recompter.
    const hall = this.warehouse() !== null;
    const stamp = this.unlockStamp;

    if (
      stamp &&
      stamp.hall === hall &&
      stamp.research === this.researchDone.length &&
      stamp.quests === this.questsDone &&
      stamp.chapter === this.chapter &&
      stamp.open === this.openBuildings.size &&
      stamp.explored === this.exploredTiles() &&
      stamp.era === this.era
    ) {
      return;
    }
    this.unlockStamp = {
      hall,
      research: this.researchDone.length,
      quests: this.questsDone,
      chapter: this.chapter,
      open: this.openBuildings.size,
      explored: this.exploredTiles(),
      era: this.era,
    };

    const known = this.menuKnown;
    const menu = MENU_BUILDING_IDS.filter((id) => this.inMenu(id));

    this.menuKnown = new Set(menu);
    if (known === null) return;

    const fresh = menu.filter((id) => !known.has(id) && !this.seenBuildings.has(id));

    if (fresh.length > 0) this.events.emit('buildingsUnlocked', { buildings: fresh });
  }

  /**
   * Une emprise posée en (tx, ty) est-elle à moins de `tiles` tuiles de la
   * mairie, de centre à centre — comme le cercle que montre le fantôme ?
   */
  public nearHall(tiles: number, tx: number, ty: number, width: number, height: number): boolean {
    const hall = this.entities.get(this.townHallId);

    if (!hall) return false;

    const reach = tiles * TILE_SIZE;
    const { x, y } = footprintCenter(hall);

    return distanceSq(x, y, (tx + width / 2) * TILE_SIZE, (ty + height / 2) * TILE_SIZE) < reach * reach;
  }

  /** Un bâtiment unique (`unique`) déjà posé — chantier compris — n'en admet pas un second. */
  public atLimit(building: BuildingId): boolean {
    if (!BUILDINGS[building].unique) return false;

    for (const entity of this.entities.values()) {
      if (entity.proto === building) return true;
    }
    return false;
  }

  /** Réserve l'emprise et ouvre le chantier. Un coût vide le termine sur-le-champ. */
  private openSite(building: BuildingId, tx: number, ty: number): EntityId {
    const proto = BUILDINGS[building];
    const id = this.nextId++;
    const site: Site = {
      kind: 'site',
      id,
      proto: building,
      tx,
      ty,
      width: proto.width,
      height: proto.height,
      delivered: {},
      work: 0,
    };

    this.entities.set(id, site);
    this.chunks.occupy(id, tx, ty, proto.width, proto.height);
    this.events.emit('buildingPlaced', { id, tx, ty });

    if (siteMissing(site) === 0) {
      this.complete(site);
      return id;
    }

    // Un chantier offert par le jardin : livré d'avance, il attend quand même « Construire ».
    const gift = this.giftedSites.indexOf(building);

    if (gift >= 0) {
      this.giftedSites.splice(gift, 1);
      site.delivered = { ...proto.cost };
      this.events.emit('siteReady', { id });
    }

    return id;
  }

  /** Le chantier devient le bâtiment, sous le même id : le rendu n'a qu'à changer de texture. */
  private complete(site: Site): void {
    const proto = BUILDINGS[site.proto];
    const base = {
      id: site.id,
      proto: site.proto,
      tx: site.tx,
      ty: site.ty,
      width: site.width,
      height: site.height,
      store: new Store(proto.storage),
      hp: proto.hp,
      level: 1,
      paused: false,
      staff: proto.workers,
      priority: WORK_PRIORITY.initial,
    };
    let building: Building;

    switch (proto.kind) {
      case 'drill':
        building = {
          ...base,
          kind: 'drill',
          output: this.oreUnder(site.proto, site.tx, site.ty),
          blocked: false,
        };
        break;

      case 'townHall':
        building = { ...base, kind: 'townHall' };
        break;

      case 'nursery':
        building = {
          ...base,
          kind: 'nursery',
          nextBirthTick: this.tickCount + RECIPES[NURSERY_RECIPE].duration,
          born: 0,
          hungry: false,
        };
        break;

      case 'tower':
        building = { ...base, kind: 'tower', armed: false };
        break;

      case 'house':
        building = { ...base, kind: 'house' };
        break;

      case 'decor':
        building = { ...base, kind: 'decor' };
        break;

      case 'farm':
        building = { ...base, kind: 'farm' };
        break;

      case 'quarry':
        building = { ...base, kind: 'quarry', blocked: false };
        break;

      case 'pigPen':
        building = { ...base, kind: 'pigPen', pigs: 0, endTick: 0, blocked: true };
        break;

      case 'forge':
        building = { ...base, kind: 'forge', blocked: true };
        break;

      case 'clinic':
        building = { ...base, kind: 'clinic' };
        break;

      case 'purifier':
        building = { ...base, kind: 'purifier' };
        break;

      case 'wall':
        building = { ...base, kind: 'wall' };
        break;

      case 'barracks':
        building = { ...base, kind: 'barracks', training: null };
        break;

      case 'lab':
        building = { ...base, kind: 'lab', research: null, endTick: 0, queue: [] };
        break;

      case 'lumberCamp':
        building = { ...base, kind: 'lumberCamp' };
        break;

      case 'foresterHouse':
        building = { ...base, kind: 'foresterHouse' };
        break;

      case 'depot':
        building = { ...base, kind: 'depot' };
        break;

      case 'yard':
        building = { ...base, kind: 'yard' };
        break;

      case 'antenna':
        building = { ...base, kind: 'antenna' };
        break;
    }

    this.entities.set(site.id, building);
    this.dirtyTile(site.tx, site.ty);
    this.rosterChanged();
    this.events.emit('buildingCompleted', { id: site.id });
    this.countChallenge('build', 1);
    this.awardBuilding(building);

    // Le bâtiment est debout : ses bâtisseurs posent le marteau et repartent.
    for (const worker of this.workers()) {
      if (worker.build === site.id) {
        worker.build = null;
        worker.searchTicks = 0;
      }
    }

    switch (building.kind) {
      case 'drill':
        // Une foreuse posée à sec ne se planifie pas du tout : zéro coût.
        if (building.output) this.scheduleDrill(building);
        else building.blocked = true;
        break;

      case 'nursery':
        this.scheduler.schedule(building.id, building.nextBirthTick, this.tickCount);
        break;

      case 'tower':
        if (this.hasMutants()) this.armTower(building, 1);
        break;

      case 'farm':
        this.staffFarm(building);
        break;

      case 'quarry':
        this.scheduleFarm(building);
        break;

      case 'pigPen':
        // Sans cochon, rien ne se planifie : c'est l'arrivée du premier qui lance le cycle.
        break;

      case 'forge':
        // Coffre vide : elle attend son fer et son charbon, sans rien coûter.
        break;

      case 'house':
        this.staff(building);
        break;

      case 'lumberCamp':
        this.staffCamp(building);
        break;

      case 'foresterHouse':
        this.staffForester(building);
        break;

      case 'depot':
      case 'yard':
        this.staff(building);
        break;

      case 'clinic':
        // Des lits vides : elle attend qu'un mutant tombe assommé.
        break;

      case 'barracks':
        // Aucune recrue en formation : elle attend le joueur.
        break;

      case 'lab':
        // Aucune recherche choisie : il attend le joueur, sans rien coûter.
        break;

      case 'antenna':
        // Le premier étage est debout : la nuit qui vient, les vagues marchent sur lui.
        this.lure(building);
        break;

      case 'townHall':
        // Le toit est posé : le premier jour se lève, les mutants sauront où aller la nuit venue.
        if (building.id === this.townHallId) {
          // De quoi nourrir et abreuver les premiers ouvriers le temps de lancer un puits et une ferme.
          for (const [item, amount] of amountsOf(COLONY.startingStock)) building.store.add(item, amount);
          this.cycleStartTick = this.tickCount;
          // Le menu s'ouvre : ce qu'il propose d'emblée est le départ, pas une découverte — ni badge ni annonce.
          for (const id of MENU_BUILDING_IDS) if (this.inMenu(id)) this.seenBuildings.add(id);
        }
        break;
    }
  }

  /**
   * L'assise d'un bâtiment à gisements (`deposits` : la foreuse) posé en
   * (tx, ty) : case par case, filon, herbe ou faute (`sim/footing.ts`).
   * `null` pour un bâtiment qui se pose n'importe où.
   */
  public footing(building: BuildingId, tx: number, ty: number): Footing | null {
    const { deposits, width, height }: BuildingProto = BUILDINGS[building];

    return deposits ? footingAt(this.seed, deposits, tx, ty, width, height) : null;
  }

  /**
   * Le premier objet extractible sous l'emprise de ce bâtiment posé en
   * (tx, ty), ou `null` si aucun gisement. L'aperçu d'une foreuse le montre
   * (« Extraira : … »), `placementBlock()` refuse sans.
   */
  public oreUnder(building: BuildingId, tx: number, ty: number): ItemId | null {
    const { width, height } = BUILDINGS[building];

    for (let y = ty; y < ty + height; y += 1) {
      for (let x = tx; x < tx + width; x += 1) {
        const node = oreAt(this.seed, x, y);

        if (node) return node.item;
      }
    }
    return null;
  }

  /** Vide la tuile d'un rocher ou d'un arbre de la carte qui n'a rien à y faire (`load`). */
  private clearUnder(tx: number, ty: number): void {
    if (this.resources.at(tx, ty) !== null && !this.resources.isPlanted(tx, ty)) this.resources.clear(tx, ty);
  }

  private dirtyTile(tx: number, ty: number): void {
    this.chunks.get(floorDiv(tx, CHUNK_TILES), floorDiv(ty, CHUNK_TILES)).dirty = true;
  }

  /* ---------------------------------------------------------------- réveils */

  private wake(entity: Entity): void {
    switch (entity.kind) {
      case 'drill':
        this.runDrill(entity);
        break;

      case 'nursery':
        this.runNursery(entity);
        break;

      case 'tower':
        this.runTower(entity);
        break;

      case 'quarry':
        this.runFarm(entity);
        break;

      case 'pigPen':
        this.runPigPen(entity);
        break;

      case 'forge':
        this.runForge(entity);
        break;

      case 'lab':
        this.finishResearch(entity);
        break;

      // Une ferme ne se réveille plus — un réveil d'avant les fermiers : sa nourriture vient des récoltes.
      case 'farm':
      case 'site':
      case 'townHall':
      case 'house':
      case 'clinic':
      case 'purifier':
      case 'wall':
      case 'barracks':
      case 'lumberCamp':
      case 'foresterHouse':
      case 'depot':
      case 'yard':
      case 'antenna':
        break;
    }
  }

  /**
   * Un cycle de foreuse.
   *
   * Le point important n'est pas la production, c'est la dernière ligne :
   * quand le coffre est plein, la foreuse **ne se replanifie pas**. Elle
   * disparaît complètement du coût par tick jusqu'à ce que `withdraw()` la
   * réveille. C'est ce qui fait tenir dix mille machines.
   */
  private runDrill(drill: Drill): void {
    const recipe = RECIPES[DRILL_RECIPE];
    const item = drill.output;

    // À sec ou en pause : elle ne se replanifie plus — « Reprendre » la relance.
    if (!item || drill.paused) {
      drill.blocked = true;
      return;
    }

    // La recette décrit la cadence ; la nature de l'objet vient du gisement.
    const amount = Object.values(recipe.outputs)[0] ?? 1;
    const accepted = drill.store.add(item, amount);

    if (accepted < amount) {
      drill.blocked = true;
      this.events.emit('drillBlocked', { id: drill.id });
      return;
    }

    drill.blocked = false;
    this.tally(item, amount);
    this.events.emit('drillProduced', { id: drill.id, item });
    this.scheduleDrill(drill);
  }

  private scheduleDrill(drill: Drill): void {
    const recipe = RECIPES[DRILL_RECIPE];
    // Foreuses rapides (labo) : le cycle raccourcit, jamais sous un tick.
    const duration = Math.max(1, Math.ceil((recipe.duration + this.bonus('drillTicks')) * speedOf(drill.proto, drill.level)));

    this.scheduler.schedule(drill.id, this.tickCount + duration, this.tickCount);
  }

  /**
   * Un cycle de carrière — ou de puits, qui tourne pareil sur sa propre
   * recette : même logique que la foreuse — coffre plein, elle s'endort et
   * ne coûte plus rien jusqu'à ce qu'on vienne la vider.
   */
  private runFarm(farm: Quarry): void {
    // En pause, ou personne à la taille : elle s'endort jusqu'à ce qu'on la relance.
    if (this.stopped(farm)) {
      farm.blocked = true;
      return;
    }

    const recipe = quarryRecipe(farm);
    const [item, amount] = (Object.entries(recipe.outputs) as [ItemId, number][])[0] ?? ['stone', 1];
    const accepted = farm.store.add(item, amount);

    if (accepted < amount) {
      farm.blocked = true;
      return;
    }

    farm.blocked = false;
    this.tally(item, amount);
    this.scheduleFarm(farm);
  }

  /** La cadence de la recette est celle de la carrière au complet : à moitié d'ouvriers, deux fois plus lente. */
  private scheduleFarm(farm: Quarry): void {
    const { filled, max } = this.staffing(farm) ?? { filled: 1, max: 1 };
    const recipe = quarryRecipe(farm);
    const duration = Math.ceil((recipe.duration * max * speedOf(farm.proto, farm.level)) / Math.max(1, filled));

    this.scheduler.schedule(farm.id, this.tickCount + duration, this.tickCount);
  }

  /**
   * Un cycle de forge : les entrées deviennent la plaque — ou, au four à
   * charbon, le bois devient du charbon. Comme la foreuse, une forge à qui il
   * manque une entrée ne se replanifie pas — c'est la livraison d'Adam ou
   * d'un porteur qui la relance.
   */
  private runForge(forge: Forge): void {
    const recipe = forgeRecipe(forge);

    // En pause, ou sans chauffeur, le four ne mange rien : le cycle en cours ne se termine pas.
    if (!this.stopped(forge) && canCraft(forge.store, recipe)) {
      for (const [item, amount] of amountsOf(recipe.inputs)) forge.store.remove(item, amount);
      for (const [item, amount] of amountsOf(recipe.outputs)) {
        forge.store.add(item, amount);
        this.tally(item, amount);
        this.events.emit('forgeProduced', { id: forge.id, item });
      }
    }
    this.startForge(forge);
  }

  /** Planifie le prochain cycle s'il a de quoi tourner ; sinon, la forge s'arrête. */
  private startForge(forge: Forge): void {
    const recipe = forgeRecipe(forge);

    if (this.stopped(forge) || !canCraft(forge.store, recipe)) {
      forge.blocked = true;
      return;
    }
    forge.blocked = false;
    this.scheduler.schedule(forge.id, this.tickCount + recipe.duration, this.tickCount);
  }

  /**
   * Une naissance : si le coffre a de quoi nourrir l'enfant, il apparaît sur
   * la première tuile libre autour de la nurserie. Sinon, la nurserie a faim
   * et ne se replanifie pas : c'est la nourriture apportée qui la réveille.
   * Pleine (`NURSERY_CARE.capacity`), elle attend sans manger : c'est l'enfant
   * qui part travailler qui la réveille.
   */
  private runNursery(nursery: Nursery): void {
    const recipe: RecipeProto = RECIPES[NURSERY_RECIPE];

    // En pause : l'heure passe sans naissance ni repas, et rien n'est replanifié — « Reprendre » la relance.
    if (nursery.paused) return;
    // Un réveil d'avant un rattrapage hors ligne, qui a avancé l'heure de naître : il ne sonne plus pour rien.
    if (this.tickCount < nursery.nextBirthTick) return;
    if (this.nurseryKids(nursery).length >= NURSERY_CARE.capacity) return;

    if (!hasInputs(nursery.store, recipe)) {
      if (!nursery.hungry) this.events.emit('nurseryHungry', { id: nursery.id });
      nursery.hungry = true;
      return;
    }
    this.bear(nursery);
    nursery.nextBirthTick = this.tickCount + recipe.duration;
    this.scheduler.schedule(nursery.id, nursery.nextBirthTick, this.tickCount);
  }

  /** Une naissance : la nourriture de la recette sort du coffre, l'enfant apparaît à côté de la nurserie. */
  private bear(nursery: Nursery): void {
    const recipe: RecipeProto = RECIPES[NURSERY_RECIPE];

    for (const [item, amount] of amountsOf(recipe.inputs)) nursery.store.remove(item, amount);
    nursery.hungry = false;

    const home = {
      x: (nursery.tx + nursery.width / 2) * TILE_SIZE,
      y: (nursery.ty + nursery.height / 2) * TILE_SIZE,
    };
    const spot = this.freeTileAround(nursery.tx, nursery.ty, nursery.width, nursery.height);
    const x = spot ? (spot.tx + 0.5) * TILE_SIZE : home.x;
    const y = spot ? (spot.ty + 0.5) * TILE_SIZE : nursery.ty * TILE_SIZE + nursery.height * TILE_SIZE + 8;
    const id = this.nextMobileId++;
    const kid: Kid = {
      kind: 'kid',
      id,
      sex: sexOf(this.seed, id),
      trait: bornTrait(this.seed, id, this.adultTraits()),
      ...freshNeeds(),
      age: AGES.nursery,
      x,
      y,
      prevX: x,
      prevY: y,
      facing: 'down',
      moving: false,
      homeId: nursery.id,
      homeX: home.x,
      homeY: home.y,
      dirX: 0,
      dirY: 0,
      wanderTicks: 0,
    };

    this.mobiles.set(kid.id, kid);
    nursery.born += 1;
    this.stats.births += 1;
    this.joy = { tick: this.tickCount, kidId: kid.id };
    this.events.emit('childBorn', { nurseryId: nursery.id, kidId: kid.id, name: this.nameFor(kid), x, y });
  }

  /* ------------------------------------------------------------ hors ligne */

  /**
   * Le plafond du temps rattrapé hors ligne, en ms. Le seul point où le lire :
   * une recherche qui le relèvera s'ajoutera ici.
   */
  public offlineCapMs(): number {
    return OFFLINE.maxMs;
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
  private catchUp(awayMs: number): void {
    const hall = this.warehouse();
    const counted = countedMs(awayMs, this.offlineCapMs());
    const total = Math.floor(counted / STEP_MS);

    if (!hall || this.defeated || total <= 0) return;

    const report: OfflineReport = {
      awayMs,
      ticks: total,
      capped: awayMs > this.offlineCapMs(),
      gained: {},
      spent: {},
      research: [],
      births: 0,
      alerts: [],
    };
    const alerts = new Set<OfflineAlertId>();
    const carriers = this.hasCarriers();
    const carry = new Map<EntityId, number>();
    const woodLeft = new Map<EntityId, number>();
    const felled = new Map<EntityId, number>();
    const births = new Map<EntityId, number>();
    const research = new Map<EntityId, number>();
    let working = 1;

    for (const entity of this.entities.values()) {
      if (entity.kind === 'nursery') births.set(entity.id, entity.hungry ? 0 : entity.nextBirthTick - this.tickCount);
      if (entity.kind === 'lab' && entity.endTick > 0) research.set(entity.id, entity.endTick - this.tickCount);
      if (entity.kind === 'lumberCamp') woodLeft.set(entity.id, this.standingWood(entity));
    }

    for (let done = 0; done < total; done += OFFLINE.stepTicks) {
      const span = Math.min(OFFLINE.stepTicks, total - done);

      for (const entity of this.entities.values()) {
        if (entity.kind === 'site') continue;

        const made = this.offlineOutput(entity, span * (employs(entity.proto) ? working : 1), woodLeft);

        if (made) {
          const kept = this.offlineYield(entity, made.item, wholeUnits(carry, entity.id, made.amount), carriers, report, alerts);

          if (entity.kind === 'lumberCamp') felled.set(entity.id, (felled.get(entity.id) ?? 0) + kept);
        }
        if (entity.kind === 'forge') this.offlineForge(entity, span * working, carry, carriers, report, alerts);
      }
      for (const entity of this.entities.values()) {
        if (entity.kind === 'nursery') this.offlineBirths(entity, span, births, carriers, report);
        if (entity.kind === 'lab') this.offlineResearch(entity, span, research, carriers, report);
      }
      working = this.offlineMeals(hall.store, span, report, alerts);
    }

    // Le bois rapporté a un prix : les arbres de la cabane, du plus proche au plus loin, perdent autant d'unités.
    for (const [id, units] of felled) {
      const camp = this.entities.get(id);

      if (camp?.kind === 'lumberCamp') this.fellTrees(camp, units);
    }

    // Les comptes à rebours repartent d'où le rattrapage les a laissés ; un ancien réveil, en avance, ne sonne plus pour rien.
    for (const entity of this.entities.values()) {
      if (entity.kind === 'nursery' && !entity.paused) {
        const left = births.get(entity.id) ?? 0;

        if (left > 0) {
          entity.hungry = false;
          entity.nextBirthTick = this.tickCount + left;
          this.scheduler.schedule(entity.id, entity.nextBirthTick, this.tickCount);
        } else {
          entity.nextBirthTick = Math.min(entity.nextBirthTick, this.tickCount);
          if (entity.hungry) alerts.add('nurseryHungry');
        }
      }
      if (entity.kind === 'lab' && entity.endTick > 0) {
        entity.endTick = this.tickCount + Math.max(1, research.get(entity.id) ?? entity.endTick - this.tickCount);
        this.scheduler.schedule(entity.id, entity.endTick, this.tickCount);
      }
      if (entity.kind === 'barracks' && entity.training) {
        entity.training.endTick = Math.max(this.tickCount, entity.training.endTick - total);
      }
      // Le cycle de l'élevage repart d'ici ; un ancien réveil, en avance, ne sonne plus pour rien.
      if (entity.kind === 'pigPen' && entity.pigs > 0 && !entity.blocked) this.startPigPen(entity);
    }

    this.offlineLowStock(hall.store, alerts);
    report.alerts = OFFLINE_ALERTS.filter((alert) => alerts.has(alert));
    // Le stock a sauté d'un coup : les débits de la ville repartent de zéro plutôt que d'afficher ce saut.
    this.flows.reset();
    this.events.emit('offlineCaughtUp', report);
  }

  /** Des porteurs ou des logisticiens pour faire la tournée des coffres : un ouvrier au travail qui n'est pas bâtisseur. */
  private hasCarriers(): boolean {
    for (const worker of this.workers()) if (!worker.free && !worker.builder) return true;
    return false;
  }

  /**
   * Ce qu'un producteur sans entrée sort en `ticks` de travail, à sa cadence
   * moyenne : foreuse, carrière et puits, cabane de bûcheron, ferme. Fractionnaire,
   * `wholeUnits` en fait des unités. `null` s'il ne produit rien.
   */
  private offlineOutput(entity: Building, ticks: number, woodLeft: Map<EntityId, number>): { item: ItemId; amount: number } | null {
    if (entity.paused || ticks <= 0) return null;

    const staffing = this.staffing(entity);
    const share = staffing ? staffing.filled / Math.max(1, staffing.max) : 1;

    switch (entity.kind) {
      case 'drill': {
        if (!entity.output) return null;

        const amount = Object.values(RECIPES[DRILL_RECIPE].outputs)[0] ?? 1;

        return { item: entity.output, amount: (amount * ticks) / Math.max(1, RECIPES[DRILL_RECIPE].duration + this.bonus('drillTicks')) };
      }

      case 'quarry': {
        const recipe = quarryRecipe(entity);
        const [item, amount] = (Object.entries(recipe.outputs) as [ItemId, number][])[0] ?? ['stone', 1];

        return { item, amount: (amount * ticks * share) / recipe.duration };
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
        const tiles = this.farmField(entity).filter((tile) => tile.state !== 'blocked').length;

        return { item: CROPS.item, amount: (tiles * this.cropYield() * OFFLINE.farmEfficiency * share * ticks) / CROPS.ripeTicks };
      }

      default:
        return null;
    }
  }

  /** Range une production hors ligne : en ville si des porteurs font la tournée, sinon dans le coffre du bâtiment, tant qu'il a la place. */
  private offlineYield(entity: Building, item: ItemId, amount: number, carriers: boolean, report: OfflineReport, alerts: Set<OfflineAlertId>): number {
    if (amount <= 0) return 0;

    const kept = carriers ? (this.townStock()?.add(item, amount) ?? 0) : entity.store.add(item, Math.min(amount, Math.max(0, entity.store.freeSpace())));

    if (kept < amount) alerts.add('storeFull');
    if (kept <= 0) return 0;
    count(report.gained, item, kept);
    this.tally(item, kept);
    return kept;
  }

  /** Les unités de bois qui restent aux arbres debout dans le rayon d'une cabane. */
  private standingWood(camp: LumberCamp): number {
    let units = 0;

    for (const tree of treesInRange(camp, this.resources, this.harvestable)) units += this.resources.at(tree.tx, tree.ty)?.remaining ?? 0;
    return units;
  }

  /** Abat `units` unités de bois dans le rayon de la cabane, l'arbre le plus proche d'abord : les mêmes prises qu'un coup de hache. */
  private fellTrees(camp: LumberCamp, units: number): void {
    let left = units;

    for (const tree of treesInRange(camp, this.resources, this.harvestable)) {
      while (left > 0) {
        const taken = this.resources.take(tree.tx, tree.ty);

        if (!taken || taken.resource.id !== 'tree') break;
        left -= 1;
        if (taken.stageChanged) this.dirtyTile(tree.tx, tree.ty);
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
  private offlineForge(forge: Forge, ticks: number, carry: Map<EntityId, number>, carriers: boolean, report: OfflineReport, alerts: Set<OfflineAlertId>): void {
    if (this.stopped(forge) || ticks <= 0) return;

    const recipe = forgeRecipe(forge);
    const town = carriers ? this.townStock() : null;
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
      for (const [item, amount] of amountsOf(recipe.outputs)) this.offlineYield(forge, item, amount, carriers, report, alerts);
    }
    if (cycles > 0) carry.set(-forge.id, 0);
  }

  /** Le compte à rebours d'une nurserie sur `ticks` : chaque fois qu'il arrive au bout, un enfant naît s'il y a de quoi le nourrir et de la place. */
  private offlineBirths(nursery: Nursery, ticks: number, births: Map<EntityId, number>, carriers: boolean, report: OfflineReport): void {
    if (nursery.paused) return;

    const recipe: RecipeProto = RECIPES[NURSERY_RECIPE];
    const town = carriers ? this.townStock() : null;
    let left = (births.get(nursery.id) ?? 0) - ticks;

    while (left <= 0) {
      if (this.nurseryKids(nursery).length >= NURSERY_CARE.capacity) {
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
      this.bear(nursery);
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
  private offlineResearch(lab: Lab, ticks: number, running: Map<EntityId, number>, carriers: boolean, report: OfflineReport): void {
    let budget = ticks;

    while (lab.research !== null && budget > 0) {
      if (isCollecting(lab)) {
        const town = carriers ? this.townStockForLab(lab) : null;

        if (!town) return;
        for (const [item] of researchCost(lab.research)) {
          count(report.spent, item, this.supplyLab(lab, item, Math.min(labWants(lab, item), town.available(item)), town, 'town'));
        }
        this.startCountdown(lab);
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

      lab.endTick = this.tickCount;
      this.finishResearch(lab);
      report.research.push(done);
      running.set(lab.id, lab.endTick > 0 && lab.research !== null ? RESEARCH[lab.research].duration : 0);
    }
  }

  /**
   * Les repas d'un pas hors ligne, habitant par habitant, au stock de la
   * ville. Renvoie la part des ouvriers qui travaillent encore : ceux qui
   * n'ont plus rien n'avancent plus leur bâtiment au pas suivant.
   */
  private offlineMeals(town: Store, ticks: number, report: OfflineReport, alerts: Set<OfflineAlertId>): number {
    let laborers = 0;
    let stalled = 0;

    for (const mobile of this.inhabitants()) {
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
  private offlineLowStock(town: Store, alerts: Set<OfflineAlertId>): void {
    for (const need of NEED_IDS) {
      if (alerts.has(need)) continue;

      let rate = 0;

      for (const mobile of this.inhabitants()) rate += mealsPerTick(need, mobile.kind !== 'kid' && !(mobile.kind === 'worker' && mobile.free));
      if (rate > 0 && town.available(NEEDS[need].item) < rate * NEED_ALERT.runwayTicks) alerts.add(need === 'hunger' ? 'lowFood' : 'lowWater');
    }
  }

  /**
   * Un tir de tour. La tour ne se replanifie que s'il reste des mutants :
   * sans eux, elle se rendort, et c'est la prochaine vague qui la réarme.
   */
  private runTower(tower: Tower): void {
    tower.armed = false;

    const { weapon } = buildingLevel(tower.proto, tower.level);

    if (!weapon) return;

    // Une tour d'archers tire au rythme de ses archers à leur poste : sans eux, elle guette sans tirer.
    const staffing = this.staffing(tower);
    const cooldown = staffing ? Math.round((WEAPONS[weapon].cooldown * staffing.max) / Math.max(1, staffing.filled)) : WEAPONS[weapon].cooldown;

    if (staffing?.filled !== 0) {
      const x = (tower.tx + tower.width / 2) * TILE_SIZE;
      const y = (tower.ty + tower.height / 2) * TILE_SIZE;
      const target = nearestFoe(this.mutants(), x, y, WEAPONS[weapon].range * this.rangeFactor());

      if (target) this.fire(weapon, x, y, target);
    }
    if (this.hasMutants()) this.armTower(tower, cooldown);
  }

  private armTower(tower: Tower, delay: number): void {
    if (tower.armed) return;
    tower.armed = true;
    this.scheduler.schedule(tower.id, this.tickCount + delay, this.tickCount);
  }

  /* ---------------------------------------------------------------- mobiles */

  private *mutants(): IterableIterator<Mutant> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'mutant') yield mobile;
    }
  }

  /** Tout ce que l'arc d'Adam peut viser : les mutants et les bêtes. */
  private *foes(): IterableIterator<Foe> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'mutant' || mobile.kind === 'beast') yield mobile;
    }
  }

  private *beasts(): IterableIterator<Beast> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'beast') yield mobile;
    }
  }

  private hasMutants(): boolean {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'mutant') return true;
    }
    return false;
  }

  /**
   * Une nuit calme : la vague de la nuit est abattue (ou n'est jamais sortie),
   * Adam est debout, personne ne joue avec lui. Le joueur peut alors hâter
   * l'aube (`HASTEN`) : le temps de jeu ne change pas, il passe plus vite.
   */
  public calmNight(): boolean {
    return this.clock()?.phase === 'night' && !this.defeated && !this.dead && this.partner === null && !this.hasMutants();
  }

  /** Ève, si elle a rejoint la colonie — en route ou arrivée. */
  public eve(): Eve | undefined {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'eve') return mobile;
    }
    return undefined;
  }

  /**
   * La population : Adam et Ève, les enfants nés aux nurseries, et les
   * ouvriers de la colonie (`colonists`, enfants devenus grands compris) —
   * plus les porteurs hors des postes : ex-mutants sortis de la clinique,
   * survivants du Signal. Un bâtiment n'en ajoute aucun : il emploie des
   * ouvriers libres.
   */
  public population(): { adults: number; children: number; workers: number } {
    let children = 0;
    let workers = this.colonists;

    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'kid') children += 1;
      if (mobile.kind === 'worker' && (mobile.exMutant || mobile.grown || mobile.survivor)) workers += 1;
    }
    return { adults: this.eve() ? 2 : 1, children, workers };
  }

  /** Les enfants qu'élève la nurserie : ceux qui y sont nés et n'ont pas encore l'âge de travailler. */
  public nurseryKids(nursery: Nursery): Kid[] {
    const kids: Kid[] = [];

    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'kid' && mobile.homeId === nursery.id) kids.push(mobile);
    }
    return kids;
  }

  /**
   * Le compte à rebours de la production en cours d'un bâtiment — la naissance
   * d'un enfant, une recherche payée — ou `null` quand rien ne tourne : en
   * pause, en attente de nourriture ou de son coût, nurserie pleine. Un futur
   * producteur à durée l'ajoute ici ; la carte et la fenêtre le lisent.
   */
  public productionTimer(entity: Entity): ProductionTimer | null {
    if (entity.kind === 'lab') {
      if (entity.research === null || entity.endTick === 0) return null;
      return { left: Math.max(0, entity.endTick - this.tickCount), total: RESEARCH[entity.research].duration };
    }
    if (entity.kind === 'nursery') {
      const left = entity.nextBirthTick - this.tickCount;

      if (entity.paused || entity.hungry || left <= 0 || this.nurseryKids(entity).length >= NURSERY_CARE.capacity) return null;
      return { left, total: RECIPES[NURSERY_RECIPE].duration };
    }
    return null;
  }

  /**
   * Ticks avant que le plus âgé des enfants de la nurserie devienne ouvrier
   * — à l'aube où il a l'âge —, ou `null` sans enfant ni horloge.
   */
  public nextAdultTicks(nursery: Nursery): number | null {
    const clock = this.clock();
    const kids = this.nurseryKids(nursery);

    if (!clock || kids.length === 0) return null;

    const years = Math.max(1, Math.min(...kids.map((kid) => yearsToWork(kid.age))));

    return ticksToDawn(clock) + (years - 1) * CYCLE_TICKS;
  }

  /**
   * La population détaillée : les enfants, les ouvriers qui glandent dehors
   * (`isIdle`), et tous les autres — à la tâche, entre deux, ou qui dorment.
   */
  public census(): Census {
    const { children, workers } = this.population();
    let idle = 0;

    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile) && this.isIdle(mobile)) idle += 1;
    }
    return { working: Math.max(0, workers - idle), idle, children };
  }

  /** Les ouvriers qui glandent, par id : le HUD centre la caméra sur l'un, puis le suivant. */
  public idleWorkers(): Laborer[] {
    const idle: Laborer[] = [];

    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile) && this.isIdle(mobile)) idle.push(mobile);
    }
    return idle.sort((a, b) => a.id - b.id);
  }

  /**
   * L'ouvrier glande-t-il ? Dehors, sans rien à porter, à bâtir ni à couper,
   * depuis `IDLE.graceTicks` au moins : un porteur entre deux jobs n'est pas
   * un oisif. Le rendu lui donne alors ses poses de glande.
   */
  public isIdle(mobile: Laborer): boolean {
    const since = this.idleSince.get(mobile.id);

    return since !== undefined && this.tickCount - since >= IDLE.graceTicks;
  }

  /** Ce que fait un habitant : enfant, au travail (et où), inactif, chez lui. */
  public occupation(mobile: Inhabitant): Occupation {
    if (mobile.kind === 'kid') return { kind: 'child', days: yearsToWork(mobile.age) };
    if (mobile.inside) return { kind: 'home' };
    if (mobile.sleepingOut) return { kind: 'outside' };
    if (this.isIdle(mobile) || (mobile.kind === 'worker' && mobile.free)) return { kind: 'idle' };

    const place =
      mobile.kind === 'worker'
        ? (mobile.build ?? (mobile.job ? (mobile.job.carried ? mobile.job.to : mobile.job.from) : mobile.homeId))
        : mobile.homeId;
    const at = this.entities.get(place);

    return { kind: 'working', at: at ? at.proto : null };
  }

  /** Tient le compte de qui glande depuis quand : rien de tout ça n'est sauvegardé. */
  private noteIdle(mobile: Laborer): void {
    const busy = mobile.meal !== null || (mobile.kind === 'worker' ? mobile.job !== null || mobile.build !== null : mobile.state !== 'idle');

    if (busy || mobile.inside || mobile.sleepingOut || !this.mobiles.has(mobile.id) || !this.entities.has(mobile.homeId)) {
      this.idleSince.delete(mobile.id);
    } else if (!this.idleSince.has(mobile.id)) {
      this.idleSince.set(mobile.id, this.tickCount);
    }
  }

  /**
   * Les ouvriers de la colonie (`colonists`) et leurs postes : ceux qu'occupent
   * les bâtiments finis qui emploient, le reste est libre. Ceux qu'on a
   * retirés d'un poste (`setWorkers`) sont libres.
   */
  public workforce(): Workforce {
    const counts = new Map<BuildingId, number>();
    const total = this.colonists;
    let busy = 0;
    let idle = 0;
    let assigned = 0;
    let missing = 0;

    for (const entity of this.entities.values()) {
      const { workers } = BUILDINGS[entity.proto];

      if (entity.kind === 'site' || workers === 0) continue;

      const filled = this.roster().filled.get(entity.id) ?? 0;

      if (filled > 0) counts.set(entity.proto, (counts.get(entity.proto) ?? 0) + filled);
      assigned += filled;
      missing += entity.staff - filled;
    }
    for (const worker of this.workers()) {
      if (worker.free || !this.entities.has(worker.homeId)) continue;
      if (worker.job) busy += 1;
      else idle += 1;
    }

    const byBuilding = (Object.keys(BUILDINGS) as BuildingId[]).flatMap((proto) => {
      const count = counts.get(proto);

      return count ? [{ proto, count }] : [];
    });

    return { total, byBuilding, porters: { busy, idle }, assigned, free: total - assigned, missing };
  }

  /**
   * Le bilan de la colonie, lu par le barème des graines : nuits
   * repoussées, enfants encore là, bases abattues, habitants, temps de jeu,
   * Signal envoyé, bâtiments finis — la mairie comptée même
   * tombée, puisqu'elle a tenu jusqu'à la défaite.
   */
  public colonyScore(): ColonyScore {
    let buildings = 0;

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site') buildings += 1;
    }
    if (this.defeated) buildings += 1;

    const { adults, children, workers } = this.population();
    const end = this.defeated ? this.defeatTick : this.tickCount;

    return {
      waves: Math.max(0, this.night - 1),
      children,
      buildings,
      bases: this.enemyBases.filter((base) => !isStanding(base)).length,
      population: adults + children + workers,
      minutes: Math.floor(end / TICKS_PER_SECOND / 60),
      victory: this.victory,
    };
  }

  /**
   * La viande libre de la ville devient de la nourriture (`HUNTING`), la
   * grillée plus généreusement que la crue, le pain plus encore. Un grill en
   * marche garde sa part de viande crue : ce que ses porteurs vont lui
   * apporter n'est pas converti sous leur nez.
   */
  private butcherMeat(): void {
    const town = this.townStock();

    if (!town) return;

    const bread = town.available(HUNTING.bread);

    if (bread > 0) this.convertMeat(HUNTING.bread, bread, HUNTING.foodPerBread);

    const grilled = town.available(HUNTING.grilledMeat);

    if (grilled > 0) this.convertMeat(HUNTING.grilledMeat, grilled, HUNTING.foodPerGrilled);

    let kept = 0;

    for (const entity of this.entities.values()) {
      if (entity.kind === 'forge' && !entity.paused && HUNTING.meat in forgeRecipe(entity).inputs) {
        kept += consumerWants(entity, HUNTING.meat);
      }
    }

    const meat = town.available(HUNTING.meat) - kept;

    if (meat > 0) this.convertMeat(HUNTING.meat, meat, HUNTING.foodPerMeat);
  }

  /** Retirer `amount` de `item` de la ville et y verser la nourriture qu'il rend, au plus ce qui y tient. */
  private convertMeat(item: ItemId, amount: number, perUnit: number): void {
    const town = this.townStock();

    if (!town) return;

    const food = town.add(HUNTING.food, amount * perUnit);
    const used = Math.ceil(food / perUnit);

    town.remove(item, used);
    if (food > 0) this.tally(HUNTING.food, food);
  }

  private stepMobiles(): void {
    if (this.lodging) this.lodgeCrews();
    // Une fois par seconde : les lits suivent les maisons finies ou tombées, les ouvriers venus ou partis.
    if (this.tickCount % HOUSING.assignTicks === 0) {
      this.settleBeds();
      this.settleNames(false);
    }

    // La viande déposée à la mairie devient de la nourriture.
    if (this.tickCount % HUNTING.convertTicks === 0) this.butcherMeat();

    // Les casernes comptent leur formation à la seconde, les ouvriers leur peur.
    if (this.tickCount % TICKS_PER_SECOND === 0) {
      this.stepBarracks();
      this.stepFear();
    }

    // Une fois par tick, pas une fois par ouvrier.
    const troop = this.companions();
    const alarm = this.hasMutants();
    const bedtime = this.isBedtime();
    let lootBlocked = false;

    for (const mobile of this.mobiles.values()) {
      switch (mobile.kind) {
        case 'mutant': {
          const spell = this.spell;
          const wind = spell && { windX: spell.windX, windY: spell.windY, downwind: WEATHER[spell.id].mutantDownwind };
          const step = mobile.queen ? this.stepQueen(mobile, wind) : stepMutant(mobile, this.mutantGoal(mobile), this.blockerAt, STEP_SECONDS, wind);

          if (step.strikes && step.blockedBy !== null) {
            this.damageBuilding(step.blockedBy, ENEMIES[mobile.proto].damage);
          }
          break;
        }

        case 'beast': {
          const solid = WILDLIFE[mobile.proto].throughTrees ? this.isOpenGroundSolid : this.isSolid;
          const step = stepBeast(mobile, this.player, solid, this.seed, this.rng, STEP_SECONDS);

          if (step.strikes) this.hurtPlayer(mobile.id, this.beastDamage(mobile));
          if (step.shoots) this.spitAt(mobile);
          if (step.warns && mobile.slam) {
            const { x, y, ticks } = mobile.slam;

            this.events.emit('chiefSlamWarned', { id: mobile.id, x, y, radius: CHIEF.slam.radius, ticks });
          }
          if (step.slam) this.slamDown(mobile, step.slam);
          break;
        }

        case 'spit': {
          const hit = stepSpit(mobile, this.player, this.spitWall);

          if (hit === 'player') this.hurtPlayer(mobile.from, mobile.damage);
          if (hit !== null || mobile.ttl <= 0) {
            this.mobiles.delete(mobile.id);
            this.events.emit('spitSplashed', { x: mobile.x, y: mobile.y });
          }
          break;
        }

        case 'fireball': {
          const hit = stepSpit(mobile, this.player, this.fireWall);

          if (hit === 'player') this.hurtPlayer(mobile.id, mobile.damage);
          if (hit === 'wall') this.hurtOccupant(mobile.x, mobile.y, mobile.buildingDamage);
          if (hit !== null || mobile.ttl <= 0) {
            this.mobiles.delete(mobile.id);
            this.events.emit('fireballBurst', { x: mobile.x, y: mobile.y, hit: hit !== null });
          }
          break;
        }

        case 'arrow': {
          const hit = stepArrow(mobile, this.foes(), this.wind());
          const base = hit || mobile.baseId === undefined ? undefined : this.enemyBase(mobile.baseId);

          if (hit) {
            this.mobiles.delete(mobile.id);
            if (hit.kind === 'mutant') this.hurtMutant(hit, mobile.damage, mobile.vx, mobile.vy, mobile.shooter);
            else this.hurtBeast(hit, mobile.damage, mobile.shooter);
          } else if (base && isStanding(base) && hitsBase(base, mobile.x, mobile.y)) {
            this.mobiles.delete(mobile.id);
            this.hurtBase(base, mobile.damage, mobile.shooter);
          } else if (mobile.ttl <= 0) {
            this.mobiles.delete(mobile.id);
          }
          break;
        }

        case 'kid':
          if (this.stepNeeds(mobile, alarm)) break;
          stepKid(
            mobile,
            { x: mobile.homeX, y: mobile.homeY },
            this.isSolid,
            this.rng,
            STEP_SECONDS * needsPace(mobile.needs),
            undefined,
            undefined,
            KID_SPRINT,
          );
          break;

        case 'eve':
          this.stepEve(mobile);
          break;

        case 'worker':
          // Couché dehors, il ne l'est que tant que `sleep` l'y remet.
          mobile.sleepingOut = false;
          if (!this.stepNeeds(mobile, alarm)) this.stepWorker(mobile, alarm, bedtime);
          this.noteIdle(mobile);
          break;

        case 'lumberjack':
          // Couché dehors, il ne l'est que tant que `sleep` l'y remet.
          mobile.sleepingOut = false;
          if (!this.stepNeeds(mobile, alarm)) this.stepLumberjack(mobile, alarm, bedtime);
          this.noteIdle(mobile);
          break;

        case 'forester':
          // Couché dehors, il ne l'est que tant que `sleep` l'y remet.
          mobile.sleepingOut = false;
          if (!this.stepNeeds(mobile, alarm)) this.stepForester(mobile, alarm, bedtime);
          this.noteIdle(mobile);
          break;

        case 'farmer':
          // Couché dehors, il ne l'est que tant que `sleep` l'y remet.
          mobile.sleepingOut = false;
          if (!this.stepNeeds(mobile, alarm)) this.stepFarmer(mobile, alarm, bedtime);
          this.noteIdle(mobile);
          break;

        case 'pickup':
          lootBlocked = this.stepPickup(mobile) || lootBlocked;
          break;

        case 'patient':
          this.stepPatient(mobile);
          break;

        case 'companion':
          this.stepCompanion(mobile, troop);
          break;

        case 'caravan':
          this.stepCaravan(mobile);
          break;

        case 'pig':
          this.stepPig(mobile);
          break;
      }
    }

    // Adam sur du butin, sac plein : le HUD le dit, au rythme de la récolte.
    if (lootBlocked && this.tickCount % LOOT_FULL_TICKS === 0) this.events.emit('inventoryFull', {});
  }

  private readonly occupantAt = (tx: number, ty: number): EntityId | undefined => this.chunks.occupantAt(tx, ty);

  /**
   * Ce qui arrête un mutant : le bâti debout. Un chantier — qu'on ne casse
   * pas, il n'a pas de points de vie — le laisse passer : sinon une ruine,
   * ou une palissade jamais livrée, ferait un mur éternel.
   */
  private readonly blockerAt = (tx: number, ty: number): EntityId | undefined => {
    const id = this.chunks.occupantAt(tx, ty);

    return id === undefined || this.entities.get(id)?.kind === 'site' ? undefined : id;
  };

  /* ------------------------------------------------------------------ Reine */

  /**
   * Un tick de la Reine des flaques : elle marche sur la mairie et pond
   * (phase 1), ou chasse sa tour (phase 2). Quand elle plonge, c'est ici
   * qu'on choisit la tour et le point où elle ressort.
   */
  private stepQueen(queen: Mutant, wind: { windX: number; windY: number; downwind: number } | null): MutantStep {
    const preyId = queen.queen?.prey ?? null;
    const prey = preyId === null ? undefined : this.entities.get(preyId);
    const target = prey ? footprintCenter(prey) : this.target;
    const step = stepQueen(queen, target, prey !== undefined, this.blockerAt, STEP_SECONDS, wind);

    if (step.lays) this.layLarvae(queen);
    if (step.dives) this.dive(queen);
    return step;
  }

  /** La ponte : `QUEEN.brood` larves sortent de terre à ses pieds, de part et d'autre. */
  private layLarvae(queen: Mutant): void {
    for (let i = 0; i < QUEEN.brood; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = queen.x + side * (ENEMIES.queen.halfW + ENEMIES.larva.halfW + 2);
      const free = this.occupantAt(floorDiv(x, TILE_SIZE), floorDiv(queen.y, TILE_SIZE)) === undefined;

      this.spawnMutant('larva', QUEEN.larvaEmergeTicks, this.townHallId, free ? { x, y: queen.y } : { x: queen.x, y: queen.y });
    }
    this.events.emit('queenLaid', { id: queen.id, count: QUEEN.brood, x: queen.x, y: queen.y });
  }

  /**
   * Elle plonge : ressort `QUEEN.burrowTicks` plus tard à `QUEEN.surfaceDistance`
   * tuiles de la tour la plus proche, qu'elle chasse désormais. Plus de
   * tour, ou aucune place libre autour : elle reste en surface et marche
   * sur la mairie.
   */
  private dive(queen: Mutant): void {
    const state = queen.queen!;
    let best: Tower | null = null;
    let bestSq = Infinity;

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'tower') continue;

      const center = footprintCenter(entity);
      const sq = distanceSq(queen.x, queen.y, center.x, center.y);

      if (sq < bestSq) {
        bestSq = sq;
        best = entity;
      }
    }
    if (!best) return;

    const box = { halfW: ENEMIES.queen.halfW, halfH: ENEMIES.queen.halfH };
    const point = surfacePoint(
      footprintCenter(best),
      queen,
      (x, y) => blockingTile(x, y, box, (tx, ty) => this.occupantAt(tx, ty) !== undefined) === null,
    );

    if (!point) return;

    this.events.emit('queenDived', { id: queen.id, prey: best.id, x: queen.x, y: queen.y, toX: point.x, toY: point.y });
    state.prey = best.id;
    queen.x = queen.prevX = point.x;
    queen.y = queen.prevY = point.y;
    queen.moving = false;
    queen.emerge = QUEEN.burrowTicks;
    // Ressortie, elle frappe aussitôt.
    queen.attackCooldown = 0;
  }

  /**
   * Ticks avant que la Reine ne sorte cette nuit, du crépuscule à sa vague ;
   * `null` si elle ne sort pas ce soir, ou si elle est déjà dehors.
   */
  public queenCountdown(): number | null {
    const clock = this.clock();

    if (!clock || this.defeated) return null;

    const wave = queenWave(clock.cycle);

    return wave === null ? null : ticksToWave(clock, wave);
  }

  /**
   * L'arc d'Adam : automatique. À chaque tick, il vise l'ennemi le plus
   * proche à portée — mutant, crabe ou loup — et tire dès que le délai est
   * écoulé. Le joueur ne fait que se déplacer ; la cible est retenue dans
   * `player.target` pour que le rendu y pose son marqueur.
   */
  private shootPlayerBow(): void {
    const { player } = this;

    if (player.bowCooldown > 0) player.bowCooldown -= 1;

    const target = nearestFoe(this.foes(), player.x, player.y, WEAPONS.bow.range * this.rangeFactor());

    player.target = target?.id ?? null;

    // Aucun ennemi à portée : l'arc se tourne vers la base mutante la plus proche.
    if (!target) {
      this.shootBase();
      return;
    }
    if (player.bowCooldown > 0) return;

    // Le corps est au-dessus des pieds : la flèche part de la poitrine.
    this.fire('bow', player.x, player.y - 8, target, this.bonus('bowDamage'));
    // Tir rapide (labo) : le délai raccourcit, jamais sous un tick.
    player.bowCooldown = Math.max(1, WEAPONS.bow.cooldown + this.bonus('bowCooldown'));

    // À l'arrêt, Adam se tourne vers ce qu'il vise.
    if (this.moveX === 0 && this.moveY === 0) {
      player.facing = facingOf(target.x - player.x, target.y - player.y);
    }
  }

  /* ---------------------------------------------------------- bases mutantes */

  /** La base mutante, debout ou abattue, sous cet id. */
  public enemyBase(id: number): EnemyBase | undefined {
    return this.enemyBases.find((base) => base.id === id);
  }

  /** La base debout dont la zone couvre la tuile, ou `null` : on n'y bâtit ni n'y récolte. */
  public enemyZoneAt(tx: number, ty: number): EnemyBase | null {
    for (const base of this.enemyBases) {
      if (isStanding(base) && inBaseZone(base, tx, ty)) return base;
    }
    return null;
  }

  /** La base debout dont l'emprise couvre la tuile, ou `null` : elle arrête Adam. */
  public enemyBaseAt(tx: number, ty: number): EnemyBase | null {
    for (const base of this.enemyBases) {
      if (isStanding(base) && onBase(base, tx, ty)) return base;
    }
    return null;
  }

  /** La tuile se récolte-t-elle ? Pas dans la zone d'une base debout. Ce que lisent les bûcherons. */
  private readonly harvestable = (tx: number, ty: number): boolean => this.enemyZoneAt(tx, ty) === null;

  /** La zone de la base tient-elle déjà un bâtiment ou un chantier ? Une ancienne sauvegarde n'y pose pas de base. */
  private zoneBuilt(base: EnemyBase): boolean {
    for (const entity of this.entities.values()) {
      for (let ty = entity.ty; ty < entity.ty + entity.height; ty += 1) {
        for (let tx = entity.tx; tx < entity.tx + entity.width; tx += 1) {
          if (inBaseZone(base, tx, ty)) return true;
        }
      }
    }
    return false;
  }

  /** L'emprise de la base tomberait-elle sur Adam ? */
  private playerOnBase(base: EnemyBase): boolean {
    return playerOverlaps(this.player, base.tx, base.ty, ENEMY_BASE.width, ENEMY_BASE.height);
  }

  /** « Il vous faut un meilleur équipement » — au plus une fois toutes les `ENEMY_BASE.resistTicks`. */
  private resist(base: EnemyBase): void {
    if (this.tickCount - this.resistTick < ENEMY_BASE.resistTicks) return;
    this.resistTick = this.tickCount;
    this.events.emit('enemyBaseResisted', { id: base.id, level: base.level, gear: this.player.gear });
  }

  /** « Abattez d'abord son chef » — au même rythme que `resist`, avec qui il partage son minuteur. */
  private shielded(base: EnemyBase): void {
    if (this.tickCount - this.resistTick < ENEMY_BASE.resistTicks) return;
    this.resistTick = this.tickCount;
    this.events.emit('enemyBaseShielded', { id: base.id });
  }

  /** Adam entre dans la zone d'une base debout : le HUD le dit, une fois par entrée. */
  private watchZone(): void {
    const base = this.enemyZoneAt(floorDiv(this.player.x, TILE_SIZE), floorDiv(this.player.y, TILE_SIZE));
    const id = base?.id ?? null;

    if (id === this.zoneBase) return;
    this.zoneBase = id;
    if (base) this.events.emit('enemyZoneEntered', { id: base.id, level: base.level });
  }

  /**
   * Sans ennemi à portée, l'arc d'Adam vise la base debout la plus proche,
   * en son centre. Trop faible pour elle, il ne tire pas : le HUD dit
   * pourquoi.
   */
  private shootBase(): void {
    const { player } = this;
    const range = (WEAPONS.bow.range * this.rangeFactor() + ENEMY_BASE.reach) * TILE_SIZE;
    let best: EnemyBase | null = null;
    let bestSq = range * range;

    for (const base of this.enemyBases) {
      if (!isStanding(base)) continue;

      const { x, y } = baseCenter(base);
      const sq = distanceSq(player.x, player.y, x, y);

      if (sq <= bestSq) {
        best = base;
        bestSq = sq;
      }
    }
    if (!best) return;
    if (isShielded(best)) {
      this.shielded(best);
      return;
    }
    if (!canDamage(best, player.gear)) {
      this.resist(best);
      return;
    }
    if (player.bowCooldown > 0) return;

    const center = baseCenter(best);
    const arrow = shoot(this.nextMobileId++, 'bow', player.x, player.y - 8, center, this.wind());

    arrow.damage += this.bonus('bowDamage');
    arrow.baseId = best.id;
    this.mobiles.set(arrow.id, arrow);
    this.events.emit('arrowShot', { x: player.x, y: player.y - 8 });
    player.bowCooldown = Math.max(1, WEAPONS.bow.cooldown + this.bonus('bowCooldown'));
    if (this.moveX === 0 && this.moveY === 0) player.facing = facingOf(center.x - player.x, center.y - player.y);
  }

  /**
   * Une flèche frappe une base. À zéro, elle tombe pour de bon : sa zone est
   * libre, le Prestige gagné, et son butin tombe au sol.
   */
  private hurtBase(base: EnemyBase, damage: number, shooter: Shooter = 'player'): void {
    const { x, y } = baseCenter(base);

    // Le bouclier de son chef : la flèche s'y brise.
    if (isShielded(base)) return;

    base.hp = Math.max(0, base.hp - damage);
    if (base.hp > 0) {
      this.events.emit('enemyBaseHit', { id: base.id, hp: base.hp, x, y });
      return;
    }

    const level = enemyBaseLevel(base.level);

    // Abattue, elle ne produit plus et n'envoie plus personne : sa réserve meurt avec elle.
    base.raiders = 0;
    base.brood = 0;
    this.gainPrestige(level.prestige, x, y);
    this.gainXp(baseXp(base.level, 'base'), shooter, x, y);
    if (this.zoneBase === base.id) this.zoneBase = null;
    this.events.emit('enemyBaseDestroyed', { id: base.id, level: base.level, prestige: level.prestige, x, y });
    this.dropLoot(level.loot, x, y + TILE_SIZE);
    this.findPiece('enemyBase', base.id, base.level, x, y);
  }

  /* -------------------------------------------------------------- garde-robe */

  /** Adam change d'apparence : chaque pièce doit être trouvée et à sa place, chaque couleur au nuancier. */
  private dressAdam(look: Look): void {
    const reason = lookRejection(look, this.player.wardrobe);

    if (reason) {
      this.events.emit('lookRejected', { reason });
      return;
    }
    if (sameLook(look, this.player.look)) return;
    this.player.look = copyLook(look);
    this.events.emit('lookChanged', { look: copyLook(look) });
  }

  /**
   * La source `source` donne-t-elle des pièces pour l'événement `key` ? Le
   * tirage est un hachage de la seed (`sim/wardrobe.ts`) : le PRNG du monde
   * ne bouge pas. `level` est celui d'une base ou de son chef. Jamais de
   * doublon : quand Adam a déjà tout, du Prestige à la place, en (x, y).
   */
  private findPiece(source: LootSource, key: number, level = 1, x = this.player.x, y = this.player.y): void {
    const { pieces, spares } = drawPieces(this.seed, source, key, this.player.wardrobe, wardrobeDrop(source, level));

    for (const piece of pieces) {
      this.player.wardrobe.push(piece);
      this.player.unseenPieces.push(piece);
      this.events.emit('pieceFound', { piece, source });
    }
    if (spares > 0) {
      const prestige = spares * WARDROBE_SPARE.prestige;

      this.gainPrestige(prestige, x, y);
      this.events.emit('piecesSpared', { source, prestige });
    }
  }

  /* ---------------------------------------------------------------- coffres */

  /** Le coffre d'un chunk, ou `null` : celui de la seed, sauf s'il tombe sous l'emprise d'une base mutante. */
  public chestOfChunk(cx: number, cy: number): Chest | null {
    const key = coordKey(cx, cy);
    let chest = this.chestCache.get(key);

    if (chest === undefined) {
      const found = chestOfChunk(this.seed, cx, cy);

      chest = found && !this.enemyBases.some((base) => onBase(base, found.tx, found.ty)) ? found : null;
      this.chestCache.set(key, chest);
    }
    return chest;
  }

  /** Le coffre fermé de la tuile, ou `null`. */
  public chestAt(tx: number, ty: number): Chest | null {
    const chest = this.chestOfChunk(floorDiv(tx, CHUNK_TILES), floorDiv(ty, CHUNK_TILES));

    return chest && chest.tx === tx && chest.ty === ty && !this.openedChests.has(chest.id) ? chest : null;
  }

  /** Adam a-t-il déjà ouvert ce coffre ? */
  public isChestOpen(id: number): boolean {
    return this.openedChests.has(id);
  }

  /** Adam passe à `CHESTS.openTiles` d'un coffre fermé : il l'ouvre, et y trouve une pièce. */
  private openChests(): void {
    const { player } = this;
    const reach = CHESTS.openTiles * TILE_SIZE;

    // Les chunks à portée d'Adam : un seul, sauf au bord.
    for (let cy = floorDiv(player.y - reach, CHUNK_SIZE); cy <= floorDiv(player.y + reach, CHUNK_SIZE); cy += 1) {
      for (let cx = floorDiv(player.x - reach, CHUNK_SIZE); cx <= floorDiv(player.x + reach, CHUNK_SIZE); cx += 1) {
        const chest = this.chestOfChunk(cx, cy);

        if (!chest || this.openedChests.has(chest.id)) continue;

        const x = (chest.tx + 0.5) * TILE_SIZE;
        const y = (chest.ty + 0.5) * TILE_SIZE;

        if (distanceSq(player.x, player.y, x, y) > reach * reach) continue;
        this.openedChests.add(chest.id);
        this.events.emit('chestOpened', { id: chest.id, tx: chest.tx, ty: chest.ty, x, y });
        this.findPiece('chest', chest.id, 1, x, y);

        const tier = tierAt(this.seed, chest.tx, chest.ty);
        const items = rollDiscoveryLoot(this.seed, chest.id, DISCOVERIES.chest.loot[tier]!);

        this.emitFind(chest.id, 'chest', chest.tx, chest.ty, this.stowFinds(items, x, y), null, null);
      }
    }
  }

  /* ----------------------------------------------------- ruines et secrets */

  /** La ruine ou le secret d'un chunk, ou `null` : celui de la seed, sauf sous une base mutante ou sur la case d'un coffre. */
  public spotOfChunk(kind: SpotKind, cx: number, cy: number): Spot | null {
    const key = `${kind}:${coordKey(cx, cy)}`;
    let spot = this.spotCache.get(key);

    if (spot === undefined) {
      const found = spotOfChunk(this.seed, kind, cx, cy);
      const chest = this.chestOfChunk(cx, cy);

      spot = found && !this.enemyBases.some((base) => onBase(base, found.tx, found.ty)) && !(chest && chest.tx === found.tx && chest.ty === found.ty) ? found : null;
      this.spotCache.set(key, spot);
    }
    return spot;
  }

  /** Ce point (coffre, ruine ou secret) a-t-il déjà été trouvé ? */
  public isFound(id: number): boolean {
    return this.openedChests.has(id) || this.foundSpots.has(id);
  }

  /** Adam passe près d'une ruine ou d'un secret pas encore trouvé : il le fouille. */
  private searchSpots(): void {
    const { player } = this;
    const reach = Math.max(DISCOVERIES.ruin.searchTiles, DISCOVERIES.secret.findTiles) * TILE_SIZE;

    for (let cy = floorDiv(player.y - reach, CHUNK_SIZE); cy <= floorDiv(player.y + reach, CHUNK_SIZE); cy += 1) {
      for (let cx = floorDiv(player.x - reach, CHUNK_SIZE); cx <= floorDiv(player.x + reach, CHUNK_SIZE); cx += 1) {
        for (const kind of ['ruin', 'secret'] as const) {
          const spot = this.spotOfChunk(kind, cx, cy);

          if (!spot || this.foundSpots.has(spot.id)) continue;

          const x = (spot.tx + 0.5) * TILE_SIZE;
          const y = (spot.ty + 0.5) * TILE_SIZE;
          const range = (kind === 'ruin' ? DISCOVERIES.ruin.searchTiles : DISCOVERIES.secret.findTiles) * TILE_SIZE;

          if (distanceSq(player.x, player.y, x, y) > range * range) continue;
          this.foundSpots.add(spot.id);
          this.findSpot(spot, x, y);
        }
      }
    }
  }

  private findSpot(spot: Spot, x: number, y: number): void {
    if (spot.kind === 'secret') {
      const items = rollDiscoveryLoot(this.seed, spot.id, DISCOVERIES.secret.loot[spot.tier]!);

      this.emitFind(spot.id, 'secret', spot.tx, spot.ty, this.stowFinds(items, x, y), null, null);
      return;
    }

    const { plans, research } = DISCOVERIES.ruin;
    const missing = plans[spot.tier]!.filter((building) => !this.openBuildings.has(building));
    const reward = rollRuinReward(this.seed, spot.id, spot.tier, missing.length);
    let items: [ItemId, number][] = [];
    let plan: BuildingId | null = null;

    if (reward === 'plan') {
      plan = missing[hash3(this.seed, spot.id, 3) % missing.length]!;
      this.openBuildings.add(plan);
    } else if (reward === 'piece') {
      this.findPiece('ruin', spot.id, 1, x, y);
    } else {
      items = this.stowFinds(rollDiscoveryLoot(this.seed, spot.id, research[spot.tier]!), x, y);
    }
    this.emitFind(spot.id, 'ruin', spot.tx, spot.ty, items, plan, reward);
  }

  /**
   * Met le butin d'un point dans le sac ; ce qui n'y tient pas tombe au sol à côté. Rend ce qui est parti
   * vers le sac. Tant que la mairie n'est pas debout, le sac garde sa règle (`carryLimit`) : le surplus
   * attend au sol qu'Adam s'en éloigne, comme ce qu'il jette.
   */
  private stowFinds(items: [ItemId, number][], x: number, y: number): [ItemId, number][] {
    const stowed: [ItemId, number][] = [];

    for (const [index, [item, amount]] of items.entries()) {
      const room = this.townStock() ? amount : Math.max(0, this.carryLimit(item) - this.player.inventory.count(item));
      const added = this.player.inventory.add(item, Math.min(amount, room));

      if (added > 0) stowed.push([item, added]);
      if (added === amount) continue;

      const px = x + (index - (items.length - 1) / 2) * DROP_SPACING;
      const pickup = this.spawnPickup(item, amount - added, px, y + DROP_AHEAD, true);

      this.events.emit('lootDropped', { id: pickup.id, item, x: pickup.x, y: pickup.y });
    }
    return stowed;
  }

  private emitFind(id: number, kind: DiscoveryKind, tx: number, ty: number, items: [ItemId, number][], plan: BuildingId | null, reward: RuinReward | null): void {
    this.events.emit('discoveryFound', { id, kind, tx, ty, x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE, items, plan, reward });
  }

  /* -------------------------------------------------------------- équipement */

  /**
   * Ce qui manque pour forger l'arc suivant, d'ici — objet par objet, le sac
   * puis la ville si la forge est dans son rayon —, ou `null` s'il n'y a plus
   * d'arc à forger.
   */
  public gearMissing(forge: Building): Partial<Record<ItemId, number>> | null {
    if (this.player.gear >= MAX_GEAR) return null;

    const town = this.townStockFor(forge);
    const missing: Partial<Record<ItemId, number>> = {};

    for (const [item, needed] of Object.entries(gearOf(this.player.gear + 1).cost) as [ItemId, number][]) {
      const short = needed - this.player.inventory.available(item) - (town?.available(item) ?? 0);

      if (short > 0) missing[item] = short;
    }
    return missing;
  }

  /** « Forger » : l'arc suivant, payé d'un coup, le sac d'abord, puis la ville. */
  private craftGear(id: EntityId): void {
    const forge = this.entities.get(id);
    const reject = (reason: GearRejection): void => this.events.emit('gearRejected', { reason });

    if (!forge || forge.kind === 'site' || forge.proto !== GEAR_WORKSHOP) return reject('missing');
    if (!this.inReach(forge)) return reject('outOfReach');

    const missing = this.gearMissing(forge);

    if (!missing) return reject('maxLevel');
    if (Object.keys(missing).length > 0) return reject('missingItems');

    const town = this.townStockFor(forge);
    const fromBag: [ItemId, number][] = [];

    for (const [item, needed] of Object.entries(gearOf(this.player.gear + 1).cost) as [ItemId, number][]) {
      const bag = Math.min(needed, this.player.inventory.available(item));

      if (bag > 0) {
        this.player.inventory.remove(item, bag);
        fromBag.push([item, bag]);
      }
      if (needed > bag) town?.remove(item, needed - bag);
    }
    this.player.gear += 1;
    this.events.emit('gearCrafted', { level: this.player.gear, fromBag });
  }

  /** `extraDamage` : ce que la recherche ajoute aux dégâts de l'arme. */
  private fire(weapon: keyof typeof WEAPONS, x: number, y: number, target: Foe, extraDamage = 0): void {
    const arrow = shoot(this.nextMobileId++, weapon, x, y, target, this.wind());

    arrow.damage += extraDamage;
    if (weapon !== 'bow') arrow.shooter = 'tower';
    this.mobiles.set(arrow.id, arrow);
    this.events.emit('arrowShot', { x, y });
  }

  /**
   * Une flèche touche un mutant. À zéro, il s'évapore et lâche son butin —
   * sauf si une clinique a une place pour lui et que le sort le veut : il
   * tombe alors assommé, sans butin, mais avec une chance d'être recruté.
   * (vx, vy) : la vitesse de la flèche, dont le rendu tire le recul.
   */
  private hurtMutant(mutant: Mutant, damage: number, vx: number, vy: number, shooter: Shooter = 'player'): void {
    mutant.hp -= damage;

    if (mutant.hp > 0) {
      const speed = Math.hypot(vx, vy) || 1;

      this.events.emit('mutantHit', { id: mutant.id, hp: mutant.hp, x: mutant.x, y: mutant.y, dx: vx / speed, dy: vy / speed });
      return;
    }
    this.mobiles.delete(mutant.id);
    this.kills += 1;
    this.countChallenge('kills', 1);
    this.gainPrestige(KILL_PRESTIGE[mutant.proto], mutant.x, mutant.y);
    this.gainXp(killXp(mutant.proto), shooter, mutant.x, mutant.y);

    // La Reine et ses larves ne tombent jamais assommées : pas de tirage, le PRNG ne bouge pas.
    const clinic = ENEMIES[mutant.proto].stunnable ? this.freeClinic(mutant.x, mutant.y) : null;

    if (clinic && this.rng() < CLINIC.stunChance) {
      this.stun(mutant, clinic);
    } else {
      this.events.emit('mutantDied', { id: mutant.id, x: mutant.x, y: mutant.y });
      this.dropLoot(ENEMIES[mutant.proto].loot, mutant.x, mutant.y);
      if (mutant.queen) {
        this.events.emit('queenSlain', { id: mutant.id, night: this.night, x: mutant.x, y: mutant.y });
        this.findPiece('queen', this.night, 1, mutant.x, mutant.y);
      }
    }

    if (!this.defeated && !this.hasMutants()) {
      this.events.emit('waveCleared', { night: this.night });
      if (this.bountyNight === this.night) this.payBounty();
    }
  }

  /** La vague de la nuit est abattue toute : sa prime (`waveBounty`), en ville ou dans le sac, le surplus au sol. */
  private payBounty(): void {
    const night = this.night;

    this.bountyNight = null;

    const { reward, to } = this.bestow(waveBounty(night));

    this.events.emit('waveRewarded', { night, reward, to });
  }

  /**
   * Des objets donnés à la colonie : en ville si la mairie est debout, sinon
   * dans le sac. Ce qui n'y tient pas tombe au sol à côté d'Adam, comme le
   * butin : rien n'est jeté. Rend ce qui est entré, et où.
   */
  private bestow(rewards: readonly [ItemId, number][]): { reward: [ItemId, number][]; to: 'town' | 'bag' } {
    const town = this.townStock();
    const store = town ?? this.player.inventory;
    const reward: [ItemId, number][] = [];

    for (const [index, [item, amount]] of rewards.entries()) {
      const added = store.add(item, amount);

      if (added > 0) reward.push([item, added]);
      if (added === amount) continue;

      const x = this.player.x + (index - (rewards.length - 1) / 2) * DROP_SPACING;
      const pickup = this.spawnPickup(item, amount - added, x, this.player.y + DROP_AHEAD, false);

      this.events.emit('lootDropped', { id: pickup.id, item, x: pickup.x, y: pickup.y });
    }
    return { reward, to: town ? 'town' : 'bag' };
  }

  /* --------------------------------------------------------------- clinique */

  /**
   * Places prises dans une clinique : ses patients, où qu'ils en soient, et
   * les ex-mutants qu'elle loge.
   */
  public clinicBedsUsed(id: EntityId): number {
    let used = 0;

    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'patient' && mobile.clinicId === id) used += 1;
      else if (mobile.kind === 'worker' && mobile.exMutant && mobile.homeId === id) used += 1;
    }
    return used;
  }

  /** La clinique finie la plus proche qui a encore une place, ou `null`. */
  private freeClinic(x: number, y: number): Clinic | null {
    let best: Clinic | null = null;
    let bestDistance = Infinity;

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'clinic' || this.clinicBedsUsed(entity.id) >= CLINIC.beds) continue;

      const door = doorOf(entity);
      const distance = distanceSq(x, y, door.x, door.y);

      if (distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Le mutant tombe assommé là où il est : un patient, à qui la clinique garde une place. */
  private stun(mutant: Mutant, clinic: Clinic): void {
    const patient: Patient = {
      kind: 'patient',
      id: this.nextMobileId++,
      x: mutant.x,
      y: mutant.y,
      prevX: mutant.x,
      prevY: mutant.y,
      facing: 'down',
      moving: false,
      state: 'stunned',
      clinicId: clinic.id,
      ticks: CLINIC.stunTicks,
    };

    this.mobiles.set(patient.id, patient);
    this.events.emit('mutantStunned', { id: patient.id, clinicId: clinic.id, x: patient.x, y: patient.y });
  }

  /**
   * Un tick de patient. Assommé, il attend qu'Adam le touche ; après, il le
   * suit en boitillant, en ligne droite comme un porteur, jusqu'à la porte
   * de sa clinique ; dedans, il guérit. Si personne ne vient, ou si sa
   * clinique tombe, il s'évapore comme un mutant abattu.
   */
  private stepPatient(patient: Patient): void {
    const clinic = this.entities.get(patient.clinicId);

    if (clinic?.kind !== 'clinic') {
      this.evaporate(patient);
      return;
    }

    const { player } = this;

    switch (patient.state) {
      case 'stunned': {
        const reach = CLINIC.touchRadius * TILE_SIZE;

        standStill(patient);
        patient.ticks -= 1;

        if (distanceSq(player.x, player.y, patient.x, patient.y) <= reach * reach) {
          patient.state = 'following';
          this.events.emit('patientFollowing', { id: patient.id, x: patient.x, y: patient.y });
        } else if (patient.ticks <= 0) {
          this.evaporate(patient);
        }
        break;
      }

      case 'following': {
        const door = doorOf(clinic);
        const admit = CLINIC.admitRadius * TILE_SIZE;
        const gap = CLINIC.followGap * TILE_SIZE;

        if (distanceSq(patient.x, patient.y, door.x, door.y) <= admit * admit) {
          patient.state = 'care';
          patient.ticks = CLINIC.careTicks;
          patient.x = patient.prevX = door.x;
          patient.y = patient.prevY = door.y;
          patient.moving = false;
          this.events.emit('patientAdmitted', { id: patient.id, clinicId: clinic.id });
        } else if (distanceSq(player.x, player.y, patient.x, patient.y) <= gap * gap) {
          standStill(patient);
        } else {
          walkToward(patient, player.x, player.y, STEP_SECONDS);
        }
        break;
      }

      case 'care':
        standStill(patient);
        patient.ticks -= 1;
        if (patient.ticks <= 0) this.heal(patient, clinic);
        break;
    }
  }

  /** Oublié ou sans clinique : il s'évapore comme un mutant abattu, et lâche son butin. */
  private evaporate(patient: Patient): void {
    this.mobiles.delete(patient.id);
    this.events.emit('mutantDied', { id: patient.id, x: patient.x, y: patient.y });
    this.dropLoot(ENEMIES.mutant.loot, patient.x, patient.y);
  }

  /** La nuit de soins est finie : il sort sur le seuil, ex-mutant et porteur, logé à la clinique. */
  private heal(patient: Patient, clinic: Clinic): void {
    const door = doorOf(clinic);
    const id = this.nextMobileId++;
    const worker: Worker = {
      kind: 'worker',
      id,
      sex: sexOf(this.seed, id),
      trait: traitOf(this.seed, id),
      ...freshNeeds(),
      ...freshHousing(),
      age: adultAge(this.seed, id),
      x: door.x,
      y: door.y,
      prevX: door.x,
      prevY: door.y,
      facing: 'down',
      moving: false,
      homeId: clinic.id,
      exMutant: true,
      grown: false,
      logistician: false,
      builder: false,
      survivor: false,
      free: false,
      build: null,
      // Il reste un instant sur le seuil, qu'on le voie sortir, avant de chercher du travail.
      inside: false,
      job: null,
      searchTicks: PORTERS.retryTicks,
      ...wanderFrom(door.x, door.y),
    };

    this.mobiles.delete(patient.id);
    this.mobiles.set(worker.id, worker);
    this.events.emit('mutantHealed', { id: worker.id, clinicId: clinic.id, x: door.x, y: door.y });
  }

  /* ------------------------------------------------------------ compagnons */

  /** La troupe vivante, dans l'ordre des ids. */
  public companions(): Companion[] {
    const troop: Companion[] = [];

    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'companion') troop.push(mobile);
    }
    return troop;
  }

  /** Compagnons vivants et recrues en formation, toutes casernes confondues : ce que plafonne `COMPANIONS.max`. */
  public companionCount(): number {
    let count = 0;

    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'companion') count += 1;
    }
    for (const entity of this.entities.values()) {
      if (entity.kind === 'barracks' && entity.training !== null) count += 1;
    }
    return count;
  }

  /**
   * Ce qui manque pour recruter un compagnon de cette classe, d'ici — objet
   * par objet, le sac puis la ville si la caserne est dans son rayon.
   */
  public recruitMissing(barracks: Building, role: CompanionClassId): Partial<Record<ItemId, number>> {
    const town = this.townStockFor(barracks);
    const missing: Partial<Record<ItemId, number>> = {};

    for (const [item, needed] of Object.entries(COMPANION_CLASSES[role].cost) as [ItemId, number][]) {
      const short = needed - this.player.inventory.available(item) - (town?.available(item) ?? 0);

      if (short > 0) missing[item] = short;
    }
    return missing;
  }

  /** Le bouton « Recruter » : le coût d'un coup, puis la formation. */
  private recruit(id: EntityId, role: CompanionClassId): void {
    const barracks = this.entities.get(id);
    const reject = (reason: RecruitRejection): void => this.events.emit('recruitRejected', { reason });

    if (barracks?.kind !== 'barracks') return reject('missing');
    if (!this.inReach(barracks)) return reject('outOfReach');
    if (barracks.training !== null) return reject('busy');
    if (this.companionCount() >= COMPANIONS.max) return reject('full');
    if (Object.keys(this.recruitMissing(barracks, role)).length > 0) return reject('missingItems');

    const town = this.townStockFor(barracks);
    const fromBag: [ItemId, number][] = [];

    for (const [item, needed] of Object.entries(COMPANION_CLASSES[role].cost) as [ItemId, number][]) {
      const bag = Math.min(needed, this.player.inventory.available(item));

      if (bag > 0) {
        this.player.inventory.remove(item, bag);
        fromBag.push([item, bag]);
      }
      if (needed > bag) town?.remove(item, needed - bag);
    }

    barracks.training = { role, endTick: this.tickCount + COMPANION_CLASSES[role].trainTicks };
    this.events.emit('companionTraining', { id, role, endTick: barracks.training.endTick, fromBag });
  }

  /** Chaque seconde : une recrue dont la formation est finie sort par la porte de sa caserne. */
  private stepBarracks(): void {
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'barracks' || entity.training === null || this.tickCount < entity.training.endTick) continue;

      const door = doorOf(entity);
      const companion = createCompanion(this.nextMobileId++, entity.training.role, door.x, door.y);

      entity.training = null;
      this.mobiles.set(companion.id, companion);
      this.events.emit('companionJoined', { id: companion.id, barracksId: entity.id, role: companion.role, x: companion.x, y: companion.y });
    }
  }

  /** Un tick de compagnon : il agit, puis encaisse le coup de l'ennemi qui le touche. */
  private stepCompanion(companion: Companion, troop: readonly Companion[]): void {
    const act = stepCompanion(companion, {
      player: this.player,
      troop,
      foes: this.foes(),
      isSolid: this.companionSolid,
      stepSeconds: STEP_SECONDS,
    });

    switch (act.type) {
      case 'strike': {
        const dx = act.foe.x - companion.x;
        const dy = act.foe.y - companion.y;

        this.events.emit('companionStruck', { id: companion.id });
        if (act.foe.kind === 'mutant') this.hurtMutant(act.foe, act.damage, dx, dy);
        else this.hurtBeast(act.foe, act.damage);
        break;
      }

      case 'shoot':
        // Le corps est au-dessus des pieds : la flèche part de la poitrine.
        this.fire('bow', companion.x, companion.y - 8, act.foe, act.damage - WEAPONS.bow.damage);
        break;

      case 'heal': {
        const { player } = this;

        if (act.who === 'player') player.hp = Math.min(PLAYER_MAX_HP, player.hp + act.amount);
        else act.who.hp = Math.min(COMPANION_CLASSES[act.who.role].hp, act.who.hp + act.amount);

        const at = act.who === 'player' ? player : act.who;

        this.events.emit('companionHealed', { by: companion.id, who: act.who === 'player' ? 'player' : act.who.id, amount: act.amount, x: at.x, y: at.y });
        break;
      }

      case 'warp':
      case 'none':
        break;
    }

    if (companion.hurtTicks > 0) return;

    const reach = COMPANIONS.contactRange * TILE_SIZE;

    for (const foe of this.foes()) {
      if (!isTargetable(foe) || distanceSq(foe.x, foe.y, companion.x, companion.y) > reach * reach) continue;
      this.hurtCompanion(companion, foe.kind === 'mutant' ? ENEMIES[foe.proto].damage : this.beastDamage(foe));
      break;
    }
  }

  /** Un coup sur un compagnon. À zéro, il tombe : la caserne peut en former un autre. */
  private hurtCompanion(companion: Companion, damage: number): void {
    companion.hp = Math.max(0, companion.hp - damage);
    companion.hurtTicks = COMPANIONS.hurtTicks;

    if (companion.hp > 0) {
      this.events.emit('companionHurt', { id: companion.id, hp: companion.hp });
      return;
    }
    this.mobiles.delete(companion.id);
    this.events.emit('companionDied', { id: companion.id, role: companion.role, x: companion.x, y: companion.y });
  }

  /** Ce qui arrête un compagnon : l'eau, le bâti, l'emprise d'une base mutante — pas les arbres, il se faufile. */
  private readonly companionSolid = (tx: number, ty: number): boolean => this.isOpenGroundSolid(tx, ty) || this.enemyBaseAt(tx, ty) !== null;

  /* ------------------------------------------------------------------ butin */

  /**
   * Le butin d'un ennemi abattu, tiré de sa table et posé au sol là où il est
   * tombé : un objet par exemplaire, un peu éparpillés. Au-delà du plafond,
   * le plus ancien au sol s'efface.
   */
  private dropLoot(table: LootTable, x: number, y: number): void {
    const spread = LOOT_DROPS.scatter * TILE_SIZE;

    for (const item of rollLoot(table, this.rng)) {
      const px = x + (this.rng() - 0.5) * 2 * spread;
      const py = y + (this.rng() - 0.5) * 2 * spread;
      const pickup = this.spawnPickup(item, 1, px, py, false);

      this.events.emit('lootDropped', { id: pickup.id, item, x: px, y: py });
    }
  }

  /** Pose un tas au sol, sous le plafond du butin. */
  private spawnPickup(item: ItemId, amount: number, x: number, y: number, waitForLeave: boolean): Pickup {
    const pickup: Pickup = {
      kind: 'pickup',
      id: this.nextMobileId++,
      x,
      y,
      prevX: x,
      prevY: y,
      facing: 'down',
      moving: false,
      item,
      amount,
      waitForLeave,
      ttl: LOOT_DROPS.lifetimeTicks,
    };

    this.trimLoot();
    this.mobiles.set(pickup.id, pickup);
    return pickup;
  }

  /** Plafond atteint : le butin le plus ancien — le moins de ticks restants — disparaît. */
  private trimLoot(): void {
    let count = 0;
    let oldest: Pickup | null = null;

    for (const mobile of this.mobiles.values()) {
      if (mobile.kind !== 'pickup') continue;
      count += 1;
      if (!oldest || mobile.ttl < oldest.ttl) oldest = mobile;
    }
    if (oldest && count >= LOOT_DROPS.cap) this.mobiles.delete(oldest.id);
  }

  /**
   * Adam passe dessus : le tas va dans le sac, autant qu'il y a de place — le
   * reste attend au sol, et la valeur rendue le signale. Oublié trop
   * longtemps, il disparaît.
   */
  private stepPickup(pickup: Pickup): boolean {
    const { inventory } = this.player;
    const step = stepPickup(pickup, this.player, inventory.freeSpace() > 0, STEP_SECONDS);

    if (step === 'reached') {
      const amount = inventory.add(pickup.item, pickup.amount);

      if (amount > 0) {
        pickup.amount -= amount;
        if (pickup.amount === 0) this.mobiles.delete(pickup.id);
        this.events.emit('lootPicked', { id: pickup.id, item: pickup.item, amount, x: pickup.x, y: pickup.y });
        if (pickup.amount === 0) return false;
      }
      if (pickup.ttl > 0) return true;
    }
    if (pickup.ttl <= 0) this.mobiles.delete(pickup.id);
    return false;
  }

  /* -------------------------------------------------------------------- Ève */

  /**
   * Une fois par seconde : Ève arrive-t-elle, a-t-elle un mur à réparer, la
   * quête en cours est-elle remplie ? Elle arrive quand la nuit
   * `EVE.arrivalNight` est repoussée, une fois la nuit finie ; elle ne
   * répare qu'entre deux vagues.
   */
  private watchOverColony(): void {
    if (this.tickCount % EVE.checkTicks !== 0 || this.defeated) return;

    const eve = this.eve();

    if (!eve) {
      if (this.night >= EVE.arrivalNight && this.clock()?.phase !== 'night' && !this.hasMutants()) this.sendEve();
      return;
    }
    if (eve.state === 'arriving') return;

    if (eve.state === 'idle' && !this.hasMutants()) {
      const damaged = mostDamaged(this.entities.values());

      if (damaged) {
        eve.state = 'repair';
        eve.targetId = damaged.id;
      }
    }

    const quest = currentQuest(this.questsDone);

    if (quest) {
      const { have, need } = questProgress(quest, this.entities.values());

      if (have >= need) {
        this.questsDone += 1;
        this.events.emit('questCompleted', { quest });
        this.startQuest();
      }
    }
  }

  /* -------------------------------------------------------------- objectifs */

  /** Ce que produisent les machines, pour les objectifs. */
  private tally(item: ItemId, amount: number): void {
    this.stats.produced[item] = (this.stats.produced[item] ?? 0) + amount;
  }

  /**
   * Les objectifs du chapitre en cours sont-ils réussis ? Chacun l'est pour
   * de bon, sa récompense tombe une fois. Tous réussis, la récompense du
   * chapitre tombe et le suivant s'ouvre — dans le même tick s'il est déjà
   * rempli : une tour posée avant qu'on la demande compte.
   */
  private checkObjectives(): void {
    if (this.defeated || this.victory) return;

    while (this.chapter < CHAPTERS.length) {
      const index = this.chapter;
      const objectives = chapterObjectives(this);
      const reached = objectives.filter((objective) => !this.objectivesDone.has(objective.id) && objectiveDone(this, objective));

      for (const objective of reached) {
        this.objectivesDone.add(objective.id);

        const stored = this.grant(objective.reward);
        const closing = objectives.every((other) => this.objectivesDone.has(other.id));

        this.events.emit('objectiveCompleted', { id: objective.id, stored, closing });
      }

      if (!objectives.every((objective) => this.objectivesDone.has(objective.id))) return;

      this.chapter += 1;
      this.chapterBase = copyStats(this.stats);

      const stored = this.grant((CHAPTERS[index] as ChapterProto).reward);

      this.events.emit('chapterCompleted', { index, stored });
      this.findPiece('objective', index);
    }

    this.victory = true;
    this.victoryTick = this.tickCount;
    this.signalNights = this.stats.nightsSurvived;
    this.events.emit('victory', {});
  }

  /** La récompense : le sac d'abord agrandi, puis rempli ; le surplus à la mairie. Renvoie ce surplus. */
  private grant(reward: Reward): Partial<Record<ItemId, number>> {
    const hall = this.entities.get(this.townHallId);
    const stored: Partial<Record<ItemId, number>> = {};

    if (reward.bag) {
      const { inventory } = this.player;

      this.player.inventory = Store.fromJSON(inventory.capacity + reward.bag, inventory.toJSON());
    }

    for (const [item, amount] of Object.entries(reward.items ?? {}) as [ItemId, number][]) {
      const rest = amount - this.player.inventory.add(item, amount);

      // Rien n'est jeté : ce qui ne tient pas dans le sac attend dans l'entrepôt de la mairie.
      if (rest > 0 && hall && hall.kind !== 'site') stored[item] = hall.store.add(item, rest);
    }

    if (reward.repair && hall && hall.kind !== 'site') hall.hp = buildingLevel(hall.proto, hall.level).hp;

    return stored;
  }

  /** Ève part du bord de la carte, vers la tuile libre devant la mairie. */
  private sendEve(): void {
    const hall = this.entities.get(this.townHallId);

    if (!hall) return;

    const spot = this.freeTileAround(hall.tx, hall.ty, hall.width, hall.height);
    const homeX = spot ? (spot.tx + 0.5) * TILE_SIZE : this.spawnX;
    const homeY = spot ? (spot.ty + 0.5) * TILE_SIZE : this.spawnY;
    const id = this.nextMobileId++;
    const eve = createEve(id, homeX, homeY, adultAge(this.seed, id));

    this.mobiles.set(eve.id, eve);
    this.events.emit('eveArriving', { id: eve.id });
  }

  private startQuest(): void {
    const quest = currentQuest(this.questsDone);

    if (quest) this.events.emit('questStarted', { quest });
  }

  private stepEve(eve: Eve): void {
    eve.working = false;

    switch (eve.state) {
      case 'arriving':
        if (rideHome(eve, STEP_SECONDS)) {
          eve.state = 'idle';
          this.events.emit('eveArrived', { id: eve.id, x: eve.x, y: eve.y });
          this.startQuest();
        }
        break;

      case 'repair': {
        const target = eve.targetId === null ? undefined : this.entities.get(eve.targetId);

        // Réparé, rasé, ou une vague qui arrive : elle rentre.
        if (!target || target.kind === 'site' || target.hp >= buildingLevel(target.proto, target.level).hp || this.hasMutants()) {
          eve.state = 'idle';
          eve.targetId = null;
          break;
        }
        if (!walkTo(eve, target, this.isOpenGroundSolid, STEP_SECONDS)) break;

        eve.working = true;
        if (eve.repairCooldown > 0) {
          eve.repairCooldown -= 1;
          break;
        }
        target.hp = Math.min(buildingLevel(target.proto, target.level).hp, target.hp + EVE.repairAmount);
        eve.repairCooldown = EVE.repairTicks;
        this.events.emit('buildingRepaired', { id: target.id, hp: target.hp });
        break;
      }

      case 'idle':
        stepKid(eve, { x: eve.homeX, y: eve.homeY }, this.isOpenGroundSolid, this.rng, STEP_SECONDS, EVE.homeRange, EVE.walkSpeed / 2);
        break;
    }
  }

  /* ------------------------------------------------------------------ faune */

  /** Une bête touchée charge qui l'a blessée ; abattue, elle laisse sa tanière et parfois son butin. */
  private hurtBeast(beast: Beast, damage: number, shooter: Shooter = 'player'): void {
    beast.hp -= damage;

    const home = beast.proto === 'chief' && beast.guardOf !== undefined ? this.enemyBase(beast.guardOf) : undefined;

    // Les points de vie d'un chef sont ceux de sa base : rentré, il les garde.
    if (home) home.chief = Math.max(0, beast.hp);
    // Ceux d'un gardien de région aussi : il rentre à son repaire avec ce qu'il lui reste.
    if (beast.regionOf !== undefined && beast.hp > 0) this.guardianHp.set(beast.regionOf, beast.hp);

    if (beast.hp > 0) {
      if (beast.state === 'roam') beast.state = 'chase';
      this.events.emit('beastHit', { id: beast.id, proto: beast.proto, hp: beast.hp, x: beast.x, y: beast.y });
      return;
    }

    const proto = WILDLIFE[beast.proto];
    const den = beast.guardOf === undefined ? this.dens.get(beast.denId) : undefined;
    const base = beast.guardOf === undefined ? undefined : this.enemyBase(beast.guardOf);

    this.mobiles.delete(beast.id);

    // Un gardien ou un cracheur de moins : sa base le refera, le jour. Son chef, jamais : le bouclier tombe avec lui.
    const realm = beast.regionOf === undefined ? undefined : this.regions[beast.regionOf];

    if (realm) this.conquer(realm, beast, shooter);
    if (base && beast.proto === 'chief') {
      this.defeatChief(base, beast);
    } else if (base) {
      if (beast.proto === 'spitter') base.spitters = Math.max(0, base.spitters - 1);
      else base.guards = Math.max(0, base.guards - 1);
    }

    // Tanière vidée par l'arc : elle attend avant de se repeupler.
    if (den) {
      den.members -= 1;
      if (den.members <= 0) den.readyTick = this.tickCount + proto.respawnTicks;
    }

    this.events.emit('beastDied', { id: beast.id, proto: beast.proto, x: beast.x, y: beast.y });
    this.countChallenge('kills', 1);
    this.gainPrestige(KILL_PRESTIGE[beast.proto], beast.x, beast.y);
    this.gainXp(killXp(beast.proto) + (beast.proto === 'chief' && base ? baseXp(base.level, 'chief') : 0), shooter, beast.x, beast.y);
    this.dropLoot(proto.loot, beast.x, beast.y);
    // Un chef a donné la sienne en tombant ; une bête — crabe, loup, gardien, cracheur — parfois une.
    if (beast.proto !== 'chief') this.findPiece('beast', beast.id, 1, beast.x, beast.y);
  }

  /**
   * Le chef d'une base tombe : le bouclier est levé pour de bon, le Prestige
   * de sa base s'ajoute au sien, et le butin rare de sa base tombe avec le
   * sien.
   */
  private defeatChief(base: EnemyBase, chief: Beast): void {
    const level = enemyBaseLevel(base.level);

    base.chief = 0;
    this.events.emit('enemyChiefDefeated', {
      baseId: base.id,
      level: base.level,
      prestige: level.chief.prestige + KILL_PRESTIGE.chief,
      x: chief.x,
      y: chief.y,
    });
    this.gainPrestige(level.chief.prestige, chief.x, chief.y);
    this.dropLoot(level.chief.loot, chief.x, chief.y);
    this.findPiece('chief', base.id, base.level, chief.x, chief.y);
  }

  /**
   * Le gardien d'une région tombe : elle est conquise pour de bon — on y
   * bâtit, on y pave, sa spécialité s'y déniche —, le Prestige et l'XP de son
   * anneau s'ajoutent aux siens, et sa spécialité tombe au sol.
   */
  private conquer(region: Region, guardian: Beast, shooter: Shooter): void {
    const ring = REGION_RINGS[region.ring];
    const { specialty } = BIOMES[region.biome];

    this.conquered.add(region.id);
    this.guardianHp.delete(region.id);
    this.regionRevision += 1;
    if (!ring) return;
    this.events.emit('regionConquered', {
      id: region.id,
      biome: region.biome,
      prestige: ring.prestige + KILL_PRESTIGE[guardian.proto],
      x: guardian.x,
      y: guardian.y,
    });
    this.gainPrestige(ring.prestige, guardian.x, guardian.y);
    this.gainXp(ring.xp, shooter, guardian.x, guardian.y);
    if (specialty) this.dropLoot([{ item: specialty, ...ring.spoils, chance: 1 }], guardian.x, guardian.y);
  }

  /** Les points de vie d'une bête au plus : ceux de son espèce, ou, pour un chef, ceux de sa base, pour un gardien de région, ceux de son anneau. */
  public beastMaxHp(beast: Beast): number {
    const base = beast.proto === 'chief' && beast.guardOf !== undefined ? this.enemyBase(beast.guardOf) : undefined;

    if (base) return enemyBaseLevel(base.level).chief.hp;
    return Math.round(WILDLIFE[beast.proto].hp * this.guardianRing(beast).hpScale);
  }

  /** Ce qu'une bête retire à Adam par coup : son espèce, ou, pour un chef, sa base, pour un gardien de région, son anneau. */
  private beastDamage(beast: Beast): number {
    const base = beast.proto === 'chief' && beast.guardOf !== undefined ? this.enemyBase(beast.guardOf) : undefined;

    if (base) return enemyBaseLevel(base.level).chief.damage;
    return Math.round(WILDLIFE[beast.proto].damage * this.guardianRing(beast).damageScale);
  }

  /** Les multiplicateurs d'un gardien de région ; une autre bête, aucun. */
  private guardianRing(beast: Beast): { hpScale: number; damageScale: number } {
    const region = beast.regionOf === undefined ? undefined : this.regions[beast.regionOf];

    return (region && REGION_RINGS[region.ring]) ?? { hpScale: 1, damageScale: 1 };
  }

  /** Un cracheur crache sur Adam : de sa bouche, vers le corps d'Adam là où il est. */
  private spitAt(spitter: Beast): void {
    const x = spitter.x;
    const y = spitter.y - SPIT_MOUTH;
    const glob = spit(this.nextMobileId++, spitter.id, x, y, { x: this.player.x, y: this.player.y - SPIT_MOUTH }, WILDLIFE[spitter.proto].damage);

    this.mobiles.set(glob.id, glob);
    this.events.emit('spitShot', { id: spitter.id, spit: glob.id, x, y });
  }

  /** Où un crachat s'écrase : un bâtiment, une base debout. Arbres, rochers et eau, il passe par-dessus. */
  private readonly spitWall = (x: number, y: number): boolean => {
    const tx = floorDiv(x, TILE_SIZE);
    const ty = floorDiv(y, TILE_SIZE);

    return this.chunks.occupantAt(tx, ty) !== undefined || this.enemyBaseAt(tx, ty) !== null;
  };

  /** Où une boule de feu s'écrase : un bâtiment. Sa propre base, arbres et rochers, elle passe par-dessus. */
  private readonly fireWall = (x: number, y: number): boolean => this.chunks.occupantAt(floorDiv(x, TILE_SIZE), floorDiv(y, TILE_SIZE)) !== undefined;

  /** Le bâtiment sous le point (x, y) prend `amount` points de dégâts. */
  private hurtOccupant(x: number, y: number, amount: number): void {
    const id = this.chunks.occupantAt(floorDiv(x, TILE_SIZE), floorDiv(y, TILE_SIZE));

    if (id !== undefined) this.damageBuilding(id, amount);
  }

  /** Pour chaque base, le bâtiment à portée de ses boules de feu, recalculé une fois par seconde. */
  private readonly fireTargets = new Map<number, { x: number; y: number } | null>();

  /**
   * Les boules de feu des bases. Une base debout dont Adam est à portée —
   * sinon le bâtiment le plus proche à portée — décompte son délai : une
   * lueur s'allume `FIREBALL.tellTicks` avant le tir, puis la boule part vers
   * où était la cible, sans anticipation. Personne à portée : le délai se
   * remplit, elle ne tire pas. Sa portée ne dépasse pas sa zone.
   */
  private stepBaseFire(): void {
    const { player } = this;
    const scan = this.tickCount % 20 === 0;

    for (const base of this.enemyBases) {
      if (!isStanding(base)) continue;

      const { fire } = enemyBaseLevel(base.level);
      const reach = fire.range * TILE_SIZE;
      const center = baseCenter(base);

      const inRange = distanceSq(player.x, player.y, center.x, center.y) <= reach * reach;

      if (!inRange && scan) this.fireTargets.set(base.id, this.buildingInRange(center, reach));

      const target = inRange ? player : (this.fireTargets.get(base.id) ?? null);

      if (!target) {
        base.fire = fire.cooldownTicks;
        continue;
      }
      base.fire = Math.max(0, base.fire - 1);

      const muzzle = { x: center.x, y: center.y - FIREBALL.muzzle };

      if (base.fire === FIREBALL.tellTicks) {
        this.events.emit('baseFireWarned', { id: base.id, ...muzzle, ticks: FIREBALL.tellTicks });
      } else if (base.fire === 0) {
        base.fire = fire.cooldownTicks;

        const ball = fireball(this.nextMobileId++, base.id, muzzle.x, muzzle.y, { x: target.x, y: target.y - SPIT_MOUTH }, fire.range, fire.damage, fire.buildingDamage);

        this.mobiles.set(ball.id, ball);
        this.events.emit('baseFired', { id: base.id, fireball: ball.id, ...muzzle });
      }
    }
  }

  /** Le centre du bâtiment fini le plus proche de `from` à moins de `reach` pixels, ou `null`. */
  private buildingInRange(from: { x: number; y: number }, reach: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestSq = reach * reach;

    for (const entity of this.entities.values()) {
      if (entity.kind === 'site') continue;

      const x = (entity.tx + entity.width / 2) * TILE_SIZE;
      const y = (entity.ty + entity.height / 2) * TILE_SIZE;
      const sq = distanceSq(from.x, from.y, x, y);

      if (sq < bestSq) {
        bestSq = sq;
        best = { x, y };
      }
    }
    return best;
  }

  /** La massue du chef tombe : Adam encore dans le cercle prend le coup. */
  private slamDown(chief: Beast, at: { x: number; y: number }): void {
    const reach = CHIEF.slam.radius * TILE_SIZE;
    const hit = distanceSq(this.player.x, this.player.y, at.x, at.y) <= reach * reach;
    const base = chief.guardOf === undefined ? undefined : this.enemyBase(chief.guardOf);

    this.events.emit('chiefSlammed', { id: chief.id, x: at.x, y: at.y, hit });
    if (hit) this.hurtPlayer(chief.id, base ? enemyBaseLevel(base.level).chief.slamDamage : WILDLIFE.chief.damage);
  }

  /** Adam est-il à terre, en attendant de réapparaître ? */
  public get dead(): boolean {
    return this.respawnTicks > 0;
  }

  /** Les secondes entières avant qu'Adam ne se relève (0 : debout). */
  public respawnSeconds(): number {
    return Math.ceil(this.respawnTicks / TICKS_PER_SECOND);
  }

  /** Un coup de pince, de croc, de massue ou de crachat. À zéro, Adam tombe : il se réveille à la mairie après `DEATH.respawnSeconds`. */
  private hurtPlayer(by: MobileId, damage: number): void {
    const { player } = this;

    if (this.dead) return;

    player.hp = Math.max(0, player.hp - damage);
    player.calmTicks = 0;
    this.events.emit('playerHurt', { by, hp: player.hp });

    if (player.hp > 0) return;

    const { x, y } = this.respawnSpot();

    player.x = player.prevX = x;
    player.y = player.prevY = y;
    player.target = null;
    this.moveX = 0;
    this.moveY = 0;
    this.respawnTicks = DEATH.respawnSeconds * TICKS_PER_SECOND;
    this.events.emit('playerKnockedOut', { x, y });
  }

  /** Le point de réapparition : une case libre autour de la mairie, sinon le départ. */
  private respawnSpot(): { x: number; y: number } {
    const hall = this.entities.get(this.townHallId);
    const spot = hall ? this.freeTileAround(hall.tx, hall.ty, hall.width, hall.height) : null;

    return spot ? { x: (spot.tx + 0.5) * TILE_SIZE, y: (spot.ty + 0.5) * TILE_SIZE } : { x: this.spawnX, y: this.spawnY };
  }

  /** Le décompte de la mort : un tick par tick de jeu, donc rien en pause. À zéro, Adam se relève, ses PV au maximum. */
  private stepRespawn(): void {
    if (!this.dead) return;

    this.respawnTicks -= 1;
    if (this.respawnTicks > 0) return;

    const { player } = this;
    const { x, y } = this.respawnSpot();

    player.x = player.prevX = x;
    player.y = player.prevY = y;
    player.hp = this.maxHp();
    player.calmTicks = 0;
    this.events.emit('playerRespawned', { x, y });
  }

  /** Au calme, Adam reprend des forces, un point à la fois. */
  private recover(): void {
    const { player } = this;

    if (this.dead) return;

    player.calmTicks += 1;

    if (player.hp >= this.maxHp() || player.calmTicks < PLAYER_CALM_TICKS) return;
    if ((player.calmTicks - PLAYER_CALM_TICKS) % PLAYER_REGEN_TICKS === 0) player.hp += 1;
  }

  /**
   * Les tanières autour d'Adam, une fois par seconde : range les bêtes trop
   * loin de lui, puis peuple les tanières vides des chunks voisins — hors de
   * sa vue, loin du village, sous le plafond. Tout vient de la seed et de
   * l'état : deux parties jouées pareil voient les mêmes bêtes.
   */
  private stepWildlife(): void {
    if (this.tickCount % WILDLIFE_SPAWN.checkTicks !== 0) return;

    const { player } = this;
    const despawn = WILDLIFE_SPAWN.despawnDistance * TILE_SIZE;
    let alive = 0;

    for (const beast of this.beasts()) {
      // Les gardiens sont l'affaire de leur base (`stepGuards`) ou de leur région : ni rangés ici, ni sous le plafond de la faune.
      if (beast.guardOf !== undefined || beast.regionOf !== undefined) continue;
      if (beast.state !== 'chase' && distanceSq(player.x, player.y, beast.x, beast.y) > despawn * despawn) {
        // Rangée, pas tuée : la tanière se repeuplera sans attendre au retour d'Adam.
        this.mobiles.delete(beast.id);

        const den = this.dens.get(beast.denId);

        if (den) den.members -= 1;
        continue;
      }
      alive += 1;
    }

    const { cx, cy } = this.playerChunk();
    const radius = WILDLIFE_SPAWN.chunkRadius;
    const near = WILDLIFE_SPAWN.minPlayerDistance * TILE_SIZE;

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (const den of this.densAt(cx + dx, cy + dy)) {
          const state = this.dens.get(den.id);

          if (state && (state.members > 0 || this.tickCount < state.readyTick)) continue;

          const size = denSize(den);
          const x = (den.tx + 0.5) * TILE_SIZE;
          const y = (den.ty + 0.5) * TILE_SIZE;

          if (alive + size > WILDLIFE_SPAWN.cap) return;
          if (distanceSq(player.x, player.y, x, y) < near * near) continue;
          if (!this.isWild(den)) continue;

          this.populate(den, size);
          alive += size;
        }
      }
    }
  }

  /**
   * Les gardiens des bases, une fois par seconde, comme les tanières : ceux
   * d'une base debout sortent flâner devant quand Adam passe à
   * `GUARD_RANGE.showTiles` tuiles, et rentrent — comptés, pas tués — quand
   * il s'éloigne au-delà de `hideTiles`, sauf s'ils le chargent. On ne fait
   * marcher que ceux qu'Adam peut croiser.
   */
  private stepGuards(): void {
    if (this.tickCount % WILDLIFE_SPAWN.checkTicks !== 0) return;

    const { player } = this;
    const show = GUARD_RANGE.showTiles * TILE_SIZE;
    const hide = GUARD_RANGE.hideTiles * TILE_SIZE;
    const out = new Map<number, Record<GuardKind, number>>();
    const fighting = new Set<number>();
    const regen = this.tickCount % CHIEF.regenTicks === 0;

    for (const beast of [...this.beasts()]) {
      if (beast.guardOf === undefined) continue;

      const base = this.enemyBase(beast.guardOf);
      const away = !base || distanceSq(player.x, player.y, beast.homeX, beast.homeY) > hide * hide;

      // Rentré : il compte toujours parmi les gardiens de sa base, qui le ressortira. Une base abattue n'en loge plus.
      if (beast.state !== 'chase' && (away || !base || !isStanding(base))) {
        this.mobiles.delete(beast.id);
        continue;
      }

      const count = out.get(beast.guardOf) ?? { guardian: 0, spitter: 0, chief: 0 };

      count[guardKind(beast.proto)] += 1;
      out.set(beast.guardOf, count);
      if (beast.proto === 'chief' && beast.state === 'chase') fighting.add(beast.guardOf);
    }

    for (const base of this.enemyBases) {
      if (!isStanding(base)) continue;

      // Hors combat, le chef se refait, sorti ou rentré : un point toutes les `CHIEF.regenTicks`.
      const max = enemyBaseLevel(base.level).chief.hp;

      if (regen && base.chief > 0 && base.chief < max && !fighting.has(base.id)) {
        base.chief = Math.min(max, Math.floor(base.chief) + 1);
        for (const beast of this.beasts()) {
          if (beast.guardOf === base.id && beast.proto === 'chief') beast.hp = base.chief;
        }
      }

      const { x, y } = baseCenter(base);

      if (distanceSq(player.x, player.y, x, y) > show * show) continue;

      const count = out.get(base.id) ?? { guardian: 0, spitter: 0, chief: 0 };

      this.postGuards(base, 'guardian', base.guards - count.guardian);
      this.postGuards(base, 'spitter', base.spitters - count.spitter);
      if (base.chief > 0) this.postGuards(base, 'chief', 1 - count.chief);
    }
  }

  /**
   * Les gardiens des régions, une fois par seconde, comme ceux des bases :
   * celui d'une région à conquérir — son ère atteinte — sort de son repaire
   * quand Adam passe à `REGION_GUARDIAN.showTiles` tuiles, et y rentre,
   * avec ce qu'il lui reste de vie, quand Adam s'éloigne au-delà de
   * `hideTiles`, sauf s'il le charge. Hors combat, il se refait.
   */
  private stepRegionGuardians(): void {
    if (this.tickCount % WILDLIFE_SPAWN.checkTicks !== 0) return;

    const { player } = this;
    const show = REGION_GUARDIAN.showTiles * TILE_SIZE;
    const hide = REGION_GUARDIAN.hideTiles * TILE_SIZE;
    const out = new Map<number, Beast>();

    for (const beast of [...this.beasts()]) {
      if (beast.regionOf === undefined) continue;

      const away = distanceSq(player.x, player.y, beast.homeX, beast.homeY) > hide * hide;

      if (this.regionState(beast.regionOf) !== 'open' || (beast.state !== 'chase' && away)) {
        this.mobiles.delete(beast.id);
        continue;
      }
      out.set(beast.regionOf, beast);
    }

    const regen = this.tickCount % REGION_GUARDIAN.regenTicks === 0;

    for (const region of this.regions) {
      if (!region.lair || this.regionState(region.id) !== 'open') continue;

      const proto = BIOMES[region.biome].guardian;

      if (!proto) continue;

      const guardian = out.get(region.id);
      const hp = this.guardianHp.get(region.id);

      // Hors combat, il regagne un point toutes les `regenTicks`, sorti ou rentré.
      if (regen && hp !== undefined && guardian?.state !== 'chase') {
        const max = Math.round(WILDLIFE[proto].hp * REGION_RINGS[region.ring]!.hpScale);
        const mended = Math.min(max, Math.floor(hp) + 1);

        if (mended >= max) this.guardianHp.delete(region.id);
        else this.guardianHp.set(region.id, mended);
        if (guardian) guardian.hp = mended;
      }
      if (guardian) continue;

      const x = (region.lair.tx + 0.5) * TILE_SIZE;
      const y = (region.lair.ty + 0.5) * TILE_SIZE;

      if (distanceSq(player.x, player.y, x, y) > show * show) continue;

      const id = this.nextMobileId++;
      const beast: Beast = {
        kind: 'beast',
        id,
        proto,
        x,
        y,
        prevX: x,
        prevY: y,
        facing: 'down',
        moving: false,
        hp: 0,
        age: foeAge(this.seed, id, WILDLIFE[proto].age),
        denId: 0,
        regionOf: region.id,
        homeX: x,
        homeY: y,
        state: 'roam',
        dirX: 0,
        dirY: 0,
        wanderTicks: 0,
        attackCooldown: 0,
      };

      beast.hp = this.guardianHp.get(region.id) ?? this.beastMaxHp(beast);
      this.mobiles.set(beast.id, beast);
    }
  }

  /* --------------------------------------------------------------- régions */

  /** La région de la tuile (`sim/regions.ts`). */
  public regionAt(tx: number, ty: number): number {
    return regionAt(this.seed, tx, ty);
  }

  /** La tuile est-elle dans une région conquise ? On n'y bâtit et n'y pave qu'à cette condition. */
  public isConquered(tx: number, ty: number): boolean {
    return this.conquered.has(this.regionAt(tx, ty));
  }

  /**
   * Où en est une région : `conquered` ; `open`, son ère atteinte, son
   * gardien l'attend ; `locked`, il faut d'abord une ère plus avancée.
   */
  public regionState(id: number): 'conquered' | 'open' | 'locked' {
    if (this.conquered.has(id)) return 'conquered';

    const ring = REGION_RINGS[this.regions[id]?.ring ?? -1];

    return ring && this.era >= ring.era ? 'open' : 'locked';
  }

  /** Les régions où tient du bâti ou une route : conquises d'office pour une sauvegarde d'avant les régions. */
  private builtRegions(): Set<number> {
    const built = new Set([HOME_REGION_ID]);

    for (const entity of this.entities.values()) {
      for (let ty = entity.ty; ty < entity.ty + entity.height; ty += 1) {
        for (let tx = entity.tx; tx < entity.tx + entity.width; tx += 1) built.add(this.regionAt(tx, ty));
      }
    }
    return built;
  }

  /** Adam entre dans une région pas encore conquise : le HUD le dit, une fois par entrée. */
  private watchRegion(): void {
    const id = this.regionAt(floorDiv(this.player.x, TILE_SIZE), floorDiv(this.player.y, TILE_SIZE));

    if (id === this.hereRegion) return;
    this.hereRegion = id;

    const state = this.regionState(id);
    const region = this.regions[id];

    if (state === 'conquered' || !region) return;
    this.events.emit('regionEntered', { id, biome: region.biome, state, era: REGION_RINGS[region.ring]?.era ?? 0 });
  }

  /**
   * `count` gardiens de l'espèce sortent de la base et se postent en rond
   * autour d'elle, sur une tuile libre ; les cracheurs derrière la ronde, le
   * chef devant sa porte.
   */
  private postGuards(base: EnemyBase, kind: GuardKind, count: number): void {
    const proto = WILDLIFE[kind];
    const home = baseCenter(base);
    const post = kind === 'chief' ? 0 : kind === 'spitter' ? SPITTER_POST : GUARD_POST;

    for (let i = 0; i < count; i += 1) {
      // Chacun à son poste, tiré de son rang : la ronde ne dépend pas du PRNG. Les cracheurs, en quinconce.
      const rank = kind === 'spitter' ? i + 0.5 : i;
      const angle = ((base.id * 7 + rank) / Math.max(3, kind === 'spitter' ? base.spitters : base.guards)) * Math.PI * 2;
      let x = home.x + Math.cos(angle) * post * TILE_SIZE;
      let y = home.y + Math.sin(angle) * post * TILE_SIZE;

      if (kind === 'chief') ({ x, y } = baseDoor(base));

      if (this.isOpenGroundSolid(floorDiv(x, TILE_SIZE), floorDiv(y, TILE_SIZE))) ({ x, y } = baseDoor(base, i));

      const id = this.nextMobileId++;
      const guard: Beast = {
        kind: 'beast',
        id,
        proto: kind,
        x,
        y,
        prevX: x,
        prevY: y,
        facing: 'down',
        moving: false,
        // Le chef ressort avec ce qu'il lui reste : il ne guérit qu'au calme.
        hp: kind === 'chief' ? base.chief : proto.hp,
        age: foeAge(this.seed, id, proto.age),
        denId: 0,
        guardOf: base.id,
        homeX: home.x,
        homeY: home.y,
        state: 'roam',
        dirX: 0,
        dirY: 0,
        wanderTicks: 0,
        attackCooldown: 0,
        ...(kind === 'chief' && { slamCooldown: 0 }),
      };

      this.mobiles.set(guard.id, guard);
    }
  }

  /** Les tanières d'un chunk, calculées une fois. */
  public densAt(cx: number, cy: number): readonly Den[] {
    const key = coordKey(cx, cy);
    let dens = this.denCache.get(key);

    if (!dens) {
      dens = densOfChunk(this.seed, cx, cy);
      this.denCache.set(key, dens);
    }
    return dens;
  }

  /** Une tanière est-elle assez loin de la mairie et du village, et libre ? */
  private isWild(den: Den): boolean {
    const x = (den.tx + 0.5) * TILE_SIZE;
    const y = (den.ty + 0.5) * TILE_SIZE;
    const hall = WILDLIFE_SPAWN.townHallClearance * TILE_SIZE;
    const clearance = WILDLIFE_SPAWN.buildingClearance * TILE_SIZE;

    if (distanceSq(x, y, this.target.x, this.target.y) < hall * hall) return false;
    if (this.isSolid(den.tx, den.ty)) return false;

    for (const entity of this.entities.values()) {
      const ex = (entity.tx + entity.width / 2) * TILE_SIZE;
      const ey = (entity.ty + entity.height / 2) * TILE_SIZE;

      if (distanceSq(x, y, ex, ey) < clearance * clearance) return false;
    }
    return true;
  }

  /** La tanière se peuple : `size` bêtes côte à côte, sur l'habitat, jamais dans un obstacle. */
  private populate(den: Den, size: number): void {
    const proto = WILDLIFE[den.species];
    const homeX = (den.tx + 0.5) * TILE_SIZE;
    const homeY = (den.ty + 0.5) * TILE_SIZE;

    for (let i = 0; i < size; i += 1) {
      let x = homeX + (i - (size - 1) / 2) * 14;
      const y = homeY + (i % 2) * 6;
      const tx = floorDiv(x, TILE_SIZE);
      const ty = floorDiv(y, TILE_SIZE);

      if (this.isSolid(tx, ty) || habitatAt(this.seed, tx, ty) !== proto.habitat) x = homeX;

      const id = this.nextMobileId++;
      const beast: Beast = {
        kind: 'beast',
        id,
        proto: den.species,
        x,
        y,
        prevX: x,
        prevY: y,
        facing: 'down',
        moving: false,
        hp: proto.hp,
        age: foeAge(this.seed, id, proto.age),
        denId: den.id,
        homeX,
        homeY,
        state: 'roam',
        dirX: 0,
        dirY: 0,
        wanderTicks: 0,
        attackCooldown: 0,
      };

      this.mobiles.set(beast.id, beast);
    }
    this.dens.set(den.id, { members: size, readyTick: 0 });
  }

  /* --------------------------------------------------------------- cochons */

  /** Les points de cochon d'un chunk, calculés une fois. */
  public pigSpotsAt(cx: number, cy: number): readonly PigSpot[] {
    const key = coordKey(cx, cy);
    let spots = this.pigSpotCache.get(key);

    if (!spots) {
      spots = pigSpotsOfChunk(this.seed, cx, cy);
      this.pigSpotCache.set(key, spots);
    }
    return spots;
  }

  /** Les cochons de la carte, sauvages ou apprivoisés. */
  public *pigs(): IterableIterator<Pig> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'pig') yield mobile;
    }
  }

  /** Le cochon qui suit Adam, s'il y en a un. */
  public followingPig(): Pig | undefined {
    for (const pig of this.pigs()) {
      if (pig.state === 'follow') return pig;
    }
    return undefined;
  }

  /**
   * Un cochon sauvage sur la tuile (tx, ty). Posé sur un point de la seed
   * (`spot`), le point est occupé jusqu'à ce que le cochon soit apprivoisé ou
   * rangé ; sans point, c'est un cochon égaré, que rien ne repeuple.
   */
  public placePig(tx: number, ty: number, spot?: PigSpot): Pig {
    if (spot) this.dens.set(spot.id, { members: 1, readyTick: 0 });
    return this.makePig((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, 'wild', spot?.id ?? 0);
  }

  private makePig(x: number, y: number, state: Pig['state'], denId: number): Pig {
    const pig: Pig = {
      kind: 'pig',
      id: this.nextMobileId++,
      x,
      y,
      prevX: x,
      prevY: y,
      facing: 'down',
      moving: false,
      state,
      denId,
      homeX: x,
      homeY: y,
      dirX: 0,
      dirY: 0,
      wanderTicks: 0,
      tame: 0,
      loose: 0,
      fleeTicks: 0,
    };

    this.mobiles.set(pig.id, pig);
    return pig;
  }

  /**
   * Les points de cochon autour d'Adam, une fois par seconde, comme les
   * tanières : range les cochons sauvages trop loin de lui, puis peuple les
   * points libres des chunks voisins, hors de sa vue et loin du village. Un
   * point d'où un cochon a été apprivoisé reste vide `PIGS.wild.respawnTicks`.
   */
  private stepPigs(): void {
    if (this.tickCount % WILDLIFE_SPAWN.checkTicks !== 0) return;

    const { player } = this;
    const despawn = PIGS.wild.despawnDistance * TILE_SIZE;

    for (const pig of [...this.pigs()]) {
      if (pig.state === 'follow' || distanceSq(player.x, player.y, pig.x, pig.y) <= despawn * despawn) continue;

      // Rangé, pas perdu : son point se repeuplera au retour d'Adam.
      this.mobiles.delete(pig.id);

      const spot = this.dens.get(pig.denId);

      if (spot) spot.members = 0;
    }

    const { cx, cy } = this.playerChunk();
    const radius = WILDLIFE_SPAWN.chunkRadius;
    const near = WILDLIFE_SPAWN.minPlayerDistance * TILE_SIZE;
    const hall = PIGS.wild.townHallClearance * TILE_SIZE;
    const clearance = WILDLIFE_SPAWN.buildingClearance * TILE_SIZE;

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (const spot of this.pigSpotsAt(cx + dx, cy + dy)) {
          const state = this.dens.get(spot.id);

          if (state && (state.members > 0 || this.tickCount < state.readyTick)) continue;

          const x = (spot.tx + 0.5) * TILE_SIZE;
          const y = (spot.ty + 0.5) * TILE_SIZE;

          if (distanceSq(player.x, player.y, x, y) < near * near) continue;
          if (distanceSq(x, y, this.target.x, this.target.y) < hall * hall) continue;
          if (this.isSolid(spot.tx, spot.ty)) continue;
          if ([...this.entities.values()].some((entity) => distanceSq(x, y, (entity.tx + entity.width / 2) * TILE_SIZE, (entity.ty + entity.height / 2) * TILE_SIZE) < clearance * clearance)) continue;

          this.placePig(spot.tx, spot.ty, spot);
        }
      }
    }
  }

  /** Une bête sauvage ou un mutant sorti de sa flaque, assez près du cochon pour l'effrayer. */
  private pigScare(pig: Pig): { x: number; y: number } | null {
    const reach = PIGS.follow.scareDistance * TILE_SIZE;

    for (const foe of this.foes()) {
      if (foe.kind === 'mutant' && foe.emerge > 0) continue;
      if (distanceSq(pig.x, pig.y, foe.x, foe.y) <= reach * reach) return foe;
    }
    return null;
  }

  /** Un tick de cochon : il flâne, se laisse apprivoiser, suit Adam jusqu'à l'élevage et y entre. */
  private stepPig(pig: Pig): void {
    const { player } = this;
    const wasWild = pig.state === 'wild';
    const reach = PIGS.tame.radius * TILE_SIZE;
    // Un seul cochon à la fois derrière Adam : le calcul ne vaut que si celui-ci est tout près.
    const canTame = !wasWild || distanceSq(player.x, player.y, pig.x, pig.y) > reach * reach || this.followingPig() === undefined;
    const scare = pig.state === 'follow' ? this.pigScare(pig) : null;
    const result = stepPigBody(pig, player, scare, canTame, this.isOpenGroundSolid, this.rng, STEP_SECONDS);

    if (result === 'tamed') {
      // Son point se vide un temps : on en retrouvera un plus tard.
      const spot = this.dens.get(pig.denId);

      if (spot) {
        spot.members = 0;
        spot.readyTick = this.tickCount + PIGS.wild.respawnTicks;
      }
      this.events.emit('pigTamed', { id: pig.id, x: pig.x, y: pig.y });
    } else if (result === 'scared' || result === 'lost') {
      this.events.emit('pigFled', { id: pig.id, reason: result === 'scared' ? 'scare' : 'lost' });
    }

    if (pig.state === 'follow') this.enterPen(pig);
  }

  /** Le cochon qui suit Adam arrive à un élevage qui a de la place : il y entre. */
  private enterPen(pig: Pig): void {
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'pigPen' || entity.pigs >= PIG_FARM.capacity) continue;

      const reach = (Math.max(entity.width, entity.height) / 2 + PIGS.enterDistance) * TILE_SIZE;
      const cx = (entity.tx + entity.width / 2) * TILE_SIZE;
      const cy = (entity.ty + entity.height / 2) * TILE_SIZE;

      if (distanceSq(pig.x, pig.y, cx, cy) > reach * reach) continue;

      this.mobiles.delete(pig.id);
      entity.pigs += 1;
      this.events.emit('pigPenned', { id: entity.id, pigs: entity.pigs });
      // Le premier cochon lance le cycle ; les suivants l'accélèrent au prochain.
      if (entity.blocked) this.startPigPen(entity);
      return;
    }
  }

  /**
   * Un cycle d'élevage : la viande de chaque cochon va au coffre. Coffre
   * plein, il s'endort jusqu'à ce qu'on vienne le vider.
   */
  private runPigPen(pen: PigPen): void {
    pen.endTick = 0;
    // En pause, ou sans cochon : il s'endort jusqu'à ce qu'on le relance.
    if (pen.pigs <= 0 || this.stopped(pen)) {
      pen.blocked = true;
      return;
    }

    const amount = PIG_FARM.meatPerPig * pen.pigs;

    if (pen.store.add('meat', amount) < amount) {
      pen.blocked = true;
      return;
    }
    this.tally('meat', amount);
    this.startPigPen(pen);
  }

  /**
   * Lance le cycle suivant s'il y a un cochon. Si la ville a du grain en
   * trop (`PIG_FARM.feed`), l'élevage en prend et le cycle va plus vite.
   */
  private startPigPen(pen: PigPen): void {
    if (pen.pigs <= 0 || this.stopped(pen)) {
      pen.blocked = true;
      return;
    }

    const { item, amount, speed, keepInTown } = PIG_FARM.feed;
    const town = this.townStockFor(pen);
    const fed = town !== null && town.available(item) >= amount + keepInTown;

    if (fed) town.remove(item, amount);
    pen.blocked = false;
    pen.endTick = this.tickCount + Math.ceil(PIG_FARM.cycleTicks * (fed ? speed : 1));
    this.scheduler.schedule(pen.id, pen.endTick, this.tickCount);
  }

  /** L'élevage tombe : ses cochons s'échappent en tous sens, puis se calment et redeviennent sauvages. */
  private releasePigs(pen: PigPen): void {
    const x = (pen.tx + pen.width / 2) * TILE_SIZE;
    const y = (pen.ty + pen.height / 2) * TILE_SIZE;
    const spread = (Math.max(pen.width, pen.height) / 2 + PIG_FARM.escapeSpread) * TILE_SIZE;

    for (let i = 0; i < pen.pigs; i += 1) {
      const angle = this.rng() * Math.PI * 2;
      const pig = this.makePig(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread, 'flee', 0);

      pig.dirX = Math.cos(angle);
      pig.dirY = Math.sin(angle);
      pig.fleeTicks = PIGS.flee.ticks;
    }
    if (pen.pigs > 0) this.events.emit('pigsEscaped', { id: pen.id, count: pen.pigs });
    pen.pigs = 0;
  }

  /* ------------------------------------------------------ jour, nuit, vagues */

  /** L'heure qu'il est, ou `null` tant que la mairie est en chantier : le cycle n'a pas commencé. */
  public clock(): DayClock | null {
    return this.cycleStartTick === 0 ? null : clockAt(this.tickCount - this.cycleStartTick);
  }

  /** Ce que montre l'horloge du HUD — phase, aiguille, numéro du jour —, ou `null` avant la mairie. */
  public dayDial(): DayDial | null {
    const clock = this.clock();

    return clock && dayDial(clock);
  }

  /** Les changements de phase, le compte à rebours et les vagues de la nuit. */
  private stepClock(): void {
    const clock = this.clock();

    if (!clock || this.defeated) return;

    // Un nouveau jour, un nouveau défi ; une fois par seconde, celui qui se compte au brouillard.
    const day = dayDial(clock).day;

    if (this.daily?.day !== day) this.startChallenge(day);
    else if (this.tickCount % TICKS_PER_SECOND === 0) this.countChallenge('explore', 0);

    if (clock.elapsed === 0) {
      if (clock.phase === 'dusk') this.events.emit('duskFell', { night: clock.cycle });
      // La veille au soir, Ève prévient : la Reine sort demain.
      if (clock.phase === 'dusk' && queenWave(clock.cycle + 1) !== null) this.events.emit('queenAnnounced', { night: clock.cycle + 1 });
      if (clock.phase === 'night') this.night = clock.cycle;
      if (clock.phase === 'dawn') this.dawn();
    }

    // Un jour sur deux, une caravane de troc, une fois le matin bien levé.
    if (clock.phase === 'day' && clock.elapsed === CARAVAN.arriveAfter && isCaravanDay(clock.cycle)) this.sendCaravan(clock.cycle);

    // Le jour, les bases produisent pour la nuit qui vient.
    if (clock.phase === 'day') this.breedBases(clock.cycle);

    const { wave, ticks: left } = nextWave(clock);

    // Longtemps avant, la vague s'annonce : jamais de vague sans préavis.
    if (left === WAVE_WARNING.leadTicks) {
      const forecast = this.waveForecast();

      if (forecast) this.events.emit('waveAnnounced', forecast);
    }

    const lead = left > 0 && left <= WAVE_COUNTDOWN_SECONDS * TICKS_PER_SECOND && left % TICKS_PER_SECOND === 0 ? this.leadBase() : null;

    if (lead) {
      const night = clock.cycle;
      const raid = this.raidSize(night);

      // Rien en réserve, pas de chef : la nuit sera calme, rien à annoncer.
      if (raid.count > 0) {
        this.events.emit('waveCountdown', {
          seconds: left / TICKS_PER_SECOND,
          night,
          wave,
          ...raid,
          boss: isBossNight(night),
          queen: isQueenNight(night),
          from: this.compassFromHall(lead),
          targetProto: this.waveTarget().proto,
          ...baseCenter(lead),
        });
      }
    }

    const starting = waveAt(clock);

    if (starting > 0) this.spawnWave(starting);
  }

  /**
   * La cible de la prochaine vague, pour la base `from` (la plus proche de la
   * mairie par défaut), tirée la première fois qu'on la demande : avec
   * `WAVES.targetChance`, la vague vise l'usine — chaque base, le bâtiment
   * de l'usine fini le plus proche d'elle —, sinon la mairie. Tombée avant
   * le départ de la vague, c'est la mairie.
   */
  private waveTarget(from: EnemyBase | null = this.leadBase()): Building {
    const antenna = this.antenna();

    // La nuit qui suit un étage fini, toutes les vagues marchent sur l'antenne.
    if (antenna && this.night === this.lureNight) return antenna;

    if (this.nextWaveTarget === null) {
      const aimed = from && this.rng() < WAVES.targetChance ? this.nearestWaveTarget(baseCenter(from)) : null;

      this.nextWaveTarget = aimed?.id ?? this.townHallId;
    }

    // Annoncée sur l'usine : chaque base vise le bâtiment de l'usine le plus proche d'elle.
    const aimed = this.nextWaveTarget === this.townHallId || !from ? undefined : this.nearestWaveTarget(baseCenter(from));
    const target = aimed ?? this.entities.get(this.nextWaveTarget);

    return target && target.kind !== 'site' ? target : this.hallBuilding();
  }

  /** La mairie debout — les vagues ne partent pas sans elle. */
  private hallBuilding(): Building {
    const hall = this.entities.get(this.townHallId);

    if (!hall || hall.kind === 'site') throw new Error('une vague sans mairie debout');
    return hall;
  }

  /** Le bâtiment de `WAVES.targets` fini le plus proche du point (x, y), ou `null` s'il n'y en a pas. */
  private nearestWaveTarget({ x, y }: { x: number; y: number }): Building | null {
    let best: Building | null = null;
    let bestDistance = Infinity;

    for (const entity of this.entities.values()) {
      if (entity.kind === 'site' || !isWaveTarget(entity.proto)) continue;

      const distance = distanceSq(x, y, (entity.tx + entity.width / 2) * TILE_SIZE, (entity.ty + entity.height / 2) * TILE_SIZE);

      if (distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Où marche un mutant : le milieu du bâtiment que vise sa vague, ou la mairie s'il est tombé. */
  private mutantGoal(mutant: Mutant): { x: number; y: number } {
    const target = mutant.target === undefined ? undefined : this.entities.get(mutant.target);

    if (!target || target.kind === 'site') return this.target;
    return { x: (target.tx + target.width / 2) * TILE_SIZE, y: (target.ty + target.height / 2) * TILE_SIZE };
  }

  /**
   * La vague de la nuit : chaque base debout lâche ses assaillants en
   * réserve, qui passent sa porte l'un après l'autre et marchent sur la
   * cible de la vague ; les chefs de la nuit (`nightBosses`) sortent de la
   * plus proche de la mairie. Le badge retombe à zéro. Sans base debout,
   * personne ne sort : la nuit est calme. Les tours s'éveillent.
   */
  private spawnWave(wave: number): void {
    const lead = this.leadBase();

    if (!lead) return;

    const leadTarget = this.waveTarget(lead);
    const bosses = withEraThreat(nightBosses(this.night), this.era);
    let count = 0;
    let bases = 0;

    // Dans l'ordre des bases : la sortie reste rejouable.
    for (const base of this.enemyBases) {
      if (!isStanding(base)) continue;

      let slot = 0;
      const target = this.waveTarget(base).id;

      if (base.id === lead.id) {
        // Les chefs d'abord, devant leurs troupes ; la Reine marche sur la mairie, quoi que vise sa vague.
        for (const proto of ENEMY_IDS) {
          for (let i = 0; i < (bosses[proto] ?? 0); i += 1) {
            this.spawnMutant(proto, WAVES.emergeTicks + slot * RAIDS.exitStagger, proto === 'queen' ? this.townHallId : target, baseDoor(base, slot));
            slot += 1;
          }
        }
      }
      // Les renforts de l'ère et de la ville sortent avec les chefs, de la base de tête.
      const raiders = base.raiders + (base.id === lead.id ? this.waveReinforcements() : 0);

      for (let i = 0; i < raiders; i += 1) {
        this.spawnMutant(RAIDS.proto, WAVES.emergeTicks + slot * RAIDS.exitStagger, target, baseDoor(base, slot));
        slot += 1;
      }
      base.raiders = 0;
      if (slot === 0) continue;
      count += slot;
      bases += 1;
    }

    this.nextWaveTarget = null;
    if (count === 0) return;
    this.bountyNight = this.night;

    this.events.emit('waveStarted', {
      night: this.night,
      wave,
      count,
      bases,
      boss: isBossNight(this.night),
      queen: isQueenNight(this.night),
      from: this.compassFromHall(lead),
      targetProto: leadTarget.proto,
      ...baseCenter(lead),
    });

    for (const entity of this.entities.values()) {
      if (entity.kind === 'tower') this.armTower(entity, 1);
    }
  }

  /**
   * La base debout la plus proche de la mairie : d'elle sortent les chefs de
   * la nuit, c'est elle que montrent l'annonce et le repère de bord. `null`
   * s'il n'en reste aucune.
   */
  public leadBase(): EnemyBase | null {
    let best: EnemyBase | null = null;
    let bestD = Infinity;

    for (const base of this.enemyBases) {
      if (!isStanding(base)) continue;

      const { x, y } = baseCenter(base);
      const d = distanceSq(x, y, this.target.x, this.target.y);

      if (d < bestD) {
        best = base;
        bestD = d;
      }
    }
    return best;
  }

  /** Ce que lâcheront les bases la nuit `night` s'il la faisait maintenant : assaillants en réserve et chefs, et combien de bases envoient. */
  public raidSize(night: number): { count: number; bases: number } {
    let count = 0;
    let bases = 0;

    for (const base of this.enemyBases) {
      if (!isStanding(base) || base.raiders === 0) continue;
      count += base.raiders;
      bases += 1;
    }

    const lead = this.leadBase();
    const extra = Object.values(withEraThreat(nightBosses(night), this.era)).reduce((sum, n) => sum + n, 0) + (lead ? this.waveReinforcements() : 0);

    if (lead && extra > 0) {
      count += extra;
      if (lead.raiders === 0) bases += 1;
    }
    return { count, bases };
  }

  /**
   * La prochaine vague, telle que le HUD l'annonce, dans les
   * `WAVE_WARNING.leadTicks` qui précèdent sa sortie ; `null` hors de cette
   * fenêtre, avant la mairie, sans base debout, ou si la nuit sera calme.
   * L'effectif est celui qu'auront les bases à la tombée de la nuit : leur
   * production se déroule d'avance (`projectedRaiders`).
   */
  public waveForecast(): WaveForecast | null {
    const clock = this.clock();

    if (!clock || this.defeated) return null;

    const { ticks } = nextWave(clock);

    if (ticks <= 0 || ticks > WAVE_WARNING.leadTicks) return null;

    const lead = this.leadBase();

    if (!lead) return null;

    // La nuit qui vient, et le jour qui lui reste pour produire (ce tick-ci a déjà produit).
    const night = clock.phase === 'day' || clock.phase === 'dusk' ? clock.cycle : clock.cycle + 1;
    const dayTicks = clock.phase === 'day' ? clock.left - 1 : clock.phase === 'dusk' ? 0 : DAY_CYCLE.day;
    const reinforcements = this.waveReinforcements();
    const leaders = Object.values(withEraThreat(nightBosses(night), this.era)).reduce((sum, n) => sum + n, 0) + reinforcements;
    let count = 0;
    let bases = 0;

    // La grâce des premières nuits plafonne ce que les bases réunies auront produit.
    let room = earlyCap(night);

    for (const base of this.enemyBases) {
      const produced = Math.min(room, projectedRaiders(base, night, dayTicks));

      room -= produced;

      const raiders = produced + (base.id === lead.id ? leaders : 0);

      if (raiders === 0) continue;
      count += raiders;
      bases += 1;
    }
    if (count === 0) return null;

    return {
      night,
      ticks,
      count,
      bases,
      reinforcements,
      boss: isBossNight(night),
      queen: isQueenNight(night),
      urgent: ticks <= WAVE_WARNING.urgentTicks,
      from: this.compassFromHall(lead),
      ...baseCenter(lead),
    };
  }

  /** L'ère de la colonie (`waveEraOf`), celle qui renforce les vagues : 0 pendant l'acte I, 1 ensuite, 2 après le Signal. */
  public waveEra(): number {
    return waveEraOf(this.chapter, this.victory);
  }

  /** Les bâtiments finis de la ville, mairie comprise — les palissades ne comptent pas : c'est ce que convoitent les vagues. */
  public townSize(): number {
    let count = 0;

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site' && entity.kind !== 'wall') count += 1;
    }
    return count;
  }

  /** Les renforts de la prochaine vague, de l'ère et de la taille de la ville (`WAVE_STRENGTH`). */
  public waveReinforcements(): number {
    return reinforcements(this.waveEra(), this.townSize());
  }

  /** La direction, vue de la mairie, d'une base. */
  private compassFromHall(base: EnemyBase): Compass {
    const { x, y } = baseCenter(base);

    return compassOf(Math.atan2(y - this.target.y, x - this.target.x));
  }

  /** Un tick de jour pour chaque base : elle avance vers son prochain assaillant et son prochain gardien. */
  private breedBases(night: number): void {
    // La grâce des premières nuits : la réserve commune des bases a un plafond.
    let reserve = this.enemyBases.reduce((sum, base) => sum + (isStanding(base) ? base.raiders : 0), 0);
    const cap = earlyCap(night);

    for (const base of this.enemyBases) {
      if (breed(base, night, reserve < cap).raider) {
        reserve += 1;
        this.events.emit('raiderBred', { id: base.id, raiders: base.raiders });
      }
    }
  }

  /**
   * L'aube : les mutants encore debout fuient le jour — une journée reste
   * sans mutant — et la nuit survécue paie son butin : en ville si la mairie
   * est debout, sinon dans le sac. Ce qui n'y tient pas tombe au sol à côté
   * d'Adam, comme le butin : rien n'est jeté.
   */
  private dawn(): void {
    const mood = this.happiness().total;

    for (const mobile of [...this.mobiles.values()]) {
      if (mobile.kind !== 'mutant') continue;
      this.mobiles.delete(mobile.id);
      this.events.emit('mutantFled', { id: mobile.id, x: mobile.x, y: mobile.y });
    }

    // La vague n'a pas été abattue toute : pas de prime, la nuit survécue paie son butin.
    this.bountyNight = null;

    const { reward, to } = this.bestow(Object.entries(DAWN_REWARD) as [ItemId, number][]);

    this.restInhabitants();
    this.scared.clear();
    this.ageInhabitants();

    // La nuit est survécue : la mairie tient encore (`stepClock` s'arrête à la défaite).
    this.stats.nightsSurvived += 1;
    this.events.emit('dawnBroke', { night: this.night, reward, to });
    this.offerBoons();

    // Après le Signal, des survivants ont entendu l'antenne : ils arrivent avec le jour.
    if (this.victory) this.welcomeSurvivors();
    this.events.emit('happinessChanged', { from: mood, to: this.happiness().total });
  }

  /**
   * De `SURVIVORS.min` à `SURVIVORS.max` survivants, tirés du PRNG du monde,
   * sortent sur le seuil de la mairie : des porteurs de plus, logés chez elle.
   */
  private welcomeSurvivors(): void {
    const hall = this.entities.get(this.townHallId);

    if (!hall || hall.kind === 'site') return;

    const count = SURVIVORS.min + Math.floor(this.rng() * (SURVIVORS.max - SURVIVORS.min + 1));
    const door = doorOf(hall);

    for (let i = 0; i < count; i += 1) {
      const x = door.x + (i - (count - 1) / 2) * DROP_SPACING;
      const id = this.nextMobileId++;
      const worker: Worker = {
        kind: 'worker',
        id,
        sex: sexOf(this.seed, id),
        trait: traitOf(this.seed, id),
        ...freshNeeds(),
        ...freshHousing(),
        age: adultAge(this.seed, id),
        x,
        y: door.y,
        prevX: x,
        prevY: door.y,
        facing: 'down',
        moving: false,
        homeId: hall.id,
        exMutant: false,
        grown: false,
        logistician: false,
        builder: false,
        survivor: true,
        free: false,
        build: null,
        inside: false,
        job: null,
        searchTicks: PORTERS.retryTicks,
        ...wanderFrom(x, door.y),
      };

      this.mobiles.set(worker.id, worker);
    }
    this.events.emit('survivorsArrived', { count, x: door.x, y: door.y });
  }

  /**
   * La nuit passée pèse sur le moral : chaque ouvrier qui avait un lit se
   * lève plus heureux, celui qui a dormi dehors moins (`MOOD`).
   */
  private restInhabitants(): void {
    this.settleBeds();

    const spots = this.decorSpots();

    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile)) mobile.happiness = nightlyMood(mobile.happiness, moodCauses(mobile, this.scared.has(mobile.id)), this.traitFor(mobile), decorMoodAt(mobile.x, mobile.y, spots));
    }
  }

  /** Les décorations debout, au centre de leur emprise : ce qui remonte le moral à l'aube. */
  private decorSpots(): DecorSpot[] {
    const spots: DecorSpot[] = [];

    for (const entity of this.entities.values()) {
      const proto: BuildingProto = BUILDINGS[entity.proto];
      const mood = entity.kind === 'decor' ? proto.mood : undefined;

      if (mood) spots.push({ ...mood, x: (entity.tx + entity.width / 2) * TILE_SIZE, y: (entity.ty + entity.height / 2) * TILE_SIZE });
    }
    return spots;
  }

  /**
   * Les lits de la ville (`sim/housing.ts`) : chaque ouvrier garde le sien
   * tant que sa maison tient, les autres prennent les lits libres les plus
   * proches de leur travail. Les maisons tombées — redevenues chantiers —
   * n'ont plus de lit.
   */
  private settleBeds(): void {
    const lodgings: Lodging[] = [];
    const sleepers: Laborer[] = [];

    for (const entity of this.entities.values()) {
      const beds = entity.kind === 'site' ? 0 : bedsOf(entity.proto, entity.level);

      if (beds > 0) lodgings.push({ id: entity.id, beds, ...doorOf(entity) });
    }
    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile)) sleepers.push(mobile);
    }

    const beds = assignBeds(
      sleepers.map((sleeper) => {
        const work = this.entities.get(sleeper.homeId);

        return { id: sleeper.id, bed: sleeper.bed, ...(work ? doorOf(work) : { x: sleeper.x, y: sleeper.y }) };
      }),
      lodgings,
    );

    for (const sleeper of sleepers) sleeper.bed = beds.get(sleeper.id) ?? null;
  }

  /**
   * L'Habitation : `housed` ouvriers ont un lit, sur `population` ouvriers
   * adultes sur la carte, et `beds` lits en tout dans la ville.
   */
  public housing(): { housed: number; population: number; beds: number } {
    let housed = 0;
    let population = 0;
    let beds = 0;

    for (const mobile of this.mobiles.values()) {
      if (!isLaborer(mobile)) continue;
      population += 1;
      if (mobile.bed !== null) housed += 1;
    }
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site') beds += bedsOf(entity.proto, entity.level);
    }
    return { housed, population, beds };
  }

  /**
   * Le Bonheur de la ville : la somme des jauges de ceux que compte
   * l'Habitation — les ouvriers adultes sur la carte, ni Adam ni les
   * enfants. Une ressource dérivée, relue à chaque appel : rien à
   * sauvegarder, une vieille sauvegarde la retrouve dès le chargement.
   * `unhappy` compte les malheureux, `average` est arrondie à l'unité.
   */
  public happiness(): { total: number; population: number; average: number; unhappy: number } {
    let total = 0;
    let population = 0;
    let unhappy = 0;

    for (const mobile of this.mobiles.values()) {
      if (!isLaborer(mobile)) continue;
      population += 1;
      total += mobile.happiness;
      if (moodOf(mobile.happiness) === 'unhappy') unhappy += 1;
    }
    total = Math.round(total);
    return { total, population, average: population === 0 ? 0 : Math.round(total / population), unhappy };
  }

  /** Les ouvriers qui ont leur lit dans ce bâtiment. */
  public sleepersIn(id: EntityId): Laborer[] {
    const sleepers: Laborer[] = [];

    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile) && mobile.bed === id) sleepers.push(mobile);
    }
    return sleepers;
  }

  /** Les malheureux, du plus malheureux au moins : le HUD centre la caméra sur l'un, puis le suivant. */
  public unhappyInhabitants(): Laborer[] {
    const unhappy: Laborer[] = [];

    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile) && moodOf(mobile.happiness) === 'unhappy') unhappy.push(mobile);
    }
    return unhappy.sort((a, b) => a.happiness - b.happiness || a.id - b.id);
  }

  /** Son trait (`data/traits.ts`) : celui qu'il porte, sinon celui que la seed lui tire. */
  public traitFor(person: Pick<Born, 'trait'> & { id: MobileId }): TraitId {
    return person.trait ?? traitOf(this.seed, person.id);
  }

  /** Son nom : celui que le joueur lui a donné, sinon son prénom tiré de la seed. */
  public nameFor(person: Pick<Born, 'alias' | 'sex'> & { id: MobileId }): string {
    return person.alias ?? this.givenNames.get(person.id) ?? this.giveName(person);
  }

  /** Les habitants qui ont un prénom : les ouvriers et les enfants, dans l'ordre de leur id. */
  private namedInhabitants(): (Laborer | Kid)[] {
    const people: (Laborer | Kid)[] = [];

    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile) || mobile.kind === 'kid') people.push(mobile);
    }
    return people.sort((a, b) => a.id - b.id);
  }

  /** Donne son prénom à un habitant : un que nul autre vivant ne porte. */
  private giveName(person: Pick<Born, 'sex'> & { id: MobileId }): string {
    const name = pickName(this.seed, person.id, person.sex, new Set(this.givenNames.values()));

    this.givenNames.set(person.id, name);
    return name;
  }

  /**
   * Range les prénoms : les morts rendent le leur, les venus sans prénom en
   * reçoivent un. `legacy` : une sauvegarde d'avant eux, dont chacun garde le
   * prénom que la seed lui tirait, doublon ou non.
   */
  private settleNames(legacy: boolean): void {
    const people = this.namedInhabitants();
    const living = new Set(people.map(({ id }) => id));

    for (const id of [...this.givenNames.keys()]) {
      if (!living.has(id)) this.givenNames.delete(id);
    }
    for (const person of people) {
      if (this.givenNames.has(person.id)) continue;
      if (legacy) this.givenNames.set(person.id, nameOf(this.seed, person.id, person.sex));
      else this.giveName(person);
    }
  }

  /** Les traits des adultes de la colonie, par id : de quoi hériter pour un enfant qui naît. */
  private adultTraits(): TraitId[] {
    const adults: Laborer[] = [];

    for (const mobile of this.mobiles.values()) {
      if (isLaborer(mobile)) adults.push(mobile);
    }
    return adults.sort((a, b) => a.id - b.id).map((adult) => this.traitFor(adult));
  }

  /**
   * Renomme un habitant. Un nom vide rend son prénom d'origine ; ni Adam ni
   * un ennemi n'en reçoivent. Vrai si la fiche a changé.
   */
  private renameInhabitant(id: MobileId, name: string): boolean {
    const mobile = this.mobiles.get(id);

    if (!mobile || !(isLaborer(mobile) || mobile.kind === 'kid')) return false;

    const alias = cleanName(name);

    if (alias === null) delete mobile.alias;
    else mobile.alias = alias;
    return true;
  }

  /**
   * Ce que dit la bulle de réaction d'un habitant, rare et brève : la peur
   * d'un ennemi tout près, la joie d'une naissance (un ouvrier sur
   * `REACTIONS.joyOneIn`), la fatigue d'une nuit au travail (à tour de rôle).
   * Rien de tout cela n'est sauvegardé ; la faim et la soif ont leurs propres bulles.
   */
  public reaction(mobile: Inhabitant): ReactionId | null {
    if ((this.fearUntil.get(mobile.id) ?? 0) > this.tickCount) return 'scared';
    if (mobile.kind === 'kid') return null;

    const { joy } = this;

    if (joy && joy.kidId !== mobile.id && this.tickCount - joy.tick < REACTIONS.joyTicks && hash3(this.seed, mobile.id, joy.kidId) % REACTIONS.joyOneIn === 0) return 'joyful';
    if (this.clock()?.phase === 'night' && this.isToiling(mobile) && (this.tickCount + mobile.id * 97) % REACTIONS.sleepyEvery < REACTIONS.sleepyTicks) return 'sleepy';
    return null;
  }

  /** Une fois par seconde : qui a un ennemi à `REACTIONS.fearTiles` a peur — sauf à l'abri chez lui. */
  private stepFear(): void {
    const range = (REACTIONS.fearTiles * TILE_SIZE) ** 2;
    const foes: Mobile[] = [];

    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'mutant' || mobile.kind === 'beast') foes.push(mobile);
    }
    if (foes.length === 0) return;
    for (const mobile of this.mobiles.values()) {
      if (!(isLaborer(mobile) || mobile.kind === 'kid') || (mobile.kind !== 'kid' && mobile.inside)) continue;
      if (!foes.some((foe) => (foe.x - mobile.x) ** 2 + (foe.y - mobile.y) ** 2 <= range)) continue;
      this.fearUntil.set(mobile.id, this.tickCount + REACTIONS.fearTicks);
      this.scared.add(mobile.id);
    }
  }

  /**
   * Une année de plus pour chaque habitant — un cycle jour/nuit vaut un an —
   * et l'enfant qui a l'âge de travailler devient ouvrier. Les ennemis
   * encore là vieillissent aussi.
   */
  private ageInhabitants(): void {
    this.player.age += AGES.yearsPerCycle;
    for (const mobile of [...this.mobiles.values()]) {
      if (mobile.kind === 'arrow' || mobile.kind === 'spit' || mobile.kind === 'fireball' || mobile.kind === 'pickup' || mobile.kind === 'patient' || mobile.kind === 'companion' || mobile.kind === 'caravan' || mobile.kind === 'pig') continue;
      // Un enfant qui a faim ou soif ne grandit pas : il attend sa prochaine aube le ventre plein.
      const stunted = mobile.kind === 'kid' ? stuntingNeed(mobile.needs) : null;

      if (mobile.kind === 'kid' && stunted !== null) {
        this.events.emit('growthStunted', { id: mobile.id, name: this.nameFor(mobile), need: stunted });
        continue;
      }
      mobile.age += AGES.yearsPerCycle;
      if (mobile.kind === 'kid' && canWork(mobile.age)) this.growUp(mobile, true);
    }
  }

  /**
   * L'enfant a l'âge : il part travailler. Il entre dans les ouvriers de la
   * colonie (`colonists`), que les bâtiments se répartissent — un ouvrier
   * libre, sous son id, qui quitte la nurserie pour la mairie ; sa place à la
   * nurserie se libère, et elle reprend ses naissances si elle était pleine.
   */
  private growUp(kid: Kid, announce: boolean): void {
    // Sa part réservée pour un repas en route retourne au stock de la ville.
    this.cancelMeal(kid);

    const hall = this.entities.get(this.townHallId);
    const { id, sex, x, y, prevX, prevY, facing, moving, age, needs } = kid;

    if (hall) {
      this.mobiles.set(
        id,
        freeWorker({ id, sex, ...bornOf(kid), x, y, prevX, prevY, facing, moving, age, needs, meal: null, ...freshHousing() }, hall.id),
      );
    } else {
      this.mobiles.delete(id);
    }
    this.colonists += 1;
    this.rosterChanged();
    this.restartFarms();

    const nursery = this.entities.get(kid.homeId);

    if (nursery?.kind === 'nursery') this.restart(nursery);
    if (announce) this.events.emit('kidGrewUp', { id: kid.id, name: this.nameFor(kid), x: kid.x, y: kid.y });
  }

  /** Le point, en pixels monde, d'où sortira la prochaine vague : la base la plus proche de la mairie, ou la mairie s'il n'en reste pas. */
  public waveOrigin(): { x: number; y: number } {
    const lead = this.leadBase();

    return lead ? baseCenter(lead) : { ...this.target };
  }

  /** Un mutant qui sort de terre en `point` : à la porte de sa base, ou aux pieds de sa mère pour une larve. */
  private spawnMutant(proto: EnemyId, emerge: number, target: EntityId, point: { x: number; y: number }): void {
    const id = this.nextMobileId++;
    const mutant: Mutant = {
      kind: 'mutant',
      id,
      proto,
      x: point.x,
      y: point.y,
      prevX: point.x,
      prevY: point.y,
      facing: 'down',
      moving: false,
      hp: ENEMIES[proto].hp,
      age: foeAge(this.seed, id, ENEMIES[proto].age),
      attackCooldown: 0,
      emerge,
      // La mairie se lit par défaut : seul un autre bâtiment s'écrit.
      ...(target !== this.townHallId && { target }),
    };

    if (proto === 'queen') mutant.queen = { phase: 1, layTicks: QUEEN.layTicks, prey: null };
    this.mobiles.set(mutant.id, mutant);
  }

  /* ---------------------------------------------------------------- besoins */

  /**
   * Le tick d'un habitant côté besoins, avant sa tâche : ses jauges baissent
   * — plus vite au travail —, et sous le seuil d'un besoin il part le combler
   * à la mairie, s'il y a de quoi. Sa tâche attend : un job garde ses
   * réservations, un chantier ou un arbre l'attend, et il les reprend en
   * revenant. Pendant une vague, il rentre s'abriter d'abord. Vrai s'il ne
   * fait rien d'autre ce tick : il est en route pour manger, ou à bout.
   */
  private stepNeeds(mobile: Inhabitant, alarm: boolean): boolean {
    // Avant la mairie, ni faim ni soif : les provisions de la colonie arrivent avec elle (`COLONY.startingStock`).
    if (this.warehouse()) drainNeeds(mobile.needs, this.isToiling(mobile), this.traitFor(mobile), this.needResist());
    if (isLaborer(mobile) && this.starve(mobile)) return true;

    if (alarm) {
      if (mobile.meal !== null) this.cancelMeal(mobile);
    } else {
      // Une fois par seconde, pas à chaque tick : la ligne droite jusqu'à la mairie a un coût.
      if (mobile.meal === null && (this.tickCount + mobile.id) % PORTERS.retryTicks === 0) this.seekMeal(mobile);
      if (mobile.meal !== null) {
        this.walkToMeal(mobile, mobile.meal);
        return true;
      }
    }

    if (needsPace(mobile.needs) > 0) return false;

    // À bout : il s'arrête là où il est, sa tâche en suspens, jusqu'à ce que la ville ait de quoi.
    mobile.prevX = mobile.x;
    mobile.prevY = mobile.y;
    mobile.moving = false;
    return true;
  }

  /**
   * Le compte à rebours de la famine : chaque tick à zéro d'un besoin
   * (`NEEDS[id].deathTicks`) le fait avancer, une jauge remontée le remet à
   * rien. Au premier tick à bout, un avertissement dit combien de secondes il
   * lui reste. Vrai s'il meurt ce tick.
   */
  private starve(mobile: Laborer): boolean {
    for (const [index, need] of NEED_IDS.entries()) {
      const key = famineKey(mobile.id, index);

      if (mobile.needs[need] > 0) {
        if (this.famine.size > 0) this.famine.delete(key);
        continue;
      }

      const ticks = (this.famine.get(key) ?? 0) + 1;
      const { deathTicks } = NEEDS[need];

      if (ticks >= deathTicks) {
        this.perish(mobile, need);
        return true;
      }
      this.famine.set(key, ticks);
      if (ticks === 1) {
        const name = this.nameFor(mobile);

        this.events.emit('starving', { id: mobile.id, name, need, seconds: Math.round(deathTicks / 20), x: mobile.x, y: mobile.y });
      }
    }
    return false;
  }

  /** Mort de faim ou de soif : ses réservations rendues, il quitte la ville et la colonie compte un ouvrier de moins. */
  private perish(mobile: Laborer, need: NeedId): void {
    const home = this.entities.get(mobile.homeId);

    this.cancelMeal(mobile);
    if (mobile.kind === 'worker' && mobile.job) {
      if (mobile.job.carried) this.jobs.releaseIn(this.entities, mobile.job);
      else this.jobs.cancel(this.entities, mobile.job);
    }
    if (mobile.kind === 'lumberjack') {
      const onTrip = mobile.state === 'toTree' || mobile.state === 'chop' || mobile.state === 'toCamp';

      this.releaseTree(mobile);
      if (onTrip && home?.kind === 'lumberCamp') home.store.releaseIn('wood', LUMBERJACKS.carry);
    }
    if (mobile.kind === 'farmer' && home?.kind === 'farm') this.dropPlot(mobile, home);

    for (let index = 0; index < NEED_IDS.length; index += 1) this.famine.delete(famineKey(mobile.id, index));
    this.idleSince.delete(mobile.id);
    this.mobiles.delete(mobile.id);
    if (isColonist(mobile)) this.colonists = Math.max(0, this.colonists - 1);
    this.rosterChanged();
    this.events.emit('workerStarved', { id: mobile.id, name: this.nameFor(mobile), need, x: mobile.x, y: mobile.y });
  }

  /** Travaille-t-il ? Dehors, à une tâche. Un enfant ne travaille jamais, un dormeur non plus. */
  private isToiling(mobile: Inhabitant): boolean {
    if (mobile.kind === 'kid' || mobile.inside) return false;
    if (mobile.kind === 'worker') return mobile.job !== null || mobile.build !== null;
    return mobile.state !== 'idle';
  }

  /**
   * Où combler un besoin de `wanted` (le plus bas d'abord) : la mairie si
   * elle a de quoi, sinon le producteur le plus proche — puits, ferme… — dont
   * le coffre a de quoi, à portée de ligne droite. `null` si rien ne convient.
   */
  private mealSource(mobile: Inhabitant, wanted: readonly NeedId[]): { need: NeedId; site: Entity } | null {
    const hall = this.warehouse();

    if (!hall) return null;

    for (const need of wanted) {
      const { item, meal } = NEEDS[need];

      if (hall.store.available(item) >= meal) {
        const door = doorOf(hall);

        return clearLine(this.seed, mobile.x, mobile.y, door.x, door.y) ? { need, site: hall } : null;
      }
    }

    for (const need of wanted) {
      const { item, meal } = NEEDS[need];
      let best: Entity | null = null;
      let bestDistance = Infinity;

      for (const entity of this.entities.values()) {
        if (!isProducer(entity) || entity.store.available(item) < meal) continue;

        const door = doorOf(entity);
        const distance = (door.x - mobile.x) ** 2 + (door.y - mobile.y) ** 2;

        if (distance >= bestDistance || !clearLine(this.seed, mobile.x, mobile.y, door.x, door.y)) continue;
        best = entity;
        bestDistance = distance;
      }
      if (best) return { need, site: best };
    }
    return null;
  }

  /** Le coffre où un habitant en route pour manger a réservé sa part : le producteur, s'il tient encore, sinon la mairie. */
  private mealEntity(mobile: Inhabitant): Entity | null {
    const siteId = this.mealSites.get(mobile.id);
    const site = siteId === undefined ? undefined : this.entities.get(siteId);

    return site && isProducer(site) ? site : this.warehouse();
  }

  /** Sous un seuil : sa part du stock de la ville — ou, à sec, d'un producteur — réservée, il part pour la mairie. */
  private seekMeal(mobile: Inhabitant): void {
    // Le plus bas d'abord ; si la ville n'a pas de quoi le combler, l'autre besoin passe devant la mort.
    const wanted = NEED_IDS.filter((id) => mobile.needs[id] < NEEDS[id].seekBelow).sort((a, b) => mobile.needs[a] - mobile.needs[b]);
    const source = this.mealSource(mobile, wanted);

    if (!source) return;

    const { item, meal } = NEEDS[source.need];

    if (!('store' in source.site)) return;
    source.site.store.reserveOut(item, meal);
    if (source.site.id === this.townHallId) this.mealSites.delete(mobile.id);
    else this.mealSites.set(mobile.id, source.site.id);
    mobile.meal = source.need;
    if (mobile.kind !== 'kid') mobile.inside = false;
    // Il lâche sa hache : il lui faudra retourner à l'arbre.
    if (mobile.kind === 'lumberjack' && mobile.state === 'chop') mobile.state = 'toTree';
    // Il lâche sa bêche : il lui faudra retourner à la case.
    if (mobile.kind === 'forester' && mobile.state === 'plant') mobile.state = 'toPlot';
    // Il pose son panier : il lui faudra retourner à la case.
    if (mobile.kind === 'farmer' && mobile.state === 'sow') mobile.state = 'toSow';
    if (mobile.kind === 'farmer' && mobile.state === 'harvest') mobile.state = 'toHarvest';
  }

  /** En route pour son repas ; à la porte, il consomme sa part et sa jauge remonte. */
  private walkToMeal(mobile: Inhabitant, need: NeedId): void {
    const site = this.mealEntity(mobile);

    if (!site || !('store' in site)) {
      mobile.meal = null;
      this.mealSites.delete(mobile.id);
      return;
    }

    const door = doorOf(site);

    if (!walkToward(mobile, door.x, door.y, this.walkStep())) return;

    const { item, meal } = NEEDS[need];

    mobile.meal = null;
    this.mealSites.delete(mobile.id);
    if (site.store.commitOut(item, meal) < meal) return;
    mobile.needs[need] = 1;
    this.events.emit('needMet', { id: mobile.id, need, x: mobile.x, y: mobile.y });
  }

  /** Une vague : il rentre s'abriter, sa part rendue au coffre où elle était réservée. */
  private cancelMeal(mobile: Inhabitant): void {
    const need = mobile.meal;
    const site = this.mealEntity(mobile);

    mobile.meal = null;
    this.mealSites.delete(mobile.id);
    if (need !== null && site && 'store' in site) site.store.releaseOut(NEEDS[need].item, NEEDS[need].meal);
  }

  /** Après un chargement : la part de chaque habitant en route pour manger se réserve de nouveau, à la mairie ou au producteur le plus proche. */
  private restoreMeals(): void {
    for (const mobile of this.inhabitants()) {
      if (mobile.meal === null) continue;

      const source = this.mealSource(mobile, [mobile.meal]);
      const { item, meal } = NEEDS[mobile.meal];

      if (!source || !('store' in source.site) || !source.site.store.reserveOut(item, meal)) {
        mobile.meal = null;
        continue;
      }
      if (source.site.id !== this.townHallId) this.mealSites.set(mobile.id, source.site.id);
    }
  }

  private *inhabitants(): IterableIterator<Inhabitant> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'kid' || isLaborer(mobile)) yield mobile;
    }
  }

  /**
   * La ville va-t-elle manquer de ce qu'un besoin consomme ? Oui si un
   * habitant a faim sans rien à manger en ville, ou si le stock, au rythme
   * où il fond sur les deux dernières minutes, ne tient pas
   * `NEED_ALERT.runwayTicks`. `null` sans mairie ni habitant.
   */
  public needAlert(): NeedAlert | null {
    const town = this.townStock();

    if (!town) return null;

    if (this.inhabitants().next().done) return null;

    // La faim et la soif peuvent sonner ensemble : la capsule dit la plus pressante, le stock à sec d'abord.
    let worst: NeedAlert | null = null;

    for (const need of NEED_IDS) {
      const { item, meal } = NEEDS[need];
      let wanting = 0;

      for (const mobile of this.inhabitants()) {
        if (mobile.meal === null && needState(need, mobile.needs[need]) !== 'sated') wanting += 1;
      }

      const stock = town.available(item);
      const rate = this.flows.netRate(item);
      let alert: NeedAlert | null = null;

      if (stock < meal && (wanting > 0 || rate < 0)) {
        alert = { need, item, wanting, minutes: 0 };
      } else {
        const minutes = rate < 0 ? stock / -rate : Infinity;

        if (minutes * 20 * 60 < NEED_ALERT.runwayTicks) alert = { need, item, wanting, minutes: Math.max(1, Math.ceil(minutes)) };
      }
      if (alert && (worst === null || alert.minutes < worst.minutes)) worst = alert;
    }
    return worst;
  }

  /**
   * Les habitants qui ont faim — ou soif, ou ce que dit `need` —, du plus
   * affamé au moins : le HUD centre la caméra sur l'un, puis le suivant.
   */
  public wantingInhabitants(need?: NeedId): Inhabitant[] {
    const wanting: { mobile: Inhabitant; level: number }[] = [];

    for (const mobile of this.inhabitants()) {
      const urgent = need === undefined ? urgentNeed(mobile.needs) : needState(need, mobile.needs[need]) === 'sated' ? null : need;

      if (urgent !== null) wanting.push({ mobile, level: mobile.needs[urgent] });
    }
    return wanting.sort((a, b) => a.level - b.level || a.mobile.id - b.mobile.id).map(({ mobile }) => mobile);
  }

  /* ---------------------------------------------------------------- porteurs */

  private *workers(): IterableIterator<Worker> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'worker') yield mobile;
    }
  }

  /** Les producteurs — foreuses, fermes, cabanes de bûcheron — que les logisticiens du poste vident : ceux de son rayon. */
  public depotProducers(depot: Depot): number {
    let count = 0;

    for (const entity of this.entities.values()) {
      if (isProducer(entity) && inDepotRange(depot, entity)) count += 1;
    }
    return count;
  }

  /** Ce que le chantier attend encore et qu'aucun porteur n'apporte — la fenêtre du chantier peut l'afficher. */
  public siteIncoming(id: EntityId, item: ItemId): number {
    return this.jobs.siteIncoming(id, item);
  }

  /** Le relevé du chantier, objet par objet : livré, manquant, en route, en ville (`sim/siteLedger.ts`). */
  public siteLedger(site: Site): SiteLine[] {
    return siteLedger(site, (item) => this.jobs.siteIncoming(site.id, item), this.townStock());
  }

  /** Le même relevé pour le labo qui attend le coût de sa recherche ; vide s'il n'attend rien. */
  public labLedger(lab: Lab): SiteLine[] {
    return labLedger(lab, this.townStock());
  }

  private readonly lineIsClear: LineTest = (x0, y0, x1, y1) => clearLine(this.seed, x0, y0, x1, y1);

  /**
   * Pourvoit chaque maison, poste et cabane des ouvriers de la colonie qu'on
   * vient d'y affecter : des ouvriers libres, pris sur la carte. Un poste sans
   * ouvrier libre attend qu'un autre se libère ou qu'un enfant grandisse.
   */
  private lodgeCrews(): void {
    this.lodging = false;
    this.hostStaff(false);
    this.settleColonists();
    for (const entity of this.entities.values()) {
      if (entity.kind === 'house' || entity.kind === 'depot' || entity.kind === 'yard') this.staff(entity);
      if (entity.kind === 'lumberCamp') this.staffCamp(entity);
      if (entity.kind === 'foresterHouse') this.staffForester(entity);
      if (entity.kind === 'farm') this.staffFarm(entity);
    }
    // Une maison finie ou tombée, des ouvriers venus ou partis : les lits suivent sans attendre.
    this.settleBeds();
  }

  /** Effectifs, bâtiments ou colonie ont changé : la répartition est à refaire, les logés à revoir. */
  private rosterChanged(): void {
    this.duty = null;
    this.lodging = true;
  }

  /**
   * Pourvoit la maison — ou le poste de logistique, ou de construction —
   * d'autant d'ouvriers que de postes pourvus : les ouvriers libres les plus
   * proches de sa porte y entrent comme porteurs, logisticiens ou bâtisseurs.
   */
  private staff(house: House | Depot | Yard): void {
    let lodged = 0;

    for (const worker of this.workers()) {
      if (!worker.free && worker.homeId === house.id) lodged += 1;
    }

    const door = doorOf(house);
    const posts = this.roster().filled.get(house.id) ?? 0;
    let hired = 0;

    for (let i = lodged; i < posts; i += 1) {
      const worker = this.nearestFree(door);

      if (!worker) break;
      Object.assign(worker, {
        free: false,
        homeId: house.id,
        logistician: house.kind === 'depot',
        builder: house.kind === 'yard',
        inside: false,
        searchTicks: 1 + i * 8,
      });
      this.idleSince.delete(worker.id);
      hired += 1;
    }
    // Les nouveaux venus prennent leur poste : la répartition les compte au prochain coup d'œil.
    if (hired > 0) this.duty = null;
  }

  /**
   * Un tick d'ouvrier. Pendant une vague, il rentre s'abriter avec sa
   * charge et n'en ressort qu'une fois le dernier mutant tombé. Sinon, il
   * suit son job — la source, puis la destination — ou en cherche un toutes
   * les `retryTicks` ; sans rien à porter, il flâne devant chez lui, et
   * rentre dormir à la tombée de la nuit.
   */
  private stepWorker(worker: Worker, alarm: boolean, bedtime: boolean): void {
    const home = this.entities.get(worker.homeId);
    const homeDoor = home ? doorOf(home) : null;

    if (alarm && homeDoor) {
      this.goHome(worker, homeDoor);
      return;
    }

    // Libre, il flâne devant la mairie en attendant qu'un bâtiment le prenne.
    if (worker.free) {
      if (homeDoor) this.idle(worker, homeDoor, bedtime);
      else this.mobiles.delete(worker.id);
      return;
    }

    if (worker.build !== null) {
      this.stepBuild(worker);
      return;
    }

    // Sans poste — on l'a retiré de la maison —, il finit sa livraison puis ne cherche plus rien.
    if (!worker.job && this.onDuty(worker)) {
      worker.searchTicks -= 1;

      // Un logisticien ou un bâtisseur dont le poste est tombé — ou, pour un bâtisseur, arrêté — ne cherche plus rien.
      const crew: Crew | null = worker.logistician
        ? home?.kind === 'depot'
          ? { kind: 'logistician', depot: home }
          : null
        : worker.builder
          ? home?.kind === 'yard' && yardWorks(home)
            ? { kind: 'builder', yard: home }
            : null
          : PORTER_CREW;

      // Un bâtisseur bâtit d'abord ce qui a tout reçu, puis livre le reste.
      if (worker.searchTicks <= 0 && crew?.kind === 'builder') {
        worker.build = this.siteToBuild(worker, crew.yard);
        if (worker.build !== null) {
          worker.inside = false;
          this.stepBuild(worker);
          return;
        }
      }

      if (worker.searchTicks <= 0 && crew) {
        worker.searchTicks = PORTERS.retryTicks;
        worker.job = this.jobs.assign(
          this.entities,
          this.townHallId,
          worker,
          homeDoor ?? worker,
          this.lineIsClear,
          carryOf(worker) + this.bonus('porterCarry'),
          crew,
        );
      }
    }

    const { job } = worker;

    if (!job) {
      // Retiré de son poste, ou sa maison tombée, et plus rien à porter : il redevient un ouvrier libre de la colonie.
      if (!homeDoor || !this.onDuty(worker)) this.release(worker);
      else this.idle(worker, homeDoor, bedtime);
      return;
    }

    worker.inside = false;

    const stop = this.entities.get(job.carried ? job.to : job.from);

    if (!stop) {
      this.abandon(worker, job);
      standStill(worker);
      return;
    }

    const door = doorOf(stop);

    if (!walkToward(worker, door.x, door.y, this.walkStep())) return;

    if (job.carried) this.dropOff(worker, job);
    else this.pickUp(worker, job);
  }

  /**
   * Un ouvrier sans poste — retiré, ou son bâtiment tombé — redevient un
   * ouvrier libre de la colonie, sous le même id : il ne disparaît pas, il
   * retourne flâner devant la mairie, où un autre bâtiment le prendra. Sans
   * mairie, il n'a plus où aller.
   */
  private release(mobile: Laborer): void {
    const hall = this.entities.get(this.townHallId);

    this.idleSince.delete(mobile.id);
    if (!hall) {
      this.cancelMeal(mobile);
      this.mobiles.delete(mobile.id);
    } else if (mobile.kind === 'worker') {
      Object.assign(mobile, {
        free: true,
        homeId: hall.id,
        logistician: false,
        builder: false,
        build: null,
        inside: false,
        job: null,
        searchTicks: PORTERS.retryTicks,
      });
    } else {
      this.mobiles.set(mobile.id, freeWorker(personOf(mobile), hall.id));
    }
    this.rosterChanged();
  }

  /**
   * Les bâtiments qui emploient sans équipe sur la carte prennent leurs
   * ouvriers parmi les libres — les plus proches de leur porte y entrent — et
   * rendent ceux qu'ils n'emploient plus, qui en ressortent libres : un poste
   * retiré, un bâtiment tombé. `initial`, au chargement : ils ont déjà les
   * leurs, rien ne bouge.
   */
  private hostStaff(initial: boolean): void {
    const hall = this.entities.get(this.townHallId);
    const seen = new Set<EntityId>();

    for (const entity of this.entities.values()) {
      if (entity.kind === 'site' || !employs(entity.proto) || hasCrew(entity.kind)) continue;

      const filled = this.roster().filled.get(entity.id) ?? 0;
      const door = doorOf(entity);
      let count = initial ? filled : (this.hosted.get(entity.id)?.count ?? 0);

      for (; count < filled; count += 1) {
        const worker = this.nearestFree(door);

        if (!worker) break;
        this.cancelMeal(worker);
        this.idleSince.delete(worker.id);
        this.mobiles.delete(worker.id);
      }
      if (hall) {
        for (; count > filled; count -= 1) this.spawnFree(hall, door.x, door.y);
      }
      seen.add(entity.id);
      if (count > 0) this.hosted.set(entity.id, { count, ...door });
      else this.hosted.delete(entity.id);
    }

    // Tombé, rasé, redevenu chantier : ses ouvriers sortent par où ils étaient entrés.
    for (const [id, { count, x, y }] of this.hosted) {
      if (seen.has(id)) continue;
      this.hosted.delete(id);
      if (hall) for (let i = 0; i < count; i += 1) this.spawnFree(hall, x, y);
    }
  }

  /**
   * La colonie : autant d'ouvriers que `colonists`, sur la carte ou entrés
   * dans un bâtiment. Ceux qui manquent — le départ, une sauvegarde d'avant
   * les ouvriers libres — attendent, libres, devant la mairie.
   */
  private settleColonists(): void {
    const hall = this.entities.get(this.townHallId);

    if (!hall) return;

    let count = 0;

    for (const mobile of this.mobiles.values()) {
      if (isColonist(mobile)) count += 1;
    }
    for (const { count: inside } of this.hosted.values()) count += inside;
    for (let i = count; i < this.colonists; i += 1) {
      const { x, y } = colonistSpot(hall, i);

      this.spawnFree(hall, x, y);
    }
  }

  /** Un ouvrier libre de plus, en (x, y) : il ira flâner devant la mairie. */
  private spawnFree(hall: Entity, x: number, y: number): void {
    const id = this.nextMobileId++;

    this.mobiles.set(
      id,
      freeWorker(
        { id, sex: sexOf(this.seed, id), trait: traitOf(this.seed, id), x, y, prevX: x, prevY: y, facing: 'down', moving: false, age: adultAge(this.seed, id), ...freshNeeds(), ...freshHousing() },
        hall.id,
      ),
    );
  }

  /** L'ouvrier libre le plus proche de `door`, le plus ancien à égalité ; `undefined` s'il n'en reste aucun. */
  private nearestFree(door: { x: number; y: number }): Worker | undefined {
    let best: Worker | undefined;
    let bestSq = Infinity;

    for (const worker of this.workers()) {
      if (!worker.free) continue;

      const d = distanceSq(worker.x, worker.y, door.x, door.y);

      if (d < bestSq || (d === bestSq && best && worker.id < best.id)) {
        best = worker;
        bestSq = d;
      }
    }
    return best;
  }

  private goHome(worker: Laborer, door: { x: number; y: number }): void {
    if (worker.inside) standStill(worker);
    else if (walkToward(worker, door.x, door.y, this.walkStep())) worker.inside = true;
  }

  /** Sans travail : il va dormir à la nuit tombée, et flâne devant sa porte le reste du temps. */
  private idle(worker: Laborer, door: { x: number; y: number }, bedtime: boolean): void {
    if (bedtime) {
      this.sleep(worker, door);
      return;
    }
    if (worker.inside) {
      // Il sort : sa flânerie repart de sa porte.
      worker.inside = false;
      Object.assign(worker, wanderFrom(door.x, door.y));
    }
    wander(worker, door, this.seed, this.tickCount, this.walkStep());
  }

  /**
   * L'heure de dormir : dans son lit (`bed`), s'il en a un — il entre dans la
   * maison, comme chez lui —, sinon dehors, allongé à quelques pas de la
   * porte de son travail (`door`) : la mairie, pour un survivant.
   */
  private sleep(sleeper: Laborer, door: { x: number; y: number }): void {
    const bed = sleeper.bed === null ? undefined : this.entities.get(sleeper.bed);

    if (bed && bed.kind !== 'site') {
      this.goHome(sleeper, doorOf(bed));
      return;
    }

    // Abrité chez son employeur pendant une vague, ou d'une sauvegarde : il ressort se coucher sur le seuil.
    if (sleeper.inside) {
      sleeper.inside = false;
      Object.assign(sleeper, { x: door.x, y: door.y, prevX: door.x, prevY: door.y });
    }

    const spot = this.outsideSpot(sleeper, door);

    if (walkToward(sleeper, spot.x, spot.y, this.walkStep())) {
      sleeper.facing = 'down';
      sleeper.sleepingOut = true;
    }
  }

  /**
   * Où il s'allonge dehors : un point haché de la seed et de son id, devant la
   * porte, pour que les dormeurs d'un même bâtiment ne s'empilent pas. Si la
   * ligne droite passe par l'eau, devant la porte même. Le point ne bouge pas
   * d'une nuit à l'autre : il ne se recalcule qu'en chemin (`sleep`).
   */
  private outsideSpot(sleeper: Laborer, door: { x: number; y: number }): { x: number; y: number } {
    const spread = HOUSING.outsideSpread * TILE_SIZE;
    const roll = (salt: number): number => hash3(this.seed ^ sleeper.id, salt, 0x5ee9) / 4294967296;
    const x = door.x + (roll(1) * 2 - 1) * spread;
    const y = door.y + TILE_SIZE * 0.4 + roll(2) * spread;

    if (sleeper.x === x && sleeper.y === y) return { x, y };
    return clearLine(this.seed, door.x, door.y, x, y) ? { x, y } : door;
  }

  /** Le crépuscule et la nuit : les ouvriers sans travail vont se coucher. Sans cycle — mairie en chantier —, jamais. */
  private isBedtime(): boolean {
    const phase = this.clock()?.phase;

    return phase === 'dusk' || phase === 'night';
  }

  /** À la source : la promesse sortante devient un retrait réel, qui réveille une foreuse endormie. */
  private pickUp(worker: Worker, job: Job): void {
    const source = this.entities.get(job.from);

    if (!source || source.kind === 'site') {
      this.abandon(worker, job);
      return;
    }

    source.store.releaseOut(job.item, job.amount);

    const taken = this.withdraw(source.id, job.item, job.amount);

    // Moins que promis — ce qui ne devrait pas arriver : la place réservée en trop est rendue.
    if (taken < job.amount) this.jobs.releaseIn(this.entities, { ...job, amount: job.amount - taken });

    if (taken === 0) {
      worker.job = null;
      return;
    }
    job.amount = taken;
    job.carried = true;
  }

  /**
   * À destination : la place réservée devient un dépôt réel. Un chantier
   * qu'Adam a rempli entre-temps, ou déjà achevé, ne prend que ce qui lui
   * manque ; le reste repart à la mairie — rien ne se perd.
   */
  private dropOff(worker: Worker, job: Job): void {
    const target = this.entities.get(job.to);

    this.jobs.releaseIn(this.entities, job);

    if (!target) {
      this.reroute(worker, job);
      return;
    }

    let accepted: number;

    if (target.kind === 'site') {
      const needed = (BUILDINGS[target.proto].cost as Partial<Record<ItemId, number>>)[job.item] ?? 0;
      const delivered = target.delivered[job.item] ?? 0;

      accepted = Math.max(0, Math.min(job.amount, needed - delivered));
      if (accepted > 0) target.delivered[job.item] = delivered + accepted;
    } else if (target.kind === 'antenna') {
      // L'étage ne prend que ce qui lui manque encore ; le reste repart à la mairie.
      accepted = target.store.add(job.item, Math.min(job.amount, floorNeeds(target, job.item)));
    } else if (isConsumer(target)) {
      // Adam a pu la remplir entre-temps : elle ne prend que sa part, le reste repart à la mairie.
      accepted = target.store.add(job.item, Math.min(job.amount, consumerRoom(target, job.item)));
    } else {
      accepted = target.store.add(job.item, job.amount);
    }

    if (accepted > 0) {
      this.events.emit('porterDelivered', { workerId: worker.id, id: target.id, item: job.item, amount: accepted });

      // Le dernier objet posé achève le chantier, qu'il vienne d'Adam ou d'un porteur — ou l'ouvre aux bâtisseurs.
      if (target.kind === 'site') this.settle(target);
      // Au labo, il lance le compte à rebours.
      if (target.kind === 'lab') this.startCountdown(target);
      // À l'antenne, il peut faire monter l'étage.
      if (target.kind === 'antenna') this.raiseFloor(target);
      // À la nurserie ou à la forge, il réveille ce qui attendait.
      if (isConsumer(target)) this.afterSupply(target);
    }

    worker.searchTicks = 0;

    if (accepted < job.amount) this.reroute(worker, { ...job, amount: job.amount - accepted });
    else worker.job = null;
  }

  /** La source ou la destination a disparu. Sans charge, le job est rendu ; avec, elle repart à la mairie. */
  private abandon(worker: Worker, job: Job): void {
    if (!job.carried) {
      this.jobs.cancel(this.entities, job);
      worker.job = null;
      return;
    }
    this.jobs.releaseIn(this.entities, job);
    this.reroute(worker, job);
  }

  /**
   * Une charge en main dont la destination ne veut plus : elle part à la
   * mairie, qui prend tout. La réservation de l'ancienne destination doit
   * déjà être rendue. Sans mairie, la partie est perdue, et la charge avec.
   */
  private reroute(worker: Worker, job: Job): void {
    const rerouted: Job = { ...job, to: this.townHallId, priority: JOB_PRIORITY.surplus, carried: true };

    worker.job = job.to !== this.townHallId && this.jobs.open(this.entities, rerouted) ? rerouted : null;
  }

  /* -------------------------------------------------------------- bâtisseurs */

  /**
   * Le poste de construction qui bâtit ce chantier : le premier, par id, qui
   * tourne et l'a dans son rayon. `null` : aucun — le chantier s'achève au
   * dernier objet livré, comme avant les postes.
   */
  public builderYard(site: Site): Yard | null {
    for (const entity of this.entities.values()) {
      if (entity.kind === 'yard' && yardWorks(entity) && inYardRange(entity, site)) return entity;
    }
    return null;
  }

  /** Le chantier a tout reçu et attend ses bâtisseurs : on y construit. */
  public awaitsBuilders(site: Site): boolean {
    return siteMissing(site) === 0 && this.builderYard(site) !== null;
  }

  /** L'avancement de la construction, en ticks de bâtisseur : fait, et à faire en tout. */
  public siteBuild(site: Site): { done: number; total: number } {
    return { done: site.work, total: siteWork(site) };
  }

  /** Les chantiers du rayon du poste : la fenêtre du poste en dit le nombre. */
  public yardSites(yard: Yard): number {
    let count = 0;

    for (const entity of this.entities.values()) {
      if (entity.kind === 'site' && inYardRange(yard, entity)) count += 1;
    }
    return count;
  }

  /** Les bâtisseurs qui travaillent sur ce chantier, ou y vont. */
  public siteBuilders(id: EntityId): number {
    let count = 0;

    for (const worker of this.workers()) {
      if (worker.build === id) count += 1;
    }
    return count;
  }

  /**
   * Un chantier qui a tout reçu s'achève — sauf si un poste de construction
   * le couvre : il attend alors ses bâtisseurs.
   */
  private settle(site: Site): void {
    if (siteMissing(site) === 0 && this.builderYard(site) === null) this.complete(site);
  }

  /**
   * Un poste de construction s'arrête ou tombe : les chantiers prêts qu'il
   * devait bâtir s'achèvent. Une partie ne reste jamais bloquée sur un poste
   * qu'on a mis en pause.
   */
  private settleSites(): void {
    for (const entity of [...this.entities.values()]) {
      if (entity.kind === 'site') this.settle(entity);
    }
  }

  /**
   * Le chantier que ce bâtisseur va bâtir : le plus ancien du rayon de son
   * poste qui a tout reçu, où ils ne sont pas déjà `BUILDERS.perSite`, et
   * qu'il rejoint sans traverser l'eau. `null` : rien à bâtir.
   */
  private siteToBuild(worker: Worker, yard: Yard): EntityId | null {
    let best: Site | null = null;

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site' || (best && entity.id > best.id)) continue;
      if (!inYardRange(yard, entity) || !this.awaitsBuilders(entity)) continue;
      if (this.siteBuilders(entity.id) >= BUILDERS.perSite) continue;

      const spot = this.buildSpot(worker, entity);

      if (this.lineIsClear(worker.x, worker.y, spot.x, spot.y)) best = entity;
    }
    return best?.id ?? null;
  }

  /** Où le bâtisseur se tient pour bâtir : devant le chantier, chacun à sa place pour ne pas s'empiler. */
  private buildSpot(worker: Worker, site: Site): { x: number; y: number } {
    const door = doorOf(site);
    const slot = (worker.id % BUILDERS.perSite) - (BUILDERS.perSite - 1) / 2;

    return { x: door.x + slot * (site.width * TILE_SIZE) / BUILDERS.perSite, y: door.y };
  }

  /**
   * Un tick de bâtisseur au chantier : y aller, puis taper — chaque tick sur
   * place avance le chantier d'un tick de travail ; à plusieurs, il avance
   * d'autant plus vite. Le dernier coup achève le bâtiment.
   */
  private stepBuild(worker: Worker): void {
    const site = worker.build === null ? undefined : this.entities.get(worker.build);

    // Chantier annulé, ou plus à bâtir par ses soins : il repart chercher du travail.
    if (site?.kind !== 'site' || !this.awaitsBuilders(site)) {
      worker.build = null;
      worker.searchTicks = 0;
      standStill(worker);
      return;
    }

    const spot = this.buildSpot(worker, site);

    if (!walkToward(worker, spot.x, spot.y, this.walkStep())) return;

    worker.facing = 'up';
    // Affamé, il ne frappe plus qu'un tick sur deux ; de bons outils abattent plus d'ouvrage.
    const work = this.toil(worker.needs);

    if (work === 0) return;
    site.work += work;
    if (site.work >= siteWork(site)) this.complete(site);
  }

  /**
   * « Annuler le chantier » : l'emprise se libère, ce qui y était livré
   * retourne au stock de la ville — en tas au sol, sans mairie. Les ouvriers
   * qui y portaient quelque chose le rapportent à la mairie (`abandon`), ceux
   * qui le bâtissaient repartent. Rien ne se perd, rien ne se double.
   */
  private cancelSite(id: EntityId): void {
    const site = this.entities.get(id);

    if (site?.kind !== 'site' || id === this.townHallId) {
      this.events.emit('siteRejected', { id, reason: 'missing' });
      return;
    }

    const town = this.townStock();
    const door = doorOf(site);

    for (const [item, amount] of Object.entries(site.delivered) as [ItemId, number][]) {
      if (amount <= 0) continue;
      if (town) town.add(item, amount);
      else this.spawnPickup(item, amount, door.x, door.y - TILE_SIZE / 2, false);
    }

    this.entities.delete(id);
    this.chunks.release(id, site.tx, site.ty, site.width, site.height);
    this.dirtyTile(site.tx, site.ty);
    this.events.emit('siteCancelled', { id, proto: site.proto, tx: site.tx, ty: site.ty, toTown: town !== null });
  }

  /**
   * Retire une décoration : le coût entier retourne à la ville, ou reste au
   * sol sans mairie. Rien d'autre qu'une décoration ne se retire.
   */
  private removeDecor(id: EntityId): void {
    const decor = this.entities.get(id);

    if (decor?.kind !== 'decor') return;

    const town = this.townStock();
    const door = doorOf(decor);

    for (const [item, amount] of Object.entries(BUILDINGS[decor.proto].cost) as [ItemId, number][]) {
      if (town) town.add(item, amount);
      else this.spawnPickup(item, amount, door.x, door.y - TILE_SIZE / 2, false);
    }

    this.entities.delete(id);
    this.chunks.release(id, decor.tx, decor.ty, decor.width, decor.height);
    this.dirtyTile(decor.tx, decor.ty);
    this.rosterChanged();
    this.events.emit('decorRemoved', { id, proto: decor.proto, tx: decor.tx, ty: decor.ty, toTown: town !== null });
  }

  /* -------------------------------------------------------------- bûcherons */

  private *lumberjacks(): IterableIterator<Lumberjack> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'lumberjack') yield mobile;
    }
  }

  /** Pourvoit la cabane d'autant de bûcherons que de postes pourvus : les ouvriers libres les plus proches. */
  private staffCamp(camp: LumberCamp): void {
    let lodged = 0;

    for (const lumberjack of this.lumberjacks()) {
      if (lumberjack.homeId === camp.id) lodged += 1;
    }

    const door = doorOf(camp);
    const posts = this.roster().filled.get(camp.id) ?? 0;
    let hired = 0;

    for (let i = lodged; i < posts; i += 1) {
      const worker = this.nearestFree(door);

      if (!worker) break;

      const lumberjack: Lumberjack = {
        kind: 'lumberjack',
        ...personOf(worker),
        homeId: camp.id,
        inside: false,
        state: 'idle',
        tree: null,
        chopTicks: 0,
        load: 0,
        // Ils ne partent pas du même pas : le second suit le premier.
        searchTicks: 1 + i * 12,
        ...wanderFrom(worker.x, worker.y),
      };

      this.mobiles.set(lumberjack.id, lumberjack);
      this.idleSince.delete(lumberjack.id);
      hired += 1;
    }
    if (hired > 0) this.duty = null;
  }

  /**
   * Les arbres encore debout dans le rayon de la cabane — zéro : « Plus
   * d'arbres à portée ». La fenêtre le demande à chaque image : le compte
   * n'est refait qu'une fois par tick.
   */
  public treesLeft(camp: LumberCamp): number {
    if (this.treeCount?.id !== camp.id || this.treeCount.tick !== this.tickCount) {
      this.treeCount = { id: camp.id, tick: this.tickCount, count: treesInRange(camp, this.resources, this.harvestable).length };
    }
    return this.treeCount.count;
  }

  /**
   * Un tick de bûcheron. Hors d'un voyage, il cherche un arbre toutes les
   * `retryTicks` — à condition qu'il y ait au coffre la place d'un voyage,
   * réservée aussitôt : le bois rapporté y entre toujours. Coffre plein, il
   * attend devant la porte ; plus d'arbre à portée, il flâne. La nuit, il ne
   * repart pas ; pendant une vague, il rentre s'abriter, bois compris, et
   * reprend son voyage ensuite.
   */
  private stepLumberjack(lumberjack: Lumberjack, alarm: boolean, bedtime: boolean): void {
    const camp = this.entities.get(lumberjack.homeId);

    // Sa cabane est tombée : il lâche son arbre et redevient un ouvrier libre.
    if (camp?.kind !== 'lumberCamp') {
      this.releaseTree(lumberjack);
      this.release(lumberjack);
      return;
    }

    const door = doorOf(camp);

    if (alarm) {
      // Il reprendra son arbre après la vague : il lui faudra d'abord y retourner.
      if (lumberjack.state === 'chop') lumberjack.state = 'toTree';
      this.goHome(lumberjack, door);
      return;
    }

    // Cabane en pause, ou lui retiré de son poste : il finit son geste — rapporter le bois qu'il a —, puis flâne.
    const working = !camp.paused && this.onDuty(lumberjack);

    if (!working) {
      if (lumberjack.state === 'toTree' || lumberjack.state === 'chop') this.endTrip(lumberjack, door);
      else if (lumberjack.state === 'wait' && lumberjack.load === 0) lumberjack.state = 'idle';
    }

    // Retiré de son poste, son bois rapporté : il rentre, et redevient un ouvrier libre.
    if (!this.onDuty(lumberjack) && lumberjack.state === 'idle' && lumberjack.load === 0) {
      this.release(lumberjack);
      return;
    }

    switch (lumberjack.state) {
      case 'idle':
      case 'wait':
        lumberjack.searchTicks -= 1;
        if (lumberjack.searchTicks <= 0 && working && !bedtime && lumberjack.load === 0) {
          lumberjack.searchTicks = LUMBERJACKS.retryTicks;
          this.startTrip(lumberjack, camp, door);
        }
        if (lumberjack.state === 'idle') this.idle(lumberjack, door, bedtime);
        else if (lumberjack.state === 'wait') this.waitAtCamp(lumberjack, door, bedtime);
        else lumberjack.inside = false;
        break;

      case 'toTree': {
        const tree = lumberjack.tree;

        lumberjack.inside = false;
        if (!tree || !isTree(this.resources, tree.tx, tree.ty)) {
          // Adam l'a coupé avant lui : il en cherche un autre sans attendre.
          this.endTrip(lumberjack, door);
          break;
        }

        const spot = chopSpot(tree);

        if (walkToward(lumberjack, spot.x, spot.y, this.walkStep())) {
          lumberjack.state = 'chop';
          lumberjack.facing = 'right';
          lumberjack.chopTicks = LUMBERJACKS.chopTicks;
        }
        break;
      }

      case 'chop':
        standStill(lumberjack);
        lumberjack.inside = false;
        // Affamé, il ne frappe plus qu'un tick sur deux.
        lumberjack.chopTicks -= this.toil(lumberjack.needs);
        if (lumberjack.chopTicks <= 0) this.chop(lumberjack, door);
        break;

      case 'toCamp':
        lumberjack.inside = false;
        if (walkToward(lumberjack, door.x, door.y, this.walkStep())) this.storeWood(lumberjack, camp);
        break;
    }
  }

  /** Un voyage commence : la place au coffre, puis l'arbre — les deux réservés, ou rien. */
  private startTrip(lumberjack: Lumberjack, camp: LumberCamp, door: { x: number; y: number }): void {
    if (!camp.store.reserveIn('wood', LUMBERJACKS.carry)) {
      lumberjack.state = 'wait';
      return;
    }

    const tree = pickTree(camp, door, this.resources, this.claimedTrees, this.lineIsClear, this.harvestable);

    if (!tree) {
      camp.store.releaseIn('wood', LUMBERJACKS.carry);
      lumberjack.state = 'idle';
      return;
    }

    this.claimedTrees.add(coordKey(tree.tx, tree.ty));
    lumberjack.tree = tree;
    lumberjack.state = 'toTree';
  }

  /** Un coup de hache : une unité de bois dans les bras. Arbre tombé ou bras pleins, il rentre. */
  private chop(lumberjack: Lumberjack, door: { x: number; y: number }): void {
    const tree = lumberjack.tree;
    const taken = tree ? this.resources.take(tree.tx, tree.ty) : null;

    if (!tree || !taken || taken.resource.id !== 'tree') {
      this.endTrip(lumberjack, door);
      return;
    }

    lumberjack.load += 1;
    lumberjack.chopTicks = LUMBERJACKS.chopTicks;
    // La même règle que pour Adam : entamé à mi-chemin, disparu à la dernière unité.
    if (taken.stageChanged) this.dirtyTile(tree.tx, tree.ty);
    this.events.emit('treeChopped', {
      lumberjackId: lumberjack.id,
      tx: tree.tx,
      ty: tree.ty,
      remaining: taken.resource.remaining,
    });

    if (taken.resource.remaining <= 0 || lumberjack.load >= LUMBERJACKS.carry) this.endTrip(lumberjack, door);
  }

  /** Plus rien à couper ici : l'arbre est lâché ; avec du bois, il le rapporte, sinon il repart aussitôt. */
  private endTrip(lumberjack: Lumberjack, door: { x: number; y: number }): void {
    this.releaseTree(lumberjack);

    if (lumberjack.load > 0) {
      lumberjack.state = 'toCamp';
      return;
    }

    const camp = this.entities.get(lumberjack.homeId);

    if (camp?.kind === 'lumberCamp') camp.store.releaseIn('wood', LUMBERJACKS.carry);
    lumberjack.state = 'idle';
    lumberjack.searchTicks = 0;
    Object.assign(lumberjack, wanderFrom(door.x, door.y));
  }

  /** À la porte : la place réservée devient du bois dans le coffre. */
  private storeWood(lumberjack: Lumberjack, camp: LumberCamp): void {
    camp.store.releaseIn('wood', LUMBERJACKS.carry);

    const stored = camp.store.add('wood', lumberjack.load);

    lumberjack.load -= stored;
    if (stored > 0) this.events.emit('woodStored', { lumberjackId: lumberjack.id, id: camp.id, amount: stored });

    // Ce qui ne rentre pas — une sauvegarde retouchée, jamais en jeu — reste dans ses bras : il attend.
    lumberjack.state = lumberjack.load > 0 ? 'wait' : 'idle';
    lumberjack.searchTicks = 0;
  }

  /** Coffre plein : devant la porte, bois dans les bras s'il en a, jusqu'à ce qu'un porteur fasse de la place. */
  private waitAtCamp(lumberjack: Lumberjack, door: { x: number; y: number }, bedtime: boolean): void {
    if (lumberjack.load > 0) {
      const camp = this.entities.get(lumberjack.homeId);

      if (camp?.kind === 'lumberCamp' && camp.store.freeSpace() > 0) {
        const stored = camp.store.add('wood', lumberjack.load);

        lumberjack.load -= stored;
        if (stored > 0) this.events.emit('woodStored', { lumberjackId: lumberjack.id, id: camp.id, amount: stored });
      }
    }
    if (bedtime && lumberjack.load === 0) {
      this.sleep(lumberjack, door);
      return;
    }
    lumberjack.inside = false;
    if (walkToward(lumberjack, door.x, door.y, this.walkStep())) lumberjack.facing = 'down';
  }

  private releaseTree(lumberjack: Lumberjack): void {
    if (lumberjack.tree) this.claimedTrees.delete(coordKey(lumberjack.tree.tx, lumberjack.tree.ty));
    lumberjack.tree = null;
  }

  /**
   * Après un chargement : les arbres visés et la place réservée au coffre se
   * rejouent depuis les bûcherons sauvegardés. Un arbre déjà pris par un
   * autre — une sauvegarde retouchée — est lâché.
   */
  private restoreLumberjacks(): void {
    this.claimedTrees.clear();

    for (const lumberjack of this.lumberjacks()) {
      const camp = this.entities.get(lumberjack.homeId);
      const onTrip = lumberjack.state === 'toTree' || lumberjack.state === 'chop' || lumberjack.state === 'toCamp';

      if (lumberjack.tree) {
        const key = coordKey(lumberjack.tree.tx, lumberjack.tree.ty);

        if (this.claimedTrees.has(key) || !onTrip) lumberjack.tree = null;
        else this.claimedTrees.add(key);
      }
      if (onTrip && camp?.kind === 'lumberCamp') camp.store.reserveIn('wood', LUMBERJACKS.carry);
    }
  }

  /* ------------------------------------------------------------- forestiers */

  private *foresters(): IterableIterator<Forester> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'forester') yield mobile;
    }
  }

  /** Pourvoit la maison du forestier si son poste l'est : l'ouvrier libre le plus proche devient forestier. */
  private staffForester(house: ForesterHouse): void {
    let lodged = 0;

    for (const forester of this.foresters()) {
      if (forester.homeId === house.id) lodged += 1;
    }

    const door = doorOf(house);
    const posts = this.roster().filled.get(house.id) ?? 0;
    let hired = 0;

    for (let i = lodged; i < posts; i += 1) {
      const worker = this.nearestFree(door);

      if (!worker) break;

      const forester: Forester = {
        kind: 'forester',
        ...personOf(worker),
        homeId: house.id,
        inside: false,
        state: 'idle',
        plot: null,
        plantTicks: 0,
        searchTicks: 1,
        ...wanderFrom(worker.x, worker.y),
      };

      this.mobiles.set(forester.id, forester);
      this.idleSince.delete(forester.id);
      hired += 1;
    }
    if (hired > 0) this.duty = null;
  }

  /** Le forestier d'une maison — le premier logé —, ou `undefined` : la fenêtre dit ce qu'il fait. */
  public foresterOf(house: ForesterHouse): Forester | undefined {
    let found: Forester | undefined;

    for (const forester of this.foresters()) {
      if (forester.homeId === house.id && (!found || forester.id < found.id)) found = forester;
    }
    return found;
  }

  /**
   * Le carré de forêt d'une maison — posée, ou en fantôme à (tx, ty) —, case
   * par case dans l'ordre de plantation : libre, en pousse, arbre, ou prise
   * par autre chose. Une case libre est une herbe nue, sans bâti, sans route,
   * sans filon — il resterait à la foreuse — et qu'aucune pousse n'occupe.
   */
  public forestPlot(house: { tx: number; ty: number; width: number; height: number }): PlotTile[] {
    return plotTiles(house).map(({ tx, ty }): PlotTile => {
      if (this.resources.sapling(tx, ty)) return { tx, ty, state: 'sapling' };

      const resource = this.resources.at(tx, ty);

      if (resource?.id === 'tree') return { tx, ty, state: 'tree' };

      const blocked =
        resource !== null ||
        this.resources.crop(tx, ty) !== null ||
        terrainAt(this.seed, tx, ty) !== 'grass' ||
        oreAt(this.seed, tx, ty) !== null ||
        this.chunks.occupantAt(tx, ty) !== undefined ||
        this.chestAt(tx, ty) !== null;

      return { tx, ty, state: blocked ? 'blocked' : 'free' };
    });
  }

  /** La première case libre du carré, dans l'ordre, qu'on atteint en ligne droite sans passer par l'eau ; `null` sinon. */
  private nextPlot(house: ForesterHouse, from: { x: number; y: number }): { tx: number; ty: number } | null {
    for (const tile of this.forestPlot(house)) {
      if (tile.state !== 'free') continue;

      const spot = plantSpot(tile);

      if (this.lineIsClear(from.x, from.y, spot.x, spot.y)) return { tx: tile.tx, ty: tile.ty };
    }
    return null;
  }

  /**
   * La croissance des arbres plantés et des cultures : un passage toutes les
   * `SAPLING.passTicks`, et le chunk d'une pousse ou d'une culture qui change
   * de stade se redessine. Les cultures d'un champ abandonné s'arrachent.
   */
  private growForest(): void {
    if (this.tickCount % SAPLING.passTicks !== 0) return;
    for (const { tx, ty } of this.resources.grow(this.tickCount)) this.dirtyTile(tx, ty);
    this.witherFields();
  }

  /**
   * Un tick de forestier. Hors d'une plantation, il cherche toutes les
   * `retryTicks` la première case libre de son carré ; il y marche, plante,
   * puis enchaîne sur la suivante sans rentrer. Carré plein, il flâne devant
   * sa porte jusqu'à ce qu'on coupe un arbre. La nuit, il ne repart pas ;
   * pendant une vague, il rentre s'abriter, et reprendra sa case après.
   */
  private stepForester(forester: Forester, alarm: boolean, bedtime: boolean): void {
    const house = this.entities.get(forester.homeId);

    // Sa maison est tombée : il redevient un ouvrier libre.
    if (house?.kind !== 'foresterHouse') {
      this.release(forester);
      return;
    }

    const door = doorOf(house);

    if (alarm) {
      if (forester.state === 'plant') forester.state = 'toPlot';
      this.goHome(forester, door);
      return;
    }

    // Maison en pause, ou lui retiré de son poste : il lâche sa case et flâne — une pousse à moitié plantée ne pousse pas.
    const working = !house.paused && this.onDuty(forester);

    if (!working && forester.state !== 'idle') this.stopPlanting(forester, door);

    // Retiré de son poste : il rentre, et redevient un ouvrier libre.
    if (!this.onDuty(forester) && forester.state === 'idle') {
      this.release(forester);
      return;
    }

    switch (forester.state) {
      case 'idle':
        forester.searchTicks -= 1;
        if (forester.searchTicks <= 0 && working && !bedtime) {
          forester.searchTicks = FORESTERS.retryTicks;
          this.seekPlot(forester, house, forester.inside ? door : forester);
        }
        if (forester.state === 'idle') this.idle(forester, door, bedtime);
        else forester.inside = false;
        break;

      case 'toPlot': {
        const plot = forester.plot;

        forester.inside = false;
        if (!plot || this.forestPlot(house).find((tile) => tile.tx === plot.tx && tile.ty === plot.ty)?.state !== 'free') {
          // Prise entre-temps — une route, un chantier, l'autre forestier — : il en cherche une autre.
          if (!this.seekPlot(forester, house, forester)) this.stopPlanting(forester, door);
          break;
        }

        const spot = plantSpot(plot);

        if (walkToward(forester, spot.x, spot.y, this.walkStep())) {
          forester.state = 'plant';
          forester.facing = 'right';
          forester.plantTicks = FORESTERS.plantTicks;
        }
        break;
      }

      case 'plant':
        standStill(forester);
        forester.inside = false;
        forester.plantTicks -= this.toil(forester.needs);
        if (forester.plantTicks <= 0) this.plant(forester, house, door);
        break;
    }
  }

  /** La prochaine case : il y va ; plus rien à planter, il reste — ou redevient — oisif. Vrai s'il en a une. */
  private seekPlot(forester: Forester, house: ForesterHouse, from: { x: number; y: number }): boolean {
    const plot = this.nextPlot(house, from);

    forester.plot = plot;
    forester.state = plot ? 'toPlot' : 'idle';
    return plot !== null;
  }

  /** La bêche s'enfonce : une pousse en terre, puis la case suivante, sans rentrer. */
  private plant(forester: Forester, house: ForesterHouse, door: { x: number; y: number }): void {
    const plot = forester.plot;
    const free = plot && this.forestPlot(house).find((tile) => tile.tx === plot.tx && tile.ty === plot.ty)?.state === 'free';

    if (plot && free && this.resources.plant(plot.tx, plot.ty, this.tickCount)) {
      this.dirtyTile(plot.tx, plot.ty);
      this.events.emit('treePlanted', { foresterId: forester.id, tx: plot.tx, ty: plot.ty });
    }

    if (!this.seekPlot(forester, house, forester)) this.stopPlanting(forester, door);
  }

  /** Plus de case à planter : il lâche la sienne et flâne à partir de sa porte. */
  private stopPlanting(forester: Forester, door: { x: number; y: number }): void {
    forester.plot = null;
    forester.state = 'idle';
    forester.searchTicks = FORESTERS.retryTicks;
    Object.assign(forester, wanderFrom(door.x, door.y));
  }

  /* --------------------------------------------------------------- fermiers */

  private *farmers(): IterableIterator<Farmer> {
    for (const mobile of this.mobiles.values()) {
      if (mobile.kind === 'farmer') yield mobile;
    }
  }

  /** Pourvoit la ferme de fermiers, autant que de postes pourvus : les ouvriers libres les plus proches de sa porte. */
  private staffFarm(farm: Farm): void {
    let lodged = 0;

    for (const farmer of this.farmers()) {
      if (farmer.homeId === farm.id) lodged += 1;
    }

    const door = doorOf(farm);
    const posts = this.roster().filled.get(farm.id) ?? 0;
    let hired = 0;

    for (let i = lodged; i < posts; i += 1) {
      const worker = this.nearestFree(door);

      if (!worker) break;

      const farmer: Farmer = {
        kind: 'farmer',
        ...personOf(worker),
        homeId: farm.id,
        inside: false,
        state: 'idle',
        plot: null,
        workTicks: 0,
        load: 0,
        // Ils ne partent pas du même pas : chacun suit le précédent.
        searchTicks: 1 + i * 10,
        ...wanderFrom(worker.x, worker.y),
      };

      this.mobiles.set(farmer.id, farmer);
      this.idleSince.delete(farmer.id);
      hired += 1;
    }
    if (hired > 0) this.duty = null;
  }

  /** Le premier fermier d'une ferme, par id, ou `undefined` : la fenêtre dit ce qu'il fait. */
  public farmerOf(farm: Farm): Farmer | undefined {
    let found: Farmer | undefined;

    for (const farmer of this.farmers()) {
      if (farmer.homeId === farm.id && (!found || farmer.id < found.id)) found = farmer;
    }
    return found;
  }

  /**
   * Le champ d'une ferme — posée, ou en fantôme —, case par case dans
   * l'ordre de semis : libre, semée, en pousse, mûre, ou prise par autre
   * chose. Une case libre est une herbe nue, sans bâti, sans route, sans
   * filon, sans arbre ni pousse du forestier.
   */
  public farmField(farm: { tx: number; ty: number; width: number; height: number }): FieldTile[] {
    return fieldTiles(farm).map(({ tx, ty }): FieldTile => ({ tx, ty, state: this.fieldState(tx, ty) }));
  }

  private fieldState(tx: number, ty: number): FieldState {
    const crop = this.resources.crop(tx, ty);

    if (crop) return crop;

    const blocked =
      this.resources.isTaken(tx, ty) ||
      terrainAt(this.seed, tx, ty) !== 'grass' ||
      oreAt(this.seed, tx, ty) !== null ||
      this.chunks.occupantAt(tx, ty) !== undefined ||
      this.chestAt(tx, ty) !== null;

    return blocked ? 'blocked' : 'free';
  }

  /** Nourriture d'une case récoltée : celle des données, plus les fermes fertiles du labo. */
  private cropYield(): number {
    return CROPS.yield + this.bonus('farmYield');
  }

  /**
   * La première case du champ dans l'état `want`, dans l'ordre, qu'aucun
   * autre fermier ne vise et qu'on atteint en ligne droite sans passer par
   * l'eau ; `null` sinon.
   */
  private nextField(farm: Farm, farmer: Farmer, from: { x: number; y: number }, want: FieldState): { tx: number; ty: number } | null {
    const claimed = new Set<string>();

    for (const other of this.farmers()) {
      if (other !== farmer && other.plot) claimed.add(coordKey(other.plot.tx, other.plot.ty));
    }
    for (const tile of fieldTiles(farm)) {
      if (claimed.has(coordKey(tile.tx, tile.ty)) || this.fieldState(tile.tx, tile.ty) !== want) continue;

      const spot = plantSpot(tile);

      if (this.lineIsClear(from.x, from.y, spot.x, spot.y)) return tile;
    }
    return null;
  }

  /**
   * Un tick de fermier. Hors d'un geste, il cherche toutes les `retryTicks`
   * de quoi faire : semer la première case libre de son champ, sinon
   * récolter la première case mûre — sa place au coffre réservée d'abord ;
   * coffre plein, il attend devant la porte. Récolte faite, il la rapporte au
   * coffre, puis revient semer. La nuit, il ne repart pas ; pendant une
   * vague, il rentre s'abriter, et reprendra sa case après.
   */
  private stepFarmer(farmer: Farmer, alarm: boolean, bedtime: boolean): void {
    const farm = this.entities.get(farmer.homeId);

    // Sa ferme est tombée : il redevient un ouvrier libre.
    if (farm?.kind !== 'farm') {
      this.release(farmer);
      return;
    }

    const door = doorOf(farm);

    if (alarm) {
      if (farmer.state === 'sow') farmer.state = 'toSow';
      if (farmer.state === 'harvest') farmer.state = 'toHarvest';
      this.goHome(farmer, door);
      return;
    }

    // Ferme en pause, ou lui retiré de son poste : il lâche sa case — la récolte qu'il porte, il la rapporte —, puis flâne.
    const working = !farm.paused && this.onDuty(farmer);

    if (!working && farmer.state !== 'idle' && farmer.state !== 'toFarm') this.stopFarming(farmer, farm, door);

    // Retiré de son poste, sa récolte rangée : il rentre, et redevient un ouvrier libre.
    if (!this.onDuty(farmer) && farmer.state === 'idle') {
      this.release(farmer);
      return;
    }

    switch (farmer.state) {
      case 'idle':
      case 'wait':
        farmer.searchTicks -= 1;
        if (farmer.searchTicks <= 0 && working && !bedtime) {
          farmer.searchTicks = FARMERS.retryTicks;
          this.seekField(farmer, farm, farmer.inside ? door : farmer);
        }
        if (farmer.state === 'idle') this.idle(farmer, door, bedtime);
        else if (farmer.state === 'wait') this.waitAtFarm(farmer, door, bedtime);
        else farmer.inside = false;
        break;

      case 'toSow':
      case 'toHarvest': {
        const plot = farmer.plot;
        const want: FieldState = farmer.state === 'toSow' ? 'free' : 'ripe';

        farmer.inside = false;
        if (!plot || this.fieldState(plot.tx, plot.ty) !== want) {
          // Prise entre-temps — un chantier, une route — : il en cherche une autre.
          this.dropPlot(farmer, farm);
          if (!this.seekField(farmer, farm, farmer) && (farmer.state as FarmerState) === 'idle') this.stopFarming(farmer, farm, door);
          break;
        }

        const spot = plantSpot(plot);

        if (walkToward(farmer, spot.x, spot.y, this.walkStep())) {
          const sowing = farmer.state === 'toSow';

          farmer.state = sowing ? 'sow' : 'harvest';
          farmer.facing = 'right';
          farmer.workTicks = sowing ? FARMERS.sowTicks : FARMERS.harvestTicks;
        }
        break;
      }

      case 'sow':
      case 'harvest':
        standStill(farmer);
        farmer.inside = false;
        farmer.workTicks -= this.toil(farmer.needs);
        if (farmer.workTicks > 0) break;
        if (farmer.state === 'sow') this.sow(farmer, farm, door, bedtime);
        else this.reap(farmer, farm, door, bedtime);
        break;

      case 'toFarm':
        farmer.inside = false;
        if (walkToward(farmer, door.x, door.y, this.walkStep())) this.storeCrop(farmer, farm, door, bedtime);
        break;
    }
  }

  /**
   * De quoi faire, depuis `from` : semer d'abord — le champ reste plein —,
   * sinon récolter, sa place au coffre réservée ; coffre plein, il attend à
   * la porte (`wait`) ; rien du tout, il reste oisif. Vrai s'il part sur une case.
   */
  private seekField(farmer: Farmer, farm: Farm, from: { x: number; y: number }): boolean {
    const free = this.nextField(farm, farmer, from, 'free');

    if (free) {
      farmer.plot = free;
      farmer.state = 'toSow';
      return true;
    }

    const ripe = this.nextField(farm, farmer, from, 'ripe');

    farmer.plot = null;
    if (!ripe) {
      farmer.state = 'idle';
      return false;
    }

    const amount = this.cropYield();

    if (!farm.store.reserveIn(CROPS.item, amount)) {
      farmer.state = 'wait';
      farmer.searchTicks = FARMERS.retryTicks;
      return false;
    }
    farmer.load = amount;
    farmer.plot = ripe;
    farmer.state = 'toHarvest';
    return true;
  }

  /** La graine en terre, puis la case suivante — sauf à la nuit tombée : il rentre. */
  private sow(farmer: Farmer, farm: Farm, door: { x: number; y: number }, bedtime: boolean): void {
    const plot = farmer.plot;

    if (plot && this.fieldState(plot.tx, plot.ty) === 'free' && this.resources.sow(plot.tx, plot.ty, this.tickCount)) {
      this.dirtyTile(plot.tx, plot.ty);
      this.events.emit('cropSown', { farmerId: farmer.id, tx: plot.tx, ty: plot.ty });
    }
    farmer.plot = null;
    if (bedtime || !this.seekField(farmer, farm, farmer)) {
      if (farmer.state !== 'wait') this.stopFarming(farmer, farm, door);
    }
  }

  /** La case mûre récoltée : le blé dans le panier, il le rapporte au coffre. */
  private reap(farmer: Farmer, farm: Farm, door: { x: number; y: number }, bedtime: boolean): void {
    const plot = farmer.plot;

    if (plot && this.resources.reap(plot.tx, plot.ty)) {
      this.dirtyTile(plot.tx, plot.ty);
      this.events.emit('cropHarvested', { farmerId: farmer.id, tx: plot.tx, ty: plot.ty, amount: farmer.load });
      farmer.plot = null;
      farmer.state = 'toFarm';
      return;
    }
    // Plus rien sur pied : sa place au coffre se libère, il cherche autre chose.
    this.dropPlot(farmer, farm);
    if (bedtime || !this.seekField(farmer, farm, farmer)) {
      if (farmer.state !== 'wait') this.stopFarming(farmer, farm, door);
    }
  }

  /** À la porte : la place réservée devient du blé dans le coffre ; il repart semer. */
  private storeCrop(farmer: Farmer, farm: Farm, door: { x: number; y: number }, bedtime: boolean): void {
    farm.store.releaseIn(CROPS.item, farmer.load);

    const stored = farm.store.add(CROPS.item, farmer.load);

    farmer.load -= stored;
    if (stored > 0) {
      this.tally(CROPS.item, stored);
      this.events.emit('farmProduced', { id: farm.id, item: CROPS.item });
    }
    // Ce qui ne rentre pas — une sauvegarde retouchée, jamais en jeu — reste dans son panier : il attend.
    if (farmer.load > 0) {
      farmer.state = 'wait';
      return;
    }
    farmer.state = 'idle';
    farmer.searchTicks = 0;
    if (bedtime) Object.assign(farmer, wanderFrom(door.x, door.y));
  }

  /** Coffre plein : devant la porte, sa récolte au panier s'il en a, jusqu'à ce qu'on fasse de la place. */
  private waitAtFarm(farmer: Farmer, door: { x: number; y: number }, bedtime: boolean): void {
    if (farmer.load > 0 && !farmer.plot) {
      const farm = this.entities.get(farmer.homeId);

      if (farm?.kind === 'farm' && farm.store.freeSpace() > 0) {
        const stored = farm.store.add(CROPS.item, farmer.load);

        farmer.load -= stored;
        if (stored > 0) this.tally(CROPS.item, stored);
      }
    }
    if (bedtime && farmer.load === 0) {
      this.sleep(farmer, door);
      return;
    }
    farmer.inside = false;
    if (walkToward(farmer, door.x, door.y, this.walkStep())) farmer.facing = 'down';
  }

  /** Il lâche sa case ; une récolte pas encore cueillie rend sa place au coffre. */
  private dropPlot(farmer: Farmer, farm: Farm): void {
    if ((farmer.state === 'toHarvest' || farmer.state === 'harvest') && farmer.load > 0) {
      farm.store.releaseIn(CROPS.item, farmer.load);
      farmer.load = 0;
    }
    farmer.plot = null;
  }

  /** Plus rien à faire au champ : il lâche sa case et flâne à partir de sa porte. */
  private stopFarming(farmer: Farmer, farm: Farm, door: { x: number; y: number }): void {
    this.dropPlot(farmer, farm);
    farmer.state = 'idle';
    farmer.searchTicks = FARMERS.retryTicks;
    Object.assign(farmer, wanderFrom(door.x, door.y));
  }

  /**
   * Après un chargement : la place au coffre de chaque récolte en cours se
   * réserve à nouveau, et deux fermiers qui viseraient la même case — une
   * sauvegarde retouchée — n'en gardent qu'un.
   */
  private restoreFarmers(): void {
    const claimed = new Set<string>();

    for (const farmer of this.farmers()) {
      const farm = this.entities.get(farmer.homeId);
      const holds = farmer.state === 'toHarvest' || farmer.state === 'harvest' || farmer.state === 'toFarm';

      if (farmer.plot) {
        const key = coordKey(farmer.plot.tx, farmer.plot.ty);

        if (claimed.has(key)) farmer.plot = null;
        else claimed.add(key);
      }
      if (holds && farmer.load > 0 && farm?.kind === 'farm') farm.store.reserveIn(CROPS.item, farmer.load);
    }
  }

  /**
   * Les cultures d'un champ qu'aucune ferme ne cultive plus s'arrachent : la
   * case redevient libre. Une ferme tombée en chantier garde les siennes.
   */
  private witherFields(): void {
    if (this.resources.cropTiles().next().done) return;

    const covered = new Set<string>();

    for (const entity of this.entities.values()) {
      if (entity.proto !== 'farm') continue;
      for (const tile of fieldTiles(entity)) covered.add(coordKey(tile.tx, tile.ty));
    }
    for (const tile of [...this.resources.cropTiles()]) {
      if (covered.has(coordKey(tile.tx, tile.ty))) continue;
      this.resources.wither(tile.tx, tile.ty);
      this.dirtyTile(tile.tx, tile.ty);
    }
  }

  /** Après un chargement : les réservations se rejouent depuis les jobs sauvegardés. */
  private restoreJobs(): void {
    const workers = [...this.workers()];
    const broken = new Set(this.jobs.rebuild(this.entities, workers.flatMap((worker) => (worker.job ? [worker.job] : []))));

    for (const worker of workers) {
      if (!worker.job || !broken.has(worker.job)) continue;
      if (worker.job.carried) this.reroute(worker, worker.job);
      else worker.job = null;
    }
  }

  /* ----------------------------------------------------------------- météo */

  /** La météo en cours, pour le rendu et le HUD : lue dans la seed, comme la carte. */
  public weather(): WeatherSpell | null {
    return this.weatherAt(this.tickCount);
  }

  /** La prochaine météo qui commence strictement après ce tick, pour l'annonce du HUD. */
  public nextWeather(): WeatherSpell | null {
    let spell = nextWeather(this.seed, this.tickCount);

    // Une pluie qui gâcherait une nuit n'arrive pas : on regarde la suivante.
    while (spell && this.spoils(spell)) spell = nextWeather(this.seed, spell.start);
    return spell;
  }

  /** La météo au tick `tick` : celle de la seed, sauf une météo rude qui tomberait sur une nuit. */
  private weatherAt(tick: number): WeatherSpell | null {
    const spell = weatherAt(this.seed, tick);

    return spell && !this.spoils(spell) ? spell : null;
  }

  private spoils(spell: WeatherSpell): boolean {
    return spoilsNight(spell, this.cycleStartTick, WEATHER_CALENDAR.waveMarginTicks);
  }

  /** Relit la météo du tick, et annonce ce qui arrive, commence ou s'achève. */
  private updateWeather(): void {
    const previous = this.spell;
    const announced = this.weatherAt(this.tickCount + WEATHER_CALENDAR.announceTicks);

    this.spell = this.weatherAt(this.tickCount);

    if (announced && announced.start === this.tickCount + WEATHER_CALENDAR.announceTicks) {
      this.events.emit('weatherAnnounced', {
        id: announced.id,
        seconds: WEATHER_CALENDAR.announceTicks / TICKS_PER_SECOND,
      });
    }
    if (previous && previous.start !== this.spell?.start) this.events.emit('weatherEnded', { id: previous.id });
    if (this.spell?.start === this.tickCount) this.events.emit('weatherStarted', { id: this.spell.id });
  }

  /** (x, y) est-il à l'abri, près d'une mairie debout ? */
  public sheltered(x: number, y: number): boolean {
    const hall = this.entities.get(this.townHallId);
    const radius = WEATHER_CALENDAR.shelterRadius * TILE_SIZE;

    return hall?.kind === 'townHall' && distanceSq(x, y, this.target.x, this.target.y) <= radius * radius;
  }

  /** La poussée du vent sur une flèche ce tick. */
  private wind(): Wind {
    if (!this.spell) return NO_WIND;

    const drift = WEATHER[this.spell.id].arrowDrift;

    return drift === 0 ? NO_WIND : { x: this.spell.windX * drift, y: this.spell.windY * drift };
  }

  /** Le facteur de portée des arcs ce tick : le brouillard raccourcit la vue. */
  private rangeFactor(): number {
    return this.spell ? WEATHER[this.spell.id].weaponRange : 1;
  }

  /**
   * La pluie acide ronge ce qui est déjà abîmé, hors de l'abri. Elle use,
   * elle n'achève pas : un bâtiment garde toujours son dernier point de vie.
   */
  /**
   * Les stations de dépollution : toutes les `PURIFIER.intervalTicks` (moins
   * la recherche, `purifyTicks`), chacune rend saine la case polluée la plus
   * proche de son emprise, dans son rayon. Le décalage par id les
   * désynchronise ; sans case à nettoyer, elle attend.
   */
  private purify(): void {
    const interval = Math.max(1, PURIFIER.intervalTicks + this.bonus('purifyTicks'));

    for (const entity of this.entities.values()) {
      if (entity.kind !== 'purifier' || (this.tickCount + entity.id) % interval !== 0) continue;

      const next = this.land.cleanableAround(entity.tx, entity.ty, entity.width, entity.height, PURIFIER.radius)[0];

      if (next && this.land.clean(next.tx, next.ty)) this.events.emit('landCleaned', { tiles: [next] });
    }
  }

  private corrode(): void {
    const corrosion = this.spell ? WEATHER[this.spell.id].corrosion : null;

    if (!this.spell || !corrosion || (this.tickCount - this.spell.start) % corrosion.everyTicks !== corrosion.everyTicks - 1) {
      return;
    }

    for (const entity of this.entities.values()) {
      if (entity.kind === 'site' || entity.hp >= BUILDINGS[entity.proto].hp || entity.hp <= 1) continue;

      const x = (entity.tx + entity.width / 2) * TILE_SIZE;
      const y = (entity.ty + entity.height / 2) * TILE_SIZE;

      if (this.sheltered(x, y)) continue;

      entity.hp = Math.max(1, entity.hp - corrosion.damage);
      this.events.emit('buildingCorroded', { id: entity.id, hp: entity.hp });
    }
  }

  /* ------------------------------------------------------------ destruction */

  private damageBuilding(id: EntityId, amount: number): void {
    const entity = this.entities.get(id);

    if (!entity || entity.kind === 'site') return;

    entity.hp = Math.max(0, entity.hp - amount);
    this.events.emit('buildingDamaged', { id, hp: entity.hp });

    if (entity.hp === 0 && entity.kind === 'antenna' && entity.level > 1) this.dropFloor(entity);
    else if (entity.hp === 0) this.destroyBuilding(entity);
  }

  private destroyBuilding(building: Building): void {
    this.entities.delete(building.id);
    this.rosterChanged();
    this.restartFarms();
    if (building.kind === 'pigPen') this.releasePigs(building);
    this.chunks.release(building.id, building.tx, building.ty, building.width, building.height);
    this.dirtyTile(building.tx, building.ty);
    if (building.kind === 'yard') this.settleSites();
    this.events.emit('buildingDestroyed', {
      id: building.id,
      proto: building.proto,
      tx: building.tx,
      ty: building.ty,
    });

    // Rien ne disparaît pour de bon, hors la mairie : tout bâtiment abattu redevient son chantier, à moitié livré.
    if (building.id !== this.townHallId) this.ruin(building);

    if (building.id === this.townHallId && !this.defeated) {
      this.defeated = true;
      this.defeatTick = this.tickCount;
      this.events.emit('townHallDestroyed', {});
    }
  }

  /** Le chantier qui remplace un bâtiment de l'usine abattu : `RUIN.delivered` de son coût, déjà livré. */
  private ruin(building: Building): void {
    const id = this.openSite(building.proto, building.tx, building.ty);
    const site = this.entities.get(id);

    if (site?.kind !== 'site') return;
    for (const [item, amount] of Object.entries(BUILDINGS[building.proto].cost) as [ItemId, number][]) {
      const delivered = Math.floor(amount * RUIN.delivered);

      if (delivered > 0) site.delivered[item] = delivered;
    }
  }

  /* ------------------------------------------------------------- prestige */

  /** Un bâtiment achevé rapporte son Prestige, une seule fois par emplacement : rebâtir une ruine ne paie pas. */
  private awardBuilding(building: Building): void {
    const key = prestigeKey(building);

    if (this.prestigeSites.has(key)) return;
    this.prestigeSites.add(key);
    this.gainPrestige(BUILD_PRESTIGE[building.proto], (building.tx + building.width / 2) * TILE_SIZE, building.ty * TILE_SIZE);
  }

  /**
   * L'XP d'un ennemi vaincu, pour la part de celui qui a tiré (`XP_SHARE`).
   * Un niveau passé soigne Adam à fond et le dit (`levelUp`) ; un gros gain
   * peut en passer plusieurs d'un coup, le message ne dit que le dernier
   * avec tout ce qu'ils ont rapporté.
   */
  private gainXp(amount: number, shooter: Shooter, x: number, y: number): void {
    const gained = sharedXp(amount, shooter);
    const { player } = this;

    if (gained <= 0 || this.level() >= MAX_LEVEL) return;

    const before = this.level();

    player.xp += gained;
    this.events.emit('xpGained', { amount: gained, total: player.xp, x, y });

    const after = this.level();

    if (after === before) return;
    player.hp = this.maxHp();
    this.events.emit('levelUp', {
      level: after,
      maxHp: LEVEL_GAINS.maxHp * (after - before),
      bowDamage: levelBonus(after, 'bowDamage') - levelBonus(before, 'bowDamage'),
      x: player.x,
      y: player.y,
    });
  }

  private gainPrestige(amount: number, x: number, y: number): void {
    if (amount <= 0) return;
    this.prestige += amount;
    this.events.emit('prestigeGained', { amount, total: this.prestige, x, y });
  }

  /* ------------------------------------------------- pause et effectifs */

  /** La commande `pauseBuilding` : un producteur s'arrête, ou repart. Sans effet sur un bâtiment qui ne produit rien. */
  private setPaused(id: EntityId, paused: boolean): void {
    const entity = this.entities.get(id);

    if (!entity || entity.kind === 'site' || !canPause(entity.proto) || entity.paused === paused) return;

    entity.paused = paused;
    this.events.emit('buildingPaused', { id, paused });
    // En pause, rien à faire : le prochain réveil trouvera la machine arrêtée et ne se replanifiera pas.
    if (!paused) this.restart(entity);
    // Un poste de construction arrêté ne bâtit plus : ses chantiers prêts s'achèvent.
    if (entity.kind === 'yard') this.settleSites();
  }

  /** La commande `setWorkers` : l'effectif voulu, ramené dans les bornes du bâtiment. */
  private setStaff(id: EntityId, count: number): void {
    const entity = this.entities.get(id);

    if (!entity || entity.kind === 'site' || !employs(entity.proto)) return;

    const staff = clampStaff(entity.proto, count);

    if (staff === entity.staff) return;

    entity.staff = staff;
    this.rosterChanged();
    this.events.emit('workersChanged', { id, staff });
    this.restartFarms();
    if (entity.kind === 'yard') this.settleSites();
  }

  /**
   * La commande `setPriority` : la priorité de travail d'un bâtiment qui
   * emploie. La répartition la lit au prochain coup d'œil ; un ouvrier repris
   * à un bâtiment plus bas finit son geste avant de partir.
   */
  private setPriority(id: EntityId, priority: WorkPriority): void {
    const entity = this.entities.get(id);

    if (!entity || entity.kind === 'site' || !employs(entity.proto) || !isWorkPriority(priority) || entity.priority === priority) return;

    entity.priority = priority;
    this.rosterChanged();
    this.events.emit('priorityChanged', { id, priority });
  }

  /**
   * Les postes d'un bâtiment qui emploie : bornes, effectif voulu, postes
   * occupés. `null` pour un bâtiment sans ouvriers.
   */
  public staffing(building: Building): Staffing | null {
    if (!employs(building.proto)) return null;

    const { minWorkers, workers } = BUILDINGS[building.proto];

    return {
      min: minWorkers,
      max: workers,
      wanted: building.staff,
      filled: this.roster().filled.get(building.id) ?? 0,
    };
  }

  /**
   * Ce qui arrête un producteur sans que le joueur l'ait voulu, le plus
   * important d'abord : `null` s'il tourne, ou s'il est en pause (la bulle ⏸).
   * Relevé tous les quelques ticks avec son hystérésis (`sim/problems.ts`) : il ne
   * clignote pas quand un coffre se vide et se remplit aussitôt.
   */
  public problem(building: Building): ProblemId | null {
    return this.problems.of(building.id);
  }

  /** Relève les problèmes des producteurs, tous les `PROBLEMS.everyTicks`, et oublie ceux qui ne sont plus des producteurs debout. */
  private watchProblems(): void {
    if (this.tickCount % PROBLEMS.everyTicks !== 0) return;
    for (const entity of this.entities.values()) {
      if (entity.kind !== 'site' && canPause(entity.proto)) this.problems.step(entity.id, this.problemFacts(entity), this.tickCount);
    }
    for (const id of this.problems.ids()) {
      if (this.entities.get(id)?.kind === 'site' || !this.entities.has(id)) this.problems.forget(id);
    }
  }

  private problemFacts(building: Building): ProblemFacts {
    const staffed = employs(building.proto);
    const stoppedByPlayer = building.paused || (staffed && building.staff === 0);
    const noWorker = staffed && !stoppedByPlayer && this.stopped(building);
    const { store } = building;
    let storeFull = false;

    // Le coffre n'a plus la place de la production suivante — une foreuse ou une ferme s'y est endormie.
    if (building.kind === 'drill') {
      const amount = Object.values(RECIPES[DRILL_RECIPE].outputs)[0] ?? 1;

      storeFull = building.blocked && building.output !== null && store.total() + amount > store.capacity;
    } else if (building.kind === 'quarry') {
      const amount = Object.values(quarryRecipe(building).outputs)[0] ?? 1;

      storeFull = building.blocked && store.total() + amount > store.capacity;
    } else if (building.kind === 'pigPen') {
      storeFull = building.blocked && building.pigs > 0 && store.total() + PIG_FARM.meatPerPig * building.pigs > store.capacity;
    } else if (building.kind === 'farm') {
      // Plus la place d'une récolte au coffre : les cultures mûres attendent sur pied.
      storeFull = store.total() + this.cropYield() > store.capacity;
    } else if (building.kind === 'lumberCamp') {
      // Plus la place d'un voyage au coffre : les bûcherons attendent un porteur.
      storeFull = store.total() + LUMBERJACKS.carry > store.capacity;
    }

    // L'heure de la naissance est passée, ou le four s'est arrêté, faute d'entrée au coffre.
    const starved =
      !stoppedByPlayer &&
      ((building.kind === 'nursery' && building.hungry) ||
        (building.kind === 'forge' && building.blocked && !noWorker && isStarving(building)));

    const noPig = building.kind === 'pigPen' && building.pigs === 0;

    return { stoppedByPlayer, storeFull, noWorker, starved, noPig, drained: store.total() <= store.capacity * PROBLEMS.releaseRatio };
  }

  /** Un producteur à l'arrêt : en pause, ou sans un seul ouvrier en poste. */
  public stopped(building: Building): boolean {
    if (building.paused) return true;

    const staffing = this.staffing(building);

    return staffing !== null && staffing.filled === 0;
  }

  /**
   * Qui travaille : les ouvriers de la colonie (`colonists`) répartis entre les bâtiments qui emploient
   * (`allocateStaff` : priorité, ancienneté, et la répartition d'avant). Dans chaque bâtiment, ce sont ses premiers
   * logés, par id, qui prennent les postes ; les autres finissent leur geste
   * et sont libres. Un ex-mutant n'occupe pas de poste : il porte toujours.
   */
  private roster(): { filled: Map<EntityId, number>; onDuty: Set<MobileId> } {
    if (this.duty?.tick === this.tickCount) return this.duty;

    const demands: StaffDemand[] = [];

    for (const entity of this.entities.values()) {
      if (entity.kind === 'site' || !employs(entity.proto)) continue;
      demands.push({ id: entity.id, wanted: entity.staff, priority: entity.priority, paused: entity.paused });
    }

    const before = this.posts;
    const posts = allocateStaff(demands, this.colonists, before, this.tickCount);
    const filled = new Map<EntityId, number>();

    for (const [id, post] of posts) {
      filled.set(id, post.filled);
      // Un poste gagné ou repris : maisons, cabanes et bâtiments logent leurs nouveaux ouvriers au prochain tick.
      if (before && post.filled !== (before.get(id)?.filled ?? 0)) this.lodging = true;
    }
    this.posts = posts;
    const crews = new Map<EntityId, MobileId[]>();

    for (const mobile of this.mobiles.values()) {
      if (!isColonist(mobile) || (mobile.kind === 'worker' && mobile.free)) continue;

      const crew = crews.get(mobile.homeId);

      if (crew) crew.push(mobile.id);
      else crews.set(mobile.homeId, [mobile.id]);
    }

    const onDuty = new Set<MobileId>();

    for (const [home, crew] of crews) {
      crew.sort((a, b) => a - b);
      for (const id of crew.slice(0, filled.get(home) ?? 0)) onDuty.add(id);
    }

    this.duty = { tick: this.tickCount, filled, onDuty };
    return this.duty;
  }

  /** L'ouvrier a-t-il un poste ? Sinon, il finit son geste, puis flâne. */
  private onDuty(mobile: Laborer): boolean {
    return (mobile.kind === 'worker' && (mobile.exMutant || mobile.grown || mobile.survivor)) || this.roster().onDuty.has(mobile.id);
  }

  /**
   * Relance un producteur endormi qui a de nouveau de quoi tourner : un
   * coffre qu'on vide, une pause levée, des ouvriers revenus. Une machine qui
   * attend déjà un réveil n'est pas touchée — elle n'en a jamais deux.
   */
  private restart(building: Building): void {
    if (this.stopped(building)) return;

    if (building.kind === 'drill' && building.blocked && building.output) {
      building.blocked = false;
      this.scheduleDrill(building);
    } else if (building.kind === 'quarry' && building.blocked) {
      building.blocked = false;
      this.scheduleFarm(building);
    } else if (building.kind === 'pigPen' && building.blocked && building.pigs > 0) {
      this.startPigPen(building);
    } else if (building.kind === 'forge' && building.blocked) {
      this.startForge(building);
    } else if (
      building.kind === 'nursery' &&
      // Son réveil est passé pendant la pause ; à ce tick même, il n'a pas encore sonné et s'en chargera.
      building.nextBirthTick < this.tickCount &&
      (!building.hungry || hasInputs(building.store, RECIPES[NURSERY_RECIPE]))
    ) {
      this.runNursery(building);
    }
  }

  /** Les effectifs ont changé : une carrière ou un four qui n'avait plus personne peut repartir. */
  private restartFarms(): void {
    for (const entity of this.entities.values()) {
      if (entity.kind === 'quarry' || entity.kind === 'forge' || entity.kind === 'pigPen') this.restart(entity);
    }
  }

  /**
   * Retire des objets du coffre d'un bâtiment et le relance s'il était bloqué.
   *
   * Adam y passe (heurt et « Prendre »), les porteurs aussi : une foreuse ou
   * une ferme au coffre plein dort, et c'est celui qui la vide qui la réveille.
   */
  public withdraw(id: EntityId, item: ItemId, amount: number): number {
    const entity = this.entities.get(id);

    if (!entity || entity.kind === 'site') return 0;

    const removed = entity.store.remove(item, amount);

    if (removed <= 0) return 0;

    // Une machine bloquée ne se replanifiait plus : c'est ce retrait qui la réveille.
    this.restart(entity);
    return removed;
  }

  /**
   * Les règles d'échange du coffre d'un bâtiment (`sim/transfer.ts`), ou
   * `null` s'il n'a pas de coffre où Adam échange. La mairie donne son
   * disponible — ce que porteurs et bâtisseurs ont réservé pour un chantier
   * reste — et prend tout ; une foreuse, une ferme, une carrière ou une
   * cabane donne sa production et ne prend rien ; une forge donne ses
   * sorties et prend ses entrées ; une nurserie prend sa nourriture et ne la
   * rend pas. Le labo a son panneau, l'antenne ses étages.
   */
  public transferRules(entity: Entity): TransferRules | null {
    if (entity.kind === 'site') return null;

    const { store } = entity;
    const none = (): number => 0;

    switch (entity.kind) {
      case 'townHall':
        return { takeable: (item) => store.available(item), accepts: () => Infinity };

      case 'drill':
      case 'farm':
      case 'quarry':
      case 'pigPen':
      case 'lumberCamp':
        return { takeable: (item) => store.available(item), accepts: none };

      case 'forge': {
        const outputs: RecipeProto['outputs'] = forgeRecipe(entity).outputs;

        return {
          takeable: (item) => ((outputs[item] ?? 0) > 0 ? store.available(item) : 0),
          accepts: (item) => consumerRoom(entity, item),
        };
      }

      case 'nursery':
        return { takeable: none, accepts: (item) => consumerRoom(entity, item) };

      default:
        return null;
    }
  }

  /**
   * La zone d'échange : un objet, ou tout ce qui peut passer, entre le sac et
   * le coffre. Prendre vide le coffre comme un « Prendre » (la machine
   * bloquée repart) ; déposer remplit la ville comme « Déposer le sac », une
   * forge ou une nurserie comme son « Transférer ».
   */
  private transferItems(id: EntityId, direction: TransferDirection, quantity: TransferQuantity, only?: ItemId): void {
    const entity = this.entities.get(id);
    const rules = entity ? this.transferRules(entity) : null;

    if (!entity || entity.kind === 'site' || !rules) {
      this.events.emit('transferRejected', { id, reason: 'missing' });
      return;
    }
    if (!this.inReach(entity)) {
      this.events.emit('transferRejected', { id, reason: 'outOfReach' });
      return;
    }

    const { inventory } = this.player;
    const plan: [ItemId, number][] =
      only === undefined
        ? transferAllPlan(direction, entity.store, rules, inventory)
        : [[only, transferAmount(direction, only, quantity, rules, inventory)]];
    const moved: [ItemId, number][] = [];

    for (const [item, amount] of plan) {
      if (amount <= 0) continue;

      let passed = 0;

      if (direction === 'take') {
        passed = this.withdraw(entity.id, item, amount);
        inventory.add(item, passed);
        if (passed > 0) this.events.emit('storeTaken', { id: entity.id, item, amount: passed });
      } else if (entity.kind === 'townHall') {
        passed = entity.store.add(item, inventory.remove(item, amount));
        if (passed > 0) this.events.emit('townDeposited', { item, amount: passed });
      } else if (isConsumer(entity)) {
        passed = this.supplyFrom(entity, item, amount, inventory, 'bag');
      }
      if (passed > 0) moved.push([item, passed]);
    }

    if (moved.length === 0) {
      const full = direction === 'take' && inventory.freeSpace() <= 0;

      this.events.emit('transferRejected', { id, reason: full ? 'bagFull' : 'nothing' });
      return;
    }
    if (direction === 'deposit' && isConsumer(entity)) this.afterSupply(entity);
    this.events.emit('itemsTransferred', { id, direction, moved });
  }

  /** Le bouton « Prendre » : tout le coffre passe dans le sac, dans la limite de la place. */
  private takeAll(id: EntityId): void {
    const entity = this.entities.get(id);

    if (
      entity?.kind !== 'drill' &&
      entity?.kind !== 'farm' &&
      entity?.kind !== 'quarry' &&
      entity?.kind !== 'pigPen' &&
      entity?.kind !== 'forge' &&
      entity?.kind !== 'lab' &&
      entity?.kind !== 'lumberCamp'
    ) {
      this.events.emit('takeRejected', { id, reason: 'missing' });
      return;
    }

    const reason: TakeRejection | null = !this.inReach(entity)
      ? 'outOfReach'
      : this.takeable(entity).length === 0
        ? 'empty'
        : this.player.inventory.freeSpace() <= 0
          ? 'bagFull'
          : null;

    if (reason) {
      this.events.emit('takeRejected', { id, reason });
      return;
    }

    for (const [item, amount] of this.takeable(entity)) {
      const room = this.player.inventory.freeSpace();

      if (room <= 0) break;
      this.takeInto(entity, item, Math.min(amount, room));
    }
  }

  /**
   * Ce qu'Adam peut prendre dans un coffre : tout le disponible, pour une foreuse ou une
   * ferme ; les sorties seulement pour une forge — plaques ou charbon, ses
   * entrées restent au four ; au labo, le reste d'une recherche abandonnée, jamais
   * ce que la recherche en cours attend.
   */
  public takeable(producer: Producer | Lab): [ItemId, number][] {
    if (producer.kind === 'lab') {
      return producer.store.entries().flatMap(([item]): [ItemId, number][] => {
        const surplus = labSurplus(producer, item);

        return surplus > 0 ? [[item, surplus]] : [];
      });
    }

    // Le disponible, pas le stock brut : ce qu'un porteur a déjà réservé reste au coffre.
    const entries = producer.store
      .entries()
      .map(([item]): [ItemId, number] => [item, producer.store.available(item)])
      .filter(([, amount]) => amount > 0);

    if (producer.kind !== 'forge') return entries;

    const outputs: RecipeProto['outputs'] = forgeRecipe(producer).outputs;

    return entries.filter(([item]) => (outputs[item] ?? 0) > 0);
  }

  /** Du coffre au sac : le coffre se vide (et la machine repart), le sac reçoit. */
  private takeInto(producer: Producer | Lab, item: ItemId, amount: number): void {
    const taken = this.withdraw(producer.id, item, amount);

    if (taken <= 0) return;
    this.player.inventory.add(item, taken);
    this.events.emit('storeTaken', { id: producer.id, item, amount: taken });
  }

  /** Nombre de réveils en attente — affiché dans le HUD de debug. */
  public pendingWakes(): number {
    return this.scheduler.size();
  }

  /** Réveils traités au dernier tick — lus par le compteur de performances. */
  public wakesLastTick(): number {
    return this.woken;
  }

  /** La première tuile praticable collée à l'emprise, en commençant par le bas, ou `null`. */
  private freeTileAround(tx: number, ty: number, width: number, height: number): Contact | null {
    const candidates: Contact[] = [];

    for (let x = tx; x < tx + width; x += 1) {
      candidates.push({ tx: x, ty: ty + height }, { tx: x, ty: ty - 1 });
    }
    for (let y = ty; y < ty + height; y += 1) {
      candidates.push({ tx: tx + width, ty: y }, { tx: tx - 1, ty: y });
    }
    return candidates.find((tile) => !this.isSolid(tile.tx, tile.ty)) ?? null;
  }

  /* ------------------------------------------------------------ brouillard */

  /**
   * Les sources de vision de ce tick : Adam, chaque bâtiment du joueur
   * (chantier compris), les habitants dehors. Une source qui n'a pas changé
   * de tuile ne coûte rien (`FogOfWar.source`). Puis les bases mutantes :
   * revue, une base oublie sa capture ; sortie de la vue, elle est copiée
   * telle qu'on l'a vue — revues seulement quand une case a changé d'état.
   */
  private watchSight(): void {
    const fog = this.fog;

    fog.begin();
    fog.source(ADAM_SIGHT, floorDiv(this.adam.x, TILE_SIZE), floorDiv(this.adam.y, TILE_SIZE), FOG_VISION.player);
    if (this.partner) {
      const { x, y } = this.partner.player;

      fog.source(PARTNER_SIGHT, floorDiv(x, TILE_SIZE), floorDiv(y, TILE_SIZE), FOG_VISION.player);
    }
    for (const entity of this.entities.values()) {
      const { tx, ty } = centerTile(entity);
      const reach = FOG_VISION.buildings[entity.proto] ?? FOG_VISION.building;

      // Une tour de guet en chantier ne guette pas encore : elle voit comme un chantier.
      fog.source(entity.id * 2, tx, ty, (entity.kind === 'site' ? FOG_VISION.building : reach) + Math.max(entity.width, entity.height) / 2);
    }
    for (const mobile of this.mobiles.values()) {
      if (!seesAround(mobile)) continue;
      fog.source(mobile.id * 2 + 1, floorDiv(mobile.x, TILE_SIZE), floorDiv(mobile.y, TILE_SIZE), FOG_VISION.people);
    }
    fog.end();

    if (fog.revision === this.basesSightRevision) return;
    this.basesSightRevision = fog.revision;
    for (const base of this.enemyBases) {
      const sight = this.baseSight(base, false);

      if (sight === 'visible') fog.bases.delete(base.id);
      else if (sight === 'explored' && !fog.bases.has(base.id)) fog.bases.set(base.id, { ...base });
    }
  }

  /** Une tuile va changer : vue de loin, sa capture garde ce qu'elle montrait. */
  private rememberTile(tx: number, ty: number): void {
    if (this.fog.sight(tx, ty) !== 'explored') return;

    const key = coordKey(tx, ty);

    if (!this.fog.looks.has(key)) this.fog.looks.set(key, this.resources.look(tx, ty));
  }

  /** L'état de la case pour le joueur : tout est visible quand le brouillard est levé (débogage). */
  public sightAt(tx: number, ty: number): Sight {
    return this.fog.enabled ? this.fog.sight(tx, ty) : 'visible';
  }

  /**
   * Le joueur connaît-il la case — explorée, ou sous les yeux d'Adam en ce
   * moment même, avant que la passe de vision du tick ne l'ait notée ?
   */
  private known(tx: number, ty: number): boolean {
    if (this.sightAt(tx, ty) !== 'unexplored') return true;

    const dx = tx - floorDiv(this.player.x, TILE_SIZE);
    const dy = ty - floorDiv(this.player.y, TILE_SIZE);
    const reach = FOG_VISION.player + 0.5;

    return dx * dx + dy * dy <= reach * reach;
  }

  /** Le point monde (x, y) est-il vu en direct ? Ce qui bouge hors de vue ne se montre ni ne se tape. */
  public sees(x: number, y: number): boolean {
    return this.sightAt(floorDiv(x, TILE_SIZE), floorDiv(y, TILE_SIZE)) === 'visible';
  }

  /** Ce que le joueur voit des ressources de la tuile : en direct, ou la capture d'une case vue de loin. */
  public lookAt(tx: number, ty: number): TileLook {
    if (this.fog.looks.size > 0 && this.sightAt(tx, ty) === 'explored') {
      const look = this.fog.looks.get(coordKey(tx, ty));

      if (look) return look;
    }
    return this.resources.look(tx, ty);
  }

  /** La base est-elle vue — une case de son emprise suffit —, explorée, ou inconnue ? */
  private baseSight(base: EnemyBase, honorSetting = true): Sight {
    let sight: Sight = 'unexplored';

    for (let ty = base.ty; ty < base.ty + ENEMY_BASE.height; ty += 1) {
      for (let tx = base.tx; tx < base.tx + ENEMY_BASE.width; tx += 1) {
        const tile = honorSetting ? this.sightAt(tx, ty) : this.fog.sight(tx, ty);

        if (tile === 'visible') return 'visible';
        if (tile === 'explored') sight = 'explored';
      }
    }
    return sight;
  }

  /**
   * Les bases mutantes telles que le joueur les connaît : en direct si on
   * les voit, telles qu'on les a vues la dernière fois sinon — debout,
   * peut-être, alors qu'elles sont tombées. Une base jamais vue n'y est pas.
   */
  public knownEnemyBases(): EnemyBase[] {
    const known: EnemyBase[] = [];

    for (const base of this.enemyBases) {
      const sight = this.baseSight(base);

      if (sight === 'visible') known.push(base);
      else if (sight === 'explored') known.push(this.fog.bases.get(base.id) ?? base);
    }
    return known;
  }

  /** La base `id` telle que le joueur la connaît, ou `undefined` s'il ne l'a jamais vue. */
  public knownEnemyBase(id: number): EnemyBase | undefined {
    return this.knownEnemyBases().find((base) => base.id === id);
  }

  /** Une partie de test, une ancienne sauvegarde : le disque autour de (tx, ty) est exploré d'office. */
  public revealAround(tx: number, ty: number, radius: number): void {
    this.fog.reveal(tx, ty, radius);
  }

  /** Chunk sous le joueur — pratique pour le HUD et le culling. */
  public playerChunk(): { cx: number; cy: number } {
    return {
      cx: floorDiv(floorDiv(this.player.x, TILE_SIZE), CHUNK_TILES),
      cy: floorDiv(floorDiv(this.player.y, TILE_SIZE), CHUNK_TILES),
    };
  }
}

/** Une entité en données : le coffre devient son stock, le reste est copié. */
function saveEntity(entity: Entity): SavedEntity {
  if (entity.kind === 'site') return { ...entity, delivered: { ...entity.delivered } };
  if (entity.kind === 'barracks') return { ...entity, store: entity.store.toJSON(), training: entity.training && { ...entity.training } };
  return { ...entity, store: entity.store.toJSON() };
}

/** Un mobile copié : un ouvrier emporte son job, qui ne doit pas être partagé entre deux mondes. */
function copyMobile(mobile: Mobile): Mobile {
  if (mobile.kind === 'worker') return { ...mobile, needs: { ...mobile.needs }, job: mobile.job && { ...mobile.job } };
  if (mobile.kind === 'lumberjack') return { ...mobile, needs: { ...mobile.needs }, tree: mobile.tree && { ...mobile.tree } };
  if (mobile.kind === 'forester') return { ...mobile, needs: { ...mobile.needs }, plot: mobile.plot && { ...mobile.plot } };
  if (mobile.kind === 'farmer') return { ...mobile, needs: { ...mobile.needs }, plot: mobile.plot && { ...mobile.plot } };
  if (mobile.kind === 'kid') return { ...mobile, needs: { ...mobile.needs } };
  if (mobile.kind === 'caravan') {
    return { ...mobile, offers: mobile.offers.map((trade) => ({ ...trade, cost: { ...trade.cost }, items: { ...trade.items } })) };
  }
  if (mobile.kind === 'mutant' && mobile.queen) return { ...mobile, queen: { ...mobile.queen } };
  if (mobile.kind === 'beast' && mobile.slam) return { ...mobile, slam: { ...mobile.slam } };
  return { ...mobile };
}

/** La clé du compte à rebours d'un besoin pour un habitant : un entier, pour ne rien allouer à chaque tick. */
function famineKey(id: MobileId, need: number): number {
  return id * NEED_IDS.length + need;
}

/** Un ouvrier qui vit d'un bâtiment : porteur, bûcheron, forestier, fermier. */
function isLaborer(mobile: Mobile): mobile is Laborer {
  return mobile.kind === 'worker' || mobile.kind === 'lumberjack' || mobile.kind === 'forester' || mobile.kind === 'farmer';
}

/**
 * Un ouvrier de la colonie sur la carte — libre, porteur, logisticien,
 * bâtisseur, bûcheron, forestier, fermier — : il compte dans `World.colonists`. Un
 * ex-mutant ou un survivant porte en plus d'eux.
 */
function isColonist(mobile: Mobile): mobile is Laborer {
  if (mobile.kind === 'lumberjack' || mobile.kind === 'forester' || mobile.kind === 'farmer') return true;
  return mobile.kind === 'worker' && !mobile.exMutant && !mobile.grown && !mobile.survivor;
}

/** Les bâtiments dont les ouvriers vivent sur la carte : porteurs, logisticiens, bâtisseurs, bûcherons, forestier, fermiers. */
function hasCrew(kind: BuildingKind): boolean {
  return kind === 'house' || kind === 'depot' || kind === 'yard' || kind === 'lumberCamp' || kind === 'foresterHouse' || kind === 'farm';
}

/** Ce qu'un humain garde en changeant de métier : son id — donc son prénom —, son sexe, sa place, son âge, ses jauges, son lit. */
type Person = Pick<Worker, 'id' | 'sex' | 'trait' | 'alias' | 'x' | 'y' | 'prevX' | 'prevY' | 'facing' | 'moving' | 'age' | 'needs' | 'meal' | 'happiness' | 'bed' | 'sleepingOut'>;

function personOf({ id, sex, trait, alias, x, y, prevX, prevY, facing, moving, age, needs, meal, happiness, bed, sleepingOut }: Laborer): Person {
  return { id, sex, ...bornOf({ trait, alias }), x, y, prevX, prevY, facing, moving, age, needs, meal, happiness, bed, sleepingOut };
}

/** Son trait et le nom que le joueur lui a donné, s'il en a : ce qu'il garde en changeant de métier. */
function bornOf({ trait, alias }: Pick<Born, 'trait' | 'alias'>): Pick<Born, 'trait' | 'alias'> {
  return { ...(trait !== undefined && { trait }), ...(alias !== undefined && { alias }) };
}

/** Un ouvrier libre, là où il se tient : il ira flâner devant la mairie `hallId`. */
function freeWorker(person: Person, hallId: EntityId): Worker {
  return {
    kind: 'worker',
    ...person,
    homeId: hallId,
    exMutant: false,
    grown: false,
    logistician: false,
    builder: false,
    survivor: false,
    free: true,
    build: null,
    inside: false,
    job: null,
    searchTicks: PORTERS.retryTicks,
    ...wanderFrom(person.x, person.y),
  };
}

/** La place du `i`-ième ouvrier qui arrive libre : deux rangs de cinq devant la mairie, dans la clairière du départ. */
function colonistSpot(hall: { tx: number; ty: number; width: number; height: number }, i: number): { x: number; y: number } {
  const slot = i % 10;

  return {
    x: (hall.tx - 1 + (slot % 5) + 0.5) * TILE_SIZE,
    y: (hall.ty + hall.height + Math.floor(slot / 5) + 0.5) * TILE_SIZE,
  };
}

/** Vrai pour un bâtiment de l'usine : une vague peut le viser. */
function isWaveTarget(proto: BuildingId): boolean {
  return (WAVES.targets as readonly BuildingId[]).includes(proto);
}

/** Objets `REPAIR.item` qu'il faut pour remettre un bâtiment à neuf. */
/** La tuile au centre de l'emprise : d'où un bâtiment voit. */
function centerTile(entity: Entity): TileCoord {
  return { tx: entity.tx + floorDiv(entity.width, 2), ty: entity.ty + floorDiv(entity.height, 2) };
}

/** Un habitant dehors voit autour de lui : porteur, bûcheron, forestier, Ève une fois descendue de vélo. */
function seesAround(mobile: Mobile): boolean {
  switch (mobile.kind) {
    case 'worker':
    case 'lumberjack':
    case 'forester':
      return !mobile.inside;
    case 'eve':
      return mobile.state !== 'arriving';
    default:
      return false;
  }
}

export function repairCost(building: Building): number {
  return Math.ceil(Math.max(0, buildingLevel(building.proto, building.level).hp - building.hp) / REPAIR.hp);
}

/** Ce qu'il manque encore à un chantier, tous objets confondus. */
export function siteMissing(site: Site): number {
  let missing = 0;

  for (const [item, needed] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) {
    missing += Math.max(0, needed - (site.delivered[item] ?? 0));
  }
  return missing;
}

/** La recette d'une carrière ou d'un puits, trouvée par son id : la taille, le puisage. */
function quarryRecipe(producer: Quarry): RecipeProto {
  return recipeOf(producer.proto) ?? RECIPES.cutStone;
}

function amountsOf(amounts: RecipeProto['inputs']): [ItemId, number][] {
  return Object.entries(amounts) as [ItemId, number][];
}

function inputItems(recipe: RecipeProto): ItemId[] {
  return amountsOf(recipe.inputs).map(([item]) => item);
}

function totalOf(amounts: RecipeProto['inputs']): number {
  return amountsOf(amounts).reduce((total, [, amount]) => total + amount, 0);
}

/** Le coffre contient-il toutes les entrées de la recette ? */
function hasInputs(store: Store, recipe: RecipeProto): boolean {
  return amountsOf(recipe.inputs).every(([item, amount]) => store.count(item) >= amount);
}

/** Toutes les entrées, et la place pour les sorties une fois les entrées consommées. */
function canCraft(store: Store, recipe: RecipeProto): boolean {
  return hasInputs(store, recipe) && store.freeSpace() + totalOf(recipe.inputs) >= totalOf(recipe.outputs);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Le centre de l'emprise d'un bâtiment, en pixels monde : ce que vise la Reine qui le chasse. */
function footprintCenter(entity: { tx: number; ty: number; width: number; height: number }): { x: number; y: number } {
  return { x: (entity.tx + entity.width / 2) * TILE_SIZE, y: (entity.ty + entity.height / 2) * TILE_SIZE };
}

/** La clé d'un emplacement payé en Prestige : le bâtiment et le coin de son emprise. */
function prestigeKey(entity: { proto: BuildingId; tx: number; ty: number }): string {
  return `${entity.proto}@${entity.tx},${entity.ty}`;
}

/**
 * Ce que « Déposer » ou « Jeter » prend au sac : tout, un seul objet, ou
 * `amount` unités au plus de cet objet. Une quantité nulle ne prend rien.
 */
function bagPart(entries: [ItemId, number][], only?: ItemId, amount?: number): [ItemId, number][] {
  return entries
    .filter(([item]) => only === undefined || item === only)
    .map(([item, count]): [ItemId, number] => [item, amount === undefined ? count : Math.min(count, Math.max(0, Math.floor(amount)))])
    .filter(([, count]) => count > 0);
}

/** Un joueur tel que la sauvegarde le range : son sac en données. */
function savePlayer(player: Player): SavedPlayer {
  const { inventory, look, wardrobe, unseenPieces, ...rest } = player;

  return { ...rest, look: copyLook(look), wardrobe: [...wardrobe], unseenPieces: [...unseenPieces], inventory: inventory.toJSON() };
}

/** L'ami d'une sauvegarde — ou d'une image envoyée par l'hôte. */
function restorePartner(saved: SavedPartner): Partner {
  const { inventory, ...player } = saved.player;

  return {
    ...saved,
    player: {
      ...player,
      look: copyLook(player.look),
      wardrobe: [...player.wardrobe],
      unseenPieces: [...player.unseenPieces],
      inventory: Store.fromJSON(INVENTORY_CAPACITY, inventory),
    },
  };
}
