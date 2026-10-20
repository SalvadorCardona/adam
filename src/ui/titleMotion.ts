/**
 * La caméra de l'écran titre, sans DOM : où elle veut aller (la visée, un
 * point de [-1, 1]²) selon la souris, l'inclinaison du téléphone ou le doigt
 * qui glisse, et le ressort amorti qui l'y mène. `ui/titleArt.ts` en fait le
 * décalage de chaque plan, `depth` fois l'amplitude.
 */

export const TITLE_MOTION = {
  /** Raideur et amortissement du ressort : un peu moins que critique, la scène se pose avec un soupçon de rebond. */
  stiffness: 34,
  damping: 9,
  /** Le pas le plus long qu'on intègre d'un coup, en secondes : un onglet qui revient ne fait pas bondir la scène. */
  maxStep: 1 / 30,
  /** Sous ces écarts, la caméra est posée : la boucle s'arrête. */
  rest: 0.002,
  /** L'inclinaison, en degrés, qui mène la visée au bord. */
  tiltRange: 18,
  /** La part de l'écran qu'un doigt parcourt pour mener la visée au bord. */
  dragReach: 0.4,
  /** Le décalage du plan le plus proche, en pixels CSS, au plus ; le vertical en prend une part. */
  amplitude: 34,
  vertical: 0.6,
} as const;

export interface Aim {
  x: number;
  y: number;
}

export interface Spring extends Aim {
  vx: number;
  vy: number;
}

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

/** Un pas du ressort vers `target`, `dt` en secondes (borné) : Euler semi-implicite, stable à toute cadence. */
export function springStep(spring: Spring, target: Aim, dt: number): Spring {
  const step = Math.max(0, Math.min(dt, TITLE_MOTION.maxStep));
  const { stiffness, damping } = TITLE_MOTION;
  const vx = spring.vx + ((target.x - spring.x) * stiffness - spring.vx * damping) * step;
  const vy = spring.vy + ((target.y - spring.y) * stiffness - spring.vy * damping) * step;

  return { x: spring.x + vx * step, y: spring.y + vy * step, vx, vy };
}

/** La caméra est arrivée : plus rien à animer tant que la visée ne bouge pas. */
export function atRest(spring: Spring, target: Aim): boolean {
  const { rest } = TITLE_MOTION;

  return Math.abs(target.x - spring.x) < rest && Math.abs(target.y - spring.y) < rest && Math.abs(spring.vx) < rest && Math.abs(spring.vy) < rest;
}

/** La souris : le centre de l'écran vise le centre, les bords les bords. */
export function pointerAim(clientX: number, clientY: number, width: number, height: number): Aim {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return { x: clamp((clientX / width) * 2 - 1), y: clamp((clientY / height) * 2 - 1) };
}

/** Le doigt qui glisse depuis `start` : un tiers d'écran ou presque mène au bord. */
export function dragAim(dx: number, dy: number, width: number, height: number): Aim {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  const reach = TITLE_MOTION.dragReach;

  return { x: clamp(dx / (width * reach)), y: clamp(dy / (height * reach)) };
}

/**
 * L'inclinaison du téléphone (`DeviceOrientationEvent` : `beta` d'avant en
 * arrière, `gamma` de gauche à droite), mesurée depuis la pose où on le tenait
 * à la première lecture (`rest`). `angle` est la rotation de l'écran
 * (`screen.orientation.angle`) : couché, les axes s'échangent.
 */
export function tiltAim(beta: number, gamma: number, rest: { beta: number; gamma: number }, angle = 0): Aim {
  const range = TITLE_MOTION.tiltRange;
  const db = beta - rest.beta;
  const dg = gamma - rest.gamma;
  const turn = ((Math.round(angle / 90) % 4) + 4) % 4;
  const [x, y] = turn === 1 ? [db, -dg] : turn === 2 ? [-dg, -db] : turn === 3 ? [-db, dg] : [dg, db];

  return { x: clamp(x / range), y: clamp(y / range) };
}
