/**
 * Les succès et la collection — contenu pur.
 *
 * Un succès est une condition sur une **statistique** (`STATS`) : « au moins
 * `goal` ». Les statistiques sont de deux sortes : celles que la partie
 * montre déjà (nuits survivées, bâtiments, niveau d'Adam…), lues sur le monde,
 * et celles que seul le fil des événements raconte (ennemis abattus, coffres
 * ouverts, nuits d'affilée sans perte…), comptées par `sim/achievements.ts`.
 * Ajouter un succès = ajouter une entrée, tant qu'il se dit avec ces
 * statistiques.
 *
 * Quatre difficultés (`ACHIEVEMENT_TIERS`) : des premiers pas, la
 * progression, des défis, et des secrets — ceux-là restent cachés dans la
 * collection tant qu'on ne les a pas obtenus.
 *
 * Certaines récompenses sont cosmétiques : une pièce de la garde-robe d'Adam
 * (`skin`, offerte à chaque colonie, éditeur de personnage) ou un trophée
 * (`TROPHIES` : décoration, variante de bâtiment), qui s'expose à la
 * collection. Les bâtiments rares (`RARE_BUILDINGS`) se « trouvent » en les
 * bâtissant une fois, toutes colonies confondues.
 *
 * Les succès sont à l'appareil, comme le jardin des souvenirs : ils
 * survivent à « Recommencer » (`storage/localCollection.ts`).
 */

import type { BuildingId } from './buildings.ts';
import type { PieceId } from './wardrobe.ts';

/** Ce qu'on peut compter. Les `gauge` se lisent sur le monde, les `run` se cumulent d'un événement à l'autre dans une colonie. */
export const STATS = {
  buildings: { kind: 'gauge' },
  colonists: { kind: 'gauge' },
  nights: { kind: 'gauge' },
  births: { kind: 'gauge' },
  level: { kind: 'gauge' },
  research: { kind: 'gauge' },
  quests: { kind: 'gauge' },
  companions: { kind: 'gauge' },
  bases: { kind: 'gauge' },
  pieces: { kind: 'gauge' },
  signal: { kind: 'gauge' },
  /** Bâtiments rares trouvés, toutes colonies confondues. */
  rares: { kind: 'gauge' },
  kills: { kind: 'run' },
  chests: { kind: 'run' },
  trades: { kind: 'run' },
  chiefs: { kind: 'run' },
  queens: { kind: 'run' },
  healed: { kind: 'run' },
  starved: { kind: 'run' },
  knockouts: { kind: 'run' },
  fallen: { kind: 'run' },
  /** Nuits d'affilée sans qu'un bâtiment tombe. */
  cleanNights: { kind: 'run' },
  /** Nuits d'affilée sans mort de faim ni de soif. */
  fedNights: { kind: 'run' },
} as const satisfies Record<string, { kind: 'gauge' | 'run' }>;

export type StatId = keyof typeof STATS;

export const STAT_IDS = Object.keys(STATS) as StatId[];

/** Les statistiques d'une colonie, que la collection garde le temps de sa partie. */
export type RunStatId = { [K in StatId]: (typeof STATS)[K]['kind'] extends 'run' ? K : never }[StatId];

export const RUN_STAT_IDS = STAT_IDS.filter((id): id is RunStatId => STATS[id].kind === 'run');

export const ACHIEVEMENT_TIERS = ['first', 'progress', 'challenge', 'secret'] as const;

export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];

/** Les trophées : des décorations et des variantes de bâtiments, exposés à la collection. */
export const TROPHIES = {
  flagGarland: { kind: 'decoration', label: 'Guirlande de fanions', description: 'Des fanions de toile rapiécée pour les jours de fête.' },
  gnomeStatue: { kind: 'decoration', label: 'Nain de jardin', description: 'Il a survécu à la fin du monde. Il est fier.' },
  mintBanner: { kind: 'decoration', label: 'Oriflamme menthe', description: 'La vie reprend ses droits, et ça se voit de loin.' },
  goldenHall: { kind: 'variant', label: 'Mairie dorée', description: 'Une mairie repeinte de jaune soleil.' },
  vinedTower: { kind: 'variant', label: 'Tour fleurie', description: 'Une tour de guet envahie de lianes et de fleurs.' },
  paintedDrill: { kind: 'variant', label: 'Foreuse peinte', description: 'Une foreuse aux couleurs de la colonie.' },
} as const satisfies Record<string, { kind: 'decoration' | 'variant'; label: string; description: string }>;

