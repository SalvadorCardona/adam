/**
 * Le sac : un gros bouton violet en bas à droite, le pendant de « Bâtir » —
 * son pictogramme, « 7/60 » dans une capsule qui se remplit, l'objet que le
 * conseil réclame et la touche I. Le détail est dans le panneau qu'il ouvre
 * (`bagPanel.ts`).
 */

import type { ItemId } from '../../data/items.ts';
import { locale, t } from '../../i18n/locale.ts';
import { itemAmount, uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { element, text } from './dom.ts';

export class BagButton {
  public readonly root: HTMLButtonElement;

  private last = '';

  private readonly ctx: HudContext;

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.root = element('button', 'hud-bag');
    this.root.type = 'button';
    this.root.setAttribute('aria-keyshortcuts', 'I');
  }

  /**
   * Le DOM n'est reconstruit que si le contenu change — comparer une clé
   * texte coûte moins qu'un diff. `wanted` : l'objet que réclame le conseil.
   */
  public update(wanted: ItemId | null): void {
    const { world } = this.ctx;
    const { inventory } = world.player;
    const entries = inventory.entries();
    const stock = world.townStock();
    const town = stock?.entries().reduce((sum, [, amount]) => sum + amount, 0) ?? null;
    const key = `${inventory.total()}/${inventory.capacity}|${entries.map(([item, amount]) => `${item}:${amount}`).join(',')}|${town}|${wanted}|${locale()}`;
    const bag = this.root;

    if (key === this.last) return;
    this.last = key;

    const label = t().hud.stock;
    const full = inventory.freeSpace() <= 0;
    const count = text('hud-bag-count', `${inventory.total()}/${inventory.capacity}`);
    const hint = element('kbd', 'key-hint');

    count.dataset['full'] = String(full);
    count.style.setProperty('--fill', `${Math.round((inventory.total() / inventory.capacity) * 100)}%`);
    hint.textContent = t().menu.keys.inventory;
    bag.replaceChildren(uiIcon('bagButton', 28), count);
    if (wanted) {
      const chip = itemAmount(wanted, inventory.count(wanted));

      chip.classList.add('hud-bag-wanted');
      chip.lastElementChild!.textContent = `×${inventory.count(wanted)}`;
      chip.dataset['empty'] = String(inventory.count(wanted) === 0);
      setTip(chip, label.wanted(t().items[wanted], inventory.count(wanted)));
      bag.append(chip);
    }
    bag.append(hint);
    bag.dataset['full'] = String(full);
    setTip(bag, label.bagTip(inventory.total(), inventory.capacity));
    bag.setAttribute(
      'aria-label',
      town === null ? label.bagLabel(inventory.total(), inventory.capacity) : label.bagLabelTown(inventory.total(), inventory.capacity, town),
    );
  }

  /** Rien de branché hors du bouton. */
  public dispose(): void {}
}
