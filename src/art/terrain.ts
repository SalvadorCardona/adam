/**
 * Le sol : tuiles, transitions, coins et ombres portées.
 *
 * Vue de dessus en 3/4 :
 * - l'**herbe** est une prairie continue, sans damier ni contour de case :
 *   un aplat, sur lequel le bake pose de grandes taches aux bords ronds,
 *   plus claires ou plus denses (`MEADOW_PATCHES`), des brins et des
 *   fleurettes semés hors de la grille (`MEADOW_SPRINKLES`), et les chemins
 *   de terre battue de la ville (`TRAIL_DOTS`). La grille ne se montre
 *   qu'en mode construction (`render/ghostLayer.ts`) ;
 * - le **sable** a un liseré clair côté lumière, là où il touche un autre sol ;
 * - l'**eau** n'est pas une tuile : le bake pose sous elle la terre de la
 *   rive, et un shader la peint par-dessus, au pixel près — rive arrondie,
 *   profondeur en dégradé, écume, crêtes (`render/waterShader.ts`) ;
 * - la **roche** est un plateau : dessus pâle, face avant sombre en bas,
 *   liseré clair en haut.
 * Là où un sol s'avance dans un autre, son coin s'arrondit (`corner`) : les
 * plateaux ont les angles doux des autres formes du jeu.
 *
 * - les plaques de terre contaminée ont les mêmes coins arrondis que les
 *   sols : `cornerTile` en leur ton (`CONTAMINATION_TONE`), saillants comme
 *   rentrants ;
 * - la terre **polluée** (violet sombre, bulles claires) et la terre
 *   **radioactive** (orange sombre, trèfle d'avertissement jaune) se posent par
 *   dessus le sol (`CONTAMINATION_TILES`) : deux teintes, deux motifs, qu'on
 *   ne confond ni entre elles ni avec la roche pâle, même à petite taille.
 *
 * Chaque tuile est un SVG de 32 × 32, bakée avec les autres dans la texture
 * du chunk (`render/chunkLayer.ts`).
 */

import { GROUND, PALETTE, circle, ellipse, group, pill, rect, shape, svg, type Color, type Ground } from '../data/artDirection.ts';
import type { ContaminationKind } from '../data/contamination.ts';

const T = 32;

/**
 * Rayon des coins arrondis entre deux sols : une demi-tuile. Une rive en
 * biais, qui avance d'une case à chaque rangée, devient une vague — l'arc
 * saillant d'une marche rejoint le suivant —, jamais un escalier.
 */
export const CORNER_RADIUS = 16;

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

function tile(...body: string[]): string {
  return svg(T, T, ...body);
}

function flat(ground: Ground, tone: 'base' | 'alt' = 'base'): string {
  return rect(0, 0, T, T, GROUND[ground][tone], 0);
}

/**
 * Les variantes de chaque sol. L'herbe n'en a qu'une, un aplat : ce qui la
 * fait vivre est posé par-dessus, sans suivre les cases. Les autres en ont
 * trois, tirées par tuile — la première, sobre, le plus souvent. L'eau n'est
 * jamais bakée : son aplat ne sert qu'à la planche.
 */
export const GROUND_TILES: Record<Ground, readonly string[]> = {
  grass: [tile(flat('grass'))],
  sand: [
    tile(flat('sand')),
    tile(flat('sand'), pill(18, 20, 9, 2.4, GROUND.sand.alt)),
    tile(flat('sand'), pill(5, 10, 12, 2.6, GROUND.sand.light), pill(15, 22, 8, 2.4, GROUND.sand.light)),
  ],
  water: [tile(flat('water'))],
  rock: [
    tile(flat('rock')),
    // Pas d'aplat d'un autre ton : des carrés de teinte voisine feraient un damier.
    tile(flat('rock'), pill(16, 18, 10, 3, GROUND.rock.alt), circle(9, 10, 2, GROUND.rock.alt)),
    tile(flat('rock'), rect(6, 8, 14, 10, GROUND.rock.alt, 4), pill(8, 9.5, 6, 2, GROUND.rock.light)),
  ],
};

