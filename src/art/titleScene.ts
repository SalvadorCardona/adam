/**
 * Le key art de l'écran titre, découpé pour vivre : des **plans** de
 * profondeur (`TitleLayer`, du ciel à l'avant-plan) que l'écran décale chacun
 * à sa vitesse — la parallaxe —, et dans chaque plan des **accessoires**
 * (`TitleProp`) : un SVG recadré sur sa boîte, qu'une animation nommée
 * (`motion`) fait bouger — un nuage qui dérive, un lampion qui se balance,
 * le mutant qui guette derrière sa ruine.
 *
 * Tout est en pixels du cadre (`TITLE_ART`), boîtes comprises ; l'écran
 * (`ui/titleArt.ts`) les traduit en pourcentages, si bien que la scène suit
 * la taille de l'écran sans rien recalculer. Les mouvements (`path`, `origin`)
 * sont aussi en pixels du cadre : la traduction en fait des pourcentages de
 * la boîte de l'accessoire.
 *
 * Ni DOM ni CSS ici : un `motion` n'est qu'un nom, que la feuille de style
 * anime ; `tap` dit à quoi réagit l'accessoire. Les lumières (lampions,
 * fenêtres, lucioles) sont des aplats pleins : c'est l'écran qui les fait
 * briller en transparence, comme le halo du mutant en jeu.
 */

import {
  GROUND,
  PALETTE,
  circle,
  cushion,
  curve,
  ellipse,
  embed,
  flower,
  group,
  leaf,
  line,
  pill,
  polygon,
  rect,
  shadedBlock,
  shadedCircle,
  svg,
  vine,
  windowPane,
  type Tone,
} from '../data/artDirection.ts';
import { ADAM } from './adam.ts';
import { building, place, shadow, type Anchored } from './brand.ts';
import { CARGO_BIKE } from './cargoBike.ts';
import { DECOR_ART } from './decor.ts';
import { MUTANT } from './mutant.ts';
import { ROCK_STONE } from './rocks.ts';
import { RUIN_SPRITE } from './ruin.ts';
import { TOWN_HALL } from './townHall.ts';
import { TREE, TREE_PINE } from './trees.ts';

/** Le cadre du key art, en pixels monde : tous les plans le partagent. */
export const TITLE_ART = { width: 800, height: 900 } as const;

/** Les animations que la feuille de style sait jouer (`[data-motion]`). */
export type TitleMotion =
  | 'twinkle'
  | 'night'
  | 'sunset'
  | 'halo'
  | 'rays'
  | 'sunPulse'
  | 'drift'
  | 'flock'
  | 'flap'
  | 'crane'
  | 'blink'
  | 'flutter'
  | 'smoke'
  | 'windows'
  | 'swing'
  | 'glow'
  | 'ride'
  | 'spin'
  | 'bob'
  | 'peek'
  | 'grip'
  | 'eyelid'
  | 'sway'
  | 'rustle'
  | 'breathe'
  | 'mote';

/** Jusqu'où une pupille du mutant se déplace dans son œil, en fraction de la boîte de l'œil. */
const PUPIL_TRAVEL = 0.2;

/** La direction du mutant vers Adam, à l'écran (vecteur unité) : où ses pupilles se tournent quand Adam se retourne. */
export const TITLE_GAZE_ADAM: readonly [number, number] = [-0.97, 0.22];

/** Ce à quoi réagit un accessoire touché. */
export type TitleTap = 'sun' | 'bird' | 'lantern' | 'mutant' | 'adam' | 'ground';

export interface TitleProp {
  readonly id: string;
  /** La boîte, en pixels du cadre. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Le dessin, recadré sur la boîte ; absent pour un simple groupe. */
  readonly svg?: string;
  /** Ce que le groupe emmène avec lui, boîtes en pixels du cadre. */
  readonly children?: readonly TitleProp[];
  readonly motion?: TitleMotion;
  /** La durée d'un tour d'animation, en secondes, et son décalage (négatif : déjà en route). */
  readonly duration?: number;
  readonly delay?: number;
  /** Le pivot (rotation, écrasement), en pixels du cadre ; absent : le centre de la boîte. */
  readonly origin?: readonly [number, number];
  /** Un trajet, d'un décalage à l'autre (dx0, dy0, dx1, dy1), en pixels du cadre. */
  readonly path?: readonly [number, number, number, number];
  /** Pour une roue, le nombre de degrés par trajet. */
  readonly turns?: readonly [number, number];
  readonly tap?: TitleTap;
  /** Une pupille que le regard déplace : jusqu'où, en fraction de sa boîte (`data-gaze`). */
  readonly gaze?: number;
  /** Le groupe rogne ce qui en dépasse : le mutant se cache derrière sa ruine. */
  readonly clip?: boolean;
  /** Une vue d'Adam : l'écran montre l'une ou l'autre (`data-view`). */
  readonly view?: 'back' | 'front';
}

