/**
 * La collection : ce qu'on garde des colonies passées — succès obtenus,
 * bâtiments rares trouvés — et, le temps d'une colonie, les compteurs que
 * les succès lisent (`data/achievements.ts`).
 *
 * Comme le jardin des souvenirs, elle n'est pas l'état d'une partie : elle a
 * son propre format, versionné, à part de la sauvegarde
 * (`storage/localCollection.ts` l'écrit sous sa propre clé). Ce module est
 * pur — ni `localStorage` ni DOM — et `decodeCollection` ne lève jamais : une
 * collection illisible redevient vide.
 */

import {
  ACHIEVEMENT_IDS,
  RARE_BUILDINGS,
  RUN_STAT_IDS,
  isAchievementId,
  isRareBuilding,
  rewardOf,
  type AchievementId,
  type RareBuildingId,
  type RunStatId,
  type TrophyId,
} from '../data/achievements.ts';
import type { PieceId } from '../data/wardrobe.ts';

/** Version du format. À incrémenter à chaque changement incompatible de `Collection`. */
export const COLLECTION_VERSION = 1;

/** Les compteurs de la colonie en cours, remis à zéro à chaque nouvelle colonie. */
export interface Run {
  stats: Record<RunStatId, number>;
  /** Un bâtiment est tombé depuis l'aube : la nuit ne compte pas pour la série. */
  lossTonight: boolean;
  /** Un ouvrier est mort de faim ou de soif depuis l'aube. */
  starveTonight: boolean;
}

export interface Collection {
  /** Succès obtenus, dans l'ordre où ils sont tombés. */
  unlocked: AchievementId[];
  /** Bâtiments rares trouvés, dans l'ordre. */
  found: RareBuildingId[];
  run: Run;
}

export function emptyRun(): Run {
  return {
    stats: Object.fromEntries(RUN_STAT_IDS.map((id) => [id, 0])) as Record<RunStatId, number>,
    lossTonight: false,
    starveTonight: false,
  };
}

export function emptyCollection(): Collection {
  return { unlocked: [], found: [], run: emptyRun() };
}

/** Les pièces de garde-robe offertes par les succès obtenus. */
export function earnedSkins(collection: Collection): PieceId[] {
  return collection.unlocked.flatMap((id) => {
    const reward = rewardOf(id);

    return reward && 'skin' in reward ? [reward.skin] : [];
  });
}

/** Les trophées offerts par les succès obtenus. */
export function earnedTrophies(collection: Collection): TrophyId[] {
  return collection.unlocked.flatMap((id) => {
    const reward = rewardOf(id);

    return reward && 'trophy' in reward ? [reward.trophy] : [];
  });
}

export function encodeCollection(collection: Collection): string {
  return JSON.stringify({ version: COLLECTION_VERSION, collection });
}

/**
 * Lit une collection. Ne lève jamais : illisible ou d'une autre version, elle
 * redevient vide. Un succès ou un bâtiment qui n'existe plus est ignoré sans
 * faire perdre les autres.
 */
export function decodeCollection(text: string): Collection {
  try {
    const file: unknown = JSON.parse(text);

    if (!isRecord(file) || file['version'] !== COLLECTION_VERSION || !isRecord(file['collection'])) return emptyCollection();

    const { unlocked, found, run } = file['collection'];

    if (!Array.isArray(unlocked) || !Array.isArray(found) || !isRecord(run) || !isRecord(run['stats'])) return emptyCollection();

    const result = emptyCollection();

    result.unlocked = [...new Set(unlocked.filter((id): id is AchievementId => typeof id === 'string' && isAchievementId(id)))];
    result.found = [...new Set(found.filter((id): id is RareBuildingId => typeof id === 'string' && isRareBuilding(id)))];
    for (const id of RUN_STAT_IDS) {
      const value = run['stats'][id];

      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) result.run.stats[id] = value;
    }
    result.run.lossTonight = run['lossTonight'] === true;
    result.run.starveTonight = run['starveTonight'] === true;
    return result;
  } catch {
    return emptyCollection();
  }
}

/** Combien de succès, de ceux qui existent, sont obtenus. */
export function progressOf(collection: Collection): { done: number; total: number; rares: number; raresTotal: number } {
  return {
    done: ACHIEVEMENT_IDS.filter((id) => collection.unlocked.includes(id)).length,
    total: ACHIEVEMENT_IDS.length,
    rares: collection.found.length,
    raresTotal: RARE_BUILDINGS.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
