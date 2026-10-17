/**
 * « Talents d'Adam » : la fenêtre des faveurs de l'aube (`ui/boonPanel.ts`)
 * pour les niveaux. Un talent attend (`World.talentOffer`) : ses trois cartes,
 * dont le tap pousse `chooseTalent` et referme la fenêtre ; « Plus tard » la
 * referme sans rien prendre — la capsule du HUD et le niveau d'Adam la
 * rouvrent. Dessous, toujours, la fiche des talents pris. Ouverte, elle
 * arrête l'horloge (`main.ts`).
 */

import { TALENTS, type TalentId } from '../data/talents.ts';
import { onLocale, t } from '../i18n/locale.ts';
import type { World } from '../sim/world.ts';
import { itemIcon, uiIcon } from './icons.ts';

export class TalentPanel {
  public readonly root: HTMLElement;

  private readonly world: World;
  private readonly title: HTMLElement;
  private readonly lead: HTMLElement;
  private readonly more: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly takenTitle: HTMLElement;
  private readonly taken: HTMLElement;
  private readonly later: HTMLButtonElement;
  private readonly onChosen: (talent: TalentId) => void;

  /** `onChosen` : le talent pris, pour le son. */
  public constructor(world: World, onChosen: (talent: TalentId) => void) {
    this.world = world;
    this.onChosen = onChosen;
    this.root = element('div', 'overlay boon-overlay talent-overlay');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const panel = element('div', 'panel overlay-panel boon-panel talent-panel');

    this.title = element('h2', 'overlay-title');
    this.lead = element('p', 'overlay-text boon-lead');
    this.more = element('p', 'talent-more');
    this.cards = element('div', 'boon-cards');
    this.takenTitle = element('h3', 'talent-taken-title');
    this.taken = element('ul', 'talent-taken');
    this.later = element('button', 'button-secondary boon-later');
    this.later.type = 'button';
    this.later.addEventListener('click', () => this.close());
    panel.append(uiIcon('trophy', 48), this.title, this.lead, this.more, this.cards, this.takenTitle, this.taken, this.later);
    this.root.append(panel);
    // Un tap sur le voile, hors de la fenêtre : plus tard.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });

    onLocale(() => {
      this.title.textContent = t().hud.talent.title;
      this.takenTitle.textContent = t().hud.talent.taken;
      if (this.open) this.render();
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    this.render();
    this.root.hidden = false;
    (this.cards.querySelector<HTMLButtonElement>('button') ?? this.later).focus();
  }

  public close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const offer = this.world.talentOffer();
    const words = t().hud.talent;
    const count = takenCounts(this.world.adam.talents);

    this.lead.hidden = offer === null;
    this.more.hidden = offer === null || offer.pending < 2;
    this.cards.hidden = offer === null;
    this.later.textContent = offer ? words.later : words.close;
    if (offer) {
      this.lead.textContent = words.lead(offer.level);
      this.more.textContent = words.more(offer.pending - 1);
    }
    this.cards.replaceChildren(
      ...(offer?.choices ?? []).map((id, index) => {
        const card = element('button', 'boon-card talent-card');

        card.type = 'button';
        card.append(
          talentIcon(id, 40),
          text('boon-card-name', t().talents[id].label),
          text('boon-card-text', t().talents[id].description),
          text('boon-card-tag', words.stack(count.get(id) ?? 0, TALENTS[id].max)),
        );
        card.addEventListener('click', () => {
          this.world.push({ type: 'chooseTalent', index });
          this.close();
          this.onChosen(id);
        });
        return card;
      }),
    );

    // La fiche : chaque talent pris une ligne, dans l'ordre où il est venu, avec combien de fois.
    if (count.size === 0) {
      this.taken.replaceChildren(text('talent-none', words.none));
      return;
    }
    this.taken.replaceChildren(
      ...[...count].map(([id, times]) => {
        const row = element('li', 'talent-row');
        const name = text('talent-row-name', t().talents[id].label);

        if (times > 1) name.append(text('talent-row-times', ` ${words.times(times)}`));
        row.append(talentIcon(id, 24), name, text('talent-row-text', t().talents[id].description));
        return row;
      }),
    );
  }
}

/** Combien de fois chaque talent a été pris, dans l'ordre du premier choix. */
function takenCounts(taken: readonly TalentId[]): Map<TalentId, number> {
  const count = new Map<TalentId, number>();

  for (const id of taken) count.set(id, (count.get(id) ?? 0) + 1);
  return count;
}

function talentIcon(id: TalentId, size: number): HTMLElement {
  const { icon } = TALENTS[id];

  return 'item' in icon ? itemIcon(icon.item, size) : uiIcon(icon.ui, size);
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
