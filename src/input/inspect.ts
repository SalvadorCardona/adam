/**
 * Inspection au tap : un doigt posé sur un bâtiment, relevé sans bouger,
 * ouvre sa fenêtre.
 *
 * Ce consommateur passe **avant** le placement dans le routeur : il ne
 * revendique le doigt que si, au moment où il se pose, un chantier ou un
 * bâtiment est dessous et qu'aucun placement n'est en cours. Sinon il laisse
 * la main. Un doigt revendiqué qui glisse au-delà de `TAP_SLOP` n'ouvre rien —
 * c'était un mouvement, pas un tap.
 *
 * Le doigt vise ce qu'il **voit** : un bâtiment est dessiné en 3/4, son
 * cadre monte au-dessus de l'emprise (toit, grue, drapeau). La zone tapable
 * est donc ce cadre entier, emprise comprise — pas seulement les tuiles
 * occupées. Tout est en pixels monde : le DPR n'entre jamais en jeu, et le
 * zoom est absorbé par `screenToWorld`.
 *
 * Ève se tape aussi : un doigt sur elle la fait parler (`onTalk`). Elle
 * passe avant les bâtiments — elle se tient devant la mairie, dont le cadre
 * la recouvre. Une créature aussi — un habitant (enfant, ouvrier, bûcheron)
 * ou un ennemi (mutant, bête) : un doigt sur elle ouvre la même fenêtre
 * qu'un bâtiment (`onSelect`, une `Selection` de l'un ou de l'autre). La
 * zone de tap d'un habitant est son corps, un peu élargi, pas son cadre,
 * pour qu'un ouvrier devant une porte n'empêche pas d'ouvrir le bâtiment ;
 * celle d'un ennemi, son cadre plus une marge : il bouge, le doigt suit
 * mal. Un mutant encore dans sa flaque ne se tape pas : on ne le voit pas.
 *
 * Une tombe aussi : un doigt sur sa stèle dit qui repose là (`onGrave`).
 *
 * Une base mutante aussi : un doigt sur son campement ouvre sa fenêtre
 * d'info (`onBase`), comme un bâtiment.
 *
 * Une fenêtre de bâtiment ouverte (`canDismiss`), un tap dans le vide la
 * ferme (`onDismiss`) — et son cadre de sélection avec elle. Fenêtre
 * fermée, le vide n'est pas revendiqué : il reste au joystick et au placement.
 *
 * Aucune commande ici : ouvrir une fenêtre ou faire parler Ève ne modifie
 * pas le monde.
 */

import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { ENEMY_BASE } from '../data/enemyBases.ts';
import { ENEMIES, WILDLIFE } from '../data/enemies.ts';
import { SPRITES } from '../data/sprites.ts';
import { isStanding } from '../sim/enemyBases.ts';
import type { Grave } from '../sim/graves.ts';
import type { EnemyBase, Entity, EntityId, Eve, Mobile, MobileId } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import type { Selection } from '../ui/creatureView.ts';
import { TAP_SLOP, type PointerConsumer, type PointerSample } from './pointer.ts';

/** Marge autour du cadre d'Ève, en pixels monde : elle est petite, le doigt est gros. */
const EVE_TAP_MARGIN = 6;

/** Le corps d'un habitant, autour de ses pieds, en pixels monde : demi-largeur, hauteur au-dessus, marge sous les pieds. */
const PERSON_HALF_W = 12;
const PERSON_TOP = 34;
const KID_TOP = 24;
const PERSON_BELOW = 4;

/** Marge autour du cadre d'un ennemi, en pixels monde : il bouge, le doigt arrive en retard. */
const FOE_TAP_MARGIN = 6;

/** Ce que le doigt vise : un bâtiment ou une créature, une base mutante, Ève, ou le vide (pour fermer la fenêtre ouverte). */
type Target = Selection | { kind: 'enemyBase'; id: number } | { kind: 'grave'; id: number } | { kind: 'eve' } | { kind: 'nothing' };

export class Inspect implements PointerConsumer {
  private pointerId: number | null = null;
  private target: Target | null = null;
  private startX = 0;
  private startY = 0;
  private moved = false;

  private readonly world: World;
  private readonly screenToWorld: (x: number, y: number) => { x: number; y: number };
  private readonly enabled: () => boolean;
  private readonly onSelect: (selection: Selection) => void;
  private readonly onTalk: () => void;
  private readonly canDismiss: () => boolean;
  private readonly onDismiss: () => void;
  private readonly onBase: (id: number) => void;
  private readonly onGrave: (id: number) => void;

  public constructor(
    world: World,
    screenToWorld: (x: number, y: number) => { x: number; y: number },
    enabled: () => boolean,
    onSelect: (selection: Selection) => void,
    onTalk: () => void = () => {},
    canDismiss: () => boolean = () => false,
    onDismiss: () => void = () => {},
    onBase: (id: number) => void = () => {},
    onGrave: (id: number) => void = () => {},
  ) {
    this.world = world;
    this.screenToWorld = screenToWorld;
    this.enabled = enabled;
    this.onSelect = onSelect;
    this.onTalk = onTalk;
    this.canDismiss = canDismiss;
    this.onDismiss = onDismiss;
    this.onBase = onBase;
    this.onGrave = onGrave;
  }

