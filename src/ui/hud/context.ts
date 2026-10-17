/**
 * Ce que la racine du HUD (`Hud`) prête à ses composants : le monde qu'ils
 * lisent, et les quelques liens que seul `main.ts` sait faire — projeter un
 * point monde à l'écran, centrer la caméra —, plus deux mesures partagées.
 * Un composant ne voit rien d'autre de ses voisins.
 */

import type { World } from '../../sim/world.ts';

/** Projette un point monde en pixels écran — fourni par le renderer, via `main.ts`. */
export type Projector = (x: number, y: number) => { x: number; y: number };

export interface HudContext {
  readonly world: World;
  /** Le point monde (x, y) à l'écran, d'après le projecteur du moment. */
  project(x: number, y: number): { x: number; y: number };
  /** Centre la caméra sur un point monde. */
  focus(x: number, y: number): void;
  /** Bas des rangées du haut, en pixels écran : les bulles restent dessous. */
  topInset(): number;
  /** La largeur de l'écran, relue au redimensionnement seulement. */
  viewWidth(): number;
  /** Le nombre de mutants, compté une fois par tick. */
  mutantCount(): number;
}
