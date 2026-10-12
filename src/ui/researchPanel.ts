/**
 * Le panneau Recherche : ce que montre la fenêtre du labo.
 *
 * En haut, ce que mène ce labo : la recherche choisie, son icône et son
 * effet ; tant qu'elle attend, son coût déposé objet par objet, comme le
 * relevé d'un chantier (livré / demandé, en route, en ville) ; une fois
 * payée, la barre verte de la nurserie et son « m:ss », sans autre texte.
 * Dessous, la file du labo, puis trois onglets (`panelTabs.ts`, comme
 * Bâtiment / Inventaire) : **Bâtiments** — ce qui entre au menu de
 * construction, ce qui tourne mieux —, **Ouvriers** — tous les habitants de
 * la ville —, **Personnage** — Adam. Chaque onglet est une liste qui défile :
 * par recherche, son icône, son nom, son effet chiffré (« Dégâts de l'arc :
 * 1 → 1,5 ») ou les bâtiments qu'elle fait entrer au menu, vignette et nom,
 * son coût en icônes — rouge ce qui manque, sac et ville comptés ensemble —,
 * sa durée, et son état : terminée, en cours, en file, verrouillée (le
 * cadenas et le prérequis qui manque, nommé), ou « Lancer ».
 *
 * Comme toute l'interface, il ne modifie rien : « Lancer », « Transférer »,
 * « Abandonner », « Retirer » et « Prendre le reste » poussent une commande
 * (`startResearch`, `transferToLab`, `cancelResearch`, `dequeueResearch`,
 * `takeFromBuilding`) que le tick consomme. Il lit le monde à chaque frame ;
 * une liste n'est reconstruite que si ce qu'elle affiche a changé.
 */

import type { BuildingId } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { PRODUCTION } from '../data/production.ts';
import { RESEARCH, RESEARCH_IDS, RESEARCH_THEMES, type ResearchId, type ResearchTheme } from '../data/research.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import { labNeeds, queueFull, researchBuildings, researchCost, researchStatus, type ResearchStatus } from '../sim/research.ts';
import type { Lab } from '../sim/types.ts';
import { timerText, type World } from '../sim/world.ts';
import { buildingIcon, itemAmount, itemIcon, uiIcon } from './icons.ts';
import { PanelTabs } from './panelTabs.ts';
import { siteNeedRow } from './siteNeedRow.ts';
import { clock, effectLine, statusLine } from './researchText.ts';

const THEMES = Object.keys(RESEARCH_THEMES) as ResearchTheme[];

/** L'ordre d'une liste : ce que mène un labo, ce qui se lance, ce qui est verrouillé, ce qui est fini. Stable : les données gardent leur ordre. */
const STATUS_ORDER: Record<ResearchStatus, number> = { running: 0, collecting: 0, queued: 1, available: 2, taken: 3, locked: 4, done: 5 };

/** Le pictogramme de chaque onglet. */
const TAB_ICONS: Record<ResearchTheme, () => HTMLElement> = {
  building: () => uiIcon('hammer', 22),
  workers: () => uiIcon('worker', 22),
  character: () => uiIcon('bag', 22),
};

export class ResearchPanel {
  public readonly root: HTMLElement;

  private readonly current: HTMLElement;
  private readonly currentIcon: HTMLElement;
  private readonly currentTitle: HTMLElement;
  private readonly currentEffect: HTMLElement;
  private readonly currentStatus: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly timerFill: HTMLElement;
  private readonly timerValue: HTMLElement;
  private readonly currentCost: HTMLElement;
  private readonly transferButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly takeButton: HTMLButtonElement;
  private readonly queue: HTMLElement;
  private readonly tabs: PanelTabs<ResearchTheme>;
  private readonly lists = new Map<ResearchTheme, HTMLElement>();
  private labId: number | null = null;
  private lastHead = '';
  private lastCurrent = '';
  private lastQueue = '';
  private lastList = '';

  private readonly world: World;

