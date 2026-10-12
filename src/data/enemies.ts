/**
 * Ennemis — contenu pur.
 *
 * Un mutant est un mobile : il se déplace à chaque tick, contrairement aux
 * bâtiments qui dorment entre deux réveils. Il n'a qu'une idée, la cible de
 * sa vague — la mairie, ou un bâtiment de l'usine (`WAVES.targets`) — et
 * qu'un comportement : marcher droit dessus, et casser ce qui le bloque.
 *
 * Les vitesses sont en tuiles par seconde, les durées en ticks (20 par
 * seconde), les dégâts en points de vie de bâtiment.
 */

import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';
import type { SpriteId } from './sprites.ts';

export interface EnemyProto {
  label: string;
  /** Points de vie : une flèche d'arc en retire `WEAPONS.*.damage`. */
  hp: number;
  /** Tuiles par seconde. */
  speed: number;
  /** Dégâts infligés au bâtiment heurté, tous les `attackTicks`. */
  damage: number;
  attackTicks: number;
  sprite: SpriteId;
  /** Taille du sprite à l'écran : 1 pour un mutant ordinaire. */
  scale: number;
  /** Demi-largeur et demi-hauteur de la boîte de collision, en pixels monde. */
  halfW: number;
  halfH: number;
  /** Ce qu'il lâche au sol en tombant (`LOOT_DROPS`). */
  loot: LootTable;
  /** Vrai s'il peut tomber assommé plutôt que s'évaporer, une clinique ayant une place (`data/clinic.ts`). */
  stunnable: boolean;
  /** Son âge à l'apparition, en années, tiré entre ces bornes (`foeAge`) ; il prend un an à chaque aube. */
  age: AgeRange;
}

/** Des bornes d'âge, en années, comprises. */
export interface AgeRange {
  min: number;
  max: number;
}

export const ENEMIES = {
  mutant: {
    label: 'Mutant radioactif',
    hp: 3,
    speed: 1.2,
    damage: 4,
    attackTicks: 20,
    sprite: 'mutant',
    scale: 1,
    halfW: 8,
    halfH: 6,
    // De la ferraille à coup sûr, parfois un bout de charbon, rarement une plaque encore droite.
    loot: [
      { item: 'ironOre', min: 1, max: 2, chance: 1 },
      { item: 'coal', min: 1, max: 1, chance: 0.35 },
      { item: 'ironPlate', min: 1, max: 1, chance: 0.08 },
      // Une noix de gelée fluo : le labo en fait des merveilles.
      { item: 'mutantGoo', min: 1, max: 1, chance: 0.5 },
    ],
    stunnable: true,
    age: { min: 18, max: 60 },
  },
  /**
   * Le « boss » des nuits spéciales : un mutant qui a trop poussé. Lent,
   * coriace, il cogne fort — c'est lui que les tours doivent user avant
   * qu'il atteigne la mairie.
   */
  brute: {
    label: 'Gros mutant',
    hp: 10,
    speed: 0.8,
    damage: 8,
    attackTicks: 24,
    sprite: 'mutant',
    scale: 1.5,
    halfW: 12,
    halfH: 8,
    // Plus gros, plus de ferraille, et sa gelée à coup sûr.
    loot: [
      { item: 'ironOre', min: 3, max: 5, chance: 1 },
      { item: 'coal', min: 1, max: 2, chance: 0.6 },
      { item: 'ironPlate', min: 1, max: 1, chance: 0.3 },
      { item: 'mutantGoo', min: 1, max: 2, chance: 1 },
    ],
    stunnable: true,
    age: { min: 25, max: 70 },
  },
  /**
   * La Reine des flaques : le rendez-vous des grosses nuits (`QUEEN`). Les
   * points de vie de vingt mutants — assez pour qu'une tour seule ne l'use
   * pas avant qu'elle l'atteigne (`defense.test.ts`) —, plus lente qu'eux,
   * elle cogne de quoi raser une tour en cinq coups. Jamais assommée.
   */
  queen: {
    label: 'Reine des flaques',
    hp: 60,
    speed: 0.72,
    damage: 12,
    attackTicks: 20,
    sprite: 'queen',
    scale: 1,
    // Ses pieds : une tuile de large au plus, comme tout ennemi (`validatePrototypes`).
    halfW: 15,
    halfH: 12,
    // Son cœur, qu'on ne trouve nulle part ailleurs, et les plaques qu'elle a avalées.
    loot: [
      { item: 'radCore', min: 1, max: 1, chance: 1 },
      { item: 'ironPlate', min: 1, max: 3, chance: 1 },
    ],
    stunnable: false,
    age: { min: 90, max: 140 },
  },
  /**
   * La larve que pond la Reine : un petit mutant rapide et fragile, qui
   * occupe les arcs pendant que sa mère avance. Trop jeune pour la clinique.
   */
  larva: {
    label: 'Larve de flaque',
    hp: 1,
    speed: 2.2,
    damage: 2,
    attackTicks: 16,
    sprite: 'mutant',
    scale: 0.6,
    halfW: 6,
    halfH: 4,
    // Un bout de ferraille avalé, parfois une noix de gelée.
    loot: [
      { item: 'ironOre', min: 1, max: 1, chance: 1 },
      { item: 'mutantGoo', min: 1, max: 1, chance: 0.25 },
    ],
    stunnable: false,
    age: { min: 0, max: 0 },
  },
} as const satisfies Record<string, EnemyProto>;

