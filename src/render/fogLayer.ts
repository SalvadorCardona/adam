/**
 * Le brouillard de guerre : un seul voile, un champ minuscule agrandi.
 *
 * La simulation dit l'état de chaque case (`sim/fog.ts`) ; ici, on le
 * peint. Un texel par tuile, sur la fenêtre de tuiles qui couvre l'écran
 * plus une marge : la part d'inconnu, et le voile — exploré hors de vue
 * (`FOG_TINT.exploredAlpha`), région pas encore conquise, même vue
 * (`FOG_TINT.regionAlpha`) ; rien sur ce qui est vu. Le champ est adouci d'un
 * flou en tente (1-2-1) puis agrandi 32 fois en filtrage linéaire : les bords
 * sont des fondus d'une tuile ou deux, jamais des marches d'escalier.
 *
 * Un shader (`fogShader.ts`) le peint sur un seul quad : l'inconnu en brume
 * de deux tons de l'indigo qui dérive, au bord gonflé en nuages arrondis, le
 * voile par-dessus l'exploré. La brume est un bruit de la seed seule : elle
 * habille l'inconnu sans rien en dire.
 *
 * Côté JS, une boucle sur quelques milliers de texels, refaite seulement
 * quand une case change d'état (`FogOfWar.revision`), qu'une région est
 * conquise (`World.regionRevision`), ou que l'écran sort de la fenêtre, puis
 * un envoi de texture ; à chaque image, l'heure seule. `prefers-reduced-motion` :
 * la brume est figée. Brouillard levé (réglage de débogage), le voile est
 * caché et ne coûte rien.
 */

import { BufferImageSource, Container, GlProgram, Mesh, MeshGeometry, Shader, UniformGroup } from 'pixi.js';
import { CHUNK_TILES, TILE_SIZE, floorDiv } from '../core/grid.ts';
import { hex, type Color } from '../data/artDirection.ts';
import { FOG_TINT } from '../data/fog.ts';
import type { World } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import { CLOUD_TEXELS, FOG_FRAGMENT, FOG_VERTEX, fogClouds } from './fogShader.ts';

/** Tuiles de marge autour de l'écran : la caméra glisse sans refaire la texture à chaque pas. */
const MARGIN = 8;
/** Les côtés de la fenêtre s'arrondissent à ce multiple : un pinch ne recrée pas la texture à chaque image. */
const STEP = 16;

/** L'heure du shader repart de zéro après une heure : les flottants gardent leur précision. */
const TIME_WRAP_S = 3600;

const UNEXPLORED = 2;
const EXPLORED = 1;

export class FogLayer {
  public readonly container = new Container();

  private readonly world: World;
  private readonly reducedMotion: MediaQueryList | null;
  private readonly program: GlProgram;
  private readonly uniforms: UniformGroup;
  /** Le bruit de la brume, tiré de la seed. */
  private readonly clouds: BufferImageSource;
  private mesh: Mesh<MeshGeometry, Shader> | null = null;
  private source: BufferImageSource | null = null;
  private pixels = new Uint8Array(0);
  private time = 0;
  /** La fenêtre peinte, en tuiles, et la révision du brouillard qu'elle montre. */
  private left = 0;
  private top = 0;
  private width = 0;
  private height = 0;
  private revision = -1;
  private regionRevision = -1;
  /** État de chaque tuile de la fenêtre, puis les deux champs adoucis. */
  private states = new Uint8Array(0);
  private dark = new Float32Array(0);
  private veil = new Float32Array(0);
  /** La région de chaque tuile de la fenêtre, lue une fois par fenêtre ; puis la part voilée, adoucie. */
  private regionIds = new Int16Array(0);
  private locked = new Float32Array(0);

