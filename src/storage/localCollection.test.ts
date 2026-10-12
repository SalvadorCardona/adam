import { describe, expect, it } from 'vitest';
import { emptyCollection } from '../sim/collection.ts';
import { COLLECTION_KEY, LocalCollection } from './localCollection.ts';
import type { SaveStorage } from './localSave.ts';

function memory(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();

  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('LocalCollection', () => {
  it('rend ce qu’on a écrit, sous sa propre clé', () => {
    const storage = memory();
    const collection = { ...emptyCollection(), unlocked: ['firstShot' as const] };

    expect(new LocalCollection(storage).save(collection)).toBe(true);
    expect(storage.data.has(COLLECTION_KEY)).toBe(true);
    expect(new LocalCollection(storage).load().unlocked).toEqual(['firstShot']);
  });

  it('ne gêne jamais le jeu : sans stockage, ou s’il lève', () => {
    expect(new LocalCollection(null).load()).toEqual(emptyCollection());
    expect(new LocalCollection(null).save(emptyCollection())).toBe(false);

    const broken: SaveStorage = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('plein');
      },
      removeItem: () => {},
    };

    expect(new LocalCollection(broken).load()).toEqual(emptyCollection());
    expect(new LocalCollection(broken).save(emptyCollection())).toBe(false);
  });
});
