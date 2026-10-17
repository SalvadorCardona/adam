/**
 * Le sol : un bloc de tuiles = un Sprite.
 *
 * Levier de performance numéro un sur mobile. Les tuiles d'un bloc sont
 * dessinées **une fois** dans une RenderTexture, puis affichées comme un seul
 * Sprite. Sans ça, ce sont des milliers de quads par frame.
 *
 * Le sol, la prairie (taches, brins, fleurettes : `meadow.ts`) et le décor
 * sont régénérés depuis la seed et ne changent jamais. Une chose s'y
 * ajoute, que la ville trace : les chemins de terre battue entre la mairie
 * et ses bâtiments (`setTrails`), qui rebakent les blocs qu'ils traversent
 * quand un bâtiment s'achève ou tombe, et la terre qu'une station dépollue
 * (`invalidate`). Les arbres et les rochers, qui changent
 * et qui montent au-dessus de leur tuile, sont des sprites à part
 * (`resourceLayer.ts`).
 *
 * Quatre règles tenues ici :
 * - bake unique ;
 * - budget : quelques blocs par image, partagés avec l'eau, les plus proches
 *   du centre de la caméra d'abord, les manquants avant les périmés
 *   (`bakeBudget.ts`) ;
 * - culling : seuls les blocs intersectant la caméra sont dans le graphe ;
 * - éviction : au-delà de la marge, la RenderTexture est détruite. C'est ce
 *   qui empêche une exploration de 20 minutes de saturer la VRAM du téléphone.
 *
 * Le dessin est vectoriel : le bloc est baké à la résolution de l'écran,
 * plafonnée à 2 — au-delà, un bloc pèserait plus de 9 Mo pour un gain que
 * l'œil ne voit pas sur des aplats. C'est aussi pour la mémoire que le bloc
 * fait 16 × 16 tuiles et non un chunk entier : 4 Mo par bloc au lieu de 16.
 */

import { Container, RenderTexture, Sprite, type Renderer, type Texture } from 'pixi.js';
import { TILE_SIZE, coordKey, type TileCoord } from '../core/grid.ts';
import type { Land } from '../sim/contamination.ts';
import { decorAt } from '../sim/terrain.ts';
import type { Camera } from './camera.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';
import { BlockTerrain, CORNERS, CORNER_SIDES, SIDES, SIDE_OFFSET, groundRoll, type Surface, type TerrainTiles } from './terrainTiles.ts';
import { PATCH_SIZE, TRAIL_WIDTH } from '../art/terrain.ts';
import { patchesIn, sprinkleAt, trailBounds, trailPoints, type Trail } from './meadow.ts';
import { bakeOrder, type BakeBudget } from './bakeBudget.ts';

/** Pas entre deux ronds d'un chemin, en pixels monde : assez serré pour que leur union soit lisse. */
const TRAIL_STEP = 3;

/** Côté d'un bloc, en tuiles, et en pixels monde. */
export const BLOCK_TILES = 16;
export const BLOCK_SIZE = BLOCK_TILES * TILE_SIZE;

/** Marge de bake et d'éviction, en blocs au-delà de la zone visible. */
export const BAKE_MARGIN = 0;
export const KEEP_MARGIN = 1;

/** Résolution maximale d'un bloc baké. */
const MAX_BLOCK_RESOLUTION = 2;

interface BakedBlock {
  bx: number;
  by: number;
  sprite: Sprite;
  texture: RenderTexture;
}

export class ChunkLayer {
  public readonly container = new Container();

  private readonly baked = new Map<string, BakedBlock>();
  /** Blocs bakés dont un chemin ou une terre a changé : rebakés au prochain `update`. */
  private readonly stale = new Set<string>();
  /** Les chemins de terre battue de la ville, par clé. */
  private trails = new Map<string, Trail>();
  /** La tuile du feu de camp, tant que la mairie n'est pas bâtie. */
  private camp: TileCoord | null = null;

  private readonly renderer: Renderer;
  private readonly library: SpriteLibrary;
  private readonly tiles: TerrainTiles;
  private readonly seed: number;
  private readonly land: Land;
  private readonly resolution: number;