export type EnemyId = keyof typeof ENEMIES;

/** Les espèces, dans l'ordre où une base les fait sortir (la larve n'y est jamais : la Reine la pond). */
export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];

/** Des mutants : un effectif par espèce. */
export type WaveSpec = Partial<Record<EnemyId, number>>;

/**
 * Les vagues.
 *
 * Rien n'attaque tant que la mairie est en chantier : le joueur apprend à
 * récolter et à livrer en paix. Une fois le toit posé, le cycle jour / nuit
 * démarre (`data/dayNight.ts`). Le jour, les bases mutantes produisent leurs
 * assaillants (`RAIDS`, `data/enemyBases.ts`) ; la nuit tombée, elles les
 * lâchent tous d'un coup : c'est **la** vague de la nuit (`perNight`), qui
 * sort `firstAt` après la tombée. Chaque assaillant passe la porte de sa
 * base, l'un après l'autre, et marche sur la ville. Rien ne sort d'ailleurs :
 * sans base debout, la nuit est calme. Les gros mutants et la Reine
 * (`NIGHT_BOSSES`) sortent de la base la plus proche de la mairie.
 *
 * Un mutant sort de sa flaque en `emergeTicks` : ni les arcs ni les tours ne
 * le visent tant qu'il n'est pas debout.
 *
 * Une vague a **une** cible, tirée à son annonce : avec `targetChance`,
 * chaque base envoie les siens sur le bâtiment de `targets` fini le plus
 * proche d'elle — la foreuse isolée, la ferme au bout du champ —, sinon tous
 * vont à la mairie. L'usine se défend donc aussi : c'est là que le placement
 * des tours compte.
 */
export const WAVES = {
  perNight: 1,
  /** Ticks entre la tombée de la nuit et la sortie des bases. */
  firstAt: 0,
  /** Ticks entre deux vagues d'une même nuit, s'il y en avait plusieurs. */
  interval: 20 * 30,
  /** Au-delà de `NIGHT_BOSSES`, ses `cycle` dernières nuits se répètent. */
  cycle: 5,
  /** Ticks passés à sortir de la flaque, immobile et hors d'atteinte. */
  emergeTicks: 40,
  /** Chance qu'une vague vise l'usine plutôt que la mairie. */
  targetChance: 0.5,
  /** Ce qu'une vague peut viser hors de la mairie : les bâtiments qui produisent. */
  targets: ['drill', 'farm', 'quarry', 'lumberCamp', 'forge'] as const satisfies readonly BuildingId[],
} as const;

