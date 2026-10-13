import { describe, expect, it } from 'vitest';
import { LocalPerf, PERF_KEY } from './localPerf.ts';
import { LocalSave, SAVE_KEY, type SaveStorage } from './localSave.ts';
import { SIGNS_KEY } from './localSigns.ts';

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

describe('LocalPerf', () => {
  it('cache le compteur par défaut, et retient qu’on l’a affiché', () => {
    const storage = memoryStorage();

    expect(new LocalPerf(storage).load()).toBe(false);
    new LocalPerf(storage).save(true);
    expect(new LocalPerf(storage).load()).toBe(true);
    new LocalPerf(storage).save(false);
    expect(new LocalPerf(storage).load()).toBe(false);
    expect(PERF_KEY).not.toBe(SAVE_KEY);
    expect(PERF_KEY).not.toBe(SIGNS_KEY);
  });

  it('survit à « Recommencer », qui n’efface que la sauvegarde', () => {
    const storage = memoryStorage();

    new LocalPerf(storage).save(true);
    new LocalSave(storage).clear();
    expect(new LocalPerf(storage).load()).toBe(true);
  });

  it('résiste à un stockage hostile', () => {
    expect(new LocalPerf(hostile).load()).toBe(false);
    expect(() => new LocalPerf(hostile).save(true)).not.toThrow();
    expect(new LocalPerf(null).load()).toBe(false);
  });
});
