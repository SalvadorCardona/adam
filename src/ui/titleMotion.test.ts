import { describe, expect, it } from 'vitest';
import { TITLE_MOTION, atRest, dragAim, pointerAim, springStep, tiltAim, type Spring } from './titleMotion.ts';

/*
 * La caméra de l'écran titre : la visée suit la souris, l'inclinaison ou le
 * doigt, bornée à [-1, 1] ; le ressort l'y mène sans saccade et s'y pose.
 */

describe('la visée de l’écran titre', () => {
  it('suit la souris : le centre vise le centre, les bords les bords', () => {
    expect(pointerAim(200, 400, 400, 800)).toEqual({ x: 0, y: 0 });
    expect(pointerAim(0, 800, 400, 800)).toEqual({ x: -1, y: 1 });
    expect(pointerAim(900, -50, 400, 800)).toEqual({ x: 1, y: -1 });
    expect(pointerAim(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('suit le doigt qui glisse, jusqu’au bord et pas au-delà', () => {
    const half = dragAim(400 * TITLE_MOTION.dragReach * 0.5, 0, 400, 800);

    expect(half.x).toBeCloseTo(0.5);
    expect(dragAim(-4000, 4000, 400, 800)).toEqual({ x: -1, y: 1 });
  });

  it('suit l’inclinaison depuis la pose de départ, et échange les axes en paysage', () => {
    const rest = { beta: 40, gamma: 0 };

    expect(tiltAim(40, 0, rest)).toEqual({ x: 0, y: 0 });
    expect(tiltAim(40, TITLE_MOTION.tiltRange, rest).x).toBeCloseTo(1);
    expect(tiltAim(40 + TITLE_MOTION.tiltRange / 2, 0, rest).y).toBeCloseTo(0.5);
    expect(tiltAim(40 + TITLE_MOTION.tiltRange, 0, rest, 90).x).toBeCloseTo(1);
    expect(tiltAim(40, 90, rest).x).toBe(1);
  });
});

describe('le ressort de la caméra', () => {
  it('mène à la visée sans la dépasser de beaucoup, puis s’y pose', () => {
    let spring: Spring = { x: 0, y: 0, vx: 0, vy: 0 };
    const target = { x: 1, y: -0.5 };
    let peak = 0;
    let frames = 0;

    while (!atRest(spring, target) && frames < 600) {
      spring = springStep(spring, target, 1 / 60);
      peak = Math.max(peak, spring.x);
      frames += 1;
    }
    expect(frames).toBeLessThan(240);
    expect(peak).toBeLessThan(1.15);
    expect(spring.x).toBeCloseTo(1, 2);
    expect(spring.y).toBeCloseTo(-0.5, 2);
  });

  it('borne un pas trop long : un onglet qui revient ne fait pas bondir la scène', () => {
    const jump = springStep({ x: 0, y: 0, vx: 0, vy: 0 }, { x: 1, y: 0 }, 5);
    const step = springStep({ x: 0, y: 0, vx: 0, vy: 0 }, { x: 1, y: 0 }, TITLE_MOTION.maxStep);

    expect(jump).toEqual(step);
  });
});
