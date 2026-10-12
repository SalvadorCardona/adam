import { describe, expect, it } from 'vitest';
import { HAPTICS_KEY, LocalHaptics } from './localHaptics.ts';
import { LocalSave, SAVE_KEY, type SaveStorage } from './localSave.ts';

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

describe('LocalHaptics', () => {
  it('permet les vibrations par défaut, et retient qu’on les a coupées', () => {
    const storage = memoryStorage();

    expect(new LocalHaptics(storage).load()).toBe(true);
    new LocalHaptics(storage).save(false);
    expect(new LocalHaptics(storage).load()).toBe(false);
    expect(HAPTICS_KEY).not.toBe(SAVE_KEY);
  });

  it('survit à « Recommencer »', () => {
    const storage = memoryStorage();

    new LocalHaptics(storage).save(false);
    new LocalSave(storage).clear();
    expect(new LocalHaptics(storage).load()).toBe(false);
  });

  it('résiste à un stockage hostile', () => {
    expect(new LocalHaptics(hostile).load()).toBe(true);
    expect(() => new LocalHaptics(hostile).save(false)).not.toThrow();
    expect(new LocalHaptics(null).load()).toBe(true);
  });
});
