import { describe, expect, it } from 'vitest';
import {
  GAMEPAD,
  InputMode,
  PAD_BUTTONS,
  PadReader,
  clampToScreen,
  cursorVelocity,
  deadZone,
  nearestInDirection,
  padKindOf,
  type PadButton,
  type PadSnapshot,
} from './gamepad.ts';

/** Une manette simulée au mapping standard : 17 boutons, 4 axes. */
function pad(held: readonly PadButton[] = [], axes: readonly number[] = [0, 0, 0, 0], values: Partial<Record<PadButton, number>> = {}): PadSnapshot {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => {
      const name = (Object.keys(PAD_BUTTONS) as PadButton[]).find((key) => PAD_BUTTONS[key] === index);
      const value = name ? (values[name] ?? (held.includes(name) ? 1 : 0)) : 0;

      return { pressed: name !== undefined && (held.includes(name) || value > 0.5), value };
    }),
  };
}

describe('zone morte', () => {
  it('rend (0, 0) sous le seuil, dans toutes les directions', () => {
    expect(deadZone(0.1, 0.1, 0.15)).toEqual({ x: 0, y: 0 });
    expect(deadZone(-0.14, 0, 0.15)).toEqual({ x: 0, y: 0 });
    expect(deadZone(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('part de zéro juste après le seuil et atteint 1 à fond', () => {
    expect(deadZone(0.16, 0, 0.15).x).toBeCloseTo(0.01 / 0.85, 5);
    expect(deadZone(1, 0, 0.15)).toEqual({ x: 1, y: 0 });
    expect(deadZone(0, -1, 0.15).y).toBeCloseTo(-1);
  });

  it('garde la direction et borne la norme à 1 dans un coin', () => {
    const corner = deadZone(1, 1, 0.15);

    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1);
    expect(corner.x).toBeCloseTo(corner.y);
  });

  it('ignore un axe illisible', () => {
    expect(deadZone(Number.NaN, 0.5)).toEqual({ x: 0, y: 0 });
  });
});

describe('curseur', () => {
  it('va d’autant plus vite que le stick est incliné, sur une courbe douce', () => {
    const half = cursorVelocity(0.575, 0, 800, 0.15).x;
    const full = cursorVelocity(1, 0, 800, 0.15).x;

    expect(full).toBeCloseTo(GAMEPAD.cursorSpeed * 800);
    // À mi-course après la zone morte, la courbe au carré donne un quart de la vitesse.
    expect(half).toBeCloseTo(full / 4, 0);
    expect(cursorVelocity(0.1, 0, 800, 0.15)).toEqual({ x: 0, y: 0 });
  });

  it('reste dans l’écran', () => {
    expect(clampToScreen(-20, 900, 1280, 800)).toEqual({ x: 0, y: 799 });
    expect(clampToScreen(640, 400, 1280, 800)).toEqual({ x: 640, y: 400 });
  });
});

describe('PadReader', () => {
  it('détecte un nouvel appui une seule fois, tant qu’il est tenu', () => {
    const reader = new PadReader();

    reader.update(pad(), 0);
    reader.update(pad(['south']), 16);
    expect(reader.pressed('south')).toBe(true);
    reader.update(pad(['south']), 32);
    expect(reader.pressed('south')).toBe(false);
    expect(reader.held('south')).toBe(true);
    reader.update(pad(), 48);
    expect(reader.released('south')).toBe(true);
    expect(reader.pressed('south')).toBe(false);
    reader.update(pad(['south']), 64);
    expect(reader.pressed('south')).toBe(true);
  });

  it('ne déclenche rien au premier instantané : le bouton qui réveille la manette ne clique pas', () => {
    const reader = new PadReader();

    reader.update(pad(['south', 'start']), 0);
    expect(reader.pressed('south')).toBe(false);
    expect(reader.pressed('start')).toBe(false);
    reader.update(null, 16);
    expect(reader.connected).toBe(false);
    reader.update(pad(['east']), 32);
    expect(reader.pressed('east')).toBe(false);
  });

  it('répète la croix tenue : à l’appui, après le délai, puis au rythme', () => {
    const reader = new PadReader();
    const fired: number[] = [];

    reader.update(pad(), 0);
    for (let now = 10; now <= 1000; now += 10) {
      reader.update(pad(['down']), now);
      if (reader.repeated('down')) fired.push(now);
    }
    expect(fired[0]).toBe(10);
    expect(fired[1]).toBe(10 + GAMEPAD.repeatDelayMs);
    expect(fired[2]! - fired[1]!).toBe(GAMEPAD.repeatEveryMs);
    expect(reader.repeated('up')).toBe(false);
  });

  it('lit les sticks : gauche sur les axes 0-1, droit sur 2-3', () => {
    const reader = new PadReader();

    reader.update(pad([], [0.5, -0.25, -1, 0.75]), 0);
    expect(reader.stick('left')).toEqual({ x: 0.5, y: -0.25 });
    expect(reader.stick('right')).toEqual({ x: -1, y: 0.75 });
  });

  it('tient une gâchette pour enfoncée au-delà de son seuil seulement', () => {
    const reader = new PadReader();

    reader.update(pad(), 0);
    reader.update(pad([], undefined, { r2: 0.2 }), 16);
    expect(reader.held('r2')).toBe(false);
    expect(reader.value('r2')).toBeCloseTo(0.2);
    reader.update(pad([], undefined, { r2: 0.9 }), 32);
    expect(reader.pressed('r2')).toBe(true);
  });

  it('dit si la manette sert : un bouton, ou un stick hors de la zone morte', () => {
    const reader = new PadReader();

    reader.update(pad([], [0.05, 0.05, 0, 0]), 0);
    expect(reader.active()).toBe(false);
    reader.update(pad([], [0, 0, 0.6, 0]), 16);
    expect(reader.active()).toBe(true);
    reader.update(pad(['north']), 32);
    expect(reader.active()).toBe(true);
    reader.update(null, 48);
    expect(reader.active()).toBe(false);
  });
});

describe('InputMode', () => {
  it('bascule vers la manette puis vers la souris, en disant quand le mode change', () => {
    const mode = new InputMode();

    expect(mode.mode).toBe('pointer');
    expect(mode.usePad()).toBe(true);
    expect(mode.usePad()).toBe(false);
    expect(mode.mode).toBe('pad');
    expect(mode.usePointer()).toBe(true);
    expect(mode.mode).toBe('pointer');
  });
});

describe('padKindOf', () => {
  it('reconnaît une PlayStation, et prend la Xbox pour le reste (Steam Deck compris)', () => {
    expect(padKindOf('054c-0ce6-Wireless Controller')).toBe('playstation');
    expect(padKindOf('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(padKindOf('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(padKindOf('28de-1205-Steam Deck')).toBe('xbox');
    expect(padKindOf('Microsoft X-Box 360 pad')).toBe('xbox');
    expect(padKindOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
  });
});

describe('nearestInDirection', () => {
  // Une grille de trois boutons sur une ligne, un quatrième dessous.
  const boxes = [
    { x: 0, y: 0, width: 40, height: 40 },
    { x: 60, y: 0, width: 40, height: 40 },
    { x: 120, y: 0, width: 40, height: 40 },
    { x: 60, y: 80, width: 40, height: 40 },
  ];

  it('prend le voisin de la rangée, puis celui du dessous', () => {
    expect(nearestInDirection({ x: 20, y: 20 }, 'right', boxes)).toBe(1);
    expect(nearestInDirection({ x: 80, y: 20 }, 'right', boxes)).toBe(2);
    expect(nearestInDirection({ x: 80, y: 20 }, 'down', boxes)).toBe(3);
    expect(nearestInDirection({ x: 80, y: 100 }, 'up', boxes)).toBe(1);
  });

  it('rend -1 quand il n’y a rien par là', () => {
    expect(nearestInDirection({ x: 20, y: 20 }, 'left', boxes)).toBe(-1);
    expect(nearestInDirection({ x: 80, y: 100 }, 'down', boxes)).toBe(-1);
  });
});
