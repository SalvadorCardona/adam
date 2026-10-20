/**
 * Bibliothèque de sprites : des SVG → un atlas de textures.
 *
 * C'est le seul endroit qui sait d'où viennent les textures. Au chargement,
 * chaque morceau de `data/sprites.ts` et chaque tuile de sol de
 * `art/terrain.ts` est rastérisé **une fois**, à la résolution de l'écran
 * (`devicePixelRatio`, plafonné), et rangé dans un atlas : quelques grandes
 * textures plutôt que deux cents petites. Pixi batche alors les sprites qui
 * partagent une page d'atlas en un seul appel de dessin.
 *
 * Le SVG n'est jamais rastérisé plus petit que l'écran puis agrandi : on
 * réécrit sa taille intrinsèque à la taille finale en pixels, pour que
 * Safari, qui rastérise une image SVG à sa taille déclarée, la rende nette.
 *
 * Les textures ont la taille du cadre en **pixels monde** : un sprite n'a pas
 * d'échelle à appliquer, quelle que soit la densité de l'écran.
 */

import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { SPRITES, SPRITE_IDS, type PartOf, type SpriteId, type SpriteProto } from '../data/sprites.ts';

/** Largeur d'une page d'atlas, en pixels ; la hauteur suit, jusqu'à `MAX_PAGE`. */
const PAGE_WIDTH = 2048;
const MAX_PAGE = 4096;
/** Marge entre deux images : le filtrage linéaire ne bave pas sur la voisine. */
const GUTTER = 2;
/** Au-delà, la mémoire d'un téléphone paie plus que l'œil ne gagne. */
const MAX_RESOLUTION = 3;

/** Une image à ranger : une clé, son SVG, son cadre en pixels monde. */
export interface SvgSource {
  key: string;
  svg: string;
  width: number;
  height: number;
}

/** Ce que coûte l'atlas — le panneau de debug l'affiche. */
export interface AtlasStats {
  /** Nombre de pages, donc de textures GPU. */
  pages: number;
  images: number;
  /** Pixels de toutes les pages, en millions. */
  megapixels: number;
  resolution: number;
  /** Temps de rastérisation et de rangement au chargement. */
  ms: number;
}

interface Slot {
  source: SvgSource;
  image: HTMLImageElement;
  pw: number;
  ph: number;
}

/** Résolution de rastérisation : celle de l'écran, entre 1 et `MAX_RESOLUTION`. */
export function screenResolution(): number {
  return Math.min(MAX_RESOLUTION, Math.max(1, window.devicePixelRatio || 1));
}

export class SpriteLibrary {
  private readonly textures = new Map<string, Texture>();
  private readonly sources: CanvasSource[] = [];
  /** Les pages recomposées après le chargement, par sprite (l'apparence d'Adam) : elles remplacent ses morceaux d'origine. */
  private readonly dressed = new Map<string, CanvasSource[]>();
  public stats: AtlasStats = { pages: 0, images: 0, megapixels: 0, resolution: 1, ms: 0 };

  private constructor() {}

  /** Tous les sprites du registre, plus les images supplémentaires (tuiles de sol). */
  public static async load(extra: readonly SvgSource[], resolution = screenResolution()): Promise<SpriteLibrary> {
    return SpriteLibrary.of([...spriteSources(), ...extra], resolution);
  }

  /** Ces seules images, hors du registre : la scène de l'écran titre. */
  public static async of(sources: readonly SvgSource[], resolution: number): Promise<SpriteLibrary> {
    const started = performance.now();
    const library = new SpriteLibrary();
    const slots = await Promise.all(sources.map((source) => rasterize(source, resolution)));

    library.pack(slots, resolution);
    library.stats = {
      pages: library.sources.length,
      images: slots.length,
      megapixels: library.sources.reduce((sum, source) => sum + source.pixelWidth * source.pixelHeight, 0) / 1e6,
      resolution,
      ms: Math.round(performance.now() - started),
    };
    return library;
  }

  /** La texture d'une clé quelconque (`terrain.grass.0`, `adam.down`…). */
  public texture(key: string): Texture {
    const texture = this.textures.get(key);

    if (!texture) throw new Error(`SpriteLibrary : image « ${key} » introuvable`);
    return texture;
  }

  /** La texture d'un morceau de sprite. */
  public part<S extends SpriteId>(id: S, part: PartOf<S>): Texture {
    return this.texture(`${id}.${part}`);
  }

