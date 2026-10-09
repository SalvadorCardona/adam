/**
 * Aperçu fantôme du placement, et grille du mode construction.
 *
 * Dès qu'un bâtiment est armé, la carte passe en **mode construction** : une
 * grille de tuiles se dessine — et seulement là : en jeu, le sol n'a pas de
 * cases —, et l'emprise de chaque bâtiment ou chantier existant est
 * soulignée. Sans elle, un fantôme de 2×2 posé « à peu près là » finit une
 * tuile trop à gauche une fois sur deux ; la grille rend la case lisible, et
 * les emprises disent où on ne pourra pas poser. Elle est en **pointillés
 * discrets** qui s'estompent en cercle autour du fantôme (autour d'Adam tant
 * qu'il n'est pas posé) : la case se lit là où l'on pose, pas sur tout l'écran.
 *
 * Une foreuse armée montre les **filons** autour d'Adam : chaque case de
 * gisement teintée de la famille de son minerai, avec l'icône de ce qu'elle
 * donnerait — y compris sous les rochers, qu'il faut casser avant de poser.
 * Son fantôme dit son **assise** case par case (`World.footing`) : les
 * cases du filon qu'elle prendrait, liserées de la teinte du minerai ; les
 * cases d'herbe voulues, en menthe ; les fautives, en corail — elle se pose
 * à cheval sur le bord, moitié filon, moitié herbe.
 *
 * Le cercle jaune autour de la mairie finie est son rayon logistique : un
 * chantier posé dedans puisera dans le stock de la colonie. L'antenne armée
 * ajoute un disque corail plus petit : sa distance minimale (`hallDistance`),
 * où elle ne se pose pas.
 *
 * Le fantôme dit trois choses en même temps : où le bâtiment ira, s'il est
 * posable, et jusqu'où le joueur peut construire. La couleur vient de
 * `world.placementBlock()` — le même juge que le tick, jamais une seconde
 * règle écrite en parallèle. L'emprise se colore **case par case** : menthe
 * la case bonne, corail la fautive (`PlacementBlock.blocked`) — refusé, le
 * sprite pâlit pour laisser voir l'arbre ou l'eau qu'il recouvrait —, et un
 * contour en pointillés l'entoure. La bulle qui dit pourquoi, en une ligne
 * sous le fantôme, est du DOM (`ui/buildMenu.ts`).
 *
 * À la souris, le fantôme suit le curseur (`GhostState.follow`) : il
 * **respire** — son opacité et son liseré battent doucement — pour qu'on ne
 * le prenne pas pour un bâtiment posé, et il **secoue la tête** quand un clic
 * tombe sur un emplacement refusé (`refuse()`). Deux minuteurs de vue, figés
 * sous `prefers-reduced-motion` ; le fantôme posé au doigt ne bouge pas.
 *
 * La route armée montre son tracé (`updateRoad`) : une case par tuile,
 * menthe si elle sera pavée, blanche si elle l'est déjà, corail si elle est
 * refusée (eau, bâti, arbre, pierre qui manque) — d'après `World.roadPlan`,
 * le juge du tick. Au marteau, les dalles qu'il retirera passent au corail.
 *
 * Le `Graphics` n'est redessiné que lorsque la case ou la validité change :
 * retesseller un rectangle à 120 Hz pour rien serait le genre de gaspillage
 * qu'on paye en batterie.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { TILE_SIZE, worldToTile } from '../core/grid.ts';
import { BUILDINGS, logisticRadiusOf, type BuildingId, type BuildingProto } from '../data/buildings.ts';
import { PALETTE, RADIUS, STROKE, hex } from '../data/artDirection.ts';
import { BUILD_REACH_TILES } from '../sim/player.ts';
import { oreAt } from '../sim/terrain.ts';
import type { Footing } from '../sim/footing.ts';
import type { PlacementBlock, World } from '../sim/world.ts';
import type { GhostState, RoadTool, RoadTrail } from '../input/placement.ts';
import { ITEM_TONES, iconKey } from './indicatorLayer.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';

const VALID = hex(PALETTE.mint.base);
const INVALID = hex(PALETTE.coral.base);
const WHITE = hex(PALETTE.paper.base);
const SITE = hex(PALETTE.yellow.base);
/** Les pointillés de la grille : l'indigo, qui se lit sur l'herbe comme sur la roche claire. */
const GRID_COLOR = hex(PALETTE.ink.base);

