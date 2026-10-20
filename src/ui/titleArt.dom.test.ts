// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { titleScene } from '../art/titleScene.ts';
import { TitleArt, type TitleHit, type TitleSound, type TitleView } from './titleArt.ts';

/*
 * La surface de l'écran titre dans un faux DOM : elle n'ouvre sa couche
 * qu'une fois à l'écran, lui passe les gestes (ce qui est sous le doigt
 * réagit), « Jouer » visé puis pressé, et rien qui écoute encore après
 * `dispose`. La couche Pixi est remplacée par un témoin.
 */

let art: TitleArt | null = null;

afterEach(() => {
  art?.dispose();
  art?.root.remove();
  art = null;
});

/** Un témoin de couche : il dit `hit` sous tout point, et note ce qu'on lui demande. */
function fakeView(hit: TitleHit | null = null, ambient = { dusk: 0, flock: false }): TitleView & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    parallax: () => undefined,
    hit: () => hit,
    react: (target, x, y) => calls.push(`react ${target.tap} ${target.id} ${x},${y}`) > 0,
    ambient: () => ambient,
    ready: (on) => calls.push(`ready ${on}`),
    dive: () => calls.push('dive'),
    dispose: () => calls.push('dispose'),
  };
}

/** La couche s'ouvre : on attend sa promesse. */
async function opened(view: TitleView, sound?: TitleSound): Promise<TitleArt> {
  art = new TitleArt(() => Promise.resolve(view), sound);
  document.body.append(art.root);
  art.show();
  await Promise.resolve();
  await Promise.resolve();
  return art;
}

function tap(target: Element, x = 10, y = 10): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 1, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 1 }));
}

describe('la scène de l’écran titre', () => {
  it('empile ses plans du fond vers l’avant, chacun plus proche que le précédent ou presque', () => {
    const layers = titleScene();

    expect(layers.length).toBeGreaterThanOrEqual(6);
    expect(new Set(layers.map((layer) => layer.depth)).size).toBeGreaterThanOrEqual(6);
    expect(layers[0]!.depth).toBe(0);
    expect(layers.at(-1)!.depth).toBe(1);
  });

  it('n’ouvre sa couche qu’une fois montrée, et une seule fois', async () => {
    const open = vi.fn(() => Promise.resolve(fakeView()));

    art = new TitleArt(open);
    art.show();
    expect(open).not.toHaveBeenCalled();
    document.body.append(art.root);
    art.show();
    art.show();
    expect(open).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(art.root.dataset['drawn']).toBe('true');
  });

  it('fait réagir ce qui est sous le doigt, au point touché', async () => {
    const view = fakeView({ tap: 'mutant', id: 'ruin' });

    tap((await opened(view)).root, 120, 600);
    expect(view.calls).toContain('react mutant ruin 120,600');
  });

  it('ne fait rien réagir dans le vide', async () => {
    const view = fakeView(null);

    tap((await opened(view)).root);
    expect(view.calls.filter((call) => call.startsWith('react'))).toEqual([]);
  });

  it('se retourne vers « Jouer » visé, plonge quand on le presse — même visé avant que la couche soit là', async () => {
    const view = fakeView();

    art = new TitleArt(() => Promise.resolve(view));
    art.ready(true);
    expect(art.root.dataset['ready']).toBe('true');
    document.body.append(art.root);
    art.show();
    await Promise.resolve();
    await Promise.resolve();
    expect(view.calls).toContain('ready true');
    art.ready(false);
    expect(art.root.dataset['ready']).toBeUndefined();
    art.dive();
    expect(art.root.dataset['leaving']).toBe('true');
    expect(view.calls.at(-1)).toBe('dive');
  });

  it('défait sa couche avec lui, même quand elle arrive après', async () => {
    const view = fakeView();
    let resolve: (view: TitleView) => void = () => undefined;

    art = new TitleArt(() => new Promise((done) => (resolve = done)));
    document.body.append(art.root);
    art.show();
    art.dispose();
    resolve(view);
    await Promise.resolve();
    await Promise.resolve();
    expect(view.calls).toEqual(['dispose']);
  });

  it('joue un son par fleur, par oiseau envolé et par sursaut du mutant, et coupe l’ambiance en partant', async () => {
    const sound = { play: vi.fn(), ambience: vi.fn() } satisfies TitleSound;
    const hits: TitleHit[] = [
      { tap: 'mutant', id: 'ruin' },
      { tap: 'bird', id: 'perch-tower' },
      { tap: 'ground', id: 'ground' },
      { tap: 'lantern', id: 'lantern-0' },
    ];
    const view = { ...fakeView(), hit: () => hits.shift() ?? null };

    await opened(view, sound);
    // L'ambiance est demandée d'emblée (le moteur l'attend jusqu'au premier geste), en plein jour.
    expect(sound.ambience).toHaveBeenCalledWith(0);
    for (let i = 0; i < 4; i += 1) tap(art!.root, 120, 600);
    expect(sound.play.mock.calls.map((call: unknown[]) => call[0])).toEqual(['squeal', 'chirp', 'bloom']);
    art!.dispose();
    expect(sound.ambience).toHaveBeenLastCalledWith(null);
  });

  it('se tait quand rien n’a réagi : l’oiseau déjà envolé ne pépie pas deux fois', async () => {
    const sound = { play: vi.fn(), ambience: vi.fn() } satisfies TitleSound;
    const view = { ...fakeView({ tap: 'bird', id: 'perch-tower' }), react: () => false };

    tap((await opened(view, sound)).root);
    expect(sound.play).not.toHaveBeenCalled();
  });

  it('accorde l’ambiance au crépuscule de la scène, et pépie quand le vol d’oiseaux passe', async () => {
    vi.useFakeTimers();
    const sound = { play: vi.fn(), ambience: vi.fn() } satisfies TitleSound;

    await opened(fakeView(null, { dusk: 0.5, flock: true }), sound);
    vi.advanceTimersByTime(600);
    expect(sound.ambience).toHaveBeenLastCalledWith(0.5);
    expect(sound.play).toHaveBeenCalledWith('chirp');
    vi.useRealTimers();
  });

  it('n’écoute plus rien après dispose', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    art = new TitleArt(() => Promise.resolve(fakeView()));
    const added = add.mock.calls.length;

    art.dispose();
    expect(added).toBeGreaterThan(0);
    expect(remove.mock.calls.length).toBe(added);
  });
});
