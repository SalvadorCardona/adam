import { describe, expect, it } from 'vitest';
import { World } from '../sim/world.ts';
import { formatSeed, mapUrl, parseSeed, shareUrl } from './seed.ts';

const PAGE = 'https://cardona.digital/adam/?debug&seed=7#x';

describe('seed', () => {
  it('lit la seed de l’URL, ou rien', () => {
    expect(parseSeed('?seed=1234')).toBe(1234);
    expect(parseSeed('?debug')).toBeNull();
    expect(parseSeed('?seed=abc')).toBeNull();
  });

  it('sépare les milliers', () => {
    expect(formatSeed(42)).toBe('42');
    expect(formatSeed(1234567)).toBe('1\u00a0234\u00a0567');
    expect(formatSeed(4294967295)).toBe('4\u00a0294\u00a0967\u00a0295');
  });

  it('partage un lien qui rouvre exactement la même carte', () => {
    const world = new World(3_000_000_001);
    const link = new URL(shareUrl(PAGE, world.seed));

    expect(`${link.origin}${link.pathname}`).toBe('https://cardona.digital/adam/');
    expect(link.search).toBe(`?seed=${world.seed}`);
    expect(new World(parseSeed(link.search) ?? -1).seed).toBe(world.seed);
  });

  it('rejoue la carte ou en tire une neuve, sans perdre les autres paramètres', () => {
    expect(mapUrl(PAGE, 99)).toBe('https://cardona.digital/adam/?debug=&seed=99');
    expect(mapUrl(PAGE, null)).toBe('https://cardona.digital/adam/?debug=');
  });
});
