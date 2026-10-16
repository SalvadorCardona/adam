/**
 * Le réglage « Contraste élevé », sur l'appareil : fonds de cartes opaques,
 * texte indigo plus foncé, toasts sur fond blanc. Une préférence
 * d'accessibilité, comme les pancartes — ni sauvegarde ni journal de
 * commandes, et « Recommencer » la garde. Chaque accès au stockage peut
 * lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé du contraste — distincte de celles de la sauvegarde, du jardin, du record et du zoom. */
export const CONTRAST_KEY = 'adam:contrast';

export class LocalContrast {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalContrast {
    try {
      return new LocalContrast(globalThis.localStorage ?? null);
    } catch {
      return new LocalContrast(null);
    }
  }

  /** Le contraste élevé est-il demandé ? Non tant qu'on ne l'a pas choisi. */
  public load(): boolean {
    try {
      return this.storage?.getItem(CONTRAST_KEY) === 'true';
    } catch {
      return false;
    }
  }

  public save(on: boolean): void {
    try {
      this.storage?.setItem(CONTRAST_KEY, String(on));
    } catch {
      // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
    }
  }
}
