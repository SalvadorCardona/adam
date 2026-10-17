import { describe, expect, it } from 'vitest';
import { BAKES_PER_FRAME, BAKE_BUDGET_MS, BakeBudget, bakeOrder } from './bakeBudget.ts';

const bounds = { minCx: 0, minCy: 0, maxCx: 2, maxCy: 1 };

describe('bakeOrder', () => {
  it('bake d’abord les blocs vus qui manquent, du centre de la caméra vers les bords', () => {
    const order = bakeOrder(bounds, 1.5, 1, () => false, new Set());

    expect(order).toHaveLength(6);
    expect(order.slice(0, 2).map(({ key }) => key).sort()).toEqual(['1,0', '1,1']);
    expect(order.at(-1)!.bx).not.toBe(1);
  });

  it('passe les blocs manquants avant les blocs périmés, et les périmés vus avant ceux de la marge', () => {
    const baked = new Set(['0,0', '1,0', '2,0', '0,1', '1,1']);
    const order = bakeOrder(bounds, 1.5, 1, (key) => baked.has(key), new Set(['3,0', '1,1']));

    expect(order.map(({ key }) => key)).toEqual(['2,1', '1,1', '3,0']);
    expect(order[2]).toEqual({ bx: 3, by: 0, key: '3,0' });
  });

  it('ne rend rien quand tout est baké et à jour', () => {
    expect(bakeOrder(bounds, 1.5, 1, () => true, new Set())).toEqual([]);
  });
});

describe('BakeBudget', () => {
  it('laisse toujours passer le premier bloc de l’image, même lent', () => {
    const budget = new BakeBudget();

    budget.start(0);
    expect(budget.take(1000)).toBe(true);
    expect(budget.take(1000)).toBe(false);
  });

  it('n’en prend plus une fois le temps de l’image passé', () => {
    const budget = new BakeBudget();

    budget.start(0);
    expect(budget.take(0)).toBe(true);
    expect(budget.take(BAKE_BUDGET_MS + 1)).toBe(false);
  });

  it('arrête au nombre de blocs par image, et repart à l’image suivante', () => {
    const budget = new BakeBudget();

    budget.start(0);
    for (let i = 0; i < BAKES_PER_FRAME; i += 1) expect(budget.take(0)).toBe(true);
    expect(budget.take(0)).toBe(false);
    budget.start(16);
    expect(budget.take(16)).toBe(true);
  });
});
