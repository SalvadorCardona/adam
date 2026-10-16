import { describe, expect, it } from 'vitest';
import { dailyUrl, parseDailyDate } from './dailyMap.ts';

describe('?daily=', () => {
  it('lit une date réelle, rien d’autre', () => {
    expect(parseDailyDate('?daily=2026-10-17')).toBe('2026-10-17');
    expect(parseDailyDate('?daily=2026-02-30')).toBeNull();
    expect(parseDailyDate('?daily=demain')).toBeNull();
    expect(parseDailyDate('')).toBeNull();
  });

  it('pose et retire le paramètre, garde les autres et écarte la seed', () => {
    expect(dailyUrl('https://x.test/adam/?debug&seed=5', '2026-10-17')).toBe('https://x.test/adam/?debug=&daily=2026-10-17');
    expect(dailyUrl('https://x.test/adam/?daily=2026-10-17', null)).toBe('https://x.test/adam/');
  });
});
