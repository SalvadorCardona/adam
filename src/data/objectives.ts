/**
 * Objectifs — contenu pur.
 *
 * La partie est une suite de **chapitres**, dans l'ordre de la liste. Un
 * chapitre ouvre plusieurs objectifs à la fois, que le joueur remplit dans
 * l'ordre qu'il veut ; chaque objectif réussi l'est pour de bon (sa
 * récompense tombe, il reste coché même si le bâtiment tombe ensuite), et le
 * chapitre suivant s'ouvre quand tous ceux du chapitre sont réussis — avec la
 * récompense du chapitre. Le panneau du haut affiche le chapitre en cours et
 * une ligne par objectif.
 *
 * Le premier chapitre est le tutoriel (la mairie, seule) ; le huitième clôt
 * l'acte I — la colonie vivra ; le dernier est l'Antenne, dont le dernier
 * étage lance le Signal : c'est la victoire, et la partie continue sans fin,
 * des survivants à chaque aube.
 *
 * Ajouter un objectif = ajouter une entrée à un chapitre, et ses textes au
 * dictionnaire anglais. Aucune logique à écrire tant que ses conditions
 * (`Goal`) et sa récompense (`Reward`) existent déjà. Un objectif ne demande
 * que ce qui est à portée quand son chapitre s'ouvre : une recherche du labo,
 * un plan d'Ève, une ère — `objectives.test.ts` le vérifie, chapitre par
 * chapitre.
 *
 * Les conditions restent larges (« tenir 5 nuits ») : elles disent où
 * aller, pas comment. Et elles regardent l'état, pas l'ordre des gestes : une
 * tour posée avant qu'on la demande compte, l'objectif tombe dès que son
 * chapitre s'ouvre.
 *
 * Les quêtes d'Ève (`data/quests.ts`) sont un objectif : « ses demandes » les
 * compte, et chacune garde sa récompense à elle (un plan, un outil). Le
 * conseil est une réplique d'Ève : elle tutoie Adam.
 */

import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';
import { LORE } from './lore.ts';
import { QUEST_IDS } from './quests.ts';

/**
 * Une condition, lue dans l'état de la simulation :
 * - `build` : au moins `count` bâtiments `building` finis et debout, montés
 *   au moins au niveau `level` s'il est donné — l'étage d'une antenne ;
 * - `nights` : `count` nuits survécues **depuis l'ouverture du chapitre**
 *   (l'aube levée, la mairie debout) — « tenir », c'est à partir de là ;
 * - `produce` : `count` objets `item` sortis des machines depuis le début ;
 * - `births` : `count` enfants nés à la nurserie depuis le début ;
 * - `quests` : `count` quêtes d'Ève finies ;
 * - `happiness` : un Bonheur de la ville (`World.happiness`, la somme) d'au moins `count` ;
 * - `mood` : un bonheur **moyen** des habitants (0 à 100, celui de la bulle de
 *   la population) d'au moins `count` — il ne grimpe pas tout seul avec la
 *   population, comme la somme ;
 * - `era` : l'ère d'index `count` (`data/eras.ts`) atteinte, ou une suivante.
 */
export type Goal =
  | { type: 'build'; building: BuildingId; count: number; level?: number }
  | { type: 'nights'; count: number }
  | { type: 'produce'; item: ItemId; count: number }
  | { type: 'births'; count: number }
  | { type: 'quests'; count: number }
  | { type: 'happiness'; count: number }
  | { type: 'mood'; count: number }
  | { type: 'era'; count: number };

/**
 * Ce que rapporte un objectif ou un chapitre réussi. Tout est concret : rien
 * qui annonce un effet que le jeu n'a pas encore.
 * - `items` : déposés dans le sac ; ce qui n'y tient pas va à la mairie ;
 * - `bag` : places ajoutées au sac, pour la suite de la partie ;
 * - `repair` : la mairie retrouve tous ses points de vie.
 */
export interface Reward {
  items?: Partial<Record<ItemId, number>>;
  bag?: number;
  repair?: boolean;
}

export interface ObjectiveProto {
  /** Son identifiant, rangé dans la sauvegarde quand il est réussi : ne jamais le renommer. */
  id: string;
  /** Ce que dit sa ligne dans le panneau du haut, à l'infinitif. */
  title: string;
  /** Le conseil sous la quête, quand l'objectif est choisi — une réplique d'Ève. */
  hint: string;
  /** Toutes vraies en même temps. Une jauge par condition dans le panneau. */
  goals: readonly Goal[];
  reward: Reward;
  /** La phrase de la petite célébration : ce que la récompense change. */
  celebration: string;
}

