/**
 * Les étiquettes de la manette dans l'interface : un petit bouton de face
 * (△ sur le sac, □ sur « Bâtir ») épinglé au coin des boutons qu'il
 * déclenche. `style.css` ne les montre qu'en mode manette
 * (`data-input="pad"` sur la racine) : à la souris et au doigt, rien ne change.
 */

import type { FaceButton } from '../art/padGlyphs.ts';
import type { PadKind } from '../input/gamepad.ts';
import { padGlyph } from './icons.ts';

export class PadHints {
  private readonly hints: readonly { host: HTMLElement; button: FaceButton; badge: HTMLSpanElement }[];
  private kind: PadKind | null = null;

  public constructor(hosts: readonly (readonly [HTMLElement, FaceButton])[]) {
    this.hints = hosts.map(([host, button]) => {
      const badge = document.createElement('span');

      badge.className = 'pad-hint';
      badge.setAttribute('aria-hidden', 'true');
      host.append(badge);
      return { host, button, badge };
    });
    this.setKind('xbox');
  }

  /** Un bouton qui se redessine (le sac, à chaque objet) perd son étiquette : elle y revient. */
  public update(): void {
    for (const { host, badge } of this.hints) if (badge.parentElement !== host) host.append(badge);
  }

  /** La famille de la manette : ✕ ○ △ □ ou A B X Y. */
  public setKind(kind: PadKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    for (const { button, badge } of this.hints) badge.replaceChildren(padGlyph(kind, button, 20));
  }
}
