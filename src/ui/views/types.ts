/**
 * Ce qu'une vue de la fenêtre d'un bâtiment reçoit, et ce qu'elle rend.
 *
 * La fenêtre (`buildingPanel.ts`) écrit le tronc commun — titre, vignette,
 * phrase d'ambiance, compte à rebours, puces, lignes, jauge — et demande le
 * reste à la vue de la sorte (`views/index.ts`, une par `entity.kind`) : ce
 * que la sorte dit d'elle, ses boutons, son coffre. La vue ne connaît pas la
 * fenêtre : elle passe par `PanelHost`, les éléments et les gestes que la
 * fenêtre lui prête. Comme la fenêtre, elle ne modifie rien du monde — ses
 * boutons poussent des commandes, branchés par la fenêtre.
 */

import type { BuildingLevel } from '../../data/buildings.ts';
import type { ItemId } from '../../data/items.ts';
import type { UiIcon } from '../../art/ui.ts';
import type { Messages } from '../../i18n/messages.ts';
import type { Building, Entity } from '../../sim/types.ts';
import type { World } from '../../sim/world.ts';
import type { BarracksPanel } from '../barracksPanel.ts';
import type { ResearchPanel } from '../researchPanel.ts';
import type { ToolForge } from '../toolForge.ts';
import type { TransferPanel } from '../transferPanel.ts';

/** Une puce : un pictogramme — ou l'icône d'un objet —, un nombre, et ce qu'il compte. */
export interface Stat {
  icon: UiIcon;
  item?: ItemId;
  value: string;
  label: string;
  /** Un mot sous le nombre, quand la fenêtre est assez large pour le montrer. */
  caption?: string;
}

/** La jauge d'une ligne : sa part remplie, sa couleur, et le nombre à côté (vide : pas de cœur). */
export interface Meter {
  ratio: number;
  barClass: string;
  value: string;
  label: string;
}

/** Les textes de la fenêtre, dans la langue en cours. */
export type PanelText = Messages['panel'];

/** Une entité d'une sorte donnée. */
export type EntityOf<K extends Entity['kind']> = Extract<Entity, { kind: K }>;

/**
 * Ce que la fenêtre prête à une vue : les éléments qu'elle remplit et les
 * gestes qui tiennent les caches de la fenêtre (objets, ouvriers, niveaux).
 */
export interface PanelHost {
  /** La liste des objets ; `dataset.layout` dit sa mise en page (`ledger` : relevé d'un chantier). */
  readonly items: HTMLElement;
  /** Le pictogramme du coffre et son compte, au-dessus de ce qu'il contient. */
  readonly stock: HTMLElement;
  readonly stockCount: HTMLElement;
  readonly buttons: {
    readonly transfer: HTMLButtonElement;
    readonly repair: HTMLButtonElement;
    readonly pause: HTMLButtonElement;
    readonly cancel: HTMLButtonElement;
    readonly era: HTMLButtonElement;
  };
  readonly crew: HTMLElement;
  readonly upgrade: HTMLElement;
  readonly gear: HTMLElement;
  readonly tools: ToolForge;
  readonly exchange: TransferPanel;
  readonly research: ResearchPanel;
  readonly barracks: BarracksPanel;
  /** « Annuler le chantier » a reçu son premier tap : le second annule. */
  cancelArmed(): boolean;
  /** Les lignes d'objets, reconstruites seulement si leur clé change. */
  setItems(children: HTMLElement[], key: string): void;
  /** L'onglet « Inventaire » : là s'il y a un coffre où échanger. */
  setInventory(available: boolean): void;
  /** Le (i) caché, la phrase d'ambiance repliée : un panneau à soi prend toute la place. */
  hideInfo(): void;
  refreshCrew(building: Building): void;
  refreshUpgrade(building: Building, inReach: boolean): void;
  refreshGear(building: Building, inReach: boolean): void;
}

/** Ce qu'une vue reçoit à chaque frame. Elle remplit `stats` et `lines`, dans l'ordre de la fenêtre. */
export interface ViewContext<E extends Entity> {
  readonly world: World;
  readonly entity: E;
  /** Adam assez près pour agir dessus. */
  readonly inReach: boolean;
  readonly text: PanelText;
  readonly stats: Stat[];
  readonly lines: string[];
  readonly host: PanelHost;
}

/** Ce que sait en plus la vue d'un bâtiment debout. */
export interface BuildingContext<E extends Building> extends ViewContext<E> {
  readonly level: BuildingLevel;
  /** Le problème que la bulle d'alerte montre sur la carte : entrepôt plein. */
  readonly full: boolean;
  /** En pause, ou sans un seul ouvrier à son poste. */
  readonly stopped: boolean;
}

/**
 * Le compte à rebours sous la jauge : `plain`, la barre seule ; `birth`, le
 * bébé devant elle (la nurserie fait naître) ; `none`, jamais — le labo a la
 * sienne dans le panneau Recherche, une seule par fiche.
 */
export type TimerStyle = 'plain' | 'birth' | 'none';

/** La vue d'une sorte : ce qui, dans la fenêtre, n'est qu'à elle. */
export interface EntityView<E extends Entity> {
  readonly timer: TimerStyle;
  /** Remplit puces, lignes et éléments de la sorte ; rend la jauge. */
  render(context: ViewContext<E>): Meter;
}
