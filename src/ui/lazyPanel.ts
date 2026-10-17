/**
 * Une fenêtre dont le code n'arrive qu'à son premier usage.
 *
 * Le jeu monte ses fenêtres toutes à l'avance : c'est du code lu au démarrage
 * pour des écrans que la plupart des parties n'ouvrent qu'une fois, ou jamais
 * (invitation, carte du monde…). `LazyPanel` tient leur place dans le HUD — un
 * conteneur sans effet de mise en page — et construit la vraie fenêtre au
 * premier `show()`, ou plus tôt si `warm()` est appelé (`ui/idleLoad.ts`, après
 * « Jouer »). Tant qu'elle n'est pas là, elle est fermée.
 */

/** Ce qu'une fenêtre doit offrir pour être différée. */
export interface Deferrable {
  readonly root: HTMLElement;
  readonly open: boolean;
  close(): void;
}

export class LazyPanel<P extends Deferrable> {
  /** Sa place dans le HUD : `display: contents`, donc invisible pour la mise en page. */
  public readonly root = document.createElement('div');
  private instance: P | null = null;
  private loading: Promise<P> | null = null;

  private readonly build: () => Promise<P>;

  public constructor(build: () => Promise<P>) {
    this.build = build;
    this.root.style.display = 'contents';
  }

  /** La fenêtre, si elle est chargée. */
  public get panel(): P | null {
    return this.instance;
  }

  public get open(): boolean {
    return this.instance?.open ?? false;
  }

  /** Charge la fenêtre (une seule fois) : à appeler quand le réseau est au repos. */
  public warm(): Promise<P> {
    this.loading ??= this.build().then((panel) => {
      this.instance = panel;
      this.root.append(panel.root);
      return panel;
    });
    return this.loading;
  }

  /** Charge si besoin, puis exécute `run` sur la fenêtre. */
  public with(run: (panel: P) => void): void {
    void this.warm().then(run);
  }

  public close(): void {
    this.instance?.close();
  }
}
