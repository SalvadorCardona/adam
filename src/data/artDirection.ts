/**
 * Direction artistique — la version exécutable de `docs/art-direction.md`.
 *
 * **Vectoriel « post-apo joyeux »** : la fin du monde est passée, la vie
 * reprend ses droits sur la ruine. Des formes géométriques pures, trois tons
 * par objet, une palette courte et saturée, aucun contour.
 *
 * Tout visuel du jeu est un SVG construit avec les helpers de ce fichier :
 * ils n'acceptent que les couleurs de `PALETTE` et `GROUND` (c'est le type
 * `Color` qui l'impose), ne tracent jamais de contour autour d'une forme, et
 * n'ont qu'une épaisseur de trait, `STROKE.width`. Un visuel qui a besoin
 * d'une couleur ou d'une forme absente d'ici n'invente pas : il l'ajoute ici,
 * et le document suit.
 *
 * Contenu pur, sans DOM ni Pixi : les helpers rendent des chaînes SVG, que
 * les modules de `src/art/` assemblent, que les tests lisent en Node et que
 * `render/spriteLibrary.ts` rastérise à la résolution de l'écran.
 *
 * Les coordonnées sont en **pixels monde** : une tuile fait 32 px.
 */

/** Nom court de la direction, pour les logs et le README. */
export const ART_DIRECTION_NAME = 'Vectoriel « post-apo joyeux »';

/* ----------------------------------------------------------------- palette */

/**
 * Les teintes, en trois tons chacune :
 * - `base` : la couleur de la forme ;
 * - `shade` : son ombre, **la même teinte tirée vers le violet/bleu** —
 *   jamais du gris, jamais du noir, jamais une transparence noire. Seuls le
 *   jaune et l'orange, sur la maquette validée, glissent vers l'ambre et le
 *   rouge : chaud et saturé, jamais terne ;
 * - `light` : le reflet, une capsule claire posée à l'intérieur de la forme.
 *
 * Valeurs relevées au pixel sur la maquette validée
 * (`docs/art-direction/maquette-validee.png`). L'indigo remplace le noir et
 * le marron : les troncs, les cheveux, les traits de détail sont indigo.
 */
export const PALETTE = {
  ink: { base: '#2b2d8f', shade: '#1f2070', light: '#3d40b8' },
  violet: { base: '#7b5cff', shade: '#5a3fd6', light: '#a08bff' },
  yellow: { base: '#ffd23f', shade: '#ffa91a', light: '#fff27a' },
  coral: { base: '#ff4d6d', shade: '#d92a5b', light: '#ff8aa3' },
  orange: { base: '#ff7b2e', shade: '#e05a1a', light: '#ffa84d' },
  mint: { base: '#2fd67b', shade: '#15a866', light: '#8ff5b5' },
  cyan: { base: '#45d6ff', shade: '#2fb8ea', light: '#b8f1ff' },
  /** Vert fluo radioactif : **réservé** aux mutants et à leurs flaques. */
  toxic: { base: '#7df25f', shade: '#3fcf6a', light: '#d2ffb8' },
  skin: { base: '#ffc9a3', shade: '#f29a8c', light: '#ffe2cf' },
  /** Blanc du HUD, des yeux, des os. Son ombre est lavande, pas grise. */
  paper: { base: '#ffffff', shade: '#dcdcff', light: '#ffffff' },
} as const;

/**
 * Les sols. `alt` est la variation d'un sol (l'herbe du jeu n'en use plus :
 * c'est une prairie continue, sans damier) ; `shade` est l'ombre portée
 * **pleine** des objets posés dessus — une teinte plus foncée du sol, jamais
 * une transparence. `light` borde le sol côté lumière (le liseré du sable).
 *
 * L'herbe a ses taches de prairie, aux bords ronds : `meadow`, plus claire,
 * et `thicket`, plus dense ; et la terre battue de ses chemins, `trail`,
 * avec la trace plus claire du milieu, `trailLight`.
 *
 * L'eau est un dégradé continu sur la distance à la rive (`render/waterShader.ts`) :
 * `shallow`, turquoise clair contre le sable, puis `base`, l'eau franche, et
 * `deep`, le bleu du fond des grands lacs ; `light` fait ses crêtes et ses
 * reflets, et l'écume est blanche (`PALETTE.paper`). `alt` est l'eau de la
 * carte du monde.
 */
