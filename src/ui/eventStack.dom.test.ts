// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n/locale.ts';
import { EventStack } from './eventStack.ts';

/*
 * La pile d'événements dans un faux DOM : les capsules se montrent et se
 * cachent seules (`hidden`), la pile range la plus pressante devant et le
 * reste derrière « +N ».
 */

beforeAll(() => setLocale('fr'));

function chip(id: string, data: Record<string, string> = {}): HTMLElement {
  const element = document.createElement('div');

  element.hidden = true;
  element.textContent = id;
  Object.assign(element.dataset, data);
  return element;
}

describe('la pile d’événements du HUD', () => {
  let stack: EventStack;
  let wave: HTMLElement;
  let hunger: HTMLElement;
  let weather: HTMLElement;
  let more: HTMLButtonElement;
  let list: HTMLElement;

  beforeEach(() => {
    document.body.replaceChildren();
    stack = new EventStack();
    wave = chip('wave', { urgent: 'false' });
    hunger = chip('hunger');
    weather = chip('weather', { harsh: 'false' });
    stack.add('wave', wave);
    stack.add('hunger', hunger);
    stack.add('weather', weather);
    document.body.append(stack.root);
    more = stack.root.querySelector<HTMLButtonElement>('.hud-events-more')!;
    list = stack.root.querySelector<HTMLElement>('.hud-events-list')!;
  });

  it('reste cachée tant qu’aucune capsule ne se montre', () => {
    stack.update();
    expect(stack.root.hidden).toBe(true);
  });

  it('une seule capsule : elle est devant, sans « +N »', () => {
    weather.hidden = false;
    stack.update();
    expect(stack.root.hidden).toBe(false);
    expect(weather.parentElement).toBe(stack.root);
    expect(weather.dataset['queued']).toBe('false');
    expect(more.hidden).toBe(true);
  });

  it('la plus pressante est devant, les autres derrière « +2 »', () => {
    wave.hidden = false;
    hunger.hidden = false;
    weather.hidden = false;
    stack.update();

    // Les vivres passent devant une vague encore lointaine.
    expect(hunger.dataset['queued']).toBe('false');
    expect(hunger.parentElement).toBe(stack.root);
    expect(wave.parentElement).toBe(list);
    expect(weather.parentElement).toBe(list);
    expect(more.hidden).toBe(false);
    expect(more.textContent).toBe('+2');
    expect(more.getAttribute('aria-label')).toBeTruthy();
  });

  it('la vague qui presse repasse devant', () => {
    wave.hidden = false;
    hunger.hidden = false;
    stack.update();
    expect(hunger.parentElement).toBe(stack.root);

    wave.dataset['urgent'] = 'true';
    // La clé de la pile ne change pas d'ordre d'arrivée : on la force par un cachage et un retour.
    hunger.hidden = true;
    stack.update();
    hunger.hidden = false;
    stack.update();
    expect(wave.dataset['queued']).toBe('false');
    expect(hunger.parentElement).toBe(list);
  });

  it('« +N » ouvre et referme la liste ; Échap la referme', () => {
    wave.hidden = false;
    hunger.hidden = false;
    stack.update();
    expect(list.hidden).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');

    more.click();
    expect(list.hidden).toBe(false);
    expect(stack.root.dataset['open']).toBe('true');
    expect(more.getAttribute('aria-expanded')).toBe('true');

    more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(list.hidden).toBe(true);
    expect(stack.root.dataset['open']).toBe('false');
  });

  it('un tap hors de la pile referme la liste', () => {
    wave.hidden = false;
    hunger.hidden = false;
    stack.update();
    more.click();
    expect(list.hidden).toBe(false);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(list.hidden).toBe(true);
  });

  it('la liste se referme seule quand il ne reste qu’une capsule', () => {
    wave.hidden = false;
    hunger.hidden = false;
    stack.update();
    more.click();
    wave.hidden = true;
    stack.update();
    expect(list.hidden).toBe(true);
    expect(more.hidden).toBe(true);
  });
});
