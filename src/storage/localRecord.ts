/**
 * Le record « nuits tenues après le Signal », sur l'appareil : une clé du
 * `localStorage` à côté de celle du jardin des souvenirs, que « Recommencer »
 * n'efface pas non plus. L'écran titre l'affiche.
 *
 * Un seul nombre : le meilleur de toutes les colonies. Comme pour la
 * sauvegarde et le jardin, chaque accès au stockage peut lever, et aucun ne
 * doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé du record — distincte de `SAVE_KEY` et de `GARDEN_KEY`. */
export const RECORD_KEY = 'adam:signal-record';

export class LocalRecord {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalRecord {
    try {
      return new LocalRecord(globalThis.localStorage ?? null);
    } catch {
      return new LocalRecord(null);
    }
  }

  /** Le record, ou 0 s'il n'y en a pas ou qu'il ne se relit pas. */
  public load(): number {
    try {
      const value = Number(this.storage?.getItem(RECORD_KEY) ?? 0);

      return Number.isInteger(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  /** Garde `nights` s'il bat le record. Renvoie le record, battu ou non. */
  public offer(nights: number): number {
    const best = this.load();

    if (!this.storage || !Number.isInteger(nights) || nights <= best) return best;

    try {
      this.storage.setItem(RECORD_KEY, String(nights));
      return nights;
    } catch {
      return best;
    }
  }
}
