/**
 * L'eau : rive arrondie, profondeur en dégradé, écume, crêtes et ondulation,
 * peintes par un seul shader (`waterShader.ts`).
 *
 * Le sol baké (`chunkLayer.ts`) ne dessine pas l'eau : sous une tuile d'eau,
 * il pose la terre de la rive. Ce calque passe par-dessus, sous les ombres
 * portées, et peint l'eau au pixel près à partir du champ de chaque bloc
 * (`waterField.ts`) : là où le champ dit « terre », le shader jette le pixel
 * et le sable se montre — la rive n'a plus de marche.
 *
 * Coût tenu ici, par les mêmes blocs de 16 × 16 tuiles que le sol :
 * - un bloc n'a de maillage que s'il a de l'eau, et ce maillage ne couvre que
 *   l'eau et ses voisines : le shader ne passe jamais sur la prairie ;
 * - un seul programme, un jeu d'uniformes partagé : un appel de dessin par
 *   bloc d'eau à l'écran, et rien à faire côté JS que de pousser l'heure ;
 * - quelques blocs neufs par image, sous le budget de bake partagé avec le
 *   sol (`bakeBudget.ts`) ;
 * - un bloc hors de l'écran est caché, et détruit — maillage et champ — avec
 *   la même marge d'éviction que le sol ;
 * - `prefers-reduced-motion` : l'heure s'arrête, l'eau est figée.
 *
 * Tout est seedé : les mêmes tuiles ont la même rive et les mêmes crêtes
 * d'une partie à l'autre. L'heure est celle du rendu, pas celle de la
 * simulation. Rien ici n'est de l'état de jeu.
 */

import { BufferImageSource, Container, GlProgram, Mesh, MeshGeometry, Shader, UniformGroup } from 'pixi.js';
import { TILE_SIZE } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { GROUND, PALETTE, hex, type Color } from '../data/artDirection.ts';
import { bakeOrder, type BakeBudget } from './bakeBudget.ts';
import type { Camera } from './camera.ts';
import { BAKE_MARGIN, BLOCK_SIZE, BLOCK_TILES, KEEP_MARGIN } from './chunkLayer.ts';
import { FIELD_TEXELS, RIPPLE_TEXELS, ripplesTexture, waterField } from './waterField.ts';
import { WATER_FRAGMENT, WATER_VERTEX } from './waterShader.ts';

/** L'eau ne se rebake jamais : ses blocs sont faits ou à faire. */
const NO_STALE: ReadonlySet<string> = new Set();

/** L'heure du shader repart de zéro après une heure : les flottants gardent leur précision. */
const TIME_WRAP_S = 3600;

/** Blocs d'eau à l'écran au dernier cadre, et les tuiles que leur maillage couvre. */
export interface WaterStats {
  blocks: number;
  tiles: number;
}

interface WaterBlock {
  bx: number;
  by: number;
  /** `null` : le bloc n'a pas d'eau. */
  mesh: Mesh<MeshGeometry, Shader> | null;
  field: BufferImageSource | null;
  tiles: number;
}

export class WaterLayer {
  public readonly container = new Container();

  private readonly blocks = new Map<string, WaterBlock>();
  private readonly seed: number;
  private readonly reducedMotion: MediaQueryList | null;
  private readonly program: GlProgram;
  private readonly uniforms: UniformGroup;
  /** Le bruit des ondulations, partagé par tous les blocs. */
  private readonly ripples: BufferImageSource;
  private time = 0;

  /** Blocs affichés au dernier cadre — remonté au HUD de debug. */
  public stats: WaterStats = { blocks: 0, tiles: 0 };

