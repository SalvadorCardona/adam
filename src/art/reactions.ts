/**
 * Les bulles de réaction : la peur, la joie, la fatigue. Rares et brèves, elles
 * flottent au-dessus de la tête d'un habitant (`World.reaction`).
 *
 * Même cadre que la bulle « malheureux » (`art/unhappy.ts`) — la pointe vers
 * la tête, un visage rond dedans —, mais pas de corail : il reste à ce qui
 * presse (faim, soif). Violet pour la peur, jaune pour la joie, cyan pour la
 * fatigue de la nuit.
 */

import { PALETTE, circle, curve, line, pill, polygon, shadedPill, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const W = 26;
const H = 28;
const { cyan, skin, ink, paper } = PALETTE;

/** La bulle, sa pointe et le visage rond, avant les traits de l'humeur. */
function face(tone: 'violet' | 'yellow' | 'cyan', ...mood: string[]): string {
  return svg(
    W,
    H,
    polygon([9, 20, 17, 20, 13, 27], PALETTE[tone].shade),
    shadedPill(1, 1, 24, 22, 3, tone),
    circle(13, 11.6, 7.4, skin.shade),
    circle(12.7, 11, 6.9, skin.base),
    pill(8.6, 6.4, 3.4, 1.6, skin.light),
    ...mood,
  );
}

const frame = { width: W, height: H, anchorX: 0.5, anchorY: 1 } as const;

/** La peur : sourcils en accent, yeux ronds, bouche ouverte, une goutte de sueur. */
export const SCARED = {
  ...frame,
  parts: {
    bubble: face(
      'violet',
      line(8.4, 7.8, 11, 6.8, ink.base),
      line(17.2, 7.8, 14.6, 6.8, ink.base),
      circle(10.4, 10.6, 1.6, paper.base),
      circle(15.4, 10.6, 1.6, paper.base),
      circle(10.4, 10.8, 0.8, ink.base),
      circle(15.4, 10.8, 0.8, ink.base),
      pill(11.6, 14.2, 3, 3, ink.base),
      circle(19.6, 8, 1.4, cyan.base),
    ),
  },
} satisfies SpriteProto;

/** La joie : yeux plissés en arcs, grand sourire, deux joues roses. */
export const JOYFUL = {
  ...frame,
  parts: {
    bubble: face(
      'yellow',
      curve('M8.6 11 Q10.4 8.6 12.2 11', ink.base),
      curve('M13.8 11 Q15.6 8.6 17.4 11', ink.base),
      curve('M9.6 13.6 Q12.9 18 16.2 13.6', ink.base),
      circle(8, 14, 1.2, PALETTE.coral.light),
      circle(18, 14, 1.2, PALETTE.coral.light),
    ),
  },
} satisfies SpriteProto;

/** La fatigue : paupières closes, bouche qui bâille, un « z » qui monte. */
export const SLEEPY = {
  ...frame,
  parts: {
    bubble: face(
      'cyan',
      curve('M8.6 10.4 Q10.4 12.2 12.2 10.4', ink.base),
      curve('M13.8 10.4 Q15.6 12.2 17.4 10.4', ink.base),
      pill(11.6, 14.2, 2.8, 2.4, ink.base),
      line(17.4, 3.6, 21, 3.6, ink.base),
      line(21, 3.6, 17.4, 7, ink.base),
      line(17.4, 7, 21, 7, ink.base),
    ),
  },
} satisfies SpriteProto;
