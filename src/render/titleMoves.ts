/**
 * Les mouvements de la scène de l'écran titre, sans Pixi ni DOM : ce que la
 * feuille de style jouait en images clés, en données que la couche Pixi
 * (`render/titleStage.ts`) échantillonne à chaque image.
 *
 * Une **anim** (`Track`) est une animation CSS : des images clés, une durée,
 * un décalage, un nombre de tours, l'aller-retour (`alternate`), une allure
 * (`Easing`), et ce qu'elle laisse avant et après (`fill`). `sample` rend la
 * pose de l'instant ; hors de son effet, la pose de repos de l'accessoire
 * (`base`), comme une propriété que l'animation ne touche plus. Les images
 * clés se lisent par propriété, à la manière du CSS : la transformation et
 * l'opacité ont chacune les leurs, et l'allure s'applique segment par
 * segment.
 *
 * Tout est en pixels du cadre (`TITLE_ART`) et en degrés ; un pourcentage du
 * CSS (`translateY(-24%)`) devient ici une part de la boîte de l'accessoire.
 */

import { TITLE_GAZE_ADAM, type TitleProp } from '../art/titleScene.ts';

/** La pose d'un accessoire : décalage, rotation, échelle, cisaillement (degrés), opacité. */
export interface Pose {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  alpha: number;
}

type Transform = Partial<Omit<Pose, 'alpha'>>;

export type Easing = (t: number) => number;

export const REST: Readonly<Pose> = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, alpha: 1 };

/** Une courbe de Bézier cubique du CSS (`cubic-bezier(x1, y1, x2, y2)`) : y en fonction de x. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const at = (a: number, b: number, s: number): number => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  const slope = (a: number, b: number, s: number): number => 3 * a * (1 - s) * (1 - s) + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;

  return (t) => {
    if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
    // Newton d'abord, la dichotomie si la pente s'aplatit.
    let s = t;

    for (let i = 0; i < 6; i += 1) {
      const d = slope(x1, x2, s);

      if (Math.abs(d) < 1e-6) break;
      s -= (at(x1, x2, s) - t) / d;
    }
    if (Math.abs(at(x1, x2, s) - t) > 1e-4 || s < 0 || s > 1) {
      let [low, high] = [0, 1];

      s = t;
      for (let i = 0; i < 30; i += 1) {
        if (at(x1, x2, s) < t) low = s;
        else high = s;
        s = (low + high) / 2;
      }
    }
    return at(y1, y2, s);
  };
}

/** Les allures nommées du CSS, et `steps(1)` (le saut en fin de segment). */
export const EASE = {
  linear: (t: number) => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
  stepEnd: (t: number) => (t < 1 ? 0 : 1),
} as const satisfies Record<string, Easing>;

/** Les rebonds de la scène : ils dépassent leur but avant de s'y poser. */
const POP = cubicBezier(0.3, 1.6, 0.5, 1);
/** Ève à vélo : elle ralentit en arrivant, repart doucement. */
const ARRIVE = cubicBezier(0.3, 0.3, 0.5, 1);
const LEAVE = cubicBezier(0.5, 0, 0.7, 0.7);

/** Une image clé : à quelle part du tour, la transformation et/ou l'opacité, l'allure du segment qui en part. */
export interface Keyframe {
  readonly at: number;
  readonly transform?: Transform;
  readonly alpha?: number;
  readonly easing?: Easing;
}

export interface Track {
  readonly keyframes: readonly Keyframe[];
  /** En millisecondes. */
  readonly duration: number;
  readonly delay: number;
  readonly iterations: number;
  readonly alternate: boolean;
  readonly easing: Easing;
  readonly fill: 'none' | 'backwards' | 'forwards';
  /** La pose hors de l'effet, et celle des images clés qui manquent (le `from` ou le `to` omis). */
  readonly base: Readonly<Pose>;
}

type TrackOptions = Partial<Omit<Track, 'keyframes'>>;