export type TrophyId = keyof typeof TROPHIES;

export const TROPHY_IDS = Object.keys(TROPHIES) as TrophyId[];

export type Reward = { skin: PieceId } | { trophy: TrophyId };

export interface AchievementProto {
  tier: AchievementTier;
  label: string;
  /** Ce qu'il faut faire. Pour un secret, affiché seulement une fois obtenu. */
  description: string;
  stat: StatId;
  goal: number;
  reward?: Reward;
}

export const ACHIEVEMENTS = {
  /* ---------------------------------------------------------- premiers pas */
  firstRoof: { tier: 'first', label: 'Premier toit', description: 'Bâtir la mairie.', stat: 'buildings', goal: 1, reward: { skin: 'hatCap' } },
  firstNight: { tier: 'first', label: 'Une nuit de passée', description: 'Survivre à une nuit.', stat: 'nights', goal: 1 },
  firstShot: { tier: 'first', label: 'Premier tir', description: 'Abattre un ennemi.', stat: 'kills', goal: 1 },
  firstChest: { tier: 'first', label: 'Coup de pot', description: 'Ouvrir un coffre de la carte.', stat: 'chests', goal: 1, reward: { skin: 'hatFlower' } },
  firstChild: { tier: 'first', label: 'Une bouille de plus', description: 'Voir naître un enfant à la nurserie.', stat: 'births', goal: 1, reward: { skin: 'eyesBright' } },
  firstTrade: { tier: 'first', label: 'Bon marché', description: 'Faire un troc avec la caravane.', stat: 'trades', goal: 1 },
  firstLab: { tier: 'first', label: 'Eurêka', description: 'Terminer une recherche au labo.', stat: 'research', goal: 1, reward: { skin: 'glassesRound' } },
  twentyWorkers: { tier: 'first', label: 'Une vraie équipe', description: 'Compter 20 ouvriers dans la colonie.', stat: 'colonists', goal: 20, reward: { skin: 'topHoodie' } },

  /* ------------------------------------------------------------ progression */
  builder10: { tier: 'progress', label: 'Petit hameau', description: 'Avoir 10 bâtiments debout.', stat: 'buildings', goal: 10, reward: { trophy: 'flagGarland' } },
  builder25: { tier: 'progress', label: 'Bourgade', description: 'Avoir 25 bâtiments debout.', stat: 'buildings', goal: 25, reward: { trophy: 'goldenHall' } },
  level5: { tier: 'progress', label: 'Adam s’aguerrit', description: 'Atteindre le niveau 5.', stat: 'level', goal: 5, reward: { skin: 'topJacket' } },
  level10: { tier: 'progress', label: 'Vétéran', description: 'Atteindre le niveau 10.', stat: 'level', goal: 10, reward: { skin: 'hairMohawk' } },
  nights5: { tier: 'progress', label: 'Cinq nuits', description: 'Survivre à 5 nuits.', stat: 'nights', goal: 5, reward: { skin: 'shoesSneakers' } },
  nights20: { tier: 'progress', label: 'Vingt nuits', description: 'Survivre à 20 nuits.', stat: 'nights', goal: 20, reward: { skin: 'topArmor' } },
  quests5: { tier: 'progress', label: 'Les commissions d’Ève', description: 'Mener 5 quêtes d’Ève à bien.', stat: 'quests', goal: 5, reward: { skin: 'beardMustache' } },
  signal: { tier: 'progress', label: 'Le Signal', description: 'Lancer le Signal depuis l’antenne.', stat: 'signal', goal: 1, reward: { skin: 'hatAntenna' } },
  base1: { tier: 'progress', label: 'Premier campement rasé', description: 'Abattre une base mutante.', stat: 'bases', goal: 1, reward: { skin: 'pantsPatched' } },
  base3: { tier: 'progress', label: 'Conquérant', description: 'Abattre 3 bases mutantes.', stat: 'bases', goal: 3, reward: { trophy: 'vinedTower' } },
  army5: { tier: 'progress', label: 'Armée au complet', description: 'Mener 5 compagnons à la fois.', stat: 'companions', goal: 5, reward: { trophy: 'paintedDrill' } },

  /* ----------------------------------------------------------------- défis */
  cleanTen: { tier: 'challenge', label: 'Rempart intact', description: 'Tenir 10 nuits d’affilée sans perdre un bâtiment.', stat: 'cleanNights', goal: 10, reward: { skin: 'shoesRainBoots' } },
  fedTen: { tier: 'challenge', label: 'Ventres pleins', description: 'Tenir 10 nuits d’affilée sans aucun mort de faim ni de soif.', stat: 'fedNights', goal: 10, reward: { skin: 'beardFull' } },
  queenSlain: { tier: 'challenge', label: 'La Reine est tombée', description: 'Abattre la Reine des flaques.', stat: 'queens', goal: 1, reward: { skin: 'eyesStarry' } },
  chiefs3: { tier: 'challenge', label: 'Chasseur de chefs', description: 'Abattre 3 chefs de base.', stat: 'chiefs', goal: 3, reward: { skin: 'glassesGoggles' } },
  rares: { tier: 'challenge', label: 'Collectionneur', description: 'Trouver les 6 bâtiments rares.', stat: 'rares', goal: 6, reward: { trophy: 'mintBanner' } },
  wardrobe20: { tier: 'challenge', label: 'Dressing complet', description: 'Posséder 20 pièces de garde-robe.', stat: 'pieces', goal: 20, reward: { skin: 'pantsGarden' } },

  /* --------------------------------------------------------------- secrets */
  hallFell: { tier: 'secret', label: 'Ça sentait le roussi', description: 'Voir tomber la mairie. Ça arrive aux meilleurs.', stat: 'fallen', goal: 1, reward: { trophy: 'gnomeStatue' } },
  tripleNap: { tier: 'secret', label: 'Sieste forcée', description: 'Tomber 3 fois en une colonie.', stat: 'knockouts', goal: 3, reward: { skin: 'shoesBunny' } },
  dryDiet: { tier: 'secret', label: 'Régime sec', description: 'Perdre un ouvrier de faim ou de soif.', stat: 'starved', goal: 1 },
  treasure10: { tier: 'secret', label: 'Pilleur de coffres', description: 'Ouvrir 10 coffres en une colonie.', stat: 'chests', goal: 10, reward: { skin: 'hatStraw' } },
  mutantFriend: { tier: 'secret', label: 'Ça se soigne', description: 'Guérir un mutant à la clinique.', stat: 'healed', goal: 1, reward: { skin: 'hairBun' } },
  haggler: { tier: 'secret', label: 'Marchand de tapis', description: 'Faire 5 trocs en une colonie.', stat: 'trades', goal: 5, reward: { skin: 'glassesAviator' } },
} as const satisfies Record<string, AchievementProto>;

export type AchievementId = keyof typeof ACHIEVEMENTS;

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];

export function isAchievementId(value: string): value is AchievementId {
  return Object.hasOwn(ACHIEVEMENTS, value);
}

/** La récompense d'un succès, s'il en a une. */
export function rewardOf(id: AchievementId): Reward | undefined {
  return (ACHIEVEMENTS[id] as AchievementProto).reward;
}

/** Les bâtiments rares : on les trouve en les bâtissant, une fois, toutes colonies confondues. */
export const RARE_BUILDINGS = ['forge', 'clinic', 'purifier', 'barracks', 'lab', 'antenna'] as const satisfies readonly BuildingId[];

export type RareBuildingId = (typeof RARE_BUILDINGS)[number];

export function isRareBuilding(value: string): value is RareBuildingId {
  return (RARE_BUILDINGS as readonly string[]).includes(value);
}
