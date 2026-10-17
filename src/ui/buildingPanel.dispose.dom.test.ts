// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { localeListenerCount, setLocale } from '../i18n/locale.ts';
import { World } from '../sim/world.ts';
import { BuildingPanel } from './buildingPanel.ts';

/*
 * Une fenêtre défaite ne laisse rien derrière elle : ni abonné au monde ou à
 * la langue, ni écouteur de `window` ou de `document`.
 */

beforeAll(() => setLocale('fr'));
afterEach(() => vi.restoreAllMocks());

/** Ce qu'on a branché sur `target` et ce qu'on en a retiré, par (type, écouteur, capture). */
function watch(target: EventTarget): { added: string[]; removed: string[]; keys: Map<EventListenerOrEventListenerObject, number> } {
  const keys = new Map<EventListenerOrEventListenerObject, number>();
  const added: string[] = [];
  const removed: string[] = [];
  const key = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): string => {
    if (listener && !keys.has(listener)) keys.set(listener, keys.size);
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);

    return `${type}:${listener ? keys.get(listener) : '-'}:${capture}`;
  };
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);

  vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
    added.push(key(type, listener, options));
    add(type, listener, options);
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
    removed.push(key(type, listener, options));
    remove(type, listener, options);
  });
  return { added, removed, keys };
}

/** Une fenêtre construite, ouverte sur la mairie, puis défaite. */
function openAndDispose(world: World): BuildingPanel {
  const panel = new BuildingPanel(world);

  document.body.append(panel.root);
  panel.show(world.townHallId);
  panel.update();
  panel.dispose();
  return panel;
}

describe('BuildingPanel.dispose', () => {
  it('rend les abonnés du monde, de window et de document, et quitte la page', () => {
    const world = new World(42);
    const events = world.events.listenerCount();
    const onWindow = watch(window);
    const onDocument = watch(document);
    const panel = openAndDispose(world);

    expect(world.events.listenerCount()).toBe(events);
    for (const { added, removed } of [onWindow, onDocument]) {
      for (const listener of added) expect(removed, listener).toContain(listener);
    }
    expect(panel.root.isConnected).toBe(false);
  });

  it('ne laisse aucun abonné à la langue, sous-panneaux compris', () => {
    const before = localeListenerCount();
    const panel = openAndDispose(new World(42));

    expect(localeListenerCount()).toBe(before);
    // Une seconde fois ne fait rien ; `destroy()` reste son autre nom.
    panel.destroy();
    panel.dispose();
    expect(localeListenerCount()).toBe(before);
  });
});
