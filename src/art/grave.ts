/**
 * La tombe d'un colon mort de faim ou de soif : une petite stèle arrondie,
 * violette comme les ruines (`FAMILY_TONES.ruins`) — le monde d'avant —, sur un
 * tertre d'herbe où la vie reprend : fleurs, brins, une liane. Un ruban noué
 * autour de la stèle porte la couleur de son trait.
 *
 * Morceaux, tous du même cadre :
 * - un par trait (`hardworking`, `glutton`, `fearful`, `sturdy`, `dreamer`) :
 *   la tombe entière, au ruban de la couleur du trait ;
 * - `bloom` : les fleurs seules, ce qu'il reste d'une tombe oubliée.
 */

import { PALETTE, circle, flower, groundShadow, leaf, pill, rect, shadedBlock, svg, vine, type Tone } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import type { TraitId } from '../data/traits.ts';

const W = 32;
const H = 34;

const { mint, ink } = PALETTE;

/** La teinte du ruban de chaque trait. */
const RIBBONS = {
  hardworking: 'yellow',
  glutton: 'orange',
  fearful: 'mint',
  sturdy: 'cyan',
  dreamer: 'coral',
} as const satisfies Record<TraitId, Tone>;

/** Le tertre : une capsule d'herbe en trois tons. */
const MOUND = pill(5, 24, 22, 8, mint.shade) + pill(5, 23, 22, 7, mint.base) + pill(8, 24, 8, 2, mint.light);

/** La stèle : un bloc très arrondi, son nom suggéré par deux traits indigo. */
const STONE = shadedBlock(11, 6, 10, 21, 3, 'violet', 5) + pill(14, 11, 4, 2, ink.base) + pill(14.6, 15, 2.8, 2, ink.base);

/** Les fleurs du tertre et leurs feuilles. */
const FLOWERS = leaf(6, 27, 200, 0.8) + leaf(26, 27, -20, 0.8) + flower(8, 24, 'coral', 0.9) + flower(24.4, 25, 'yellow', 0.9) + flower(16, 27, 'paper', 0.8);

/** La liane qui monte le long de la stèle. */
const VINE = vine([20.4, 24, 21.4, 19, 20.6, 14], 2);

/** Le ruban : une bande nouée en travers de la stèle, nœud et deux pans. */
function ribbon(tone: Tone): string {
  const color = PALETTE[tone];

  return (
    rect(10.4, 18.4, 11.2, 3.6, color.shade, 1.8) +
    rect(10.4, 18, 11.2, 3, color.base, 1.5) +
    circle(16, 19.6, 2, color.light) +
    pill(13.4, 21, 2.2, 5, color.base) +
    pill(16.6, 21, 2.2, 5, color.shade)
  );
}

const GROUND = groundShadow(16, 29, 26, 7);

const traitParts = Object.fromEntries(
  (Object.entries(RIBBONS) as [TraitId, Tone][]).map(([trait, tone]) => [trait, svg(W, H, GROUND, MOUND, STONE, ribbon(tone), VINE, FLOWERS)]),
) as Record<TraitId, string>;

export const GRAVE = {
  width: W,
  height: H,
  anchorX: 0.5,
  anchorY: 29 / H,
  parts: {
    ...traitParts,
    bloom: svg(W, H, groundShadow(16, 29, 18, 5), pill(8, 26, 16, 5, mint.shade), pill(8, 25, 16, 4.4, mint.base), leaf(10, 28, 200, 0.8), leaf(22, 28, -20, 0.8), flower(11, 25, 'coral', 0.9), flower(19, 24, 'yellow', 0.9), flower(15, 27, 'paper', 0.8)),
  },
} satisfies SpriteProto;