  public constructor(renderer: Renderer, library: SpriteLibrary, tiles: TerrainTiles, seed: number, land: Land) {
    this.renderer = renderer;
    this.library = library;
    this.tiles = tiles;
    this.seed = seed;
    this.land = land;
    this.resolution = Math.min(MAX_BLOCK_RESOLUTION, library.stats.resolution);
  }

  /** Nombre de blocs actuellement bakés — remonté au HUD de debug. */
  public get drawn(): number {
    return this.baked.size;
  }

  /** `budget` : les blocs que cette image peut encore baker (`bakeBudget.ts`). */
  public update(camera: Camera, budget: BakeBudget): void {
    const bounds = camera.visibleCells(BLOCK_SIZE, BAKE_MARGIN);
    const order = bakeOrder(bounds, camera.centerX / BLOCK_SIZE, camera.centerY / BLOCK_SIZE, (key) => this.baked.has(key), this.stale);

    for (const { bx, by, key } of order) {
      if (!budget.take(performance.now())) break;

      const entry = this.baked.get(key);

      if (entry) this.renderInto(bx, by, entry.texture);
      else this.baked.set(key, this.bake(bx, by));
      this.stale.delete(key);
    }

    this.evict(camera.visibleCells(BLOCK_SIZE, KEEP_MARGIN));
  }

  private bake(bx: number, by: number): BakedBlock {
    const texture = RenderTexture.create({
      width: BLOCK_SIZE,
      height: BLOCK_SIZE,
      resolution: this.resolution,
      scaleMode: 'linear',
    });

    this.renderInto(bx, by, texture);

    const sprite = new Sprite(texture);

    sprite.position.set(bx * BLOCK_SIZE, by * BLOCK_SIZE);
    this.container.addChild(sprite);

    return { bx, by, sprite, texture };
  }