  public constructor(world: World) {
    this.world = world;

    this.root = element('div', 'research');

    this.current = element('div', 'research-current');

    const head = element('div', 'research-current-head');

    this.currentIcon = element('span', 'research-current-icon');
    const titles = element('div', 'research-current-titles');

    this.currentTitle = element('h3', 'research-current-title');
    this.currentEffect = element('p', 'research-effect');
    titles.append(this.currentTitle, this.currentEffect);
    head.append(this.currentIcon, titles);

    this.currentStatus = element('p', 'research-status');
    this.bar = element('div', 'building-panel-bar');
    this.barFill = element('div', '');
    this.bar.append(this.barFill);

    // Le compte à rebours : la barre verte de la nurserie et son « m:ss », rien d'autre.
    this.timer = element('div', 'building-panel-meter building-panel-production research-timer');
    const timerBar = element('div', 'building-panel-bar');

    timerBar.dataset['kind'] = 'research';
    this.timerFill = element('div', '');
    timerBar.append(this.timerFill);
    this.timerValue = element('span', 'building-panel-meter-value');
    this.timer.append(timerBar, this.timerValue);
    this.timer.setAttribute('role', 'img');

    this.currentCost = element('div', 'research-cost');

    const actions = element('div', 'building-panel-actions');

    this.transferButton = button(() => this.push('transferToLab'));
    this.cancelButton = button(() => this.push('cancelResearch'));
    this.takeButton = button(() => this.push('takeFromBuilding'));
    actions.append(this.transferButton, this.cancelButton, this.takeButton);
    this.current.append(head, this.currentStatus, this.bar, this.timer, this.currentCost, actions);

    this.queue = element('div', 'research-queue');
    this.queue.hidden = true;

    this.tabs = new PanelTabs<ResearchTheme>(THEMES.map((id) => ({ id, icon: TAB_ICONS[id]() })) as [
      { id: ResearchTheme; icon: HTMLElement },
      ...{ id: ResearchTheme; icon: HTMLElement }[],
    ]);
    this.tabs.bar.classList.add('research-tabs');
    for (const theme of THEMES) {
      const list = element('div', 'research-list');

      list.dataset['theme'] = theme;
      this.tabs.page(theme).append(list);
      this.lists.set(theme, list);
    }

    this.root.append(this.current, this.queue, this.tabs.bar, this.tabs.pages);

    // Les boutons suivent la langue ; les listes se réécrivent au prochain `update()`, dont la clé porte la langue.
    onLocale(() => {
      const text = t().researchPanel;

      this.transferButton.textContent = text.transfer;
      this.cancelButton.textContent = text.abandon;
      this.takeButton.textContent = text.takeRest;
      this.tabs.bar.setAttribute('aria-label', text.tabsLabel);
      for (const theme of THEMES) this.tabs.setLabel(theme, t().researchThemes[theme]);
    });
  }

  /** À chaque frame, fenêtre du labo ouverte. */
  public update(lab: Lab): void {
    if (lab.id !== this.labId) {
      this.labId = lab.id;
      this.lastHead = '';
      this.lastCurrent = '';
      this.lastQueue = '';
      this.lastList = '';
      // Un autre labo : on ouvre l'onglet de ce qu'il cherche, sinon les bâtiments.
      this.tabs.select(lab.research === null ? 'building' : RESEARCH[lab.research].theme);
    }
    this.updateCurrent(lab);
    this.updateQueue(lab);
    this.updateList(lab);
  }

  private push(type: 'transferToLab' | 'cancelResearch' | 'takeFromBuilding'): void {
    if (this.labId === null) return;
    if (type === 'cancelResearch') this.world.push({ type, lab: this.labId });
    else this.world.push({ type, id: this.labId });
  }

  /** La recherche choisie : son coût tant qu'il manque quelque chose, son compte à rebours ensuite. */
  private updateCurrent(lab: Lab): void {
    const { world } = this;
    const surplus = world.takeable(lab).length > 0;
    const inReach = world.inReach(lab);

    this.takeButton.hidden = !surplus;
    this.takeButton.disabled = !inReach || world.player.inventory.freeSpace() <= 0;
    this.setHead(lab);

    if (lab.research === null) {
      this.current.dataset['state'] = 'idle';
      this.setText(this.currentStatus, t().researchPanel.noneHint);
      this.currentStatus.hidden = false;
      this.bar.hidden = true;
      this.timer.hidden = true;
      this.transferButton.hidden = true;
      this.cancelButton.hidden = true;
      this.setCost([], 'idle');
      return;
    }

    const research = RESEARCH[lab.research];

    if (lab.endTick > 0) {
      const left = Math.max(0, lab.endTick - world.tickCount);
      const time = timerText(left);

      this.current.dataset['state'] = 'running';
      this.currentStatus.hidden = true;
      this.bar.hidden = true;
      this.timer.hidden = false;
      this.timerFill.style.width = `${Math.round((1 - left / research.duration) * 100)}%`;
      if (this.timerValue.textContent !== time) {
        this.timerValue.textContent = time;
        this.timer.setAttribute('aria-label', t().researchPanel.remaining(time));
      }
      this.transferButton.hidden = true;
      // Abandonner une recherche qui tourne rend son coût au coffre.
      this.cancelButton.hidden = false;
      this.setCost([], 'running');
      return;
    }

    // Le coût se dépose : ce qui est au coffre, sur ce qu'il faut.
    const cost = researchCost(lab.research);
    const total = cost.reduce((sum, [, amount]) => sum + amount, 0);
    const missing = cost.reduce((sum, [item]) => sum + labNeeds(lab, item), 0);
    const fromTown = world.labInTownRange(lab);
    const text = t().researchPanel;

    this.current.dataset['state'] = 'collecting';
    this.currentStatus.hidden = false;
    this.setText(this.currentStatus, !inReach ? text.approach : fromTown ? text.transferBoth : text.transferBag);
    this.timer.hidden = true;
    this.bar.hidden = false;
    this.bar.dataset['kind'] = 'progress';
    this.barFill.style.width = `${Math.round((1 - missing / total) * 100)}%`;
    this.transferButton.hidden = false;
    this.transferButton.disabled = !inReach || !world.canTransferToLab(lab);
    this.cancelButton.hidden = false;

    // Objet par objet, comme la fenêtre d'un chantier : livré / demandé, en route, en ville.
    const ledger = world.labLedger(lab);

    this.setCost(ledger.map(siteNeedRow), `collecting:${lab.research}:${JSON.stringify(ledger)}`);
  }

