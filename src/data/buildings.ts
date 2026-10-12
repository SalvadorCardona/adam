/**
 * Bâtiments — contenu pur.
 *
 * Ajouter un bâtiment = ajouter une entrée ici. Aucune ligne de logique à
 * écrire ailleurs tant que le `kind` existe déjà côté simulation.
 *
 * Un bâtiment ne se pose jamais fini : le placement crée un **chantier**, qui
 * devient le bâtiment quand le joueur y a apporté tout le `cost`. Un coût
 * vide se termine au tick même du placement.
 *
 * Tout bâtiment fini a des points de vie : les mutants cassent ce qui les
 * sépare de la mairie, et la mairie elle-même. À zéro, il disparaît.
 */

import type { ItemId } from './items.ts';
import { LORE } from './lore.ts';
import type { SpriteId } from './sprites.ts';
import type { WeaponId } from './weapons.ts';

/** Comportement simulé associé au bâtiment. Un `kind` = un cas dans `sim/`. */
export type BuildingKind =
  | 'drill'
  | 'townHall'
  | 'nursery'
  | 'tower'
  | 'house'
  | 'farm'
  | 'quarry'
  | 'forge'
  | 'clinic'
  | 'purifier'
  | 'wall'
  | 'barracks'
  | 'lab'
  | 'lumberCamp'
  | 'foresterHouse'
  | 'depot'
  | 'yard'
  | 'antenna'
  | 'decor';

/**
 * Les familles du menu de construction : une puce de filtre chacune, dans
 * cet ordre, après « Tous ». Le `kind` dit ce que la simulation fait du
 * bâtiment ; la catégorie, où le joueur le cherche.
 */
export const BUILDING_CATEGORIES = {
  ore: 'Minerai',
  production: 'Production',
  defense: 'Attaque',
  logistics: 'Logistique',
  housing: 'Habitat',
  research: 'Recherche',
  decor: 'Décor',
} as const;

export type BuildingCategory = keyof typeof BUILDING_CATEGORIES;

export interface BuildingProto {
  label: string;
  /** Nom court, écrit sur la pancarte du bâtiment sur la carte : « Bûcherons », « Labo ». */
  sign: string;
  /** Texte de la fenêtre d'inspection du chantier. */
  siteDescription: string;
  /** Texte de la fenêtre d'inspection du bâtiment fini. */
  description: string;
  /** Ce que fait le bâtiment, en une ligne : sa carte du menu de construction. */
  effect: string;
  kind: BuildingKind;
  /** Sa famille au menu de construction : la puce de filtre qui le montre. Obligatoire. */
  category: BuildingCategory;
  /** Emprise en tuiles. */
  width: number;
  height: number;
  /** Coût de construction, à apporter sur le chantier. */
  cost: Partial<Record<ItemId, number>>;
  /** Capacité du coffre interne, en nombre total d'objets. `Infinity` pour un entrepôt. */
  storage: number;
  /**
   * Rayon logistique, en tuiles, depuis le centre de l'emprise : un chantier
   * dans ce rayon puise dans le coffre du bâtiment fini. `0` pour un bâtiment
   * qui n'est pas un entrepôt, `Infinity` pour supprimer la notion de distance.
   */
  logisticRadius: number;
  /** Points de vie du bâtiment fini. */
  hp: number;
  /**
   * Une décoration (`kind: 'decor'`) : à chaque aube, elle remonte le moral
   * des ouvriers à moins de `radius` tuiles de son centre (`sim/decor.ts`).
   * Absent : le bâtiment n'est pas un décor.
   */
  mood?: DecorMood;
  /**
   * Il n'entre au menu qu'une fois tant de cases explorées (`FogOfWar.exploredCount`) :
   * la fontaine se gagne en partant voir ailleurs. Absent : aucune exigence.
   */
  unlockExplored?: number;
  /**
   * Ouvriers que le bâtiment héberge une fois terminé, et le plus qu'il en
   * emploie : son maximum. Ils comptent dans la population de la colonie ;
   * les porteurs en sortiront. À la construction, il les emploie tous.
   */
  workers: number;
  /**
   * Le moins d'ouvriers qu'on peut lui laisser depuis sa fenêtre (sélecteur
   * − / + de `sim/staffing.ts`). Zéro : c'est une pause de fait.
   */
  minWorkers: number;
  /**
   * Lits du bâtiment fini : ses places à dormir, qui font l'Habitation de la
   * ville (`data/housing.ts`). Un lit n'est à personne en propre — la
   * simulation les attribue (`sim/housing.ts`). Absent : aucun.
   */
  beds?: number;
  /**
   * Le stock visé d'un bâtiment qui consomme, par entrée de sa recette : sous
   * ce niveau, il demande la différence aux transports (`sim/consumers.ts`),
   * et porteurs ou logisticiens la lui livrent. Absent : la part de l'entrée
   * dans le coffre, au prorata de la recette.
   */
  demand?: Partial<Record<ItemId, number>>;
  /** Proposé dans le menu de construction ? La mairie, unique, ne l'est pas. */
  menu: boolean;
  /** Un seul par colonie, chantier compris : le labo de recherche, l'antenne. */
  unique: boolean;
  /**
   * L'objectif à atteindre — son index dans `OBJECTIVES` — avant de pouvoir
   * le poser : l'antenne attend la fin de l'acte I. Absent : dès le début.
   */
  unlockObjective?: number;
  /**
   * Distance minimale à la mairie, en tuiles, de centre d'emprise à centre
   * d'emprise : l'antenne se dresse loin, il faudra la défendre. Absent : aucune.
   */
  hallDistance?: number;
  /**
   * Les gisements sur lesquels il se pose — une foreuse : fer, charbon,
   * pierre. Son emprise doit en couvrir la moitié, sur un seul filon, et
   * l'autre moitié d'herbe (`sim/footing.ts`) : deux et deux pour un 2 × 2.
   * Il extrait le filon qu'il couvre. Absent : il se pose n'importe où.
   */
  deposits?: readonly ItemId[];
  /**
   * Il se pose au bord d'une rivière : une case de l'emprise touche l'eau
   * (`touchesWater`, `sim/terrain.ts`). Le puits y puise. Absent : n'importe où.
   * Un puits d'une ancienne sauvegarde, posé loin de l'eau, tourne toujours.
   */
  shore?: true;
  /**
   * Faut-il un plan pour le bâtir ? Un bâtiment à plan n'entre dans le menu
   * qu'une fois le plan donné par Ève, en récompense d'une quête (`data/quests.ts`).
   */
  plan: boolean;
  /** Sprite du bâtiment : son chantier, sa version finie, sa version endommagée. */
  sprite: SpriteId;
  /** Arme automatique du bâtiment, ou `null` s'il n'en porte pas. */
  weapon: WeaponId | null;
  /**
   * Niveaux d'amélioration au-delà du premier, dans l'ordre : `upgrades[0]`
   * est le niveau 2. Ils se gagnent depuis la fenêtre du bâtiment fini, contre
   * leur `cost`. Vide pour un bâtiment qui ne s'améliore pas.
   */
  upgrades: readonly BuildingUpgrade[];
}

