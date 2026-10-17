// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { localeListenerCount, setLocale } from '../i18n/locale.ts';
import { World } from '../sim/world.ts';
import { Hud } from './hud.ts';

/*
 * Un HUD défait ne laisse rien derrière lui : ni abonné aux événements du
 * monde, ni à la langue, ni écouteur sur `window` ou `document`. Sinon, une
 * partie quittée sans recharger la page continuerait d'écouter celle d'avant.
 */

beforeAll(() => setLocale('fr'));
afterEach(() => vi.restoreAllMocks());

type Call = { type: string; listener: unknown; capture: boolean };

function captureOf(options: unknown): boolean {
  return typeof options === 'boolean' ? options : Boolean((options as AddEventListenerOptions | undefined)?.capture);
}

/** Espionne les `addEventListener` / `removeEventListener` de `target`. */
function spyListeners(target: Window | Document): { added: Call[]; removed: Call[] } {
  const added: Call[] = [];
  const removed: Call[] = [];
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);

  vi.spyOn(target, 'addEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    added.push({ type, listener, capture: captureOf(options) });
    add(type, listener, options);
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
    removed.push({ type, listener, capture: captureOf(options) });
    remove(type, listener, options);
  });
  return { added, removed };
}

/** Les écouteurs posés et jamais retirés, par type et phase. */
function leftovers({ added, removed }: { added: Call[]; removed: Call[] }): string[] {
  return added
    .filter((call) => !removed.some((gone) => gone.type === call.type && gone.listener === call.listener && gone.capture === call.capture))
    .map((call) => `${call.type}:${call.capture}`)
    .sort();
}

describe('Hud.dispose', () => {
  it('rend les abonnements du monde, de la langue, de window et de document', () => {
    const world = new World(7);
    const events = world.events.listenerCount();
    const locale = localeListenerCount();
    const win = spyListeners(window);
    const doc = spyListeners(document);

    const hud = new Hud(world, true);

    document.body.append(hud.root);
    expect(world.events.listenerCount()).toBeGreaterThan(events);
    expect(win.added.length + doc.added.length).toBeGreaterThan(0);
    hud.update(60, 0, { images: 0, pages: 0, megapixels: 0, resolution: 1, ms: 0 }, { blocks: 0, tiles: 0 });
    hud.frame();

    hud.dispose();

    expect(world.events.listenerCount()).toBe(events);
    expect(localeListenerCount()).toBe(locale);
    expect(leftovers(win)).toEqual([]);
    expect(leftovers(doc)).toEqual([]);
    expect(hud.root.isConnected).toBe(false);
  });

  it('se défait deux fois sans rien casser', () => {
    const world = new World(7);
    const events = world.events.listenerCount();
    const hud = new Hud(world);

    hud.dispose();
    hud.dispose();
    expect(world.events.listenerCount()).toBe(events);
  });
});
