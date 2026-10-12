/**
 * Sprites — le registre.
 *
 * Un sprite est un **module de `src/art/`** qui construit son SVG avec les
 * helpers de `data/artDirection.ts`. Il n'y a plus de planche d'images : un
 * sprite se découpe en **morceaux** (`parts`), chacun un SVG complet du même
 * cadre, que le rendu superpose et anime par transformation — rotation,
 * rebond, écrasement. Un personnage a un corps par direction et un pied ; un
 * bâtiment, son chantier, sa version finie et sa version endommagée ; une
 * foreuse, en plus, la roue qui tourne.
 *
 * `render/spriteLibrary.ts` rastérise chaque morceau **une fois**, au
 * chargement, à la résolution de l'écran, dans un atlas partagé. Le reste du
 * rendu ne manipule que des textures.
 *
 * Toutes les tailles sont en **pixels monde** : une tuile fait 32 px.
 */

import { ADAM } from '../art/adam.ts';
import { ALERT } from '../art/alert.ts';
import { ANTENNA, ANTENNA_2, ANTENNA_3 } from '../art/antenna.ts';
import { ARROW } from '../art/arrow.ts';
import { ARCHER, HEALER, WARRIOR } from '../art/companions.ts';
import { BARRACKS } from '../art/barracks.ts';
import { BUILDER } from '../art/builder.ts';
import { BUILDER_HOUSE } from '../art/builderHouse.ts';
import { CARAVAN_SPRITE } from '../art/caravan.ts';
import { CARGO_BIKE } from '../art/cargoBike.ts';
import { CLINIC_SPRITE } from '../art/clinic.ts';
import { PURIFIER_SPRITE } from '../art/purifier.ts';
import { CONSTRUCTION_POST } from '../art/constructionPost.ts';
import { CRAB } from '../art/crab.ts';
import { CRACK } from '../art/crack.ts';
import { DECOR_ART } from '../art/decor.ts';
import { DRILL } from '../art/drill.ts';
import { ENEMY_BASE_SPRITE } from '../art/enemyBase.ts';
import { EX_MUTANT_SPRITE } from '../art/exMutant.ts';
import { EVE_SPRITE } from '../art/eve.ts';
import { FARM } from '../art/farm.ts';
import { FARMER } from '../art/farmer.ts';
import { FORESTER } from '../art/forester.ts';
import { FORESTER_HOUSE } from '../art/foresterHouse.ts';
import { CHARCOAL_KILN } from '../art/charcoalKiln.ts';
import { FORGE } from '../art/forge.ts';
import { JOBS } from '../art/jobs.ts';
import { KID } from '../art/kid.ts';
import { LAB } from '../art/lab.ts';
import { LOGISTICIAN } from '../art/logistician.ts';
import { LOGISTICS_POST } from '../art/logisticsPost.ts';
import { LOOT } from '../art/loot.ts';
import { CHEST } from '../art/chest.ts';
import { LUMBER_CAMP } from '../art/lumberCamp.ts';
import { HUNGRY } from '../art/hungry.ts';
import { JOYFUL, SCARED, SLEEPY } from '../art/reactions.ts';
import { THIRSTY } from '../art/thirsty.ts';
import { UNHAPPY } from '../art/unhappy.ts';
import { SLEEPER } from '../art/sleeper.ts';
import { HOME } from '../art/home.ts';
import { LUMBERJACK } from '../art/lumberjack.ts';
import { MUTANT } from '../art/mutant.ts';
import { NURSERY } from '../art/nursery.ts';
import { PATIENT } from '../art/patient.ts';
import { DUST_RING, PARTICLE_FX } from '../art/particles.ts';
import { PAUSED } from '../art/paused.ts';
import { PRIORITY } from '../art/priority.ts';
import { QUARRY } from '../art/quarry.ts';
import { WELL } from '../art/well.ts';
import { QUEEN_SPRITE } from '../art/queen.ts';
import { PUDDLE } from '../art/puddle.ts';
import { ROCK_COAL, ROCK_IRON, ROCK_STONE } from '../art/rocks.ts';
import { SAPLING_SPRITE } from '../art/sapling.ts';
import { CROP_SPRITE } from '../art/crops.ts';
import { TARGET } from '../art/target.ts';
import { TOWN_HALL } from '../art/townHall.ts';
import { TREE, TREE_DEAD, TREE_PINE } from '../art/trees.ts';
import { REINFORCED_TOWER, WATCHTOWER } from '../art/watchtower.ts';
import { RAINBOW, WEATHER_FX } from '../art/weather.ts';
import { WOLF } from '../art/wolf.ts';
import { GUARDIAN } from '../art/guardian.ts';
import { CHIEF_SPRITE } from '../art/chief.ts';
import { FIREBALL_SPRITE } from '../art/fireball.ts';
import { SLAM_MARK, SPIT_SPRITE, SPITTER_SPRITE } from '../art/spitter.ts';
import { WORKER } from '../art/worker.ts';

