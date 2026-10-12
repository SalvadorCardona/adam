import { describe, expect, it } from 'vitest';
import { NOTIFICATIONS } from '../data/notifications.ts';
import { LocalNotifications, NOTIFICATIONS_KEY, defaultPrefs } from './localNotifications.ts';
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

describe('LocalNotifications', () => {
  it('part des réglages par défaut, et retient ce qu’on change', () => {
    const storage = memoryStorage();
    const prefs = new LocalNotifications(storage).load();

    expect(prefs).toEqual(defaultPrefs());
    expect(prefs.limit).toBe(NOTIFICATIONS.defaultLimit);
    prefs.kinds.child = false;
    prefs.limit = 10;
    prefs.explained = true;
    new LocalNotifications(storage).save(prefs);
    expect(new LocalNotifications(storage).load()).toEqual(prefs);
    expect(NOTIFICATIONS_KEY).not.toBe(SAVE_KEY);
  });

  it('survit à « Recommencer »', () => {
    const storage = memoryStorage();
    const prefs = defaultPrefs();

    prefs.explained = true;
    new LocalNotifications(storage).save(prefs);
    new LocalSave(storage).clear();
    expect(new LocalNotifications(storage).load().explained).toBe(true);
  });

  it('retombe sur le défaut d’un champ illisible', () => {
    const storage = memoryStorage();

    storage.setItem(NOTIFICATIONS_KEY, JSON.stringify({ kinds: { research: false, child: 'oui' }, limit: 42, sent: -3, day: 7 }));

    const prefs = new LocalNotifications(storage).load();

    expect(prefs.kinds.research).toBe(false);
    expect(prefs.kinds.child).toBe(true);
    expect(prefs.limit).toBe(NOTIFICATIONS.defaultLimit);
    expect(prefs.sent).toBe(0);
    storage.setItem(NOTIFICATIONS_KEY, '{pas du json');
    expect(new LocalNotifications(storage).load()).toEqual(defaultPrefs());
  });

  it('résiste à un stockage hostile', () => {
    expect(new LocalNotifications(hostile).load()).toEqual(defaultPrefs());
    expect(() => new LocalNotifications(hostile).save(defaultPrefs())).not.toThrow();
    expect(new LocalNotifications(null).load()).toEqual(defaultPrefs());
  });
});
