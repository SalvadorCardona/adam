/**
 * Parties de test — contenu pur.
 *
 * Une partie de test s'ouvre par une URL (`/mobile-factory/test`) sur une
 * base déjà construite, pour essayer une fenêtre, un ouvrier ou un chantier
 * sans rejouer les dix premières minutes. Elle n'est pas une sauvegarde
 * figée : `sim/testScenario.ts` la rebâtit à chaque chargement avec les
 * commandes du jeu (chantier posé, « Transférer »), à partir de ce qui est
 * décrit ici. Quand un coût ou une règle change, le scénario suit — ou son
 * test casse, et le dit.
 *
 * Positions en tuiles, relatives au coin haut-gauche de la mairie : la
 * seed fixe tire toujours la même carte, la même clairière, la même mairie.
 *
 * Ajouter un scénario = ajouter une entrée ; `/test/<id>` l'ouvre, `/test`
 * seul ouvre `base`.
 */

import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';
import type { ResearchId } from './research.ts';
import type { Look, PieceId } from './wardrobe.ts';

/** Un bâtiment de la base, posé à (dx, dy) tuiles du coin de la mairie. */
export interface ScenarioBuilding {
  building: BuildingId;
  dx: number;
  dy: number;
  /**
   * Un chantier laissé en cours : ce qu'il a déjà reçu. Sans ce champ, le
   * bâtiment est livré en entier — et fini, s'il n'attend pas de bâtisseurs.
   */
  delivered?: Partial<Record<ItemId, number>>;
}

export interface TestScenarioProto {
  /** Le bandeau « Partie de test » le précise. */
  label: string;
  /** La carte : toujours la même, la partie est déterministe. */
  seed: number;
  /** Dans l'ordre de construction, après la mairie, qui est toujours bâtie. */
  buildings: readonly ScenarioBuilding[];
  /** Le coffre de la mairie, une fois la base bâtie. */
  town: Partial<Record<ItemId, number>>;
  /** Le sac d'Adam. */
  bag: Partial<Record<ItemId, number>>;
  /** Où se tient Adam, en tuiles du coin de la mairie. */
  adam: { dx: number; dy: number };
  /**
   * Rayon, en tuiles, exploré d'office autour de la mairie : la base et ses
   * abords sont connus, le brouillard de guerre commence au-delà. Absent :
   * `SCENARIO_REVEAL`.
   */
  reveal?: number;
  /** Vrai : la partie s'ouvre au crépuscule du premier jour, plutôt qu'au matin — le moment où l'on va dormir. */
  dusk?: boolean;
  /** Recherches déjà finies : ce qu'elles débloquent est au menu de construction d'emblée. */
  research?: readonly ResearchId[];
  /** Le niveau de l'arc d'Adam (`data/gear.ts`) ; absent : l'arc de fortune. */
  gear?: number;
  /**
   * Adam se tient à tant de tuiles du centre de la base mutante la plus
   * proche de la mairie, du côté de la mairie, plutôt qu'à `adam`.
   */
  nearBase?: number;
  /**
   * Adam se tient à tant de tuiles à gauche du coffre fermé le plus proche
   * de la mairie (`data/chests.ts`), ses abords explorés, plutôt qu'à `adam`.
   */
  nearChest?: number;
  /**
   * Une colonie qui ne tient que la prairie de départ (`data/regions.ts`),
   * Adam à tant de tuiles du repaire du gardien de la première région, ses
   * abords explorés, plutôt qu'à `adam`.
   */
  nearLair?: number;
  /**
   * La garde-robe d'Adam : les pièces déjà trouvées, ce qu'il porte, et
   * l'éditeur de personnage ouvert d'emblée (`open`).
   */
  wardrobe?: { found: readonly PieceId[]; look?: Look; open?: boolean };
}

/**
 * Le bord d'eau le plus proche de la mairie de la graine 100, où se pose le
 * puits des parties de test (il puise au bord de l'eau, 26 cases de la mairie).
 */
export const SHORE_SPOT = { dx: 20, dy: 16 } as const;

/** Le rayon exploré d'office autour de la mairie d'une partie de test. */
export const SCENARIO_REVEAL = 30;

