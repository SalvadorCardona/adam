/**
 * Les petits outils DOM des composants du HUD : un élément et sa classe, un
 * texte, une barre, une pastille, un libellé — et l'horloge « 1:05 ».
 */

import { setTip } from '../tooltip.ts';
import { uiIcon } from '../icons.ts';

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (className) node.className = className;
  return node;
}

export function text(className: string, content: string, tag: keyof HTMLElementTagNameMap = 'span'): HTMLElement {
  const node = element(tag, className);

  node.textContent = content;
  return node;
}

export function bar(ratio: number): HTMLElement {
  const track = element('div', 'hud-bar');
  const fill = element('div', 'hud-bar-fill');

  fill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  track.append(fill);
  return track;
}

/** Une pastille « pictogramme + nombre » : habitants, mutants abattus. */
export function chip(icon: 'people' | 'mutant', value: number, label: string): HTMLElement {
  const node = text('hud-quest-chip', String(value));

  node.prepend(uiIcon(icon, 18));
  setTip(node, label);
  return node;
}

/** `node`, avec son libellé (`setTip`). */
export function tipped(node: HTMLElement, label: string): HTMLElement {
  setTip(node, label);
  return node;
}

/** « 1:05 » ou « 0:09 » à partir d'un nombre de secondes. */
export function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
