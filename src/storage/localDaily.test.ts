import { describe, expect, it } from 'vitest';
import { DAILY_KEY, LocalDaily } from './localDaily.ts';
import { DAILY_SAVE_KEY, LocalSave, SAVE_KEY, type SaveStorage } from './localSave.ts';
import { World } from '../sim/world.ts';

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();

  return {
    data,
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

describe('LocalDaily', () => {
  it('garde le meilleur score du jour, sous adam:daily', () => {
    const storage = memoryStorage();
    const daily = new LocalDaily(storage);

    expect(daily.best('2026-10-17')).toBe(0);
    expect(daily.offer('2026-10-17', 12)).toBe(12);
    expect(daily.offer('2026-10-17', 8)).toBe(12);
    expect(daily.offer('2026-10-17', 20)).toBe(20);
    expect(daily.best('2026-10-17')).toBe(20);
    expect(storage.data.has(DAILY_KEY)).toBe(true);
    expect(DAILY_KEY).toBe('adam:daily');
  });

  it('repart de zéro un autre jour', () => {
    const daily = new LocalDaily(memoryStorage());

    daily.offer('2026-10-17', 20);
    expect(daily.best('2026-10-18')).toBe(0);
    expect(daily.offer('2026-10-18', 5)).toBe(5);
  });

  it('ne lève jamais : stockage absent, hostile ou illisible', () => {
    expect(new LocalDaily(null).offer('2026-10-17', 5)).toBe(0);
    expect(new LocalDaily(hostile).offer('2026-10-17', 5)).toBe(0);
    expect(new LocalDaily(hostile).best('2026-10-17')).toBe(0);

    const storage = memoryStorage();

    storage.setItem(DAILY_KEY, '{pas du json');
    expect(new LocalDaily(storage).best('2026-10-17')).toBe(0);
  });
});

describe('la sauvegarde de la partie du jour', () => {
  it('a son emplacement : la partie principale reste intacte', () => {
    const storage = memoryStorage();
    const main = new LocalSave(storage);
    const daily = new LocalSave(storage, DAILY_SAVE_KEY);

    main.save(World.newColony(7));
    const before = storage.data.get(SAVE_KEY);

    daily.save(World.newColony(9, { date: '2026-10-17', mod: 'drought' }));
    expect(storage.data.get(SAVE_KEY)).toBe(before);
    expect(storage.data.has(DAILY_SAVE_KEY)).toBe(true);

    const loaded = daily.load();

    expect(loaded.status === 'ok' && loaded.world.seed).toBe(9);
    daily.clear();
    expect(storage.data.get(SAVE_KEY)).toBe(before);
    expect(main.load().status).toBe('ok');
  });
});
