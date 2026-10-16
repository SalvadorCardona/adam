/**
 * Recherches du labo — contenu pur.
 *
 * Une recherche = un coût, une durée, des prérequis, et un effet ou des
 * bâtiments à débloquer. Le coût
 * mêle objets communs (bois, pierre, minerai…) et butin d'ennemis (gelée de
 * mutant, croc de loup, pince de crabe, cœur de la Reine) : le combat nourrit
 * la progression.
 *
 * Un labo n'en mène qu'une à la fois, les suivantes en file. On la choisit, le labo attend son coût
 * — apporté par Adam (heurt, « Transférer » : le sac puis la ville dans son
 * rayon) ou livré par les porteurs depuis la mairie — puis le compte à
 * rebours tourne ; à la fin, l'effet vaut pour toute la partie.
 *
 * Un effet n'a pas de mécanique propre : c'est un **modificateur** ajouté à
 * une statistique (`ResearchStat`), que la simulation lit à un seul endroit,
 * `World.bonus(stat)` (`sim/research.ts`). Les données du jeu, elles, ne
 * bougent jamais.
 *
 * Une recherche peut aussi **débloquer des bâtiments** (`unlocks`) : la
 * forge et le four à charbon, la clinique, la caserne, la station de
 * dépollution. Tant qu'elle n'est pas finie, ils n'apparaissent pas au menu
 * de construction ; le labo est l'endroit où l'on découvre ce qui arrive
 * ensuite (`World.isUnlocked`). Les bâtiments de base qu'une colonie neuve
 * n'a pas (`START_BUILDINGS` : Maison, Nurserie, Poste de logistique, Labo, Ferme),
 * le labo les **ouvre** (`opens`) : puits, cabane, tour, carrière, foreuse,
 * poste de construction. Ceux-là, un objectif ou une quête peut les
 * demander : leur recherche ne coûte que ce qui se récolte.
 *
 * Trois onglets (`theme`) : Bâtiments, Ouvriers (tous les habitants de la
 * ville), Personnage (Adam) ; puis un onglet par ère atteinte après le
 * Campement (`era`, `data/eras.ts`), qui porte sa chaîne. Une recherche de
 * plus est une entrée de plus ici et ses textes dans le dictionnaire.
 *
 * `validatePrototypes()` vérifie les objets, les quantités, les prérequis
 * (connus, sans cycle) et que le coffre du labo contient le plus gros coût.
 */

import type { UiIcon } from '../art/ui.ts';
import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';

/**
 * Ce qu'une recherche peut améliorer. Chaque statistique a une valeur de
 * base (lue dans les données par `sim/research.ts`) et s'additionne aux
 * modificateurs des recherches finies.
 */
export type ResearchStat =
  /** Points de vie retirés par une flèche de l'arc d'Adam. */
  | 'bowDamage'
  /** Ticks entre deux flèches de l'arc d'Adam (négatif : il tire plus vite). */
  | 'bowCooldown'
  /** Places du sac. */
  | 'bagCapacity'
  /** Vitesse d'Adam, en tuiles par seconde. */
  | 'walkSpeed'
  /** Points de vie max d'Adam. */
  | 'maxHp'
  /** Objets portés en un voyage par un porteur (ex-mutants compris). */
  | 'porterCarry'
  /** Part de vitesse de marche en plus pour tous les habitants : porteurs, bûcherons, bâtisseurs… */
  | 'workerSpeed'
  /** Part de travail en plus à chaque geste : coup de hache, de marteau, semis, récolte. */
  | 'workSpeed'
  /** Part de faim en moins : la jauge baisse d'autant moins vite. */
  | 'hungerResist'
  /** Part de soif en moins : la jauge baisse d'autant moins vite. */
  | 'thirstResist'
  /** Part de bois en plus à chaque passage de récolte sur un arbre. */
  | 'woodYield'
  /** Part de pierre, de fer et de charbon en plus à chaque passage de récolte sur un rocher. */
  | 'oreYield'
  /** Ticks entre deux minerais d'une foreuse (négatif : elle va plus vite). */
  | 'drillTicks'
  /** Ticks entre deux cases nettoyées par une station de dépollution (négatif : elle va plus vite). */
  | 'purifyTicks'
  /** Blé par récolte d'une ferme. */
  | 'farmYield';

