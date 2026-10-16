/**
 * La fenêtre Troc : ce que propose la caravane de passage.
 *
 * Elle s'ouvre quand Adam arrive au contact de la charrette garée, et se
 * ferme d'elle-même quand le marchand repart. En haut, le temps qui reste
 * et d'où vient le paiement — le sac, puis la ville si la caravane est dans
 * son rayon. Dessous, les échanges : leur coût en icônes (ce qui manque en
 * rouge, sac et ville comptés ensemble), ce qu'ils rapportent, et
 * « Échanger » ; un échange fait le reste, coché.
 *
 * Comme toute l'interface, elle ne modifie rien : « Échanger » pousse une
 * commande (`trade`) que le tick consomme. Elle lit le monde à chaque
 * frame ; la liste n'est reconstruite que si ce qu'elle affiche a changé.
 */

import { RARE_OFFERS } from '../data/caravan.ts';
import type { ItemId } from '../data/items.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import { tradeCost, tradeItems } from '../sim/caravan.ts';
import type { Caravan, MobileId, TradeOffer } from '../sim/types.ts';
import { TICKS_PER_SECOND, type World } from '../sim/world.ts';
import { itemAmount, uiIcon } from './icons.ts';

export class CaravanPanel {
  public readonly root: HTMLElement;

  private readonly timer: HTMLElement;
  private readonly where: HTMLElement;
  private readonly list: HTMLElement;
  private caravanId: MobileId | null = null;
  private last = '';

  private readonly world: World;
  private readonly onOpen: () => void;

  public constructor(world: World, onOpen: () => void = () => {}) {
    this.world = world;
    this.onOpen = onOpen;

    this.root = element('section', 'panel building-panel caravan-panel');
    this.root.hidden = true;

    const header = element('header', '');
    const title = element('h2', '');
    const titleText = document.createTextNode('');

    title.append(uiIcon('bag', 28), titleText);

    const close = element('button', 'building-panel-close');

    close.type = 'button';
    close.append(uiIcon('close'));
    close.addEventListener('click', () => this.close());
    header.append(title, close);

    this.timer = element('p', 'caravan-timer');
    this.where = element('p', 'building-panel-description');
    this.list = element('div', 'caravan-list');
    this.root.append(header, this.timer, this.where, this.list);

    // Les libellés fixes suivent la langue ; la liste se réécrit au prochain `update()`, dont la clé porte la langue.
    onLocale(() => {
      const text = t();

      this.root.setAttribute('aria-label', text.trade.title);
      titleText.data = text.trade.title;
      close.setAttribute('aria-label', text.common.close);
      this.update();
    });
  }

  public get open(): boolean {
    return this.caravanId !== null;
  }

  /** Ouvre la fenêtre de la caravane `id`. */
  public show(id: MobileId): void {
    this.caravanId = id;
    this.root.hidden = false;
    this.last = '';
    this.update();
    this.onOpen();
  }

  public close(): void {
    this.caravanId = null;
    this.root.hidden = true;
  }

  /** À chaque frame tant qu'elle est ouverte. Le marchand reparti, elle se ferme. */
  public update(): void {
    if (this.caravanId === null) return;

    const caravan = this.world.mobiles.get(this.caravanId);

    if (caravan?.kind !== 'caravan' || caravan.state === 'leaving') {
      this.close();
      return;
    }

    const { world } = this;
    const near = world.caravanInReach(caravan);
    const fromTown = world.caravanInTownRange(caravan) && world.townStock() !== null;
    const text = t().trade;
    const seconds = caravan.state === 'parked' ? Math.max(0, Math.ceil((caravan.leaveTick - world.tickCount) / TICKS_PER_SECOND)) : null;

    setText(
      this.timer,
      caravan.encounterId !== undefined ? text.wayside : seconds === null ? text.settling : text.leavesIn(seconds),
    );
    setText(
      this.where,
      !near ? text.approach : fromTown ? text.paidBoth : text.paidBag,
    );

    const items = [...new Set(caravan.offers.flatMap((trade) => tradeCost(trade).map(([item]) => item)))];
    const key = [
      locale(),
      caravan.id,
      near,
      fromTown,
      caravan.state,
      caravan.offers.map(({ done }) => done).join(','),
      ...items.map((item) => `${item}=${this.owned(caravan, item)}`),
      ...Object.entries(world.rareTrades).map(([id, count]) => `${id}=${count}`),
    ].join('|');

    if (key === this.last) return;
    this.last = key;
    this.list.replaceChildren(...caravan.offers.map((trade, index) => this.row(caravan, trade, index, near)));
  }

  /** Un échange : son titre, ce qu'il coûte, ce qu'il rapporte, et « Échanger ». */
  private row(caravan: Caravan, trade: TradeOffer, index: number, near: boolean): HTMLElement {
    const { world } = this;
    const missing = world.tradeMissing(caravan, trade);
    const row = element('article', 'trade-row');
    const head = element('div', 'trade-row-head');
    const name = element('h4', 'trade-name');
    const deal = element('div', 'trade-deal');
    const state = element('p', 'trade-status');
    const text = t().trade;

    row.dataset['status'] = trade.done ? 'done' : missing.length > 0 ? 'short' : 'ready';
    name.textContent = trade.rare ? text.rare(t().rareOffers[trade.rare]) : text.kinds[trade.kind as keyof typeof text.kinds];
    head.append(name);

    if (!trade.done) {
      const button = element('button', 'inventory-action trade-button');

      button.type = 'button';
      button.dataset['tone'] = 'deposit';
      button.textContent = text.exchange;
      button.disabled = !near || missing.length > 0 || caravan.state !== 'parked';
      button.addEventListener('click', () => world.push({ type: 'trade', caravan: caravan.id, offer: index }));
      head.append(button);
    }

    const cost = tradeCost(trade).map(([item, amount]) => itemAmount(item, amount, Math.min(amount, this.owned(caravan, item))));
    const gains = tradeItems(trade).map(([item, amount]) => itemAmount(item, amount));

    if (trade.bag > 0) {
      const bag = element('span', 'item-amount');

      bag.append(uiIcon('bag', 20), text.bagSlots(trade.bag));
      gains.push(bag);
    }
    deal.append(...cost, element('span', 'trade-arrow', '→'), ...gains);

    if (trade.done) {
      state.textContent = text.done;
    } else if (missing.length > 0) {
      state.textContent = text.missing(missing.map(([item, amount]) => text.missingItem(amount, t().items[item])).join(', '));
    } else if (trade.rare) {
      const left = RARE_OFFERS[trade.rare].limit - (world.rareTrades[trade.rare] ?? 0);

      state.textContent = text.rareLeft(left);
    } else {
      state.textContent = caravan.encounterId !== undefined ? text.waysideOnce : text.oncePerCaravan;
    }

    row.append(head, deal, state);
    return row;
  }

  /** Ce que la colonie a d'un objet pour payer : le sac, et la ville si la caravane est dans son rayon. */
  private owned(caravan: Caravan, item: ItemId): number {
    const town = this.world.caravanInTownRange(caravan) ? (this.world.townStock()?.available(item) ?? 0) : 0;

    return this.world.player.inventory.available(item) + town;
  }

  public destroy(): void {
    this.root.remove();
  }
}

function setText(target: HTMLElement, text: string): void {
  if (target.textContent !== text) target.textContent = text;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