/** Opacité du sprite fantôme : posable, il se montre ; refusé, il s'efface devant les cases rouges. */
const PREVIEW_ALPHA = 0.7;
const PREVIEW_ALPHA_BLOCKED = 0.4;
/** Retrait d'une case fautive dans sa tuile : deux cases voisines restent deux cases. */
const CELL_INSET = 2;

/** Respiration du fantôme qui suit la souris : période, et part d'opacité qui bat. */
const BREATH_MS = 1200;
const BREATH_DEPTH = 0.3;
/** Secousse de refus : durée, amplitude en pixels monde, allers-retours. */
const REFUSE_MS = 320;
const REFUSE_PX = 5;
const REFUSE_SWINGS = 3;

/** Rayon des emprises soulignées et des filons autour du joueur, en tuiles : un peu plus que la portée. */
const GRID_RADIUS = BUILD_REACH_TILES + 3;

/** Rayon du cercle de grille autour du fantôme, en tuiles : au-delà, elle s'est estompée. */
const GRID_FADE_TILES = 5.5;
/** Opacité des pointillés au cœur du cercle. */
const GRID_ALPHA = 0.32;
/** Crans d'opacité du fondu : un trait par cran, pas un par tiret. */
const GRID_STEPS = 5;
/** Un tiret de grille et son pas, en pixels monde : deux par côté de case, les croisements restent ouverts. */
const GRID_DASH = 6;
const GRID_PERIOD = 16;
/** Tiret et pas du contour de l'emprise. */
const OUTLINE_DASH = 7;
const OUTLINE_PERIOD = 11;

/** Icône d'une case de filon, en pixels monde : lisible sans cacher le rocher dessous. */
const ORE_ICON_PX = 16;

export class GhostLayer {
  public readonly container = new Container();

  private readonly grid = new Graphics();
  private readonly footprints = new Graphics();
  private readonly outline = new Graphics();
  private readonly cells = new Graphics();
  private readonly reach = new Graphics();
  private readonly warehouseReach = new Graphics();
  /** La zone interdite autour de la mairie, pour un bâtiment qui se dresse loin d'elle. */
  private readonly keepOut = new Graphics();
  private lastKeepOutKey = '';
  /** Les filons autour d'Adam, quand une foreuse est armée : cases teintées et icônes. */
  private readonly ores = new Graphics();
  private readonly oreIcons = new Container();
  private readonly oreIconPool: Sprite[] = [];
  private lastOreKey = '';
  /** Le tracé de route : une case par tuile. */
  private readonly trail = new Graphics();
  private lastTrailKey = '';
  private readonly preview = new Sprite();
  /** Le fantôme lui-même — sprite, cases, liseré — : c'est lui qui secoue la tête. */
  private readonly ghost = new Container();
  private lastKey = '';
  /** Opacité du sprite avant respiration. */
  private previewAlpha = PREVIEW_ALPHA;
  private clock = 0;
  private refuseLeft = 0;
  private readonly reducedMotion: MediaQueryList | null;
  private lastGridKey = '';
  private lastWarehouseKey = '';

  private readonly world: World;
  private readonly library: SpriteLibrary;

  public constructor(world: World, library: SpriteLibrary) {
    this.world = world;
    this.library = library;
    this.preview.alpha = PREVIEW_ALPHA;
    // Ancré au pied de l'emprise : le toit dépasse vers le haut, comme le bâtiment fini.
    this.preview.anchor.set(0, 1);

    this.reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

    this.ghost.addChild(this.preview, this.cells, this.outline);
    this.container.addChild(
      this.grid,
      this.footprints,
      this.ores,
      this.oreIcons,
      this.warehouseReach,
      this.keepOut,
      this.reach,
      this.ghost,
      this.trail,
    );
    this.container.visible = false;
  }

