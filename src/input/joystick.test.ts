import { describe, expect, it } from 'vitest';
import type { Entity } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { Inspect } from './inspect.ts';
import {
  CAPTURE_ZONE,
  DEAD_ZONE,
  Joystick,
  RING_RIM,
  STICK_RADIUS,
  StickCapture,
  TOUCH_RADIUS,
  inCaptureZone,
  readStick,
} from './joystick.ts';
import { PointerDispatch, type PointerSample } from './pointer.ts';

describe('sortie du joystick', () => {
  it('au centre et dans la zone morte, Adam ne bouge pas', () => {
    expect(readStick(0, 0)).toMatchObject({ axisX: 0, axisY: 0 });
    expect(readStick(DEAD_ZONE - 1, 0)).toMatchObject({ axisX: 0, axisY: 0 });
    expect(readStick(0, -(DEAD_ZONE - 1))).toMatchObject({ axisX: 0, axisY: 0 });
  });

  it('la vitesse démarre à zéro au bord de la zone morte et croît avec la distance', () => {
    const edge = readStick(DEAD_ZONE, 0);
    const half = readStick((DEAD_ZONE + STICK_RADIUS) / 2, 0);
    const full = readStick(STICK_RADIUS, 0);

    expect(edge.axisX).toBeCloseTo(0);
    expect(half.axisX).toBeCloseTo(0.5);
    expect(full.axisX).toBeCloseTo(1);
  });

  it('suit la direction du doigt, dans toutes les directions', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const out = readStick(Math.cos(angle) * STICK_RADIUS, Math.sin(angle) * STICK_RADIUS);

      expect(out.axisX).toBeCloseTo(Math.cos(angle));
      expect(out.axisY).toBeCloseTo(Math.sin(angle));
    }
  });

  it('hors de l’anneau, le bouton reste collé au bord et la vitesse sature', () => {
    const out = readStick(-300, 400);

    expect(Math.hypot(out.knobX, out.knobY)).toBeCloseTo(STICK_RADIUS);
    expect(out.knobX / out.knobY).toBeCloseTo(-300 / 400);
    expect(Math.hypot(out.axisX, out.axisY)).toBeCloseTo(1);
    expect(out.axisX).toBeCloseTo(-0.6);
    expect(out.axisY).toBeCloseTo(0.8);
  });
});

describe('doigt sur le joystick', () => {
  it('prend un doigt posé un peu hors de l’anneau, pas plus loin que la zone tactile', () => {
    const joystick = new Joystick();

    expect(joystick.press(1, TOUCH_RADIUS + 1, 0)).toBe(false);
    expect(joystick.state.active).toBe(false);
    expect(joystick.press(1, STICK_RADIUS + 10, 0)).toBe(true);
    expect(joystick.state.active).toBe(true);
  });

  it('dans le creux de l’anneau, rien ne saute : on marche dès le contact', () => {
    const joystick = new Joystick();

    joystick.press(1, STICK_RADIUS - RING_RIM, 0);
    expect(joystick.state).toMatchObject({ originX: 0, originY: 0 });
    expect(joystick.state.axisX).toBeGreaterThan(0.8);
  });

  it('sur le bord ou à côté, l’anneau saute sous le doigt et part de zéro', () => {
    const joystick = new Joystick();

    // Le doigt à 54 px au-dessus du centre, glissé de 50 px vers le bas : il descend.
    joystick.press(1, 0, -54);
    expect(joystick.state).toMatchObject({ originX: 0, originY: -54, axisX: 0, axisY: 0 });
    joystick.drag(1, 0, -4);
    expect(joystick.state.axisY).toBeGreaterThan(0.8);

    joystick.release(1);
    expect(joystick.state).toMatchObject({ originX: 0, originY: 0 });
  });

  it('un seul doigt à la fois : le second ne le vole pas', () => {
    const joystick = new Joystick();

    joystick.press(1, 0, 0);
    expect(joystick.press(2, 0, 20)).toBe(false);
    joystick.drag(2, 0, STICK_RADIUS);
    expect(joystick.state.axisY).toBe(0);
    joystick.drag(1, 0, -STICK_RADIUS);
    expect(joystick.state.axisY).toBeCloseTo(-1);
  });

  it('relâcher remet le bouton au centre et arrête Adam', () => {
    const joystick = new Joystick();

    joystick.press(1, 0, 0);
    joystick.drag(1, 500, 0);
    joystick.release(2);
    expect(joystick.state.active).toBe(true);

    joystick.release(1);
    expect(joystick.state).toEqual({ active: false, knobX: 0, knobY: 0, axisX: 0, axisY: 0, originX: 0, originY: 0 });
    expect(joystick.press(3, 0, 0)).toBe(true);
  });

  it('masqué, il lâche son doigt', () => {
    const joystick = new Joystick();

    joystick.press(1, 0, 0);
    joystick.drag(1, 0, STICK_RADIUS);
    joystick.reset();
    expect(joystick.state).toMatchObject({ active: false, axisX: 0, axisY: 0 });
    joystick.drag(1, 0, STICK_RADIUS);
    expect(joystick.state.axisY).toBe(0);
  });
});