/** Ce qu'une décoration donne au moral, et jusqu'où. */
export interface DecorMood {
  /** Points de bonheur ajoutés à chaque aube à un ouvrier qui est à portée. */
  amount: number;
  /** Portée en tuiles, du centre de l'emprise. */
  radius: number;
}

/**
 * Un niveau d'amélioration : ce qu'il coûte depuis le niveau d'avant, et ce
 * qu'il remplace dans le prototype — points de vie, arme, sprite, textes —
 * plus, selon le bâtiment, un bonus : lits, rayon logistique, cadence.
 */
export interface BuildingUpgrade {
  /** Nom du bâtiment à ce niveau : le titre de sa fenêtre. */
  label: string;
  /** Verbe du bouton qui y mène : « Renforcer ». */
  action: string;
  /** Texte de la fenêtre d'inspection à ce niveau. */
  description: string;
  /** Payé d'un coup, comme un « Transférer » : le sac d'abord, puis la ville si elle est à portée. */
  cost: Partial<Record<ItemId, number>>;
  hp: number;
  weapon: WeaponId | null;
  sprite: SpriteId;
  /** Lits du niveau (une maison). Absent : ceux du niveau d'avant. */
  beds?: number;
  /** Rayon logistique du niveau (la mairie). Absent : celui du niveau d'avant. */
  logisticRadius?: number;
  /** Part de la durée d'un cycle de production (0,8 : un cycle sur cinq en moins). Absent : celle du niveau d'avant. */
  speed?: number;
  /** L'id de la recherche du labo qui ouvre ce niveau (vérifié par `validatePrototypes()`) : sans elle, le bouton reste grisé. Absent : aucune. */
  research?: string;
}

/** Ce qui change d'un niveau à l'autre, lu par la simulation et le rendu. */
export type BuildingLevel = Pick<BuildingUpgrade, 'label' | 'description' | 'hp' | 'weapon' | 'sprite'> &
  Partial<Pick<BuildingUpgrade, 'beds' | 'logisticRadius' | 'speed'>>;

