/**
 * Le réglage « Vibrations », sur l'appareil : le téléphone vibre-t-il aux
 * moments clés ? Une préférence, comme le zoom — ni sauvegarde
 * ni journal de commandes, et « Recommencer » la garde. Chaque accès au
 * stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé des vibrations — distincte de celles de la sauvegarde, du jardin, du record, du zoom et des pancartes. */
export const HAPTICS_KEY = 'mobile-factory:haptics';

export class LocalHaptics {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalHaptics {
    try {
      return new LocalHaptics(globalThis.localStorage ?? null);
    } catch {
      return new LocalHaptics(null);
    }
  }

  /** Les vibrations sont-elles permises ? Oui tant qu'on ne les a pas coupées. */
  public load(): boolean {
    try {
      return this.storage?.getItem(HAPTICS_KEY) !== 'false';
    } catch {
      return true;
    }
  }

  public save(on: boolean): void {
    try {
      this.storage?.setItem(HAPTICS_KEY, String(on));
    } catch {
      // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
    }
  }
}
