/**
 * La manette : PlayStation, Xbox, Steam Deck — la logique, sans DOM.
 *
 * Le navigateur expose les manettes par l'API Gamepad ; avec le mapping
 * « standard » (`gamepad.mapping === 'standard'`), un bouton a le même
 * indice quelle que soit la marque : `buttons[0]` est le bouton du bas
 * (✕ sur une PlayStation, A sur une Xbox ou un Steam Deck), `axes[0..1]` le
 * stick gauche, `axes[2..3]` le droit. Steam Input présente le Steam Deck
 * comme une manette Xbox : il prend les étiquettes de la Xbox.
 *
 * Ce fichier ne lit que des **instantanés** (`PadSnapshot` : axes et
 * boutons) — c'est `gamepadDevice.ts` qui les tire de `navigator`, une fois
 * par frame. Ici :
 *
 * - la zone morte radiale, remise à l'échelle comme celle du joystick
 *   tactile (`deadZone`), et la courbe douce du curseur (`cursorVelocity`) ;
 * - la détection d'un **nouvel appui** (`PadReader.pressed`) : vrai une seule
 *   frame, au passage de relâché à enfoncé — jamais deux fois pour un même
 *   appui ; la croix se répète si on la tient (`repeated`) ;
 * - la bascule de mode (`InputMode`) : la manette sert, le curseur virtuel
 *   paraît ; la souris ou le doigt servent, il disparaît ;
 * - la navigation à la croix (`nearestInDirection`) : l'élément le plus
 *   proche dans la direction choisie.
 *
 * Testé en Node avec une manette simulée (`gamepad.test.ts`).
 */

/** Les boutons du mapping standard, par leur rôle. */
export const PAD_BUTTONS = {
  /** Le bouton du bas : ✕ / A. Le clic. */
  south: 0,
  /** Le bouton de droite : ○ / B. Retour, fermer. */
  east: 1,
  /** Le bouton de gauche : □ / X. « Bâtir ». */
  west: 2,
  /** Le bouton du haut : △ / Y. Le sac. */
  north: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  /** Share / View : la carte du monde. */
  select: 8,
  /** Options / Menu : la pause. */
  start: 9,
  l3: 10,
  /** Clic du stick droit : revenir sur Adam. */
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export type PadButton = keyof typeof PAD_BUTTONS;

/** Les quatre directions de la croix. */
export type PadDirection = 'up' | 'down' | 'left' | 'right';

export const PAD_DIRECTIONS: readonly PadDirection[] = ['up', 'down', 'left', 'right'];

/** Les réglages de la manette. La zone morte se règle aussi dans les Réglages (`storage/localGamepad.ts`). */
export const GAMEPAD = {
  /** Zone morte des sticks, en part de leur course : sous elle, rien ne bouge. */
  deadZone: 0.15,
  /** Bornes et pas du réglage de la zone morte. */
  deadZoneRange: { min: 0.05, max: 0.4, step: 0.05 },
  /** Vitesse du curseur, stick à fond, en hauteurs d'écran par seconde. */
  cursorSpeed: 1.1,
  /** Exposant de la courbe du curseur : au-dessus de 1, un petit geste vise fin, un grand traverse l'écran. */
  cursorCurve: 2,
  /** La croix tenue se répète : après ce délai, puis à ce rythme, en ms. */
  repeatDelayMs: 380,
  repeatEveryMs: 120,
  /** Une gâchette compte comme enfoncée au-delà de cette course. */
  triggerThreshold: 0.35,
  /** Vitesse du zoom aux gâchettes, gâchette à fond : facteur par seconde. */
  zoomPerSecond: 2.2,
} as const;

/** Ce qu'on lit d'un bouton : `GamepadButton`. */
export interface PadButtonState {
  pressed: boolean;
  value: number;
}

/** Une manette à un instant : ce qu'on lit de `Gamepad`. */
export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly PadButtonState[];
}

export interface Axis2 {
  x: number;
  y: number;
}

/**
 * La zone morte, **radiale** : sous `zone`, (0, 0) ; au-delà, la direction
 * gardée et l'amplitude remise à l'échelle depuis le seuil — la vitesse part
 * de zéro au lieu de sauter d'un coup à 15 %. Norme bornée à 1 : un stick
 * poussé dans un coin ne va pas plus vite qu'en ligne droite.
 */
