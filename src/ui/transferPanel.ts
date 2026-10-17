/**
 * Zone d'échange sac ⇄ coffre.
 *
 * Deux bandes empilées, lisibles au pouce : en haut le coffre du bâtiment,
 * en bas le sac d'Adam et sa jauge. Chaque objet est une puce icône +
 * quantité ; un tap la fait passer de l'autre côté, par 1, par 10 ou en
 * entier selon le sélecteur, et l'icône vole d'une bande à l'autre. Deux
 * gros boutons, « Tout prendre » et « Tout déposer », font le reste en un
 * tap.
 *
 * Elle sert à tout bâtiment qui a un coffre : on lui donne le coffre et ses
 * règles (`TransferRules`, `sim/transfer.ts`), elle grise ce qui ne passe
 * pas — le sac plein, ce qui est réservé pour un chantier, ce que le coffre
 * refuse — et dit combien est réservé. Elle ne modifie rien : chaque tap
 * pousse une commande `transferItems`, que le tick juge sur les mêmes règles.
 */

import type { UiIcon } from '../art/ui.ts';
import type { ItemId } from '../data/items.ts';
import type { Command } from '../sim/commands.ts';
import type { Store } from '../sim/store.ts';
import {
  TRANSFER_QUANTITIES,
  transferView,
  type TransferDirection,
  type TransferQuantity,
  type TransferRules,
  type TransferView,
} from '../sim/transfer.ts';
import type { EntityId } from '../sim/types.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import { Disposer } from './disposer.ts';
import { itemIcon, uiIcon } from './icons.ts';

/** Le coffre affiché : à qui il est, ce qu'il contient, ses règles, et si Adam est assez près. */
export interface TransferChest {
  id: EntityId;
  store: Store;
  rules: TransferRules;
  /** « Coffre de la ville », « Coffre de la forge »… */
  title: string;
  icon: UiIcon;
  /** Même portée que le dépôt : loin du bâtiment, tout est grisé. */
  reachable: boolean;
}

/** Durée du vol d'une icône d'une bande à l'autre. */
const FLIGHT_MS = 420;

export class TransferPanel {
  public readonly root: HTMLElement;

  private readonly chestTitle: HTMLElement;
  private readonly chestIcon: HTMLElement;
  private readonly chestCount: HTMLElement;
  private readonly chestChips: HTMLElement;
  private readonly bagCount: HTMLElement;
  private readonly bagGauge: HTMLElement;
  private readonly bagChips: HTMLElement;
  private readonly quantityButtons: Map<TransferQuantity, HTMLButtonElement>;
  private readonly takeAllButton: HTMLButtonElement;
  private readonly depositAllButton: HTMLButtonElement;
  private readonly note: HTMLElement;

  private quantity: TransferQuantity = 1;
  private chest: TransferChest | null = null;
  private lastKey = '';

  private readonly bag: () => Store;
  private readonly push: (command: Command) => void;
  /** Ce qu'il a branché hors de lui : la langue. */
  private readonly disposer = new Disposer();

  public constructor(bag: () => Store, push: (command: Command) => void) {
    this.bag = bag;
    this.push = push;

    this.root = document.createElement('section');
    this.root.className = 'transfer';

    // Le coffre, en haut.
    const chestBand = band('chest');

    this.chestIcon = document.createElement('span');
    this.chestIcon.className = 'transfer-band-icon';
    this.chestTitle = document.createElement('span');
    this.chestTitle.className = 'transfer-band-title';
    this.chestCount = document.createElement('span');
    this.chestCount.className = 'transfer-band-count';
    this.chestChips = chips();
    chestBand.head.append(this.chestIcon, this.chestTitle, this.chestCount);
    chestBand.root.append(this.chestChips);

    // Le sélecteur de quantité, entre les deux bandes.
    const selector = document.createElement('div');

    selector.className = 'transfer-quantity';
    selector.setAttribute('role', 'radiogroup');
    this.quantityButtons = new Map(
      TRANSFER_QUANTITIES.map((quantity) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.setAttribute('role', 'radio');
        button.addEventListener('click', () => {
          this.quantity = quantity;
          this.lastKey = '';
          this.update();
        });
        selector.append(button);
        return [quantity, button];
      }),
    );