/**
 * Comment afficher une statistique : son libellé, son unité, et `ticks` si
 * la valeur est une durée en ticks — elle s'affiche alors en secondes.
 */
export interface ResearchStatProto {
  label: string;
  unit: string;
  ticks: boolean;
  /** Une part (0,25 → « +25 % ») plutôt qu'une quantité. */
  percent: boolean;
  /** Les bâtiments que la statistique concerne : un au moins doit être au menu, sinon la recherche ne servirait à rien (`validatePrototypes()`). */
  buildings?: readonly BuildingId[];
}

export const RESEARCH_STATS = {
  bowDamage: { label: 'Dégâts de l’arc', unit: '', ticks: false, percent: false },
  bowCooldown: { label: 'Délai entre deux flèches', unit: ' s', ticks: true, percent: false },
  bagCapacity: { label: 'Places du sac', unit: '', ticks: false, percent: false },
  walkSpeed: { label: 'Vitesse d’Adam', unit: ' cases/s', ticks: false, percent: false },
  maxHp: { label: 'Points de vie d’Adam', unit: '', ticks: false, percent: false },
  porterCarry: { label: 'Charge d’un porteur', unit: '', ticks: false, percent: false },
  workerSpeed: { label: 'Vitesse des habitants', unit: '', ticks: false, percent: true },
  workSpeed: { label: 'Cadence de travail', unit: '', ticks: false, percent: true },
  hungerResist: { label: 'Faim en moins', unit: '', ticks: false, percent: true },
  thirstResist: { label: 'Soif en moins', unit: '', ticks: false, percent: true },
  woodYield: { label: 'Bois récolté en plus', unit: '', ticks: false, percent: true },
  oreYield: { label: 'Minerai récolté en plus', unit: '', ticks: false, percent: true },
  drillTicks: { label: 'Temps d’extraction', unit: ' s', ticks: true, percent: false, buildings: ['drill', 'quarry'] },
  purifyTicks: { label: 'Temps par case dépolluée', unit: ' s', ticks: true, percent: false, buildings: ['purifier'] },
  farmYield: { label: 'Blé par récolte', unit: '', ticks: false, percent: false, buildings: ['farm'] },
} as const satisfies Record<ResearchStat, ResearchStatProto>;

/**
 * Les onglets du labo, dans cet ordre : les bâtiments (ceux qui entrent au
 * menu, ceux qui tournent mieux), tous les habitants de la ville, et Adam.
 */
export const RESEARCH_THEMES = {
  building: 'Bâtiments',
  workers: 'Ouvriers',
  character: 'Personnage',
} as const;

export type ResearchTheme = keyof typeof RESEARCH_THEMES;

/** L'icône d'une recherche au labo : celle d'un objet, la vignette d'un bâtiment, ou un pictogramme de `art/ui.ts`. */
export type ResearchIcon = { item: ItemId } | { building: BuildingId } | { ui: UiIcon };

export interface ResearchProto {
  label: string;
  /** Une ligne, sous le nom : ce que la recherche raconte. */
  description: string;
  icon: ResearchIcon;
  /** Son onglet au labo. */
  theme: ResearchTheme;
  /** Ce qu'il faut déposer au labo avant que le compte à rebours démarre. */
  cost: Partial<Record<ItemId, number>>;
  /** Durée du compte à rebours, en ticks (20 par seconde). */
  duration: number;
  /** Recherches à finir d'abord (ids de `RESEARCH`, vérifiés par `validatePrototypes()`). */
  requires: readonly string[];
  /** Le modificateur ajouté à `stat` une fois la recherche finie, ou `null` pour une recherche qui ne fait que débloquer. */
  effect: { stat: ResearchStat; amount: number } | null;
  /** Bâtiments qui n'entrent au menu de construction qu'une fois la recherche finie. */
  unlocks: readonly BuildingId[];
  /**
   * Bâtiments de base, fermés dans une colonie neuve (`START_BUILDINGS`) :
   * la recherche finie les ouvre (`World.openBuildings`). Une partie qui les
   * a déjà ouverts — une sauvegarde d'avant — n'en a pas besoin.
   */
  opens: readonly BuildingId[];
  /**
   * L'ère qui l'ouvre (index de `ERAS`, `data/eras.ts`). Celles du Campement
   * vont dans l'onglet de leur `theme` ; celles d'une ère suivante, dans
   * l'onglet de l'ère. Elle ne se lance qu'une fois la colonie arrivée à
   * cette ère.
   */
  era: number;
}

