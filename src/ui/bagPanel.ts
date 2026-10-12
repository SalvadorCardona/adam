/**
 * La fenêtre du sac : l'inventaire d'Adam et sa garde-robe, en deux onglets.
 *
 * Le sac du HUD l'ouvre (tap, ou touche I sur PC), toujours sur
 * « Inventaire » (`inventoryTab.ts`) ; « Habillement » (`wardrobeTab.ts`)
 * est l'éditeur de personnage, qu'ouvre aussi le « Essayer » du toast d'une
 * trouvaille. On passe de l'un à l'autre sans fermer la fenêtre. Une pièce
 * trouvée pose une pastille sur le sac et sur l'onglet « Habillement ».
 *
 * Plein écran sur un voile, comme les réglages. L'inventaire laisse le jeu
 * tourner — un dépôt est une commande que le tick consomme —, l'habillement
 * arrête l'horloge (`dressing`, lu par `main.ts`). La croix, Échap ou un tap
 * sur le voile ferment la fenêtre, et jettent le brouillon de l'habillement.
 */

import { adamFace } from '../art/adamLook.ts';
import type { LookSlot } from '../data/wardrobe.ts';
import { onLocale, t } from '../i18n/locale.ts';
import type { FlowAlert } from '../sim/flows.ts';
import type { World } from '../sim/world.ts';
import { uiIcon } from './icons.ts';
import { InventoryTab } from './inventoryTab.ts';
import { WardrobeTab } from './wardrobeTab.ts';

export type BagTab = 'inventory' | 'wardrobe';

const TABS: readonly BagTab[] = ['inventory', 'wardrobe'];

export interface BagActions {
  /** Ouverte ou fermée : le son de fenêtre joue, les autres fenêtres se ferment. */
  onToggle(open: boolean): void;
  /** Une alerte de la ville tapée : la fenêtre s'est fermée, un repère montre le bâtiment en cause. */
  onAlert(alert: FlowAlert): void;
}

export class BagPanel {
  public readonly root: HTMLElement;

  private readonly world: World;
  private readonly actions: BagActions;
  /** Le sac du HUD : il ouvre la fenêtre et porte la pastille d'une pièce trouvée. */
  private readonly button: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tabs = new Map<BagTab, HTMLButtonElement>();
  private readonly face: HTMLImageElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly inventory: InventoryTab;
  private readonly wardrobe: WardrobeTab;
  private tab: BagTab = 'inventory';

  public constructor(world: World, button: HTMLElement, actions: BagActions) {
    this.world = world;
    this.button = button;
    this.actions = actions;
    this.button.setAttribute('aria-haspopup', 'dialog');

    this.root = document.createElement('div');
    this.root.className = 'overlay wardrobe-screen bag-screen';
    this.root.hidden = true;
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });

    this.panel = document.createElement('div');
    this.panel.className = 'panel overlay-panel wardrobe-panel bag-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');

    this.inventory = new InventoryTab(world, (alert) => {
      this.close();
      this.actions.onAlert(alert);
    });
    this.wardrobe = new WardrobeTab(world, {
      done: () => this.close(),
      badge: (fresh) => this.renderBadge(fresh),
    });

    // La tête : les deux onglets en capsules, puis la croix.
    const head = document.createElement('div');

    head.className = 'settings-head wardrobe-head bag-head';

    const tablist = document.createElement('div');

    tablist.className = 'bag-tabs';
    tablist.setAttribute('role', 'tablist');
    this.face = document.createElement('img');
    this.face.className = 'bag-tab-face';
    this.face.alt = '';
    this.face.setAttribute('aria-hidden', 'true');
    for (const tab of TABS) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'bag-tab';
      button.id = `bag-tab-${tab}-button`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `bag-tab-${tab}`);
      button.addEventListener('click', () => this.select(tab));
      this.tabs.set(tab, button);
      tablist.append(button);
    }

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'building-panel-close';
    this.closeButton.append(uiIcon('close'));
    this.closeButton.addEventListener('click', () => this.close());
    head.append(tablist, this.closeButton);

    this.panel.append(head, this.inventory.root, this.wardrobe.root);
    this.root.append(this.panel);

    world.events.on('lookChanged', () => this.renderFace());

    onLocale(() => {
      const text = t();

      this.panel.setAttribute('aria-label', text.inventory.title);
      this.closeButton.setAttribute('aria-label', text.common.close);
      for (const [tab, button] of this.tabs) {
        const label = document.createElement('span');

        label.textContent = text.inventory.tabs[tab];
        button.replaceChildren(tab === 'inventory' ? uiIcon('bag', 24) : this.face, label);
      }
    });
    this.renderFace();
    this.renderBadge(this.wardrobe.fresh);
    this.renderTab();
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  /** L'onglet « Habillement » est à l'écran : l'horloge s'arrête. */
  public get dressing(): boolean {
    return this.open && this.tab === 'wardrobe';
  }

  /** Ouvre la fenêtre sur `tab` — l'inventaire, sinon —, l'habillement sur l'emplacement `slot` s'il est donné. */
  public show(tab: BagTab = 'inventory', slot?: LookSlot): void {
    if (!this.open) {
      this.wardrobe.reset();
      this.root.hidden = false;
      this.actions.onToggle(true);
    }
    this.select(tab, slot);
  }

  public close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.inventory.leave();
    this.wardrobe.closed();
    this.actions.onToggle(false);
  }

  public toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  /** À chaque frame : l'inventaire suit le sac et la ville tant qu'il est à l'écran. */
  public update(): void {
    this.inventory.update();
  }

  private select(tab: BagTab, slot?: LookSlot): void {
    this.tab = tab;
    this.renderTab();
    if (tab === 'inventory') {
      this.wardrobe.leave();
      this.inventory.enter();
    } else {
      this.inventory.leave();
      this.wardrobe.enter(slot);
      this.wardrobe.focus();
    }
  }

  private renderTab(): void {
    for (const [tab, button] of this.tabs) button.setAttribute('aria-selected', String(tab === this.tab));
    this.panel.dataset['tab'] = this.tab;
    this.inventory.root.hidden = this.tab !== 'inventory';
    this.wardrobe.root.hidden = this.tab !== 'wardrobe';
  }

  /** La pastille du sac et de l'onglet « Habillement » : une pièce trouvée attend d'être regardée. */
  private renderBadge(fresh: boolean): void {
    for (const node of [this.button, this.tabs.get('wardrobe')]) {
      if (!node) continue;
      if (fresh) node.dataset['new'] = 'true';
      else delete node.dataset['new'];
    }
  }

  /** Le visage d'Adam sur l'onglet « Habillement », tel qu'il est habillé. */
  private renderFace(): void {
    this.face.src = dataUrl(adamFace(this.world.player.look, 46));
  }
}

function dataUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}