/**
 * La Reine des flaques, nuit par nuit et phase par phase.
 *
 * Elle sort d'une base une nuit sur cinq à partir de la dixième —
 * c'est `NIGHT_BOSSES` qui la place, et son cycle qui la ramène aux nuits 15,
 * 20… La nuit 5 garde son gros mutant d'initiation. Ève l'annonce la veille,
 * au crépuscule ; le soir venu, le bandeau compte jusqu'à sa sortie.
 *
 * - Phase 1, jusqu'à la moitié de ses points de vie : elle marche sur la
 *   mairie et pond `brood` larves toutes les `layTicks`.
 * - Phase 2, sous `enrageRatio` : elle s'enfouit `burrowTicks`, ressort à
 *   `surfaceDistance` tuiles de la tour la plus proche et la charge, à
 *   `chargePace` fois son pas, pour la frapper ; la tour tombée, elle
 *   replonge vers la suivante. Une tour seule ne se défend pas : il faut des
 *   tours qui se couvrent entre elles.
 *
 * À l'aube, vivante, elle repart avec les autres.
 */
export const QUEEN = {
  /** Ticks entre deux pontes, en phase 1. */
  layTicks: 20 * 8,
  /** Larves par ponte. */
  brood: 2,
  /** Ticks qu'une larve met à sortir de terre, à côté de sa mère. */
  larvaEmergeTicks: 12,
  /** Sous cette part de ses points de vie, la phase 2 commence. */
  enrageRatio: 0.5,
  /** Ticks passés sous terre avant de ressortir près d'une tour : ni visible ni visable. */
  burrowTicks: 20 * 3,
  /** Distance, en tuiles, entre le centre de la tour visée et le point où elle ressort. */
  surfaceDistance: 4,
  /**
   * En phase 2, elle charge la tour à ce multiple de son pas : elle vient de
   * loin, de sa base — à son pas de marche, elle n'atteindrait la tour
   * qu'avec le jour.
   */
  chargePace: 2,
} as const;

/* ------------------------------------------------------------------ butin */

/**
 * Une ligne d'une table de butin : avec la probabilité `chance`, l'ennemi
 * lâche entre `min` et `max` exemplaires de `item`, bornes comprises.
 */
export interface LootEntry {
  item: ItemId;
  min: number;
  max: number;
  /** Entre 0 (exclu) et 1 : 1, c'est à chaque fois. */
  chance: number;
}

/** Chaque ligne se tire à part : un ennemi peut tout lâcher d'un coup. */
export type LootTable = readonly LootEntry[];

/**
 * Le butin au sol : tout ennemi abattu — mutant, crabe, loup — lâche sa
 * table là où il tombe, un objet par exemplaire, et Adam le ramasse en
 * marchant dessus. Surtout des matériaux que la colonie connaît déjà — de
 * quoi faire rapporter le combat sans remplacer la récolte — et, parfois, un
 * trophée propre à chaque ennemi (gelée, croc, pince) que seul le labo de
 * recherche sait employer (`data/research.ts`).
 *
 * Sac plein, le butin reste au sol : il n'est ni perdu ni avalé. Oublié, il
 * disparaît au bout de `lifetimeTicks` ; au-delà de `cap` objets au sol, le
 * plus ancien s'efface pour laisser tomber le nouveau.
 */
export const LOOT_DROPS = {
  /** Ticks avant qu'un butin oublié ne disparaisse. */
  lifetimeTicks: 20 * 180,
  /** Distance, en tuiles, à laquelle Adam le ramasse. */
  pickupRadius: 0.8,
  /** Distance, en tuiles, à laquelle il glisse vers Adam — s'il a de la place dans le sac. */
  magnetRadius: 1.8,
  /** Tuiles par seconde en glissant vers lui. */
  magnetSpeed: 6,
  /** Écart maximal, en tuiles, entre deux objets lâchés par le même ennemi. */
  scatter: 0.35,
  /** Objets au sol, au plus, toutes origines confondues. */
  cap: 40,
} as const;

