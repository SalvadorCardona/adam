/**
 * L'inventaire : l'onglet « Inventaire » de la fenêtre du sac (`bagPanel.ts`).
 *
 * Il s'ouvre au tap sur le sac du HUD, ou à la touche I sur PC, et montre le
 * détail que le HUD, compact, ne montre pas : la place qui reste, chaque
 * objet porté, et le stock de la ville.
 *
 * Le sac est une grille de cases, comme dans la plupart des jeux : une case
 * par objet, son icône en grand et sa quantité en pastille au coin. Des
 * cases vides complètent la dernière rangée (deux rangées au moins) : le sac
 * se lit comme un sac, même vide. La place, elle, se compte en objets, pas en
 * cases — la jauge au-dessus de la grille la dit.
 *
 * Toucher une case choisit l'objet : sous la grille, son nom, sa quantité,
 * le sélecteur 1 / 10 / Tout et ce qu'on peut en faire. Près de la mairie,
 * « Déposer » (et « Déposer en ville » pour tout le sac) : le sac passe dans
 * le stock de la ville. Ailleurs, « Déposer » reste visible mais éteint, et
 * « Jeter » / « Tout jeter » font tomber ce qu'Adam porte à ses pieds, en tas
 * qu'il reprend en repassant dessus — rien n'est détruit, il n'y a donc rien
 * à confirmer.
 *
 * La ville y est un petit tableau de bord (`sim/flows.ts`) : à côté de chaque
 * objet, son débit net sur les deux dernières minutes (« +28/min » en menthe,
 * « −4/min » en corail, rien s'il ne bouge pas), et au-dessus, au plus deux
 * alertes — ce qu'une recette attend et que la ville n'a pas, ce qui
 * s'empile sans que personne ne l'utilise. Taper une alerte ferme la
 * fenêtre et fait pointer un repère de bord vers le bâtiment en cause.
 *
 * Il ne met pas le jeu en pause et ne modifie rien lui-même : chaque bouton
 * pousse une commande (`depositToTown`, `dropItem`) que le tick consomme.
 */

import type { ItemId } from '../data/items.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import { formatRate, type FlowAlert } from '../sim/flows.ts';
import { TRANSFER_QUANTITIES, type TransferQuantity } from '../sim/transfer.ts';
import type { World } from '../sim/world.ts';
import { itemAmount, itemIcon, uiIcon } from './icons.ts';

/** Cases par rangée, et rangées au moins : la grille garde sa forme, sac vide ou non. */
const SLOT_COLUMNS = 5;
const MIN_ROWS = 2;

export class InventoryTab {
  /** Le contenu de l'onglet : la jauge, la grille et la ville, puis l'objet choisi et les boutons du bas. */
  public readonly root: HTMLElement;

  private readonly capacity: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly where: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly town: HTMLElement;
  private readonly townItems: HTMLElement;
  private readonly townAlerts: HTMLElement;
  private readonly allButton: HTMLButtonElement;
  private readonly dropAllButton: HTMLButtonElement;
  private last = '';
  private active = false;
  private selected: ItemId | null = null;
  private quantity: TransferQuantity = 'all';

  private readonly world: World;
  private readonly onAlert: (alert: FlowAlert) => void;

  public constructor(world: World, onAlert: (alert: FlowAlert) => void) {
    this.world = world;
    this.onAlert = onAlert;

    this.root = element('div', 'inventory-tab');
    this.root.id = 'bag-tab-inventory';
    this.root.setAttribute('role', 'tabpanel');

    const gauge = element('div', 'inventory-gauge');
    const bar = element('div', 'transfer-gauge');

    this.barFill = element('div', '');
    bar.append(this.barFill);
    this.capacity = element('p', 'inventory-capacity');
    gauge.append(this.capacity, bar);

    this.where = element('p', 'inventory-where');

    const scroll = element('div', 'inventory-scroll');

    this.grid = element('div', 'inventory-grid');
    this.grid.setAttribute('role', 'listbox');
    this.empty = element('p', 'inventory-empty');

    this.town = element('div', 'inventory-town');

    const townTitle = element('div', 'inventory-town-title');
    const townText = document.createTextNode('');

    townTitle.append(uiIcon('town', 20), townText);
    this.townAlerts = element('ul', 'inventory-alerts');
    this.townItems = element('div', 'building-panel-items');
    this.town.append(townTitle, this.townAlerts, this.townItems);
    scroll.append(this.grid, this.empty, this.town);

    this.detail = element('div', 'inventory-detail');
    this.detail.setAttribute('aria-live', 'polite');

    const actions = element('div', 'inventory-actions');

    this.allButton = element('button', 'button-primary');
    this.allButton.type = 'button';
    this.allButton.dataset['tone'] = 'deposit';
    this.allButton.addEventListener('click', () => this.world.push({ type: 'depositToTown' }));
    this.dropAllButton = element('button', 'button-secondary');
    this.dropAllButton.type = 'button';
    this.dropAllButton.dataset['tone'] = 'drop';
    this.dropAllButton.addEventListener('click', () => this.world.push({ type: 'dropItem' }));
    actions.append(this.allButton, this.dropAllButton);

    this.root.append(gauge, this.where, scroll, this.detail, actions);

    // Les libellés fixes suivent la langue ; le reste se réécrit au prochain `update()`, dont la clé porte la langue.
    onLocale(() => {
      townText.data = t().inventory.town;
      this.update();
    });
  }