  /**
   * Dessine le bloc dans sa RenderTexture, puis jette la scène.
   *
   * Neuf passes, dans l'ordre du peintre : le sol (sous l'eau, la terre de
   * sa rive : l'eau est peinte par `waterLayer.ts`), les taches de la
   * prairie, ses brins et fleurettes, les terres polluées et radioactives
   * (`Land`), qui recouvrent le sol, les transitions (faces avant,
   * liserés), les coins arrondis entre sols, les chemins de terre battue, qui passent
   * d'un sol à l'autre comme une rampe, puis le décor. Les
   * sprites sont temporaires : seule la texture survit. Celles du tileset,
   * partagées, restent.
   */
  private renderInto(bx: number, by: number, target: RenderTexture): void {
    const scene = new Container();
    const meadow = new Container();
    const sprinkles = new Container();
    const edges = new Container();
    const corners = new Container();
    const props = new Container();
    const trails = new Container();
    const soil = new Container();
    const baseTx = bx * BLOCK_TILES;
    const baseTy = by * BLOCK_TILES;
    const { seed } = this;

    // Deux rangées de marge : un coin du bord regarde le sol de la voisine,
    // qui regarde elle-même une tuile autour quand elle est sous l'eau.
    const terrain = new BlockTerrain(seed, baseTx, baseTy, BLOCK_TILES, 2);

    // La surface de chaque tuile du bloc et de sa première couronne, lue une fois.
    const surfaceSpan = BLOCK_TILES + 2;
    const surfaces: Surface[] = [];

    for (let ly = -1; ly <= BLOCK_TILES; ly += 1) {
      for (let lx = -1; lx <= BLOCK_TILES; lx += 1) {
        surfaces.push(this.land.at(baseTx + lx, baseTy + ly) ?? terrain.beneath(lx, ly));
      }
    }

    const surfaceAt = (lx: number, ly: number): Surface => surfaces[(ly + 1) * surfaceSpan + lx + 1]!;

    for (let ly = 0; ly < BLOCK_TILES; ly += 1) {
      for (let lx = 0; lx < BLOCK_TILES; lx += 1) {
        const tx = baseTx + lx;
        const ty = baseTy + ly;
        // L'eau n'est pas bakée : sous elle, la terre de sa rive (`waterLayer.ts` la peint par-dessus).
        const ground = terrain.beneath(lx, ly);
        const roll = groundRoll(seed, tx, ty);
        const own = surfaceAt(lx, ly);

        scene.addChild(tileSprite(this.tiles.ground(ground, roll), lx, ly));

        for (const side of SIDES) {
          const [dx, dy] = SIDE_OFFSET[side];

          // La terre contaminée recouvre son sol : les transitions du sol dessous se taisent.
          if (own !== ground || terrain.beneath(lx + dx, ly + dy) === ground) continue;

          const edge = this.tiles.edge(ground, side);

          if (edge) edges.addChild(tileSprite(edge, lx, ly));
        }

        // Un coin est saillant quand ses deux voisins orthogonaux sont d'une
        // même autre surface : on l'arrondit, peint dans la couleur de celle-ci.
        // Vaut aussi pour la terre contaminée, dont les plaques ont ainsi des
        // coins saillants et rentrants arrondis.
        for (const corner of CORNERS) {
          const [vertical, horizontal] = CORNER_SIDES[corner];
          const [vx, vy] = SIDE_OFFSET[vertical];
          const [hx, hy] = SIDE_OFFSET[horizontal];
          const above = surfaceAt(lx + vx, ly + vy);
          const beside = surfaceAt(lx + hx, ly + hy);

          if (above === own || beside !== above) continue;

          corners.addChild(tileSprite(this.tiles.surfaceCorner(beside, corner), lx, ly));
        }

        // Une terre polluée ou radioactive recouvre le sol : ni décor ni fleurette dessus.
        const tainted = this.land.at(tx, ty);

        if (tainted) {
          soil.addChild(tileSprite(this.tiles.contamination(tainted, roll), lx, ly));
          continue;
        }

        const decor = this.camp && this.camp.tx === tx && this.camp.ty === ty ? 'campfire' : decorAt(seed, tx, ty);

        if (decor) {
          props.addChild(tileSprite(this.library.part('decor', decor), lx, ly));
          continue;
        }

        const sprinkle = terrain.kind(lx, ly) === 'grass' ? sprinkleAt(seed, tx, ty) : null;

        if (sprinkle) {
          const sprite = new Sprite(this.tiles.sprinkle(sprinkle.name));

          sprite.position.set(lx * TILE_SIZE + sprinkle.dx, ly * TILE_SIZE + sprinkle.dy);
          sprinkles.addChild(sprite);
        }
      }
    }

    const left = bx * BLOCK_SIZE;
    const top = by * BLOCK_SIZE;

    for (const patch of patchesIn(seed, left, top, left + BLOCK_SIZE, top + BLOCK_SIZE)) {
      const sprite = new Sprite(this.tiles.patch(patch.tone, patch.shape));
      const width = PATCH_SIZE.width * patch.scale;

      sprite.scale.set(patch.flip ? -patch.scale : patch.scale, patch.scale);
      sprite.position.set(patch.x - left + (patch.flip ? width : 0), patch.y - top);
      meadow.addChild(sprite);
    }

    this.bakeTrails(terrain, left, top, trails);

    scene.addChild(meadow, sprinkles, soil, edges, corners, trails, props);
    this.renderer.render({ target, container: scene, clear: true });
    scene.destroy({ children: true });
  }