function track(keyframes: readonly Keyframe[], options: TrackOptions = {}): Track {
  return { duration: 4000, delay: 0, iterations: Infinity, alternate: false, easing: EASE.easeInOut, fill: 'none', base: REST, ...options, keyframes };
}

/** La même pose à plusieurs instants : `0%, 35% { … }`. */
function at(offsets: readonly number[], frame: Omit<Keyframe, 'at'>): Keyframe[] {
  return offsets.map((offset) => ({ ...frame, at: offset }));
}

/** Où en est la anim à `elapsed` millisecondes de son départ : une part du tour, ou `null` hors de son effet. */
export function progress(anim: Track, elapsed: number): number | null {
  const { duration, delay, iterations, alternate, fill } = anim;
  const active = elapsed - delay;

  if (active < 0) return fill === 'backwards' ? 0 : null;
  if (active >= duration * iterations) {
    if (fill !== 'forwards') return null;
    return alternate && iterations % 2 === 0 ? 0 : 1;
  }
  const turn = Math.floor(active / duration);
  const part = (active - turn * duration) / duration;

  return alternate && turn % 2 === 1 ? 1 - part : part;
}

/** Les images clés d'une propriété, bornées à 0 et 1 par la pose de repos si le CSS les omet. */
function segment<K extends 'transform' | 'alpha'>(anim: Track, key: K, p: number): { from: Keyframe; to: Keyframe; t: number } | null {
  const frames = anim.keyframes.filter((frame) => frame[key] !== undefined);

  if (frames.length === 0) return null;
  const rest: Omit<Keyframe, 'at'> = key === 'alpha' ? { alpha: anim.base.alpha } : { transform: anim.base };
  const first = frames[0]!;
  const last = frames.at(-1)!;
  const all = [...(first.at > 0 ? [{ ...rest, at: 0 }] : []), ...frames, ...(last.at < 1 ? [{ ...rest, at: 1 }] : [])];
  let index = 0;

  while (index < all.length - 2 && p >= all[index + 1]!.at) index += 1;
  const from = all[index]!;
  const to = all[index + 1]!;
  const span = to.at - from.at;
  const local = span <= 0 ? 1 : Math.max(0, Math.min(1, (p - from.at) / span));

  return { from, to, t: (from.easing ?? anim.easing)(local) };
}

const IDENTITY: Required<Transform> = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
const CHANNELS = Object.keys(IDENTITY) as (keyof Transform)[];

/** La pose de `anim` à `elapsed` millisecondes de son départ. */
export function sample(anim: Track, elapsed: number): Pose {
  const p = progress(anim, elapsed);

  if (p === null) return { ...anim.base };
  const pose: Pose = { ...anim.base };
  const moved = segment(anim, 'transform', p);

  if (moved) {
    const from = { ...IDENTITY, ...moved.from.transform };
    const to = { ...IDENTITY, ...moved.to.transform };

    for (const channel of CHANNELS) pose[channel] = from[channel] + (to[channel] - from[channel]) * moved.t;
  }
  const faded = segment(anim, 'alpha', p);

  // Une allure qui rebondit dépasse ; l'opacité, comme en CSS, reste entre 0 et 1.
  if (faded) pose.alpha = Math.max(0, Math.min(1, faded.from.alpha! + (faded.to.alpha! - faded.from.alpha!) * faded.t));
  return pose;
}

/** Sa pose de repos, quand rien ne l'anime (`prefers-reduced-motion`, ou une anim finie). */
export function restOf(prop: TitleProp): Pose {
  switch (prop.motion) {
    case 'halo':
      return { ...REST, alpha: 0.45 };
    case 'rays':
      return { ...REST, alpha: 0.55 };
    case 'glow':
      return { ...REST, alpha: 0.7 };
    case 'smoke':
    case 'windows':
    case 'mote':
      return { ...REST, alpha: 0 };
    case 'eyelid':
      return { ...REST, scaleY: 0 };
    default:
      return { ...REST };
  }
}

