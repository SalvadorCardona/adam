// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { titleScene } from '../art/titleScene.ts';
import { TitleArt, type TitleSound } from './titleArt.ts';

/*
 * La scène vivante de l'écran titre dans un faux DOM : ses plans, ce qui y
 * bouge, ce qui réagit au toucher, et rien qui écoute encore après `dispose`.
 */

let art: TitleArt | null = null;

afterEach(() => {
  art?.dispose();
  art?.root.remove();
  art = null;
  vi.useRealTimers();
});

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

  it('anime en continu plus de six sortes de choses, et en fait réagir plus de trois au toucher', () => {
    art = new TitleArt();
    document.body.append(art.root);
    const motions = new Set([...art.root.querySelectorAll<HTMLElement>('[data-motion]')].map((element) => element.dataset['motion']));
    const taps = new Set([...art.root.querySelectorAll<HTMLElement>('[data-tap]')].map((element) => element.dataset['tap']));

    expect(motions.size).toBeGreaterThanOrEqual(12);
    expect(taps.size).toBeGreaterThanOrEqual(5);
    expect(art.root.querySelectorAll('.title-plane').length).toBe(titleScene().length);
  });

  it('écrit les trajets en valeurs, sans variable CSS que le compositeur refuserait', () => {
    art = new TitleArt();
    const sheet = art.root.querySelector('style')!.textContent;

    expect(sheet).toContain('@keyframes title-course-');
    expect(sheet).not.toContain('var(');
  });

  it('fait sursauter le mutant, flamber un lampion, s’envoler un oiseau, se retourner Adam, fleurir l’herbe', () => {
    vi.useFakeTimers();
    art = new TitleArt();
    document.body.append(art.root);
    const find = (id: string): HTMLElement => art!.root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;

    tap(find('ruin'));
    expect(find('mutant').dataset['startled']).toBe('true');
    tap(find('lantern-0'));
    expect(find('lantern-0').dataset['hit']).toBe('true');
    tap(find('perch-tower'));
    expect(find('perch-tower').dataset['flown']).toBe('true');
    tap(find('adam'));
    expect(art.root.dataset['turned']).toBe('turn');
    // Le faux DOM n'a pas de mise en page : l'herbe prend une boîte.
    vi.spyOn(find('ground'), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 400, 400, 400));
    tap(find('ground'), 120, 600);
    expect(art.root.querySelectorAll('.title-bloom').length).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(find('mutant').dataset['startled']).toBeUndefined();
    expect(find('perch-tower').dataset['flown']).toBeUndefined();
    expect(art.root.dataset['turned']).toBeUndefined();
  });

  it('se retourne vers « Jouer » visé, plonge quand on le presse', () => {
    art = new TitleArt();
    art.ready(true);
    expect(art.root.dataset['ready']).toBe('true');
    art.ready(false);
    expect(art.root.dataset['ready']).toBeUndefined();
    art.dive();
    expect(art.root.dataset['leaving']).toBe('true');
  });

  it('joue un son par fleur, par oiseau envolé et par sursaut du mutant, et coupe l’ambiance en partant', () => {
    vi.useFakeTimers();
    const sound = { play: vi.fn(), ambience: vi.fn() } satisfies TitleSound;

    art = new TitleArt(sound);
    document.body.append(art.root);
    const find = (id: string): HTMLElement => art!.root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;

    // L'ambiance est demandée d'emblée (le moteur l'attend jusqu'au premier geste), en plein jour.
    expect(sound.ambience).toHaveBeenCalledWith(0);
    tap(find('ruin'));
    tap(find('perch-tower'));
    vi.spyOn(find('ground'), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 400, 400, 400));
    tap(find('ground'), 120, 600);
    expect(sound.play.mock.calls.map((call: unknown[]) => call[0])).toEqual(['squeal', 'chirp', 'bloom']);
    art.dispose();
    expect(sound.ambience).toHaveBeenLastCalledWith(null);
  });

  it('tourne les pupilles du mutant vers la visée, puis vers Adam, et les laisse au centre sous prefers-reduced-motion', () => {
    vi.useFakeTimers();
    art = new TitleArt();
    document.body.append(art.root);
    const pupil = art.root.querySelector<HTMLElement>('[data-id="mutant-pupil-0"]')!;

    expect(art.root.querySelectorAll('[data-gaze]').length).toBe(2);
    art.ready(true);
    expect(pupil.style.transform).toContain('translate(-');
    art.ready(false);
    expect(pupil.style.transform).toBe('translate(0.0%, 0.0%)');

    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: true, media: query }) as MediaQueryList);
    art.ready(true);
    expect(pupil.style.transform).toBe('');
  });

  it('n’écoute plus rien après dispose', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    art = new TitleArt();
    const added = add.mock.calls.length;

    art.dispose();
    expect(added).toBeGreaterThan(0);
    expect(remove.mock.calls.length).toBe(added);
  });
});