  public onDown(sample: PointerSample): boolean {
    if (this.pointerId !== null || !this.enabled()) return false;

    const target = this.targetAt(sample) ?? (this.canDismiss() ? { kind: 'nothing' } : undefined);

    if (target === undefined) return false;

    this.pointerId = sample.id;
    this.target = target;
    this.startX = sample.x;
    this.startY = sample.y;
    this.moved = false;
    return true;
  }

  public onMove(sample: PointerSample): void {
    if (sample.id !== this.pointerId) return;
    if (Math.hypot(sample.x - this.startX, sample.y - this.startY) > TAP_SLOP) this.moved = true;
  }

  public onUp(sample: PointerSample): void {
    if (sample.id !== this.pointerId) return;

    const target = this.target;

    this.pointerId = null;
    this.target = null;

    if (this.moved || target === null) return;
    switch (target.kind) {
      case 'eve':
        this.onTalk();
        return;
      case 'creature':
        // Un ennemi a pu tomber entre le doigt posé et le doigt levé.
        if (this.world.mobiles.has(target.id)) this.onSelect(target);
        return;
      case 'nothing':
        this.onDismiss();
        return;
      case 'enemyBase':
        this.onBase(target.id);
        return;
      case 'grave':
        this.onGrave(target.id);
        return;
      case 'building':
        // Le bâtiment doit encore exister au relâchement : un mutant a pu le raser entre-temps.
        if (this.world.entities.has(target.id)) this.onSelect(target);
    }
  }

  /** Le curseur survole-t-il quelque chose qui s'ouvre au tap — Ève, une créature, un bâtiment, une base ? */
  public hovers(sample: PointerSample): boolean {
    return this.enabled() && this.targetAt(sample) !== undefined;
  }

  /** Un pinch reprend le doigt : rien ne s'ouvre. */
  public onCancel(id: number): void {
    if (id !== this.pointerId) return;
    this.pointerId = null;
    this.target = null;
  }

  private targetAt(sample: PointerSample): Target | undefined {
    const position = this.screenToWorld(sample.x, sample.y);
    const eve = this.world.eve();

    if (eve && isOnEve(eve, position.x, position.y)) return { kind: 'eve' };

    // Hors de vue, rien ne bouge ni ne se tape : le brouillard cache les créatures qui y passent.
    const creature = creatureAt(this.world.mobiles.values(), position.x, position.y, (x, y) => this.world.sees(x, y));

    if (creature !== undefined) return { kind: 'creature', id: creature };

    const building = buildingAt(this.world.entities.values(), position.x, position.y);

    if (building !== undefined) return { kind: 'building', id: building };

    // Une tombe, vue : son épitaphe. Un bâtiment qui la recouvre passe devant.
    const grave = graveAt(this.world.graves(), position.x, position.y, (x, y) => this.world.sees(x, y));

    if (grave !== undefined) return { kind: 'grave', id: grave };

    // Une base explorée se tape même hors de vue : sa fenêtre dit ce qu'on en sait.
    const base = enemyBaseAt(this.world.knownEnemyBases(), position.x, position.y);

    return base === undefined ? undefined : { kind: 'enemyBase', id: base };
  }
}

/** La stèle d'une tombe : demi-largeur, hauteur au-dessus de ses pieds, marge dessous, en pixels monde. Les pieds sont ceux de `render/graveLayer.ts`. */
const GRAVE_HALF_W = 12;
const GRAVE_TOP = 28;
const GRAVE_BELOW = 4;
const GRAVE_FOOT = 4;

/** La tombe dessinée sous un point monde, la plus basse à l'écran si elles se recouvrent ; `seen` : sa case est-elle vue ? */
export function graveAt(graves: readonly Grave[], x: number, y: number, seen: (x: number, y: number) => boolean = () => true): number | undefined {
  let found: number | undefined;
  let foundY = -Infinity;

  for (const grave of graves) {
    const gx = (grave.tx + 0.5) * TILE_SIZE;
    const gy = (grave.ty + 1) * TILE_SIZE - GRAVE_FOOT;

    if (Math.abs(x - gx) > GRAVE_HALF_W || y < gy - GRAVE_TOP || y > gy + GRAVE_BELOW || gy <= foundY || !seen(gx, gy)) continue;
    found = grave.id;
    foundY = gy;
  }
  return found;
}

/** Hauteur au-dessus du toit où la barre d'un chantier ou d'un labo est dessinée, en pixels monde. */
const BAR_LIFT = 12;