  /**
   * Les chemins qui traversent le bloc, tamponnés en ronds : la terre, puis
   * sa trace claire. Un rond ne se pose ni sur l'eau ni contre elle : un
   * chemin s'arrête à la rive et reprend de l'autre côté.
   */
  private bakeTrails(terrain: BlockTerrain, left: number, top: number, into: Container): void {
    const margin = TRAIL_WIDTH.outer;
    const outer = new Container();
    const inner = new Container();

    for (const trail of this.trails.values()) {
      const bounds = trailBounds(trail, margin);

      if (bounds.right < left || bounds.left > left + BLOCK_SIZE || bounds.bottom < top || bounds.top > top + BLOCK_SIZE) continue;

      for (const { x, y } of trailPoints(trail, TRAIL_STEP)) {
        const px = x - left;
        const py = y - top;

        if (px < -margin || py < -margin || px > BLOCK_SIZE + margin || py > BLOCK_SIZE + margin) continue;

        const lx = Math.floor(px / TILE_SIZE);
        const ly = Math.floor(py / TILE_SIZE);

        if (terrain.kind(lx, ly) === 'water' || SIDES.some((side) => terrain.kind(lx + SIDE_OFFSET[side][0], ly + SIDE_OFFSET[side][1]) === 'water')) {
          continue;
        }

        const dot = new Sprite(this.tiles.trail('outer'));

        dot.anchor.set(0.5);
        dot.position.set(px, py);
        outer.addChild(dot);

        const trace = new Sprite(this.tiles.trail('inner'));

        trace.anchor.set(0.5);
        trace.position.set(px, py);
        inner.addChild(trace);
      }
    }
    into.addChild(outer, inner);
  }

  /**
   * Les chemins de la ville ont changé (`meadow.ts`, `trailsOf`) : les blocs
   * que traverse un chemin apparu ou disparu se rebakent. Les autres gardent leur texture.
   */
  public setTrails(trails: readonly Trail[]): void {
    const next = new Map(trails.map((trail) => [trail.key, trail]));
    const changed = [...this.trails.values()].filter((trail) => !next.has(trail.key));

    for (const trail of next.values()) if (!this.trails.has(trail.key)) changed.push(trail);
    this.trails = next;

    for (const trail of changed) {
      const bounds = trailBounds(trail, TRAIL_WIDTH.outer);

      for (let by = Math.floor(bounds.top / BLOCK_SIZE); by <= Math.floor(bounds.bottom / BLOCK_SIZE); by += 1) {
        for (let bx = Math.floor(bounds.left / BLOCK_SIZE); bx <= Math.floor(bounds.right / BLOCK_SIZE); bx += 1) {
          const key = coordKey(bx, by);

          if (this.baked.has(key)) this.stale.add(key);
        }
      }
    }
  }

  /** Le feu de camp s'allume en `tile`, ou s'éteint (`null`) : son bloc se rebake. */
  public setCamp(tile: TileCoord | null): void {
    const moved = [this.camp, tile].filter((spot): spot is TileCoord => spot !== null);

    this.camp = tile;
    for (const { tx, ty } of moved) this.invalidate(tx, ty);
  }

  /**
   * Le sol a changé en (tx, ty) — une terre dépolluée : son bloc se rebake, et
   * celui de chaque voisine, dont le raccord change. Un bloc pas encore baké
   * le sera de toute façon à jour.
   */
  public invalidate(tx: number, ty: number): void {
    for (const [dx, dy] of [[0, 0], ...Object.values(SIDE_OFFSET)]) {
      const key = coordKey(Math.floor((tx + dx) / BLOCK_TILES), Math.floor((ty + dy) / BLOCK_TILES));

      if (this.baked.has(key)) this.stale.add(key);
    }
  }

  private evict(bounds: { minCx: number; minCy: number; maxCx: number; maxCy: number }): void {
    for (const [key, entry] of this.baked) {
      const parts = key.split(',');
      const bx = Number(parts[0]);
      const by = Number(parts[1]);

      const outside = bx < bounds.minCx || bx > bounds.maxCx || by < bounds.minCy || by > bounds.maxCy;

      if (!outside) continue;

      entry.sprite.destroy();
      entry.texture.destroy(true);
      this.baked.delete(key);
      this.stale.delete(key);
    }
  }

  public destroy(): void {
    for (const entry of this.baked.values()) {
      entry.sprite.destroy();
      entry.texture.destroy(true);
    }
    this.baked.clear();
    this.container.destroy();
  }
}

/** Un sprite de tuile posé sur la grille locale ; la texture a déjà la taille d'une tuile. */
function tileSprite(texture: Texture, lx: number, ly: number): Sprite {
  const sprite = new Sprite(texture);

  sprite.position.set(lx * TILE_SIZE, ly * TILE_SIZE);
  return sprite;
}