/** Un secteur de 60° du trèfle d'avertissement, de rayon `r`, centré en (cx, cy), à partir de `start` degrés. */
function trefoilBlade(cx: number, cy: number, r: number, start: number): string {
  const point = (angle: number): string => {
    const rad = (angle * Math.PI) / 180;

    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy + r * Math.sin(rad)).toFixed(2)}`;
  };

  return shape(`M${cx} ${cy}L${point(start)}A${r} ${r} 0 0 1 ${point(start + 60)}Z`, PALETTE.yellow.base);
}

/** Le trèfle de la radioactivité : trois pales jaunes autour d'un moyeu indigo. */
function trefoil(cx: number, cy: number, r: number): string {
  return trefoilBlade(cx, cy, r, 30) + trefoilBlade(cx, cy, r, 150) + trefoilBlade(cx, cy, r, 270) + circle(cx, cy, r * 0.22, PALETTE.ink.base);
}

/**
 * Les tuiles des terres contaminées, trois variantes chacune, tirées par
 * tuile (`variantOf`) : la sobre le plus souvent, les deux autres pour la vie.
 * La polluée est une boue violette où crèvent des bulles ; la radioactive une
 * terre orange sombre, que marque de loin le trèfle jaune.
 */
export const CONTAMINATION_TILES: Record<ContaminationKind, readonly string[]> = {
  polluted: [
    tile(rect(0, 0, T, T, PALETTE.violet.shade, 0), circle(9, 10, 2.4, PALETTE.violet.base), circle(22, 21, 1.8, PALETTE.violet.base)),
    tile(rect(0, 0, T, T, PALETTE.violet.shade, 0), circle(20, 9, 4, PALETTE.violet.base), circle(19, 8, 1.4, PALETTE.violet.light), pill(5, 22, 10, 3, PALETTE.violet.base)),
    tile(rect(0, 0, T, T, PALETTE.violet.shade, 0), circle(10, 20, 5, PALETTE.violet.base), circle(8.6, 18.6, 1.6, PALETTE.violet.light), circle(24, 8, 2.2, PALETTE.violet.light)),
  ],
  radioactive: [
    tile(rect(0, 0, T, T, PALETTE.orange.shade, 0), circle(8, 9, 2.2, PALETTE.orange.base), circle(23, 22, 2.6, PALETTE.orange.base), pill(14, 14, 8, 2.4, PALETTE.orange.base)),
    tile(rect(0, 0, T, T, PALETTE.orange.shade, 0), trefoil(16, 16, 11)),
    tile(rect(0, 0, T, T, PALETTE.orange.shade, 0), trefoil(16, 16, 8), circle(5, 5, 1.8, PALETTE.orange.base), circle(27, 27, 1.8, PALETTE.orange.base)),
  ],
};

/** Le ton plein d'une terre contaminée : celui de ses coins arrondis, qui fondent la plaque dans le sol voisin. */
export const CONTAMINATION_TONE: Record<ContaminationKind, Color> = {
  polluted: PALETTE.violet.shade,
  radioactive: PALETTE.orange.shade,
};

/**
 * Transition dessinée **sur** une tuile de `owner`, du côté `side` où la
 * voisine est d'un autre sol. `null` : ce côté n'a rien à dessiner.
 */
export function edgeTile(owner: Ground, side: Side): string | null {
  switch (owner) {
    case 'sand':
      return side === 'top' ? tile(rect(0, 0, T, 4, GROUND.sand.light, 0)) : null;
    case 'rock':
      if (side === 'bottom') return tile(rect(0, 24, T, 8, GROUND.rock.shade, 0));
      if (side === 'top') return tile(rect(0, 0, T, 3, GROUND.rock.light, 0));
      return null;
    case 'water':
    case 'grass':
      return null;
  }
}

/**
 * Un coin arrondi : le quart de tuile hors du quart de rond, dans la
 * couleur du sol voisin. Posé sur un coin saillant, il arrondit la forme —
 * un plateau, une langue de sable.
 */
export function cornerTile(color: Color, corner: Corner): string {
  const r = CORNER_RADIUS;
  const paths: Record<Corner, string> = {
    tl: `M0 0H${r}A${r} ${r} 0 0 0 0 ${r}Z`,
    tr: `M${T} 0V${r}A${r} ${r} 0 0 0 ${T - r} 0Z`,
    bl: `M0 ${T}V${T - r}A${r} ${r} 0 0 0 ${r} ${T}Z`,
    br: `M${T} ${T}H${T - r}A${r} ${r} 0 0 0 ${T} ${T - r}Z`,
  };

  return tile(shape(paths[corner], color));
}

/** Largeur et hauteur de l'ombre portée de référence ; le rendu l'étire selon l'objet. */
export const SHADOW_SIZE = { width: 32, height: 10 } as const;

/** L'ombre portée : une capsule pleine dans la teinte foncée du sol. */
export function shadowTile(ground: Ground): string {
  return svg(SHADOW_SIZE.width, SHADOW_SIZE.height, pill(0, 0, SHADOW_SIZE.width, SHADOW_SIZE.height, GROUND[ground].shade));
}

/* ---------------------------------------------------------------- prairie */

/** Cadre d'une tache de prairie, en pixels monde : six tuiles sur quatre. */
export const PATCH_SIZE = { width: 192, height: 128 } as const;

/**
 * Les silhouettes des taches : des ellipses d'une seule couleur qui se
 * chevauchent — l'union fait un bord rond et irrégulier, jamais une case.
 * Chaque ellipse : centre x, centre y, rayon x, rayon y.
 */
const PATCH_SHAPES: readonly (readonly [number, number, number, number])[][] = [
  [
    [96, 64, 70, 40],
    [56, 56, 40, 30],
    [134, 76, 44, 30],
  ],
  [
    [90, 60, 56, 42],
    [138, 54, 38, 28],
    [70, 84, 46, 26],
  ],
  [
    [100, 70, 74, 34],
    [64, 52, 34, 26],
    [128, 50, 40, 28],
    [150, 84, 26, 20],
  ],
];

export type PatchTone = 'meadow' | 'thicket';

export const PATCH_TONES: readonly PatchTone[] = ['meadow', 'thicket'];

/** Nombre de silhouettes de tache : le bake en tire une par tache. */
export const PATCH_SHAPE_COUNT = PATCH_SHAPES.length;

function patch(ellipses: readonly (readonly [number, number, number, number])[], tone: PatchTone): string {
  return svg(PATCH_SIZE.width, PATCH_SIZE.height, ...ellipses.map(([cx, cy, rx, ry]) => ellipse(cx, cy, rx, ry, GROUND.grass[tone])));
}

/** Les taches de la prairie, `meadow.0`… `thicket.2` : posées sous tout le reste, à l'échelle que tire le bake. */
export const MEADOW_PATCHES: Readonly<Record<string, string>> = Object.fromEntries(
  PATCH_TONES.flatMap((tone) => PATCH_SHAPES.map((ellipses, i) => [`${tone}.${i}`, patch(ellipses, tone)])),
);

/** Un brin d'herbe : une capsule fine, inclinée autour de son pied. */
function blade(x: number, angle: number, length: number): string {
  return group(`rotate(${angle} ${x} 11)`, pill(x - 1, 11 - length, 2, length, GROUND.grass.shade));
}

/**
 * Ce que le bake sème sur l'herbe, à des places tirées de la seed qui ne
 * suivent pas la grille : deux touffes de brins, et des fleurettes —
 * trois points de couleur, la vie qui reprend. Cadres de 14 × 12, ancrés au milieu du pied.
 */
export const MEADOW_SPRINKLES = {
  'sprig.0': svg(14, 12, blade(5, -24, 7), blade(7, 0, 9), blade(9, 22, 7)),
  'sprig.1': svg(14, 12, blade(6, -14, 8), blade(9, 18, 6)),
  'speck.0': svg(
    14,
    12,
    circle(4, 7, 1.6, PALETTE.coral.base),
    circle(9, 4, 1.6, PALETTE.yellow.base),
    circle(10, 9, 1.4, PALETTE.violet.light),
  ),
  'speck.1': svg(14, 12, circle(5, 5, 1.6, PALETTE.paper.base), circle(9, 8, 1.6, PALETTE.yellow.base), circle(4, 9.5, 1.2, PALETTE.coral.light)),
} as const;

export type MeadowSprinkle = keyof typeof MEADOW_SPRINKLES;

/**
 * Les chemins de terre battue : un trait épais tamponné en ronds le long
 * d'une courbe — leur union fait une capsule qui tourne —, et la trace plus
 * claire du milieu, là où l'on marche. Diamètres en pixels monde.
 */
export const TRAIL_WIDTH = { outer: 16, inner: 5 } as const;

export const TRAIL_DOTS = {
  outer: svg(TRAIL_WIDTH.outer, TRAIL_WIDTH.outer, circle(TRAIL_WIDTH.outer / 2, TRAIL_WIDTH.outer / 2, TRAIL_WIDTH.outer / 2, GROUND.grass.trail)),
  inner: svg(TRAIL_WIDTH.inner, TRAIL_WIDTH.inner, circle(TRAIL_WIDTH.inner / 2, TRAIL_WIDTH.inner / 2, TRAIL_WIDTH.inner / 2, GROUND.grass.trailLight)),
} as const;