export interface TitleLayer {
  readonly id: string;
  /** 0 : à l'infini, le ciel ne bouge pas ; 1 : l'avant-plan, qui bouge le plus. */
  readonly depth: number;
  /** Le voile du crépuscule passe sur ce plan et ce qui est derrière ; les lumières viennent après. */
  readonly veil?: boolean;
  readonly props: readonly TitleProp[];
}

type Extra = Omit<TitleProp, 'id' | 'x' | 'y' | 'width' | 'height' | 'svg'>;

/** Un accessoire : `content`, dessiné en pixels du cadre, recadré sur sa boîte. */
function prop(id: string, x: number, y: number, width: number, height: number, content: string, extra: Extra = {}): TitleProp {
  return { id, x, y, width, height, svg: svg(width, height, group(`translate(${-x} ${-y})`, content)), ...extra };
}

/** Un groupe sans dessin à lui : il emmène ses enfants. */
function bundle(id: string, x: number, y: number, width: number, height: number, children: readonly TitleProp[], extra: Extra = {}): TitleProp {
  return { id, x, y, width, height, children, ...extra };
}

/** La boîte d'un sprite posé par son ancre en (x, y), agrandi de `scale`. */
function spriteBox(sprite: Anchored, x: number, y: number, scale: number): [number, number, number, number] {
  return [x - sprite.anchorX * sprite.width * scale, y - sprite.anchorY * sprite.height * scale, sprite.width * scale, sprite.height * scale];
}

/* ------------------------------------------------------------- le ciel */

/** Le ciel du soir : des bandes franches, du violet au jaune de l'horizon, sans dégradé — une affiche. */
function sky(): TitleLayer {
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
  return { id: 'sky', depth: 0, props: [prop('bands', 0, 0, W, H, out)] };
}

/**
 * Le soleil qui se couche : son disque, deux halos qui respirent et une
 * couronne de rayons qui tourne, le tout qui descend lentement derrière les
 * collines avec le crépuscule (`sunset`). Le toucher le fait palpiter.
 */
function sun(): TitleLayer {
  const [cx, cy] = [560, 372];
  let rays = '';

  for (let i = 0; i < 12; i += 1) rays += group(`translate(${cx} ${cy}) rotate(${i * 30})`, pill(-5, -122, 10, 26, PALETTE.yellow.light));

  return {
    id: 'sun',
    depth: 0.05,
    props: [
      bundle(
        'sun',
        cx - 130,
        cy - 130,
        260,
        260,
        [
          prop('halo', cx - 130, cy - 130, 260, 260, circle(cx, cy, 128, PALETTE.yellow.light), { motion: 'halo', duration: 7 }),
          prop('halo-near', cx - 98, cy - 98, 196, 196, circle(cx, cy, 96, PALETTE.yellow.light), { motion: 'halo', duration: 5, delay: -2 }),
          prop('rays', cx - 130, cy - 130, 260, 260, rays, { motion: 'rays', duration: 140 }),
          prop('disc', cx - 76, cy - 76, 152, 152, shadedCircle(cx, cy, 74, 'yellow') + pill(cx - 44, cy - 52, 46, 14, PALETTE.yellow.light), { motion: 'sunPulse', duration: 6, tap: 'sun' }),
        ],
        { motion: 'sunset', duration: 120, path: [0, 0, 0, 64] },
      ),
    ],
  };
}

/** Un nuage en deux capsules, sa face lavande dessous. */
function cloud(x: number, y: number, w: number): string {
  return pill(x, y + 10, w, 26, PALETTE.paper.shade) + pill(x + w * 0.16, y, w * 0.6, 26, PALETTE.paper.base) + pill(x + w * 0.24, y + 6, w * 0.22, 5, PALETTE.paper.light);
}

/** Un oiseau au loin : deux ailes au trait, que `flap` fait battre. */
function farBird(x: number, y: number): string {
  return curve(`M${x} ${y}Q${x + 4} ${y - 5} ${x + 8} ${y}Q${x + 12} ${y - 5} ${x + 16} ${y}`, PALETTE.ink.base);
}

/**
 * Les nuages, qui traversent le ciel chacun à sa vitesse, et un vol
 * d'oiseaux qui passe de temps en temps de droite à gauche.
 */