    // Le sac, en bas, avec sa jauge.
    const bagBand = band('bag');
    const bagTitle = document.createElement('span');
    const gauge = document.createElement('div');

    bagTitle.className = 'transfer-band-title';
    this.bagCount = document.createElement('span');
    this.bagCount.className = 'transfer-band-count';
    gauge.className = 'transfer-gauge';
    this.bagGauge = document.createElement('div');
    gauge.append(this.bagGauge);
    this.bagChips = chips();
    bagBand.head.append(iconBox(uiIcon('bag', 22)), bagTitle, this.bagCount);
    bagBand.root.append(gauge, this.bagChips);

    const actions = document.createElement('div');

    actions.className = 'building-panel-actions transfer-actions';
    const takeAll = bigButton('takeAll', 'take', () => this.moveAll('take'));
    const depositAll = bigButton('depositAll', 'deposit', () => this.moveAll('deposit'));

    this.takeAllButton = takeAll.button;
    this.depositAllButton = depositAll.button;
    actions.append(this.takeAllButton, this.depositAllButton);

    this.note = document.createElement('p');
    this.note.className = 'transfer-note';

    this.root.append(chestBand.root, selector, bagBand.root, actions, this.note);

    // Les libellés fixes suivent la langue ; le reste se réécrit au prochain `update`.
    this.disposer.add(onLocale(() => {
      const text = t().panel.transfer;

      selector.setAttribute('aria-label', text.quantity);
      for (const [quantity, button] of this.quantityButtons) {
        button.textContent = quantity === 'all' ? text.all : String(quantity);
      }
      bagTitle.textContent = text.bag;
      takeAll.label.textContent = text.takeAll;
      depositAll.label.textContent = text.depositAll;
      this.lastKey = '';
      this.update();
    }));
  }

  /** Ne suit plus la langue ; la fenêtre du bâtiment l'appelle en se défaisant. */
  public dispose(): void {
    this.disposer.dispose();
  }

  /** Le coffre à montrer, ou `null` : la zone se cache. */
  public show(chest: TransferChest | null): void {
    this.chest = chest;
    this.root.hidden = chest === null;
    this.update();
  }

  /** À chaque frame : les puces suivent le coffre et le sac, reconstruites seulement si quelque chose a changé. */
  public update(): void {
    const { chest } = this;

    if (!chest) return;

    const bag = this.bag();
    const view = transferView(chest.store, chest.rules, bag, this.quantity);
    const key = `${locale()}:${chest.id}:${chest.title}:${chest.reachable}:${this.quantity}:${bag.capacity}:${JSON.stringify(view)}`;

    if (key === this.lastKey) return;
    this.lastKey = key;
    this.render(chest, bag, view);
  }

  private render(chest: TransferChest, bag: Store, view: TransferView): void {
    const { reachable } = chest;
    const text = t().panel.transfer;
    const capacity = chest.store.capacity;

    this.chestIcon.replaceChildren(uiIcon(chest.icon, 22));
    this.chestTitle.textContent = chest.title;
    this.chestCount.textContent = Number.isFinite(capacity) ? `${chest.store.total()}/${capacity}` : '';

    this.chestChips.replaceChildren(
      ...(view.chest.length === 0
        ? [empty(text.empty)]
        : view.chest.map(({ item, count, reserved, movable }) =>
            chip(item, count, reserved > 0 ? text.reserved(reserved) : '', reachable && movable > 0, (from) =>
              this.move('take', item, from),
            ),
          )),
    );

    this.bagCount.textContent = `${bag.total()}/${bag.capacity}`;
    this.bagCount.dataset['full'] = String(bag.freeSpace() <= 0);
    this.bagGauge.style.width = `${Math.round(Math.min(1, bag.total() / bag.capacity) * 100)}%`;
    this.bagGauge.dataset['full'] = String(bag.freeSpace() <= 0);
    this.bagChips.replaceChildren(
      ...(view.bag.length === 0
        ? [empty(text.empty)]
        : view.bag.map(({ item, count, movable }) =>
            chip(item, count, '', reachable && movable > 0, (from) => this.move('deposit', item, from)),
          )),
    );

    for (const [quantity, button] of this.quantityButtons) {
      button.setAttribute('aria-checked', String(quantity === this.quantity));
    }
    this.takeAllButton.disabled = !reachable || view.takeAll === 0;
    this.depositAllButton.disabled = !reachable || view.depositAll === 0;

    this.note.textContent = !reachable
      ? text.comeCloser
      : view.chest.length > 0 && view.takeAll === 0 && bag.freeSpace() <= 0
        ? text.bagFull
        : view.bag.length > 0 && view.depositAll === 0
          ? text.nothingFits
          : '';
    this.note.hidden = this.note.textContent === '';
  }

  /** Un tap sur une puce : la commande part, l'icône s'envole vers l'autre bande. */
  private move(direction: TransferDirection, item: ItemId, from: HTMLElement): void {
    if (!this.chest) return;
    this.push({ type: 'transferItems', id: this.chest.id, direction, quantity: this.quantity, item });
    fly(item, from, direction === 'take' ? this.bagChips : this.chestChips);
  }

  private moveAll(direction: TransferDirection): void {
    if (!this.chest) return;
    this.push({ type: 'transferItems', id: this.chest.id, direction, quantity: 'all' });

    const [from, to] = direction === 'take' ? [this.chestChips, this.bagChips] : [this.bagChips, this.chestChips];

    for (const element of from.querySelectorAll<HTMLButtonElement>('.transfer-chip:not([disabled])')) {
      const item = element.dataset['item'] as ItemId | undefined;

      if (item) fly(item, element, to);
    }
  }
}

