import { describe, expect, it } from 'vitest';
import { dodgeTips, placeTip } from './tooltip.ts';

const screen = { width: 400, height: 800 };
const size = { width: 120, height: 30 };

describe('placeTip', () => {
  it('pose la bulle sous l’icône, centrée dessus', () => {
    const place = placeTip({ left: 140, top: 20, width: 20, height: 20 }, size, screen);

    expect(place).toEqual({ left: 90, top: 48, below: true });
  });

  it('la passe au-dessus quand elle ne tient pas dessous', () => {
    const place = placeTip({ left: 140, top: 760, width: 20, height: 20 }, size, screen);

    expect(place.below).toBe(false);
    expect(place.top + size.height).toBeLessThanOrEqual(760);
  });

  it('ne sort pas de l’écran par les côtés', () => {
    expect(placeTip({ left: 385, top: 20, width: 10, height: 10 }, size, screen).left).toBe(400 - 8 - 120);
    expect(placeTip({ left: 0, top: 20, width: 10, height: 10 }, size, screen).left).toBe(8);
  });
});

describe('dodgeTips', () => {
  const tip = { left: 100, top: 60, width: 120, height: 30 };
  const speech = { left: 90, top: 50, width: 150, height: 60 };

  it('descend sous la bulle d’Ève quand la bulle la recouvrirait', () => {
    expect(dodgeTips(tip, [speech], 800)).toBe(50 + 60 + 8);
  });

  it('remonte au-dessus si l’écran n’a pas la place dessous', () => {
    expect(dodgeTips({ ...tip, top: 60 }, [speech], 140)).toBe(12);
  });

  it('ne bouge pas une bulle qui ne touche rien', () => {
    expect(dodgeTips(tip, [{ left: 400, top: 400, width: 50, height: 50 }], 800)).toBe(60);
  });
});
