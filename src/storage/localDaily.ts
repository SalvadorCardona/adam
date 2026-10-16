/**
 * Le meilleur score de la carte du jour, sur l'appareil : une clé du
 * `localStorage` (`adam:daily`) à côté de la sauvegarde, que « Recommencer »
 * n'efface pas.
 *
 * Un seul jour est gardé : la date UTC et le meilleur score de ce jour-là. Le
 * lendemain, la carte est autre et le score repart de zéro. Comme ailleurs,
 * chaque accès au stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé du meilleur score du jour — distincte de la sauvegarde de la partie du jour. */
export const DAILY_KEY = 'adam:daily';

export class LocalDaily {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalDaily {
    try {
      return new LocalDaily(globalThis.localStorage ?? null);
    } catch {
      return new LocalDaily(null);
    }
  }

  /** Le meilleur score de `date`, ou 0 s'il n'y en a pas, qu'il date d'un autre jour ou qu'il ne se relit pas. */
  public best(date: string): number {
    try {
      const raw: unknown = JSON.parse(this.storage?.getItem(DAILY_KEY) ?? 'null');

      if (typeof raw !== 'object' || raw === null) return 0;

      const { date: saved, best } = raw as Record<string, unknown>;

      return saved === date && typeof best === 'number' && Number.isInteger(best) && best > 0 ? best : 0;
    } catch {
      return 0;
    }
  }

  /** Garde `score` s'il bat le meilleur de `date`. Renvoie le meilleur, battu ou non. */
  public offer(date: string, score: number): number {
    const best = this.best(date);

    if (!this.storage || !Number.isInteger(score) || score <= best) return best;

    try {
      this.storage.setItem(DAILY_KEY, JSON.stringify({ date, best: score }));
      return score;
    } catch {
      return best;
    }
  }
}
