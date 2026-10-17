/**
 * La cadence du HUD et des fenêtres. Le canvas suit l'écran (60 Hz et plus) ;
 * le DOM, lui, n'a pas besoin d'être relu à chaque frame : ses compteurs bougent
 * au rythme de la simulation (20 ticks par seconde) et un humain n'en lit pas
 * plus d'une dizaine de changements par seconde. Sur mobile, le DOM coûte
 * souvent plus cher que le canvas.
 *
 * Seul ce qui suit la caméra (bulles ancrées sur un personnage) reste à la frame,
 * hors de cette horloge. Après un geste du joueur (`poke`), l'UI repasse à la
 * frame le temps que la commande soit consommée par un tick et se voie : un tap
 * ne paraît jamais en retard.
 */

/** Rafraîchissements par seconde du HUD et des fenêtres. */
export const UI_HZ = 12;

/** Après un geste, le temps pendant lequel l'UI suit chaque frame : un tick (50 ms) et sa marge. */
export const UI_LIVE_MS = 200;

const UI_STEP_MS = 1000 / UI_HZ;

export class UiClock {
  private sinceStep = UI_STEP_MS;
  private live = 0;

  /** Un geste du joueur : l'UI suit chaque frame pendant `UI_LIVE_MS`. */
  public poke(): void {
    this.live = UI_LIVE_MS;
  }

  /** Avance de `deltaMs` ; vrai quand le HUD doit se remettre à jour à cette frame. */
  public due(deltaMs: number): boolean {
    this.sinceStep += deltaMs;
    this.live = Math.max(0, this.live - deltaMs);

    if (this.sinceStep < UI_STEP_MS && this.live === 0) return false;
    // Pas de rattrapage : une frame longue ne vaut qu'un rafraîchissement.
    this.sinceStep = this.sinceStep >= UI_STEP_MS ? this.sinceStep % UI_STEP_MS : 0;
    return true;
  }
}
