/**
 * Les morceaux de code chargés à la demande (anglais, invitation, jeu à deux)
 * se téléchargent, une fois « Jouer » pressé, aux temps morts du navigateur :
 * quand le joueur les ouvre, ils sont déjà là — et dans le cache du service
 * worker, pour une partie sans réseau. Une erreur de réseau ne dit rien : le
 * morceau se redemandera à l'usage.
 */

/** Exécute `task` quand le navigateur n'a rien d'autre à faire (Safari n'a pas `requestIdleCallback`). */
function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(task, { timeout: 4000 });
  else window.setTimeout(task, 1500);
}

/** Charge chaque morceau l'un après l'autre, chacun à un temps mort. */
export function preloadWhenIdle(loaders: readonly (() => Promise<unknown>)[]): void {
  const queue = [...loaders];
  const next = (): void => {
    const load = queue.shift();

    if (!load) return;
    whenIdle(() => void load().catch(() => undefined).finally(next));
  };

  next();
}