  /** L'icône, le nom et l'effet de ce que mène le labo ; réécrits quand la recherche ou la langue change. */
  private setHead(lab: Lab): void {
    const { world } = this;
    const key = `${locale()}|${lab.research ?? ''}|${world.researchDone.length}|${world.perks.join(',')}`;

    if (key === this.lastHead) return;
    this.lastHead = key;

    if (lab.research === null) {
      this.currentIcon.replaceChildren(uiIcon('hint', 40));
      this.currentTitle.textContent = t().researchPanel.noneTitle;
      this.currentEffect.replaceChildren();
      this.currentEffect.hidden = true;
      return;
    }
    this.currentIcon.replaceChildren(researchIcon(lab.research, 40));
    this.currentTitle.textContent = t().research[lab.research].label;
    this.currentEffect.replaceChildren(...this.effect(lab.research));
    this.currentEffect.hidden = false;
  }

  /** La file du labo : chaque recherche en attente, et de quoi la retirer. Reconstruite seulement si elle change. */
  private updateQueue(lab: Lab): void {
    const key = `${locale()}|${lab.queue.join(',')}`;

    this.queue.hidden = lab.queue.length === 0;
    if (key === this.lastQueue) return;
    this.lastQueue = key;

    const title = element('h3', 'research-group-title');

    title.textContent = t().researchPanel.queueTitle(lab.queue.length, PRODUCTION.queueSize);
    this.queue.replaceChildren(
      title,
      ...lab.queue.map((id) => {
        const row = element('article', 'research-row');
        const head = element('div', 'research-row-head');
        const name = element('h4', 'research-name');
        const remove = element('button', 'inventory-action research-launch') as HTMLButtonElement;

        row.dataset['status'] = 'queued';
        name.textContent = t().research[id].label;
        remove.type = 'button';
        remove.textContent = t().researchPanel.dequeue;
        remove.addEventListener('click', () => this.world.push({ type: 'dequeueResearch', lab: lab.id, research: id }));
        head.append(researchIcon(id, 32), name, remove);
        row.append(head);
        return row;
      }),
    );
  }

  private setCost(children: HTMLElement[], key: string): void {
    if (key === this.lastCurrent) return;
    this.lastCurrent = key;
    this.currentCost.replaceChildren(...children);
    this.currentCost.hidden = children.length === 0;
    this.currentCost.dataset['layout'] = key.startsWith('collecting:') ? 'ledger' : '';
  }

  /** Les trois onglets. Reconstruits seulement quand un état, un coût ou un stock change. */
  private updateList(lab: Lab): void {
    const { world } = this;
    const { researchDone: done } = world;
    const statuses = RESEARCH_IDS.map((id): [ResearchId, ResearchStatus] => [id, researchStatus(id, done, lab, world.labs())]);
    const key = [
      locale(),
      statuses.map(([, status]) => status).join(','),
      lab.endTick > 0,
      queueFull(lab),
      world.perks.join(','),
      ...this.relevantItems().map((item) => `${item}=${this.owned(item)}`),
    ].join('|');

    if (key === this.lastList) return;
    this.lastList = key;

    for (const theme of THEMES) {
      // Ce qui se mène d'abord, puis ce qui attend un prérequis, les recherches finies au bout : le pouce n'a pas à les traverser.
      const rows = statuses
        .filter(([id]) => RESEARCH[id].theme === theme)
        .sort(([, a], [, b]) => STATUS_ORDER[a] - STATUS_ORDER[b])
        .map(([id, status]) => this.row(id, status, lab));

      this.lists.get(theme)!.replaceChildren(...rows);
    }
  }

