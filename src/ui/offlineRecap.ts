/**
 * Le récap « Pendant votre absence » : ce que la ville a fait pendant que
 * le jeu était fermé (`World.catchUp`, événement `offlineCaughtUp`).
 *
 * Il dit la durée de l'absence (et le plafond, s'il a mordu), ce qui a été
 * produit et consommé, les recherches finies, les enfants nés, puis ce qui
 * demande l'attention. Les gains sont déjà en ville : « Récupérer » ne
 * pousse aucune commande, il les fait voler jusqu'au bandeau de la ville,
 * qui rebondit, et rend la main. Ouvert, il arrête l'horloge (`main.ts`).
 */

import type { ItemId } from '../data/items.ts';
import type { OfflineAlertId } from '../data/offline.ts';
import { onLocale, t } from '../i18n/locale.ts';
import type { OfflineReport } from '../sim/offline.ts';
import { TICKS_PER_SECOND } from '../sim/world.ts';
import { buildingIcon, itemIcon, uiIcon } from './icons.ts';

/** L'icône de chaque alerte. */
const ALERT_ICONS: Record<OfflineAlertId, () => HTMLElement> = {
  hunger: () => itemIcon('food', 24),
  thirst: () => itemIcon('water', 24),
  lowFood: () => itemIcon('food', 24),
  lowWater: () => itemIcon('water', 24),
  nurseryHungry: () => buildingIcon('nursery', 24),
  storeFull: () => uiIcon('worker', 24),
};

/** Le vol d'une icône jusqu'à la ville, en ms, et l'écart entre deux départs. */
const FLIGHT_MS = 650;
const FLIGHT_STAGGER_MS = 70;
/** Au plus tant d'icônes en vol : au-delà, c'est du bruit. */
const FLIGHT_MAX = 8;

export class OfflineRecap {
  public readonly root: HTMLElement;

  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly collect: HTMLButtonElement;
  private readonly target: () => HTMLElement;
  private readonly onClose: () => void;
  private report: OfflineReport | null = null;
  private collecting = false;

