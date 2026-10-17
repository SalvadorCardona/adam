/**
 * La cadence de la sauvegarde automatique. Écrire la partie est synchrone —
 * `World.snapshot()`, `JSON.stringify`, `localStorage.setItem` — : une
 * écriture par tap dans la zone d'échange se sentirait. Les moments clés
 * (un bâtiment fini, un échange sac ⇄ coffre, l'aube) ne font donc que
 * marquer la partie « à sauver » (`mark`), et l'horloge l'écrit au plus une
 * fois par `SAVE_GAP_MS` ; sans rien de marqué, toutes les `AUTOSAVE_MS`.
 * La sauvegarde de fermeture (onglet caché, page quittée) ne passe pas par
 * elle : elle écrit tout de suite.
 */

/** Sans moment clé, la partie s'écrit toutes les cinq secondes de jeu. */
export const AUTOSAVE_MS = 5000;

/** Jamais deux écritures à moins d'une seconde d'écart, quoi qu'on ait marqué. */
export const SAVE_GAP_MS = 1000;

export class AutosaveClock {
  /** Depuis la dernière écriture ; un moment clé juste après le lancement s'écrit aussitôt. */
  private sinceWrite = SAVE_GAP_MS;
  private marked = false;

  /** Un moment clé : la partie est à sauver dès que l'écart le permet. */
  public mark(): void {
    this.marked = true;
  }

  /** Avance de `deltaMs` ; vrai quand la partie doit s'écrire maintenant. */
  public due(deltaMs: number): boolean {
    this.sinceWrite += deltaMs;
    return this.sinceWrite >= AUTOSAVE_MS || (this.marked && this.sinceWrite >= SAVE_GAP_MS);
  }

  /** La partie vient d'être écrite (ou l'écriture a été tentée) : l'écart repart de zéro. */
  public wrote(): void {
    this.sinceWrite = 0;
    this.marked = false;
  }
}
