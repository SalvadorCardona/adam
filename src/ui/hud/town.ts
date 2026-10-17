/**
 * Le bandeau de la ville, en haut à gauche : le niveau d'Adam et sa barre
 * d'XP, le Prestige, la maison, puis le stock commun — ce que les chantiers
 * et les porteurs consomment — et, au bout, le bouton du panneau des
 * ressources. Sur un écran large, il défile de côté.
 */

import { MAX_LEVEL } from '../../data/levels.ts';
import type { ItemId } from '../../data/items.ts';
import { NEEDS, NEED_IDS } from '../../data/needs.ts';
import type { Trend } from '../../sim/flows.ts';
import { levelProgress } from '../../sim/levels.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { itemAmount, prestigeIcon, uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { element, text, tipped } from './dom.ts';

export class TownBanner {
  /** Le stock de la ville, compact. */
  public readonly root: HTMLElement;
  /** Au bout du bandeau de la ville : ouvre le panneau des ressources (`main.ts` le branche). */
  public readonly resourcesButton: HTMLButtonElement;
  /** Le niveau d'Adam et sa barre d'XP, en tête du bandeau de la ville. */
  public readonly level: HTMLElement;

  /** Son titre (la maison) et la liste de ses objets, gardés d'une mise à jour à l'autre. */
  private readonly title = element('div', 'hud-bag-title');
  private readonly list = element('div', 'hud-stock-items');
  /** Le Prestige de la colonie : son icône et son compte, en haut à gauche. */
  private readonly prestige: HTMLElement;
  private lastTown = '';
  private lastPrestige = '';
  private lastLevel = '';
  /** Le contenu du bandeau a changé : son bord estompé est à relire. */
  private overflowDirty = false;

  private readonly ctx: HudContext;
  private readonly disposer = new Disposer();

  public constructor(ctx: HudContext, openTalent: () => void) {
    this.ctx = ctx;
    this.root = element('div', 'panel hud-stock hud-town');
    // Le bandeau d'un écran large défile de côté : la molette aussi, et son
    // bord droit s'estompe tant qu'il reste des objets cachés.
    this.root.addEventListener('wheel', (event) => {
      const items = this.items();

      if (!items || items.scrollWidth <= items.clientWidth) return;
      event.preventDefault();
      items.scrollLeft += event.deltaX + event.deltaY;
    }, { passive: false });
    this.root.addEventListener('scroll', () => this.markOverflow(), true);
    this.resourcesButton = element('button', 'hud-resources');
    this.resourcesButton.type = 'button';
    this.resourcesButton.setAttribute('aria-haspopup', 'dialog');
    this.resourcesButton.append(uiIcon('stats', 20));
    this.disposer.add(onLocale(() => setTip(this.resourcesButton, t().resourcePanel.open)));
    this.disposer.listen(window, 'resize', () => this.markOverflow());
    this.prestige = element('div', 'hud-prestige');
    this.prestige.hidden = true;
    this.prestige.setAttribute('role', 'status');
    // Le niveau d'Adam se touche : il ouvre ses talents, la fiche et le choix qui attend.
    this.level = element('div', 'hud-level');
    this.level.setAttribute('role', 'button');
    this.level.tabIndex = 0;
    this.level.addEventListener('click', () => openTalent());
    this.level.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openTalent();
    });
    // Les rendus en cache repartent de zéro au changement de langue.
    this.disposer.add(onLocale(() => {
      this.lastTown = '';
      this.lastPrestige = '';
      this.lastLevel = '';
    }));
  }

  /** La ville, puis le Prestige, puis le niveau d'Adam. */
  public update(): void {
    this.updateTown();
    this.updatePrestige();
    this.updateLevel();
  }

  /** Un niveau passé : le niveau rebondit un moment. */
  public levelUp(): void {
    this.level.dataset['up'] = 'true';
    window.setTimeout(() => delete this.level.dataset['up'], 1400);
  }

  /** En tête de frame, après les lectures de `measureLayout` : le bord qui s'estompe, s'il est à relire. */
  public measureOverflow(): void {
    if (!this.overflowDirty) return;
    this.overflowDirty = false;
    this.markOverflow();
  }

  /**
   * La ville : le stock commun, ce que les chantiers et les porteurs
   * consomment. Tant que la mairie est en chantier, il n'y a pas de ville —
   * la carte le dit au lieu de montrer un stock vide. À côté de chaque objet,
   * sa tendance sur la dernière minute de jeu (`TownFlows.trend`) : une
   * flèche menthe s'il monte, corail s'il baisse, rien s'il stagne. Au bout
   * du bandeau, le bouton du panneau des ressources. Un objet d'un besoin
   * (nourriture, eau) y reste à 0, en corail, une fois la mairie bâtie ; les
   * autres disparaissent à zéro.
   */
  private updateTown(): void {
    const { world } = this.ctx;
    const stock = world.townStock();
    const entries = stock ? withVitals(stock.entries()) : [];
    const { flows } = world;
    const key = stock ? entries.map(([item, amount]) => `${item}:${amount}:${flows.trend(item)}:${world.townHasPlenty(item)}`).join(',') : 'none';

    if (key === this.lastTown) return;
    this.lastTown = key;

    const title = this.title;
    const label = t().hud.stock;

    title.replaceChildren(uiIcon('town', 20));
    if (!stock) title.append(text('hud-town-state', label.toBuild));
    setTip(title, label.townTitle);

    // La liste reste le même nœud : son défilement tient sans le relire.
    this.list.replaceChildren(...entries.map(([item, amount]) => townEntry(item, amount, flows.trend(item), world.townHasPlenty(item))));
    this.root.dataset['empty'] = String(entries.length === 0);
    this.resourcesButton.hidden = !stock;
    // Le niveau d'Adam et le Prestige ouvrent le bandeau, avant la ville et ses objets ; le bouton des ressources le ferme.
    if (this.list.parentNode !== this.root) this.root.replaceChildren(this.level, this.prestige, title, this.list, this.resourcesButton);
    // Le bord qui s'estompe se relit en tête de la frame suivante (`measureLayout`), sans forcer la mise en page.
    this.overflowDirty = true;
  }

  private items(): HTMLElement | null {
    return this.list.isConnected ? this.list : null;
  }

  /** Le bandeau de la ville cache-t-il encore des objets à droite ? */
  private markOverflow(): void {
    const items = this.items();

    if (!items) return;
    const more = String(items.scrollLeft + items.clientWidth < items.scrollWidth - 1);

    if (items.dataset['more'] !== more) items.dataset['more'] = more;
  }

  /** Le Prestige : caché tant que la colonie n'en a pas, puis toujours là, en tête du bandeau de la ville. */
  private updatePrestige(): void {
    const { prestige } = this.ctx.world;
    const key = String(prestige);

    if (key === this.lastPrestige) return;
    this.lastPrestige = key;

    const label = t().hud.stock;

    this.prestige.hidden = prestige <= 0;
    this.prestige.replaceChildren(prestigeIcon(18), text('hud-prestige-count', key));
    setTip(this.prestige, label.prestigeLabel(prestige));
  }

  /** Le niveau d'Adam : « Niv. 3 » et une fine barre d'XP dessous, en tête du bandeau de la ville. */
  private updateLevel(): void {
    const { level, into, needed } = levelProgress(this.ctx.world.player.xp);
    const max = level >= MAX_LEVEL;
    const key = `${level}:${into}`;

    if (key === this.lastLevel) return;
    this.lastLevel = key;

    const label = t().hud.stock;
    const bar = element('span', 'hud-level-bar');
    const fill = element('span', 'hud-level-fill');

    fill.style.width = `${Math.round((into / needed) * 100)}%`;
    bar.append(fill);
    this.level.replaceChildren(text('hud-level-label', label.level(level)), bar);
    setTip(this.level, label.levelTip(level, into, needed, max));
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}