  /**
   * Recompose des morceaux d'un sprite — l'apparence d'Adam, quand il se
   * change : ils sont rastérisés à part (quelques images, une petite page),
   * puis `install()` les met à la place des anciens sous les mêmes clés. Le
   * rendu reprend alors ses textures, puis appelle ce qu'`install()` rend :
   * la page d'avant se libère. Une recomposition dépassée par une plus
   * récente n'est jamais installée : elle part au ramasse-miettes.
   */
  public async dress(id: SpriteId, parts: Readonly<Record<string, string>>): Promise<{ install: () => () => void }> {
    const proto: SpriteProto = SPRITES[id];
    const { resolution } = this.stats;
    const slots = await Promise.all(
      Object.entries(parts).map(([part, svg]) => rasterize({ key: `${id}.${part}`, svg, width: proto.width, height: proto.height }, resolution)),
    );

    return {
      install: () => {
        const previous = this.dressed.get(id) ?? [];
        const stale = slots
          .map(({ source }) => this.textures.get(source.key))
          .filter((texture): texture is Texture => texture !== undefined && previous.includes(texture.source as CanvasSource));
        const before = this.sources.length;

        this.pack(slots, resolution);
        this.dressed.set(id, this.sources.splice(before));

        return () => {
          for (const texture of stale) texture.destroy(false);
          for (const source of previous) source.destroy();
        };
      },
    };
  }

  /** Rangement en étagères, les plus hautes d'abord : simple, et bien assez dense ici. */
  private pack(slots: Slot[], resolution: number): void {
    // Une image plus large qu'une page (la colline de l'écran titre) l'élargit d'autant.
    const width = Math.max(PAGE_WIDTH, ...slots.map((slot) => slot.pw + 2 * GUTTER));
    const sorted = [...slots].sort((a, b) => b.ph - a.ph);
    let placed: { slot: Slot; x: number; y: number }[] = [];
    let x = GUTTER;
    let y = GUTTER;
    let shelf = 0;

    const flush = (): void => {
      if (placed.length === 0) return;
      this.page(placed, width, y + shelf + GUTTER, resolution);
      placed = [];
      x = GUTTER;
      y = GUTTER;
      shelf = 0;
    };

    for (const slot of sorted) {
      if (x + slot.pw + GUTTER > width) {
        x = GUTTER;
        y += shelf + GUTTER;
        shelf = 0;
      }
      if (y + slot.ph + GUTTER > MAX_PAGE) flush();
      placed.push({ slot, x, y });
      x += slot.pw + GUTTER;
      shelf = Math.max(shelf, slot.ph);
    }
    flush();
  }

  /** Dessine une page d'atlas et découpe ses textures. */
  private page(placed: { slot: Slot; x: number; y: number }[], width: number, height: number, resolution: number): void {
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = Math.ceil(height);

    const context = canvas.getContext('2d');

    if (!context) throw new Error('SpriteLibrary : canvas 2D indisponible');

    // La source d'abord : sa taille repasse par la résolution, et un arrondi
    // (1558 px relus 1558,0000000000002) lui fait redimensionner le canvas —
    // ce qui l'efface. Dessinée après, la page reste pleine.
    const source = new CanvasSource({ resource: canvas, resolution, scaleMode: 'linear', autoGenerateMipmaps: false });

    for (const { slot, x, y } of placed) context.drawImage(slot.image, x, y, slot.pw, slot.ph);

    this.sources.push(source);

    for (const { slot, x, y } of placed) {
      const { key, width: w, height: h } = slot.source;

      this.textures.set(
        key,
        new Texture({ source, frame: new Rectangle(x / resolution, y / resolution, w, h) }),
      );
    }
  }

  public destroy(): void {
    for (const texture of this.textures.values()) texture.destroy(false);
    for (const source of [...this.sources, ...[...this.dressed.values()].flat()]) source.destroy();
    this.textures.clear();
    this.sources.length = 0;
    this.dressed.clear();
  }
}

/** Chaque morceau de chaque sprite, sous la clé `id.morceau`. */
function spriteSources(): SvgSource[] {
  return SPRITE_IDS.flatMap((id) => {
    const proto: SpriteProto = SPRITES[id];

    return Object.entries(proto.parts).map(([part, svg]) => ({
      key: `${id}.${part}`,
      svg,
      width: proto.width,
      height: proto.height,
    }));
  });
}

/** Charge un SVG en image, à sa taille finale en pixels. */
async function rasterize(source: SvgSource, resolution: number): Promise<Slot> {
  const pw = Math.ceil(source.width * resolution);
  const ph = Math.ceil(source.height * resolution);
  const sized = source.svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${pw}" height="${ph}"`);
  const image = new Image(pw, ph);

  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  await image.decode();
  return { source, image, pw, ph };
}