/**
 * Les chefs, nuit par nuit — le nombre d'assaillants, lui, vient des bases
 * (`RAIDS`). Une ligne par nuit : un gros mutant à la nuit 5, puis à la 8 ;
 * la Reine des flaques à la 10. Au-delà, les `WAVES.cycle` dernières nuits se
 * répètent : un gros mutant toutes les cinq nuits, la Reine aux nuits 15,
 * 20… Ils sortent de la base debout la plus proche de la mairie.
 */
export const NIGHT_BOSSES = [
  {},
  {},
  {},
  {},
  /** Premier gros mutant. */
  { brute: 1 },
  {},
  {},
  /** Un gros mutant de plus. */
  { brute: 1 },
  {},
  /** La Reine des flaques : sans tours qui se couvrent, elle en rase une. */
  { queen: 1 },
] as const satisfies readonly WaveSpec[];

/** Les chefs qui sortent la nuit numéro `night` (la première vaut 1). */
export function nightBosses(night: number): WaveSpec {
  const index = Math.max(0, night - 1);

  if (index < NIGHT_BOSSES.length) return NIGHT_BOSSES[index]!;

  const past = index - NIGHT_BOSSES.length;

  return NIGHT_BOSSES[NIGHT_BOSSES.length - WAVES.cycle + (past % WAVES.cycle)]!;
}

/** Vrai si la nuit amène un gros mutant ou la Reine : le bandeau l'annonce autrement. */
export function isBossNight(night: number): boolean {
  const spec = nightBosses(night);

  return (spec.brute ?? 0) > 0 || (spec.queen ?? 0) > 0;
}

/** Vrai si la Reine des flaques sort cette nuit. */
export function isQueenNight(night: number): boolean {
  return (nightBosses(night).queen ?? 0) > 0;
}

/** La vague de la nuit `night` que mène la Reine, ou `null` si elle ne sort pas cette nuit-là. */
export function queenWave(night: number): number | null {
  return isQueenNight(night) ? WAVES.perNight : null;
}

/* ------------------------------------------------------------------ faune */

/**
 * La faune sauvage — une menace en plus des mutants, pas à leur place.
 *
 * Elle ne vise pas la mairie : chaque bête vit autour de sa **tanière**, un
 * point tiré de la seed dans un chunk, sur le terrain qui lui convient. Elle
 * y flâne, charge Adam s'il entre dans son rayon d'aggro, et rentre quand il
 * s'éloigne ou qu'elle s'est trop écartée de chez elle. L'arc d'Adam la vise
 * comme un mutant ; les tours de guet, non : elle ne menace pas le village.
 *
 * - `shore` : le sable, le long de l'eau. Un crabe ne le quitte jamais.
 * - `forest` : le cœur des massifs d'arbres. Un loup en sort pour charger,
 *   jamais bien loin.
 * - `base` : la zone d'une base mutante. Ses gardiens (le gardien, le
 *   cracheur et le chef) n'ont pas de tanière
 *   tirée de la seed (`densPerChunk` nul) : c'est la base qui les loge et les
 *   refait (`data/enemyBases.ts`). Ils chargent Adam dès qu'il entre dans
 *   leur laisse, et n'en sortent jamais, même en chargeant.
 * - `region` : le repaire du gardien d'une région à conquérir
 *   (`data/regions.ts`). Pas de tanière non plus : la région le loge, il
 *   tient sa laisse comme un gardien de base, et sa mort conquiert la région.
 */
export type Habitat = 'shore' | 'forest' | 'base' | 'region';