  /**
   * `armed` : le bâtiment armé — le mode construction est actif, fantôme
   * posé ou non. `ghost` : le fantôme, s'il est posé. `block` : pourquoi il
   * ne se pose pas, calculé une fois par le renderer.
   */
  public update(
    armed: BuildingId | null,
    ghost: GhostState | null,
    block: PlacementBlock | null,
    deltaMs: number,
  ): void {
    this.trail.visible = false;
    this.ghost.visible = true;
    this.reach.visible = true;

    if (!armed) {
      this.container.visible = false;
      this.lastKey = '';
      this.lastGridKey = '';
      this.refuseLeft = 0;
      this.lastWarehouseKey = '';
      this.lastKeepOutKey = '';
      this.lastOreKey = '';
      return;
    }

    this.container.visible = true;
    this.updateGrid(ghost ? { x: ghost.tx + BUILDINGS[ghost.building].width / 2, y: ghost.ty + BUILDINGS[ghost.building].height / 2 } : null);
    this.updateOres(BUILDINGS[armed].kind === 'drill');
    this.updateWarehouseReach();
    this.updateKeepOut(armed);

    // Le cercle de portée suit le joueur en continu, lui.
    this.reach.position.set(this.world.player.x, this.world.player.y);

    if (!ghost) {
      this.preview.visible = false;
      this.outline.visible = false;
      this.cells.visible = false;
      this.lastKey = '';
      this.drawReach();
      return;
    }
    this.preview.visible = true;
    this.outline.visible = true;
    this.cells.visible = true;

    // Adam qui marche dans l'emprise change les cases sans changer le motif : elles sont dans la clé.
    // L'assise ne dépend que de la case et de la seed : la case est déjà dans la clé.
    const tiles = (block?.blocked ?? block?.tiles)?.map(({ tx, ty }) => `${tx},${ty}`).join(';') ?? '';
    const key = `${ghost.building}:${ghost.tx}:${ghost.ty}:${block?.reason ?? 'ok'}:${tiles}`;

    this.animate(ghost.follow, deltaMs);

    if (key === this.lastKey) return;
    this.lastKey = key;

    const proto = BUILDINGS[ghost.building];
    const color = block ? INVALID : VALID;

    this.preview.texture = this.library.texture(`${proto.sprite}.built`);
    this.preview.position.set(ghost.tx * TILE_SIZE, (ghost.ty + proto.height) * TILE_SIZE);
    this.preview.tint = block ? WHITE : VALID;
    this.previewAlpha = block ? PREVIEW_ALPHA_BLOCKED : PREVIEW_ALPHA;
    this.animate(ghost.follow, 0);

    this.cells.clear();

    const footing = this.world.footing(ghost.building, ghost.tx, ghost.ty);
    const wrong = block?.blocked ?? block?.tiles ?? [];
    const isWrong = (x: number, y: number): boolean => wrong.some((tile) => tile.tx === x && tile.ty === y);

    if (footing) this.drawFooting(footing);
    else {
      // Les cases bonnes de l'emprise, en menthe : la fautive se lit à côté d'elles.
      for (let y = ghost.ty; y < ghost.ty + proto.height; y += 1) {
        for (let x = ghost.tx; x < ghost.tx + proto.width; x += 1) {
          if (!isWrong(x, y)) this.cell(x, y, VALID, 0.4);
        }
      }
    }
    for (const tile of wrong) this.cell(tile.tx, tile.ty, INVALID, 0.7);

    this.outline.clear();
    dashedRect(
      this.outline,
      ghost.tx * TILE_SIZE,
      ghost.ty * TILE_SIZE,
      proto.width * TILE_SIZE,
      proto.height * TILE_SIZE,
      OUTLINE_DASH,
      OUTLINE_PERIOD,
    );
    this.outline.stroke({ width: STROKE.width * 1.5, color, cap: 'round' });

    this.drawReach();
  }

  /** Une case de l'emprise, teintée et liserée. */
  private cell(tx: number, ty: number, color: number, alpha: number): void {
    this.cells
      .roundRect(
        tx * TILE_SIZE + CELL_INSET,
        ty * TILE_SIZE + CELL_INSET,
        TILE_SIZE - CELL_INSET * 2,
        TILE_SIZE - CELL_INSET * 2,
        RADIUS.block,
      )
      .fill({ color, alpha })
      .stroke({ width: STROKE.width, color, alignment: 1 });
  }