export const GROUND = {
  grass: {
    base: '#93e8ae',
    alt: '#8ae0a6',
    shade: '#62c894',
    light: '#b3f2c6',
    meadow: '#a8eebf',
    thicket: '#82d89c',
    trail: '#ebd39a',
    trailLight: '#f6e6bf',
  },
  sand: { base: '#ffd98a', alt: '#ffd382', shade: '#f2b766', light: '#ffe9b8' },
  water: { base: '#45d6ff', alt: '#3ccaf8', shallow: '#74ecec', deep: '#3a94f2', shade: '#2fb8ea', light: '#b8f1ff' },
  rock: { base: '#b8c3ff', alt: '#afbaf9', shade: '#8a97e6', light: '#d3daff' },
} as const;

export type Tone = keyof typeof PALETTE;
export type Ground = keyof typeof GROUND;

/** Une couleur autorisée : un ton de `PALETTE` ou de `GROUND`, rien d'autre. */
export type Color =
  | (typeof PALETTE)[Tone][keyof (typeof PALETTE)[Tone]]
  | { [G in Ground]: (typeof GROUND)[G][keyof (typeof GROUND)[G]] }[Ground];

/** Toutes les couleurs autorisées, pour les tests et les outils. */
export const COLORS: ReadonlySet<string> = new Set<string>([
  ...Object.values(PALETTE).flatMap((tone) => Object.values(tone)),
  ...Object.values(GROUND).flatMap((ground) => Object.values(ground)),
]);

/** `'#ff4d6d'` → `0xff4d6d`, pour Pixi (teintes, `Graphics`). */
export function hex(color: Color): number {
  return Number.parseInt(color.slice(1), 16);
}

/**
 * Teinte dominante réservée à chaque famille d'objets : c'est ce qui rend la
 * carte lisible en un coup d'œil. Deux familles ne partagent jamais leur
 * teinte dominante — en particulier, les ruines violettes ne ressemblent pas
 * aux rochers, et le vert fluo n'appartient qu'aux mutants.
 */
export const FAMILY_TONES = {
  vegetation: 'mint',
  water: 'cyan',
  ruins: 'violet',
  colony: 'yellow',
  humans: 'orange',
  stone: 'coral',
  iron: 'cyan',
  coal: 'ink',
  mutants: 'toxic',
} as const satisfies Record<string, Tone>;

/* ------------------------------------------------------- formes et lumière */

/**
 * Rayons, cohérents d'un objet à l'autre. Une capsule (`pill`) prend toujours
 * la moitié de sa plus petite dimension ; tout le reste pioche ici.
 */
export const RADIUS = {
  /** Fenêtres, planches, petites pièces. */
  small: 3,
  /** Murs, rochers, caisses : le rectangle « très arrondi » de base. */
  block: 8,
  /** Grands volumes : mairie, ruines. */
  large: 12,
} as const;

/**
 * Le trait, réservé aux petits détails (échelles, rambardes, grues, antennes,
 * hampes, tiges, lianes) : **une seule épaisseur**, bouts et angles arrondis,
 * en indigo ou dans la teinte foncée de l'objet. Jamais autour d'une forme.
 */
export const STROKE = { width: 2, cap: 'round', join: 'round' } as const;

/**
 * La lumière vient toujours d'en haut à gauche. Le reflet se pose en haut à
 * gauche de la forme ; l'ombre portée part en bas à droite.
 */
export const LIGHT = {
  /** Direction d'où vient la lumière. */
  from: { x: -1, y: -1 },
  /** Décalage de l'ombre portée, en pixels monde. */
  shadowOffset: { x: 3, y: 2 },
  /** Reflet : marge depuis le bord haut-gauche et taille, en fraction de la forme. */
  highlight: { inset: 0.14, width: 0.42, height: 0.16 },
} as const;

/** Les couleurs qu'un trait peut prendre : l'indigo, ou la teinte foncée d'un objet. */
export type StrokeColor = (typeof PALETTE)['ink']['base' | 'light'] | (typeof PALETTE)[Tone]['shade'];

/* ------------------------------------------------------------- particules */

/** Les formes de particule : un morceau du sprite `particles` chacune (`art/particles.ts`). */
export type ParticleShape = 'chip' | 'shard' | 'spark' | 'drop' | 'square';

export interface ParticleStyle {
  shape: ParticleShape;
  /** Chaque particule pioche sa couleur ici. */
  colors: readonly Color[];
  /** Durée de vie moyenne, en millisecondes. */
  lifeMs: number;
  /** Pixels monde par milliseconde au carré : légère pour un copeau, sèche pour un éclat. */
  gravity: number;
  /** Tourne sur elle-même en vol. */
  spin: boolean;
  /** Une goutte tombée laisse au sol une flaque de cette couleur. */
  puddle?: Color;
}