export function deadZone(x: number, y: number, zone: number = GAMEPAD.deadZone): Axis2 {
  const length = Math.hypot(x, y);

  if (!Number.isFinite(length) || length <= zone) return { x: 0, y: 0 };

  const amplitude = Math.min(1, (length - zone) / (1 - zone));

  return { x: (x / length) * amplitude, y: (y / length) * amplitude };
}

/**
 * La vitesse du curseur, en pixels CSS par seconde, pour un stick à (`x`, `y`) :
 * proportionnelle à l'inclinaison, sur une courbe douce (`cursorCurve`).
 * `height` : la hauteur de l'écran, pour que le curseur traverse un Steam
 * Deck et un grand écran dans le même temps.
 */
export function cursorVelocity(x: number, y: number, height: number, zone: number = GAMEPAD.deadZone): Axis2 {
  const axis = deadZone(x, y, zone);
  const amplitude = Math.hypot(axis.x, axis.y);

  if (amplitude === 0) return { x: 0, y: 0 };

  const speed = Math.pow(amplitude, GAMEPAD.cursorCurve) * GAMEPAD.cursorSpeed * height;

  return { x: (axis.x / amplitude) * speed, y: (axis.y / amplitude) * speed };
}

/** Le curseur reste dans l'écran : (`x`, `y`) borné à [0, `width` − 1] × [0, `height` − 1]. */
export function clampToScreen(x: number, y: number, width: number, height: number): Axis2 {
  return { x: Math.min(Math.max(x, 0), Math.max(0, width - 1)), y: Math.min(Math.max(y, 0), Math.max(0, height - 1)) };
}

/** La famille de la manette, pour ses étiquettes : ✕ ○ △ □, ou A B X Y. */
export type PadKind = 'playstation' | 'xbox';

export const PAD_KINDS: readonly PadKind[] = ['playstation', 'xbox'];

/**
 * Les boutons à nom, tels qu'ils sont gravés sur la manette — des noms
 * propres, les mêmes dans toutes les langues. Le Steam Deck, sous Steam
 * Input, prend ceux de la Xbox.
 */
