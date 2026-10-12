import { describe, expect, it } from 'vitest';
import type { SaveStorage } from './localSave.ts';
import { TAB_KEY, TabLock } from './localTab.ts';

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('TabLock', () => {
  it('tient la main tant que personne ne la prend', () => {
    const lock = new TabLock(memoryStorage(), 'a');

    expect(lock.held()).toBe(true);
    lock.claim();
    expect(lock.held()).toBe(true);
  });

  it('la perd quand un autre onglet la réclame, et la reprend', () => {
    const storage = memoryStorage();
    const first = new TabLock(storage, 'a');
    const second = new TabLock(storage, 'b');

    first.claim();
    second.claim();
    expect(first.held()).toBe(false);
    expect(second.held()).toBe(true);
    first.claim();
    expect(first.held()).toBe(true);
    expect(second.held()).toBe(false);
    expect(storage.getItem(TAB_KEY)).toBe('a');
  });

  it('sans stockage, ou avec un stockage hostile, la main est toujours tenue', () => {
    const hostile: SaveStorage = {
      getItem: () => {
        throw new DOMException('refusé', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('plein', 'QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(new TabLock(null, 'a').held()).toBe(true);
    expect(new TabLock(hostile, 'a').held()).toBe(true);
    expect(() => new TabLock(hostile, 'a').claim()).not.toThrow();
  });
});
