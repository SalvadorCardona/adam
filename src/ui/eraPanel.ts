/**
 * Les ères : le panneau de progression, et l'écran du passage.
 *
 * Le **panneau** s'ouvre depuis la fenêtre de la mairie (« Ères · Campement »)
 * et ne met pas le jeu en pause. En tête, la frise des quatre ères — celles
 * atteintes pleines, la courante cerclée. Dessous, l'ère suivante : sa devise,
 * une ligne par condition (`sim/eras.ts` : objectifs, habitants, bâtiments,
 * recherches, investissement), cochée en menthe ou chiffrée en corail, puis
 * ce qu'elle apporte — sa ressource, ses bâtiments, son onglet au labo, sa
 * menace — et le bouton du passage, qui pousse `advanceEra`.
 *
 * L'**écran du passage** suit `eraReached` : plein écran, le nom de l'ère,
 * sa devise et le récapitulatif de ce qui vient d'ouvrir ; « En avant ! »
 * rend la main. `main.ts` arrête l'horloge pendant qu'il est là, fait tomber
 * les feuilles et joue la fanfare.
 *
 * Comme toute l'interface, il ne modifie rien : il lit le monde et pousse
 * une commande. La liste n'est reconstruite que si ce qu'elle affiche change.
 */

import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { ERAS, type EraProto } from '../data/eras.ts';
import { REGION_RINGS } from '../data/regions.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import { checkMet, eraChecks, eraNewBuildings, eraResearch, nextEra, type EraCheck } from '../sim/eras.ts';
import type { World } from '../sim/world.ts';
import { buildingIcon, itemIcon, jobIcon, uiIcon } from './icons.ts';

export class EraPanel {
  /** Le panneau de progression : une fenêtre par-dessus le jeu. */
  public readonly root: HTMLElement;
  /** L'écran du passage d'ère. */
  public readonly screen: HTMLElement;

  private readonly world: World;
  private readonly heading: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly screenTitle: HTMLElement;
  private readonly screenEra: HTMLElement;
  private readonly screenMotto: HTMLElement;
  private readonly screenRecap: HTMLElement;
  private readonly onward: HTMLButtonElement;
  private onDone: () => void = () => {};
  private lastKey = '';