function band(side: 'chest' | 'bag'): { root: HTMLElement; head: HTMLElement } {
  const root = document.createElement('div');
  const head = document.createElement('div');

  root.className = 'transfer-band';
  root.dataset['side'] = side;
  head.className = 'transfer-band-head';
  root.append(head);
  return { root, head };
}

function chips(): HTMLElement {
  const element = document.createElement('div');

  element.className = 'transfer-chips';
  return element;
}

function iconBox(icon: HTMLElement): HTMLElement {
  const box = document.createElement('span');

  box.className = 'transfer-band-icon';
  box.append(icon);
  return box;
}

function empty(text: string): HTMLElement {
  const element = document.createElement('span');

  element.className = 'transfer-empty';
  element.textContent = text;
  return element;
}

/** Une puce : l'icône, la quantité, et dessous ce qui en est réservé. Grisée si rien ne passe. */
function chip(item: ItemId, count: number, note: string, enabled: boolean, onTap: (from: HTMLElement) => void): HTMLButtonElement {
  const button = document.createElement('button');
  const amount = document.createElement('span');

  button.type = 'button';
  button.className = 'transfer-chip';
  button.dataset['item'] = item;
  button.disabled = !enabled;
  amount.className = 'transfer-chip-count';
  amount.textContent = String(count);
  button.append(itemIcon(item, 22), amount);

  if (note) {
    const small = document.createElement('span');

    small.className = 'transfer-chip-note';
    small.textContent = note;
    button.append(small);
  }
  button.addEventListener('click', () => onTap(button));
  return button;
}

/** Un gros bouton, et le nœud de son libellé, que la langue réécrit. */
function bigButton(
  icon: UiIcon,
  tone: TransferDirection,
  onClick: () => void,
): { button: HTMLButtonElement; label: Text } {
  const button = document.createElement('button');
  const label = document.createTextNode('');

  button.type = 'button';
  button.dataset['tone'] = tone;
  button.append(uiIcon(icon, 22), label);
  button.addEventListener('click', onClick);
  return { button, label };
}

/**
 * L'icône de l'objet quitte sa puce et file vers l'autre bande. Pur
 * ressenti : un clone posé par-dessus l'interface, retiré à l'arrivée.
 * Rien ne vole si le joueur a demandé moins d'animations.
 */
function fly(item: ItemId, from: HTMLElement, to: HTMLElement): void {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const icon = itemIcon(item, 22);

  icon.classList.add('transfer-flight');
  icon.style.left = `${start.left + 10}px`;
  icon.style.top = `${start.top + start.height / 2 - 11}px`;
  document.body.append(icon);

  const dx = end.left + end.width / 2 - (start.left + 10) - 11;
  const dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const flight = icon.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 18}px) scale(1.35)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx * 0.9}px, ${dy * 0.9}px) scale(0.9)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0 },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
  );

  flight.onfinish = () => icon.remove();
  flight.oncancel = () => icon.remove();
}