function clouds(): TitleLayer {
  const { width: W } = TITLE_ART;
  const drifting = (id: string, x: number, y: number, w: number, duration: number): TitleProp => {
    // De l'hors-champ gauche à l'hors-champ droit ; le décalage le pose là où il est dessiné au premier instant.
    const from = -w - 60 - x;
    const to = W + 60 - x;

    return prop(id, x, y, w, 36, cloud(x, y, w), { motion: 'drift', duration, delay: (-duration * -from) / (to - from), path: [from, 0, to, 0] });
  };
  const birds = [
    [0, 8],
    [22, 0],
    [40, 12],
  ] as const;

  return {
    id: 'clouds',
    depth: 0.12,
    props: [
      drifting('cloud-high', 300, 120, 150, 150),
      drifting('cloud-left', 120, 206, 130, 110),
      drifting('cloud-right', 600, 244, 110, 90),
      drifting('cloud-low', 40, 300, 90, 130),
      bundle(
        'flock',
        W + 20,
        150,
        60,
        24,
        [prop('birds', W + 20, 150, 60, 24, birds.map(([dx, dy]) => farBird(W + 21 + dx, 157 + dy)).join(''), { motion: 'flap', duration: 0.5 })],
        { motion: 'flock', duration: 34, delay: -20, path: [0, 0, -W - 140, 40] },
      ),
    ],
  };
}

/* ------------------------------------------------------- la vieille ville */

interface Tower {
  x: number;
  base: number;
  w: number;
  h: number;
  rows: number;
}

/** Les ruines au loin ; celles du milieu se voient sur un téléphone, celles des bords sur un grand écran. */
const TOWERS: readonly Tower[] = [
  { x: 28, base: 400, w: 46, h: 120, rows: 4 },
  { x: 84, base: 404, w: 38, h: 82, rows: 3 },
  { x: 212, base: 404, w: 40, h: 106, rows: 4 },
  { x: 592, base: 400, w: 34, h: 76, rows: 3 },
  { x: 690, base: 396, w: 50, h: 136, rows: 5 },
];

/** Une fenêtre d'une tour, ligne et colonne : sa boîte. */
function towerWindow(tower: Tower, row: number, col: number): [number, number] {
  return [tower.x + 8 + col * (tower.w / 2 - 2), tower.base - tower.h + 16 + row * 22];
}

/** Un immeuble violet arrondi, ses fenêtres, sa liane. */
function oldTower(tower: Tower): string {
  const { x, base, w, h, rows } = tower;
  let out = shadedBlock(x, base - h, w, h, 8, 'violet', 12);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < 2; col += 1) out += windowPane(...towerWindow(tower, row, col), 9, 12, 'violet');
  }
  return out + vine([x + 4, base - 8, x + 8, base - h * 0.4, x + 4, base - h * 0.7], 3);
}

/** Les collines lointaines (cx, cy, rx, ry) : elles cachent le pied des tours. */
const HILLS = [
  [140, 452, 280, 96],
  [680, 440, 300, 104],
  [400, 470, 220, 70],
] as const;

/** Le haut des collines à l'abscisse `x` : ce qui est plus bas est caché. */
function hillTop(x: number): number {
  let top = Infinity;

  for (const [cx, cy, rx, ry] of HILLS) {
    const u = (x - cx) / rx;

    if (Math.abs(u) < 1) top = Math.min(top, cy - ry * Math.sqrt(1 - u * u));
  }
  return top;
}

/**
 * Les fenêtres qui s'allument au crépuscule : une sur deux, jamais les mêmes
 * d'une tour à l'autre, et seulement celles que les collines ne cachent pas —
 * les lumières passent devant elles.
 */
function towerLights(tower: Tower, index: number): string {
  let out = '';

  for (let row = 0; row < tower.rows; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      if ((row * 3 + col + index) % 2 === 1) continue;
      const [x, y] = towerWindow(tower, row, col);

      if (y + 12 > Math.min(hillTop(x), hillTop(x + 9))) continue;
      out += rect(x, y, 9, 12, PALETTE.yellow.base, 4.5) + pill(x + 2, y + 2, 5, 3, PALETTE.yellow.light);
    }
  }
  return out;
}

/** Un oiseau perché, de profil : rond, corail, le bec jaune — il s'envole si on le touche. */
function perchedBird(x: number, y: number, facing: 1 | -1): string {
  const body = shadedCircle(0, -6, 6, 'coral') + circle(4, -11, 4, PALETTE.coral.base) + polygon([7, -12, 12, -10.5, 7, -9], PALETTE.yellow.base) + circle(5, -12, 1.2, PALETTE.ink.base) + line(-1, 0, -1, 1, PALETTE.ink.base) + line(2, 0, 2, 1, PALETTE.ink.base);

  return group(`translate(${x} ${y}) scale(${facing} 1)`, body);
}

function perch(id: string, x: number, y: number, facing: 1 | -1): TitleProp {
  return prop(id, x - 10, y - 18, 24, 22, perchedBird(x, y, facing), { tap: 'bird' });
}