export const TEST_SCENARIOS = {
  /**
   * Une petite base au matin du premier jour : la mairie et son stock, une
   * cabane de bûcheron, une ferme et un puits qui tournent, un poste de construction
   * dont les bâtisseurs finissent le labo — bois livré, pierre en route, fer
   * manquant : il attend Adam.
   */
  base: {
    label: 'Petite base',
    seed: 100,
    buildings: [
      { building: 'lumberCamp', dx: -6, dy: 0 },
      { building: 'farm', dx: 6, dy: 0 },
      { building: 'well', ...SHORE_SPOT },
      { building: 'constructionPost', dx: -5, dy: 5 },
      { building: 'lab', dx: 4, dy: 5, delivered: { wood: 14, stone: 3 } },
    ],
    town: { wood: 40, stone: 30, food: 12, water: 12 },
    bag: { wood: 6, stone: 4 },
    adam: { dx: 1, dy: 4 },
  },
  /**
   * Le labo fini à côté d'Adam, et de quoi payer la Fonderie en ville : on
   * la lance, on transfère, et la forge entre au menu de construction.
   */
  lab: {
    label: 'Labo',
    seed: 100,
    buildings: [{ building: 'lab', dx: 4, dy: 5 }],
    town: { wood: 40, stone: 30, ironOre: 12, food: 12, water: 12 },
    bag: {},
    adam: { dx: 3, dy: 4 },
  },
  /**
   * La maison du forestier au sud-est de la mairie, son carré d'herbe nue : on
   * regarde le forestier le planter rang par rang, puis les pousses grandir.
   */
  forest: {
    label: 'Forestier',
    seed: 100,
    buildings: [{ building: 'foresterHouse', dx: 7, dy: 10 }],
    town: { wood: 40, stone: 30, food: 12, water: 12 },
    bag: {},
    adam: { dx: 5, dy: 8 },
  },
  /**
   * La ferme au sud-est de la mairie, son champ d'herbe nue : on regarde ses
   * fermiers semer case par case, les cultures pousser, puis la récolte
   * rentrer au coffre.
   */
  farm: {
    label: 'Ferme',
    seed: 100,
    buildings: [{ building: 'farm', dx: 7, dy: 10 }],
    town: { wood: 40, stone: 30, food: 12, water: 12 },
    bag: {},
    adam: { dx: 5, dy: 8 },
  },
  /**
   * Le soir tombe sur une base de dix ouvriers — bûcherons, bâtisseurs,
   * logisticiens — et une seule Maison de quatre lits : quatre vont s'y
   * coucher, les six autres dorment dehors devant leur travail. On pose une
   * Maison de plus, et le compte des logés monte.
   */
  housing: {
    label: 'Maisons',
    seed: 100,
    buildings: [
      { building: 'lumberCamp', dx: -6, dy: 0 },
      { building: 'constructionPost', dx: -5, dy: 5 },
      { building: 'logisticsPost', dx: 6, dy: 0 },
      { building: 'home', dx: 6, dy: 2 },
    ],
    town: { wood: 40, stone: 30, food: 40, water: 40 },
    bag: { wood: 12, stone: 6 },
    adam: { dx: 1, dy: 4 },
    dusk: true,
  },
  /**
   * Une nurserie vide dans le rayon d'un poste de logistique, et de la
   * nourriture à la mairie : on regarde les logisticiens la lui porter,
   * son stock monter, puis l'enfant naître.
   */
  nursery: {
    label: 'Nurserie',
    seed: 100,
    buildings: [
      { building: 'logisticsPost', dx: 6, dy: 0 },
      { building: 'nursery', dx: 5, dy: 5 },
    ],
    town: { wood: 40, stone: 30, food: 30, water: 20 },
    bag: {},
    adam: { dx: 2, dy: 5 },
  },
  /**
   * L'économie de la ville en trois flèches : les logisticiens rentrent le
   * bois de la cabane (il monte), les bâtisseurs emportent la pierre aux
   * chantiers d'une nurserie, de deux maisons et d'un puits (elle baisse,
   * une bonne minute), et le charbon, que rien n'utilise, stagne. Le bouton
   * au bout du bandeau de la ville ouvre le détail.
   */
  trends: {
    label: 'Tendances',
    seed: 100,
    buildings: [
      { building: 'lumberCamp', dx: -6, dy: 0 },
      { building: 'logisticsPost', dx: -6, dy: 4 },
      { building: 'constructionPost', dx: 6, dy: 0 },
      { building: 'nursery', dx: 5, dy: 5, delivered: {} },
      { building: 'home', dx: 9, dy: 5, delivered: {} },
      { building: 'home', dx: 9, dy: 9, delivered: {} },
      { building: 'well', ...SHORE_SPOT, delivered: {} },
    ],
    town: { wood: 60, stone: 40, coal: 25, food: 40, water: 40 },
    bag: {},
    adam: { dx: 1, dy: 4 },
  },
  /**
   * La caserne finie à côté d'Adam (la Milice est faite), et de quoi recruter
   * à la mairie : nourriture, bois, plaques de fer. On choisit une classe,
   * on recrute, et le compagnon sort après sa formation pour suivre Adam.
   */
  army: {
    label: 'Caserne',
    seed: 100,
    buildings: [{ building: 'barracks', dx: 4, dy: 5 }],
    research: ['militia'],
    town: { wood: 60, stone: 30, food: 60, water: 20, ironPlate: 10 },
    bag: {},
    adam: { dx: 3, dy: 4 },
  },
  /**
   * Adam à l'orée de la base mutante la plus proche, l'arc cerclé de fer au
   * poing : son chef, ses gardiens et son cracheur l'attendent. On esquive
   * le cercle de la massue et les crachats, on abat le chef, le bouclier
   * tombe, puis la base.
   */
  raid: {
    label: 'Base mutante',
    seed: 100,
    buildings: [],
    town: { wood: 40, stone: 30, food: 12, water: 12 },
    bag: {},
    adam: { dx: 1, dy: 4 },
    gear: 1,
    nearBase: 10,
  },
  /**
   * Un coffre à ouvrir : Adam à trois pas à gauche du coffre le plus proche
   * de la mairie. Un pas à droite, il s'ouvre — couvercle qui bascule,
   * gerbe de lumière, confettis —, et le toast « Nouvel objet : … » mène à
   * la garde-robe, où la pièce porte « Nouveau ».
   */
  chest: {
    label: 'Coffre à ouvrir',
    seed: 100,
    buildings: [],
    town: { wood: 40, stone: 30, food: 12, water: 12 },
    bag: {},
    adam: { dx: 1, dy: 4 },
    nearChest: 3,
  },
  /**
   * L'éditeur de personnage ouvert devant la mairie : Adam a déjà trouvé
   * une bonne partie de la garde-robe — lunettes d'aviateur, crête, poncho,
   * chaussons lapin… —, le reste attend sous cadenas. On essaie, on tourne
   * l'aperçu, on valide, et le nouvel Adam marche sur la carte.
   */
  wardrobe: {
    label: 'Garde-robe',
    seed: 100,
    buildings: [{ building: 'lumberCamp', dx: -6, dy: 0 }],
    town: { wood: 40, stone: 30, food: 12, water: 12 },
    bag: {},
    adam: { dx: 1, dy: 4 },
    wardrobe: {
      found: [
        'hairCurly',
        'hairMohawk',
        'eyesBright',
        'beardMustache',
        'topHoodie',
        'topPoncho',
        'pantsPatched',
        'shoesSneakers',
        'shoesBunny',
        'glassesRound',
        'glassesAviator',
        'hatFlower',
        'hatStraw',
      ],
      look: {
        pieces: {
          hair: 'hairMohawk',
          eyes: 'eyesBold',
          beard: 'beardMustache',
          top: 'topPoncho',
          pants: 'pantsPatched',
          shoes: 'shoesSneakers',
          glasses: 'glassesAviator',
          hat: 'hatNone',
        },
        colors: { eyes: 'cyan', hair: 'coral', top: 'cyan' },
      },
      open: true,
    },
  },
  /**
   * La prairie de départ seule conquise : Adam au bord de la première région
   * à conquérir, voilée, son gardien devant son repaire. On l'abat, la région
   * se dévoile et se bâtit ; la carte du monde montre conquises, à conquérir
   * et verrouillées.
   */
  regions: {
    label: 'Régions',
    seed: 100,
    buildings: [],
    town: { wood: 40, stone: 30, food: 12, water: 12 },
    bag: {},
    adam: { dx: 1, dy: 4 },
    nearLair: 8,
  },
} as const satisfies Record<string, TestScenarioProto>;

export type TestScenarioId = keyof typeof TEST_SCENARIOS;

/** Le scénario que `/test` ouvre sans précision. */
export const DEFAULT_TEST_SCENARIO: TestScenarioId = 'base';
