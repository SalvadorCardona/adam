/**
 * Les vibrations du téléphone : un motif par moment clé, et un interrupteur
 * (réglage « Vibrations »). Absente sur iOS et sur ordinateur, l'API
 * `navigator.vibrate` laisse alors le visuel et le son suffire.
 *
 * Un seul exemplaire pour tout le jeu : `main.ts` y branche les événements,
 * le HUD y passe l'alarme, les réglages le coupent.
 */

/** Durées de vibration, en ms, par moment ; les valeurs impaires sont des pauses. */
export const HAPTIC_PATTERNS = {
  /** Un geste réussi : une récolte, une pose. */
  tick: [12],
  /** Un bâtiment achevé, une naissance. */
  done: [30, 40, 30],
  /** Une recherche, un objectif, un niveau : le plus long des petits motifs. */
  win: [40, 50, 40, 50, 90],
  /** La mairie frappée hors de l'écran. */
  alarm: [140, 80, 140],
} as const satisfies Record<string, readonly number[]>;

export type HapticName = keyof typeof HAPTIC_PATTERNS;

/** Le délai minimal entre deux vibrations d'un même motif, en ms : un téléphone qui vibre sans arrêt se pose sur la table. */
const MIN_GAP_MS: Record<HapticName, number> = { tick: 400, done: 150, win: 150, alarm: 4000 };

export class Haptics {
  private on = true;
  private readonly last = new Map<HapticName, number>();

  /** Le navigateur sait-il vibrer ? Les réglages cachent leur interrupteur sinon. */
  public get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  public get enabled(): boolean {
    return this.on;
  }

  public setEnabled(on: boolean): void {
    this.on = on;
    if (!on) this.stop();
  }

  public pulse(name: HapticName, now: number = performance.now()): void {
    if (!this.on || !this.supported) return;
    if (now - (this.last.get(name) ?? -Infinity) < MIN_GAP_MS[name]) return;
    this.last.set(name, now);
    this.vibrate([...HAPTIC_PATTERNS[name]]);
  }

  private stop(): void {
    this.vibrate(0);
  }

  private vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Refusée par le navigateur (pas de geste, mode économie) : rien à faire.
    }
  }
}

export const haptics = new Haptics();
