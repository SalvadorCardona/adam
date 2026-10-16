/**
 * Le temps de la vue : un arrêt sur image à chaque mise à mort, un ralenti sur
 * le dernier mutant. `scale()` donne la part de temps réel que la boucle
 * laisse à la simulation ; la simulation, elle, n'en sait rien.
 */

import { NIGHT_STAKES } from '../data/dayNight.ts';

export class TimeDilation {
  private stopLeft = 0;
  private slowLeft = 0;
  private sinceStop = Infinity;

  private readonly calm: () => boolean;

  public constructor(calm: () => boolean) {
    this.calm = calm;
  }

  /** Une mise à mort : le temps s'arrête `hitStopMs`, pas plus d'une fois par `hitStopGapMs`. */
  public hit(): void {
    if (this.calm() || this.sinceStop < NIGHT_STAKES.hitStopGapMs) return;
    this.stopLeft = NIGHT_STAKES.hitStopMs;
    this.sinceStop = 0;
  }

  /** Le dernier mutant tombe : le temps ralentit `slowMoMs`. */
  public slow(): void {
    if (!this.calm()) this.slowLeft = NIGHT_STAKES.slowMoMs;
  }

  /** Avance les minuteurs de `deltaMs` ms réelles et rend le facteur de vitesse à appliquer à cette image. */
  public scale(deltaMs: number): number {
    this.sinceStop += deltaMs;
    if (this.stopLeft > 0) {
      this.stopLeft = Math.max(0, this.stopLeft - deltaMs);
      return 0;
    }
    if (this.slowLeft > 0) {
      this.slowLeft = Math.max(0, this.slowLeft - deltaMs);
      return NIGHT_STAKES.slowMoScale;
    }
    return 1;
  }
}