/** Le stock de la ville, plus à 0 les objets des besoins (`NEEDS`) qu'il n'a plus, ceux à sec en tête. */
function withVitals(entries: [ItemId, number][]): [ItemId, number][] {
  const vitals: ItemId[] = NEED_IDS.map((need) => NEEDS[need].item);
  const missing = vitals.filter((item) => !entries.some(([owned]) => owned === item));
  const all = [...entries, ...missing.map((item): [ItemId, number] => [item, 0])];

  // Un objet vital à sec passe en tête du bandeau : c'est ce qui presse, et il ne doit pas défiler hors de vue.
  return [...all.filter(([item, amount]) => amount === 0 && vitals.includes(item)), ...all.filter(([item, amount]) => !(amount === 0 && vitals.includes(item)))];
}

/** Un objet du bandeau de la ville : son icône, sa quantité, et sa flèche s'il monte ou baisse. */
function townEntry(item: ItemId, amount: number, trend: Trend, plenty: boolean): HTMLElement {
  const label = t().hud.stock;
  const name = t().items[item];
  const entry = itemAmount(item, amount);

  if (amount === 0) entry.dataset['empty'] = 'true';
  // La coche : la ville en a assez, Adam n'en ramasse plus en passant.
  if (plenty) {
    const tick = uiIcon('check', 12);

    tick.classList.add('hud-plenty');
    entry.append(tick);
    entry.dataset['plenty'] = 'true';
  }
  if (trend === 'flat') return tipped(entry, plenty ? label.inTownPlenty(name, amount) : label.inTown(name, amount));

  const arrow = uiIcon(trend === 'up' ? 'trendUp' : 'trendDown', 12);

  arrow.classList.add('hud-trend');
  entry.dataset['trend'] = trend;
  entry.append(arrow);
  return tipped(entry, plenty ? label.inTownPlenty(name, amount) : trend === 'up' ? label.inTownUp(name, amount) : label.inTownDown(name, amount));
}