export interface SpriteProto {
  /** Cadre commun à tous les morceaux, en pixels monde. */
  width: number;
  height: number;
  /** Ancre dans [0, 1] : (0.5, 0.8) = les pieds d'un personnage au point de position. */
  anchorX: number;
  anchorY: number;
  /** Un SVG complet par morceau, tous du cadre `width × height`. */
  parts: Record<string, string>;
  /**
   * Point autour duquel un morceau tourne ou s'écrase, en pixels du cadre.
   * Absent : l'ancre du sprite.
   */
  pivots?: Record<string, readonly [number, number]>;
}

export const SPRITES = {
  adam: ADAM,
  eve: EVE_SPRITE,
  cargoBike: CARGO_BIKE,
  /** La caravane de troc : la charrette, son marchand, et la roue qui tourne. */
  caravan: CARAVAN_SPRITE,
  mutant: MUTANT,
  /** La Reine des flaques : trois tuiles sur trois, couronne de bulles. */
  queen: QUEEN_SPRITE,
  kid: KID,
  worker: WORKER,
  /** Un bûcheron : chemise à carreaux, barbe, et sa hache, qui s'abat à chaque coup. */
  lumberjack: LUMBERJACK,
  /** Un forestier : chapeau de paille, tablier menthe, et sa bêche, qui s'enfonce à chaque coup. */
  forester: FORESTER,
  /** Un fermier : chapeau de paille au ruban corail, salopette cyan, panier d'épis, et sa binette, qui gratte la terre à chaque coup. */
  farmer: FARMER,
  /** Un logisticien : caisse sur le dos, casquette cyan ; la charge dépasse de la caisse. */
  logistician: LOGISTICIAN,
  /** Un bâtisseur : casque jaune, ceinture à outils, et son marteau, qui s'abat à chaque coup. */
  builder: BUILDER,
  /** Les compagnons d'Adam : le guerrier (casque, bouclier, épée), l'archer (capuchon, carquois, arc) et le soigneur (surplis blanc, croix menthe). */
  warrior: WARRIOR,
  archer: ARCHER,
  healer: HEALER,
  /** Un mutant assommé, puis qui suit Adam jusqu'à la clinique. */
  patient: PATIENT,
  /** Un mutant guéri : un habitant, porteur, avec sa touffe fluo. */
  exMutant: EX_MUTANT_SPRITE,
  crab: CRAB,
  wolf: WOLF,
  /** Le gardien d'une base mutante : seau de ruine sur la tête, couvercle pour bouclier. */
  guardian: GUARDIAN,
  /** Le cracheur d'une base : jabot de gelée, lunettes de piscine violettes. */
  spitter: SPITTER_SPRITE,
  /** Le chef d'une base : cône de chantier en couronne, épaulière de bidon, massue de béton. */
  chief: CHIEF_SPRITE,
  /** La boule de feu d'une base, en vol, sa traînée et la lueur qu'elle charge. */
  fireball: FIREBALL_SPRITE,
  /** Le crachat du cracheur, en vol, et une goutte de sa traînée. */
  spit: SPIT_SPRITE,
  /** Le cercle corail du coup de zone du chef, et le disque qui s'y remplit. */
  slamMark: SLAM_MARK,
  arrow: ARROW,
  target: TARGET,
  /** Bulles d'alerte au-dessus d'un producteur arrêté par un problème : coffre plein, ouvrier manquant. */
  alert: ALERT,
  /** Bulle « en pause » au-dessus d'un producteur que le joueur a arrêté. */
  paused: PAUSED,
  /** Pastille de priorité de travail au coin d'un bâtiment sorti de Moyenne : flèche haute ou basse. */
  priority: PRIORITY,
  /** Bulle « affamé » au-dessus d'un habitant à court de nourriture. */
  hungry: HUNGRY,
  /** Bulle « assoiffé » au-dessus d'un habitant à court d'eau. */
  thirsty: THIRSTY,
  /** Bulle « malheureux » au-dessus d'un habitant qui a trop dormi dehors. */
  unhappy: UNHAPPY,
  /** Bulles de réaction, rares et brèves : la peur d'un ennemi tout près, la joie d'une naissance, la fatigue de la nuit. */
  scared: SCARED,
  joyful: JOYFUL,
  sleepy: SLEEPY,
  /** Un habitant qui dort dehors, faute de lit : allongé sous sa couverture. */
  sleeper: SLEEPER,
  /** La fissure d'un bâtiment sous la moitié de ses points de vie. */
  crack: CRACK,
  /** La flaque d'où sortent les mutants d'une vague. */
  puddle: PUDDLE,
  /** Le butin qu'ils lâchent : un morceau par objet. */
  loot: LOOT,
  /** Un coffre de la carte : fermé, puis ouvert (caisse, couvercle relevé, gerbe de lumière). */
  chest: CHEST,
  /** Le médaillon du métier de chaque bâtiment, sur sa pancarte : un morceau par bâtiment. */
  jobs: JOBS,
  /** La base mutante, et le badge de ses assaillants en réserve (`sign0` à `sign9`). */
  enemyBase: ENEMY_BASE_SPRITE,

  tree: TREE,
  treePine: TREE_PINE,
  treeDead: TREE_DEAD,
  /** Un arbre du forestier qui pousse : `sprout`, puis `young` ; adulte, il prend le sprite d'un arbre. */
  sapling: SAPLING_SPRITE,
  /** Une case du champ d'une ferme : `sown`, `growing`, puis `ripe`, à récolter. */
  crop: CROP_SPRITE,
  rockIron: ROCK_IRON,
  rockCoal: ROCK_COAL,
  rockStone: ROCK_STONE,

  townHall: TOWN_HALL,
  drill: DRILL,
  nursery: NURSERY,
  builderHouse: BUILDER_HOUSE,
  home: HOME,
  farm: FARM,
  watchtower: WATCHTOWER,
  forge: FORGE,
  charcoalKiln: CHARCOAL_KILN,
  reinforcedTower: REINFORCED_TOWER,
  clinic: CLINIC_SPRITE,
  purifier: PURIFIER_SPRITE,
  barracks: BARRACKS,
  lab: LAB,
  lumberCamp: LUMBER_CAMP,
  foresterHouse: FORESTER_HOUSE,
  quarry: QUARRY,
  well: WELL,
  logisticsPost: LOGISTICS_POST,
  constructionPost: CONSTRUCTION_POST,
  /** L'Antenne, étage par étage ; l'émetteur a aussi sa version allumée (`lit`), après le Signal. */
  antenna: ANTENNA,
  antenna2: ANTENNA_2,
  antenna3: ANTENNA_3,

  /** Décor de surface : un morceau par élément, cf. `data/decor.ts`. */
  decor: DECOR_ART,

  /** Météo : gouttes, vent, brouillard, fleurs, et l'arc-en-ciel — cf. `data/weather.ts`. */
  weather: WEATHER_FX,
  rainbow: RAINBOW,

  /** Particules : une silhouette blanche par forme, teintée au rendu — cf. `PARTICLES` de `data/artDirection.ts`. */
  particles: PARTICLE_FX,
  /** L'anneau de poussière d'un bâtiment qui s'achève. */
  dustRing: DUST_RING,
} satisfies Record<string, SpriteProto>;

export type SpriteId = keyof typeof SPRITES;

export const SPRITE_IDS = Object.keys(SPRITES) as SpriteId[];

/** Noms de morceaux valides pour un sprite donné. */
export type PartOf<S extends SpriteId> = keyof (typeof SPRITES)[S]['parts'] & string;

/** Les morceaux qu'un marcheur (Adam, Ève, mutant, enfant, ouvrier, logisticien, bâtisseur, bûcheron, forestier, patient, ex-mutant) doit fournir. */
export const WALKER_PARTS = ['down', 'up', 'side', 'foot'] as const;

/** Les morceaux qu'un bâtiment doit fournir. */
export const BUILDING_PARTS = ['site', 'built', 'damaged'] as const;

/** Ceux d'un niveau d'amélioration : il n'a pas de chantier, le bâtiment change sur place. */
export const UPGRADE_PARTS = ['built', 'damaged'] as const;

/** Les morceaux qu'une ressource de surface doit fournir. */
export const RESOURCE_PARTS = ['full', 'damaged'] as const;
