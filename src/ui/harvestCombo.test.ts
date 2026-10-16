import { describe, expect, it } from 'vitest';
import { COMBO_GAP_MS, HarvestCombo, comboPitch } from './harvestCombo.ts';

describe('combo de récolte', () => {
  it('monte tant qu’Adam récolte sans s’arrêter, et repart de 1 après une pause', () => {
    const combo = new HarvestCombo();

    expect(combo.hit(0)).toBe(1);
    expect(combo.hit(500)).toBe(2);
    expect(combo.hit(500 + COMBO_GAP_MS)).toBe(3);
    expect(combo.hit(500 + 2 * COMBO_GAP_MS + 1)).toBe(1);
  });

  it('élève la hauteur du son, jusqu’à un plafond', () => {
    expect(comboPitch(1)).toBe(1);
    expect(comboPitch(5)).toBeGreaterThan(comboPitch(2));
    expect(comboPitch(500)).toBeLessThanOrEqual(1.26);
  });
});