export const BUILDINGS = {
  townHall: {
    label: LORE.buildings.townHall.name,
    sign: LORE.buildings.townHall.sign,
    siteDescription: LORE.buildings.townHall.site,
    description: LORE.buildings.townHall.description,
    effect: LORE.buildings.townHall.effect,
    kind: 'townHall',
    category: 'logistics',
    width: 3,
    height: 3,
    cost: { wood: 20, stone: 12 },
    storage: Infinity,
    logisticRadius: 10,
    hp: 120,
    workers: 0,
    minWorkers: 0,
    menu: false,
    unique: true,
    plan: false,
    sprite: 'townHall',
    weapon: null,
    upgrades: [
      {
        label: LORE.buildings.townHall.levels[0].name,
        action: LORE.buildings.townHall.levels[0].action,
        description: LORE.buildings.townHall.levels[0].description,
        cost: { wood: 30, stone: 24 },
        hp: 200,
        weapon: null,
        sprite: 'townHall2',
        logisticRadius: 13,
      },
      {
        label: LORE.buildings.townHall.levels[1].name,
        action: LORE.buildings.townHall.levels[1].action,
        description: LORE.buildings.townHall.levels[1].description,
        cost: { stone: 40, ironPlate: 8 },
        hp: 300,
        weapon: null,
        sprite: 'townHall3',
        logisticRadius: 16,
        research: 'masonry',
      },
    ],
  },
  lumberCamp: {
    label: LORE.buildings.lumberCamp.name,
    sign: LORE.buildings.lumberCamp.sign,
    siteDescription: LORE.buildings.lumberCamp.site,
    description: LORE.buildings.lumberCamp.description,
    effect: LORE.buildings.lumberCamp.effect,
    kind: 'lumberCamp',
    category: 'production',
    width: 2,
    height: 2,
    cost: { wood: 8, stone: 4 },
    storage: 20,
    logisticRadius: 0,
    hp: 50,
    workers: 2,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'lumberCamp',
    weapon: null,
    upgrades: [],
  },
  foresterHouse: {
    label: LORE.buildings.foresterHouse.name,
    sign: LORE.buildings.foresterHouse.sign,
    siteDescription: LORE.buildings.foresterHouse.site,
    description: LORE.buildings.foresterHouse.description,
    effect: LORE.buildings.foresterHouse.effect,
    kind: 'foresterHouse',
    category: 'production',
    width: 2,
    height: 2,
    // Du bois pour en faire repousser : la pierre, rare, n'y entre presque pas.
    cost: { wood: 10, stone: 2 },
    storage: 0,
    logisticRadius: 0,
    hp: 40,
    workers: 1,
    minWorkers: 0,
    // Une maisonnette : le lit de son forestier.
    beds: 1,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'foresterHouse',
    weapon: null,
    upgrades: [],
  },
  quarry: {
    label: LORE.buildings.quarry.name,
    sign: LORE.buildings.quarry.sign,
    siteDescription: LORE.buildings.quarry.site,
    description: LORE.buildings.quarry.description,
    effect: LORE.buildings.quarry.effect,
    kind: 'quarry',
    category: 'ore',
    width: 2,
    height: 2,
    // Tout en bois, la ressource abondante : c'est elle qui donne la pierre qui manque.
    cost: { wood: 18 },
    storage: 30,
    logisticRadius: 0,
    hp: 60,
    workers: 3,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'quarry',
    weapon: null,
    upgrades: [
      {
        label: LORE.buildings.quarry.levels[0].name,
        action: LORE.buildings.quarry.levels[0].action,
        description: LORE.buildings.quarry.levels[0].description,
        cost: { wood: 12, stone: 6 },
        hp: 90,
        weapon: null,
        sprite: 'quarry2',
        speed: 0.8,
      },
      {
        label: LORE.buildings.quarry.levels[1].name,
        action: LORE.buildings.quarry.levels[1].action,
        description: LORE.buildings.quarry.levels[1].description,
        cost: { stone: 16, ironPlate: 4 },
        hp: 130,
        weapon: null,
        sprite: 'quarry3',
        speed: 0.55,
        research: 'masonry',
      },
    ],
  },
  well: {
    label: LORE.buildings.well.name,
    sign: LORE.buildings.well.sign,
    siteDescription: LORE.buildings.well.site,
    description: LORE.buildings.well.description,
    effect: LORE.buildings.well.effect,
    // Une carrière sur sa propre recette (`drawWater`) : un producteur sans entrée, posé au bord de l'eau.
    kind: 'quarry',
    category: 'production',
    width: 2,
    height: 2,
    // Du bois pour le treuil, un peu de pierre pour la margelle : à la portée d'une colonie qui démarre.
    cost: { wood: 10, stone: 4 },
    storage: 30,
    logisticRadius: 0,
    hp: 50,
    workers: 1,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    shore: true,
    sprite: 'well',
    weapon: null,
    upgrades: [],
  },
  logisticsPost: {
    label: LORE.buildings.logisticsPost.name,
    sign: LORE.buildings.logisticsPost.sign,
    siteDescription: LORE.buildings.logisticsPost.site,
    description: LORE.buildings.logisticsPost.description,
    effect: LORE.buildings.logisticsPost.effect,
    kind: 'depot',
    category: 'logistics',
    width: 2,
    height: 2,
    cost: { wood: 12, stone: 8 },
    storage: 0,
    logisticRadius: 0,
    hp: 60,
    workers: 4,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'logisticsPost',
    weapon: null,
    upgrades: [],
  },
  constructionPost: {
    label: LORE.buildings.constructionPost.name,
    sign: LORE.buildings.constructionPost.sign,
    siteDescription: LORE.buildings.constructionPost.site,
    description: LORE.buildings.constructionPost.description,
    effect: LORE.buildings.constructionPost.effect,
    kind: 'yard',
    category: 'logistics',
    width: 2,
    height: 2,
    cost: { wood: 14, stone: 8 },
    storage: 0,
    logisticRadius: 0,
    hp: 60,
    workers: 4,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'constructionPost',
    weapon: null,
    upgrades: [],
  },
  drill: {
    label: LORE.buildings.drill.name,
    sign: LORE.buildings.drill.sign,
    siteDescription: LORE.buildings.drill.site,
    description: LORE.buildings.drill.description,
    effect: LORE.buildings.drill.effect,
    kind: 'drill',
    category: 'ore',
    width: 2,
    height: 2,
    cost: { stone: 6, ironOre: 4 },
    // Au bord d'un filon : deux cases de gisement, deux d'herbe.
    deposits: ['ironOre', 'coal', 'stone'],
    storage: 20,
    logisticRadius: 0,
    hp: 40,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'drill',
    weapon: null,
    upgrades: [
      {
        label: LORE.buildings.drill.levels[0].name,
        action: LORE.buildings.drill.levels[0].action,
        description: LORE.buildings.drill.levels[0].description,
        cost: { wood: 8, stone: 8 },
        hp: 65,
        weapon: null,
        sprite: 'drill2',
        speed: 0.8,
      },
      {
        label: LORE.buildings.drill.levels[1].name,
        action: LORE.buildings.drill.levels[1].action,
        description: LORE.buildings.drill.levels[1].description,
        cost: { stone: 14, ironPlate: 4 },
        hp: 95,
        weapon: null,
        sprite: 'drill3',
        speed: 0.55,
        research: 'masonry',
      },
    ],
  },
  nursery: {
    label: LORE.buildings.nursery.name,
    sign: LORE.buildings.nursery.sign,
    siteDescription: LORE.buildings.nursery.site,
    description: LORE.buildings.nursery.description,
    effect: LORE.buildings.nursery.effect,
    kind: 'nursery',
    category: 'housing',
    width: 2,
    height: 2,
    // Le bois abonde, la pierre manque : les bâtiments du début en demandent peu.
    cost: { wood: 18, stone: 3 },
    storage: 12,
    // De quoi tenir une journée (~5 min) : deux naissances de six nourritures.
    demand: { food: 12 },
    logisticRadius: 0,
    hp: 60,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'nursery',
    weapon: null,
    upgrades: [],
  },
  builderHouse: {
    label: LORE.buildings.builderHouse.name,
    sign: LORE.buildings.builderHouse.sign,
    siteDescription: LORE.buildings.builderHouse.site,
    description: LORE.buildings.builderHouse.description,
    effect: LORE.buildings.builderHouse.effect,
    kind: 'house',
    category: 'logistics',
    width: 2,
    height: 2,
    cost: { wood: 16, stone: 8 },
    storage: 0,
    logisticRadius: 0,
    hp: 70,
    workers: 4,
    minWorkers: 0,
    // Le dortoir de ses quatre porteurs.
    beds: 4,
    menu: true,
    unique: false,
    plan: true,
    sprite: 'builderHouse',
    weapon: null,
    upgrades: [],
  },
  home: {
    label: LORE.buildings.home.name,
    sign: LORE.buildings.home.sign,
    siteDescription: LORE.buildings.home.site,
    description: LORE.buildings.home.description,
    effect: LORE.buildings.home.effect,
    // Une maison sans ouvriers : rien que des lits (`beds`).
    kind: 'house',
    category: 'housing',
    width: 2,
    height: 2,
    // Du bois pour les murs et les lits, un peu de pierre pour la cheminée : à la portée d'une colonie qui démarre.
    cost: { wood: 12, stone: 6 },
    storage: 0,
    logisticRadius: 0,
    hp: 60,
    workers: 0,
    minWorkers: 0,
    beds: 4,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'home',
    weapon: null,
    upgrades: [
      {
        label: LORE.buildings.home.levels[0].name,
        action: LORE.buildings.home.levels[0].action,
        description: LORE.buildings.home.levels[0].description,
        cost: { wood: 14, stone: 8 },
        hp: 90,
        weapon: null,
        sprite: 'home2',
        beds: 6,
      },
      {
        label: LORE.buildings.home.levels[1].name,
        action: LORE.buildings.home.levels[1].action,
        description: LORE.buildings.home.levels[1].description,
        cost: { stone: 18, ironPlate: 4 },
        hp: 130,
        weapon: null,
        sprite: 'home3',
        beds: 8,
        research: 'masonry',
      },
    ],
  },
  farm: {
    label: LORE.buildings.farm.name,
    sign: LORE.buildings.farm.sign,
    siteDescription: LORE.buildings.farm.site,
    description: LORE.buildings.farm.description,
    effect: LORE.buildings.farm.effect,
    kind: 'farm',
    category: 'production',
    width: 2,
    height: 2,
    cost: { wood: 10, stone: 4 },
    storage: 40,
    logisticRadius: 0,
    hp: 50,
    workers: 4,
    minWorkers: 0,
    // Au menu dès le départ : la chasse seule ne suit pas la population, la ferme est la nourriture qu'on automatise.
    menu: true,
    unique: false,
    plan: false,
    sprite: 'farm',
    weapon: null,
    upgrades: [],
  },
  watchtower: {
    label: LORE.buildings.watchtower.name,
    sign: LORE.buildings.watchtower.sign,
    siteDescription: LORE.buildings.watchtower.site,
    description: LORE.buildings.watchtower.description,
    effect: LORE.buildings.watchtower.effect,
    kind: 'tower',
    category: 'defense',
    width: 2,
    height: 2,
    cost: { wood: 16, stone: 2 },
    storage: 0,
    logisticRadius: 0,
    hp: 60,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'watchtower',
    weapon: 'towerBow',
    // Le coût est celui de l'ancienne tour renforcée, moins la tour de planches déjà debout.
    upgrades: [
      {
        label: LORE.buildings.watchtower.reinforced.name,
        action: LORE.buildings.watchtower.reinforced.action,
        description: LORE.buildings.watchtower.reinforced.description,
        cost: { stone: 2, ironPlate: 4 },
        hp: 90,
        weapon: 'reinforcedBow',
        sprite: 'reinforcedTower',
      },
    ],
  },
  archerTower: {
    label: LORE.buildings.archerTower.name,
    sign: LORE.buildings.archerTower.sign,
    siteDescription: LORE.buildings.archerTower.site,
    description: LORE.buildings.archerTower.description,
    effect: LORE.buildings.archerTower.effect,
    kind: 'tower',
    category: 'defense',
    width: 2,
    height: 2,
    cost: { wood: 14, stone: 10, ironOre: 4 },
    storage: 0,
    logisticRadius: 0,
    hp: 80,
    // Ses archers y entrent : sans eux, elle ne tire pas ; à moitié, deux fois moins vite (`World.runTower`).
    workers: 2,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'archerTower',
    weapon: 'archerBow',
    upgrades: [],
  },
  palisade: {
    label: LORE.buildings.palisade.name,
    sign: LORE.buildings.palisade.sign,
    siteDescription: LORE.buildings.palisade.site,
    description: LORE.buildings.palisade.description,
    effect: LORE.buildings.palisade.effect,
    kind: 'wall',
    category: 'defense',
    width: 1,
    height: 1,
    cost: { wood: 3 },
    storage: 0,
    logisticRadius: 0,
    hp: 40,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'palisade',
    weapon: null,
    upgrades: [],
  },
  forge: {
    label: LORE.buildings.forge.name,
    sign: LORE.buildings.forge.sign,
    siteDescription: LORE.buildings.forge.site,
    description: LORE.buildings.forge.description,
    effect: LORE.buildings.forge.effect,
    kind: 'forge',
    category: 'production',
    width: 2,
    height: 2,
    cost: { wood: 8, stone: 10, ironOre: 4 },
    storage: 30,
    logisticRadius: 0,
    hp: 60,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'forge',
    weapon: null,
    upgrades: [],
  },
  charcoalKiln: {
    label: LORE.buildings.charcoalKiln.name,
    sign: LORE.buildings.charcoalKiln.sign,
    siteDescription: LORE.buildings.charcoalKiln.site,
    description: LORE.buildings.charcoalKiln.description,
    effect: LORE.buildings.charcoalKiln.effect,
    // Un four comme la forge : il consomme sa recette, `burnCharcoal`, et range le charbon dans son coffre.
    kind: 'forge',
    category: 'production',
    width: 2,
    height: 2,
    cost: { stone: 10, wood: 6 },
    storage: 10,
    logisticRadius: 0,
    hp: 50,
    workers: 1,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'charcoalKiln',
    weapon: null,
    upgrades: [],
  },
  grill: {
    label: LORE.buildings.grill.name,
    sign: LORE.buildings.grill.sign,
    siteDescription: LORE.buildings.grill.site,
    description: LORE.buildings.grill.description,
    effect: LORE.buildings.grill.effect,
    // Un four comme le four à charbon : il consomme sa recette, `grillMeat`, et range la viande grillée dans son coffre.
    kind: 'forge',
    category: 'production',
    width: 2,
    height: 2,
    cost: { wood: 8, stone: 4, ironOre: 2 },
    storage: 20,
    // Quelques viandes d'avance : la ville ne la convertit pas sous le nez de ses porteurs (`butcherMeat`).
    demand: { meat: 4 },
    logisticRadius: 0,
    hp: 40,
    workers: 1,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'grill',
    weapon: null,
    upgrades: [],
  },
  brickworks: {
    label: LORE.buildings.brickworks.name,
    sign: LORE.buildings.brickworks.sign,
    siteDescription: LORE.buildings.brickworks.site,
    description: LORE.buildings.brickworks.description,
    effect: LORE.buildings.brickworks.effect,
    // Une forge sur sa propre recette : la chaîne de son ère (`data/eras.ts`), débloquée à son onglet du labo.
    kind: 'forge',
    category: 'production',
    width: 2,
    height: 2,
    cost: { wood: 16, stone: 14 },
    storage: 20,
    logisticRadius: 0,
    hp: 70,
    workers: 1,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'brickworks',
    weapon: null,
    upgrades: [],
  },
  workshop: {
    label: LORE.buildings.workshop.name,
    sign: LORE.buildings.workshop.sign,
    siteDescription: LORE.buildings.workshop.site,
    description: LORE.buildings.workshop.description,
    effect: LORE.buildings.workshop.effect,
    // Une forge sur sa propre recette : la chaîne de son ère (`data/eras.ts`), débloquée à son onglet du labo.
    kind: 'forge',
    category: 'production',
    width: 2,
    height: 2,
    cost: { brick: 16, wood: 10, ironPlate: 4 },
    storage: 20,
    logisticRadius: 0,
    hp: 80,
    workers: 1,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'workshop',
    weapon: null,
    upgrades: [],
  },
  steelworks: {
    label: LORE.buildings.steelworks.name,
    sign: LORE.buildings.steelworks.sign,
    siteDescription: LORE.buildings.steelworks.site,
    description: LORE.buildings.steelworks.description,
    effect: LORE.buildings.steelworks.effect,
    // Une forge sur sa propre recette : la chaîne de son ère (`data/eras.ts`), débloquée à son onglet du labo.
    kind: 'forge',
    category: 'production',
    width: 2,
    height: 2,
    cost: { brick: 30, tools: 8, ironPlate: 10 },
    storage: 30,
    logisticRadius: 0,
    hp: 120,
    workers: 1,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'steelworks',
    weapon: null,
    upgrades: [],
  },
  clinic: {
    label: LORE.buildings.clinic.name,
    sign: LORE.buildings.clinic.sign,
    siteDescription: LORE.buildings.clinic.site,
    description: LORE.buildings.clinic.description,
    effect: LORE.buildings.clinic.effect,
    kind: 'clinic',
    category: 'housing',
    width: 2,
    height: 2,
    cost: { wood: 12, stone: 8, food: 4 },
    storage: 0,
    logisticRadius: 0,
    hp: 60,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'clinic',
    weapon: null,
    upgrades: [],
  },
  purifier: {
    label: LORE.buildings.purifier.name,
    sign: LORE.buildings.purifier.sign,
    siteDescription: LORE.buildings.purifier.site,
    description: LORE.buildings.purifier.description,
    effect: LORE.buildings.purifier.effect,
    kind: 'purifier',
    category: 'production',
    width: 2,
    height: 2,
    cost: { wood: 14, stone: 10, ironOre: 6 },
    storage: 0,
    logisticRadius: 0,
    hp: 50,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    // Pas dès le départ : elle se débloque au labo (recherche « Dépollution », `data/research.ts`).
    plan: false,
    sprite: 'purifier',
    weapon: null,
    upgrades: [],
  },
  barracks: {
    label: LORE.buildings.barracks.name,
    sign: LORE.buildings.barracks.sign,
    siteDescription: LORE.buildings.barracks.site,
    description: LORE.buildings.barracks.description,
    effect: LORE.buildings.barracks.effect,
    kind: 'barracks',
    category: 'defense',
    width: 2,
    height: 2,
    cost: { wood: 20, stone: 14 },
    // Pas de coffre : le recrutement se paie d'un coup, le sac d'abord, puis la ville dans son rayon.
    storage: 0,
    logisticRadius: 0,
    hp: 80,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'barracks',
    weapon: null,
    upgrades: [],
  },
  lab: {
    label: LORE.buildings.lab.name,
    sign: LORE.buildings.lab.sign,
    siteDescription: LORE.buildings.lab.site,
    description: LORE.buildings.lab.description,
    effect: LORE.buildings.lab.effect,
    kind: 'lab',
    category: 'research',
    width: 2,
    height: 2,
    cost: { wood: 14, stone: 10, ironOre: 4 },
    // De quoi recevoir le plus gros coût de recherche, et ce qui reste d'une recherche abandonnée.
    storage: 40,
    logisticRadius: 0,
    hp: 60,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: false,
    plan: false,
    sprite: 'lab',
    weapon: null,
    upgrades: [],
  },
  antenna: {
    label: LORE.buildings.antenna.name,
    sign: LORE.buildings.antenna.sign,
    siteDescription: LORE.buildings.antenna.site,
    description: LORE.buildings.antenna.description,
    effect: LORE.buildings.antenna.effect,
    // Ses étages 2 et 3 sont ses `upgrades` : pas payés d'un coup, mais livrés dans son coffre
    // comme sur un chantier — le sac, la ville dans son rayon, les porteurs (`sim/antenna.ts`).
    kind: 'antenna',
    category: 'research',
    width: 3,
    height: 3,
    cost: { stone: 60, wood: 40, ironPlate: 20 },
    // De quoi recevoir l'étage le plus lourd, le troisième : 92 objets.
    storage: 100,
    logisticRadius: 0,
    hp: 160,
    workers: 0,
    minWorkers: 0,
    menu: true,
    unique: true,
    plan: false,
    // Après « Tenir 5 nuits » : l'objectif 7.
    unlockObjective: 6,
    hallDistance: 8,
    sprite: 'antenna',
    weapon: null,
    upgrades: [
      {
        label: LORE.buildings.antenna.floors[0].name,
        action: LORE.buildings.antenna.floors[0].action,
        description: LORE.buildings.antenna.floors[0].description,
        cost: { ironPlate: 40, coal: 20, radCore: 1 },
        hp: 220,
        weapon: null,
        sprite: 'antenna2',
      },
      {
        label: LORE.buildings.antenna.floors[1].name,
        action: LORE.buildings.antenna.floors[1].action,
        description: LORE.buildings.antenna.floors[1].description,
        cost: { ironPlate: 60, radCore: 2, food: 30 },
        hp: 300,
        weapon: null,
        sprite: 'antenna3',
      },
    ],
  },
  flowerBed: {
    label: LORE.buildings.flowerBed.name,
    sign: LORE.buildings.flowerBed.sign,
    siteDescription: LORE.buildings.flowerBed.site,
    description: LORE.buildings.flowerBed.description,
    effect: LORE.buildings.flowerBed.effect,
    // Une décoration : aucune fonction, un peu de moral (`mood`).
    kind: 'decor',
    category: 'decor',
    width: 1,
    height: 1,
    cost: { wood: 2 },
    storage: 0,
    logisticRadius: 0,
    hp: 10,
    workers: 0,
    minWorkers: 0,
    mood: { amount: 1, radius: 4 },
    menu: true,
    unique: false,
    unlockObjective: 2,
    plan: false,
    sprite: 'flowerBed',
    weapon: null,
    upgrades: [],
  },
  bench: {
    label: LORE.buildings.bench.name,
    sign: LORE.buildings.bench.sign,
    siteDescription: LORE.buildings.bench.site,
    description: LORE.buildings.bench.description,
    effect: LORE.buildings.bench.effect,
    // Une décoration : aucune fonction, un peu de moral (`mood`).
    kind: 'decor',
    category: 'decor',
    width: 1,
    height: 1,
    cost: { wood: 4 },
    storage: 0,
    logisticRadius: 0,
    hp: 15,
    workers: 0,
    minWorkers: 0,
    mood: { amount: 1, radius: 5 },
    menu: true,
    unique: false,
    unlockObjective: 2,
    plan: false,
    sprite: 'bench',
    weapon: null,
    upgrades: [],
  },
  streetLamp: {
    label: LORE.buildings.streetLamp.name,
    sign: LORE.buildings.streetLamp.sign,
    siteDescription: LORE.buildings.streetLamp.site,
    description: LORE.buildings.streetLamp.description,
    effect: LORE.buildings.streetLamp.effect,
    // Une décoration : aucune fonction, un peu de moral (`mood`).
    kind: 'decor',
    category: 'decor',
    width: 1,
    height: 1,
    cost: { wood: 2, stone: 2 },
    storage: 0,
    logisticRadius: 0,
    hp: 20,
    workers: 0,
    minWorkers: 0,
    mood: { amount: 2, radius: 6 },
    menu: true,
    unique: false,
    unlockObjective: 3,
    plan: false,
    sprite: 'streetLamp',
    weapon: null,
    upgrades: [],
  },
  fountain: {
    label: LORE.buildings.fountain.name,
    sign: LORE.buildings.fountain.sign,
    siteDescription: LORE.buildings.fountain.site,
    description: LORE.buildings.fountain.description,
    effect: LORE.buildings.fountain.effect,
    // Une décoration : aucune fonction, un peu de moral (`mood`).
    kind: 'decor',
    category: 'decor',
    width: 2,
    height: 2,
    cost: { stone: 14 },
    storage: 0,
    logisticRadius: 0,
    hp: 40,
    workers: 0,
    minWorkers: 0,
    mood: { amount: 3, radius: 8 },
    menu: true,
    unique: false,
    unlockExplored: 500,
    plan: false,
    sprite: 'fountain',
    weapon: null,
    upgrades: [],
  },
  adamStatue: {
    label: LORE.buildings.adamStatue.name,
    sign: LORE.buildings.adamStatue.sign,
    siteDescription: LORE.buildings.adamStatue.site,
    description: LORE.buildings.adamStatue.description,
    effect: LORE.buildings.adamStatue.effect,
    // Une décoration : aucune fonction, un peu de moral (`mood`).
    kind: 'decor',
    category: 'decor',
    width: 1,
    height: 1,
    cost: { stone: 12, ironPlate: 2 },
    storage: 0,
    logisticRadius: 0,
    hp: 50,
    workers: 0,
    minWorkers: 0,
    mood: { amount: 4, radius: 10 },
    menu: true,
    unique: false,
    unlockObjective: 6,
    plan: false,
    sprite: 'adamStatue',
    weapon: null,
    upgrades: [],
  },
} as const satisfies Record<string, BuildingProto>;