/** La anim qui anime un accessoire selon son `motion`, ou `null` s'il ne bouge pas. */
export function motionTrack(prop: TitleProp): Track | null {
  if (!prop.motion) return null;
  const base = restOf(prop);
  const timing: TrackOptions = { duration: (prop.duration ?? 4) * 1000, delay: (prop.delay ?? 0) * 1000, base };
  const [fx, fy, tx, ty] = prop.path ?? [0, 0, 0, 0];
  const [turn1, turn2] = prop.turns ?? [0, 0];
  const from: Transform = { x: fx, y: fy };
  const to: Transform = { x: tx, y: ty };
  const swing = { ...timing, alternate: true };

  switch (prop.motion) {
    case 'twinkle':
      return track([{ at: 0, alpha: 0.25 }, { at: 1, alpha: 1 }], swing);
    case 'night':
      return track([...at([0, 0.35], { alpha: 0.35 }), { at: 1, alpha: 1 }], { ...swing, easing: EASE.linear });
    case 'sunset':
      return track([...at([0, 0.35], { transform: {} }), { at: 1, transform: to }], { ...swing, easing: EASE.linear });
    case 'halo':
      return track([{ at: 0, alpha: 0.3, transform: { scaleX: 0.92, scaleY: 0.92 } }, { at: 1, alpha: 0.6, transform: { scaleX: 1.06, scaleY: 1.06 } }], swing);
    case 'rays':
      return track([{ at: 1, transform: { rotation: 360 } }], { ...timing, easing: EASE.linear });
    case 'sunPulse':
      return track([{ at: 1, transform: { scaleX: 1.035, scaleY: 1.035 } }], swing);
    case 'drift':
      return track([{ at: 0, transform: from }, { at: 1, transform: to }], { ...timing, easing: EASE.linear });
    case 'flock':
      return track([{ at: 0, transform: {} }, ...at([0.55, 1], { transform: to })], { ...timing, easing: EASE.linear });
    case 'flap':
      return track([{ at: 1, transform: { scaleY: 0.3 } }], swing);
    case 'crane':
      return track([{ at: 0, transform: { rotation: -3 } }, { at: 1, transform: { rotation: 4 } }], swing);
    case 'blink':
      return track([{ at: 0.5, alpha: 0.25 }], { ...timing, easing: EASE.stepEnd });
    case 'flutter':
      return track([{ at: 1, transform: { skewY: 10, scaleX: 0.82 } }], swing);
    case 'smoke':
      return track(
        [
          { at: 0, alpha: 0, transform: { ...from, scaleX: 0.45, scaleY: 0.45 } },
          { at: 0.15, alpha: 0.95 },
          { at: 1, alpha: 0, transform: { ...to, scaleX: 1.7, scaleY: 1.7 } },
        ],
        { ...timing, easing: EASE.easeOut },
      );
    case 'windows':
      return track([...at([0, 0.55], { alpha: 0 }), ...at([0.62, 1], { alpha: 1 })], { ...swing, easing: EASE.linear });
    case 'swing':
      return track([{ at: 0, transform: { rotation: -6 } }, { at: 1, transform: { rotation: 6 } }], swing);
    case 'glow':
      return track([{ at: 0, alpha: 0, transform: { scaleX: 0.3, scaleY: 0.3 } }, { at: 0.6, alpha: 1, transform: { scaleX: 1.25, scaleY: 1.25 } }], {
        ...timing,
        duration: 700,
        iterations: 1,
        easing: POP,
        fill: 'backwards',
      });
    case 'ride':
      return track([{ at: 0, transform: from, easing: ARRIVE }, ...at([0.3, 0.45], { transform: {}, easing: LEAVE }), { at: 1, transform: to }], { ...timing, easing: EASE.linear });
    case 'spin':
      return track(
        [{ at: 0, transform: {}, easing: ARRIVE }, ...at([0.3, 0.45], { transform: { rotation: turn1 }, easing: LEAVE }), { at: 1, transform: { rotation: turn1 + turn2 } }],
        { ...timing, easing: EASE.linear },
      );
    case 'bob':
      return track([{ at: 1, transform: { y: -0.03 * prop.height } }], swing);
    case 'peek':
      return track(
        [
          ...at([0, 0.04], { alpha: 0, transform: to }),
          { at: 0.12, alpha: 1, transform: {} },
          ...at([0.26, 0.4], { transform: { rotation: -8 } }),
          ...at([0.52, 0.62], { alpha: 1, transform: {} }),
          ...at([0.72, 1], { alpha: 0, transform: to }),
        ],
        timing,
      );
    case 'grip':
      return track([...at([0, 0.06], { transform: to }), ...at([0.14, 0.62], { transform: {} }), ...at([0.7, 1], { transform: to })], timing);
    case 'eyelid':
      return track([...at([0, 0.38, 0.44, 0.78, 0.84, 1], { transform: { scaleY: 0 } }), ...at([0.41, 0.81], { transform: {} })], { ...timing, easing: EASE.linear });
    case 'sway':
      return track([{ at: 0, transform: { rotation: -2.2 } }, { at: 1, transform: { rotation: 2.2 } }], swing);
    case 'rustle':
      return track([{ at: 0, transform: { skewX: -4 } }, { at: 1, transform: { skewX: 4 } }], swing);
    case 'breathe':
      return track([{ at: 1, transform: { scaleX: 1.012, scaleY: 1.03 } }], swing);
    case 'mote':
      return track([{ at: 0, alpha: 0, transform: {} }, ...at([0.25, 0.7], { alpha: 0.9 }), { at: 1, alpha: 0, transform: to }], timing);
  }
}

