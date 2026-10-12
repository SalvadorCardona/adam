/**
 * Les boutons de la manette, en pictogrammes : l'aide « Contrôles manette »
 * et les petites étiquettes du HUD (« △ » sur le sac).
 *
 * Mêmes règles que `art/ui.ts` — 24 × 24, formes pleines, trois tons, pas de
 * texte dans un SVG : le symbole d'un bouton est une forme, pas une lettre
 * tapée. Les quatre boutons de face prennent la couleur de leur marque, tirée
 * de la palette : sur une PlayStation, ✕ cyan, ○ corail, △ menthe, □ violet ;
 * sur une Xbox (et un Steam Deck), A menthe, B corail, X cyan, Y jaune. La
 * croix et les sticks sont indigo, comme le reste de la manette. Les boutons
 * à nom (L1, R2, Options…) sont des capsules de texte du DOM (`ui/padHelp.ts`).
 */

import { PALETTE, circle, group, pill, ring, shadedCircle, shape, svg, type Color, type Tone } from '../data/artDirection.ts';
import type { PadKind } from '../input/gamepad.ts';

const S = 24;
const { ink, paper } = PALETTE;

/** Les boutons de face, par leur place. */
export type FaceButton = 'south' | 'east' | 'west' | 'north';

/** Un bouton de face : un disque en trois tons, son symbole par-dessus. */
function face(tone: Tone, mark: (color: Color) => string, color: Color = paper.base): string {
  // Le symbole est un peu remonté et décalé vers la lumière : il se pose sur le dessus du disque, pas sur son ombre.
  return svg(S, S, shadedCircle(12, 12, 11, tone), group('translate(-0.6 -0.8)', mark(color)));
}

const cross = (color: Color): string =>
  group('rotate(45 12 12)', pill(5, 10.6, 14, 2.8, color), pill(10.6, 5, 2.8, 14, color));

const roundMark = (color: Color): string => ring(12, 12, 5.6, 5.6, 2.4, color);

const triangle = (color: Color): string =>
  shape('M12 5.2L18.9 17H5.1Z M12 9.6L8.9 14.8H15.1Z', color, true);

const square = (color: Color): string => shape('M7 6.5H17Q17.5 6.5 17.5 7V17Q17.5 17.5 17 17.5H7Q6.5 17.5 6.5 17V7Q6.5 6.5 7 6.5Z M9 9V15H15V9Z', color, true);

const letterA = (color: Color): string => shape('M10.3 5.5H13.7L18.6 18.5H15.6L14.6 15.6H9.4L8.4 18.5H5.4Z M10.3 13.1H13.7L12 8.2Z', color, true);

const letterB = (color: Color): string =>
  shape(
    'M7.5 5.5H13Q16.5 5.5 16.5 8.6Q16.5 10.6 14.9 11.5Q17.2 12.3 17.2 14.9Q17.2 18.5 13.2 18.5H7.5Z' +
      'M10.3 8V10.6H12.8Q13.8 10.6 13.8 9.3Q13.8 8 12.8 8Z M10.3 12.9V16H13.1Q14.4 16 14.4 14.45Q14.4 12.9 13.1 12.9Z',
    color,
    true,
  );

const letterX = (color: Color): string =>
  group('rotate(36 12 12)', pill(10.6, 4.6, 2.8, 14.8, color)) + group('rotate(-36 12 12)', pill(10.6, 4.6, 2.8, 14.8, color));

const letterY = (color: Color): string => shape('M5.6 5.5H8.9L12 10.4L15.1 5.5H18.4L13.5 12.8V18.5H10.5V12.8Z', color);

/** Les quatre boutons de face des deux familles. */
export const FACE_GLYPHS: Record<PadKind, Record<FaceButton, string>> = {
  playstation: {
    south: face('cyan', cross),
    east: face('coral', roundMark),
    north: face('mint', triangle),
    west: face('violet', square),
  },
  xbox: {
    south: face('mint', letterA),
    east: face('coral', letterB),
    west: face('cyan', letterX),
    // Le blanc ne se lit pas sur le jaune : la lettre est indigo.
    north: face('yellow', letterY, ink.base),
  },
};

/** La croix directionnelle : quatre bras indigo, un reflet sur celui du haut. */
export const DPAD_GLYPH = svg(
  S,
  S,
  pill(8.6, 2.5, 6.8, 19, ink.shade),
  pill(2.5, 8.6, 19, 6.8, ink.shade),
  pill(9, 2.5, 6, 18, ink.base),
  pill(2.5, 9, 18.5, 6, ink.base),
  pill(10.2, 4, 3.6, 2, ink.light),
  circle(12, 12, 1.8, ink.shade),
);

/** Un stick : le pied indigo, la tête en creux avec son reflet. */
export const STICK_GLYPH = svg(S, S, shadedCircle(12, 12, 11, 'ink'), ring(11.4, 11.2, 6.2, 6.2, 1.6, ink.shade), circle(11.4, 11.2, 4.2, ink.light));
