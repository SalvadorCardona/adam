/**
 * Le compteur de performances (réglage « Compteur de performances ») : les
 * images par seconde, la durée moyenne d'un tick de simulation et les réveils
 * du scheduler par tick. `main.ts` lui donne chaque frame et chaque tick
 * mesurés ; il en rend une moyenne toutes les `PERF_WINDOW_MS`, que le HUD
 * affiche — assez lent pour se lire, assez vif pour voir un ralentissement.
 * Rien n'est envoyé nulle part.
 */

/** La fenêtre de la moyenne, en millisecondes. */
export const PERF_WINDOW_MS = 500;

export interface PerfReading {
  fps: number;
  /** Durée moyenne d'un tick, en millisecondes ; 0 sans tick (pause). */
  tickMs: number;
  /** Réveils du scheduler par tick, en moyenne ; 0 sans tick. */
  wakes: number;
}

export class PerfSampler {
  private elapsed = 0;
  private frames = 0;
  private ticks = 0;
  private tickTime = 0;
  private wakes = 0;

  /** Un tick mesuré : sa durée et les réveils qu'il a traités. */
  public tick(ms: number, wakes: number): void {
    this.ticks += 1;
    this.tickTime += ms;
    this.wakes += wakes;
  }

  /** Une frame de `deltaMs` ; rend la moyenne de la fenêtre quand elle se ferme, sinon `null`. */
  public frame(deltaMs: number): PerfReading | null {
    this.elapsed += deltaMs;
    this.frames += 1;
    if (this.elapsed < PERF_WINDOW_MS) return null;

    const reading: PerfReading = {
      fps: (this.frames * 1000) / this.elapsed,
      tickMs: this.ticks > 0 ? this.tickTime / this.ticks : 0,
      wakes: this.ticks > 0 ? this.wakes / this.ticks : 0,
    };

    this.reset();
    return reading;
  }

  /** On repart de zéro — au réaffichage, pour ne pas moyenner un temps où le compteur dormait. */
  public reset(): void {
    this.elapsed = 0;
    this.frames = 0;
    this.ticks = 0;
    this.tickTime = 0;
    this.wakes = 0;
  }
}