/**
 * Ce qui saute quand on frappe, par famille : la forme dit ce qu'on a
 * touché avant la couleur. Copeaux orange qui tournent et retombent
 * doucement, éclats de roche secs, étincelles de fer très brèves, gouttes
 * fluo qui laissent une flaque ; les confettis restent des carrés.
 */
export const PARTICLES = {
  wood: { shape: 'chip', colors: [PALETTE.orange.base, PALETTE.orange.light], lifeMs: 400, gravity: 0.0006, spin: true },
  stone: { shape: 'shard', colors: [GROUND.rock.base, GROUND.rock.shade], lifeMs: 250, gravity: 0.0016, spin: false },
  iron: { shape: 'spark', colors: [PALETTE.cyan.light], lifeMs: 150, gravity: 0.0002, spin: false },
  coal: { shape: 'shard', colors: [PALETTE.ink.base, PALETTE.ink.light], lifeMs: 250, gravity: 0.0016, spin: false },
  food: { shape: 'chip', colors: [PALETTE.yellow.base, PALETTE.mint.base, PALETTE.mint.light], lifeMs: 400, gravity: 0.0006, spin: true },
  bone: { shape: 'shard', colors: [PALETTE.paper.base, PALETTE.paper.shade], lifeMs: 300, gravity: 0.0012, spin: false },
  claw: { shape: 'shard', colors: [PALETTE.orange.base, PALETTE.orange.light, PALETTE.coral.base], lifeMs: 300, gravity: 0.0012, spin: false },
  fur: { shape: 'chip', colors: [PALETTE.violet.base, PALETTE.violet.light], lifeMs: 400, gravity: 0.0006, spin: true },
  /** L'eau tirée du puits : des gouttes cyan, sans flaque. */
  water: { shape: 'drop', colors: [PALETTE.cyan.base, PALETTE.cyan.light], lifeMs: 400, gravity: 0.0012, spin: false },
  mutant: { shape: 'drop', colors: [PALETTE.toxic.base], lifeMs: 450, gravity: 0.0012, spin: false, puddle: PALETTE.toxic.shade },
  /** La pluie acide qui ronge un bâtiment : des gouttes menthe, sans flaque. */
  acid: { shape: 'drop', colors: [PALETTE.mint.light, PALETTE.mint.base, PALETTE.cyan.light], lifeMs: 400, gravity: 0.0009, spin: false },
  rubble: { shape: 'shard', colors: [PALETTE.yellow.base, PALETTE.yellow.shade, PALETTE.orange.base, PALETTE.violet.light], lifeMs: 450, gravity: 0.0012, spin: false },
  confetti: {
    shape: 'square',
    colors: [PALETTE.yellow.base, PALETTE.coral.base, PALETTE.cyan.base, PALETTE.mint.base, PALETTE.violet.base],
    lifeMs: 500,
    gravity: 0.0009,
    spin: true,
  },
  /** L'impact d'une boule de feu : des braises. */
  ember: { shape: 'spark', colors: [PALETTE.orange.base, PALETTE.yellow.base, PALETTE.yellow.light], lifeMs: 350, gravity: 0.0006, spin: false },
  star: { shape: 'square', colors: [PALETTE.yellow.base, PALETTE.yellow.light, PALETTE.paper.base], lifeMs: 500, gravity: 0.0009, spin: true },
} as const satisfies Record<string, ParticleStyle>;

export type ParticleFamily = keyof typeof PARTICLES;

/** L'ombre d'une particule en l'air, et l'anneau de poussière d'un bâtiment achevé. */
export const PARTICLE_SHADOW: Color = PALETTE.violet.shade;
export const DUST: Color = PALETTE.paper.shade;

/**
 * L'allumage de l'antenne : `count` ondes cyan claires partent de l'émetteur
 * l'une après l'autre et s'élargissent jusqu'à couvrir l'écran, pendant
 * `durationMs` ; l'écran du Signal ne s'ouvre qu'après.
 */
export const SIGNAL_WAVES = {
  color: PALETTE.cyan.light,
  count: 4,
  durationMs: 4500,
  /** Épaisseur d'une onde, en pixels écran. */
  thickness: 10,
} as const;

/* ------------------------------------------------------------ primitives */

