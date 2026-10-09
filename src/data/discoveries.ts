/**
 * Les points d'intérêt de la carte — contenu pur.
 *
 * Explorer doit rapporter : la seed sème des **coffres** (`data/chests.ts`),
 * des **ruines** à fouiller et des **secrets** cachés sous les arbres
 * (`sim/discoveries.ts`), jamais stockés ; seuls ceux qu'Adam a trouvés sont
 * de l'état. Tout se règle ici : la densité (`chance`, la chance qu'un chunk
 * de 32 × 32 tuiles en cache un) et le butin, par **palier** de distance au
 * départ — plus on s'éloigne, plus il y en a et plus ils donnent. Les paliers
 * suivent les anneaux de bases mutantes (`ENEMY_BASE_RINGS` : 34, 54, 76) :
 * le deuxième commence entre le 1er et le 2e, le troisième entre le 2e et le
 * 3e — plus on est loin, plus les gardiens sont durs, et plus ça paie.
 */

import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';

export const DISCOVERY_KINDS = ['chest', 'ruin', 'secret'] as const;

export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];

/** Distance au départ, en tuiles, à partir de laquelle commence chaque palier. */
export const DISCOVERY_TIERS = [0, 44, 66] as const;

/** Une ligne d'une table : un objet, son poids au tirage, et la quantité tirée entre `min` et `max`. */
export interface LootEntry {
  item: ItemId;
  weight: number;
  min: number;
  max: number;
}

/** Une table de butin : `rolls` tirages (entre les deux bornes) dans `pool`, et parfois un objet rare en plus. */
export interface DiscoveryLoot {
  rolls: readonly [number, number];
  pool: readonly LootEntry[];
  rare: { chance: number; pool: readonly LootEntry[] };
}

const e = (item: ItemId, weight: number, min: number, max: number): LootEntry => ({ item, weight, min, max });

/** Un tableau de trois (un par palier). */
type ByTier<T> = readonly [T, T, T];

export interface PoiProto {
  /** La chance qu'un chunk en cache un, par palier. */
  chance: ByTier<number>;
}

/** Un coffre : des ressources, parfois un objet rare — et toujours une pièce de garde-robe (`WARDROBE_LOOT.chest`). */
export interface ChestProto extends PoiProto {
  loot: ByTier<DiscoveryLoot>;
}

/** Un secret : une cache sous un arbre, moins fournie qu'un coffre mais bien plus fréquente. */
export interface SecretProto extends PoiProto {
  loot: ByTier<DiscoveryLoot>;
  /** Adam la trouve quand son centre passe à cette distance de la case, en tuiles. */
  findTiles: number;
}

export const RUIN_REWARDS = ['plan', 'piece', 'research'] as const;

export type RuinReward = (typeof RUIN_REWARDS)[number];

/**
 * Une ruine : une fouille qui donne l'une de ces récompenses, au poids du
 * palier — un **plan** de bâtiment qui entre au menu, une **pièce** de
 * garde-robe rare (`WARDROBE_LOOT.ruin`), ou de quoi avancer la recherche
 * (le butin d'ennemis que les labos réclament).
 */
export interface RuinProto extends PoiProto {
  /** Adam la fouille quand son centre passe à cette distance de la case, en tuiles. */
  searchTiles: number;
  weights: ByTier<Record<RuinReward, number>>;
  /** Les plans qu'un palier peut livrer ; un plan déjà au menu n'est pas redonné. */
  plans: ByTier<readonly BuildingId[]>;
  research: ByTier<DiscoveryLoot>;
}

export const DISCOVERIES = {
  chest: {
    chance: [0.5, 0.6, 0.72],
    loot: [
      {
        rolls: [1, 2],
        pool: [e('wood', 3, 4, 8), e('stone', 3, 3, 6), e('food', 2, 2, 4), e('water', 2, 2, 4), e('coal', 1, 2, 4), e('ironOre', 1, 2, 4)],
        rare: { chance: 0.06, pool: [e('ironPlate', 1, 1, 2)] },
      },
      {
        rolls: [2, 3],
        pool: [e('wood', 2, 6, 10), e('stone', 2, 5, 9), e('food', 2, 3, 6), e('coal', 2, 3, 6), e('ironOre', 2, 3, 6), e('ironPlate', 1, 1, 2)],
        rare: { chance: 0.14, pool: [e('ironPlate', 2, 2, 4), e('wolfFang', 1, 1, 2), e('crabClaw', 1, 1, 2)] },
      },
      {
        rolls: [2, 4],
        pool: [e('stone', 2, 6, 12), e('food', 2, 4, 8), e('coal', 2, 4, 8), e('ironOre', 2, 4, 8), e('ironPlate', 2, 2, 4)],
        rare: { chance: 0.25, pool: [e('ironPlate', 2, 3, 6), e('mutantGoo', 2, 1, 3), e('wolfFang', 1, 1, 2), e('crabClaw', 1, 1, 2), e('radCore', 1, 1, 1)] },
      },
    ],
  },
  ruin: {
    chance: [0.1, 0.18, 0.28],
    searchTiles: 1.8,
    weights: [
      { plan: 1, piece: 2, research: 3 },
      { plan: 2, piece: 2, research: 2 },
      { plan: 3, piece: 2, research: 2 },
    ],
    plans: [['well', 'lumberCamp'], ['quarry', 'foresterHouse', 'constructionPost'], ['watchtower', 'lab']],
    research: [
      { rolls: [1, 2], pool: [e('mutantGoo', 2, 1, 2), e('wolfFang', 1, 1, 2), e('crabClaw', 1, 1, 2)], rare: { chance: 0, pool: [] } },
      { rolls: [2, 3], pool: [e('mutantGoo', 2, 2, 3), e('wolfFang', 2, 1, 3), e('crabClaw', 2, 1, 3)], rare: { chance: 0.15, pool: [e('radCore', 1, 1, 1)] } },
      { rolls: [2, 3], pool: [e('mutantGoo', 2, 2, 4), e('wolfFang', 2, 2, 3), e('crabClaw', 2, 2, 3)], rare: { chance: 0.3, pool: [e('radCore', 1, 1, 2)] } },
    ],
  },
  secret: {
    chance: [0.3, 0.4, 0.5],
    findTiles: 1.2,
    loot: [
      { rolls: [1, 1], pool: [e('wood', 2, 3, 6), e('stone', 2, 3, 5), e('food', 2, 2, 4), e('water', 2, 2, 4)], rare: { chance: 0.05, pool: [e('ironPlate', 1, 1, 1)] } },
      { rolls: [1, 2], pool: [e('stone', 2, 4, 7), e('food', 2, 3, 5), e('coal', 2, 3, 5), e('ironOre', 2, 3, 5)], rare: { chance: 0.12, pool: [e('ironPlate', 1, 1, 2), e('crabClaw', 1, 1, 1)] } },
      { rolls: [1, 2], pool: [e('food', 2, 4, 7), e('coal', 2, 4, 7), e('ironOre', 2, 4, 7), e('ironPlate', 1, 1, 2)], rare: { chance: 0.2, pool: [e('wolfFang', 1, 1, 2), e('mutantGoo', 1, 1, 2)] } },
    ],
  },
} as const satisfies { chest: ChestProto; ruin: RuinProto; secret: SecretProto };

/** Le palier d'un point à `tiles` tuiles du départ : 0, 1 ou 2. */
export function discoveryTier(tiles: number): number {
  let tier = 0;

  for (const [index, from] of DISCOVERY_TIERS.entries()) if (tiles >= from) tier = index;
  return tier;
}