  public constructor(seed: number) {
    this.seed = seed;
    this.reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.program = GlProgram.from({
      name: 'water',
      vertex: WATER_VERTEX,
      fragment: WATER_FRAGMENT,
      // Le bruit se calcule sur les coordonnées du monde : il lui faut la pleine précision.
      preferredFragmentPrecision: 'highp',
    });

    this.ripples = new BufferImageSource({
      resource: ripplesTexture(seed),
      width: RIPPLE_TEXELS,
      height: RIPPLE_TEXELS,
      scaleMode: 'linear',
      addressMode: 'repeat',
      alphaMode: 'no-premultiply-alpha',
    });

    const roll = hash3(seed ^ 0x3c6ef372, 0, 0);

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      // Décale le bruit et les crêtes : une autre seed, une autre eau.
      uSeed: { value: new Float32Array([(roll % 997) + 0.5, ((roll >>> 10) % 991) + 0.5]), type: 'vec2<f32>' },
      uShallow: { value: rgb(GROUND.water.shallow), type: 'vec3<f32>' },
      uBase: { value: rgb(GROUND.water.base), type: 'vec3<f32>' },
      uDeep: { value: rgb(GROUND.water.deep), type: 'vec3<f32>' },
      uFoam: { value: rgb(PALETTE.paper.base), type: 'vec3<f32>' },
      uCrest: { value: rgb(GROUND.water.light), type: 'vec3<f32>' },
    });
  }

  /** `budget` : les blocs que cette image peut encore faire (`bakeBudget.ts`). */
  public update(camera: Camera, deltaMs: number, budget: BakeBudget): void {
    const still = this.reducedMotion?.matches ?? false;
    const bounds = camera.visibleCells(BLOCK_SIZE, BAKE_MARGIN);

    if (!still) {
      this.time = (this.time + deltaMs / 1000) % TIME_WRAP_S;
      this.uniforms.uniforms.uTime = this.time;
      this.uniforms.update();
    }

    // Sous le budget de bake de l'image, partagé avec le sol : un bloc pas encore fait montre la terre de sa rive.
    for (const { bx, by, key } of bakeOrder(bounds, camera.centerX / BLOCK_SIZE, camera.centerY / BLOCK_SIZE, (key) => this.blocks.has(key), NO_STALE)) {
      if (!budget.take(performance.now())) break;
      this.blocks.set(key, this.build(bx, by));
    }

    let blocks = 0;
    let tiles = 0;

    for (const block of this.blocks.values()) {
      if (!block.mesh) continue;

      const { bx, by } = block;
      const onScreen = bx >= bounds.minCx && bx <= bounds.maxCx && by >= bounds.minCy && by <= bounds.maxCy;

      block.mesh.visible = onScreen;
      if (!onScreen) continue;
      blocks += 1;
      tiles += block.tiles;
    }

    this.stats = { blocks, tiles };
    this.evict(camera.visibleCells(BLOCK_SIZE, KEEP_MARGIN));
  }

  /**
   * Le maillage d'un bloc : un quad par tuile à peindre, en coordonnées du
   * monde, dont les UV tombent sur les nœuds du champ.
   */
  private build(bx: number, by: number): WaterBlock {
    const field = waterField(this.seed, bx * BLOCK_TILES, by * BLOCK_TILES, BLOCK_TILES);

    if (!field) return { bx, by, mesh: null, field: null, tiles: 0 };

    const count = field.tiles.length;
    const positions = new Float32Array(count * 8);
    const uvs = new Float32Array(count * 8);
    const indices = new Uint32Array(count * 6);
    const left = bx * BLOCK_SIZE;
    const top = by * BLOCK_SIZE;
    // Le nœud k du champ est à k / FIELD_TEXELS tuiles du coin du bloc ; son centre de texel, en (k + ½) / size.
    const uv = (tiles: number): number => (tiles * FIELD_TEXELS + 0.5) / field.size;

    field.tiles.forEach(([lx, ly], i) => {
      const corners = [
        [lx, ly],
        [lx + 1, ly],
        [lx + 1, ly + 1],
        [lx, ly + 1],
      ] as const;

      corners.forEach(([x, y], c) => {
        positions[i * 8 + c * 2] = left + x * TILE_SIZE;
        positions[i * 8 + c * 2 + 1] = top + y * TILE_SIZE;
        uvs[i * 8 + c * 2] = uv(x);
        uvs[i * 8 + c * 2 + 1] = uv(y);
      });
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });

    const source = new BufferImageSource({
      resource: field.data,
      width: field.size,
      height: field.size,
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'no-premultiply-alpha',
    });
    const shader = new Shader({
      glProgram: this.program,
      resources: { waterUniforms: this.uniforms, uField: source, uRipples: this.ripples },
    });
    const mesh = new Mesh({ geometry: new MeshGeometry({ positions, uvs, indices }), shader });

    this.container.addChild(mesh);
    return { bx, by, mesh, field: source, tiles: count };
  }

  private evict(bounds: { minCx: number; minCy: number; maxCx: number; maxCy: number }): void {
    for (const [key, block] of this.blocks) {
      const { bx, by } = block;

      if (bx >= bounds.minCx && bx <= bounds.maxCx && by >= bounds.minCy && by <= bounds.maxCy) continue;

      release(block);
      this.blocks.delete(key);
    }
  }

  public destroy(): void {
    for (const block of this.blocks.values()) release(block);
    this.blocks.clear();
    this.container.destroy();
    this.ripples.destroy();
    this.program.destroy();
  }
}

/** Rend le maillage, son shader et son champ ; le programme, les uniformes et le bruit partagés restent. */
function release(block: WaterBlock): void {
  if (!block.mesh) return;
  block.mesh.geometry.destroy();
  block.mesh.shader?.destroy(false);
  block.mesh.destroy();
  block.field?.destroy();
}

/** `'#45d6ff'` → [r, g, b] entre 0 et 1, pour un uniforme. */
function rgb(color: Color): Float32Array {
  const value = hex(color);

  return new Float32Array([((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]);
}
