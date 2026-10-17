// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../audio/engine.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { World } from '../sim/world.ts';
import { LocalCollection } from '../storage/localCollection.ts';
import { LocalDaily } from '../storage/localDaily.ts';
import { LocalGarden } from '../storage/localGarden.ts';
import { LocalRecord } from '../storage/localRecord.ts';
import { LocalSave } from '../storage/localSave.ts';
import { TabLock } from '../storage/localTab.ts';
import { Disposer } from '../ui/disposer.ts';
import type { GamepadControls } from '../ui/gamepadControls.ts';
import type { Hud } from '../ui/hud.ts';
import type { Notifier } from '../ui/notifier.ts';
import type { SettingsPanel } from '../ui/settingsPanel.ts';
import { wireAlarm, wireAudio, wireHaptics, wireParticles, wireRumble, wireShake } from './feedback.ts';
import { wireNotifications } from './notifications.ts';
import { wireAchievements, wireDaily, wireGarden, wireRecord, wireSave } from './persistence.ts';

/*
 * Le câblage de la partie se défait d'un coup : après `life.dispose()`, plus
 * rien n'écoute le monde, `window` ni `document`, et plus aucun minuteur ne tourne.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Un faux qui accepte tout : chaque propriété est une fonction qui rend un autre faux. */
function stub<T>(): T {
  const fake: object = new Proxy(() => fake, {
    get: (_, key) => (key === 'then' ? undefined : fake),
  });

  return fake as T;
}

/** Les écouteurs branchés sur `target` et pas encore retirés, par (type, écouteur, capture). */
function live(target: EventTarget): Set<string> {
  const ids = new Map<unknown, number>();
  const active = new Set<string>();
  const key = (type: string, listener: unknown, options?: boolean | EventListenerOptions): string => {
    if (!ids.has(listener)) ids.set(listener, ids.size);
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);

    return `${type}:${ids.get(listener)}:${capture}`;
  };
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);

  vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
    active.add(key(type, listener, options));
    add(type, listener, options);
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
    active.delete(key(type, listener, options));
    remove(type, listener, options);
  });
  return active;
}

describe('câblage de app/', () => {
  it('ne laisse rien derrière lui après dispose()', () => {
    vi.useFakeTimers();

    const world = new World(7);
    const before = world.events.listenerCount();
    const onWindow = live(window);
    const onDocument = live(document);
    const life = new Disposer();
    const hud = stub<Hud>();
    const audio = stub<AudioEngine>();
    const renderer = stub<GameRenderer>();
    const notify = vi.fn();

    wireSave(life, world, new LocalSave(null), new TabLock(null), () => true, { lost: () => {}, failed: () => {} });
    wireGarden(life, world, new LocalGarden(null));
    wireRecord(life, world, new LocalRecord(null));
    wireDaily(life, world, new LocalDaily(null), () => {});
    wireAchievements(life, world, new LocalCollection(null), hud, audio);
    wireNotifications(life, world, { notify } as unknown as Notifier, () => {});
    wireHaptics(life, world);
    wireRumble(life, world, stub<GamepadControls>());
    wireAudio(life, world, audio, stub<SettingsPanel>());
    wireParticles(life, world, renderer);
    wireAlarm(life, world, renderer, hud);
    wireShake(life, world, renderer, () => false);

    expect(world.events.listenerCount()).toBeGreaterThan(before);
    expect(onWindow.size + onDocument.size).toBeGreaterThan(0);

    life.dispose();

    expect(world.events.listenerCount()).toBe(before);
    expect([...onWindow]).toEqual([]);
    expect([...onDocument]).toEqual([]);
    // L'alerte de vivres ne regarde plus le monde chaque seconde.
    expect(vi.getTimerCount()).toBe(0);
  });
});