  /**
   * Les cases bonnes de l'assise d'une foreuse : le filon à la teinte de son
   * minerai, l'herbe en menthe. Les fautives sont celles du refus, que
   * `update` peint en corail par-dessus.
   */
  private drawFooting(footing: Footing): void {
    for (const tile of footing.tiles) {
      if (tile.state === 'wrong') continue;

      const tone = tile.state === 'ore' && footing.ore ? PALETTE[ITEM_TONES[footing.ore]] : PALETTE.mint;

      this.cells
        .roundRect(
          tile.tx * TILE_SIZE + CELL_INSET,
          tile.ty * TILE_SIZE + CELL_INSET,
          TILE_SIZE - CELL_INSET * 2,
          TILE_SIZE - CELL_INSET * 2,
          RADIUS.block,
        )
        .fill({ color: hex(tone.base), alpha: 0.45 })
        .stroke({ width: STROKE.width, color: VALID, alignment: 1 });
    }
  }

  /**
   * Le mode route : la grille, le rayon de la mairie — la ville paie les
   * tuiles qu'il couvre —, et le tracé. Appelé à la place d'`update` tant
   * que la route est armée.
   */
  public updateRoad(tool: RoadTool, trail: RoadTrail | null, deltaMs: number): void {
    this.container.visible = true;
    this.ghost.visible = false;
    this.reach.visible = false;
    this.trail.visible = true;
    this.lastKey = '';
    this.lastOreKey = '';
    const last = trail?.tiles.at(-1);

    this.updateGrid(last ? { x: last.tx + 0.5, y: last.ty + 0.5 } : null);
    this.updateOres(false);
    this.updateWarehouseReach();
    this.animate(false, deltaMs);
    this.trail.x = this.ghost.x;

    const tiles = trail?.tiles ?? [];
    const states =
      tool === 'pave'
        ? this.world.roadPlan(tiles).map((step) => step.state)
        : tiles.map(({ tx, ty }) => (this.world.roads.has(tx, ty) ? 'remove' : 'none'));
    const key = `${tool}:${tiles.map(({ tx, ty }, i) => `${tx},${ty},${states[i] ?? ''}`).join(';')}`;

    if (key === this.lastTrailKey) return;
    this.lastTrailKey = key;
    this.trail.clear();

    for (const [i, { tx, ty }] of tiles.entries()) {
      const state = states[i];
      const color = state === 'pave' ? VALID : state === 'paved' || state === 'none' ? WHITE : INVALID;
      const fill = state === 'paved' || state === 'none' ? 0.15 : 0.5;

      this.trail
        .roundRect(
          tx * TILE_SIZE + CELL_INSET,
          ty * TILE_SIZE + CELL_INSET,
          TILE_SIZE - CELL_INSET * 2,
          TILE_SIZE - CELL_INSET * 2,
          RADIUS.block,
        )
        .fill({ color, alpha: fill })
        .stroke({ width: STROKE.width, color, alpha: 0.9, alignment: 1 });
    }
  }

  /** Un clic est tombé sur un emplacement refusé : le fantôme secoue la tête. */
  public refuse(): void {
    this.refuseLeft = REFUSE_MS;
  }

  /** Respiration et secousse : du ressenti, rien que des minuteurs de vue. */
  private animate(follow: boolean, deltaMs: number): void {
    const still = this.reducedMotion?.matches ?? false;

    this.clock = (this.clock + deltaMs) % BREATH_MS;
    this.refuseLeft = Math.max(0, this.refuseLeft - deltaMs);

    const breath = follow && !still ? (1 - Math.cos((this.clock / BREATH_MS) * Math.PI * 2)) / 2 : 0;

    this.preview.alpha = this.previewAlpha * (1 - BREATH_DEPTH * breath);
    this.outline.alpha = 1 - BREATH_DEPTH * breath;

    const progress = 1 - this.refuseLeft / REFUSE_MS;

    this.ghost.x =
      this.refuseLeft > 0 && !still
        ? Math.sin(progress * Math.PI * 2 * REFUSE_SWINGS) * REFUSE_PX * (1 - progress)
        : 0;
  }

  private drawReach(): void {
    this.reach
      .clear()
      .circle(0, 0, BUILD_REACH_TILES * TILE_SIZE)
      .stroke({ width: STROKE.width, color: WHITE, alpha: 0.4 });
  }