/**
 * Les réactions au toucher : une anim jouée une fois à la place du
 * mouvement de l'accessoire, et le temps qu'elle tient (`hold`) avant qu'il
 * reprenne son tour, depuis le début.
 */
export type TitleReaction = 'boop' | 'swingHit' | 'flare' | 'flyOff' | 'startle' | 'hop';

export const REACTION_HOLD: Readonly<Record<TitleReaction, number>> = { boop: 900, swingHit: 1400, flare: 1400, flyOff: 7000, startle: 1600, hop: 1800 };

/** La anim d'une réaction sur cet accessoire (sa boîte donne les pourcentages du CSS). */
export function reactionTrack(reaction: TitleReaction, prop: TitleProp): Track {
  const base = restOf(prop);
  const once: TrackOptions = { iterations: 1, base };

  switch (reaction) {
    case 'boop':
      return track([{ at: 0.3, transform: { scaleX: 1.16, scaleY: 1.16 } }], { ...once, duration: 900, easing: POP });
    case 'swingHit':
      return track(
        [
          { at: 0.15, transform: { rotation: 28 } },
          { at: 0.4, transform: { rotation: -18 } },
          { at: 0.65, transform: { rotation: 9 } },
          { at: 0.85, transform: { rotation: -3 } },
        ],
        { ...once, duration: 1400, easing: EASE.easeOut },
      );
    case 'flare':
      return track([{ at: 0.2, alpha: 1, transform: { scaleX: 1.7, scaleY: 1.7 } }], { ...once, duration: 1400, easing: EASE.easeOut });
    case 'flyOff': {
      const away = { x: -5 * prop.width, y: -9 * prop.height };

      return track(
        [
          { at: 0, transform: {} },
          { at: 0.35, alpha: 1, transform: { ...away, rotation: -20 } },
          ...at([0.36, 0.88], { alpha: 0, transform: away }),
          { at: 0.89, alpha: 0, transform: { y: -0.6 * prop.height } },
          { at: 1, alpha: 1, transform: {} },
        ],
        { ...once, duration: 7000, easing: EASE.easeIn, fill: 'forwards' },
      );
    }
    case 'startle':
      return track(
        [
          { at: 0, alpha: 1, transform: {} },
          { at: 0.14, transform: { y: -0.24 * prop.height, scaleX: 0.92, scaleY: 1.1 } },
          { at: 0.3, transform: { scaleX: 1.12, scaleY: 0.88 } },
          { at: 0.4, alpha: 1, transform: {} },
          ...at([0.6, 1], { alpha: 0, transform: { y: 0.8 * prop.height } }),
        ],
        { ...once, duration: 1600, easing: EASE.easeOut, fill: 'forwards' },
      );
    case 'hop':
      return track([{ at: 0.4, transform: { y: -0.07 * prop.height, scaleX: 0.96, scaleY: 1.05 } }], { ...once, duration: 520, easing: cubicBezier(0.3, 1.5, 0.5, 1) });
  }
}