/** Nombre court et stable dans le SVG : deux décimales au plus. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Un document SVG complet, cadre `width × height` en pixels monde. */
export function svg(width: number, height: number, ...body: string[]): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}">${body.join('')}</svg>`
  );
}

/** Un groupe transformé : `translate(…)`, `scale(-1 1)`, `rotate(…)`. */
export function group(transform: string, ...body: string[]): string {
  return `<g transform="${transform}">${body.join('')}</g>`;
}

/**
 * Pose un SVG complet (un sprite, un morceau) dans un autre, son coin haut
 * gauche en (x, y), agrandi de `scale` : c'est ainsi qu'on compose une scène
 * — l'icône, la bannière — avec les sprites du jeu, sans les redessiner.
 */
export function embed(source: string, x: number, y: number, scale = 1): string {
  const body = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

  return group(`translate(${n(x)} ${n(y)}) scale(${n(scale)})`, body);
}

/** Miroir horizontal d'un contenu, autour de l'axe vertical `x = axis`. */
export function mirrorX(axis: number, ...body: string[]): string {
  return group(`translate(${n(axis * 2)} 0) scale(-1 1)`, ...body);
}

/** Rectangle arrondi. Rayon par défaut : `RADIUS.block`, borné à la moitié du côté. */
export function rect(x: number, y: number, w: number, h: number, color: Color, r: number = RADIUS.block): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));

  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(radius)}" fill="${color}"/>`;
}

/** Capsule : un rectangle dont le rayon est la moitié de la plus petite dimension. */
export function pill(x: number, y: number, w: number, h: number, color: Color): string {
  return rect(x, y, w, h, color, Math.min(w, h) / 2);
}

export function circle(cx: number, cy: number, r: number, color: Color): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${color}"/>`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, color: Color): string {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}"/>`;
}

/** Polygone plein : toits, fanions, pointes. `points` = x0, y0, x1, y1… */
export function polygon(points: readonly number[], color: Color): string {
  return `<polygon points="${points.map(n).join(' ')}" fill="${color}"/>`;
}

/**
 * Chemin plein, pour les rares formes que les primitives ne couvrent pas (un
 * quart de rond, un anneau). `evenOdd` perce les sous-chemins intérieurs.
 */
export function shape(d: string, color: Color, evenOdd = false): string {
  return `<path d="${d}" fill="${color}"${evenOdd ? ' fill-rule="evenodd"' : ''}/>`;
}

/** Un anneau (un pneu, une bouée) : une ellipse percée d'une ellipse plus petite. */
export function ring(cx: number, cy: number, rx: number, ry: number, thickness: number, color: Color): string {
  const ix = rx - thickness;
  const iy = ry - thickness * (ry / rx);
  const loop = (a: number, b: number): string =>
    `M${n(cx - a)} ${n(cy)}a${n(a)} ${n(b)} 0 1 0 ${n(a * 2)} 0a${n(a)} ${n(b)} 0 1 0 ${n(-a * 2)} 0Z`;

  return shape(loop(rx, ry) + loop(ix, iy), color, true);
}

/** Un trait de détail : épaisseur unique, bouts ronds. */
export function line(x1: number, y1: number, x2: number, y2: number, color: StrokeColor): string {
  return (
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" ` +
    `stroke-width="${STROKE.width}" stroke-linecap="${STROKE.cap}"/>`
  );
}

/** Une ligne brisée de détail : même épaisseur, angles arrondis, jamais fermée autour d'une forme. */
export function polyline(points: readonly number[], color: StrokeColor): string {
  return (
    `<polyline points="${points.map(n).join(' ')}" fill="none" stroke="${color}" ` +
    `stroke-width="${STROKE.width}" stroke-linecap="${STROKE.cap}" stroke-linejoin="${STROKE.join}"/>`
  );
}

/** Un arc de détail (l'arc d'Adam, une anse) : `d` est un chemin ouvert. */
export function curve(d: string, color: StrokeColor): string {
  return (
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${STROKE.width}" ` +
    `stroke-linecap="${STROKE.cap}" stroke-linejoin="${STROKE.join}"/>`
  );
}

/* -------------------------------------------------------------- trois tons */

/**
 * Le reflet : une capsule claire **à l'intérieur** de la forme, en haut à
 * gauche, jamais collée au bord. `x, y, w, h` sont ceux de la forme éclairée.
 */
export function highlight(x: number, y: number, w: number, h: number, tone: Tone): string {
  const { inset, width, height } = LIGHT.highlight;
  const hh = Math.max(2, h * height);

  return pill(x + Math.max(2, w * inset), y + Math.max(2, h * inset * 0.8), Math.max(hh, w * width), hh, PALETTE[tone].light);
}

