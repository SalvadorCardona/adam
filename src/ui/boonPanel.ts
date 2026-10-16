/**
 * « Faveur de l'aube » : les trois cartes que l'aube propose
 * (`World.boonOffer`, `data/boons.ts`). Une carte touchée pousse
 * `chooseBoon` et referme la fenêtre ; « Plus tard » la referme sans rien
 * prendre — la capsule du HUD la rouvre jusqu'à l'aube suivante. Ouverte,
 * elle arrête l'horloge (`main.ts`).
 */

import { BOONS, type BoonId } from '../data/boons.ts';
import { onLocale, t } from '../i18n/locale.ts';
import type { World } from '../sim/world.ts';
import { itemIcon, uiIcon } from './icons.ts';

export class BoonPanel {
  public readonly root: HTMLElement;

  private readonly world: World;
  private readonly title: HTMLElement;
  private readonly lead: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly later: HTMLButtonElement;
  private readonly onChosen: (boon: BoonId) => void;

  /** `onChosen` : la carte prise, pour le toast et le son. */
  public constructor(world: World, onChosen: (boon: BoonId) => void) {
    this.world = world;
    this.onChosen = onChosen;
    this.root = element('div', 'overlay boon-overlay');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const panel = element('div', 'panel overlay-panel boon-panel');

    this.title = element('h2', 'overlay-title');
    this.lead = element('p', 'overlay-text boon-lead');
    this.cards = element('div', 'boon-cards');
    this.later = element('button', 'button-secondary boon-later');
    this.later.type = 'button';
    this.later.addEventListener('click', () => this.close());
    panel.append(uiIcon('gift', 48), this.title, this.lead, this.cards, this.later);
    this.root.append(panel);
    // Un tap sur le voile, hors de la fenêtre : plus tard.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });

    onLocale(() => {
      this.title.textContent = t().hud.boon.title;
      this.lead.textContent = t().hud.boon.lead;
      this.later.textContent = t().hud.boon.later;
      if (this.open) this.render();
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    if (!this.world.boonOffer()) return;
    this.render();
    this.root.hidden = false;
    this.cards.querySelector<HTMLButtonElement>('button')?.focus();
  }

  public close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const offer = this.world.boonOffer();

    if (!offer) {
      this.close();
      return;
    }

    const words = t().hud.boon;

    this.cards.replaceChildren(
      ...offer.choices.map((id, index) => {
        const { icon, effect } = BOONS[id];
        const card = element('button', 'boon-card');

        card.type = 'button';
        card.dataset['kind'] = effect.kind;
        card.append(
          'item' in icon ? itemIcon(icon.item, 40) : uiIcon(icon.ui, 40),
          text('boon-card-name', t().boons[id].label),
          text('boon-card-text', t().boons[id].description),
          text('boon-card-tag', effect.kind === 'items' ? words.parcel : words.forTheDay),
        );
        card.addEventListener('click', () => {
          this.world.push({ type: 'chooseBoon', index });
          this.close();
          this.onChosen(id);
        });
        return card;
      }),
    );
  }
}

function text(className: string, content: string): HTMLElement {
  const node = element('span', className);

  node.textContent = content;
  return node;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  node.className = className;
  return node;
}
