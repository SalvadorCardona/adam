import { describe, expect, it } from 'vitest';
import { GAMEPAD } from '../input/gamepad.ts';
import { DEFAULT_GAMEPAD_PREFS, GAMEPAD_KEY, LocalGamepad } from './localGamepad.ts';
import { SAVE_KEY, type SaveStorage } from './localSave.ts';

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

describe('LocalGamepad', () => {
  it('part de la zone morte par défaut et de la vibration, puis retient les réglages', () => {
    const storage = memoryStorage();

    expect(new LocalGamepad(storage).load()).toEqual({ deadZone: GAMEPAD.deadZone, rumble: true });
    new LocalGamepad(storage).save({ deadZone: 0.25, rumble: false });
    expect(new LocalGamepad(storage).load()).toEqual({ deadZone: 0.25, rumble: false });
    expect(GAMEPAD_KEY).not.toBe(SAVE_KEY);
  });

  it('écarte une zone morte hors bornes ou un réglage illisible', () => {
    const storage = memoryStorage();

    storage.setItem(GAMEPAD_KEY, JSON.stringify({ deadZone: 0.9, rumble: 'oui' }));
    expect(new LocalGamepad(storage).load()).toEqual(DEFAULT_GAMEPAD_PREFS);
    storage.setItem(GAMEPAD_KEY, '{pas du json');
    expect(new LocalGamepad(storage).load()).toEqual(DEFAULT_GAMEPAD_PREFS);
  });

  it('ne lève jamais, même sur un stockage hostile', () => {
    const prefs = new LocalGamepad(hostile);

    expect(prefs.load()).toEqual(DEFAULT_GAMEPAD_PREFS);
    expect(() => prefs.save({ deadZone: 0.2, rumble: true })).not.toThrow();
    expect(new LocalGamepad(null).load()).toEqual(DEFAULT_GAMEPAD_PREFS);
  });
});
