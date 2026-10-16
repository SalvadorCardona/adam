/**
 * Le combo de récolte : tant qu'Adam récolte sans s'arrêter plus de
 * `COMBO_GAP_MS`, la série monte ; le son de la coupe prend de la hauteur et
 * le chiffre qui vole porte le rang de la série. Du ressenti, rien dans l'état
 * de la partie : la vue le tient, l'horloge est celle du navigateur.
 */

export const COMBO_GAP_MS = 1400;
/** Rang à partir duquel le chiffre qui vole montre la série. */
export const COMBO_SHOWN = 3;
/** Hauteur gagnée par rang, et plafond : une tierce majeure plus haut au plus. */
const PITCH_STEP = 0.03;
const PITCH_MAX = 1.26;

/** Le facteur de vitesse (donc de hauteur) du son pour le rang `streak`. */
export function comboPitch(streak: number): number {
  return Math.min(PITCH_MAX, 1 + Math.max(0, streak - 1) * PITCH_STEP);
}

export class HarvestCombo {
  private streak = 0;
  private last = -Infinity;

  /** Une récolte à l'instant `now` (ms) : le rang de la série, 1 pour la première. */
  public hit(now: number): number {
    this.streak = now - this.last <= COMBO_GAP_MS ? this.streak + 1 : 1;
    this.last = now;
    return this.streak;
  }
}