export interface WildlifeProto {
  label: string;
  hp: number;
  /** Tuiles par seconde en flânant, et en chargeant. */
  speed: number;
  chargeSpeed: number;
  /** Points de vie retirés à Adam par coup, tous les `attackTicks`. */
  damage: number;
  attackTicks: number;
  /** Distance, en tuiles, à laquelle la bête repère Adam et charge. */
  aggroRadius: number;
  /** Au-delà de cette distance à Adam, en tuiles, elle lâche la poursuite. */
  giveUpRadius: number;
  /** Distance maximale à la tanière, en tuiles : au-delà, elle rentre. */
  leashRadius: number;
  habitat: Habitat;
  /**
   * Vrai si la bête se faufile entre les arbres et les rochers, comme un
   * mutant ; l'eau et le bâti l'arrêtent toujours. Sans ça, un loup qui
   * charge dans une forêt dense reste coincé contre le premier tronc.
   */
  throughTrees: boolean;
  /** Tirages de tanière par chunk : plus il y en a, plus l'espèce est dense. */
  densPerChunk: number;
  /** Effectif d'une tanière, bornes comprises. */
  groupMin: number;
  groupMax: number;
  /** Ticks avant qu'une tanière vidée par l'arc se repeuple. */
  respawnTicks: number;
  /** Ce qu'elle lâche au sol quand l'arc l'abat (`LOOT_DROPS`). */
  loot: LootTable;
  sprite: SpriteId;
  /** Taille du sprite à l'écran : 1 pour une bête ordinaire, plus pour le gardien d'une région. */
  scale: number;
  halfW: number;
  halfH: number;
  /** Son âge à l'apparition, en années, comme un mutant. */
  age: AgeRange;
}

