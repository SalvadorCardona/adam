/**
 * La garde-robe d'Adam — contenu pur.
 *
 * Adam se dessine en **calques** (`art/adamLook.ts`) : peau, yeux, cheveux,
 * barbe, haut, pantalon, chaussures, lunettes, chapeau. Chaque calque
 * réglable est un **emplacement** (`LOOK_SLOTS`) où l'on choisit une
 * **pièce** (`PIECES`) ; trois d'entre eux prennent aussi une couleur de la
 * palette (`LOOK_COLORS` : les yeux, les cheveux — barbe comprise —, le haut).
 *
 * Quelques pièces se portent dès le départ (`starter`) ; les autres se
 * **trouvent** en jouant (`WARDROBE_LOOT`) : un coffre ouvert
 * (`data/chests.ts`), un objectif réussi, une base mutante abattue — plus
 * généreuse plus elle est loin (`BASE_WARDROBE_LOOT`) —, son chef, la Reine,
 * et parfois une bête. Le tirage est un
 * hachage de la seed et de ce qui l'a donné (`sim/wardrobe.ts`), jamais le PRNG
 * du monde : trouver une pièce ne change rien au reste de la partie.
 *
 * Seuls l'apparence choisie (`Player.look`), les pièces trouvées
 * (`Player.wardrobe`) et celles pas encore regardées dans l'éditeur
 * (`Player.unseenPieces`) sont de l'état.
 */

import type { Tone } from './artDirection.ts';

/** Les emplacements, dans l'ordre des onglets de l'éditeur. */
export const LOOK_SLOTS = ['hair', 'eyes', 'beard', 'top', 'pants', 'shoes', 'glasses', 'hat'] as const;

export type LookSlot = (typeof LOOK_SLOTS)[number];

/** Les raretés, de la plus courante à la plus rare : `weight` pèse au tirage d'une source qui ne précise rien. */
export const RARITIES = {
  common: { weight: 6 },
  rare: { weight: 3 },
  epic: { weight: 1 },
} as const satisfies Record<string, { weight: number }>;

export type Rarity = keyof typeof RARITIES;

export const RARITY_IDS = Object.keys(RARITIES) as Rarity[];

export interface PieceProto {
  slot: LookSlot;
  label: string;
  rarity: Rarity;
  /** Portée dès le départ : jamais à trouver. */
  starter?: boolean;
}