/**
 * La vieille ville, au fond : ses tours violettes, la grue dont la flèche
 * pivote doucement, l'antenne bricolée et sa lampe qui clignote, un fanion,
 * des oiseaux perchés.
 */
function city(): TitleLayer {
  const mast = line(760, 396, 760, 236, PALETTE.ink.base);
  const jib = line(712, 244, 790, 244, PALETTE.ink.base) + line(760, 236, 790, 244, PALETTE.ink.base) + line(726, 244, 726, 272, PALETTE.ink.base) + rect(721, 270, 10, 7, PALETTE.yellow.base, 3);
  const antennas = line(52, 280, 52, 248, PALETTE.ink.base) + line(240, 298, 240, 270, PALETTE.ink.base) + line(240, 280, 248, 276, PALETTE.ink.base);

  return {
    id: 'city',
    depth: 0.2,
    props: [
      prop('towers', 0, 220, 800, 190, TOWERS.map(oldTower).join('') + antennas + mast + line(96, 296, 96, 322, PALETTE.ink.base)),
      prop('lamp-left', 46, 240, 12, 12, circle(52, 246, 4, PALETTE.coral.base), { motion: 'blink', duration: 1.8 }),
      prop('lamp-mid', 234, 262, 12, 12, circle(240, 268, 4, PALETTE.coral.base), { motion: 'blink', duration: 2.4, delay: -0.8 }),
      prop('flag', 95, 294, 14, 11, rect(96, 296, 11, 7, PALETTE.yellow.base, 2) + pill(97.5, 297.5, 5, 2, PALETTE.yellow.light), { motion: 'flutter', duration: 1.2, origin: [96, 299] }),
      prop('jib', 706, 230, 90, 52, jib, { motion: 'crane', duration: 14, origin: [760, 244] }),
      perch('perch-tower', 220, 298, 1),
      perch('perch-tower-2', 234, 298, -1),
      perch('perch-crane', 776, 242, -1),
    ],
  };
}

/** Les fenêtres allumées, au-dessus du voile : elles brillent quand le reste s'assombrit. */
function cityLights(): TitleLayer {
  return {
    id: 'cityLights',
    depth: 0.2,
    props: [prop('lights', 0, 220, 800, 190, TOWERS.map(towerLights).join(''), { motion: 'windows', duration: 120 })],
  };
}

/** Les collines lointaines, derrière la clairière. */
function hills(): TitleLayer {
  return {
    id: 'hills',
    depth: 0.32,
    veil: true,
    props: [prop('hills', -160, 330, 1120, 220, HILLS.map(([cx, cy, rx, ry]) => ellipse(cx, cy, rx, ry, GROUND.grass.shade)).join(''))],
  };
}

/** Les étoiles, au-dessus du voile : discrètes au couchant, franches au crépuscule (`night`). */
function stars(): TitleLayer {
  const { width: W } = TITLE_ART;
  const spots = [
    [96, 60],
    [250, 120],
    [690, 48],
    [560, 140],
    [380, 34],
    [740, 170],
    [300, 210],
    [470, 92],
    [160, 170],
    [640, 210],
    [420, 180],
    [20, 120],
  ] as const;

  return {
    id: 'stars',
    depth: 0.02,
    props: [
      bundle(
        'starfield',
        0,
        0,
        W,
        240,
        // Trois essaims qui scintillent chacun à son rythme : trois animations plutôt que douze.
        [0, 1, 2].map((k) =>
          prop(
            `stars-${k}`,
            0,
            0,
            W,
            240,
            spots
              .filter((_, i) => i % 3 === k)
              .map(([x, y]) => circle(x, y, k === 0 ? 3.4 : 2.6, PALETTE.paper.base))
              .join(''),
            { motion: 'twinkle', duration: 2.2 + k * 0.9, delay: -k * 1.3 },
          ),
        ),
        { motion: 'night', duration: 120 },
      ),
    ],
  };
}

/* ------------------------------------------------------------ la clairière */

/** Les lanternes d'une guirlande : là où elles pendent sur le fil qui ploie, et le fil. */
function garland(x1: number, y1: number, x2: number, y2: number, count: number): { wire: string; spots: { x: number; y: number; tone: Tone }[] } {
  const sag = 16;
  const midX = (x1 + x2) / 2;
  const midY = Math.max(y1, y2) + sag * 2;
  const tones = ['yellow', 'orange', 'coral'] as const;
  const spots: { x: number; y: number; tone: Tone }[] = [];

  for (let i = 1; i <= count; i += 1) {
    const s = i / (count + 1);

    // Le point de la courbe de Bézier quadratique, là où pend la lanterne.
    spots.push({
      x: (1 - s) * (1 - s) * x1 + 2 * (1 - s) * s * midX + s * s * x2,
      y: (1 - s) * (1 - s) * y1 + 2 * (1 - s) * s * midY + s * s * y2,
      tone: tones[i % tones.length]!,
    });
  }
  return { wire: curve(`M${x1} ${y1}Q${midX} ${midY} ${x2} ${y2}`, PALETTE.ink.base), spots };
}

