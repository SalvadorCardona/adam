/**
 * Le nombre de graines qu'un balayage de test parcourt : 200 dans le projet
 * Vitest `fast` (`npm test`), 1 000 dans `slow` (`npm run test:slow`) — voir
 * `vitest.config.ts`. Sans variable (un outil qui importerait ce fichier), la
 * valeur prudente.
 */
export const SWEEP_SEEDS: number = Number(import.meta.env['ADAM_SWEEP'] ?? 200);

/** Vrai dans le projet `slow` : les longues parties se jouent avec `it.skipIf(!SLOW)`. */
export const SLOW: boolean = SWEEP_SEEDS >= 1000;
