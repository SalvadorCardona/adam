/**
 * L'aide « Contrôles manette », ouverte depuis les Réglages : chaque bouton
 * et ce qu'il fait, avec les pictogrammes de la bonne famille — PlayStation
 * (✕ ○ △ □) ou Xbox et Steam Deck (A B X Y). La manette branchée choisit la
 * famille ; deux capsules permettent de voir l'autre.
 *
 * Elle s'ouvre par-dessus les Réglages, qui arrêtent déjà l'horloge, et se
 * ferme par sa croix, un tap sur le voile, Échap ou ○ / B.
 */

import type { FaceButton } from '../art/padGlyphs.ts';
import { onLocale, t } from '../i18n/locale.ts';
import type { Messages } from '../i18n/messages.ts';
import { PAD_KINDS, PAD_NAMES, type PadKind } from '../input/gamepad.ts';
import { padGlyph, uiIcon } from './icons.ts';

/** Une ligne de l'aide : le ou les boutons, puis l'action (une clé de `t().gamepad.actions`). */
type HelpKey = FaceButton | 'dpad' | 'leftStick' | 'rightStick' | keyof (typeof PAD_NAMES)['xbox'];

const ROWS: readonly { keys: readonly HelpKey[]; action: keyof Messages['gamepad']['actions'] }[] = [
  { keys: ['leftStick'], action: 'move' },
  { keys: ['rightStick'], action: 'cursor' },
  { keys: ['south'], action: 'click' },
  { keys: ['dpad'], action: 'navigate' },
  { keys: ['east'], action: 'back' },
  { keys: ['north'], action: 'bag' },
  { keys: ['west'], action: 'build' },
  { keys: ['l1', 'r1'], action: 'zoomStep' },
  { keys: ['l2', 'r2'], action: 'zoom' },
  { keys: ['r3'], action: 'recenter' },
  { keys: ['start'], action: 'pause' },
  { keys: ['select'], action: 'map' },
];

export class PadHelp {
  public readonly root: HTMLElement;

  private readonly closeButton: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;
  private readonly list: HTMLDListElement;
  private readonly kinds = new Map<PadKind, HTMLButtonElement>();
  private shown: PadKind = 'xbox';
  private connected: string | null = null;

  public constructor() {
    this.root = document.createElement('div');
    this.root.className = 'overlay pad-help-screen';
    this.root.hidden = true;
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });

    const panel = document.createElement('div');
    const head = document.createElement('div');
    const title = document.createElement('h2');

    panel.className = 'panel overlay-panel settings-panel pad-help';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    head.className = 'settings-head';
    title.className = 'overlay-title';
    title.id = 'pad-help-title';
    panel.setAttribute('aria-labelledby', title.id);

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'building-panel-close';
    this.closeButton.append(uiIcon('close'));
    this.closeButton.addEventListener('click', () => this.close());
    head.append(title, this.closeButton);

    const kinds = document.createElement('div');

    kinds.className = 'settings-languages';
    kinds.setAttribute('role', 'radiogroup');
    for (const kind of PAD_KINDS) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'button-secondary settings-language pad-help-kind';
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => this.setKind(kind));
      this.kinds.set(kind, button);
      kinds.append(button);
    }

    this.status = document.createElement('p');
    this.status.className = 'settings-note';
    this.list = document.createElement('dl');
    this.list.className = 'pad-help-list';

    panel.append(head, this.status, kinds, this.list);
    this.root.append(panel);

    onLocale(() => {
      title.textContent = t().gamepad.helpTitle;
      this.closeButton.setAttribute('aria-label', t().common.close);
      this.render();
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    if (this.open) return;
    this.root.hidden = false;
    this.render();
    this.closeButton.focus();
  }

  public close(): void {
    this.root.hidden = true;
  }

  /** La manette branchée (son nom), ou `null` : l'aide prend sa famille. */
  public setPad(kind: PadKind | null, id: string | null): void {
    // « Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e…) » : le nom, sans la fiche technique.
    this.connected = id && (id.replace(/\s*\(.*$/, '').trim() || id);
    if (kind) this.shown = kind;
    this.render();
  }

  private setKind(kind: PadKind): void {
    this.shown = kind;
    this.render();
  }

  private render(): void {
    const text = t().gamepad;

    this.status.textContent = this.connected ? text.detected(this.connected) : text.none;
    for (const [kind, button] of this.kinds) {
      button.textContent = text.kinds[kind];
      button.setAttribute('aria-checked', String(kind === this.shown));
    }

    const rows = ROWS.map(({ keys, action }) => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');

      term.append(...keys.map((key) => this.key(key)));
      detail.textContent = text.actions[action];
      return [term, detail];
    });

    this.list.replaceChildren(...rows.flat());
  }

  private key(key: HelpKey): HTMLElement {
    if (key === 'south' || key === 'east' || key === 'west' || key === 'north') return padGlyph(this.shown, key, 28);
    if (key === 'dpad') return padGlyph(this.shown, 'dpad', 28);

    const chip = document.createElement('span');

    chip.className = 'pad-key';
    if (key === 'leftStick' || key === 'rightStick') {
      chip.append(padGlyph(this.shown, 'stick', 22), key === 'leftStick' ? 'L' : 'R');
      return chip;
    }
    chip.textContent = PAD_NAMES[this.shown][key];
    return chip;
  }
}