/** Un lampion qui pend de son point d'accroche ; sa lueur, derrière, s'allume à son tour. */
function lantern(id: string, x: number, y: number, tone: Tone, order: number): TitleProp {
  const colors = PALETTE[tone];
  const body = line(x, y, x, y + 4, PALETTE.ink.base) + rect(x - 5, y + 3, 10, 12, colors.shade, 5) + rect(x - 5, y + 3, 10, 9, colors.base, 5) + pill(x - 3, y + 5, 3, 4, colors.light);

  return bundle(
    id,
    x - 16,
    y - 6,
    32,
    36,
    [
      prop(`${id}-glow`, x - 16, y - 6, 32, 36, circle(x, y + 9, 12, PALETTE.yellow.light), { motion: 'glow', duration: 3.2, delay: 1.6 + order * 0.35 }),
      prop(`${id}-body`, x - 6, y, 12, 16, body),
    ],
    { motion: 'swing', duration: 3 + (order % 3) * 0.4, delay: -order * 0.7, origin: [x, y], tap: 'lantern' },
  );
}

/** Un arbre qui ondule au vent autour du pied de son tronc ; son ombre reste au sol. */
function swayingTree(id: string, sprite: Anchored & { parts: { full: string } }, x: number, y: number, shadowWidth: number, scale: number, delay: number): TitleProp[] {
  const [bx, by, bw, bh] = spriteBox(sprite, x, y, scale);

  return [
    prop(`${id}-shadow`, x - shadowWidth * scale, y - 20, shadowWidth * scale * 2, 40, shadow(x, y, shadowWidth * scale)),
    prop(id, bx, by, bw, bh, embed(sprite.parts.full, bx, by, scale), { motion: 'sway', duration: 5.5, delay, origin: [x, y] }),
  ];
}

/** Un bouquet de fleurs semées dans l'herbe, qui frémit d'un seul souffle depuis le pied (`rustle`). */
function meadow(id: string, blooms: readonly (readonly [number, number, Tone, number])[], duration: number, delay: number): TitleProp {
  const left = Math.min(...blooms.map(([x, , , size]) => x - 2.4 * size - 1));
  const right = Math.max(...blooms.map(([x, , , size]) => x + 2.4 * size + 1));
  const top = Math.min(...blooms.map(([, y, , size]) => y - 2.4 * size - 1));
  const bottom = Math.max(...blooms.map(([, y, , size]) => y + 4 * size + 2));

  return prop(id, left, top, right - left, bottom - top, blooms.map(([x, y, tone, size]) => flower(x, y, tone, size)).join(''), { motion: 'rustle', duration, delay, origin: [(left + right) / 2, bottom] });
}

/** Une fleur qui ondule sur sa tige. */
function swayingFlower(id: string, x: number, y: number, tone: Tone, size: number, delay: number): TitleProp {
  const r = 2.4 * size;

  return prop(id, x - r - 1, y - r - 1, r * 2 + 2, r + 4 * size + 3, flower(x, y, tone, size), { motion: 'sway', duration: 3.2, delay, origin: [x, y + 4 * size] });
}

/**
 * La clairière : la mairie et sa cheminée qui fume, ses guirlandes de
 * lampions, Ève qui traverse à vélo-cargo, et le mutant qui guette derrière
 * sa ruine — il se cache, reparaît, cligne des yeux, regarde vers Adam.
 */