/** Le point monde tombe-t-il sur Ève — son sprite entier, plus une marge ? */
export function isOnEve(eve: Eve, x: number, y: number): boolean {
  const { width, height, anchorX, anchorY } = SPRITES.eve;
  const left = eve.x - width * anchorX - EVE_TAP_MARGIN;
  const top = eve.y - height * anchorY - EVE_TAP_MARGIN;

  return x >= left && x < left + width + EVE_TAP_MARGIN * 2 && y >= top && y < top + height + EVE_TAP_MARGIN * 2;
}

/**
 * La créature dessinée sous un point monde — un enfant, un ouvrier, un
 * bûcheron ou un forestier dehors, un mutant sorti de sa flaque, une bête —, la plus basse
 * à l'écran si elles se recouvrent, comme le tri en profondeur du rendu.
 * `seen` : la case de la créature est-elle vue — le brouillard cache le reste.
 */
export function creatureAt(
  mobiles: Iterable<Mobile>,
  x: number,
  y: number,
  seen: (x: number, y: number) => boolean = () => true,
): MobileId | undefined {
  let found: MobileId | undefined;
  let foundY = -Infinity;

  for (const mobile of mobiles) {
    if (!isUnder(mobile, x, y) || mobile.y <= foundY || !seen(mobile.x, mobile.y)) continue;

    found = mobile.id;
    foundY = mobile.y;
  }
  return found;
}

/** Le point monde tombe-t-il sur cette créature : le corps d'un habitant, le cadre d'un ennemi ? */
function isUnder(mobile: Mobile, x: number, y: number): boolean {
  switch (mobile.kind) {
    case 'kid':
    case 'worker':
    case 'lumberjack':
    case 'forester':
    case 'farmer': {
      if (mobile.kind !== 'kid' && mobile.inside) return false;

      const top = mobile.kind === 'kid' ? KID_TOP : PERSON_TOP;

      return Math.abs(x - mobile.x) <= PERSON_HALF_W && y >= mobile.y - top && y <= mobile.y + PERSON_BELOW;
    }
    case 'mutant':
    case 'beast': {
      if (mobile.kind === 'mutant' && mobile.emerge > 0) return false;

      const proto = mobile.kind === 'mutant' ? ENEMIES[mobile.proto] : WILDLIFE[mobile.proto];
      const scale = 'scale' in proto ? proto.scale : 1;
      const { width, height, anchorX, anchorY } = SPRITES[proto.sprite];
      const left = mobile.x - width * scale * anchorX - FOE_TAP_MARGIN;
      const top = mobile.y - height * scale * anchorY - FOE_TAP_MARGIN;

      return x >= left && x <= left + width * scale + FOE_TAP_MARGIN * 2 && y >= top && y <= top + height * scale + FOE_TAP_MARGIN * 2;
    }
    default:
      return false;
  }
}

/**
 * Le bâtiment dessiné sous un point monde : son emprise, plus la partie du
 * sprite qui dépasse au-dessus (cadre ancré en (0, 1) au pied de l'emprise,
 * cf. `render/entityLayer.ts`).
 *
 * Deux cadres se chevauchent quand le toit d'un bâtiment de devant couvre
 * celui de derrière : le plus bas à l'écran gagne, comme le tri en
 * profondeur du rendu — on ouvre ce qu'on voit par-dessus.
 *
 * Un chantier et un labo portent au-dessus du toit leur barre et la rangée de
 * ce qu'ils attendent (`barTop` de `render/entityLayer.ts`) : c'est ce que l'œil
 * vise, la zone monte de `BAR_LIFT` pour les prendre.
 */
export function buildingAt(entities: Iterable<Entity>, x: number, y: number): EntityId | undefined {
  let found: EntityId | undefined;
  let foundBottom = -Infinity;

  for (const entity of entities) {
    const art = SPRITES[BUILDINGS[entity.proto].sprite];
    const left = entity.tx * TILE_SIZE;
    const right = left + Math.max(entity.width * TILE_SIZE, art.width);
    const bottom = (entity.ty + entity.height) * TILE_SIZE;
    const lift = entity.kind === 'site' || entity.kind === 'lab' ? BAR_LIFT : 0;
    const top = bottom - Math.max(entity.height * TILE_SIZE, art.height) - lift;

    if (x < left || x >= right || y < top || y >= bottom) continue;
    if (bottom <= foundBottom) continue;

    found = entity.id;
    foundBottom = bottom;
  }
  return found;
}

/** La base mutante debout dessinée sous un point monde : son emprise et le campement qui la dépasse. */
export function enemyBaseAt(bases: Iterable<EnemyBase>, x: number, y: number): number | undefined {
  const art = SPRITES[ENEMY_BASE.sprite];

  for (const base of bases) {
    if (!isStanding(base)) continue;

    const left = base.tx * TILE_SIZE;
    const bottom = (base.ty + ENEMY_BASE.height) * TILE_SIZE;

    if (x >= left && x < left + art.width && y >= bottom - art.height && y < bottom) return base.id;
  }
  return undefined;
}
