import { describe, expect, it } from 'vitest';
import { DeathGroup } from './deathGroup.ts';

describe('DeathGroup', () => {
  it('une mort seule : un compte de un, sa cause, son endroit', () => {
    expect(new DeathGroup().add(0, 'thirst', 100, 200)).toEqual({ count: 1, need: 'thirst', x: 100, y: 200 });
  });

  it('huit morts de soif en moins de 10 s font un seul groupe', () => {
    const group = new DeathGroup();
    let reading = group.add(0, 'thirst', 0, 0);

    for (let i = 1; i < 8; i += 1) reading = group.add(i * 1000, 'thirst', 100, 100);
    expect(reading.count).toBe(8);
    expect(reading.need).toBe('thirst');
  });

  it('la faim et la soif mêlées : cause mixte', () => {
    const group = new DeathGroup();

    group.add(0, 'thirst', 0, 0);
    expect(group.add(1000, 'hunger', 0, 0).need).toBe('mixed');
  });

  it('plus de 10 s sans mort : un nouveau groupe', () => {
    const group = new DeathGroup();

    group.add(0, 'thirst', 0, 0);
    group.add(5000, 'thirst', 0, 0);
    expect(group.add(15001, 'hunger', 50, 50)).toEqual({ count: 1, need: 'hunger', x: 50, y: 50 });
  });
});