  /** Une recherche : icône, nom, effet chiffré, coût et durée, état, et « Lancer » si on peut. */
  private row(id: ResearchId, status: ResearchStatus, lab: Lab): HTMLElement {
    const { world } = this;
    const text = t().researchPanel;
    const row = element('article', 'research-row');
    const head = element('div', 'research-row-head');
    const name = element('h4', 'research-name');
    const effect = element('p', 'research-effect');

    row.dataset['status'] = status;
    name.textContent = t().research[id].label;
    effect.append(...this.effect(id));
    head.append(researchIcon(id, 40), name);

    if (status !== 'available') {
      const badge = element('span', 'research-badge');

      if (status === 'locked') badge.append(uiIcon('lock', 18));
      badge.append(status === 'running' ? text.running : status === 'locked' ? text.locked : statusLine(id, status, world.researchDone));
      head.append(badge);
    }
    row.append(head, effect);

    // Le coût et la durée, tant que la recherche reste à mener : sac et ville comptés ensemble, le manque en rouge.
    if (status === 'available' || status === 'locked') {
      const meta = element('div', 'research-cost');
      const duration = element('span', 'research-duration');

      duration.textContent = text.duration(clock(RESEARCH[id].duration));
      meta.append(...researchCost(id).map(([item, amount]) => itemAmount(item, amount, Math.min(amount, this.owned(item)))), duration);
      row.append(meta);
    }

    // Verrouillée : ce qu'il faut d'abord, nommé.
    if (status === 'locked') {
      const requires = element('p', 'research-status');

      requires.textContent = statusLine(id, status, world.researchDone);
      row.append(requires);
    }

    if (status === 'available') {
      const launch = element('button', 'inventory-action research-launch') as HTMLButtonElement;

      launch.type = 'button';
      launch.dataset['tone'] = 'deposit';
      // Une recherche tourne déjà : celle-ci se met en file, tant qu'il y a de la place.
      launch.textContent = lab.endTick > 0 ? text.enqueue : text.launch;
      launch.disabled = lab.endTick > 0 && queueFull(lab);
      launch.addEventListener('click', () => world.push({ type: 'startResearch', lab: lab.id, research: id }));
      row.append(launch);
    }
    return row;
  }

  /** Ce que la recherche change : son effet chiffré, ou « Débloque : » et chaque bâtiment, vignette et nom. */
  private effect(id: ResearchId): (HTMLElement | string)[] {
    const buildings: readonly BuildingId[] = researchBuildings(id);

    if (buildings.length === 0) return [effectLine(id, this.world.researchDone, this.world.perks)];
    return [
      t().researchPanel.unlocks,
      ...buildings.map((building) => {
        const chip = element('span', 'research-unlock');

        chip.append(buildingIcon(building, 28), t().buildings[building].label);
        return chip;
      }),
    ];
  }

  /** Ce que la colonie possède d'un objet, à la portée d'Adam : son sac et le stock de la ville. */
  private owned(item: ItemId): number {
    return this.world.player.inventory.count(item) + (this.world.townStock()?.available(item) ?? 0);
  }

  /** Les objets qui entrent dans un coût de recherche : ceux dont le compte change la liste. */
  private relevantItems(): ItemId[] {
    return [...new Set(RESEARCH_IDS.flatMap((id) => researchCost(id).map(([item]) => item)))];
  }

  private setText(target: HTMLElement, text: string): void {
    if (target.textContent !== text) target.textContent = text;
  }
}

/** L'icône d'une recherche (`RESEARCH[id].icon`), dans une pastille ronde : décorative, son nom est écrit à côté. */
function researchIcon(id: ResearchId, size: number): HTMLElement {
  const { icon } = RESEARCH[id];
  const holder = element('span', 'research-icon');
  const image = 'item' in icon ? itemIcon(icon.item, size - 8) : 'building' in icon ? buildingIcon(icon.building, size) : uiIcon(icon.ui, size - 8);

  image.alt = '';
  image.removeAttribute('title');
  image.setAttribute('aria-hidden', 'true');
  holder.dataset['kind'] = 'item' in icon ? 'item' : 'building' in icon ? 'building' : 'ui';
  holder.append(image);
  return holder;
}

function element(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);

  if (className) node.className = className;
  return node;
}

/** Un bouton : son libellé s'écrit dans `onLocale`. */
function button(onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');

  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