  /**
   * `target` : le bandeau de la ville, où volent les gains ; `onClose` : la
   * main rendue au jeu.
   */
  public constructor(target: () => HTMLElement, onClose: () => void) {
    this.target = target;
    this.onClose = onClose;
    this.root = element('div', 'overlay offline-recap');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    this.panel = element('div', 'panel overlay-panel offline-panel');
    this.title = element('h2', 'overlay-title');
    this.body = element('div', 'offline-body');
    this.collect = element('button', 'button-primary offline-collect');
    this.collect.type = 'button';
    this.collect.addEventListener('click', () => this.gather());
    this.panel.append(uiIcon('moon', 48), this.title, this.body, this.collect);
    this.root.append(this.panel);

    onLocale(() => {
      this.title.textContent = t().offline.title;
      this.collect.textContent = t().offline.collect;
      if (this.report) this.render(this.report);
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(report: OfflineReport): void {
    this.report = report;
    this.collecting = false;
    this.panel.classList.remove('offline-leaving');
    this.render(report);
    this.root.hidden = false;
    this.collect.focus();
  }

  private render(report: OfflineReport): void {
    const text = t().offline;
    const parts: HTMLElement[] = [line('overlay-text', text.away(Math.max(1, Math.round(report.awayMs / 60_000))))];

    if (report.capped) parts.push(line('offline-capped', text.capped(Math.round(report.ticks / TICKS_PER_SECOND / 60))));

    const gained = amounts(report.gained);
    const spent = amounts(report.spent);

    if (gained.length > 0) parts.push(section(text.gained, chips(gained, '+', 'offline-gain')));
    if (spent.length > 0) parts.push(section(text.spent, chips(spent, '−', 'offline-spent')));
    if (report.research.length > 0 || report.births > 0) {
      const done = element('div', 'offline-lines');

      for (const id of report.research) done.append(row(buildingIcon('lab', 24), t().research[id].label));
      if (report.births > 0) done.append(row(uiIcon('child', 24), text.births(report.births)));
      parts.push(section(text.research, done));
    }
    if (report.alerts.length > 0) {
      const alerts = element('div', 'offline-lines offline-alerts');

      for (const alert of report.alerts) alerts.append(row(ALERT_ICONS[alert](), text.alerts[alert]));
      parts.push(section(text.alertsTitle, alerts));
    }
    if (gained.length === 0 && spent.length === 0 && report.research.length === 0 && report.births === 0) {
      parts.push(line('overlay-text', text.nothing));
    }
    this.body.replaceChildren(...parts);
  }

  /**
   * « Récupérer » : les icônes des gains s'envolent vers le bandeau de la
   * ville, l'une après l'autre ; il rebondit à leur arrivée, et la fenêtre
   * se referme. Sans animation voulue, elle se referme tout de suite.
   */
  private gather(): void {
    if (this.collecting) return;
    this.collecting = true;

    const town = this.target();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const icons = [...this.body.querySelectorAll<HTMLElement>('.offline-gain .icon')].slice(0, FLIGHT_MAX);

    if (reduced || icons.length === 0 || typeof town.animate !== 'function') {
      this.close();
      return;
    }

    const to = town.getBoundingClientRect();
    const host = this.root.parentElement ?? document.body;

    icons.forEach((icon, index) => {
      const from = icon.getBoundingClientRect();
      const flyer = icon.cloneNode(true) as HTMLElement;

      flyer.classList.add('offline-flyer');
      flyer.style.left = `${from.left}px`;
      flyer.style.top = `${from.top}px`;
      host.append(flyer);

      const dx = to.left + Math.min(to.width, 120) / 2 - from.left - from.width / 2;
      const dy = to.top + to.height / 2 - from.top - from.height / 2;

      flyer
        .animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 60}px) scale(1.5)`, opacity: 1, offset: 0.4 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.2 },
          ],
          { duration: FLIGHT_MS, delay: index * FLIGHT_STAGGER_MS, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'both' },
        )
        .finished.catch(() => undefined)
        .finally(() => flyer.remove());
    });
    this.panel.classList.add('offline-leaving');

    const landing = FLIGHT_MS + (icons.length - 1) * FLIGHT_STAGGER_MS;

    window.setTimeout(() => {
      town.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }],
        { duration: 420, easing: 'ease-out' },
      );
    }, landing - 80);
    window.setTimeout(() => this.close(), Math.min(landing, 900));
  }

  private close(): void {
    this.root.hidden = true;
    this.report = null;
    this.onClose();
  }
}

/** Les objets d'un compte, du plus gros au plus petit. */
function amounts(counts: Partial<Record<ItemId, number>>): [ItemId, number][] {
  return (Object.entries(counts) as [ItemId, number][]).filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
}

function chips(entries: [ItemId, number][], sign: string, className: string): HTMLElement {
  const list = element('div', `offline-chips ${className}`);

  for (const [item, amount] of entries) {
    const chip = element('span', 'offline-chip');

    chip.setAttribute('aria-label', `${sign}${amount} ${t().items[item]}`);
    chip.append(itemIcon(item, 22), line('offline-amount', `${sign}${amount}`, 'span'));
    list.append(chip);
  }
  return list;
}

function section(title: string, content: HTMLElement): HTMLElement {
  const block = element('section', 'offline-section');

  block.append(line('offline-section-title', title, 'h3'), content);
  return block;
}

function row(icon: HTMLElement, label: string): HTMLElement {
  const item = element('div', 'offline-line');

  item.append(icon, line('', label, 'span'));
  return item;
}

function line(className: string, content: string, tag: keyof HTMLElementTagNameMap = 'p'): HTMLElement {
  const node = document.createElement(tag);

  if (className) node.className = className;
  node.textContent = content;
  return node;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  node.className = className;
  return node;
}
