import { describe, expect, it } from 'vitest';
import { PERF_WINDOW_MS, PerfSampler } from './perfMeter.ts';

describe('PerfSampler', () => {
  it('rend une moyenne quand la fenêtre se ferme, puis repart de zéro', () => {
    const sampler = new PerfSampler();
    const frameMs = 1000 / 60;
    let reading = null;

    for (let i = 0; reading === null; i += 1) {
      if (i % 3 === 0) sampler.tick(i % 2 === 0 ? 2 : 4, i % 2 === 0 ? 10 : 20);
      reading = sampler.frame(frameMs);
    }

    expect(reading.fps).toBeCloseTo(60, 0);
    expect(reading.tickMs).toBeCloseTo(3, 0);
    expect(reading.wakes).toBeCloseTo(15, 0);
    expect(sampler.frame(frameMs)).toBeNull();
  });

  it('dit 0 ms et 0 réveil quand aucun tick ne tourne (pause)', () => {
    const sampler = new PerfSampler();

    expect(sampler.frame(PERF_WINDOW_MS)).toEqual({ fps: 2, tickMs: 0, wakes: 0 });
  });
});
