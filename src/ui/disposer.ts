import type { Emitter, Listener } from '../core/events.ts';

/**
 * Ce qu'un composant d'interface a branché hors de lui, et qu'il doit
 * débrancher en partant : écouteurs de `window` ou de `document`,
 * abonnements aux événements du monde ou à la langue, minuteurs.
 *
 * Un écouteur posé sur un élément que le composant possède part avec lui,
 * il n'a pas besoin d'y passer. Tout le reste, si : sans ça, une partie
 * quittée sans recharger la page continuerait d'écouter le monde d'avant.
 */
export class Disposer {
  private readonly undo: (() => void)[] = [];
  private disposed = false;

  /** Un écouteur DOM, retiré au `dispose()`. */
  public listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public listen(target: EventTarget, type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void;
  public listen(target: EventTarget, type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void {
    target.addEventListener(type, listener, options);
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);

    this.add(() => target.removeEventListener(type, listener, { capture }));
  }

  /** Un abonnement à un émetteur (les événements du monde), retiré au `dispose()`. */
  public on<Events extends Record<string, unknown>, K extends keyof Events>(emitter: Emitter<Events>, event: K, listener: Listener<Events[K]>): void {
    this.add(emitter.on(event, listener));
  }

  /** Un abonnement qui rend sa propre fonction de désabonnement (`Emitter.on`, `onLocale`…). */
  public add(undo: () => unknown): void {
    if (this.disposed) {
      undo();
      return;
    }
    this.undo.push(() => void undo());
  }

  /** Un `setInterval`, arrêté au `dispose()`. */
  public interval(run: () => void, ms: number): void {
    const id = window.setInterval(run, ms);

    this.add(() => window.clearInterval(id));
  }

  /** Tout débrancher, du dernier branché au premier. Une seconde fois ne fait rien. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const undo of this.undo.splice(0).reverse()) undo();
  }
}
