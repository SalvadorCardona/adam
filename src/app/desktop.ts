/**
 * L'application de bureau (`desktop/`, Electron : l'AppImage du Steam Deck).
 *
 * Son preload pose `window.adamDesktop` ; le web n'en a pas, et rien de ce
 * module n'y change quoi que ce soit. Dans l'application, et là seulement :
 * « Quitter » à l'écran titre et dans la pause (en mode Game, il n'y a pas
 * d'autre façon propre de fermer le jeu), pas de service worker (les
 * fichiers sont déjà sur le disque, il garderait d'anciennes versions), et
 * la partie s'arrête quand la fenêtre perd le focus — menu Steam, veille —,
 * pas seulement quand elle est cachée.
 */

/** Ce que le preload d'Electron expose (`desktop/preload.ts`), et rien d'autre. */
export interface DesktopShell {
  readonly isDesktop: true;
  readonly version: string;
  quit(): void;
}

declare global {
  interface Window {
    adamDesktop?: DesktopShell;
  }
}

/** L'application de bureau, ou `null` dans un navigateur. */
export function desktopShell(): DesktopShell | null {
  const shell = typeof window === 'undefined' ? undefined : window.adamDesktop;

  return shell?.isDesktop === true ? shell : null;
}
