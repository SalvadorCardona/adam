/**
 * La collection (succès, bâtiments rares) sur l'appareil : une clé du
 * `localStorage` à côté de celles du jardin et du record, que « Recommencer »
 * n'efface pas non plus.
 *
 * Le format vit dans `sim/collection.ts` ; comme pour la sauvegarde, chaque
 * accès au stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import { decodeCollection, emptyCollection, encodeCollection, type Collection } from '../sim/collection.ts';
import type { SaveStorage } from './localSave.ts';

/** La clé de la collection — distincte de `SAVE_KEY`, `GARDEN_KEY` et `RECORD_KEY`. */
export const COLLECTION_KEY = 'mobile-factory:collection';

export class LocalCollection {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalCollection {
    try {
      return new LocalCollection(globalThis.localStorage ?? null);
    } catch {
      return new LocalCollection(null);
    }
  }

  /** La collection, ou une collection vide s'il n'y en a pas ou qu'elle ne se relit pas. */
  public load(): Collection {
    try {
      const text = this.storage?.getItem(COLLECTION_KEY) ?? null;

      return text === null ? emptyCollection() : decodeCollection(text);
    } catch {
      return emptyCollection();
    }
  }

  /** Écrit la collection. Renvoie `false` si le stockage l'a refusée — le jeu continue quand même. */
  public save(collection: Collection): boolean {
    if (!this.storage) return false;

    try {
      this.storage.setItem(COLLECTION_KEY, encodeCollection(collection));
      return true;
    } catch {
      return false;
    }
  }
}
