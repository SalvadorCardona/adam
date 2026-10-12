import { afterEach, describe, expect, it, vi } from 'vitest';
import { Haptics } from './haptics.ts';

describe('Haptics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('vibre selon le motif, et pas deux fois de suite trop vite', () => {
    const vibrate = vi.fn();

    vi.stubGlobal('navigator', { vibrate });
    const haptics = new Haptics();

    haptics.pulse('done', 1000);
    haptics.pulse('done', 1050);
    haptics.pulse('done', 1200);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenCalledWith([30, 40, 30]);
  });

  it('se tait une fois coupé, et arrête la vibration en cours', () => {
    const vibrate = vi.fn();

    vi.stubGlobal('navigator', { vibrate });
    const haptics = new Haptics();

    haptics.setEnabled(false);
    expect(vibrate).toHaveBeenCalledWith(0);
    vibrate.mockClear();
    haptics.pulse('win', 5000);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('ne plante pas sans navigator.vibrate', () => {
    vi.stubGlobal('navigator', {});
    const haptics = new Haptics();

    expect(haptics.supported).toBe(false);
    expect(() => haptics.pulse('win')).not.toThrow();
  });
});