/**
 * Un volume vu en 3/4 : le dessus en couleur de base, la face avant en
 * ombre (même teinte tirée vers le violet), le reflet sur le dessus.
 *
 * `depth` est la hauteur de face avant visible sous le dessus. C'est la
 * brique de base des murs, des rochers, des caisses, des ruines.
 */
export function shadedBlock(
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  tone: Tone,
  r: number = RADIUS.block,
): string {
  const colors = PALETTE[tone];

  return (
    rect(x, y, w, h, colors.shade, r) +
    rect(x, y, w, h - depth, colors.base, r) +
    highlight(x, y, w, h - depth, tone)
  );
}

/** Une capsule en trois tons : la même règle que `shadedBlock`, pour les formes rondes. */
export function shadedPill(x: number, y: number, w: number, h: number, depth: number, tone: Tone): string {
  const colors = PALETTE[tone];

  return pill(x, y, w, h, colors.shade) + pill(x, y, w, h - depth, colors.base) + highlight(x, y, w, h - depth, tone);
}

/** Un disque en trois tons : ombre en croissant en bas à droite, reflet en haut à gauche. */
export function shadedCircle(cx: number, cy: number, r: number, tone: Tone): string {
  const colors = PALETTE[tone];

  return (
    circle(cx, cy, r, colors.shade) +
    circle(cx - r * 0.12, cy - r * 0.14, r * 0.86, colors.base) +
    pill(cx - r * 0.62, cy - r * 0.58, r * 0.62, Math.max(2, r * 0.3), colors.light)
  );
}

/**
 * L'ombre portée : pleine, dans la teinte foncée du sol, décalée en bas à
 * droite. `cx, cy` est le pied de l'objet ; `w × h` la taille de l'ombre.
 */
export function groundShadow(cx: number, cy: number, w: number, h: number, ground: Ground = 'grass'): string {
  const { x, y } = LIGHT.shadowOffset;

  return pill(cx - w / 2 + x, cy - h / 2 + y, w, h, GROUND[ground].shade);
}

/* ---------------------------------------------------- détails qui racontent */

/**
 * Un coussin de feuillage : une capsule aplatie en trois tons (base foncée,
 * dessus menthe, reflet). Les arbres sont des coussins empilés, jamais des boules.
 */
export function cushion(cx: number, cy: number, w: number, h: number, tone: Tone = 'mint'): string {
  const colors = PALETTE[tone];
  const top = h * 0.72;

  return (
    pill(cx - w / 2, cy - h / 2, w, h, colors.shade) +
    pill(cx - w / 2, cy - h / 2, w, top, colors.base) +
    pill(cx - w / 2 + w * 0.14, cy - h / 2 + Math.max(1.5, h * 0.12), w * 0.42, Math.max(2, h * 0.2), colors.light)
  );
}

/** Une échelle : deux montants et des barreaux, au trait. */
export function ladder(x: number, y: number, h: number, color: StrokeColor = PALETTE.ink.base, width = 7): string {
  let rungs = '';

  for (let ry = y + 4; ry < y + h - 1; ry += 5) rungs += line(x, ry, x + width, ry, color);
  return line(x, y, x, y + h, color) + line(x + width, y, x + width, y + h, color) + rungs;
}

/** Une rambarde : une lisse haute et des poteaux régulièrement espacés. */
export function railing(x: number, y: number, w: number, h: number, posts: number, color: StrokeColor = PALETTE.ink.base): string {
  let result = line(x, y, x + w, y, color);

  for (let i = 0; i < posts; i += 1) {
    const px = x + (posts === 1 ? w / 2 : (w * i) / (posts - 1));

    result += line(px, y, px, y + h, color);
  }
  return result;
}

/** Un drapeau : une hampe au trait, un fanion en capsule arrondie côté hampe. */
export function flag(x: number, y: number, h: number, tone: Tone, pole: StrokeColor = PALETTE.ink.base): string {
  const colors = PALETTE[tone];

  return (
    line(x, y, x, y + h, pole) +
    rect(x, y, 11, 7, colors.base, RADIUS.small) +
    pill(x + 1.5, y + 1.5, 5, 2, colors.light)
  );
}