export const PAD_NAMES = {
  playstation: { l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', r3: 'R3', start: 'Options', select: 'Share' },
  xbox: { l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', r3: 'R3', start: 'Menu', select: 'View' },
} as const satisfies Record<PadKind, Partial<Record<PadButton, string>>>;

/**
 * La famille d'après `Gamepad.id` : Sony (vendeur 054c), DualShock,
 * DualSense… sont des PlayStation ; tout le reste — Xbox, Steam Deck sous
 * Steam Input, manettes génériques — prend les étiquettes de la Xbox, celles
 * que le mapping standard décrit.
 */
export function padKindOf(id: string): PadKind {
  return /054c|playstation|dualshock|dualsense|sony|ps[345]/i.test(id) ? 'playstation' : 'xbox';
}

/**
 * Lit les instantanés successifs d'une manette et en tire des **appuis**.
 *
 * `update` à chaque frame ; entre deux `update`, `pressed(b)` ne vaut vrai
 * que si le bouton vient de s'enfoncer — un appui tenu ne redéclenche rien.
 * Une manette qui arrive (ou revient) ne déclenche rien au premier
 * instantané : le bouton qui l'a réveillée est déjà tenu, il ne clique pas
 * au hasard.
 */
export class PadReader {
  private previous: readonly boolean[] = [];
  private current: readonly boolean[] = [];
  private snapshot: PadSnapshot | null = null;
  /** Quand chaque direction de la croix doit se répéter, en ms. */
  private readonly repeatAt = new Map<PadDirection, number>();
  private readonly repeats = new Set<PadDirection>();

  /** La manette connectée, s'il y en a une. */
  public get connected(): boolean {
    return this.snapshot !== null;
  }

  /** Le dernier instantané, `null` sans manette ; `now` en ms. */
  public update(snapshot: PadSnapshot | null, now: number): void {
    const fresh = this.snapshot === null;

    this.snapshot = snapshot;
    this.repeats.clear();
    if (!snapshot) {
      this.previous = [];
      this.current = [];
      this.repeatAt.clear();
      return;
    }

    const held = snapshot.buttons.map((button, index) => isDown(button, index));

    this.previous = fresh ? held : this.current;
    this.current = held;

    for (const direction of PAD_DIRECTIONS) {
      if (!this.held(direction)) {
        this.repeatAt.delete(direction);
        continue;
      }
      if (this.pressed(direction)) {
        this.repeatAt.set(direction, now + GAMEPAD.repeatDelayMs);
        this.repeats.add(direction);
        continue;
      }

      const at = this.repeatAt.get(direction);

      if (at !== undefined && now >= at) {
        this.repeatAt.set(direction, now + GAMEPAD.repeatEveryMs);
        this.repeats.add(direction);
      }
    }
  }

  /** Le bouton est enfoncé. */
  public held(button: PadButton): boolean {
    return this.current[PAD_BUTTONS[button]] ?? false;
  }

  /** Le bouton vient de s'enfoncer, à cette frame-ci seulement. */
  public pressed(button: PadButton): boolean {
    const index = PAD_BUTTONS[button];

    return (this.current[index] ?? false) && !(this.previous[index] ?? false);
  }

  /** Le bouton vient d'être relâché. */
  public released(button: PadButton): boolean {
    const index = PAD_BUTTONS[button];

    return !(this.current[index] ?? false) && (this.previous[index] ?? false);
  }

  /** Une direction de la croix : à l'appui, puis en répétition tant qu'on la tient. */
  public repeated(direction: PadDirection): boolean {
    return this.repeats.has(direction);
  }

  /** La course d'un bouton analogique (une gâchette), de 0 à 1. */
  public value(button: PadButton): number {
    const state = this.snapshot?.buttons[PAD_BUTTONS[button]];

    return state ? Math.max(state.value, state.pressed ? 1 : 0) : 0;
  }

  /** Un stick, brut (sans zone morte). */
  public stick(side: 'left' | 'right'): Axis2 {
    const axes = this.snapshot?.axes ?? [];
    const offset = side === 'left' ? 0 : 2;

    return { x: finite(axes[offset]), y: finite(axes[offset + 1]) };
  }

  /** La manette sert à cette frame : un bouton tenu, un stick hors de la zone morte. */
  public active(zone: number = GAMEPAD.deadZone): boolean {
    if (!this.snapshot) return false;
    if (this.current.some(Boolean)) return true;

    const left = this.stick('left');
    const right = this.stick('right');

    return Math.hypot(left.x, left.y) > zone || Math.hypot(right.x, right.y) > zone;
  }
}

/** Les gâchettes (L2, R2) sont analogiques : enfoncées au-delà d'un seuil, pour qu'un doigt posé ne zoome pas. */
function isDown(button: PadButtonState, index: number): boolean {
  if (index === PAD_BUTTONS.l2 || index === PAD_BUTTONS.r2) return button.value > GAMEPAD.triggerThreshold || (button.pressed && button.value === 0);
  return button.pressed;
}

function finite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/** Qui tient l'interface : la souris ou le doigt (`pointer`), ou la manette (`pad`). */
export type InputModeName = 'pointer' | 'pad';

/**
 * La bascule automatique : la manette sert, mode `pad` (le curseur virtuel
 * paraît) ; une vraie souris bouge ou un doigt se pose, mode `pointer` (il
 * disparaît). Chaque méthode dit si le mode a changé.
 */
export class InputMode {
  private name: InputModeName = 'pointer';

  public get mode(): InputModeName {
    return this.name;
  }

  public usePad(): boolean {
    return this.set('pad');
  }

  public usePointer(): boolean {
    return this.set('pointer');
  }

  private set(name: InputModeName): boolean {
    if (this.name === name) return false;
    this.name = name;
    return true;
  }
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * La navigation à la croix : parmi `boxes`, celle qu'on atteint depuis
 * `from` en allant vers `direction` — son centre doit être de ce côté, et la
 * plus proche l'emporte, un écart de côté comptant double (on reste dans sa
 * rangée ou sa colonne). `-1` s'il n'y a rien par là.
 */
export function nearestInDirection(from: Axis2, direction: PadDirection, boxes: readonly Box[]): number {
  let best = -1;
  let bestScore = Infinity;

  boxes.forEach((box, index) => {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const dx = cx - from.x;
    const dy = cy - from.y;
    const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);

    // Une boîte qui contient le point de départ n'est pas « plus loin » : c'est celle qu'on quitte.
    if (along <= 1 || (from.x >= box.x && from.x <= box.x + box.width && from.y >= box.y && from.y <= box.y + box.height)) return;

    const score = along + across * 2;

    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}