export const RESEARCH = {
  // ---------------------------------------------------------- Bâtiments
  waterWell: {
    label: 'Puisatier',
    description: 'Une corde, un seau, une margelle : l’eau de la rivière à portée de main.',
    icon: { building: 'well' },
    theme: 'building',
    cost: { wood: 6, stone: 4 },
    duration: 20 * 20,
    requires: [],
    effect: null,
    unlocks: [],
    opens: ['well'],
    era: 0,
  },
  woodcraft: {
    label: 'Bûcheronnage',
    description: 'Des haches de récup, des pousses à replanter : la forêt travaille pour la ville.',
    icon: { building: 'lumberCamp' },
    theme: 'building',
    cost: { wood: 8, stone: 4 },
    duration: 20 * 30,
    requires: [],
    effect: null,
    unlocks: [],
    opens: ['lumberCamp', 'foresterHouse'],
    era: 0,
  },
  pigFarming: {
    label: 'Élevage',
    description: 'Un enclos de récup, une soue, une auge : un cochon des bois donnerait de la viande à la ville.',
    icon: { building: 'pigPen' },
    theme: 'building',
    cost: { wood: 8, stone: 4 },
    duration: 20 * 30,
    requires: [],
    effect: null,
    unlocks: [],
    opens: ['pigPen'],
    era: 0,
  },
  lookout: {
    label: 'Guet',
    description: 'Une échelle, un drapeau, une arbalète bricolée : on voit venir les mutants.',
    icon: { building: 'watchtower' },
    theme: 'building',
    cost: { wood: 8, stone: 6 },
    duration: 20 * 30,
    requires: [],
    effect: null,
    unlocks: [],
    opens: ['watchtower'],
    era: 0,
  },
  mining: {
    label: 'Extraction',
    description: 'Une roue, un trépan, des coins de fer : la pierre et le minerai sortent seuls.',
    icon: { building: 'drill' },
    theme: 'building',
    cost: { wood: 10, stone: 8, ironOre: 4 },
    duration: 20 * 45,
    requires: [],
    effect: null,
    unlocks: [],
    opens: ['quarry', 'drill'],
    era: 0,
  },
  organizedSites: {
    label: 'Chantiers organisés',
    description: 'Un plan sur la table, un casque par tête : les bâtisseurs prennent le relais.',
    icon: { building: 'constructionPost' },
    theme: 'building',
    cost: { wood: 12, stone: 12 },
    duration: 20 * 60,
    requires: ['woodcraft'],
    effect: null,
    unlocks: [],
    opens: ['constructionPost'],
    era: 0,
  },
  metalworking: {
    label: 'Fonderie',
    description: 'Un creuset de pierre, un soufflet de fortune : le fer se laisse fondre.',
    icon: { building: 'forge' },
    theme: 'building',
    cost: { stone: 10, ironOre: 8 },
    duration: 20 * 60,
    requires: ['mining'],
    effect: null,
    unlocks: ['forge', 'charcoalKiln'],
    opens: [],
    era: 0,
  },
  baking: {
    label: 'Boulangerie',
    description: 'Un four de briques et de la farine moulue à la main : le blé de la ferme devient du pain.',
    icon: { building: 'bakery' },
    theme: 'building',
    cost: { wood: 8, stone: 6 },
    duration: 20 * 40,
    requires: [],
    effect: null,
    unlocks: ['bakery'],
    opens: [],
    era: 0,
  },
  grilling: {
    label: 'Grillades',
    description: 'Un demi-bidon, une grille, des braises : la viande cuite nourrit mieux que la crue.',
    icon: { building: 'grill' },
    theme: 'building',
    cost: { wood: 10, stone: 6 },
    duration: 20 * 45,
    requires: ['metalworking'],
    effect: null,
    unlocks: ['grill'],
    opens: [],
    era: 0,
  },
  masonry: {
    label: 'Maçonnerie',
    description: 'Briques cuites au four et mortier de chaux : la mairie, les maisons, la carrière et la foreuse montent au troisième niveau.',
    icon: { building: 'townHall' },
    theme: 'building',
    cost: { stone: 20, ironPlate: 3 },
    duration: 20 * 60,
    requires: ['metalworking'],
    effect: null,
    unlocks: [],
    opens: [],
    era: 0,
  },
  fastDrills: {
    label: 'Foreuses rapides',
    description: 'Des mèches trempées au charbon : les foreuses creusent plus vite.',
    icon: { item: 'ironOre' },
    theme: 'building',
    cost: { ironOre: 10, coal: 4 },
    duration: 20 * 60,
    requires: ['mining'],
    effect: { stat: 'drillTicks', amount: -10 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  fieldMedicine: {
    label: 'Médecine de fortune',
    description: 'De la gelée de mutant sous la loupe : ce qui les change se soigne.',
    icon: { building: 'clinic' },
    theme: 'building',
    cost: { food: 6, mutantGoo: 2 },
    duration: 20 * 60,
    requires: [],
    effect: null,
    unlocks: ['clinic'],
    opens: [],
    era: 0,
  },
  militia: {
    label: 'Milice',
    description: 'Des lances taillées, un râtelier : de quoi former une petite escorte.',
    icon: { building: 'barracks' },
    theme: 'building',
    cost: { wood: 10, stone: 8, wolfFang: 2 },
    duration: 20 * 60,
    requires: [],
    effect: null,
    unlocks: ['barracks'],
    opens: [],
    era: 0,
  },
  fortification: {
    label: 'Fortifications',
    description: 'Des pieux, des créneaux et deux bons archers : la ville se prépare à la nuit.',
    icon: { building: 'archerTower' },
    theme: 'building',
    cost: { wood: 12, stone: 8, mutantGoo: 2 },
    duration: 20 * 45,
    requires: [],
    effect: null,
    unlocks: ['archerTower', 'palisade'],
    opens: [],
    era: 0,
  },
  purification: {
    label: 'Dépollution',
    description: 'Des filtres de charbon et de sable : la boue violette se laisse laver.',
    icon: { building: 'purifier' },
    theme: 'building',
    cost: { stone: 12, coal: 6, ironOre: 6 },
    duration: 20 * 90,
    requires: ['mining'],
    effect: null,
    unlocks: ['purifier'],
    opens: [],
    era: 0,
  },
  charcoalFilters: {
    label: 'Filtres doubles',
    description: 'Deux couches de charbon au lieu d’une : la station lave deux fois plus vite.',
    icon: { item: 'coal' },
    theme: 'building',
    cost: { coal: 10, ironPlate: 4 },
    duration: 20 * 120,
    requires: ['purification', 'metalworking'],
    effect: { stat: 'purifyTicks', amount: -30 },
    unlocks: [],
    opens: [],
    era: 0,
  },

  // ----------------------------------------------------------- Ouvriers
  sandals: {
    label: 'Sandales tressées',
    description: 'De l’écorce tressée sous chaque pied : toute la ville marche plus vite.',
    icon: { ui: 'people' },
    theme: 'workers',
    cost: { wood: 6, food: 4 },
    duration: 20 * 40,
    requires: [],
    effect: { stat: 'workerSpeed', amount: 0.15 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  rations: {
    label: 'Rations séchées',
    description: 'De la viande séchée dans chaque poche : on tient plus longtemps sans manger.',
    icon: { item: 'food' },
    theme: 'workers',
    cost: { food: 8, stone: 4 },
    duration: 20 * 45,
    requires: [],
    effect: { stat: 'hungerResist', amount: 0.25 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  canteens: {
    label: 'Gourdes',
    description: 'Une gourde de bois cerclée à la ceinture : la soif attend.',
    icon: { item: 'water' },
    theme: 'workers',
    cost: { water: 8, wood: 6 },
    duration: 20 * 45,
    requires: [],
    effect: { stat: 'thirstResist', amount: 0.25 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  sturdyPorters: {
    label: 'Porteurs endurants',
    description: 'De bons repas et des hottes plus larges pour les ouvriers.',
    icon: { ui: 'worker' },
    theme: 'workers',
    cost: { food: 10, wood: 10 },
    duration: 20 * 60,
    requires: ['sandals'],
    effect: { stat: 'porterCarry', amount: 2 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  goodTools: {
    label: 'Outils de qualité',
    description: 'Des manches polis, des lames de fer : chaque geste abat plus d’ouvrage.',
    icon: { ui: 'toil' },
    theme: 'workers',
    cost: { wood: 10, stone: 6, ironOre: 8 },
    duration: 20 * 75,
    requires: ['sandals'],
    effect: { stat: 'workSpeed', amount: 0.25 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  runners: {
    label: 'Coursiers',
    description: 'Des semelles cloutées de fer : la ville court d’un bâtiment à l’autre.',
    icon: { ui: 'move' },
    theme: 'workers',
    cost: { ironPlate: 4, food: 10 },
    duration: 20 * 120,
    requires: ['sturdyPorters', 'metalworking'],
    effect: { stat: 'workerSpeed', amount: 0.15 },
    unlocks: [],
    opens: [],
    era: 0,
  },

  // --------------------------------------------------------- Personnage
  walkingBoots: {
    label: 'Bottes de marche',
    description: 'Semelles de pierre polie, tiges tressées : Adam file.',
    icon: { ui: 'direction' },
    theme: 'character',
    cost: { stone: 6, food: 6 },
    duration: 20 * 45,
    requires: [],
    effect: { stat: 'walkSpeed', amount: 0.9 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  bigBag: {
    label: 'Sac renforcé',
    description: 'Des pinces de crabe en guise de boucles : le sac prend du ventre.',
    icon: { ui: 'bag' },
    theme: 'character',
    cost: { wood: 8, crabClaw: 4 },
    duration: 20 * 45,
    requires: [],
    effect: { stat: 'bagCapacity', amount: 15 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  sharpAxes: {
    label: 'Haches affûtées',
    description: 'Une meule de pierre et du fil de fer : chaque coup compte.',
    icon: { ui: 'axe' },
    theme: 'character',
    cost: { stone: 8, ironOre: 6 },
    duration: 20 * 45,
    requires: [],
    effect: { stat: 'woodYield', amount: 0.5 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  paddedVest: {
    label: 'Gilet rembourré',
    description: 'Une carapace de crabe cousue sur la poitrine : les coups glissent.',
    icon: { ui: 'heart' },
    theme: 'character',
    cost: { wood: 6, food: 6, crabClaw: 3 },
    duration: 20 * 60,
    requires: [],
    effect: { stat: 'maxHp', amount: 4 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  sharpArrows: {
    label: 'Flèches à croc',
    description: 'Des crocs de loup en pointe de flèche : ça mord.',
    icon: { item: 'wolfFang' },
    theme: 'character',
    cost: { wood: 8, wolfFang: 3 },
    duration: 20 * 60,
    requires: [],
    effect: { stat: 'bowDamage', amount: 0.5 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  quickDraw: {
    label: 'Tir rapide',
    description: 'Une corde enduite de gelée de mutant : elle claque plus vite.',
    icon: { item: 'mutantGoo' },
    theme: 'character',
    cost: { wood: 6, mutantGoo: 4 },
    duration: 20 * 75,
    requires: ['sharpArrows'],
    effect: { stat: 'bowCooldown', amount: -4 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  irradiatedArrows: {
    label: 'Flèches irradiées',
    description: 'Un éclat du cœur de la Reine dans chaque pointe : ça brûle.',
    icon: { item: 'radCore' },
    theme: 'character',
    cost: { ironPlate: 4, radCore: 1 },
    duration: 20 * 120,
    requires: ['sharpArrows'],
    effect: { stat: 'bowDamage', amount: 1 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  // Les spécialités des régions conquises (`data/regions.ts`) : une recherche par biome.
  amberBows: {
    label: 'Arcs vernis d’ambre',
    description: 'L’ambre de la forêt raidit le bois de l’arc : chaque flèche frappe plus fort.',
    icon: { item: 'amber' },
    theme: 'character',
    cost: { amber: 4, wood: 10 },
    duration: 20 * 60,
    requires: [],
    effect: { stat: 'bowDamage', amount: 0.5 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  pearlBag: {
    label: 'Sac cousu de nacre',
    description: 'Des boucles de nacre de la côte : le sac s’ouvre plus grand.',
    icon: { item: 'pearl' },
    theme: 'character',
    cost: { pearl: 4, wood: 8 },
    duration: 20 * 60,
    requires: [],
    effect: { stat: 'bagCapacity', amount: 10 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  quartzBits: {
    label: 'Mèches de quartz',
    description: 'Le quartz de la montagne ne s’émousse pas : les foreuses creusent plus vite.',
    icon: { item: 'quartz' },
    theme: 'building',
    cost: { quartz: 4, ironOre: 6 },
    duration: 20 * 60,
    requires: [],
    effect: { stat: 'drillTicks', amount: -6 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  sporeFilters: {
    label: 'Filtres à spores',
    description: 'Les spores des terres polluées, tassées dans les filtres : la station dépollue plus vite.',
    icon: { item: 'spore' },
    theme: 'building',
    cost: { spore: 4, wood: 10 },
    duration: 20 * 60,
    requires: ['purification'],
    effect: { stat: 'purifyTicks', amount: -15 },
    unlocks: [],
    opens: [],
    era: 0,
  },
  // ---------------------------------------------------------------- Ères
  brickmaking: {
    label: 'Cuisson des briques',
    description: 'Pierre concassée, feu de bois, moules de planches : la brique revient.',
    icon: { building: 'brickworks' },
    theme: 'building',
    cost: { stone: 12, wood: 12 },
    duration: 20 * 45,
    requires: [],
    effect: null,
    unlocks: ['brickworks'],
    opens: [],
    era: 1,
  },
  handcarts: {
    label: 'Charrettes à bras',
    description: 'Deux roues de récup sous une caisse de briques : les porteurs en prennent plus.',
    icon: { item: 'brick' },
    theme: 'workers',
    cost: { brick: 10, wood: 10 },
    duration: 20 * 60,
    requires: ['brickmaking'],
    effect: { stat: 'porterCarry', amount: 1 },
    unlocks: [],
    opens: [],
    era: 1,
  },
  toolmaking: {
    label: 'Outillage',
    description: 'Un étau, une meule et des plaques de fer : on façonne ses propres outils.',
    icon: { building: 'workshop' },
    theme: 'building',
    cost: { ironPlate: 4, brick: 10 },
    duration: 20 * 60,
    requires: [],
    effect: null,
    unlocks: ['workshop'],
    opens: [],
    era: 2,
  },
  compositeBows: {
    label: 'Arcs composites',
    description: 'Du bois, de la corne de croc, des outils précis : l’arc mord plus fort.',
    icon: { item: 'tools' },
    theme: 'character',
    cost: { tools: 4, wolfFang: 3 },
    duration: 20 * 60,
    requires: ['toolmaking'],
    effect: { stat: 'bowDamage', amount: 0.5 },
    unlocks: [],
    opens: [],
    era: 2,
  },
  toolDrills: {
    label: 'Foreuses outillées',
    description: 'Des mèches changées à la clé, sans arrêter la roue.',
    icon: { building: 'drill' },
    theme: 'building',
    cost: { tools: 6, brick: 6 },
    duration: 20 * 60,
    requires: ['toolmaking'],
    effect: { stat: 'drillTicks', amount: -10 },
    unlocks: [],
    opens: [],
    era: 2,
  },
  steelmaking: {
    label: 'Haut fourneau',
    description: 'Plus chaud que la forge, plus haut que la mairie : l’acier coule.',
    icon: { building: 'steelworks' },
    theme: 'building',
    cost: { tools: 8, ironPlate: 10, coal: 10 },
    duration: 20 * 90,
    requires: [],
    effect: null,
    unlocks: ['steelworks'],
    opens: [],
    era: 3,
  },
  steelArrows: {
    label: 'Flèches d’acier',
    description: 'Des pointes d’acier trempé : plus rien ne leur résiste.',
    icon: { item: 'steel' },
    theme: 'character',
    cost: { steel: 4, wood: 10 },
    duration: 20 * 90,
    requires: ['steelmaking'],
    effect: { stat: 'bowDamage', amount: 1 },
    unlocks: [],
    opens: [],
    era: 3,
  },
  steelFrame: {
    label: 'Sac à armature',
    description: 'Une armature d’acier, des sangles neuves : le sac tient le double sans plier.',
    icon: { ui: 'bag' },
    theme: 'character',
    cost: { steel: 3, tools: 3 },
    duration: 20 * 90,
    requires: ['steelmaking'],
    effect: { stat: 'bagCapacity', amount: 20 },
    unlocks: [],
    opens: [],
    era: 3,
  },
} as const satisfies Record<string, ResearchProto>;

export type ResearchId = keyof typeof RESEARCH;

export const RESEARCH_IDS = Object.keys(RESEARCH) as ResearchId[];

export function isResearchId(value: string): value is ResearchId {
  return Object.hasOwn(RESEARCH, value);
}
