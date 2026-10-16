/**
 * Le réglage « réduire les animations » du système (`prefers-reduced-motion`),
 * lu à chaque appel : le joueur peut le changer en cours de partie. Sans
 * `matchMedia` (tests en Node), les animations restent.
 */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