export const WILDLIFE = {
  /** Faibles et nombreux : ils pincent qui marche sur leur plage. */
  crab: {
    label: 'Crabe des ruines',
    hp: 1,
    speed: 1.1,
    chargeSpeed: 2.2,
    damage: 1,
    attackTicks: 16,
    aggroRadius: 2,
    giveUpRadius: 4,
    leashRadius: 5,
    habitat: 'shore',
    throughTrees: false,
    densPerChunk: 10,
    groupMin: 2,
    groupMax: 3,
    respawnTicks: 20 * 90,
    // Une pince à griller, et parfois la pince elle-même, bonne pour le labo.
    loot: [
      { item: 'meat', min: 1, max: 1, chance: 1 },
      { item: 'crabClaw', min: 1, max: 1, chance: 0.4 },
    ],
    sprite: 'crab',
    scale: 1,
    halfW: 8,
    halfH: 5,
    age: { min: 1, max: 6 },
  },
  /** Des meutes de deux ou trois, rapides et coriaces, au fond des bois. */
  wolf: {
    label: 'Loup indigo',
    hp: 4,
    speed: 1.6,
    chargeSpeed: 4,
    damage: 2,
    attackTicks: 20,
    aggroRadius: 5,
    giveUpRadius: 8,
    leashRadius: 9,
    habitat: 'forest',
    throughTrees: true,
    densPerChunk: 3,
    groupMin: 2,
    groupMax: 3,
    respawnTicks: 20 * 180,
    // Plus de viande qu'un crabe, et parfois le collier de ferraille d'un ancien chien.
    loot: [
      { item: 'meat', min: 2, max: 3, chance: 1 },
      { item: 'ironOre', min: 1, max: 1, chance: 0.2 },
      { item: 'wolfFang', min: 1, max: 1, chance: 0.5 },
    ],
    sprite: 'wolf',
    scale: 1,
    halfW: 9,
    halfH: 6,
    age: { min: 1, max: 9 },
  },
  /**
   * Le gardien d'une base mutante : un mutant trapu casqué d'un seau de
   * ruine, son couvercle pour bouclier. Il ne part jamais en vague : il tient
   * la zone de sa base (`leashRadius`, sous la plus petite zone), charge Adam
   * qui y entre, et le lâche dès qu'il en sort.
   */
  guardian: {
    label: 'Gardien de base',
    hp: 5,
    speed: 0.7,
    chargeSpeed: 1.9,
    damage: 2,
    attackTicks: 24,
    // Comptés depuis le centre de sa base, pas depuis lui : il charge qui entre dans la zone qu'il tient,
    // le lâche qui en sort, et sa laisse est un mur (`stepBeast`) — sous la plus petite zone, 8 tuiles.
    aggroRadius: 7,
    giveUpRadius: 8,
    leashRadius: 7.5,
    habitat: 'base',
    throughTrees: true,
    densPerChunk: 0,
    groupMin: 1,
    groupMax: 1,
    // La base le refait le jour (`ENEMY_BASE_LEVELS[].guards`), pas une tanière.
    respawnTicks: 0,
    // Sa gelée, et la ferraille de son casque.
    loot: [
      { item: 'mutantGoo', min: 1, max: 1, chance: 0.6 },
      { item: 'ironOre', min: 1, max: 2, chance: 1 },
    ],
    sprite: 'guardian',
    scale: 1,
    halfW: 9,
    halfH: 6,
    age: { min: 20, max: 60 },
  },
  /**
   * Le cracheur : un gardien maigre au jabot gonflé de gelée, qui tient
   * Adam à distance. Il crache des boules de bave (`SPITTER`) qui volent
   * lentement — on les voit venir, on s'écarte — et recule dès qu'on
   * l'approche : fragile, deux flèches suffisent. Ses dégâts et sa cadence
   * sont ceux d'un crachat (`damage`, `attackTicks`) : il ne frappe pas au
   * contact.
   */
  spitter: {
    label: 'Cracheur de base',
    hp: 2,
    speed: 0.8,
    // En reculant : un peu moins vite qu'Adam, qui le rattrape s'il le veut.
    chargeSpeed: 1.8,
    damage: 1,
    attackTicks: 50,
    // Comme le gardien, compté depuis le centre de sa base ; il ouvre le feu dès qu'Adam entre dans la zone.
    aggroRadius: 7,
    giveUpRadius: 11,
    leashRadius: 7.5,
    habitat: 'base',
    throughTrees: true,
    densPerChunk: 0,
    groupMin: 1,
    groupMax: 1,
    respawnTicks: 0,
    // Son jabot de gelée, et parfois un bout de tuyau qui lui servait de sarbacane.
    loot: [
      { item: 'mutantGoo', min: 1, max: 1, chance: 1 },
      { item: 'ironOre', min: 1, max: 1, chance: 0.5 },
    ],
    sprite: 'spitter',
    scale: 1,
    halfW: 7,
    halfH: 5,
    age: { min: 15, max: 45 },
  },
  /**
   * Le chef d'une base : un gros mutant couronné d'un cône de chantier,
   * épaulière de bidon et massue de béton. Ses points de vie, ses coups et
   * son butin sont ceux de sa base (`ENEMY_BASE_LEVELS[].chief`) ; ceux-ci
   * sont ceux du premier anneau. Lent — Adam le distance toujours —, il
   * frappe fort et rarement au contact, et lève sa massue pour un coup de
   * zone annoncé (`CHIEF`). Il défend la zone de plus loin que ses gardiens
   * et la poursuit jusqu'à sa laisse ; Adam parti, il rentre et se refait.
   */
  chief: {
    label: 'Chef de base',
    hp: 24,
    speed: 0.6,
    chargeSpeed: 1.4,
    damage: 3,
    attackTicks: 40,
    aggroRadius: 7,
    // Touché de loin, il charge quand même : il ne lâche qu'un Adam hors de portée d'arc.
    giveUpRadius: 12,
    leashRadius: 7.5,
    habitat: 'base',
    throughTrees: true,
    densPerChunk: 0,
    groupMin: 1,
    groupMax: 1,
    respawnTicks: 0,
    // Sa gelée, toujours ; sa base y ajoute ce qu'elle a de rare (`chief.loot`).
    loot: [{ item: 'mutantGoo', min: 1, max: 2, chance: 1 }],
    sprite: 'chief',
    scale: 1,
    // Ses pieds : une tuile de large au plus, comme tout ennemi.
    halfW: 13,
    halfH: 8,
    age: { min: 40, max: 90 },
  },
  /*
   * Les gardiens des régions à conquérir (`BIOMES[].guardian`) : un par
   * biome, une bête de la carte qui a trop poussé. Ces chiffres sont ceux du
   * premier anneau ; `REGION_RINGS[].hpScale` et `damageScale` les font
   * grandir avec la distance. Ils tiennent leur repaire comme un gardien de
   * base : chargent qui y entre, le lâchent qui s'éloigne, ne le quittent
   * jamais. Abattus, la région est conquise.
   */
  /** Le loup de la forêt, en deux fois plus grand : vif, il cogne souvent. */
  greatWolf: {
    label: 'Grand loup',
    hp: 30,
    speed: 1.4,
    chargeSpeed: 3,
    damage: 3,
    attackTicks: 24,
    aggroRadius: 7,
    giveUpRadius: 12,
    leashRadius: 9,
    habitat: 'region',
    throughTrees: true,
    densPerChunk: 0,
    groupMin: 1,
    groupMax: 1,
    respawnTicks: 0,
    loot: [
      { item: 'meat', min: 4, max: 6, chance: 1 },
      { item: 'wolfFang', min: 1, max: 2, chance: 1 },
    ],
    sprite: 'wolf',
    scale: 1.8,
    halfW: 14,
    halfH: 9,
    age: { min: 8, max: 15 },
  },
  /** Le crabe de la plage, grand comme une barque : lent, une carapace épaisse. */
  giantCrab: {
    label: 'Crabe géant',
    hp: 40,
    speed: 0.8,
    chargeSpeed: 2,
    damage: 4,
    attackTicks: 30,
    aggroRadius: 6,
    giveUpRadius: 11,
    leashRadius: 9,
    habitat: 'region',
    throughTrees: true,
    densPerChunk: 0,
    groupMin: 1,
    groupMax: 1,
    respawnTicks: 0,
    loot: [
      { item: 'meat', min: 4, max: 6, chance: 1 },
      { item: 'crabClaw', min: 1, max: 2, chance: 1 },
    ],
    sprite: 'crab',
    scale: 2.2,
    halfW: 15,
    halfH: 9,
    age: { min: 20, max: 60 },
  },
  /** Un gardien casqué qui a grandi dans les carrières : très lent, très solide. */
  colossus: {
    label: 'Colosse des carrières',
    hp: 50,
    speed: 0.6,
    chargeSpeed: 1.6,
    damage: 5,
    attackTicks: 36,
    aggroRadius: 6,
    giveUpRadius: 11,
    leashRadius: 9,
    habitat: 'region',
    throughTrees: true,
    densPerChunk: 0,
    groupMin: 1,
    groupMax: 1,
    respawnTicks: 0,
    loot: [
      { item: 'stone', min: 4, max: 6, chance: 1 },
      { item: 'ironOre', min: 3, max: 5, chance: 1 },
    ],
    sprite: 'guardian',
    scale: 1.8,
    halfW: 15,
    halfH: 9,
    age: { min: 40, max: 90 },
  },
  /** Un cracheur gonflé de boue violette : il ne crache plus, il écrase. */
  sludgeKing: {
    label: 'Roi des boues',
    hp: 36,
    speed: 0.9,
    chargeSpeed: 2.2,
    damage: 4,
    attackTicks: 28,
    aggroRadius: 7,
    giveUpRadius: 12,
    leashRadius: 9,
    habitat: 'region',
    throughTrees: true,
    densPerChunk: 0,
    groupMin: 1,
    groupMax: 1,
    respawnTicks: 0,
    loot: [
      { item: 'mutantGoo', min: 2, max: 4, chance: 1 },
      { item: 'coal', min: 2, max: 3, chance: 1 },
    ],
    sprite: 'spitter',
    scale: 1.9,
    halfW: 14,
    halfH: 9,
    age: { min: 30, max: 80 },
  },
} as const satisfies Record<string, WildlifeProto>;

