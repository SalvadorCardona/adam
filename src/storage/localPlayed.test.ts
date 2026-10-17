import { describe, expect, it } from 'vitest';
import { LocalPlayed, PLAYED_KEY } from './localPlayed.ts';
import type { SaveStorage } from './localSave.ts';

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();

  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('LocalPlayed', () => {
  it('se souvient qu’une partie a été lancée', () => {
    const storage = memoryStorage();
    const played = new LocalPlayed(storage);

    expect(played.load()).toBe(false);
    played.save();
    expect(storage.data.get(PLAYED_KEY)).toBe('true');
    expect(new LocalPlayed(storage).load()).toBe(true);
  });

  it('ne lève jamais, même sans stockage', () => {
    const hostile: SaveStorage = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('plein');
      },
      removeItem: () => undefined,
    };

    expect(new LocalPlayed(hostile).load()).toBe(false);
    expect(() => new LocalPlayed(hostile).save()).not.toThrow();
    expect(new LocalPlayed(null).load()).toBe(false);
  });
});
