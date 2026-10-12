/**
 * Placement au tap, en deux temps.
 *
 * Règle d'UX du projet : **jamais de construction au premier tap.** Sur un
 * téléphone, le doigt masque la case qu'il vise et la précision est de l'ordre
 * de la tuile. Un tap qui construit directement, c'est une foreuse posée de
 * travers une fois sur trois, sans moyen d'annuler.
 *
 * D'où trois états :
 * - `idle`    aucun bâtiment sélectionné ;
 * - `armed`   un bâtiment est choisi dans le menu, on attend un tap sur la carte ;
 * - `placing` le fantôme est posé, le doigt peut le déplacer au drag, et un
 *             bouton de confirmation valide.
 *
 * Poser ramène à `idle` : Adam doit pouvoir marcher tout de suite, une
 * attaque n'attend pas qu'on ait trouvé « Annuler ». Pour enchaîner trois
 * foreuses, « Poser encore » valide et reste armé.
 *
 * Un **tap** fait sauter le fantôme là où le doigt s'est levé ; un **glissé**
 * le promène sous le doigt. Le joystick n'a pas à se battre avec lui : il
 * vit dans le DOM, au-dessus du canvas, et garde ses doigts — on déplace
 * donc Adam au pouce pendant qu'on vise de l'autre main.
 *
 * **À la souris** (mode PC, décidé par `pointerType`, jamais par la taille
 * d'écran), le premier tap n'a plus de raison d'être : le curseur ne cache
 * rien et vise au pixel. Le fantôme suit donc le survol, calé sur la grille
 * et sans décalage de doigt ; un clic gauche pose s'il est posable (sinon
 * `onRefuse`, et rien n'est posé), un clic droit annule. Le tactile ne passe
 * par aucune de ces branches.
 *
 * Rien n'est modifié dans le monde ici : la validation pousse une commande
 * `placeBuilding` que le tick consomme.
 */

import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import type { PlacementBlock, World } from '../sim/world.ts';
import { TAP_SLOP, type PointerConsumer, type PointerSample } from './pointer.ts';

export interface GhostState {
  building: BuildingId;
  /** Tuile d'origine (coin haut-gauche de l'emprise). */
  tx: number;
  ty: number;
  /** Le fantôme suit un curseur de souris : le rendu le fait respirer. */
  follow: boolean;
}

export type PlacementMode = 'idle' | 'armed' | 'placing';

/**
 * Décalage vertical du fantôme au-dessus du doigt, en pixels CSS.
 * Sans lui le pouce cache exactement ce qu'on essaie de viser.
 */
const FINGER_OFFSET_Y = 44;

export class Placement implements PointerConsumer {
  public mode: PlacementMode = 'idle';
  public ghost: GhostState | null = null;

  /** Bâtiment choisi dans le menu ; conservé après une pose seulement par « Poser encore ». */
  private armed: BuildingId | null = null;
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  /** Le doigt a dépassé `TAP_SLOP` : ce n'est plus un tap. */
  private dragging = false;

  private readonly world: World;
  private readonly screenToWorld: (x: number, y: number) => { x: number; y: number };
  private readonly onChange: () => void;
  private readonly onRefuse: () => void;

  /** `onRefuse` : un clic de souris sur un emplacement refusé — un son, une secousse, rien de posé. */
  public constructor(
    world: World,
    screenToWorld: (x: number, y: number) => { x: number; y: number },
    onChange: () => void,
    onRefuse: () => void = () => {},
  ) {
    this.world = world;
    this.screenToWorld = screenToWorld;
    this.onChange = onChange;
    this.onRefuse = onRefuse;
  }

  /** Le curseur survole la carte sans bouton enfoncé : le fantôme le suit. */
  public hover(sample: PointerSample): void {
    if (this.mode === 'idle' || this.pointerId !== null || !sample.mouse) return;
    this.moveGhost(sample);
  }

  /** Le menu de construction a choisi un bâtiment. Un second appui désarme. */
  public select(building: BuildingId): void {
    if (this.armed === building) {
      this.cancel();
      return;
    }
    this.armed = building;
    this.mode = 'armed';
    this.ghost = null;
    this.onChange();
  }

  /** Bâtiment actuellement armé, ou `null`. Le menu s'en sert pour s'allumer. */
  public armedBuilding(): BuildingId | null {
    return this.armed;
  }

  public cancel(): void {
    this.mode = 'idle';
    this.armed = null;
    this.ghost = null;
    this.pointerId = null;
    this.onChange();
  }

  /**
   * Le bouton de confirmation. Seul chemin vers une construction réelle.
   * `again` : « Poser encore », on reste armé sur le même bâtiment.
   */
  public confirm(again = false): void {
    if (this.mode !== 'placing' || !this.ghost) return;

    this.world.push({
      type: 'placeBuilding',
      building: this.ghost.building,
      tx: this.ghost.tx,
      ty: this.ghost.ty,
    });

    if (!again) {
      this.cancel();
      return;
    }
    this.mode = 'armed';
    this.ghost = null;
    this.onChange();
  }

  /** Le fantôme est-il posable là où il est ? Sert à griser le bouton. */
  public isConfirmable(): boolean {
    return this.mode === 'placing' && this.ghost !== null && this.block() === null;
  }

  /** Pourquoi le fantôme n'est pas posable, et quelles cases bloquent ; `null` s'il l'est ou s'il n'y a pas de fantôme. */
  public block(): PlacementBlock | null {
    const ghost = this.ghost;

    if (this.mode !== 'placing' || !ghost) return null;
    return this.world.placementBlock(ghost.building, ghost.tx, ghost.ty);
  }

  public onDown(sample: PointerSample): boolean {
    if (this.mode === 'idle' || this.pointerId !== null) return false;

    // Clic droit, ou tout autre bouton que le gauche : jamais une pose.
    if (sample.mouse && sample.button !== undefined && sample.button !== 0) {
      if (sample.button === 2) this.cancel();
      return true;
    }

    this.pointerId = sample.id;
    this.startX = sample.x;
    this.startY = sample.y;
    this.dragging = false;
    return true;
  }

  public onMove(sample: PointerSample): void {
    if (sample.id !== this.pointerId) return;

    if (!this.dragging) {
      if (Math.hypot(sample.x - this.startX, sample.y - this.startY) <= TAP_SLOP) return;
      this.dragging = true;
    }
    this.moveGhost(sample);
  }

  public onUp(sample: PointerSample): void {
    if (sample.id !== this.pointerId) return;
    this.pointerId = null;
    if (this.dragging) return;
    // Un tap pose le fantôme là où le doigt s'est levé.
    this.moveGhost(sample);
    // Un clic, lui, construit : le fantôme était déjà sous le curseur.
    if (!sample.mouse) return;
    if (this.isConfirmable()) this.confirm();
    else this.onRefuse();
  }

  private moveGhost(sample: PointerSample): void {
    const building = this.armed;

    if (!building) return;

    const proto = BUILDINGS[building];
    const follow = sample.mouse === true;
    // Le curseur ne cache rien : il vise là où il est.
    const world = this.screenToWorld(sample.x, sample.y - (follow ? 0 : FINGER_OFFSET_Y));
    // Le doigt (ou le curseur) vise le centre de l'emprise, pas son coin.
    const tx = Math.round(world.x / TILE_SIZE - proto.width / 2);
    const ty = Math.round(world.y / TILE_SIZE - proto.height / 2);

    if (this.ghost && this.ghost.tx === tx && this.ghost.ty === ty && this.ghost.follow === follow) return;

    this.ghost = { building, tx, ty, follow };
    this.mode = 'placing';
    this.onChange();
  }
}
