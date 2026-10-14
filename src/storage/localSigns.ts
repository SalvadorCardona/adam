/**
 * Le réglage « Pancartes », sur l'appareil : montrer ou non, sur la carte,
 * le nom de chaque bâtiment. Une préférence, comme le zoom — ni sauvegarde
 * ni journal de commandes, et « Recommencer » la garde. Chaque accès au
 * stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé des pancartes — distincte de celles de la sauvegarde, du jardin, du record et du zoom. */
export const SIGNS_KEY = 'adam:signs';

export class LocalSigns {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalSigns {
    try {
      return new LocalSigns(globalThis.localStorage ?? null);
    } catch {
      return new LocalSigns(null);
    }
  }

  /** Les pancartes sont-elles affichées ? Oui tant qu'on ne les a pas masquées. */
  public load(): boolean {
    try {
      return this.storage?.getItem(SIGNS_KEY) !== 'false';
    } catch {
      return true;
    }
  }

  public save(on: boolean): void {
    try {
      this.storage?.setItem(SIGNS_KEY, String(on));
    } catch {
      // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
    }
  }
}