export interface ChapterProto {
  /** Son nom, en tête du panneau : « Les fondations ». */
  title: string;
  /** Sa vignette en tête du panneau : le bâtiment qui le résume. */
  icon: BuildingId;
  /** Ses objectifs, tous ouverts en même temps, dans l'ordre du panneau. */
  objectives: readonly ObjectiveProto[];
  /** Ce que rapporte le chapitre fini, en plus des objectifs. */
  reward: Reward;
  /** La phrase de la grande célébration, à la fin du chapitre. */
  celebration: string;
  /** Le titre du bandeau, quand ce n'est pas « Chapitre terminé ! » : la fin d'un acte. */
  banner?: string;
}

const { townHall, lumberCamp, quarry, well, home, logisticsPost, constructionPost } = LORE.buildings;
const { pigPen, farm, bakery, grill, drill, charcoalKiln, forge, brickworks, nursery, clinic } = LORE.buildings;
const { barracks, workshop, steelworks, purifier, antenna } = LORE.buildings;
const eve = LORE.characters.eve.name;
const lower = (name: string): string => name.toLowerCase();

export const CHAPTERS = [
  {
    title: 'Le premier toit',
    icon: 'townHall',
    objectives: [
      {
        id: 'townHall',
        title: `Bâtir la ${townHall.name}`,
        hint: 'Du bois et de la pierre au chantier, Adam.',
        goals: [{ type: 'build', building: 'townHall', count: 1 }],
        // Elle se récompense elle-même : son coffre devient le stock de la ville.
        reward: {},
        celebration: 'Le premier toit tient debout : la mairie devient l’entrepôt de la ville.',
      },
    ],
    reward: {},
    celebration: 'Le premier toit tient debout : la mairie devient l’entrepôt de la ville.',
  },
  {
    title: 'Les fondations',
    icon: 'lumberCamp',
    objectives: [
      {
        id: 'lumberCamp',
        title: `Bâtir une ${lower(lumberCamp.name)}`,
        hint: 'Des bûcherons couperont le bois pour nous. « Bûcheronnage », au labo, et la cabane est au menu !',
        goals: [{ type: 'build', building: 'lumberCamp', count: 1 }],
        reward: { items: { stone: 6 } },
        celebration: 'Les haches chantent dans la forêt : +6 pierre.',
      },
      {
        id: 'quarry',
        title: `Bâtir une ${lower(quarry.name)}`,
        hint: 'La carrière taille la pierre dans les ruines. « Extraction », au labo, l’ouvre.',
        goals: [{ type: 'build', building: 'quarry', count: 1 }],
        reward: { items: { wood: 8 } },
        celebration: 'La pierre sort toute seule des ruines : +8 bois.',
      },
      {
        id: 'well',
        title: `Bâtir un ${lower(well.name)}`,
        hint: 'Un puits au bord de l’eau, et plus personne n’a soif. « Puisatier », au labo !',
        goals: [{ type: 'build', building: 'well', count: 1 }],
        reward: { items: { food: 6 } },
        celebration: 'L’eau monte au seau : +6 nourriture pour fêter ça.',
      },
      {
        id: 'home',
        title: `Bâtir une ${lower(home.name)}`,
        hint: 'Quatre lits sous un toit : les ouvriers dormiront au chaud.',
        goals: [{ type: 'build', building: 'home', count: 1 }],
        reward: { items: { wood: 6 } },
        celebration: 'Quatre ouvriers dorment au chaud : +6 bois.',
      },
    ],
    reward: { items: { wood: 20, stone: 12 } },
    celebration: 'La ville a ses fondations : du bois, de la pierre, de l’eau et un toit. +20 bois, +12 pierre.',
  },
  {
    title: 'Passer la nuit',
    icon: 'watchtower',
    objectives: [
      {
        id: 'nights3',
        title: 'Survivre à 3 nuits',
        hint: 'La nuit, reste près de la mairie : ton arc tire tout seul. J’arrive après la troisième !',
        goals: [{ type: 'nights', count: 3 }],
        reward: { bag: 20 },
        celebration: `Trois nuits tenues. ${eve} a un sac de rechange pour Adam : +20 places.`,
      },
      {
        id: 'watchtowers',
        title: 'Bâtir 2 tours de guet',
        hint: 'Deux tours de guet de part et d’autre de la mairie : elles tirent toute la nuit. « Guet », au labo.',
        goals: [{ type: 'build', building: 'watchtower', count: 2 }],
        reward: { items: { wood: 10 } },
        celebration: 'Deux tours veillent sur la ville : +10 bois.',
      },
      {
        id: 'palisade',
        title: 'Bâtir 4 palissades',
        hint: 'Des pieux devant la mairie : un mutant les casse avant de passer. « Fortifications », au labo, contre un peu de gelée.',
        goals: [{ type: 'build', building: 'palisade', count: 4 }],
        reward: { items: { stone: 8 } },
        celebration: 'La palissade tient les mutants à distance : +8 pierre.',
      },
    ],
    reward: { repair: true },
    celebration: `La ville passe la nuit. ${eve} remet la mairie d’aplomb.`,
  },
  {
    title: `Les demandes d’${eve}`,
    icon: 'builderHouse',
    objectives: [
      {
        id: 'eveQuests',
        title: `Répondre aux demandes d’${eve}`,
        hint: 'Tape-moi pour savoir ce qu’il me faut. Chaque demande tenue, un plan ou un outil !',
        goals: [{ type: 'quests', count: QUEST_IDS.length }],
        reward: { repair: true },
        celebration: `Toutes les demandes d’${eve} tenues : elle remet la mairie à neuf.`,
      },
      {
        id: 'logisticsPost',
        title: `Bâtir un ${lower(logisticsPost.name)}`,
        hint: 'Un poste de logistique près de nos producteurs : ses logisticiens vident les coffres dans la mairie.',
        goals: [{ type: 'build', building: 'logisticsPost', count: 1 }],
        reward: { items: { food: 6 } },
        celebration: 'Les caisses circulent toutes seules : +6 nourriture.',
      },
      {
        id: 'constructionPost',
        title: `Bâtir un ${lower(constructionPost.name)}`,
        hint: 'Des bâtisseurs qui livrent et bâtissent nos chantiers ! « Chantiers organisés », au labo.',
        goals: [{ type: 'build', building: 'constructionPost', count: 1 }],
        reward: { items: { wood: 10, stone: 6 } },
        celebration: 'Les casques jaunes prennent le relais : +10 bois, +6 pierre.',
      },
    ],
    reward: { items: { ironOre: 8 } },
    celebration: `${eve} est chez elle : la ville s’organise. +8 minerai de fer.`,
  },
  {
    title: 'Nourrir la ville',
    icon: 'farm',
    objectives: [
      {
        id: 'pigPen',
        title: `Bâtir un ${lower(pigPen.name)}`,
        hint: 'Un enclos, puis ramène un cochon de la forêt : reste près de lui, il te suivra. « Élevage », au labo.',
        goals: [{ type: 'build', building: 'pigPen', count: 1 }],
        reward: { items: { wood: 8 } },
        celebration: 'L’enclos attend ses cochons : +8 bois.',
      },
      {
        id: 'farm',
        title: `Bâtir une ${lower(farm.name)}`,
        hint: 'Une ferme sur de l’herbe nue : ses fermiers sèment tout autour.',
        goals: [{ type: 'build', building: 'farm', count: 1 }],
        reward: { items: { water: 8 } },
        celebration: 'Les premiers semis sortent de terre : +8 eau.',
      },
      {
        id: 'bread',
        title: 'Produire 20 pains',
        hint: `Le blé de la ferme, une ${lower(bakery.name)} pour le cuire : « Boulangerie », au labo.`,
        goals: [{ type: 'produce', item: 'bread', count: 20 }],
        reward: { items: { stone: 10 } },
        celebration: 'Ça sent le pain chaud jusqu’à la mairie : +10 pierre.',
      },
      {
        id: 'firstChild',
        title: 'Voir naître le premier enfant',
        hint: `Une ${lower(nursery.name)}, et six nourritures dedans : un bébé !`,
        goals: [
          { type: 'build', building: 'nursery', count: 1 },
          { type: 'births', count: 1 },
        ],
        reward: { repair: true, bag: 20 },
        celebration: 'Un enfant est né : la colonie a un avenir. Mairie réparée, +20 places dans le sac.',
      },
    ],
    reward: { items: { food: 20 } },
    celebration: 'Plus personne n’a le ventre vide : +20 nourriture.',
  },
  {
    title: 'L’industrie',
    icon: 'drill',
    objectives: [
      {
        id: 'ironOre',
        title: 'Extraire 20 minerais de fer',
        hint: `Une ${lower(drill.name)} au bord des rochers bleus : c’est là que dort le fer.`,
        goals: [
          { type: 'build', building: 'drill', count: 1 },
          { type: 'produce', item: 'ironOre', count: 20 },
        ],
        reward: { items: { wood: 14, stone: 6 } },
        celebration: 'La foreuse tourne : +14 bois, +6 pierre.',
      },
      {
        id: 'coal',
        title: 'Produire 20 charbons',
        hint: `Un ${lower(charcoalKiln.name)} cuit le bois en charbon. « Fonderie », au labo, l’ouvre avec la forge.`,
        goals: [{ type: 'produce', item: 'coal', count: 20 }],
        reward: { items: { wood: 12 } },
        celebration: 'Le four fume tout le jour : +12 bois.',
      },
      {
        id: 'ironPlate',
        title: 'Produire 10 plaques de fer',
        hint: `La ${lower(forge.name)} fond le fer et le charbon en plaques : nos tours en ont besoin.`,
        goals: [{ type: 'produce', item: 'ironPlate', count: 10 }],
        reward: { items: { ironOre: 10 } },
        celebration: 'Les premières plaques sortent de la forge : +10 minerai de fer.',
      },
      {
        id: 'brick',
        title: 'Produire 20 briques',
        hint: `La ${lower(brickworks.name)} s’apprend au labo une fois au Bourg : passe à l’ère suivante depuis la mairie !`,
        goals: [{ type: 'produce', item: 'brick', count: 20 }],
        reward: { items: { stone: 12 } },
        celebration: 'Des briques rouges, empilées comme des pains : +12 pierre.',
      },
    ],
    reward: { items: { ironPlate: 4, coal: 6 } },
    celebration: 'Les cheminées fument : la ville sait fondre et cuire. +4 plaques de fer, +6 charbon.',
  },
  {
    title: 'Une ville où l’on veut vivre',
    icon: 'home',
    objectives: [
      {
        id: 'clinic',
        title: `Bâtir une ${lower(clinic.name)}`,
        hint: 'Un mutant assommé se soigne : « Médecine de fortune », au labo, contre de la gelée.',
        goals: [{ type: 'build', building: 'clinic', count: 1 }],
        reward: { items: { food: 10 } },
        celebration: 'La clinique ouvre ses lits : +10 nourriture.',
      },
      {
        id: 'grilledMeat',
        title: 'Produire 20 viandes grillées',
        hint: `La viande de l’élevage sur la braise d’un ${lower(grill.name)} : ça nourrit mieux ! « Grillades », au labo.`,
        goals: [{ type: 'produce', item: 'grilledMeat', count: 20 }],
        reward: { items: { wood: 10, stone: 6 } },
        celebration: 'Le grill crépite, la ville se régale : +10 bois, +6 pierre.',
      },
      {
        id: 'happiness',
        title: 'Atteindre 80 de Bonheur moyen',
        hint: 'Un lit pour chacun, et des fleurs, des bancs, des lampadaires près des maisons : le moral monte à chaque aube.',
        goals: [{ type: 'mood', count: 80 }],
        reward: { items: { food: 10 } },
        celebration: 'On sourit dans les rues : +10 nourriture.',
      },
    ],
    reward: { items: { brick: 10 } },
    celebration: 'La ville a ses soins, ses repas chauds et ses sourires. +10 briques.',
  },
  {
    title: 'Tenir',
    icon: 'archerTower',
    objectives: [
      {
        id: 'nights5',
        title: 'Tenir 5 nuits',
        hint: 'Des tours tout autour de la mairie, et toi au milieu. Cinq nuits, et on tient, Adam !',
        goals: [{ type: 'nights', count: 5 }],
        reward: {},
        celebration: 'Cinq nuits de plus : la ville ne plie pas.',
      },
      {
        id: 'archerTowers',
        title: 'Bâtir 2 tours d’archers',
        hint: 'Deux archers par tour, et les vagues fondent. « Fortifications », au labo.',
        goals: [{ type: 'build', building: 'archerTower', count: 2 }],
        reward: { items: { wood: 12, stone: 8 } },
        celebration: 'Les archers prennent leur poste : +12 bois, +8 pierre.',
      },
      {
        id: 'barracks',
        title: `Bâtir une ${lower(barracks.name)}`,
        hint: 'Une escorte pour toi : « Milice », au labo, contre deux crocs de loup.',
        goals: [{ type: 'build', building: 'barracks', count: 1 }],
        reward: { items: { food: 10 } },
        celebration: 'La caserne recrute : +10 nourriture.',
      },
    ],
    reward: {},
    celebration: `La colonie vivra. ${eve} a une idée : une ${lower(antenna.name)} pour appeler d’autres survivants.`,
    banner: LORE.signal.actOne,
  },
  {
    title: 'Préparer le Signal',
    icon: 'steelworks',
    objectives: [
      {
        id: 'industrialEra',
        title: 'Atteindre la Cité industrielle',
        hint: 'Les ères se passent à la mairie, « Ères » : chaque palier ouvre ses recherches au labo.',
        goals: [{ type: 'era', count: 3 }],
        reward: { items: { brick: 10 } },
        celebration: 'La cité gronde : +10 briques.',
      },
      {
        id: 'tools',
        title: 'Produire 10 outils',
        hint: `Un ${lower(workshop.name)} façonne des outils avec plaques et bois : « Outillage », au labo de la Ville.`,
        goals: [{ type: 'produce', item: 'tools', count: 10 }],
        reward: { items: { ironPlate: 6 } },
        celebration: 'Des outils pour tout le monde : +6 plaques de fer.',
      },
      {
        id: 'steel',
        title: 'Produire 10 aciers',
        hint: `Une ${lower(steelworks.name)} coule l’acier, une fois la Cité industrielle atteinte : « Haut fourneau », au labo.`,
        goals: [{ type: 'produce', item: 'steel', count: 10 }],
        reward: { items: { coal: 10 } },
        celebration: 'L’acier coule : +10 charbon.',
      },
      {
        id: 'purifier',
        title: `Bâtir une ${lower(purifier.name)}`,
        hint: 'La boue violette se lave : « Dépollution », au labo, et une station au bord des terres polluées.',
        goals: [{ type: 'build', building: 'purifier', count: 1 }],
        reward: { items: { stone: 12 } },
        celebration: 'La terre redevient saine : +12 pierre.',
      },
    ],
    reward: { items: { ironPlate: 10, food: 20 } },
    celebration: 'Tout est prêt pour l’Antenne : +10 plaques de fer, +20 nourriture.',
  },
  {
    title: 'Le Signal',
    icon: 'antenna',
    objectives: [
      {
        id: 'antenna',
        title: `Bâtir l’${antenna.name}`,
        hint: 'Une antenne à 8 cases de la mairie, trois étages : il faudra des cœurs de la Reine, et la défendre !',
        goals: [{ type: 'build', building: 'antenna', count: 1, level: 3 }],
        reward: {},
        celebration: LORE.signal.answer,
      },
    ],
    reward: {},
    celebration: LORE.signal.answer,
  },
] as const satisfies readonly ChapterProto[];

