import { describe, expect, it } from 'vitest';
import { BUILDING_OVERHANG, MOBILE_REACH, boxInSight, buildingInSight, mobileInSight } from './sight.ts';

const sight = { minCx: 0, minCy: 0, maxCx: 9, maxCy: 9 };

describe('boxInSight', () => {
  it('garde une boîte dont seul un bout touche la dernière tuile vue', () => {
    expect(boxInSight(9.5, 3, 12, 4, sight)).toBe(true);
    expect(boxInSight(-2, 3, 0.1, 4, sight)).toBe(true);
  });

  it('écarte une boîte qui s’arrête au bord de la zone vue', () => {
    expect(boxInSight(-2, 3, 0, 4, sight)).toBe(false);
    expect(boxInSight(10, 3, 12, 4, sight)).toBe(false);
    expect(boxInSight(3, 10, 4, 12, sight)).toBe(false);
  });
});

describe('buildingInSight', () => {
  const home = { tx: 4, ty: 4, width: 2, height: 2 };

  it('garde un bâtiment dans la zone vue', () => {
    expect(buildingInSight(home, 3, sight)).toBe(true);
  });

  it('garde un bâtiment sous la zone vue dont le toit et la barre y montent', () => {
    // Emprise sur les rangées 10 et 11, cadre de 3 tuiles : le toit atteint la rangée 9.
    expect(buildingInSight({ ...home, ty: 10 }, 3, sight)).toBe(true);
    // Plus bas, seule la barre et ses bulles pourraient y monter.
    expect(buildingInSight({ ...home, ty: 8 + 3 + BUILDING_OVERHANG.up - 0.5 }, 3, sight)).toBe(true);
  });

  it('garde un bâtiment à côté de la zone vue dont la rangée d’un chantier y déborde', () => {
    expect(buildingInSight({ ...home, tx: 10 + BUILDING_OVERHANG.side - 1 }, 3, sight)).toBe(true);
  });

  it('écarte un bâtiment dont rien ne touche la zone vue', () => {
    expect(buildingInSight({ ...home, tx: 10 + BUILDING_OVERHANG.side }, 3, sight)).toBe(false);
    expect(buildingInSight({ ...home, tx: -2 - BUILDING_OVERHANG.side }, 3, sight)).toBe(false);
    expect(buildingInSight({ ...home, ty: -2 }, 3, sight)).toBe(false);
    expect(buildingInSight({ ...home, ty: 8 + 3 + BUILDING_OVERHANG.up }, 3, sight)).toBe(false);
  });
});

describe('mobileInSight', () => {
  it('garde un pantin dont la tête dépasse dans la zone vue', () => {
    expect(mobileInSight(5, 10 + MOBILE_REACH.up - 0.5, sight)).toBe(true);
    expect(mobileInSight(10 + MOBILE_REACH.side - 0.5, 5, sight)).toBe(true);
  });

  it('écarte un pantin loin de la zone vue', () => {
    expect(mobileInSight(5, 10 + MOBILE_REACH.up, sight)).toBe(false);
    expect(mobileInSight(5, -MOBILE_REACH.down, sight)).toBe(false);
    expect(mobileInSight(-MOBILE_REACH.side, 5, sight)).toBe(false);
  });
});
