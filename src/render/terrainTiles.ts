/**
 * Tileset du sol : les SVG de `art/terrain.ts`, rangés dans l'atlas.
 *
 * Ce module fait le lien entre les tuiles dessinées (variantes, transitions,
 * coins arrondis, ombres portées) et les textures de `SpriteLibrary` : il
 * déclare les images à rastériser au chargement, puis les retrouve par sol,
 * par côté, par coin.
 *
 * Choix d'une tuile, tout seedé : l'herbe n'a qu'un aplat, sans damier —
 * sa vie vient des taches, des brins et des chemins que le bake pose
 * par-dessus (`chunkLayer.ts`) ; les autres sols tirent une variante, la
 * sobre le plus souvent — un sol trop chargé fatigue l'œil et noie les
 * ressources. L'eau n'a pas de tuile : le bake pose sous elle la terre de
 * sa rive (`BlockTerrain.beneath`), et `waterLayer.ts` la peint par-dessus.
 */

import type { Texture } from 'pixi.js';
import { GROUND, type Color, type Ground } from '../data/artDirection.ts';
import {
  CONTAMINATION_TILES,
  CONTAMINATION_TONE,
  GROUND_TILES,
  MEADOW_PATCHES,
  MEADOW_SPRINKLES,
  PATCH_SIZE,
  SHADOW_SIZE,
  TRAIL_DOTS,
  TRAIL_WIDTH,
  cornerTile,
  edgeTile,
  shadowTile,
  type Corner,
  type MeadowSprinkle,
  type PatchTone,
  type Side,
} from '../art/terrain.ts';
import { hash3 } from '../core/rng.ts';
import type { ContaminationKind } from '../data/contamination.ts';
import { terrainAt, type TerrainKind } from '../sim/terrain.ts';
import type { SpriteLibrary, SvgSource } from './spriteLibrary.ts';

export type { Corner, Side };

export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
export const CORNERS: readonly Corner[] = ['tl', 'tr', 'bl', 'br'];

/** Décalage vers la tuile voisine de chaque côté. */
export const SIDE_OFFSET: Record<Side, readonly [number, number]> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};

/** Les deux voisins orthogonaux qui décident si un coin est saillant : vertical, puis horizontal. */
export const CORNER_SIDES: Record<Corner, readonly [Side, Side]> = {
  tl: ['top', 'left'],
  tr: ['top', 'right'],
  bl: ['bottom', 'left'],
  br: ['bottom', 'right'],
};

const GROUNDS = Object.keys(GROUND) as Ground[];
const TILE = 32;

/**
 * Couleurs de fond qu'un coin arrondi peut prendre : la base de chaque sol
 * à sec. L'herbe près d'un autre sol est toujours sa base : aucune tache ne
 * touche un autre sol (`chunkLayer.ts`).
 */
const CORNER_COLORS: Color[] = [
  ...GROUNDS.filter((ground) => ground !== 'water').map((ground) => GROUND[ground].base),
  ...Object.values(CONTAMINATION_TONE),
];

/** Les images du sol, à passer à `SpriteLibrary.load`. */
export function terrainSources(): SvgSource[] {
  const sources: SvgSource[] = [];
  const add = (key: string, svg: string, width = TILE, height = TILE): void => {
    sources.push({ key, svg, width, height });
  };

  for (const ground of GROUNDS) {
    if (ground !== 'water') GROUND_TILES[ground].forEach((svg, variant) => add(`terrain.${ground}.${variant}`, svg));
    for (const side of SIDES) {
      const svg = edgeTile(ground, side);

      if (svg) add(`terrain.edge.${ground}.${side}`, svg);
    }
    add(`terrain.shadow.${ground}`, shadowTile(ground), SHADOW_SIZE.width, SHADOW_SIZE.height);
  }
  for (const color of CORNER_COLORS) {
    for (const corner of CORNERS) add(`terrain.corner.${color}.${corner}`, cornerTile(color, corner));
  }
  for (const [kind, variants] of Object.entries(CONTAMINATION_TILES)) {
    variants.forEach((svg, variant) => add(`terrain.${kind}.${variant}`, svg));
  }
  for (const [name, svg] of Object.entries(MEADOW_PATCHES)) add(`terrain.patch.${name}`, svg, PATCH_SIZE.width, PATCH_SIZE.height);
  for (const [name, svg] of Object.entries(MEADOW_SPRINKLES)) add(`terrain.${name}`, svg, 14, 12);
  add('terrain.trail.outer', TRAIL_DOTS.outer, TRAIL_WIDTH.outer, TRAIL_WIDTH.outer);
  add('terrain.trail.inner', TRAIL_DOTS.inner, TRAIL_WIDTH.inner, TRAIL_WIDTH.inner);
  return sources;
}

export class TerrainTiles {
  private readonly library: SpriteLibrary;

  public constructor(library: SpriteLibrary) {
    this.library = library;
  }

  /**
   * La tuile d'un sol à sec. `roll` est un hachage seedé de la tuile :
   * il choisit la variante des sols qui en ont plusieurs.
   */
  public ground(ground: DryGround, roll: number): Texture {
    if (ground === 'grass') return this.library.texture('terrain.grass.0');
    // La roche a une quatrième variante, la fissure et sa touffe, sur une tuile de vingt.
    const variant = ground === 'rock' && roll % 20 === 19 ? 3 : variantOf(roll);

    return this.library.texture(`terrain.${ground}.${variant}`);
  }

