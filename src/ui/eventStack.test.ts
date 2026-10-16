import { describe, expect, it } from 'vitest';
import { eventRank, sortEvents } from './eventStack.ts';

describe('la pile d’événements', () => {
  it('met la vague imminente devant, puis les vivres, puis le reste', () => {
    const order = sortEvents([
      { id: 'hasten', rank: eventRank('hasten', {}) },
      { id: 'weather', rank: eventRank('weather', { harsh: 'false' }) },
      { id: 'boon', rank: eventRank('boon', { state: 'offer' }) },
      { id: 'hunger', rank: eventRank('hunger', {}) },
      { id: 'wave', rank: eventRank('wave', { urgent: 'true' }) },
    ]);

    expect(order).toEqual(['wave', 'hunger', 'boon', 'weather', 'hasten']);
  });

  it('laisse les vivres devant une vague encore lointaine', () => {
    const order = sortEvents([
      { id: 'wave', rank: eventRank('wave', { urgent: 'false' }) },
      { id: 'hunger', rank: eventRank('hunger', {}) },
    ]);

    expect(order[0]).toBe('hunger');
  });

  it('garde l’ordre d’arrivée à égalité', () => {
    expect(sortEvents([{ id: 'a', rank: 1 }, { id: 'b', rank: 1 }])).toEqual(['a', 'b']);
  });
});
