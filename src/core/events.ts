/**
 * Émetteur d'événements typé, minimal.
 *
 * Utilisé pour que la simulation signale ce qui vient de changer (un bâtiment
 * posé, un coffre qui se remplit) sans rien connaître du rendu ni de l'UI :
 * ceux-ci s'abonnent depuis l'extérieur.
 */

export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  public on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);

    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);

    return () => {
      set.delete(listener);
    };
  }

  public emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);

    if (!set) return;

    for (const listener of set) {
      (listener as Listener<Events[K]>)(payload);
    }
  }

  /** Combien d'écouteurs sont branchés, tous événements confondus : un composant défait n'en laisse aucun. */
  public listenerCount(): number {
    let count = 0;

    for (const set of this.listeners.values()) count += set.size;
    return count;
  }

  public clear(): void {
    this.listeners.clear();
  }
}
