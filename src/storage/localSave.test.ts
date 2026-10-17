import { describe, expect, it } from 'vitest';
import { serialize } from '../sim/save.ts';
import { World } from '../sim/world.ts';
import { CORRUPT_SAVE_KEY, LocalSave, SAVE_KEY, type SaveStorage } from './localSave.ts';

/** Un `localStorage` en mémoire, comme celui du navigateur. */
function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();

  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** Un stockage qui refuse tout : navigation privée, quota plein, stockage bloqué. */
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

describe('LocalSave', () => {
  it('relit la partie écrite sous sa clé', () => {
    const storage = memoryStorage();
    const saves = new LocalSave(storage);
    const world = new World(99);

    for (let i = 0; i < 50; i += 1) world.tick();

    expect(saves.save(world)).toBe(true);
    expect(storage.data.has(SAVE_KEY)).toBe(true);

    const loaded = saves.load();

    if (loaded.status !== 'ok') throw new Error(loaded.status);
    expect(serialize(loaded.world)).toEqual(serialize(world));
  });

  it('mesure chaque écriture : taille, temps de chaque étape, pics de la session', () => {
    const storage = memoryStorage();
    const saves = new LocalSave(storage);
    const world = new World(99);

    expect(saves.stats).toBeNull();
    saves.save(world);

    const first = saves.stats!;

    expect(first.bytes).toBe(storage.data.get(SAVE_KEY)!.length);
    expect(first.writes).toBe(1);
    for (const ms of [first.snapshotMs, first.stringifyMs, first.writeMs]) expect(ms).toBeGreaterThanOrEqual(0);
    expect(first.peakMs).toBeCloseTo(first.snapshotMs + first.stringifyMs + first.writeMs, 6);

    world.fog.reveal(0, 0, 60);
    saves.save(world);
    expect(saves.stats!.writes).toBe(2);
    expect(saves.stats!.peakBytes).toBe(Math.max(first.bytes, saves.stats!.bytes));
    // Une écriture refusée ne compte pas.
    const refused = new LocalSave(hostile);

    expect(refused.save(world)).toBe(false);
    expect(refused.stats).toBeNull();
  });

  it('dit « rien » quand il n’y a pas de sauvegarde', () => {
    expect(new LocalSave(memoryStorage()).load()).toEqual({ status: 'none' });
  });

  it('ignore une sauvegarde corrompue ou d’une autre version', () => {
    const storage = memoryStorage();
    const saves = new LocalSave(storage);

    storage.data.set(SAVE_KEY, '{"version":1,"state":');
    expect(saves.load()).toEqual({ status: 'corrupt' });

    storage.data.set(SAVE_KEY, JSON.stringify({ version: 999, savedAt: 0, state: {} }));
    expect(saves.load()).toEqual({ status: 'version' });
  });

  it('« Recommencer » efface la clé', () => {
    const storage = memoryStorage();
    const saves = new LocalSave(storage);

    saves.save(new World(1));
    saves.clear();
    expect(storage.data.has(SAVE_KEY)).toBe(false);
    expect(saves.load()).toEqual({ status: 'none' });
  });

  it('un stockage qui lève n’empêche pas de jouer', () => {
    const saves = new LocalSave(hostile);

    expect(saves.load()).toEqual({ status: 'none' });
    expect(saves.save(new World(1))).toBe(false);
    expect(() => saves.clear()).not.toThrow();
  });

  it('un `localStorage` dont la simple lecture lève n’empêche pas de démarrer', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('cookies bloqués', 'SecurityError');
      },
    });

    try {
      const saves = LocalSave.browser();

      expect(saves.load()).toEqual({ status: 'none' });
      expect(saves.save(new World(1))).toBe(false);
      expect(() => saves.clear()).not.toThrow();
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("garde une copie de la sauvegarde illisible avant qu'une nouvelle partie l'écrase", () => {
    const storage = memoryStorage();
    const saves = new LocalSave(storage);

    storage.data.set(SAVE_KEY, '{"abîmée"');

    expect(saves.load()).toEqual({ status: 'corrupt' });
    expect(storage.data.get(CORRUPT_SAVE_KEY)).toBe('{"abîmée"');

    saves.save(new World(99));
    expect(storage.data.get(CORRUPT_SAVE_KEY)).toBe('{"abîmée"');
  });

  it('résume la partie sans la charger : jour, colons, chapitre, date', () => {
    const storage = memoryStorage();
    const saves = new LocalSave(storage);
    const world = new World(99);

    expect(saves.peek()).toBeNull();
    saves.save(world);

    const summary = saves.peek();

    expect(summary).toMatchObject({ day: 1, colonists: world.colonists, chapter: world.chapter });
    expect(summary!.savedAt).toBeGreaterThan(0);
  });

  it('ne résume pas un texte illisible, et ne lève jamais', () => {
    const storage = memoryStorage();

    storage.data.set(SAVE_KEY, '{pas du json');
    expect(new LocalSave(storage).peek()).toBeNull();
    expect(new LocalSave(hostile).peek()).toBeNull();
  });
});
