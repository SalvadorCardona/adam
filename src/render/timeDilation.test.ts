import { describe, expect, it } from 'vitest';
import { NIGHT_STAKES } from '../data/dayNight.ts';
import { TimeDilation } from './timeDilation.ts';

describe('TimeDilation', () => {
  it('gèle le temps le temps d’une mise à mort, puis le rend', () => {
    const dilation = new TimeDilation(() => false);

    expect(dilation.scale(16)).toBe(1);
    dilation.hit();
    expect(dilation.scale(16)).toBe(0);
    expect(dilation.scale(NIGHT_STAKES.hitStopMs)).toBe(0);
    expect(dilation.scale(16)).toBe(1);
  });

  it('espace les arrêts sur image', () => {
    const dilation = new TimeDilation(() => false);

    dilation.hit();
    dilation.scale(NIGHT_STAKES.hitStopMs + 1);
    dilation.hit();
    expect(dilation.scale(16)).toBe(1);
  });

  it('ralentit sur le dernier mutant', () => {
    const dilation = new TimeDilation(() => false);

    dilation.slow();
    expect(dilation.scale(100)).toBe(NIGHT_STAKES.slowMoScale);
    expect(dilation.scale(NIGHT_STAKES.slowMoMs)).toBe(NIGHT_STAKES.slowMoScale);
    expect(dilation.scale(16)).toBe(1);
  });

  it('ne fait rien sous prefers-reduced-motion', () => {
    const dilation = new TimeDilation(() => true);

    dilation.hit();
    dilation.slow();
    expect(dilation.scale(16)).toBe(1);
  });
});
