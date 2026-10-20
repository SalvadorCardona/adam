/**
 * L'identité du jeu : l'icône (favicon, PWA) et la bannière du README.
 *
 * Deux scènes composées avec les sprites du jeu (`embed`), sur le damier
 * d'herbe : ce qu'on voit sur l'écran d'accueil du téléphone et en tête du
 * dépôt est exactement ce qu'on voit en jouant. Aucun texte ici — le titre
 * de la bannière est posé par l'outil qui la rastérise (`tools/brand.ts`),
 * dans la police du jeu.
 *
 * Et le logo « Adam » de l'écran titre, dessiné en capsules (`titleLogo`) ;
 * sa scène est dans `titleScene.ts`, qui reprend les outils de composition
 * d'ici (`place`, `building`, `shadow`).
 *
 * Coordonnées en pixels monde ; l'outil agrandit à la taille finale.
 */

import {
  GROUND,
  PALETTE,
  circle,
  embed,
  flower,
  group,
  leaf,
  pill,
  polyline,
  rect,
  ring,
  shape,
  svg,
  type Color,
} from '../data/artDirection.ts';
import { ADAM } from './adam.ts';
import { DECOR_ART } from './decor.ts';
import { MUTANT } from './mutant.ts';
import { ROCK_IRON, ROCK_STONE } from './rocks.ts';
import { TOWN_HALL } from './townHall.ts';
import { TREE, TREE_DEAD, TREE_PINE } from './trees.ts';
import { WATCHTOWER } from './watchtower.ts';

const TILE = 32;

/** Le damier doux de l'herbe sur `columns × rows` tuiles. */
function checker(columns: number, rows: number): string {
  let squares = rect(0, 0, columns * TILE, rows * TILE, GROUND.grass.base, 0);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if ((x + y) % 2 === 1) squares += rect(x * TILE, y * TILE, TILE, TILE, GROUND.grass.alt, 0);
    }
  }
  return squares;
}

/** Une ombre portée pleine, dans la teinte foncée de l'herbe. */
export function shadow(cx: number, cy: number, w: number): string {
  return pill(cx - w / 2 + 3, cy - w * 0.15 + 2, w, w * 0.3, GROUND.grass.shade);
}

