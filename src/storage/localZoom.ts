/**
 * Le niveau de zoom de la carte, sur l'appareil : une préférence, pas l'état
 * d'une partie — il ne passe ni par la sauvegarde ni par le journal de
 * commandes, et « Recommencer » le garde. Comme les autres clés, chaque accès
 * au stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé du zoom — distincte de celles de la sauvegarde, du jardin et du record. */
export const ZOOM_KEY = 'adam:zoom';

export class LocalZoom {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalZoom {
    try {
      return new LocalZoom(globalThis.localStorage ?? null);
    } catch {
      return new LocalZoom(null);
    }
  }

  /** Le niveau mémorisé, ou `null` s'il n'y en a pas ou qu'il ne se relit pas. */
  public load(): number | null {
    try {
      const raw = this.storage?.getItem(ZOOM_KEY) ?? null;
      const value = raw === null ? Number.NaN : Number(raw);

      return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  }

  public save(level: number): void {
    try {
      this.storage?.setItem(ZOOM_KEY, String(Math.round(level * 1000) / 1000));
    } catch {
      // Mode privé ou stockage plein : le zoom ne survit pas, tant pis.
    }
  }
}
