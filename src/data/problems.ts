/**
 * Les problèmes d'un bâtiment — contenu pur : ce qui l'arrête sans que le
 * joueur l'ait voulu, et que la carte doit dire de loin.
 *
 * L'ordre de `PROBLEM_ORDER` est la priorité : un bâtiment qui en a
 * plusieurs n'en montre qu'un, le premier. La pause volontaire n'en est pas
 * un — elle garde sa bulle ⏸. Un problème de plus est une entrée de plus
 * ici, un cas dans `sim/problems.ts`, un morceau du sprite `alert` et une
 * ligne de la fenêtre.
 */

export const PROBLEM_ORDER = [
  /** Le coffre de sortie n'a plus la place d'une production : elle s'arrête. */
  'storeFull',
  /** Des postes demandés, aucun ouvrier libre pour les tenir : personne ne travaille. */
  'noWorker',
  /** Un consommateur — la nurserie, une forge — n'a pas de quoi lancer son prochain cycle : il attend une livraison. */
  'starved',
  /** L'élevage de cochons n'a aucun cochon : il attend qu'on en ramène un de la forêt. */
  'noPig',
] as const;

export type ProblemId = (typeof PROBLEM_ORDER)[number];

/**
 * Les problèmes se relèvent tous les `everyTicks` (un quart de seconde) :
 * assez vite pour que l'alerte paraisse quand la machine s'arrête, sans
 * recompter les ouvriers de la colonie à chaque tick.
 *
 * Contre le clignotement : un problème paraît au tick où il naît, mais ne
 * s'efface qu'après `holdTicks` sans lui — un coffre qu'un porteur entame
 * puis que la machine remplit aussitôt garde son alerte. Un coffre vidé
 * franchement (à `releaseRatio` de sa capacité ou moins) l'efface tout de
 * suite.
 */
export const PROBLEMS = {
  everyTicks: 5,
  holdTicks: 40,
  releaseRatio: 0.5,
} as const;