  public constructor(world: World) {
    this.world = world;
    this.reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.program = GlProgram.from({
      name: 'fog',
      vertex: FOG_VERTEX,
      fragment: FOG_FRAGMENT,
      // Le bruit se lit sur les coordonnées du monde : il lui faut la pleine précision.
      preferredFragmentPrecision: 'highp',
    });
    this.clouds = new BufferImageSource({
      resource: fogClouds(world.seed),
      width: CLOUD_TEXELS,
      height: CLOUD_TEXELS,
      scaleMode: 'linear',
      addressMode: 'repeat',
      alphaMode: 'no-premultiply-alpha',
    });
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uOrigin: { value: new Float32Array(2), type: 'vec2<f32>' },
      uSize: { value: new Float32Array(2), type: 'vec2<f32>' },
      uDeep: { value: rgb(FOG_TINT.unexplored), type: 'vec3<f32>' },
      uCloud: { value: rgb(FOG_TINT.cloud), type: 'vec3<f32>' },
      uVeil: { value: rgb(FOG_TINT.explored), type: 'vec3<f32>' },
    });
  }

  public update(camera: Camera, deltaMs: number): void {
    const fog = this.world.fog;

    this.container.visible = fog.enabled;
    if (!fog.enabled) return;

    if (!(this.reducedMotion?.matches ?? false)) {
      this.time = (this.time + deltaMs / 1000) % TIME_WRAP_S;
      this.uniforms.uniforms.uTime = this.time;
      this.uniforms.update();
    }

    const view = camera.visibleCells(TILE_SIZE, 1);
    const inside =
      view.minCx >= this.left &&
      view.minCy >= this.top &&
      view.maxCx < this.left + this.width &&
      view.maxCy < this.top + this.height;

    if (!inside) {
      const width = Math.ceil((view.maxCx - view.minCx + 1 + MARGIN * 2) / STEP) * STEP;
      const height = Math.ceil((view.maxCy - view.minCy + 1 + MARGIN * 2) / STEP) * STEP;

      this.left = view.minCx - MARGIN;
      this.top = view.minCy - MARGIN;
      this.resize(width, height);
      this.regionIds.fill(-1);
      this.revision = -1;
    }
    if (this.revision === fog.revision && this.regionRevision === this.world.regionRevision) return;
    this.revision = fog.revision;
    this.regionRevision = this.world.regionRevision;
    this.paint();
  }

  private resize(width: number, height: number): void {
    if (width === this.width && height === this.height && this.mesh) return;
    this.width = width;
    this.height = height;
    this.states = new Uint8Array(width * height);
    this.dark = new Float32Array(width * height);
    this.veil = new Float32Array(width * height);
    this.locked = new Float32Array(width * height);
    this.regionIds = new Int16Array(width * height).fill(-1);
    this.pixels = new Uint8Array(width * height * 4);

    this.release();
    this.source = new BufferImageSource({
      resource: this.pixels,
      width,
      height,
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'no-premultiply-alpha',
    });

    const shader = new Shader({
      glProgram: this.program,
      resources: { fogUniforms: this.uniforms, uField: this.source, uClouds: this.clouds },
    });
    // Un quad unité, agrandi à la fenêtre : un texel du champ par tuile.
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    this.mesh = new Mesh({ geometry, shader });
    this.mesh.scale.set(width * TILE_SIZE, height * TILE_SIZE);
    this.container.addChild(this.mesh);
  }

  /** Rend le quad, son shader et son champ ; le programme, les uniformes et le bruit restent. */
  private release(): void {
    if (!this.mesh) return;
    this.mesh.geometry.destroy();
    this.mesh.shader?.destroy(false);
    this.mesh.destroy();
    this.source?.destroy();
    this.mesh = null;
    this.source = null;
  }

  /** L'état des tuiles de la fenêtre, lu chunk par chunk, adouci, puis écrit dans la texture. */
  private paint(): void {
    const { width, height, left, top, states } = this;
    const fog = this.world.fog;

    states.fill(UNEXPLORED);
    for (let cy = floorDiv(top, CHUNK_TILES); cy <= floorDiv(top + height - 1, CHUNK_TILES); cy += 1) {
      for (let cx = floorDiv(left, CHUNK_TILES); cx <= floorDiv(left + width - 1, CHUNK_TILES); cx += 1) {
        const chunk = fog.chunk(cx, cy);

        if (!chunk) continue;

        const x0 = Math.max(left, cx * CHUNK_TILES);
        const x1 = Math.min(left + width, (cx + 1) * CHUNK_TILES);
        const y0 = Math.max(top, cy * CHUNK_TILES);
        const y1 = Math.min(top + height, (cy + 1) * CHUNK_TILES);

        for (let y = y0; y < y1; y += 1) {
          const row = (y - cy * CHUNK_TILES) * CHUNK_TILES - cx * CHUNK_TILES;
          const out = (y - top) * width - left;

          for (let x = x0; x < x1; x += 1) {
            const index = row + x;

            states[out + x] = chunk.seen[index]! > 0 ? 0 : chunk.explored[index] ? EXPLORED : UNEXPLORED;
          }
        }
      }
    }

    // Les régions de la fenêtre, lues une fois : elles ne bougent pas, seule leur conquête change.
    const { regionIds } = this;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;

        if (regionIds[index] === -1) regionIds[index] = this.world.regionAt(left + x, top + y);
      }
    }

    this.soften();

    const { pixels } = this;
    const strength = FOG_TINT.exploredAlpha;

    // R : la part d'inconnu ; G : le voile qui reste là où l'inconnu s'efface. Le shader compose.
    for (let index = 0; index < width * height; index += 1) {
      const at = index * 4;

      pixels[at] = Math.round(this.dark[index]! * 255);
      pixels[at + 1] = Math.round(Math.max(this.veil[index]! * strength, this.locked[index]! * FOG_TINT.regionAlpha) * 255);
      pixels[at + 3] = 255;
    }
    this.source!.update();
    this.mesh!.position.set(left * TILE_SIZE, top * TILE_SIZE);
    (this.uniforms.uniforms.uOrigin as Float32Array).set([left, top]);
    (this.uniforms.uniforms.uSize as Float32Array).set([width, height]);
    this.uniforms.update();
  }

  /**
   * Les deux champs — l'inconnu, le voile — adoucis d'un flou en tente
   * 3 × 3 : un coin de disque s'arrondit, une case seule ne fait pas un trou.
   */
  private soften(): void {
    const { width, height, states, dark, veil, locked, regionIds } = this;
    const { conquered } = this.world;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let unknown = 0;
        let hidden = 0;
        let weight = 0;
        let unconquered = 0;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;

          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;

            if (nx < 0 || nx >= width) continue;

            const w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
            const state = states[ny * width + nx]!;

            weight += w;
            if (state === UNEXPLORED) unknown += w;
            // Une case inconnue voile aussi : entre l'inconnu et le vu, il y a toujours le voile.
            if (state !== 0) hidden += w;
            if (!conquered.has(regionIds[ny * width + nx]!)) unconquered += w;
          }
        }
        dark[y * width + x] = unknown / weight;
        veil[y * width + x] = hidden / weight;
        locked[y * width + x] = unconquered / weight;
      }
    }
  }

  public destroy(): void {
    this.release();
    this.container.destroy({ children: true });
    this.clouds.destroy();
    this.program.destroy();
  }
}

/** `'#2b2d8f'` → [r, g, b] entre 0 et 1, pour un uniforme. */
function rgb(color: Color): Float32Array {
  const value = hex(color);

  return new Float32Array([((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]);
}