export type WildlifeId = keyof typeof WILDLIFE;

/**
 * Le crachat du cracheur : une boule de bave fluo qui vole droit vers où
 * était Adam au moment du tir, sans anticipation — qui bouge l'esquive.
 * Elle s'écrase sur le premier bâtiment ou la première base qu'elle
 * rencontre ; arbres et rochers, elle passe par-dessus, comme une flèche.
 */
export const SPITTER = {
  /** Portée, en tuiles : il tire d'aussi loin, et s'approche s'il est plus loin. Moins que l'arc d'Adam (6). */
  range: 5,
  /** Plus près, en tuiles, il recule au lieu de tirer. */
  fleeRadius: 2.5,
  /** Vitesse du crachat, en tuiles par seconde : moins de deux fois le pas d'Adam, il se voit venir. */
  speed: 6,
  /**
   * Ticks pendant lesquels il gonfle son jabot avant chaque crachat — le
   * premier compris : on le voit se préparer, on a le temps de bouger.
   */
  tellTicks: 10,
} as const;

/**
 * Le chef d'une base, ce que ne dit pas `WILDLIFE.chief`.
 *
 * Son coup de zone : Adam à moins de `range` tuiles, le chef s'arrête, lève
 * sa massue, et un cercle corail de `radius` tuiles se dessine au sol là où
 * était Adam ; il se remplit pendant `windupTicks`, puis la massue tombe.
 * Qui est encore dans le cercle prend `slamDamage` (`ENEMY_BASE_LEVELS`).
 * Une seconde suffit à en sortir au pas d'Adam — s'il bouge.
 */
