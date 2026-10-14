/**
 * Le jardin des souvenirs sur l'appareil : une clé du `localStorage`, à part
 * de la partie en cours.
 *
 * `LocalSave.clear()` efface la partie à « Recommencer » et à la chute de la
 * mairie ; ce qui est ici n'est jamais effacé par le jeu — c'est tout
 * l'intérêt. Le format vit dans `sim/garden.ts` ; comme pour la sauvegarde,
 * chaque accès au stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import { EMPTY_GARDEN, decodeGarden, encodeGarden, type Garden } from '../sim/garden.ts';
import type { SaveStorage } from './localSave.ts';

/** La clé du jardin — distincte de `SAVE_KEY`. */
export const GARDEN_KEY = 'adam:garden';

export class LocalGarden {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalGarden {
    try {
      return new LocalGarden(globalThis.localStorage ?? null);
    } catch {
      return new LocalGarden(null);
    }
  }

  /** Le jardin, ou un jardin vide s'il n'y en a pas ou qu'il ne se relit pas. */
  public load(): Garden {
    try {
      const text = this.storage?.getItem(GARDEN_KEY) ?? null;

      return text === null ? { ...EMPTY_GARDEN } : decodeGarden(text);
    } catch {
      return { ...EMPTY_GARDEN };
    }
  }

  /** Écrit le jardin. Renvoie `false` si le stockage l'a refusé — le jeu continue quand même. */
  public save(garden: Garden): boolean {
    if (!this.storage) return false;

    try {
      this.storage.setItem(GARDEN_KEY, encodeGarden(garden));
      return true;
    } catch {
      return false;
    }
  }
}