  public constructor(world: World) {
    this.world = world;

    this.root = element('div', 'overlay era-overlay');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    // Un tap à côté de la carte la ferme.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.hide();
    });

    const panel = element('section', 'panel era-panel');
    const head = element('header', 'era-head');

    this.heading = element('h2', 'era-title');
    this.closeButton = element('button', 'era-close') as HTMLButtonElement;
    this.closeButton.type = 'button';
    this.closeButton.append(uiIcon('close', 20));
    this.closeButton.addEventListener('click', () => this.hide());
    head.append(uiIcon('town', 28), this.heading, this.closeButton);
    this.body = element('div', 'era-body');
    panel.append(head, this.body);
    this.root.append(panel);

    this.screen = element('div', 'overlay era-screen');
    this.screen.hidden = true;
    this.screen.setAttribute('role', 'alertdialog');

    const screenPanel = element('div', 'panel overlay-panel era-screen-panel');

    this.screenTitle = element('h2', 'overlay-title');
    this.screenEra = element('p', 'era-screen-name');
    this.screenMotto = element('p', 'overlay-text');
    this.screenRecap = element('ul', 'era-recap');
    this.onward = element('button', 'button-primary') as HTMLButtonElement;
    this.onward.type = 'button';
    this.onward.addEventListener('click', () => {
      this.screen.hidden = true;
      this.onDone();
    });
    screenPanel.append(uiIcon('town', 56), this.screenTitle, this.screenEra, this.screenMotto, this.screenRecap, this.onward);
    this.screen.append(screenPanel);

    onLocale(() => {
      const text = t().eraPanel;

      this.heading.textContent = text.title;
      this.closeButton.setAttribute('aria-label', text.close);
      this.screenTitle.textContent = text.reached;
      this.onward.textContent = text.onward;
      this.lastKey = '';
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    this.lastKey = '';
    this.root.hidden = false;
    this.update();
  }

  public hide(): void {
    this.root.hidden = true;
  }

  /** À chaque frame : le panneau ouvert se relit, et ne se redessine que s'il a changé. */
  public update(): void {
    if (this.root.hidden) return;

    const { world } = this;
    const next = nextEra(world.era);
    const checks = next === null ? [] : eraChecks(world, next);
    const key = [locale(), world.era, ...checks.map((check) => `${check.type}:${check.have}`)].join('|');

    if (key === this.lastKey) return;
    this.lastKey = key;

    const parts: HTMLElement[] = [this.timeline()];

    if (next === null) {
      parts.push(text('p', 'era-motto', t().eraPanel.last));
    } else {
      const words = t().eras[next]!;

      parts.push(
        text('h3', 'era-next', t().eraPanel.next(words.label)),
        text('p', 'era-motto', words.motto),
        text('h4', 'era-section', t().eraPanel.conditions),
        this.checklist(checks),
        text('h4', 'era-section', t().eraPanel.brings),
        this.brings(next, false),
        this.advanceRow(next, checks),
      );
    }
    this.body.replaceChildren(...parts);
  }

  /**
   * L'écran du passage : l'ère atteinte et ce qu'elle ouvre. `onDone` rend la
   * main au jeu quand le joueur appuie sur « En avant ! ».
   */
  public showReached(era: number, onDone: () => void): void {
    const words = t().eras[era];

    if (!words) return;
    this.onDone = onDone;
    this.hide();
    this.screenEra.textContent = words.label;
    this.screenMotto.textContent = words.motto;
    this.screenRecap.replaceChildren(...[...this.brings(era, true).children]);
    this.screen.hidden = false;
    this.onward.focus();
  }

  /** La frise : une capsule par ère, pleine si atteinte, cerclée pour l'ère du moment. */
  private timeline(): HTMLElement {
    const row = element('ol', 'era-timeline');

    row.setAttribute('aria-label', t().eraPanel.timeline);
    ERAS.forEach((_, index) => {
      const step = text('li', 'era-step', t().eras[index]!.label);

      step.dataset['state'] = index < this.world.era ? 'done' : index === this.world.era ? 'current' : 'later';
      if (index === this.world.era) step.setAttribute('aria-current', 'step');
      row.append(step);
    });
    return row;
  }

  /** Une ligne par condition : icône, libellé, compte, et menthe ou corail. */
  private checklist(checks: readonly EraCheck[]): HTMLElement {
    const list = element('ul', 'era-checks');
    let invest = false;

    for (const check of checks) {
      // L'investissement se lit à part : il se paie au passage.
      if (check.type === 'invest' && !invest) {
        invest = true;
        list.append(text('li', 'era-invest-title', t().eraPanel.invest));
      }

      const row = element('li', 'era-check');
      const label = element('span', 'era-check-label');
      const count = text('span', 'era-check-count', check.type === 'research' ? '' : `${Math.min(check.have, check.need)}/${check.need}`);

      row.dataset['met'] = String(checkMet(check));
      row.append(checkIcon(check), label, count);
      label.textContent = checkLabel(check);
      list.append(row);
    }
    return list;
  }

  /** Ce que l'ère apporte : sa ressource, ses bâtiments, ses régions à conquérir, son onglet de recherches, sa menace. */
  private brings(era: number, recap: boolean): HTMLElement {
    const proto: EraProto = ERAS[era]!;
    const list = element('ul', recap ? 'era-recap' : 'era-brings');
    const words = t().eraPanel;
    const line = (icon: HTMLElement, label: string): HTMLElement => {
      const row = element('li', 'era-bring');

      row.append(icon, text('span', '', label));
      return row;
    };

    if (proto.resource) list.append(line(itemIcon(proto.resource, 24), words.resource(t().items[proto.resource])));

    const buildings: BuildingId[] = [...new Set<BuildingId>([...proto.opens, ...eraNewBuildings(era)])].filter((id) => BUILDINGS[id].menu);

    if (buildings.length > 0) {
      const row = element('li', 'era-bring era-bring-buildings');
      const chips = element('span', 'era-buildings');

      for (const id of buildings) {
        const chip = element('span', 'research-unlock');

        chip.append(buildingIcon(id, 28), t().buildings[id].label);
        chips.append(chip);
      }
      row.append(jobIcon('builderHouse', 24), text('span', '', words.buildings), chips);
      list.append(row);
    }

    // Les régions de l'anneau que l'ère ouvre : leurs gardiens se montrent.
    const regions = REGION_RINGS.filter((ring) => ring.era === era && era > 0).reduce((sum, ring) => sum + ring.sectors, 0);

    if (regions > 0) list.append(line(uiIcon('map', 24), words.regions(regions)));

    const research = eraResearch(era).length;

    if (research > 0) list.append(line(jobIcon('lab', 24), words.researchTab(t().eras[era]!.label, research)));
    if (Object.keys(proto.threat).length > 0) list.append(line(uiIcon('mutant', 24), t().eras[era]!.threat));
    return list;
  }

  /** Le bouton du passage, et ce qu'il manque encore. */
  private advanceRow(next: number, checks: readonly EraCheck[]): HTMLElement {
    const row = element('div', 'era-advance');
    const missing = checks.filter((check) => !checkMet(check)).length;
    const button = element('button', 'button-primary') as HTMLButtonElement;

    button.type = 'button';
    button.textContent = t().eraPanel.advance(t().eras[next]!.label);
    button.disabled = missing > 0;
    button.addEventListener('click', () => this.world.push({ type: 'advanceEra' }));
    row.append(button, text('p', 'era-advance-note', missing > 0 ? t().eraPanel.missing(missing) : t().eraPanel.ready));
    return row;
  }
}

function checkIcon(check: EraCheck): HTMLElement {
  switch (check.type) {
    case 'objectives':
      return uiIcon('goal', 24);
    case 'population':
      return uiIcon('people', 24);
    case 'building':
      return buildingIcon(check.building, 28);
    case 'research':
      return jobIcon('lab', 24);
    case 'invest':
      return itemIcon(check.item, 24);
  }
}

function checkLabel(check: EraCheck): string {
  const words = t().eraPanel;

  switch (check.type) {
    case 'objectives':
      return words.objectives;
    case 'population':
      return words.population;
    case 'building':
      return t().buildings[check.building].label;
    case 'research':
      return words.research(t().research[check.research].label);
    case 'invest':
      return t().items[check.item];
  }
}

function element(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);

  if (className) node.className = className;
  return node;
}

function text(tag: string, className: string, content: string): HTMLElement {
  const node = element(tag, className);

  node.textContent = content;
  return node;
}