/** Une fleur : une tige au trait, une corolle ronde, un cœur jaune. */
export function flower(x: number, y: number, tone: Tone, size = 1): string {
  const r = 2.2 * size;
  const heart: Tone = tone === 'yellow' ? 'orange' : 'yellow';

  return (
    line(x, y, x, y + 4 * size, PALETTE.mint.shade) +
    circle(x, y, r, PALETTE[tone].base) +
    circle(x, y, r * 0.45, PALETTE[heart].base)
  );
}

/** Une feuille en capsule, tournée de `angle` degrés autour de son point d'attache. */
export function leaf(x: number, y: number, angle: number, size = 1): string {
  return group(
    `translate(${n(x)} ${n(y)}) rotate(${n(angle)})`,
    pill(0, -1.6 * size, 6 * size, 3.2 * size, PALETTE.mint.base),
  );
}

/**
 * Une liane : un tracé **régulier** (une ligne brisée, pas un gribouillis)
 * et des feuilles en capsule, alternées de part et d'autre, à pas fixe.
 * `points` = x0, y0, x1, y1… du haut vers le bas.
 */
export function vine(points: readonly number[], leaves = 3): string {
  let result = polyline(points, PALETTE.mint.shade);
  const count = points.length / 2;

  for (let i = 0; i < leaves; i += 1) {
    const t = (i + 0.5) / leaves;
    const segment = Math.min(count - 2, Math.floor(t * (count - 1)));
    const local = t * (count - 1) - segment;
    const x = points[segment * 2]! + (points[segment * 2 + 2]! - points[segment * 2]!) * local;
    const y = points[segment * 2 + 1]! + (points[segment * 2 + 3]! - points[segment * 2 + 1]!) * local;

    result += leaf(x, y, i % 2 === 0 ? -30 : 210);
  }
  return result;
}

/** Une fenêtre arrondie, en creux : la teinte foncée du mur, un reflet en haut. */
export function windowPane(x: number, y: number, w: number, h: number, wall: Tone): string {
  return rect(x, y, w, h, PALETTE[wall === 'violet' ? 'ink' : 'violet'].shade, Math.min(w, h) / 2) +
    pill(x + w * 0.2, y + h * 0.18, w * 0.6, Math.max(1.5, h * 0.18), PALETTE.violet.light);
}

/* --------------------------------------------------------------- contrôle */

/** Couleurs de trait permises : l'indigo et les teintes foncées. */
const STROKE_COLORS: ReadonlySet<string> = new Set<string>([
  PALETTE.ink.base,
  PALETTE.ink.light,
  ...Object.values(PALETTE).map((tone) => tone.shade),
]);

/**
 * Relit un SVG contre les règles et rend la liste de ce qui les enfreint —
 * vide quand tout va bien. Les tests la passent sur **chaque** sprite ; c'est
 * ce qui rend la direction artistique vérifiable plutôt que souhaitée.
 *
 * Ce qu'elle attrape : une couleur hors palette (donc tout gris, tout noir),
 * un contour autour d'une forme pleine, un trait d'une autre épaisseur, une
 * transparence, un dégradé, un filtre, du texte ou une image bitmap.
 */
export function auditSvg(source: string): string[] {
  const problems = new Set<string>();

  for (const [, value] of source.matchAll(/\bfill="([^"]*)"/g)) {
    if (value !== 'none' && !COLORS.has(value!)) problems.add(`remplissage hors palette : ${value}`);
  }
  for (const [, value] of source.matchAll(/\bstroke="([^"]*)"/g)) {
    if (!STROKE_COLORS.has(value!)) problems.add(`trait d'une couleur interdite : ${value}`);
  }
  for (const [, value] of source.matchAll(/\bstroke-width="([^"]*)"/g)) {
    if (Number(value) !== STROKE.width) problems.add(`trait d'épaisseur ${value}, une seule est permise : ${STROKE.width}`);
  }
  for (const [element] of source.matchAll(/<[a-z]+\b[^>]*>/g)) {
    const filled = /\bfill="(?!none)[^"]*"/.test(element);

    if (filled && /\bstroke="/.test(element)) problems.add(`contour autour d'une forme : ${element.slice(0, 60)}`);
  }
  for (const [forbidden, label] of [
    [/opacity=/, 'transparence'],
    [/Gradient/, 'dégradé'],
    [/<filter|filter=/, 'filtre'],
    [/<text\b/, 'texte'],
    [/<image\b/, 'image bitmap'],
    [/rgba?\(|hsla?\(/, 'couleur hors palette'],
  ] as const) {
    if (forbidden.test(source)) problems.add(label);
  }
  return [...problems];
}