  /** L'onglet devient celui qu'on voit. */
  public enter(): void {
    this.active = true;
    this.last = '';
    this.update();
  }

  public leave(): void {
    this.active = false;
  }

  /** À chaque frame tant qu'il est à l'écran : le DOM n'est reconstruit que si ce qu'il montre change. */
  public update(): void {
    if (!this.active) return;

    const { world } = this;
    const { inventory } = world.player;
    const entries = inventory.entries();
    const town = world.townStock();
    const near = world.nearTown();
    const rates = town ? town.entries().map(([item]) => Math.round(world.flows.netRate(item))) : [];
    const alerts = town ? world.flows.alerts(world) : [];

    // L'objet choisi est parti du sac : plus rien n'est choisi.
    if (this.selected && inventory.count(this.selected) <= 0) this.selected = null;

    const key = [
      locale(),
      near,
      Boolean(town),
      inventory.capacity,
      this.selected,
      this.quantity,
      entries.map(([item, amount]) => `${item}:${amount}`).join(','),
      town ? town.entries().map(([item, amount]) => `${item}:${amount}`).join(',') : 'none',
      rates.join(','),
      alerts.map((alert) => `${alertText(alert)}@${alert.target}`).join(','),
    ].join('|');

    if (key === this.last) return;
    this.last = key;

    const total = inventory.total();
    const free = inventory.freeSpace();
    const text = t().inventory;

    this.barFill.style.width = `${Math.round((total / inventory.capacity) * 100)}%`;
    this.barFill.dataset['full'] = String(free <= 0);
    this.capacity.textContent = text.capacity(total, inventory.capacity, free);
    this.capacity.dataset['full'] = String(free <= 0);
    this.where.textContent = near ? text.whereNear : town ? text.whereFar : text.whereNoTown;
    this.where.dataset['near'] = String(near);

    const slots = Math.max(MIN_ROWS, Math.ceil(entries.length / SLOT_COLUMNS)) * SLOT_COLUMNS;

    this.grid.style.setProperty('--columns', String(SLOT_COLUMNS));
    this.grid.replaceChildren(
      ...entries.map(([item, amount]) => this.slot(item, amount)),
      ...Array.from({ length: slots - entries.length }, () => element('span', 'inventory-slot inventory-slot-empty')),
    );
    this.empty.textContent = text.empty;
    this.empty.hidden = entries.length > 0;

    this.renderDetail(near, Boolean(town));

    // Près de la mairie, « Déposer en ville » ; ailleurs, il reste là mais éteint, et « Tout jeter » prend le relais.
    this.allButton.textContent = text.depositAll;
    this.allButton.disabled = !near || entries.length === 0;
    this.allButton.hidden = !town;
    this.dropAllButton.textContent = text.dropAll;
    this.dropAllButton.disabled = entries.length === 0;
    this.dropAllButton.hidden = near;

    this.town.hidden = !town;
    if (town) {
      const stock = town.entries();

      this.townItems.replaceChildren(
        ...(stock.length === 0
          ? [element('span', 'inventory-empty', text.townEmpty)]
          : stock.map(([item, amount], index) => this.stockEntry(item, amount, rates[index]!))),
      );
      this.townAlerts.replaceChildren(...alerts.map((alert) => this.alertRow(alert)));
      this.townAlerts.hidden = alerts.length === 0;
    }
  }

