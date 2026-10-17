import { describe, expect, it } from 'vitest';
import { HASTEN } from '../data/dayNight.ts';
import { STEP_MS } from '../sim/world.ts';
import { GameLoop, MAX_STEPS_PER_FRAME } from './gameLoop.ts';

/** Le nombre de pas joués pour une image. */
function stepsOf(loop: GameLoop): number {
  let steps = 0;

  loop.run(() => (steps += 1));
  return steps;
}

describe('GameLoop', () => {
  it('joue un pas par STEP_MS et garde la fraction pour l’interpolation', () => {
    const loop = new GameLoop();

    loop.advance(STEP_MS * 2.5, false, 1);
    expect(stepsOf(loop)).toBe(2);
    expect(loop.alpha).toBeCloseTo(0.5);
  });

  it('passe la nuit HASTEN.speed fois plus vite, et suit la dilatation de la vue', () => {
    const loop = new GameLoop();

    loop.advance(STEP_MS, true, 1);
    expect(stepsOf(loop)).toBe(HASTEN.speed);
    loop.advance(STEP_MS * 4, false, 0.5);
    expect(stepsOf(loop)).toBe(2);
  });

  it('saute le retard au-delà du plafond de pas', () => {
    const loop = new GameLoop();

    loop.advance(STEP_MS * 100.25, false, 1);
    expect(stepsOf(loop)).toBe(MAX_STEPS_PER_FRAME);
    expect(loop.alpha).toBeCloseTo(0.25);
    expect(stepsOf(loop)).toBe(0);
  });

  it('repart de zéro, ou de la fraction de l’hôte chez l’ami', () => {
    const loop = new GameLoop();

    loop.advance(STEP_MS * 3, false, 1);
    loop.reset();
    expect(stepsOf(loop)).toBe(0);
    loop.follow(0.75);
    expect(loop.alpha).toBeCloseTo(0.75);
  });
});