export const PIECES = {
  hairShort: { slot: 'hair', label: 'Épi rebelle', rarity: 'common', starter: true },
  hairBuzz: { slot: 'hair', label: 'Coupe rase', rarity: 'common', starter: true },
  hairCurly: { slot: 'hair', label: 'Boucles', rarity: 'common' },
  hairMohawk: { slot: 'hair', label: 'Crête', rarity: 'rare' },
  hairBun: { slot: 'hair', label: 'Chignon de jardinier', rarity: 'common' },

  eyesBold: { slot: 'eyes', label: 'Regard décidé', rarity: 'common', starter: true },
  eyesSleepy: { slot: 'eyes', label: 'Paupières lourdes', rarity: 'common', starter: true },
  eyesBright: { slot: 'eyes', label: 'Yeux pétillants', rarity: 'common' },
  eyesWink: { slot: 'eyes', label: 'Clin d’œil', rarity: 'rare' },
  eyesStarry: { slot: 'eyes', label: 'Yeux étoilés', rarity: 'epic' },

  beardNone: { slot: 'beard', label: 'Rasé de près', rarity: 'common', starter: true },
  beardStubble: { slot: 'beard', label: 'Barbe de trois jours', rarity: 'common', starter: true },
  beardShort: { slot: 'beard', label: 'Barbe courte', rarity: 'common', starter: true },
  beardMustache: { slot: 'beard', label: 'Moustache en guidon', rarity: 'common' },
  beardFull: { slot: 'beard', label: 'Barbe de trappeur', rarity: 'rare' },
  beardBraid: { slot: 'beard', label: 'Barbe tressée', rarity: 'epic' },

  topTunic: { slot: 'top', label: 'Tunique ceinturée', rarity: 'common', starter: true },
  topHoodie: { slot: 'top', label: 'Sweat à capuche', rarity: 'common' },
  topJacket: { slot: 'top', label: 'Veste de chantier', rarity: 'rare' },
  topPoncho: { slot: 'top', label: 'Poncho rayé', rarity: 'rare' },
  topArmor: { slot: 'top', label: 'Plastron de récup', rarity: 'epic' },

  pantsCargo: { slot: 'pants', label: 'Pantalon cargo', rarity: 'common', starter: true },
  pantsShorts: { slot: 'pants', label: 'Short', rarity: 'common', starter: true },
  pantsPatched: { slot: 'pants', label: 'Pantalon rapiécé', rarity: 'common' },
  pantsStriped: { slot: 'pants', label: 'Pantalon rayé', rarity: 'rare' },
  pantsGarden: { slot: 'pants', label: 'Pantalon fleuri', rarity: 'epic' },

  shoesBoots: { slot: 'shoes', label: 'Godillots', rarity: 'common', starter: true },
  shoesSandals: { slot: 'shoes', label: 'Sandales', rarity: 'common', starter: true },
  shoesSneakers: { slot: 'shoes', label: 'Baskets', rarity: 'common' },
  shoesRainBoots: { slot: 'shoes', label: 'Bottes de pluie', rarity: 'rare' },
  shoesBunny: { slot: 'shoes', label: 'Chaussons lapin', rarity: 'epic' },

  glassesNone: { slot: 'glasses', label: 'Sans lunettes', rarity: 'common', starter: true },
  glassesRound: { slot: 'glasses', label: 'Lunettes rondes', rarity: 'common' },
  glassesAviator: { slot: 'glasses', label: 'Lunettes d’aviateur', rarity: 'rare' },
  glassesGoggles: { slot: 'glasses', label: 'Lunettes de soudeur', rarity: 'epic' },

  hatNone: { slot: 'hat', label: 'Tête nue', rarity: 'common', starter: true },
  hatBandana: { slot: 'hat', label: 'Bandana', rarity: 'common', starter: true },
  hatFlower: { slot: 'hat', label: 'Fleur à l’oreille', rarity: 'common' },
  hatCap: { slot: 'hat', label: 'Casquette', rarity: 'common' },
  hatStraw: { slot: 'hat', label: 'Chapeau de paille', rarity: 'rare' },
  hatAntenna: { slot: 'hat', label: 'Antenne bricolée', rarity: 'epic' },
} as const satisfies Record<string, PieceProto>;

export type PieceId = keyof typeof PIECES;

export const PIECE_IDS = Object.keys(PIECES) as PieceId[];

/** Les emplacements qui prennent une couleur, et les tons de la palette proposés — le premier est celui par défaut. */
export const LOOK_COLORS = {
  eyes: ['ink', 'cyan', 'mint', 'violet', 'orange'],
  /** Les cheveux et la barbe : l'indigo remplace le brun (`docs/art-direction.md`). */
  hair: ['ink', 'orange', 'yellow', 'coral', 'violet'],
  /** L'orange est la teinte des humains : le haut par défaut. */
  top: ['orange', 'coral', 'yellow', 'cyan', 'violet'],
} as const satisfies Partial<Record<LookSlot, readonly Tone[]>>;

export type ColorSlot = keyof typeof LOOK_COLORS;

export const COLOR_SLOTS = Object.keys(LOOK_COLORS) as ColorSlot[];

/** Une apparence : une pièce par emplacement, une couleur par emplacement coloré. */
export interface Look {
  pieces: Record<LookSlot, PieceId>;
  colors: Record<ColorSlot, Tone>;
}

/** L'Adam de départ : épi rebelle, regard décidé, barbe courte, tunique ceinturée, godillots. */
export const DEFAULT_LOOK: Look = {
  pieces: {
    hair: 'hairShort',
    eyes: 'eyesBold',
    beard: 'beardShort',
    top: 'topTunic',
    pants: 'pantsCargo',
    shoes: 'shoesBoots',
    glasses: 'glassesNone',
    hat: 'hatNone',
  },
  colors: { eyes: 'ink', hair: 'ink', top: 'orange' },
};

