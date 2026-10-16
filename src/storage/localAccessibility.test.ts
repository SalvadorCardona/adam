import { describe, expect, it } from 'vitest';
import { CONTRAST_KEY, LocalContrast } from './localContrast.ts';
import { LocalSave, SAVE_KEY, type SaveStorage } from './localSave.ts';
import { LocalUiScale, nextUiScale, UI_SCALE_KEY } from './localUiScale.ts';

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const hostile: SaveStorage = {
  getItem: () => {
    throw new DOMException('refusé', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('plein', 'QuotaExceededError');
  },
  removeItem: () => {
    throw new DOMException('refusé', 'SecurityError');
  },
};

describe('LocalUiScale', () => {
  it('part à 100 %, retient la taille, et tourne 100 → 115 → 130 → 100', () => {
    const storage = memoryStorage();

    expect(new LocalUiScale(storage).load()).toBe(100);
    new LocalUiScale(storage).save(130);
    expect(new LocalUiScale(storage).load()).toBe(130);
    expect(nextUiScale(100)).toBe(115);
    expect(nextUiScale(115)).toBe(130);
    expect(nextUiScale(130)).toBe(100);
    expect(UI_SCALE_KEY).toBe('adam:ui-scale');
    expect(UI_SCALE_KEY).not.toBe(SAVE_KEY);
  });

  it('ignore une valeur étrangère et survit à « Recommencer »', () => {
    const storage = memoryStorage();

    storage.setItem(UI_SCALE_KEY, '400');
    expect(new LocalUiScale(storage).load()).toBe(100);
    new LocalUiScale(storage).save(115);
    new LocalSave(storage).clear();
    expect(new LocalUiScale(storage).load()).toBe(115);
  });

  it('résiste à un stockage hostile', () => {
    expect(new LocalUiScale(hostile).load()).toBe(100);
    expect(() => new LocalUiScale(hostile).save(115)).not.toThrow();
    expect(new LocalUiScale(null).load()).toBe(100);
  });
});

describe('LocalContrast', () => {
  it('est éteint par défaut, et retient qu’on l’a allumé', () => {
    const storage = memoryStorage();

    expect(new LocalContrast(storage).load()).toBe(false);
    new LocalContrast(storage).save(true);
    expect(new LocalContrast(storage).load()).toBe(true);
    new LocalContrast(storage).save(false);
    expect(new LocalContrast(storage).load()).toBe(false);
    expect(CONTRAST_KEY).not.toBe(SAVE_KEY);
  });

  it('résiste à un stockage hostile', () => {
    expect(new LocalContrast(hostile).load()).toBe(false);
    expect(() => new LocalContrast(hostile).save(true)).not.toThrow();
    expect(new LocalContrast(null).load()).toBe(false);
  });
});