function town(): TitleLayer {
  const { width: W } = TITLE_ART;
  const clearing =
    ellipse(W / 2, 560, 470, 110, GROUND.grass.base) +
    pill(150, 486, 160, 26, GROUND.grass.meadow) +
    pill(500, 520, 190, 30, GROUND.grass.meadow) +
    // L'allée de terre battue qui sort de la porte de la mairie et file vers la gauche.
    pill(220, 514, 210, 16, GROUND.grass.trail) +
    pill(236, 518, 120, 5, GROUND.grass.trailLight);

  // La mairie, et la cheminée de son pignon gauche (celle de la Cité industrielle, sans sa fumée : elle s'anime).
  const hall = building(TOWN_HALL, 400, 512, 1.35);
  const [hx, hy] = [400 - (TOWN_HALL.width * 1.35) / 2, 512 - TOWN_HALL.height * 1.35];
  const chimney = group(
    `translate(${hx} ${hy}) scale(1.35)`,
    rect(10, 30, 10, 26, PALETTE.ink.shade, 3) + rect(10, 30, 8, 24, PALETTE.ink.base, 3) + rect(10, 38, 8, 3.4, PALETTE.coral.base, 1) + rect(10, 46, 8, 3.4, PALETTE.coral.base, 1) + pill(8, 28, 14, 5, PALETTE.ink.light),
  );
  const [smokeX, smokeY] = [hx + 15 * 1.35, hy + 26 * 1.35];
  const puffs = [0, 1, 2].map((i) =>
    prop(`smoke-${i}`, smokeX - 9, smokeY - 18, 18, 18, circle(smokeX, smokeY - 9, 7.5, PALETTE.paper.shade) + circle(smokeX - 1, smokeY - 10, 6, PALETTE.paper.base), {
      motion: 'smoke',
      duration: 4.5,
      delay: -i * 1.5,
      path: [0, 0, 18, -70],
    }),
  );

  const left = garland(318, 400, 248, 434, 3);
  const right = garland(482, 400, 556, 432, 3);
  const wires = left.wire + right.wire + line(248, 434, 248, 512, PALETTE.ink.base) + line(556, 432, 556, 512, PALETTE.ink.base);
  const lanterns = [...left.spots.reverse(), ...right.spots].map((spot, i) => lantern(`lantern-${i}`, spot.x, spot.y, spot.tone, i));

  // Ève à vélo-cargo : elle arrive de la gauche, s'arrête devant la mairie, puis repart à droite.
  const bikeScale = 1.15;
  const [bx, by, bw, bh] = spriteBox(CARGO_BIKE, 270, 524, bikeScale);
  const wheel = (part: 'wheelBack' | 'wheelFront'): TitleProp => {
    const [px, py] = CARGO_BIKE.pivots[part];

    return prop(part, bx, by, bw, bh, embed(CARGO_BIKE.parts[part], bx, by, bikeScale), { motion: 'spin', duration: 26, delay: -8, origin: [bx + px * bikeScale, by + py * bikeScale], turns: [-1800, 2900] });
  };
  const bike = bundle(
    'bike',
    bx - 10,
    by,
    bw + 20,
    bh + 8,
    [
      prop('bike-shadow', bx - 10, 514, bw + 20, 20, shadow(270, 524, 44 * bikeScale)),
      wheel('wheelBack'),
      wheel('wheelFront'),
      prop('bike-frame', bx, by, bw, bh, embed(CARGO_BIKE.parts.frame, bx, by, bikeScale), { motion: 'bob', duration: 0.5, origin: [270, 524] }),
    ],
    { motion: 'ride', duration: 26, delay: -8, path: [-420, 0, 640, 0] },
  );

  // Le mutant derrière la ruine : rogné à la ruine, il s'y cache et en ressort.
  const [ruinX, ruinY, ruinScale] = [548, 540, 2.3];
  const [mx, my, mw, mh] = spriteBox(MUTANT, ruinX + 25, ruinY - 16, 1.6);
  const eye = (x: number, y: number, r: number): string => circle(mx + x * 1.6, my + y * 1.6, r * 1.6 + 0.6, PALETTE.toxic.base);
  // Les deux yeux du sprite (x, y, rayon), en pixels du sprite ; la paupière (`eye`) les recouvre en clignant.
  const eyes = [
    [12.3, 12.6, 3.2],
    [18.8, 13.2, 1.8],
  ] as const;
  const [rx, ry, rw, rh] = spriteBox(RUIN_SPRITE, ruinX, ruinY, ruinScale);
  const lurker = bundle(
    'lurker',
    rx,
    420,
    rw + 24,
    ruinY - 4 - 420,
    [
      bundle(
        'mutant',
        mx - 10,
        my - 14,
        mw + 20,
        mh + 14,
        [
          prop('mutant-halo', mx - 10, my - 14, mw + 20, mw + 20, circle(ruinX + 25, ruinY - 62, 28, PALETTE.toxic.light)),
          prop('mutant-body', mx, my, mw, mh, embed(MUTANT.parts.down, mx, my, 1.6)),
          // Les yeux repeints en blanc, puis leurs pupilles, que la visée déplace (`data-gaze`) : le regard suit la parallaxe, puis Adam.
          ...eyes.map(([x, y, r], i) => prop(`mutant-eye-${i}`, mx + (x - r) * 1.6, my + (y - r) * 1.6, r * 3.2, r * 3.2, circle(mx + x * 1.6, my + y * 1.6, r * 1.6, PALETTE.paper.base))),
          ...eyes.map(([x, y, r], i) =>
            prop(`mutant-pupil-${i}`, mx + (x - r) * 1.6, my + (y - r) * 1.6, r * 3.2, r * 3.2, circle(mx + x * 1.6, my + y * 1.6, r * 0.72, PALETTE.ink.base), { gaze: PUPIL_TRAVEL }),
          ),
          prop('mutant-eyelids', mx + 12, my + 12, 30, 16, eye(12.3, 12.6, 3.2) + eye(18.8, 13.2, 1.8), { motion: 'eyelid', duration: 4.2, origin: [mx + 24, my + 13] }),
        ],
        { motion: 'peek', duration: 9, tap: 'mutant', origin: [ruinX + 25, ruinY - 4], path: [0, 0, 0, 52] },
      ),
    ],
    { clip: true },
  );
  const ruin = prop('ruin', rx, ry, rw, rh, embed(RUIN_SPRITE.parts.searched, rx, ry, ruinScale), { tap: 'mutant' });
  const fingers = bundle(
    'fingers',
    ruinX + 6,
    ruinY - 50,
    26,
    ruinY - 31 - (ruinY - 50),
    [prop('fingers-hand', ruinX + 8, ruinY - 44, 22, 12, shadedCircle(ruinX + 15, ruinY - 37, 4.5, 'toxic') + shadedCircle(ruinX + 23, ruinY - 38, 4.5, 'toxic'), { motion: 'grip', duration: 9, path: [0, 0, 0, 14] })],
    { clip: true },
  );

  return {
    id: 'town',
    depth: 0.5,
    props: [
      prop('clearing', -70, 446, 940, 228, clearing),
      ...swayingTree('pine', TREE_PINE, 640, 528, 24, 1.4, -1.2),
      ...swayingTree('tree', TREE, 140, 532, 28, 1.4, -3),
      prop('chimney', smokeX - 12, smokeY - 4, 24, 40, chimney),
      ...puffs,
      prop('hall', hx - 10, hy - 2, TOWN_HALL.width * 1.35 + 20, TOWN_HALL.height * 1.35 + 12, hall.svg),
      prop('wires', 240, 396, 324, 120, wires),
      ...lanterns,
      bike,
      lurker,
      ruin,
      fingers,
      prop('flowers', 320, 540, 45, 45, embed(DECOR_ART.parts.flowers, 320, 540, 1.4)),
      meadow(
        'town-flowers',
        [
          [470, 532, 'coral', 1.4],
          [486, 538, 'yellow', 1.4],
          [206, 538, 'violet', 1.4],
        ],
        3.4,
        -0.6,
      ),
    ],
  };
}

