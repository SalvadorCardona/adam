/**
 * Le réglage « Compteur de performances », sur l'appareil : montrer ou non
 * les FPS, la durée d'un tick et les réveils du scheduler, pour juger un vrai
 * téléphone sans outils. Une préférence, comme les pancartes — ni sauvegarde
 * ni journal de commandes, et « Recommencer » la garde. Chaque accès au
 * stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé du compteur — distincte de celles de la sauvegarde et des autres préférences. */
export const PERF_KEY = 'adam:perf';

export class LocalPerf {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalPerf {
    try {
      return new LocalPerf(globalThis.localStorage ?? null);
    } catch {
      return new LocalPerf(null);
    }
  }

  /** Le compteur est-il affiché ? Non tant qu'on ne l'a pas demandé. */
  public load(): boolean {
    try {
      return this.storage?.getItem(PERF_KEY) === 'true';
    } catch {
      return false;
    }
  }

  public save(on: boolean): void {
    try {
      this.storage?.setItem(PERF_KEY, String(on));
    } catch {
      // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
    }
  }
}
