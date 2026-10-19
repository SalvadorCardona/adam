/**
 * Les tombes (`data/graves.ts`) : une par habitant mort de faim ou de soif,
 * posée sur la case où il est tombé — ou la plus proche, libre, quand
 * plusieurs sont tombées au même endroit. Du décor qui reste sur la carte, et
 * de l'état léger : sauvegardé, plafonné. Au-delà du plafond, la plus ancienne
 * perd son nom et sa pierre et ne garde que des fleurs (`Bloom`).
 */

import { GRAVES } from '../data/graves.ts';
import type { Sex } from '../data/inhabitants.ts';
import type { NeedId } from '../data/needs.ts';
import type { TraitId } from '../data/traits.ts';

export interface Grave {
  id: number;
  tx: number;
  ty: number;
  name: string;
  sex: Sex;
  trait: TraitId;
  /** Ce qui l'a tué : la faim ou la soif. */
  need: NeedId;
  /** Le jour de sa mort, comme l'horloge le compte (1 au départ). */
  day: number;
}

/** Une tombe oubliée : ses fleurs seules. */
export interface Bloom {
  tx: number;
  ty: number;
}

/**
 * La case de la tombe : celle de la mort si elle est libre, sinon la plus
 * proche, en anneaux autour, jusqu'à `GRAVES.spread` ; à défaut, la case de la
 * mort même (deux tombes se recouvrent plutôt que de ne pas en poser).
 */
export function graveSpot(tx: number, ty: number, free: (tx: number, ty: number) => boolean): { tx: number; ty: number } {
  if (free(tx, ty)) return { tx, ty };

  for (let ring = 1; ring <= GRAVES.spread; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring && free(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    }
  }
  return { tx, ty };
}

/**
 * Ajoute une tombe ; passé `GRAVES.max`, les plus anciennes deviennent des
 * fleurs seules, elles-mêmes plafonnées à `GRAVES.maxBlooms` (les plus
 * anciennes s'effacent).
 */
export function addGrave(graves: Grave[], blooms: Bloom[], grave: Grave): void {
  graves.push(grave);
  while (graves.length > GRAVES.max) {
    const oldest = graves.shift()!;

    blooms.push({ tx: oldest.tx, ty: oldest.ty });
  }
  while (blooms.length > GRAVES.maxBlooms) blooms.shift();
}
