/**
 * L'identité du jeu : l'icône (favicon, PWA) et la bannière du README.
 *
 * Deux scènes composées avec les sprites du jeu (`embed`), sur le damier
 * d'herbe : ce qu'on voit sur l'écran d'accueil du téléphone et en tête du
 * dépôt est exactement ce qu'on voit en jouant. Aucun texte ici — le titre
 * de la bannière est posé par l'outil qui la rastérise (`tools/brand.ts`),
 * dans la police du jeu.
 *
 * Et l'écran titre : son key art en trois plans (`titleScene`) et le logo
 * « Adam » dessiné en capsules (`titleLogo`).
 *
 * Coordonnées en pixels monde ; l'outil agrandit à la taille finale.
 */

import {
  GROUND,
  PALETTE,
  circle,
  curve,
  ellipse,
  embed,
  flag,
  flower,
  group,
  leaf,
  line,
  pill,
  polyline,
  rect,
  ring,
  shadedBlock,
  shadedCircle,
  shape,
  svg,
  vine,
  windowPane,
  type Color,
} from '../data/artDirection.ts';
import { ADAM } from './adam.ts';
import { CARGO_BIKE } from './cargoBike.ts';
import { DECOR_ART } from './decor.ts';
import { MUTANT } from './mutant.ts';
import { RUIN_SPRITE } from './ruin.ts';
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
function shadow(cx: number, cy: number, w: number): string {
  return pill(cx - w / 2 + 3, cy - w * 0.15 + 2, w, w * 0.3, GROUND.grass.shade);
}

