/**
 * L'ami, quand on joue à deux : le même gabarit qu'Adam — sac à dos,
 * écharpe, mêmes calques (`adamLook.ts`) —, habillé autrement
 * (`PARTNER_LOOK` : sweat cyan, casquette, boucles corail) pour qu'on ne les
 * confonde jamais, même petits. Les mêmes outils en main, le même cadre et
 * la même ancre : le rendu l'anime comme Adam.
 */

import { PARTNER_LOOK } from '../data/wardrobe.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { ADAM } from './adam.ts';
import { adamLookParts } from './adamLook.ts';

export const PARTNER = {
  ...ADAM,
  parts: { ...ADAM.parts, ...adamLookParts(PARTNER_LOOK) },
} satisfies SpriteProto;