  /** La case d'un objet : son icône en grand, sa quantité en pastille au coin. Un tap la choisit. */
  private slot(item: ItemId, amount: number): HTMLButtonElement {
    const label = t().items[item];
    const slot = element('button', 'inventory-slot');
    const count = element('span', 'inventory-slot-count', String(amount));

    slot.type = 'button';
    slot.setAttribute('role', 'option');
    slot.setAttribute('aria-selected', String(item === this.selected));
    slot.setAttribute('aria-label', t().inventory.slot(label, amount));
    slot.dataset['tip'] = label;
    slot.append(itemIcon(item, 40), count);
    slot.addEventListener('click', () => {
      this.selected = item === this.selected ? null : item;
      this.update();
    });
    return slot;
  }

  /** Sous la grille : l'objet choisi, sa quantité, le sélecteur et ses boutons — ou ce qu'il faut toucher. */
  private renderDetail(near: boolean, hasTown: boolean): void {
    const text = t().inventory;
    const item = this.selected;

    this.detail.dataset['empty'] = String(item === null);
    if (item === null) {
      this.detail.replaceChildren(element('p', 'inventory-pick', text.pick));
      return;
    }

    const label = t().items[item];
    const amount = this.world.player.inventory.count(item);
    const head = element('div', 'inventory-detail-head');
    const name = element('span', 'inventory-detail-name', label);
    const count = element('span', 'inventory-detail-count', `×${amount}`);

    head.append(itemIcon(item, 32), name, count);

    const selector = element('div', 'transfer-quantity inventory-quantity');

    selector.setAttribute('role', 'radiogroup');
    selector.setAttribute('aria-label', t().panel.transfer.quantity);
    for (const quantity of TRANSFER_QUANTITIES) {
      const button = element('button', '', quantity === 'all' ? t().panel.transfer.all : String(quantity));

      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(quantity === this.quantity));
      button.addEventListener('click', () => {
        this.quantity = quantity;
        this.update();
      });
      selector.append(button);
    }

    const moved = this.quantity === 'all' ? undefined : this.quantity;
    const buttons = element('div', 'inventory-detail-actions');

    if (hasTown) {
      const deposit = element('button', 'inventory-action', text.deposit);

      deposit.type = 'button';
      deposit.dataset['tone'] = 'deposit';
      deposit.disabled = !near;
      deposit.setAttribute('aria-label', text.depositItem(label));
      deposit.addEventListener('click', () => this.world.push({ type: 'depositToTown', item, amount: moved }));
      buttons.append(deposit);
    }
    if (!near) {
      const drop = element('button', 'inventory-action', text.drop);

      drop.type = 'button';
      drop.dataset['tone'] = 'drop';
      drop.setAttribute('aria-label', text.dropItem(label));
      drop.addEventListener('click', () => this.world.push({ type: 'dropItem', item, amount: moved }));
      buttons.append(drop);
    }
    this.detail.replaceChildren(head, selector, buttons);
  }

  /** Un objet de la ville : sa quantité, et son débit net s'il bouge. */
  private stockEntry(item: ItemId, amount: number, rate: number): HTMLElement {
    const entry = element('span', 'inventory-stock');

    entry.append(itemAmount(item, amount));
    if (rate !== 0) {
      const trend = element('span', 'inventory-rate', t().inventory.perMinute(formatRate(rate)));

      trend.dataset['trend'] = rate > 0 ? 'up' : 'down';
      entry.append(trend);
    }
    return entry;
  }

  /** Une alerte de la ville : la taper ferme la fenêtre et montre le bâtiment en cause. */
  private alertRow(alert: FlowAlert): HTMLElement {
    const row = element('li', '');
    const button = element('button', 'inventory-alert');

    button.type = 'button';
    button.dataset['kind'] = alert.kind;
    button.append(itemIcon(alert.item, 22), element('span', '', alertText(alert)));
    button.addEventListener('click', () => this.onAlert(alert));
    row.append(button);
    return row;
  }
}

/** La phrase d'une alerte de la ville, dans la langue du moment. */
function alertText(alert: FlowAlert): string {
  const text = t().inventory;
  const item = t().items[alert.item];

  if (alert.kind === 'shortage') return text.shortage[alert.waiting](item, alert.stock);
  return alert.rate > 0 ? text.surplusRate(item, formatRate(alert.rate)) : text.surplusStock(item, alert.stock);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