/** Ce qui fait trouver une pièce. */
export const LOOT_SOURCES = ['objective', 'enemyBase', 'chief', 'queen', 'beast', 'chest', 'ruin'] as const;

export type LootSource = (typeof LOOT_SOURCES)[number];

export interface WardrobeDrop {
  /** La chance d'en trouver une, de 0 à 1. */
  chance: number;
  /**
   * Le poids de chaque rareté au tirage. Tant qu'il reste une pièce à trouver
   * dans ces raretés, l'une d'elles tombe ; sinon une autre pièce qui manque.
   */
  weights: Partial<Record<Rarity, number>>;
  /** Combien de tirages : une par défaut. */
  count?: number;
}

/** Les sources qui ne dépendent de rien : la base et son chef dépendent de son niveau (`BASE_WARDROBE_LOOT`). */
export type FlatLootSource = Exclude<LootSource, 'enemyBase' | 'chief'>;

/**
 * Ce que donne chaque source : un objectif réussi en donne toujours une
 * (plutôt courante), un coffre aussi (de tout), la Reine une épique ; une
 * bête — crabe, loup, gardien — parfois une courante.
 */
export const WARDROBE_LOOT = {
  objective: { chance: 1, weights: { common: 3, rare: 1 } },
  queen: { chance: 1, weights: { epic: 1, rare: 1 } },
  beast: { chance: 0.05, weights: { common: 1 } },
  chest: { chance: 1, weights: { common: 3, rare: 2, epic: 1 } },
  /** Une ruine fouillée : jamais de courante, c'est un lieu rare (`DISCOVERIES.ruin`). */
  ruin: { chance: 1, weights: { rare: 2, epic: 1 } },
} as const satisfies Record<FlatLootSource, WardrobeDrop>;

/**
 * Une base abattue et son chef, par niveau (`[level - 1]`) : plus la base est
 * loin de la mairie, plus elle donne de pièces, et plus rares.
 */
export const BASE_WARDROBE_LOOT = [
  { enemyBase: { chance: 1, weights: { common: 3, rare: 2 } }, chief: { chance: 1, weights: { common: 1, rare: 2 } } },
  { enemyBase: { chance: 1, count: 2, weights: { common: 1, rare: 3, epic: 1 } }, chief: { chance: 1, weights: { rare: 2, epic: 1 } } },
  { enemyBase: { chance: 1, count: 3, weights: { rare: 2, epic: 2 } }, chief: { chance: 1, count: 2, weights: { rare: 1, epic: 2 } } },
] as const satisfies readonly Record<'enemyBase' | 'chief', WardrobeDrop>[];

/** Ce que donne la source `source` ; `level` ne compte que pour une base et son chef. */
export function wardrobeDrop(source: LootSource, level = 1): WardrobeDrop {
  if (source === 'enemyBase' || source === 'chief') {
    return BASE_WARDROBE_LOOT[Math.max(0, Math.min(BASE_WARDROBE_LOOT.length - 1, level - 1))]![source];
  }
  return WARDROBE_LOOT[source];
}

/**
 * Une pièce qui tombe quand Adam a déjà tout : à la place, du Prestige
 * (`World.prestige`) — jamais un doublon.
 */
export const WARDROBE_SPARE = { prestige: 5 } as const;

/** Les pièces portées dès le départ. */
export function isStarter(piece: PieceId): boolean {
  return (PIECES[piece] as PieceProto).starter === true;
}

/** Les pièces d'un emplacement, dans l'ordre du catalogue. */
export function piecesOf(slot: LookSlot): PieceId[] {
  return PIECE_IDS.filter((id) => PIECES[id].slot === slot);
}

/** Une copie de l'apparence, qu'on peut modifier sans toucher à l'autre. */
export function copyLook(look: Look): Look {
  return { pieces: { ...look.pieces }, colors: { ...look.colors } };
}

/** Deux apparences identiques ? */
export function sameLook(a: Look, b: Look): boolean {
  return (
    LOOK_SLOTS.every((slot) => a.pieces[slot] === b.pieces[slot]) &&
    COLOR_SLOTS.every((slot) => a.colors[slot] === b.colors[slot])
  );
}
