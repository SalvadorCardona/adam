import { describe, expect, it } from 'vitest';
import { LocalNotifications } from '../storage/localNotifications.ts';
import type { SaveStorage } from '../storage/localSave.ts';
import { Notifier, dayKey, type NotifyBackend, type NotifyPermission } from './notifier.ts';

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(permission: NotifyPermission = 'granted', away = true) {
  const shown: { title: string; tag: string }[] = [];
  const state = { permission, away, day: '2026-10-12' };
  const storage = memoryStorage();
  const backend: NotifyBackend = {
    permission: () => state.permission,
    request: () => Promise.resolve((state.permission = 'granted')),
    show: (title, _body, tag) => void shown.push({ title, tag }),
  };
  const make = (): Notifier => new Notifier(new LocalNotifications(storage), backend, () => state.away, () => state.day);

  return { shown, state, storage, notifier: make(), make };
}

const message = { title: 'Titre', body: 'Corps' };

describe('Notifier', () => {
  it('prévient quand le jeu n’a pas la main et que la permission est donnée', () => {
    const { notifier, shown } = setup();

    expect(notifier.notify('research', message)).toBe(true);
    expect(shown).toEqual([{ title: 'Titre', tag: 'adam:research' }]);
  });

  it('se tait sans permission, ou quand on regarde le jeu', () => {
    const asked = setup('default');
    const watching = setup('granted', false);

    expect(asked.notifier.notify('research', message)).toBe(false);
    expect(watching.notifier.notify('research', message)).toBe(false);
    expect(asked.shown.length + watching.shown.length).toBe(0);
  });

  it('respecte les types coupés', () => {
    const { notifier, shown } = setup();

    notifier.setEnabled('child', false);
    expect(notifier.notify('child', message)).toBe(false);
    expect(notifier.notify('attack', message)).toBe(true);
    expect(shown).toHaveLength(1);
  });

  it('plafonne par jour, puis repart le lendemain', () => {
    const { notifier, shown, state } = setup();

    expect(notifier.limit).toBe(3);
    for (let i = 0; i < 5; i += 1) notifier.notify('research', message);
    expect(shown).toHaveLength(3);
    expect(notifier.remainingToday()).toBe(0);
    state.day = '2026-10-13';
    expect(notifier.remainingToday()).toBe(3);
    expect(notifier.notify('research', message)).toBe(true);
  });

  it('retient son plafond du jour d’une session à l’autre, et fait défiler les plafonds', () => {
    const { notifier, make, shown } = setup();

    for (let i = 0; i < 3; i += 1) notifier.notify('research', message);
    expect(make().notify('research', message)).toBe(false);
    expect(notifier.cycleLimit()).toBe(5);
    expect(notifier.cycleLimit()).toBe(10);
    expect(shown).toHaveLength(3);
  });

  it('ne montre l’explication qu’une fois, tant que le navigateur n’a pas tranché', async () => {
    const { notifier, make, state } = setup('default');

    expect(notifier.shouldExplain).toBe(true);
    await notifier.ask();
    expect(notifier.shouldExplain).toBe(false);
    state.permission = 'default';
    expect(make().shouldExplain).toBe(false);
    state.permission = 'denied';
    expect(setup('denied').notifier.shouldExplain).toBe(false);
    expect(setup('unsupported').notifier.supported).toBe(false);
  });

  it('compte les jours à l’heure locale', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