/* ------------------------------------------------- la caméra et les plans */

/** L'entrée : la caméra descend du ciel et recule sur la clairière (autour de la porte de la mairie). */
export const CAMERA_IN = track([{ at: 0, transform: { y: 54, scaleX: 1.22, scaleY: 1.22 } }], {
  duration: 2600,
  iterations: 1,
  easing: cubicBezier(0.16, 0.84, 0.3, 1),
  fill: 'backwards',
});

/** Un plan qui se pose : il monte de `rise` (pixels du cadre) en apparaissant, `order` × 110 ms après le premier. */
export function planeIn(order: number, rise: number): Track {
  return track([{ at: 0, alpha: 0, transform: { y: rise } }], { duration: 1500, delay: order * 110, iterations: 1, easing: cubicBezier(0.2, 0.8, 0.25, 1), fill: 'backwards' });
}

/** « Jouer » : la caméra plonge vers la porte, puis la scène s'efface (`TITLE_DIVE_MS`). */
export const DIVE = track([{ at: 1, transform: { scaleX: 3.4, scaleY: 3.4 } }], { duration: 1100, iterations: 1, easing: cubicBezier(0.55, 0, 0.8, 0.35), fill: 'forwards' });
export const DIVE_FADE = track([...at([0, 0.55], { alpha: 1 }), { at: 1, alpha: 0 }], { duration: 1100, iterations: 1, easing: EASE.easeIn, fill: 'forwards' });

/** Le crépuscule le plus sombre du voile (`DUSK`) : son opacité, ramenée à 1 pour l'ambiance sonore. */
export const DUSK_MAX = 0.42;

/** Le crépuscule : la scène s'assombrit lentement, puis revient au couchant (opacité du voile indigo). */
export const DUSK = track([...at([0, 0.35], { alpha: 0 }), { at: 1, alpha: DUSK_MAX }], { duration: 120_000, alternate: true, easing: EASE.linear, base: { ...REST, alpha: 0 } });

/** Une fleur que le doigt fait pousser : elle sort de terre en rebondissant. */
export const BLOOM = track([{ at: 0, transform: { scaleX: 0, scaleY: 0 } }], { duration: 600, iterations: 1, easing: POP, fill: 'backwards' });

/** « Jouer » visé : la lumière se réchauffe (opacité du voile jaune), en 500 ms. */
export const WARMTH = { alpha: 0.16, ms: 500 } as const;

/* ------------------------------------------------------ le regard du mutant */

/** Le vol d'oiseaux est à l'écran entre ces deux parts de son tour (`flock`) ; il pépie de loin en loin. */
export const FLOCK_SPAN = [0.05, 0.52] as const;
/** Le temps que met une pupille à rejoindre son regard (la transition de 160 ms du CSS d'avant). */
export const GAZE_MS = 160;

/**
 * Le décalage d'une pupille (`gaze`) dans son œil, en pixels du cadre : vers la
 * visée de la parallaxe (`aim`, de -1 à 1 par axe), ou vers Adam quand il nous
 * regarde (`watching`).
 */
export function pupilShift(prop: TitleProp, aim: { x: number; y: number }, watching: boolean): { x: number; y: number } {
  const [x, y] = watching ? TITLE_GAZE_ADAM : [aim.x, aim.y];
  const reach = prop.gaze ?? 0;

  return { x: x * reach * prop.width, y: y * reach * prop.height };
}