/** Un écran de téléphone, 390 × 844, l'anneau au repos au milieu, au-dessus du bouton « Bâtir », en (195, 684). */
const PHONE = { width: 390, height: 844, centerX: 195, centerY: 684 };

describe('pouce posé à côté de l’anneau', () => {
  const at = (x: number, y: number, id = 1): PointerSample => ({ id, x, y });

  it('la zone de prise est le bas de l’écran, au milieu', () => {
    expect(inCaptureZone(195, 600, PHONE.width, PHONE.height)).toBe(true);
    expect(inCaptureZone(PHONE.width * CAPTURE_ZONE.minX - 1, 700, PHONE.width, PHONE.height)).toBe(false);
    expect(inCaptureZone(PHONE.width * CAPTURE_ZONE.maxX + 1, 700, PHONE.width, PHONE.height)).toBe(false);
    expect(inCaptureZone(195, PHONE.height * CAPTURE_ZONE.minY - 1, PHONE.width, PHONE.height)).toBe(false);
  });

  it('posé hors de l’anneau dans la zone : sortie nulle au contact, puis Adam suit le glissé', () => {
    const joystick = new Joystick();
    const capture = new StickCapture(joystick, () => PHONE);

    expect(capture.onDown(at(195, 530))).toBe(true);
    expect(joystick.state).toMatchObject({ active: true, axisX: 0, axisY: 0, originX: 0, originY: -154 });

    capture.onMove(at(195, 580));
    expect(joystick.state.axisY).toBeGreaterThan(0.8);
    expect(joystick.state.axisX).toBeCloseTo(0);

    capture.onUp(at(195, 580));
    expect(joystick.state).toMatchObject({ active: false, axisY: 0, originX: 0, originY: 0 });
  });

  it('hors de la zone, masqué ou à la souris, le doigt n’est pas pris', () => {
    const joystick = new Joystick();

    expect(new StickCapture(joystick, () => PHONE).onDown(at(60, 600))).toBe(false);
    expect(new StickCapture(joystick, () => PHONE).onDown(at(330, 600))).toBe(false);
    expect(new StickCapture(joystick, () => PHONE).onDown(at(195, 300))).toBe(false);
    expect(new StickCapture(joystick, () => null).onDown(at(195, 600))).toBe(false);
    expect(new StickCapture(joystick, () => PHONE).onDown({ ...at(195, 600), mouse: true })).toBe(false);
    expect(joystick.state.active).toBe(false);
  });

  it('un tap sur un bâtiment proche ouvre toujours sa fenêtre', () => {
    const joystick = new Joystick();
    const opened: number[] = [];
    // Une maison des constructeurs sous le doigt, en (128, 544) – écran = monde.
    const building = { id: 7, proto: 'builderHouse', tx: 4, ty: 17, width: 2, height: 2 } as unknown as Entity;
    const world = { entities: new Map([[7, building]]), mobiles: new Map(), eve: () => undefined, knownEnemyBases: () => [], graves: () => [], sees: () => true } as unknown as World;
    const pointers = new PointerDispatch();

    pointers.add(new Inspect(world, (x, y) => ({ x, y }), () => true, (selection) => opened.push(selection.id)));
    pointers.add(new StickCapture(joystick, () => PHONE));

    pointers.down(at(150, 580));
    pointers.move(at(150 + DEAD_ZONE - 1, 580));
    expect(joystick.state.active).toBe(false);
    pointers.up(at(150 + DEAD_ZONE - 1, 580));
    expect(opened).toEqual([7]);

    // À côté du bâtiment, le même doigt prend le joystick.
    pointers.down(at(250, 580, 2));
    expect(joystick.state.active).toBe(true);
  });
});