/* -------------------------------------------------------------- la colline */

/**
 * La colline d'où Adam, de dos, l'arc à la main, regarde la mairie : il
 * respire, et se retourne vers vous quand on le touche ou qu'on vise
 * « Jouer ». Un feuillu et un sapin qui ondulent, des fleurs. Toucher l'herbe
 * en fait pousser.
 */
function hill(): TitleLayer {
  const { width: W, height: H } = TITLE_ART;
  const ground =
    ellipse(W / 2, 800, 560, 250, GROUND.grass.shade) +
    ellipse(W / 2, 806, 540, 236, GROUND.grass.base) +
    pill(250, 590, 300, 22, GROUND.grass.light) +
    pill(120, 680, 220, 40, GROUND.grass.meadow) +
    pill(500, 720, 260, 44, GROUND.grass.meadow) +
    rect(-170, 820, W + 340, H - 820 + 10, GROUND.grass.base, 0);
  const scale = 2.6;
  const [ax, ay, aw, ah] = spriteBox(ADAM, 400, 586, scale);
  const part = (id: string, name: keyof typeof ADAM.parts, extra: Extra = {}): TitleProp => prop(id, ax, ay, aw, ah, embed(ADAM.parts[name], ax, ay, scale), extra);
  const adam = bundle('adam', ax, ay, aw, ah, [part('adam-foot', 'foot'), part('adam-back', 'up', { view: 'back' }), part('adam-front', 'down', { view: 'front' }), part('adam-bow', 'bow')], {
    motion: 'breathe',
    duration: 3.8,
    origin: [400, 586],
    tap: 'adam',
  });
  const blooms = [
    [300, 620, 'coral'],
    [520, 640, 'yellow'],
    [200, 720, 'violet'],
    [610, 740, 'coral'],
    [420, 700, 'cyan'],
  ] as const;

  return {
    id: 'hill',
    depth: 0.75,
    props: [
      prop('ground', -170, 550, W + 340, H - 540, ground, { tap: 'ground' }),
      prop('adam-shadow', 360, 566, 80, 40, shadow(400, 586, 26 * scale)),
      adam,
      ...swayingTree('hill-tree', TREE, 70, 700, 34, 2.6, -2),
      ...swayingTree('hill-pine', TREE_PINE, 750, 690, 30, 2.4, -0.6),
      prop('rock', 600, 580, 90, 80, place(ROCK_STONE, ROCK_STONE.parts.full, 640, 640, 30, 1.6).svg),
      meadow('blooms', blooms.map(([x, y, tone]) => [x, y, tone, 1.8] as const), 3.6, -1.2),
    ],
  };
}

