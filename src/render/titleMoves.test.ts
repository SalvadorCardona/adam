import { describe, expect, it } from 'vitest';
import { titleScene, type TitleProp } from '../art/titleScene.ts';
import { CAMERA_IN, DUSK, DUSK_MAX, EASE, cubicBezier, motionTrack, pupilShift, reactionTrack, restOf, sample } from './titleMoves.ts';

/*
 * Les mouvements de l'écran titre, sans navigateur : les images clés du CSS
 * d'avant, rejouées au temps — allures, aller-retour, propriétés lues chacune
 * à ses images clés, réactions, entrée.
 */

function props(): TitleProp[] {
  const out: TitleProp[] = [];
  const walk = (prop: TitleProp): void => {
    out.push(prop);
    for (const child of prop.children ?? []) walk(child);
  };

  for (const layer of titleScene()) for (const prop of layer.props) walk(prop);
  return out;
}

const find = (id: string): TitleProp => props().find((prop) => prop.id === id)!;

describe('les allures du CSS', () => {
  it('suivent cubic-bezier : bornes tenues, ease-in-out symétrique, un rebond dépasse 1', () => {
    expect(EASE.easeInOut(0)).toBe(0);
    expect(EASE.easeInOut(1)).toBe(1);
    expect(EASE.easeInOut(0.5)).toBeCloseTo(0.5, 3);
    expect(EASE.easeInOut(0.25) + EASE.easeInOut(0.75)).toBeCloseTo(1, 3);
    expect(EASE.ease(0.5)).toBeCloseTo(0.8024, 2);
    const pop = cubicBezier(0.3, 1.6, 0.5, 1);

    expect(Math.max(...[0.2, 0.3, 0.4, 0.5].map(pop))).toBeGreaterThan(1);
  });
});

describe('les mouvements des accessoires', () => {
  it('animent chaque accessoire qui en déclare un, et lui seul', () => {
    for (const prop of props()) expect(motionTrack(prop) !== null, prop.id).toBe(prop.motion !== undefined);
  });

  it('restent finis à tout instant, sur plusieurs tours', () => {
    for (const prop of props()) {
      const track = motionTrack(prop);

      if (!track) continue;
      for (let t = -5000; t < 200_000; t += 997) {
        const pose = sample(track, t);

        for (const value of Object.values(pose)) expect(Number.isFinite(value), `${prop.id} à ${t} ms`).toBe(true);
        expect(pose.alpha).toBeGreaterThanOrEqual(0);
        expect(pose.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('balancent un lampion d’un bord à l’autre puis reviennent (aller-retour)', () => {
    const lantern = find('lantern-0');
    const track = motionTrack(lantern)!;
    const start = -(lantern.delay ?? 0) * 1000;

    expect(sample(track, start).rotation).toBeCloseTo(-6);
    expect(sample(track, start + track.duration).rotation).toBeCloseTo(6);
    expect(sample(track, start + 2 * track.duration - 1).rotation).toBeCloseTo(-6, 1);
  });

  it('font traverser un nuage d’un bord du ciel à l’autre, déjà en route au premier instant', () => {
    const cloud = find('cloud-high');
    const track = motionTrack(cloud)!;
    const [from, , to] = cloud.path!;

    expect(sample(track, 0).x).toBeGreaterThan(from);
    expect(sample(track, 0).x).toBeLessThan(to);
    // Là où il est dessiné au premier instant, à un pixel près.
    expect(Math.abs(sample(track, 0).x)).toBeLessThan(1);
  });

  it('lisent chaque propriété à ses images clés : la luciole luit pendant qu’elle s’élève', () => {
    const track = motionTrack(find('mote-0'))!;

    expect(sample(track, 0).alpha).toBe(0);
    expect(sample(track, track.duration * 0.5).alpha).toBeCloseTo(0.9);
    // La montée n'a que deux images clés : à mi-tour, elle est déjà partie.
    expect(sample(track, track.duration * 0.5).y).toBeLessThan(0);
  });

  it('allument les lueurs des lampions une fois pour toutes', () => {
    const glow = find('lantern-2-glow');
    const track = motionTrack(glow)!;

    expect(sample(track, 0).alpha).toBe(0);
    expect(sample(track, 60_000)).toEqual(restOf(glow));
  });

  it('font clignoter une lampe en marches franches', () => {
    const track = motionTrack(find('lamp-left'))!;

    expect(sample(track, track.duration * 0.25).alpha).toBe(1);
    expect(sample(track, track.duration * 0.75).alpha).toBe(0.25);
  });
});

describe('les réactions et la caméra', () => {
  it('font sursauter le mutant puis le laissent caché', () => {
    const mutant = find('mutant');
    const track = reactionTrack('startle', mutant);

    expect(sample(track, track.duration * 0.14).y).toBeLessThan(0);
    expect(sample(track, track.duration * 2).alpha).toBe(0);
  });

  it('envolent l’oiseau hors de vue, puis le reposent', () => {
    const bird = find('perch-tower');
    const track = reactionTrack('flyOff', bird);

    expect(sample(track, track.duration * 0.5).alpha).toBe(0);
    expect(sample(track, track.duration)).toMatchObject({ x: 0, y: 0, alpha: 1 });
  });

  it('entrent du ciel puis se posent, et assombrissent le crépuscule sans jamais le noircir', () => {
    expect(sample(CAMERA_IN, 0).scaleX).toBeCloseTo(1.22);
    expect(sample(CAMERA_IN, 10_000)).toMatchObject({ x: 0, y: 0, scaleX: 1 });
    for (let t = 0; t < 300_000; t += 5000) expect(sample(DUSK, t).alpha).toBeLessThanOrEqual(DUSK_MAX);
  });
});

describe('le regard du mutant', () => {
  it('a deux pupilles, qui suivent la visée puis se tournent vers Adam', () => {
    const pupils = props().filter((prop) => prop.gaze);

    expect(pupils.map((prop) => prop.id)).toEqual(['mutant-pupil-0', 'mutant-pupil-1']);
    const pupil = pupils[0]!;

    expect(pupilShift(pupil, { x: 0, y: 0 }, false)).toEqual({ x: 0, y: 0 });
    expect(pupilShift(pupil, { x: 1, y: 0 }, false).x).toBeGreaterThan(0);
    // Adam est à gauche du mutant : ses pupilles filent vers la gauche, quelle que soit la visée.
    expect(pupilShift(pupil, { x: 1, y: 0 }, true).x).toBeLessThan(0);
    expect(Math.abs(pupilShift(pupil, { x: 1, y: 1 }, false).x)).toBeLessThanOrEqual(pupil.width * pupil.gaze!);
  });
});