interface Anchored {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

/** Un élément de scène, trié par son pied : ce qui est plus bas passe devant, comme en jeu. */
interface Placed {
  y: number;
  svg: string;
}

/** Un sprite posé par son ancre en (x, y), agrandi de `scale`, avec son ombre. */
function place(sprite: Anchored, part: string, x: number, y: number, shadowWidth = 0, scale = 1): Placed {
  return {
    y,
    svg:
      (shadowWidth > 0 ? shadow(x, y, shadowWidth * scale) : '') +
      embed(part, x - sprite.anchorX * sprite.width * scale, y - sprite.anchorY * sprite.height * scale, scale),
  };
}

/** Un bâtiment (ancre (0, 1)) centré en x, le bas de l'emprise en y. */
function building(sprite: Anchored & { parts: { built: string } }, cx: number, y: number, scale = 1): Placed {
  return {
    y,
    svg: shadow(cx, y - 5, sprite.width * scale * 0.9) + embed(sprite.parts.built, cx - (sprite.width * scale) / 2, y - sprite.height * scale, scale),
  };
}

function scene(items: readonly Placed[]): string {
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

/* ------------------------------------------------------- l'écran titre */

/** Le cadre du key art de l'écran titre, en pixels monde : ses trois plans le partagent. */
export const TITLE_ART = { width: 800, height: 900 } as const;

/** Une guirlande de lampions : un fil qui ploie entre deux points, des lanternes rondes qui y pendent. */
function lanterns(x1: number, y1: number, x2: number, y2: number, count: number): string {
  const sag = 16;
  const midX = (x1 + x2) / 2;
  const midY = Math.max(y1, y2) + sag;
  const tones = ['yellow', 'orange', 'coral'] as const;
  let out = curve(`M${x1} ${y1}Q${midX} ${midY + sag} ${x2} ${y2}`, PALETTE.ink.base);

  for (let i = 1; i <= count; i += 1) {
    const s = i / (count + 1);
    // Le point de la courbe de Bézier quadratique, là où pend la lanterne.
    const x = (1 - s) * (1 - s) * x1 + 2 * (1 - s) * s * midX + s * s * x2;
    const y = (1 - s) * (1 - s) * y1 + 2 * (1 - s) * s * (midY + sag) + s * s * y2;
    const tone = PALETTE[tones[i % tones.length]!];

    out += line(x, y, x, y + 4, PALETTE.ink.base) + rect(x - 5, y + 3, 10, 12, tone.shade, 5) + rect(x - 5, y + 3, 10, 9, tone.base, 5) + pill(x - 3, y + 5, 3, 4, tone.light);
  }
  return out;
}

/** Une ruine de l'ancienne ville, au loin : un immeuble violet arrondi, ses fenêtres, sa liane. */
function oldTower(x: number, base: number, w: number, h: number, windows: number): string {
  let out = shadedBlock(x, base - h, w, h, 8, 'violet', 12);

  for (let row = 0; row < windows; row += 1) {
    for (let col = 0; col < 2; col += 1) out += windowPane(x + 8 + col * (w / 2 - 2), base - h + 16 + row * 22, 9, 12, 'violet');
  }
  return out + vine([x + 4, base - 8, x + 8, base - h * 0.4, x + 4, base - h * 0.7], 3);
}

/**
 * Le ciel du soir : des bandes franches, du violet au jaune de l'horizon,
 * le soleil qui se couche derrière les collines, deux nuages et des étoiles.
 * Aucun dégradé : des aplats, comme une affiche.
 */
function titleSky(): string {
  const { width: W, height: H } = TITLE_ART;
  const bands = [
    [0, PALETTE.violet.base],
    [180, PALETTE.violet.light],
    [270, PALETTE.coral.light],
    [330, PALETTE.orange.light],
    [370, PALETTE.yellow.light],
  ] as const;
  let out = '';

  for (const [y, color] of bands) out += rect(-10, y, W + 20, H - y, color, 0);
  for (const [x, y] of [
    [96, 60],
    [250, 120],
    [690, 48],
    [560, 140],
    [380, 34],
    [740, 170],
  ] as const) {
    out += circle(x, y, 3, PALETTE.paper.base);
  }
  return (
    out +
    shadedCircle(560, 372, 74, 'yellow') +
    pill(120, 216, 130, 26, PALETTE.paper.shade) +
    pill(140, 206, 80, 26, PALETTE.paper.base) +
    pill(600, 252, 110, 22, PALETTE.paper.shade) +
    pill(626, 244, 64, 22, PALETTE.paper.base)
  );
}

/**
 * Le plan du milieu : les collines lointaines et l'ancienne ville en ruine,
 * grue et antenne comprises, puis la clairière — la mairie et ses lampions,
 * Ève qui arrive au loin sur son vélo-cargo, et un mutant qui guette,
 * caché derrière une ruine, la main sur le mur.
 */
function titleTown(): string {
  const { width: W } = TITLE_ART;
  const hills =
    ellipse(140, 452, 280, 96, GROUND.grass.shade) +
    ellipse(680, 440, 300, 104, GROUND.grass.shade) +
    ellipse(400, 470, 220, 70, GROUND.grass.shade);
  const city =
    oldTower(28, 400, 46, 120, 4) +
    oldTower(84, 404, 38, 82, 3) +
    oldTower(690, 396, 50, 136, 5) +
    // La grue, à côté de la tour de droite, son crochet qui pend.
    line(760, 396, 760, 236, PALETTE.ink.base) +
    line(712, 244, 790, 244, PALETTE.ink.base) +
    line(760, 236, 790, 244, PALETTE.ink.base) +
    line(726, 244, 726, 272, PALETTE.ink.base) +
    rect(721, 270, 10, 7, PALETTE.yellow.base, 3) +
    // L'antenne bricolée sur la tour de gauche : un fanion, une lampe corail.
    line(52, 280, 52, 248, PALETTE.ink.base) +
    circle(52, 246, 4, PALETTE.coral.base) +
    flag(96, 296, 26, 'yellow');
  const clearing =
    ellipse(W / 2, 560, 470, 110, GROUND.grass.base) +
    pill(150, 486, 160, 26, GROUND.grass.meadow) +
    pill(500, 520, 190, 30, GROUND.grass.meadow) +
    // L'allée de terre battue qui sort de la porte de la mairie et file vers Ève.
    pill(220, 514, 210, 16, GROUND.grass.trail) +
    pill(236, 518, 120, 5, GROUND.grass.trailLight);

  const hall = building(TOWN_HALL, 400, 512, 1.35);
  const garlands = { y: 512, svg: lanterns(318, 400, 248, 434, 3) + line(248, 434, 248, 512, PALETTE.ink.base) + lanterns(482, 400, 556, 432, 3) + line(556, 432, 556, 512, PALETTE.ink.base) };

  // Ève, au bout de l'allée : petite, elle arrive de loin.
  const bike = (x: number, y: number, scale: number): Placed => ({
    y,
    svg: shadow(x, y, 44 * scale) + [CARGO_BIKE.parts.wheelBack, CARGO_BIKE.parts.wheelFront, CARGO_BIKE.parts.frame].map((part) => place(CARGO_BIKE, part, x, y, 0, scale).svg).join(''),
  });

  // Le mutant derrière la ruine : la tête cabossée et le bras trop long dépassent du mur, dans son halo.
  const ruinX = 548;
  const ruinY = 540;
  const ruinScale = 2.3;
  const lurker = {
    y: ruinY,
    svg:
      circle(ruinX + 25, ruinY - 62, 28, PALETTE.toxic.light) +
      place(MUTANT, MUTANT.parts.down, ruinX + 25, ruinY - 16, 0, 1.6).svg +
      place(RUIN_SPRITE, RUIN_SPRITE.parts.searched, ruinX, ruinY, 0, ruinScale).svg +
      // Ses doigts sur le haut du pilier : trois petits ronds verts.
      shadedCircle(ruinX + 15, ruinY - 37, 4.5, 'toxic') +
      shadedCircle(ruinX + 23, ruinY - 38, 4.5, 'toxic'),
  };

  return (
    hills +
    city +
    clearing +
    scene([
      hall,
      garlands,
      bike(270, 524, 1.15),
      lurker,
      place(TREE_PINE, TREE_PINE.parts.full, 640, 528, 24, 1.4),
      place(TREE, TREE.parts.full, 140, 532, 28, 1.4),
      place(DECOR_ART, DECOR_ART.parts.flowers, 320, 540, 0, 1.4),
      { y: 540, svg: flower(470, 532, 'coral', 1.4) + flower(486, 538, 'yellow', 1.4) + flower(206, 538, 'violet', 1.4) },
    ])
  );
}

/**
 * Le premier plan : la colline d'où Adam, de dos, l'arc à la main, regarde
 * la mairie — un feuillu et un sapin pour cadrer, des fleurs dans l'herbe.
 */
function titleHill(): string {
  const { width: W, height: H } = TITLE_ART;
  const hill =
    ellipse(W / 2, 800, 560, 250, GROUND.grass.shade) +
    ellipse(W / 2, 806, 540, 236, GROUND.grass.base) +
    pill(250, 590, 300, 22, GROUND.grass.light) +
    pill(120, 680, 220, 40, GROUND.grass.meadow) +
    pill(500, 720, 260, 44, GROUND.grass.meadow) +
    rect(-10, 820, W + 20, H - 820, GROUND.grass.base, 0);
  const adam = (x: number, y: number, scale: number): Placed => ({
    y,
    svg: shadow(x, y, 26 * scale) + [ADAM.parts.foot, ADAM.parts.up, ADAM.parts.bow].map((part) => place(ADAM, part, x, y, 0, scale).svg).join(''),
  });

  return (
    hill +
    scene([
      adam(400, 586, 2.6),
      place(TREE, TREE.parts.full, 70, 700, 34, 2.6),
      place(TREE_PINE, TREE_PINE.parts.full, 750, 690, 30, 2.4),
      place(ROCK_STONE, ROCK_STONE.parts.full, 640, 640, 30, 1.6),
      {
        y: 700,
        svg:
          flower(300, 620, 'coral', 1.8) +
          flower(520, 640, 'yellow', 1.8) +
          flower(200, 720, 'violet', 1.8) +
          flower(610, 740, 'coral', 1.8) +
          flower(420, 700, 'cyan', 1.8),
      },
    ])
  );
}

/**
 * Le key art de l'écran titre, en trois plans du même cadre (`TITLE_ART`) :
 * le ciel, la ville, la colline. L'écran les empile et les fait respirer
 * chacun à son amplitude — un léger parallaxe, coupé sous
 * `prefers-reduced-motion`.
 */
export function titleScene(): { sky: string; town: string; hill: string } {
  const { width: W, height: H } = TITLE_ART;

  return { sky: svg(W, H, titleSky()), town: svg(W, H, titleTown()), hill: svg(W, H, titleHill()) };
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