  /** Le rayon de la mairie : dessiné une fois, redessiné seulement si elle apparaît ou tombe. */
  private updateWarehouseReach(): void {
    const hall = this.world.warehouse();
    const radius = hall ? logisticRadiusOf(hall.proto, hall.level) : 0;
    const key = hall && Number.isFinite(radius) ? `${hall.id}:${radius}` : '';

    if (key === this.lastWarehouseKey) return;
    this.lastWarehouseKey = key;
    this.warehouseReach.clear();

    if (!hall || key === '') return;

    this.warehouseReach
      .circle((hall.tx + hall.width / 2) * TILE_SIZE, (hall.ty + hall.height / 2) * TILE_SIZE, radius * TILE_SIZE)
      .fill({ color: SITE, alpha: 0.08 })
      .stroke({ width: STROKE.width, color: SITE, alpha: 0.7 });
  }

  /** Le disque corail où le bâtiment armé ne se pose pas : trop près de la mairie. */
  private updateKeepOut(armed: BuildingId): void {
    const hall = this.world.entities.get(this.world.townHallId);
    const { hallDistance }: BuildingProto = BUILDINGS[armed];
    const key = hall && hallDistance !== undefined ? `${hall.id}:${hallDistance}` : '';

    if (key === this.lastKeepOutKey) return;
    this.lastKeepOutKey = key;
    this.keepOut.clear();

    if (!hall || hallDistance === undefined) return;

    this.keepOut
      .circle((hall.tx + hall.width / 2) * TILE_SIZE, (hall.ty + hall.height / 2) * TILE_SIZE, hallDistance * TILE_SIZE)
      .fill({ color: INVALID, alpha: 0.1 })
      .stroke({ width: STROKE.width, color: INVALID, alpha: 0.7 });
  }

  /**
   * La grille et les emprises ne se redessinent que si leur centre change de
   * case ou si le nombre d'entités change : un `Graphics` de quelques
   * centaines de segments retesselé à chaque frame ferait chauffer le téléphone.
   *
   * `centre` : le milieu du fantôme, en tuiles ; `null` sans fantôme, et la
   * grille se centre sur Adam. Chaque côté de case est fait de deux tirets,
   * d'autant plus pâles qu'il est loin du centre ; au-delà de
   * `GRID_FADE_TILES`, rien. Un trait par cran d'opacité.
   */
  private updateGrid(centre: { x: number; y: number } | null): void {
    const { tx, ty } = worldToTile(this.world.player.x, this.world.player.y);
    const cx = centre?.x ?? tx + 0.5;
    const cy = centre?.y ?? ty + 0.5;
    const key = `${tx}:${ty}:${cx}:${cy}:${this.world.entities.size}`;

    if (key === this.lastGridKey) return;
    this.lastGridKey = key;

    const steps: [number, number, number, number][][] = Array.from({ length: GRID_STEPS }, () => []);
    const reach = Math.ceil(GRID_FADE_TILES);
    const fade = (x: number, y: number): number => 1 - Math.hypot(x - cx, y - cy) / GRID_FADE_TILES;

    for (let y = Math.floor(cy) - reach; y <= Math.floor(cy) + reach; y += 1) {
      for (let x = Math.floor(cx) - reach; x <= Math.floor(cx) + reach; x += 1) {
        // Le côté haut et le côté gauche de la case (x, y), chacun à l'opacité de son milieu.
        for (const [mx, my, horizontal] of [
          [x + 0.5, y, true],
          [x, y + 0.5, false],
        ] as const) {
          const strength = fade(mx, my);

          if (strength <= 0) continue;

          const step = Math.min(GRID_STEPS - 1, Math.floor(strength * GRID_STEPS));

          for (let offset = (GRID_PERIOD - GRID_DASH) / 2; offset < TILE_SIZE; offset += GRID_PERIOD) {
            steps[step]!.push(
              horizontal
                ? [x * TILE_SIZE + offset, y * TILE_SIZE, x * TILE_SIZE + offset + GRID_DASH, y * TILE_SIZE]
                : [x * TILE_SIZE, y * TILE_SIZE + offset, x * TILE_SIZE, y * TILE_SIZE + offset + GRID_DASH],
            );
          }
        }
      }
    }

    this.grid.clear();
    for (const [step, dashes] of steps.entries()) {
      if (dashes.length === 0) continue;
      for (const [x1, y1, x2, y2] of dashes) this.grid.moveTo(x1, y1).lineTo(x2, y2);
      this.grid.stroke({ width: STROKE.width, color: GRID_COLOR, alpha: (GRID_ALPHA * (step + 1)) / GRID_STEPS, cap: 'round' });
    }

    this.footprints.clear();
    for (const entity of this.world.entities.values()) {
      if (Math.abs(entity.tx - tx) > GRID_RADIUS + 3 || Math.abs(entity.ty - ty) > GRID_RADIUS + 3) continue;

      const color = entity.kind === 'site' ? SITE : WHITE;

      this.footprints
        .roundRect(
          entity.tx * TILE_SIZE,
          entity.ty * TILE_SIZE,
          entity.width * TILE_SIZE,
          entity.height * TILE_SIZE,
          RADIUS.block,
        )
        .fill({ color, alpha: 0.18 })
        .stroke({ width: STROKE.width, color, alpha: 0.6, alignment: 1 });
    }
  }

