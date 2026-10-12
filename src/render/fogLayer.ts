/**
 * Le brouillard de guerre : un seul voile, une texture minuscule agrandie.
 *
 * La simulation dit l'état de chaque case (`sim/fog.ts`) ; ici, on le
 * peint. Un texel par tuile, sur la fenêtre de tuiles qui couvre l'écran
 * plus une marge : indigo plein sur l'inconnu (`FOG_TINT.unexplored`), voile
 * indigo à demi sur ce qui est exploré hors de vue (`FOG_TINT.explored`),
 * rien sur ce qui est vu ; un voile plus léger sur une région pas encore
 * conquise (`FOG_TINT.regionAlpha`), même vue. La texture est adoucie d'un flou en tente (1-2-1)
 * puis agrandie 32 fois en filtrage linéaire : les bords sont des fondus
 * d'une tuile ou deux, jamais des marches d'escalier — des coussins de
 * brume plutôt que des carrés.
 *
 * Pas de filtre ni de shader : une boucle sur quelques milliers de texels,
 * refaite seulement quand une case change d'état (`FogOfWar.revision`), qu'une
 * région est conquise (`World.regionRevision`), ou
 * que l'écran sort de la fenêtre, puis un envoi de texture. Brouillard levé
 * (réglage de débogage), le voile est caché et ne coûte rien.
 */

import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import { CHUNK_TILES, TILE_SIZE, floorDiv } from '../core/grid.ts';
import { hex } from '../data/artDirection.ts';
import { FOG_TINT } from '../data/fog.ts';
import type { World } from '../sim/world.ts';
import type { Camera } from './camera.ts';

/** Tuiles de marge autour de l'écran : la caméra glisse sans refaire la texture à chaque pas. */
const MARGIN = 8;
/** Les côtés de la fenêtre s'arrondissent à ce multiple : un pinch ne recrée pas la texture à chaque image. */
const STEP = 16;

const UNEXPLORED = 2;
const EXPLORED = 1;

export class FogLayer {
  public readonly container = new Container();

  private readonly world: World;
  private readonly sprite = new Sprite();
  private canvas: HTMLCanvasElement | null = null;
  private source: CanvasSource | null = null;
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

  private readonly unexplored = rgb(hex(FOG_TINT.unexplored));
  private readonly explored = rgb(hex(FOG_TINT.explored));

  public constructor(world: World) {
    this.world = world;
    this.sprite.scale.set(TILE_SIZE);
    this.container.addChild(this.sprite);
  }

  public update(camera: Camera): void {
    const fog = this.world.fog;

    this.container.visible = fog.enabled;
    if (!fog.enabled) return;

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
    if (width === this.width && height === this.height && this.canvas) return;
    this.width = width;
    this.height = height;
    this.states = new Uint8Array(width * height);
    this.dark = new Float32Array(width * height);
    this.veil = new Float32Array(width * height);
    this.locked = new Float32Array(width * height);
    this.regionIds = new Int16Array(width * height).fill(-1);

    this.source?.destroy();
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.source = new CanvasSource({
      resource: this.canvas,
      scaleMode: 'linear',
      autoGenerateMipmaps: false,
      // `putImageData` écrit des couleurs droites : prémultipliées à l'envoi, un texel transparent n'éclaircit rien.
      alphaMode: 'premultiply-alpha-on-upload',
    });
    this.sprite.texture.destroy();
    this.sprite.texture = new Texture({ source: this.source });
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

    const context = this.canvas!.getContext('2d')!;
    const image = context.createImageData(width, height);
    const pixels = image.data;
    const strength = FOG_TINT.exploredAlpha;

    for (let index = 0; index < width * height; index += 1) {
      const dark = this.dark[index]!;
      const veil = Math.max(this.veil[index]! * strength, this.locked[index]! * FOG_TINT.regionAlpha);
      const alpha = dark + veil * (1 - dark);
      const mix = alpha > 0 ? dark / alpha : 0;
      const at = index * 4;

      pixels[at] = this.explored[0] + (this.unexplored[0] - this.explored[0]) * mix;
      pixels[at + 1] = this.explored[1] + (this.unexplored[1] - this.explored[1]) * mix;
      pixels[at + 2] = this.explored[2] + (this.unexplored[2] - this.explored[2]) * mix;
      pixels[at + 3] = Math.round(alpha * 255);
    }
    context.putImageData(image, 0, 0);
    this.source!.update();
    this.sprite.position.set(this.left * TILE_SIZE, this.top * TILE_SIZE);
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
    this.container.destroy({ children: true });
    this.source?.destroy();
  }
}

function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}