export interface Anchored {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

/** Un élément de scène, trié par son pied : ce qui est plus bas passe devant, comme en jeu. */
export interface Placed {
  y: number;
  svg: string;
}

/** Un sprite posé par son ancre en (x, y), agrandi de `scale`, avec son ombre. */
export function place(sprite: Anchored, part: string, x: number, y: number, shadowWidth = 0, scale = 1): Placed {
  return {
    y,
    svg:
      (shadowWidth > 0 ? shadow(x, y, shadowWidth * scale) : '') +
      embed(part, x - sprite.anchorX * sprite.width * scale, y - sprite.anchorY * sprite.height * scale, scale),
  };
}

/** Un bâtiment (ancre (0, 1)) centré en x, le bas de l'emprise en y. */
export function building(sprite: Anchored & { parts: { built: string } }, cx: number, y: number, scale = 1): Placed {
  return {
    y,
    svg: shadow(cx, y - 5, sprite.width * scale * 0.9) + embed(sprite.parts.built, cx - (sprite.width * scale) / 2, y - sprite.height * scale, scale),
  };
}

export function scene(items: readonly Placed[]): string {
  return [...items].sort((a, b) => a.y - b.y).map((item) => item.svg).join('');
}

/**
 * L'icône : la mairie, son drapeau, deux arbres, sur l'herbe — carrée, pleine
 * jusqu'aux bords (PWA « maskable » : l'essentiel tient dans le cercle central).
 */
export function brandIcon(): string {
  const size = 128;

  return svg(
    size,
    size,
    checker(4, 4),
    scene([
      place(TREE, TREE.parts.full, 18, 88, 26),
      place(TREE_PINE, TREE_PINE.parts.full, 112, 84, 22),
      building(TOWN_HALL, 64, 116, 0.78),
      { y: 120, svg: flower(18, 112, 'coral') + flower(110, 110, 'yellow') },
    ]),
  );
}

/**
 * La bannière, 2 × 1 : la clairière de la maquette — la mairie, la tour de
 * guet, Adam et son arc, un mutant qui arrive dans son halo, la forêt,
 * l'étang, un chemin de sable, une ruine qui fleurit. La gauche reste
 * dégagée pour le titre.
 */
export function brandBanner(): string {
  const columns = 16;
  const rows = 8;
  const width = columns * TILE;
  const height = rows * TILE;

  // L'étang, en haut à droite, en trois tons comme sur la maquette.
  const pond =
    rect(424, 14, 104, 64, GROUND.water.shade, 28) +
    rect(424, 14, 104, 56, GROUND.water.base, 28) +
    pill(440, 26, 44, 7, GROUND.water.light) +
    pill(470, 48, 30, 6, GROUND.water.light) +
    circle(504, 32, 6, PALETTE.mint.base);

  // Le chemin de sable, en bas, bordé de son liseré clair.
  const path =
    rect(-20, 228, width + 40, 40, GROUND.sand.light, 20) + rect(-20, 232, width + 40, 40, GROUND.sand.base, 20);

  // Adam, de profil, l'arc tendu vers le mutant ; le mutant, tourné vers lui, dans son halo.
  const adam = (x: number, y: number): Placed => ({
    y,
    svg: [ADAM.parts.foot, ADAM.parts.side, ADAM.parts.bow]
      .map((part, i) => place(ADAM, part, x, y, i === 0 ? 22 : 0).svg)
      .join(''),
  });
  const mutant = (x: number, y: number): Placed => ({
    y,
    svg:
      circle(x, y - 12, 16, GROUND.grass.light) +
      shadow(x, y, 22) +
      group(`translate(${x * 2} 0) scale(-1 1)`, place(MUTANT, MUTANT.parts.foot, x, y).svg, place(MUTANT, MUTANT.parts.side, x, y).svg),
  });

  return svg(
    width,
    height,
    checker(columns, rows),
    pond,
    path,
    scene([
      building(TOWN_HALL, 282, 196),
      building(WATCHTOWER, 386, 184),
      place(DECOR_ART, DECOR_ART.parts.ruin, 196, 150),
      place(DECOR_ART, DECOR_ART.parts.flowers, 214, 210),
      place(DECOR_ART, DECOR_ART.parts.flowers, 420, 212),
      place(ROCK_STONE, ROCK_STONE.parts.full, 200, 224, 30),
      place(ROCK_IRON, ROCK_IRON.parts.full, 452, 116, 30),
      place(TREE, TREE.parts.full, 34, 208, 30),
      place(TREE_PINE, TREE_PINE.parts.full, 96, 250, 26),
      place(TREE_PINE, TREE_PINE.parts.full, 494, 150, 26),
      place(TREE_DEAD, TREE_DEAD.parts.full, 492, 226, 26),
      place(TREE, TREE.parts.full, 160, 262, 30),
      adam(338, 222),
      mutant(446, 224),
    ]),
  );
}

/* ------------------------------------------------------------- le logo */

const LOGO = { width: 432, height: 180, baseline: 150, stroke: 28, depth: 12 } as const;

/** Un bras de lettre : une capsule d'un point à l'autre, épaisse de `stroke`. */
function limb(x1: number, y1: number, x2: number, y2: number, color: Color): string {
  const t = LOGO.stroke;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

  return group(`translate(${x1} ${y1}) rotate(${Math.round(angle * 100) / 100})`, pill(-t / 2, -t / 2, length + t, t, color));
}

/** Une arche (le ∩ d'un « m ») : deux jambes et la voûte, d'une seule épaisseur, aux pieds arrondis. */
function arch(left: number, top: number, w: number, bottom: number, color: Color): string {
  const t = LOGO.stroke;
  const R = w / 2;
  const r = R - t;
  const d = `M${left} ${bottom}V${top + R}A${R} ${R} 0 0 1 ${left + w} ${top + R}V${bottom}H${left + w - t}V${top + R}A${r} ${r} 0 0 0 ${left + t} ${top + R}V${bottom}Z`;

  return shape(d, color) + circle(left + t / 2, bottom, t / 2, color) + circle(left + w - t / 2, bottom, t / 2, color);
}

/** Les quatre lettres d'« Adam », d'une seule couleur : le logo les pose trois fois, du fond vers l'avant. */
function logoLetters(color: Color): string {
  const t = LOGO.stroke;
  const base = LOGO.baseline - t / 2;
  const bowl = (cx: number): string => ring(cx, base - 26, 40, 40, t - 2, color);

  return (
    // A : deux jambes qui se rejoignent au sommet, la barre au milieu.
    limb(66, 30, 22, base, color) +
    limb(66, 30, 110, base, color) +
    pill(36, 98, 62, 24, color) +
    // d : la panse et la haute hampe.
    bowl(176) +
    pill(190, 18, t, base - 18 + t / 2, color) +
    // a : la panse et sa hampe courte.
    bowl(264) +
    pill(278, base - 66, t, 66 + t / 2, color) +
    // m : deux arches qui partagent leur jambe du milieu.
    arch(318, base - 66, 70, base, color) +
    arch(318 + 70 - t, base - 66, 70, base, color)
  );
}

/**
 * Le logo « Adam » : des lettres en capsules, jaunes sur leur face orange,
 * posées sur une épaisseur indigo — les volumes de la DA, pas une police — et
 * une liane qui s'enroule sur la jambe du A, une fleur au sommet.
 */
export function titleLogo(): string {
  const { width: W, height: H, depth } = LOGO;
  const shine =
    group('translate(66 30) rotate(116.6)', pill(4, -8, 34, 6, PALETTE.yellow.light)) +
    pill(150, 92, 20, 6, PALETTE.yellow.light) +
    pill(196, 30, 7, 30, PALETTE.yellow.light) +
    pill(238, 92, 20, 6, PALETTE.yellow.light) +
    pill(330, 94, 7, 22, PALETTE.yellow.light) +
    pill(330, 92, 22, 6, PALETTE.yellow.light);
  // La liane : elle part du pied gauche du A et monte en s'enroulant autour de sa jambe.
  const coil: number[] = [];

  for (let i = 0; i <= 3; i += 1) {
    const s = 0.08 + (i / 3) * 0.7;
    const x = 22 + (66 - 22) * s;
    const y = LOGO.baseline - LOGO.stroke / 2 - (LOGO.baseline - LOGO.stroke / 2 - 30) * s;

    coil.push(Math.round(x + (i % 2 === 0 ? -18 : 18)), Math.round(y));
  }
  let leaves = '';

  for (let i = 0; i < coil.length / 2; i += 1) leaves += leaf(coil[i * 2]!, coil[i * 2 + 1]!, i % 2 === 0 ? 200 : -20, 2.6);

  return svg(
    W,
    H,
    group(`translate(0 ${depth})`, logoLetters(PALETTE.ink.base)),
    group(`translate(0 ${depth / 2})`, logoLetters(PALETTE.yellow.shade)),
    logoLetters(PALETTE.yellow.base),
    shine,
    polyline(coil, PALETTE.mint.shade),
    leaves,
    flower(66, 14, 'coral', 3.2),
    leaf(60, 22, 200, 2),
  );
}