  /** Transition dessinée sur une tuile de `owner`, du côté où la voisine est d'un autre sol. */
  public edge(owner: Ground, side: Side): Texture | null {
    return edgeTile(owner, side) ? this.library.texture(`terrain.edge.${owner}.${side}`) : null;
  }

  /** Coin arrondi, peint dans la couleur du sol voisin. */
  public corner(neighbour: DryGround, corner: Corner): Texture {
    return this.library.texture(`terrain.corner.${GROUND[neighbour].base}.${corner}`);
  }

  /** La tuile d'une terre polluée ou radioactive, posée sur le sol ; `roll` choisit sa variante. */
  public contamination(kind: ContaminationKind, roll: number): Texture {
    return this.library.texture(`terrain.${kind}.${variantOf(roll)}`);
  }

  /** Coin arrondi d'une tuile dont les deux voisines sont d'une même surface : sol à sec ou terre contaminée. */
  public surfaceCorner(neighbour: Surface, corner: Corner): Texture {
    const color = neighbour === 'polluted' || neighbour === 'radioactive' ? CONTAMINATION_TONE[neighbour] : GROUND[neighbour].base;

    return this.library.texture(`terrain.corner.${color}.${corner}`);
  }

  /** Un rond de terre battue (`outer`) ou de sa trace claire (`inner`). */
  public trail(part: 'outer' | 'inner'): Texture {
    return this.library.texture(`terrain.trail.${part}`);
  }

  /** Une tache de prairie : `PATCH_SIZE` px, à l'échelle que tire le bake. */
  public patch(tone: PatchTone, shape: number): Texture {
    return this.library.texture(`terrain.patch.${tone}.${shape}`);
  }

  /** Un brin ou une fleurette semé sur l'herbe. */
  public sprinkle(name: MeadowSprinkle): Texture {
    return this.library.texture(`terrain.${name}`);
  }

  /** Ombre portée pleine, dans la teinte foncée du sol ; `SHADOW_SIZE` px, à étirer. */
  public shadow(ground: Ground): Texture {
    return this.library.texture(`terrain.shadow.${ground}`);
  }
}

/** Un sol à sec : ce que le bake dessine. */
export type DryGround = Exclude<Ground, 'water'>;

/** Ce que l'œil voit d'une tuile : son sol à sec, ou la terre contaminée qui le recouvre. */
export type Surface = DryGround | ContaminationKind;

/**
 * Le sol d'un bloc de `size` tuiles et de sa marge, lu une fois depuis la
 * seed : la nature de chaque tuile, et la terre que le bake pose sous l'eau.
 */
export class BlockTerrain {
  private readonly kinds: TerrainKind[];
  private readonly span: number;
  private readonly margin: number;

  public constructor(seed: number, baseTx: number, baseTy: number, size: number, margin: number) {
    this.span = size + margin * 2;
    this.margin = margin;
    this.kinds = new Array<TerrainKind>(this.span * this.span);

    for (let ly = -margin; ly < size + margin; ly += 1) {
      for (let lx = -margin; lx < size + margin; lx += 1) {
        this.kinds[(ly + margin) * this.span + lx + margin] = terrainAt(seed, baseTx + lx, baseTy + ly);
      }
    }
  }

  /** Nature de la tuile en (lx, ly), coordonnées locales au bloc. */
  public kind(lx: number, ly: number): TerrainKind {
    return this.kinds[(ly + this.margin) * this.span + lx + this.margin]!;
  }

  /**
   * Le sol que le bake dessine en (lx, ly) : la tuile elle-même si elle est
   * à sec ; sous l'eau, la terre la plus présente parmi ses huit voisines —
   * le sable d'une plage, le plus souvent. Là où la rive arrondie du shader
   * se retire d'une tuile d'eau, c'est elle qui se montre. Regarde une tuile
   * autour : juste jusqu'à `margin - 1` tuiles du bloc.
   */
  public beneath(lx: number, ly: number): DryGround {
    const kind = this.kind(lx, ly);

    if (kind !== 'water') return kind;

    const counts: Record<DryGround, number> = { sand: 0, grass: 0, rock: 0 };

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const near = this.kind(lx + dx, ly + dy);

        if (near !== 'water') counts[near] += 1;
      }
    }
    // À égalité, et loin de toute rive, le sable.
    return counts.grass > counts.sand && counts.grass >= counts.rock ? 'grass' : counts.rock > counts.sand ? 'rock' : 'sand';
  }
}

/** Le hachage seedé d'une tuile qui choisit sa variante de sol : le même au bake et pour l'eau animée. */
export function groundRoll(seed: number, tx: number, ty: number): number {
  return hash3(seed ^ 0x6a09e667, tx, ty);
}

/** Variante d'un sol à trois tuiles : la sobre sept fois sur dix. */
export function variantOf(roll: number): number {
  const value = roll % 20;

  if (value < 14) return 0;
  return value < 17 ? 1 : 2;
}