/** Un objectif, tel que la sauvegarde le range. */
export type ObjectiveId = (typeof CHAPTERS)[number]['objectives'][number]['id'];

/** Tous les objectifs, chapitre après chapitre, chacun avec l'index de son chapitre. */
export const OBJECTIVES: readonly (ObjectiveProto & { id: ObjectiveId; chapter: number })[] = CHAPTERS.flatMap((chapter, index) =>
  (chapter.objectives as readonly ObjectiveProto[]).map((objective) => ({ ...objective, id: objective.id as ObjectiveId, chapter: index })),
);

export const OBJECTIVE_IDS: readonly ObjectiveId[] = OBJECTIVES.map((objective) => objective.id);

/** L'objectif `id`. */
export function objectiveProto(id: ObjectiveId): ObjectiveProto & { chapter: number } {
  return OBJECTIVES.find((objective) => objective.id === id)!;
}

/** Le chapitre qui clôt l'acte I : celui qui a son bandeau. */
export const ACT_ONE_CHAPTER: number = CHAPTERS.findIndex((chapter) => 'banner' in chapter);

/**
 * La chaîne d'avant les chapitres (version 10 de la sauvegarde), dans son
 * ordre : l'index d'un ancien objectif y donne son objectif d'aujourd'hui.
 */
export const LEGACY_OBJECTIVES: readonly ObjectiveId[] = ['townHall', 'nights3', 'eveQuests', 'ironOre', 'firstChild', 'nights5', 'antenna'];

/**
 * Places ajoutées au sac par les objectifs réussis et les `chapter` premiers
 * chapitres : la capacité se relit, elle ne se sauvegarde pas.
 */
export function objectiveBagBonus(done: Iterable<ObjectiveId>, chapter: number): number {
  let bonus = 0;

  for (const id of new Set(done)) bonus += objectiveProto(id)?.reward.bag ?? 0;
  for (const proto of (CHAPTERS as readonly ChapterProto[]).slice(0, chapter)) bonus += proto.reward.bag ?? 0;
  return bonus;
}