export type BuildingId = keyof typeof BUILDINGS;

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/** Bâtiments proposés dans le menu, dans l'ordre de déclaration. */
export const MENU_BUILDING_IDS = BUILDING_IDS.filter((id) => BUILDINGS[id].menu);

/**
 * Les bâtiments au menu dès le début de la partie. Les autres attendent leur
 * déblocage : un plan d'Ève, un objectif, ou une recherche — d'où le labo,
 * sans lequel rien d'autre ne s'ouvrirait. `validatePrototypes()` vérifie
 * que chaque bâtiment du menu a son chemin. Seul endroit où la liste est
 * définie.
 */
export const START_BUILDINGS = ['home', 'nursery', 'logisticsPost', 'lab', 'farm'] as const satisfies readonly BuildingId[];

/** Le bonus d'un niveau : celui du plus haut niveau, jusqu'à `level`, qui le fixe ; `base` sinon. */
function bonusAt<K extends 'beds' | 'logisticRadius' | 'speed'>(id: BuildingId, level: number, key: K, base: number): number {
  const proto: BuildingProto = BUILDINGS[id];

  for (let at = Math.min(level, proto.upgrades.length + 1); at >= 2; at -= 1) {
    const value = proto.upgrades[at - 2]?.[key];

    if (value !== undefined) return value;
  }
  return base;
}

