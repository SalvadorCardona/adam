/**
 * La toute première partie, sur l'appareil : tant qu'aucune n'a été lancée,
 * l'écran titre rappelle les trois gestes du jeu (marcher, récolter, livrer).
 * Ni sauvegarde ni journal de commandes : « Recommencer » ne la remet pas à
 * zéro. Chaque accès au stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé — distincte de celles de la sauvegarde, du jardin, du record et des réglages. */
export const PLAYED_KEY = 'adam:played';

export class LocalPlayed {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalPlayed {
    try {
      return new LocalPlayed(globalThis.localStorage ?? null);
    } catch {
      return new LocalPlayed(null);
    }
  }

  /** Une partie a-t-elle déjà été lancée sur cet appareil ? Sans stockage : non. */
  public load(): boolean {
    try {
      return this.storage?.getItem(PLAYED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  public save(): void {
    try {
      this.storage?.setItem(PLAYED_KEY, 'true');
    } catch {
      // Mode privé ou stockage plein : les conseils reviendront, tant pis.
    }
  }
}