  /**
   * Les filons de la grille, redessinés seulement quand Adam change de tuile :
   * la seed ne bouge pas, les gisements non plus. Une case par tuile de
   * filon, à la teinte de son minerai, et l'icône de l'objet au centre.
   */
  private updateOres(visible: boolean): void {
    const { tx, ty } = worldToTile(this.world.player.x, this.world.player.y);
    const key = visible ? `${tx}:${ty}` : '';

    if (key === this.lastOreKey) return;
    this.lastOreKey = key;
    this.ores.clear();

    let used = 0;

    if (visible) {
      for (let y = ty - GRID_RADIUS; y <= ty + GRID_RADIUS; y += 1) {
        for (let x = tx - GRID_RADIUS; x <= tx + GRID_RADIUS; x += 1) {
          const node = oreAt(this.world.seed, x, y);

          if (!node) continue;

          const tone = PALETTE[ITEM_TONES[node.item]];

          this.ores
            .roundRect(
              x * TILE_SIZE + CELL_INSET,
              y * TILE_SIZE + CELL_INSET,
              TILE_SIZE - CELL_INSET * 2,
              TILE_SIZE - CELL_INSET * 2,
              RADIUS.block,
            )
            .fill({ color: hex(tone.base), alpha: 0.3 })
            .stroke({ width: STROKE.width, color: hex(tone.shade), alpha: 0.8, alignment: 1 })
            // Une pastille blanche sous l'icône : lisible même sur un rocher de la même teinte.
            .circle((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, ORE_ICON_PX / 2 + 2)
            .fill({ color: WHITE, alpha: 0.9 });

          const icon = this.oreIconPool[used] ?? this.oreIcons.addChild(new Sprite());

          this.oreIconPool[used] = icon;
          used += 1;
          icon.texture = this.library.texture(iconKey(node.item));
          icon.anchor.set(0.5);
          icon.width = ORE_ICON_PX;
          icon.height = ORE_ICON_PX;
          icon.position.set((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
          icon.visible = true;
        }
      }
    }
    for (let i = used; i < this.oreIconPool.length; i += 1) this.oreIconPool[i]!.visible = false;
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** Le contour d'un rectangle en tirets, côté par côté, à tracer ensuite d'un seul `stroke`. */
function dashedRect(graphics: Graphics, x: number, y: number, width: number, height: number, dash: number, period: number): void {
  const side = (x1: number, y1: number, x2: number, y2: number): void => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    // Autant de tirets que le côté en tient, centrés : les coins restent symétriques.
    const count = Math.max(1, Math.floor((length + period - dash) / period));
    const start = (length - (count - 1) * period - dash) / 2;
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;

    for (let i = 0; i < count; i += 1) {
      const from = start + i * period;

      graphics.moveTo(x1 + ux * from, y1 + uy * from).lineTo(x1 + ux * (from + dash), y1 + uy * (from + dash));
    }
  };

  side(x, y, x + width, y);
  side(x + width, y, x + width, y + height);
  side(x + width, y + height, x, y + height);
  side(x, y + height, x, y);
}