/** Les lits du bâtiment fini à ce niveau : sa part de l'Habitation de la ville. */
export function bedsOf(id: BuildingId, level = 1): number {
  const proto: BuildingProto = BUILDINGS[id];

  return bonusAt(id, level, 'beds', proto.beds ?? 0);
}

/** Le rayon logistique à ce niveau, en tuiles. */
export function logisticRadiusOf(id: BuildingId, level = 1): number {
  const proto: BuildingProto = BUILDINGS[id];

  return bonusAt(id, level, 'logisticRadius', proto.logisticRadius);
}

/** La part de la durée d'un cycle de production à ce niveau : 1 tel que bâti, moins après. */
export function speedOf(id: BuildingId, level = 1): number {
  return bonusAt(id, level, 'speed', 1);
}

/** Un gisement sur lequel la foreuse se pose : chacun a son nom court au dictionnaire. */
export type DrillDeposit = (typeof BUILDINGS.drill.deposits)[number];

/** Le niveau le plus haut qu'atteint le bâtiment : 1 s'il ne s'améliore pas. */
export function maxLevel(id: BuildingId): number {
  const proto: BuildingProto = BUILDINGS[id];

  return proto.upgrades.length + 1;
}

/** Le bâtiment à ce niveau (1 = tel que bâti). */
export function buildingLevel(id: BuildingId, level: number): BuildingLevel {
  const proto: BuildingProto = BUILDINGS[id];

  return proto.upgrades[level - 2] ?? proto;
}

/** L'amélioration qui suit ce niveau, ou `null` au niveau maximal. */
export function nextUpgrade(id: BuildingId, level: number): BuildingUpgrade | null {
  const proto: BuildingProto = BUILDINGS[id];

  return proto.upgrades[level - 1] ?? null;
}

export function isBuildingId(value: string): value is BuildingId {
  return value in BUILDINGS;
}

/**
 * Réparer : Adam heurte un bâtiment abîmé avec du bois dans le sac, ou
 * appuie sur « Réparer » dans sa fenêtre (le sac, puis la ville dans son
 * rayon). Chaque objet `item` rend `hp` points de vie. Ève, une fois là,
 * répare gratis : Adam, lui, tient la mairie jusqu'à son arrivée.
 */
export const REPAIR = {
  item: 'wood',
  hp: 10,
} as const satisfies { item: ItemId; hp: number };

/**
 * Un bâtiment de l'usine que les mutants abattent (`WAVES.targets`) ne
 * laisse pas un trou : il redevient son chantier, `delivered` de son coût
 * déjà livré (arrondi en dessous). Perdre fait mal, sans tout reprendre.
 */
export const RUIN = {
  delivered: 0.5,
} as const;