/** Un buisson de coussins de feuillage, quelques fleurs dessus. */
function bush(cx: number, cy: number, w: number): string {
  return (
    pill(cx - w * 0.55, cy + w * 0.16, w * 1.1, w * 0.26, GROUND.grass.shade) +
    cushion(cx - w * 0.22, cy, w * 0.62, w * 0.36) +
    cushion(cx + w * 0.2, cy + w * 0.04, w * 0.58, w * 0.32) +
    cushion(cx, cy - w * 0.2, w * 0.56, w * 0.32) +
    flower(cx - w * 0.18, cy - w * 0.28, 'coral', w / 60) +
    flower(cx + w * 0.22, cy - w * 0.08, 'yellow', w / 70)
  );
}

/** Une touffe d'herbe : des brins en capsule, qui ondulent depuis leur pied. */
function tuft(x: number, y: number, size: number): string {
  const blades = [
    [-8, 26, -14],
    [-2, 36, -4],
    [5, 30, 10],
    [11, 22, 22],
  ] as const;

  return blades
    .map(([dx, h, angle], i) => group(`translate(${x + dx * size} ${y}) rotate(${angle})`, pill(-2.6 * size, -h * size, 5.2 * size, h * size, i % 2 === 0 ? PALETTE.mint.shade : PALETTE.mint.base)))
    .join('');
}

/**
 * L'avant-plan, le plus proche : de gros buissons fleuris sur les côtés (le
 * grand écran les voit), des touffes d'herbe et de grandes fleurs en bas (le
 * téléphone les voit), qui ondulent toutes.
 */
function front(): TitleLayer {
  const tufts = [
    [150, 868, 1.5],
    [260, 884, 1.8],
    [470, 888, 1.9],
    [680, 882, 1.7],
    [20, 690, 1.8],
    [780, 700, 1.8],
  ] as const;

  return {
    id: 'front',
    depth: 1,
    props: [
      prop('bush-left', -40, 600, 200, 130, bush(50, 670, 150), { motion: 'sway', duration: 6, origin: [50, 720] }),
      prop('bush-right', 640, 590, 200, 140, bush(740, 664, 160), { motion: 'sway', duration: 6.8, delay: -2, origin: [740, 720] }),
      // Les touffes du bas (le téléphone les voit) et celles des côtés (le grand écran) : deux souffles.
      prop('tufts', 0, 790, 800, 100, tufts.filter(([, y]) => y > 800).map(([x, y, size]) => tuft(x, y, size)).join(''), { motion: 'rustle', duration: 3, origin: [400, 890] }),
      prop('tufts-sides', -40, 600, 880, 104, tufts.filter(([, y]) => y <= 800).map(([x, y, size]) => tuft(x, y, size)).join(''), { motion: 'rustle', duration: 3.6, delay: -1.4, origin: [400, 704] }),
      swayingFlower('front-flower-left', 228, 830, 'coral', 3, -0.3),
      swayingFlower('front-flower-right', 560, 846, 'violet', 3.2, -1.4),
      prop('front-leaf', 330, 836, 40, 30, leaf(340, 860, -40, 3) + leaf(344, 862, 220, 2.6)),
    ],
  };
}

/** Les lucioles et le pollen dans la lumière du soir : de petits points qui flottent et luisent. */
function motes(): TitleLayer {
  const spots = [
    [180, 420],
    [260, 560],
    [330, 470],
    [440, 610],
    [520, 450],
    [560, 720],
  ] as const;

  return {
    id: 'motes',
    depth: 0.6,
    props: spots.map(([x, y], i) =>
      prop(`mote-${i}`, x - 6, y - 6, 12, 12, circle(x, y, 5, PALETTE.yellow.light) + circle(x - 1, y - 1, 2, PALETTE.paper.base), {
        motion: 'mote',
        duration: 6 + (i % 5) * 1.3,
        delay: -i * 1.1,
        path: [0, 0, ((i * 37) % 60) - 30, -40 - ((i * 23) % 40)],
      }),
    ),
  };
}

/**
 * Les plans du key art, du fond vers l'avant : le ciel, le soleil, les
 * nuages, la vieille ville, les collines (le voile du crépuscule passe ici),
 * les étoiles et les fenêtres allumées, la clairière, la colline d'Adam, les
 * lucioles, l'avant-plan.
 */
export function titleScene(): readonly TitleLayer[] {
  return [sky(), sun(), clouds(), city(), hills(), stars(), cityLights(), town(), hill(), motes(), front()];
}

/** Ce que vise la caméra quand on lance la partie : la porte de la mairie, en pixels du cadre. */
export const TITLE_DOOR = [400, 478] as const;
