import { describe, expect, it } from 'vitest';
import { UI_HZ, UI_LIVE_MS, UiClock } from './uiClock.ts';

const FRAME_MS = 1000 / 60;

/** Combien de frames rafraîchissent l'UI sur `frames` frames à 60 Hz. */
function count(clock: UiClock, frames: number): number {
  let due = 0;

  for (let i = 0; i < frames; i += 1) if (clock.due(FRAME_MS)) due += 1;
  return due;
}

describe('UiClock', () => {
  it('rafraîchit dès la première frame', () => {
    expect(new UiClock().due(FRAME_MS)).toBe(true);
  });

  it('tient UI_HZ par seconde à 60 Hz comme à 120 Hz', () => {
    const clock = new UiClock();

    clock.due(FRAME_MS);
    expect(count(clock, 600)).toBeCloseTo(UI_HZ * 10, -1);

    const fast = new UiClock();
    let due = 0;

    fast.due(1000 / 120);
    for (let i = 0; i < 1200; i += 1) if (fast.due(1000 / 120)) due += 1;
    expect(due).toBeCloseTo(UI_HZ * 10, -1);
  });

  it('ne rattrape pas une frame longue', () => {
    const clock = new UiClock();

    clock.due(FRAME_MS);
    expect(clock.due(1000)).toBe(true);
    expect(clock.due(FRAME_MS)).toBe(false);
  });

  it('suit chaque frame après un geste, puis reprend sa cadence', () => {
    const clock = new UiClock();

    clock.due(FRAME_MS);
    clock.poke();
    const live = Math.floor(UI_LIVE_MS / FRAME_MS);

    expect(count(clock, live)).toBe(live);
    expect(count(clock, 60)).toBeLessThanOrEqual(UI_HZ + 1);
  });
});
