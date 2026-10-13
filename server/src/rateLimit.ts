/**
 * Une limite de tentatives par clé (une adresse, une IP) sur une fenêtre
 * glissante. En mémoire : un redémarrage du serveur la remet à zéro, ce qui
 * suffit contre quelqu'un qui devine des mots de passe, et ne demande ni
 * table ni nettoyage.
 */

export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  /** `max` tentatives par `windowMs` ; `now` : l'horloge, en millisecondes. */
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  public constructor(max: number, windowMs: number, now: () => number) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Combien de secondes attendre avant le prochain essai ; 0 : la voie est libre. */
  public retryAfter(key: string): number {
    const recent = this.recent(key);

    if (recent.length < this.max) return 0;

    return Math.max(1, Math.ceil((recent[recent.length - this.max]! + this.windowMs - this.now()) / 1000));
  }

  /** Compte une tentative (un échec, ou une inscription). */
  public hit(key: string): void {
    const recent = this.recent(key);

    recent.push(this.now());
    this.hits.set(key, recent);
    // La table ne grandit pas sans fin : on élague de temps en temps les clés oubliées.
    if (this.hits.size > 10_000) this.prune();
  }

  /** Efface les tentatives d'une clé : une connexion réussie repart de zéro. */
  public reset(key: string): void {
    this.hits.delete(key);
  }

  private recent(key: string): number[] {
    const from = this.now() - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > from);

    if (recent.length === 0) this.hits.delete(key);

    return recent;
  }

  private prune(): void {
    for (const key of [...this.hits.keys()]) this.recent(key);
  }
}