export const CHIEF = {
  slam: { range: 3, radius: 1.6, windupTicks: 20, cooldownTicks: 20 * 4 },
  /** Hors combat, il regagne un point de vie toutes les `regenTicks` (multiple de `WILDLIFE_SPAWN.checkTicks`). */
  regenTicks: 40,
} as const;

export const WILDLIFE_IDS = Object.keys(WILDLIFE) as WildlifeId[];

/**
 * Les surnoms des ennemis — mutants et bêtes —, tirés de la seed et de leur
 * id (`foeName`) : jamais sauvegardés. Des onomatopées plutôt que des
 * prénoms, pour qu'un mutant ne porte pas celui d'un habitant ; drôles plus
 * qu'effrayants, comme eux.
 */
export const FOE_NAMES = [
  'Gloups',
  'Zorglu',
  'Bloblo',
  'Krakou',
  'Slurp',
  'Grumph',
  'Bzou',
  'Glurp',
  'Splotch',
  'Moumou',
  'Pustulo',
  'Gnafron',
  'Ploc',
  'Zigouz',
  'Bouboule',
  'Fluo',
] as const;

/**
 * Règles d'apparition de la faune, communes aux espèces.
 *
 * Les tanières des chunks voisins de celui d'Adam sont passées en revue
 * toutes les `checkTicks` ; une tanière vide se peuple si elle est hors de
 * l'écran (`minPlayerDistance`), loin du village, et si le plafond n'est pas
 * atteint. Une bête trop loin d'Adam est rangée dans sa tanière.
 */
export const WILDLIFE_SPAWN = {
  checkTicks: 20,
  /** Chunks passés en revue autour de celui d'Adam (2 : un carré de 5 × 5). */
  chunkRadius: 2,
  /** Plafond de bêtes vivantes sur toute la carte. */
  cap: 24,
  /** Distance minimale d'Adam à la tanière, en tuiles : au-delà du bord d'un écran de téléphone. */
  minPlayerDistance: 24,
  /** Au-delà, en tuiles, une bête rentre dans sa tanière et disparaît. */
  despawnDistance: 72,
  /** Aucune tanière à moins de tant de tuiles de la mairie : le départ reste paisible. */
  townHallClearance: 20,
  /** Ni à moins de tant de tuiles d'un autre bâtiment : le village est à l'abri. */
  buildingClearance: 10,
} as const;
