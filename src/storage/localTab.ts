/**
 * Le verrou d'onglet : deux onglets sur la même partie s'écraseraient la
 * sauvegarde l'un l'autre. La clé `adam:tab` porte l'identifiant de
 * l'onglet qui a la main — le dernier arrivé, ou celui qui l'a reprise. Un
 * onglet qui ne la porte plus n'écrit plus rien et propose de la reprendre.
 *
 * Sans stockage (navigation privée, stockage bloqué), il n'y a ni sauvegarde
 * à protéger ni concurrent : le verrou est toujours tenu.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé de l'onglet qui a la main. */
export const TAB_KEY = 'adam:tab';

export class TabLock {
  public readonly id: string;

  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null, id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`) {
    this.storage = storage;
    this.id = id;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): TabLock {
    try {
      return new TabLock(globalThis.localStorage ?? null);
    } catch {
      return new TabLock(null);
    }
  }

  /** Prend la main : l'onglet qui la tenait la perd. */
  public claim(): void {
    try {
      this.storage?.setItem(TAB_KEY, this.id);
    } catch {
      // Stockage refusé : pas de sauvegarde à protéger.
    }
  }

  /** Cet onglet a-t-il la main ? Faux dès qu'un autre onglet l'a prise. */
  public held(): boolean {
    try {
      const owner = this.storage?.getItem(TAB_KEY) ?? null;

      return owner === null || owner === this.id;
    } catch {
      return true;
    }
  }
}
