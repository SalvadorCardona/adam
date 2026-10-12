import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n/locale.ts';
import { INVENTORY_CAPACITY } from '../sim/player.ts';
import { clock, effectLine, statusLine } from './researchText.ts';

describe('textes du panneau Recherche', () => {
  it('dit l’effet chiffré, sans et avec la recherche', () => {
    expect(effectLine('sharpArrows', [])).toBe('Dégâts de l’arc : 1 → 1,5');
    expect(effectLine('quickDraw', ['sharpArrows'])).toBe('Délai entre deux flèches : 0,7 s → 0,5 s');
    expect(effectLine('bigBag', [])).toBe(`Places du sac : ${INVENTORY_CAPACITY} → ${INVENTORY_CAPACITY + 15}`);
    expect(effectLine('sharpAxes', [])).toBe('Bois récolté en plus : 0 % → +50 %');
    expect(effectLine('walkingBoots', [])).toBe('Vitesse d’Adam : 4,5 cases/s → 5,4 cases/s');
  });

  it('dit ce que la recherche fait pour les ouvriers et pour Adam, et les bâtiments qu’elle ouvre', () => {
    expect(effectLine('sandals', [])).toBe('Vitesse des habitants : 0 % → +15 %');
    expect(effectLine('rations', [])).toBe('Faim en moins : 0 % → +25 %');
    expect(effectLine('paddedVest', [])).toBe('Points de vie d’Adam : 10 → 14');
    expect(effectLine('charcoalFilters', [])).toBe('Temps par case dépolluée : 3 s → 1,5 s');
    expect(effectLine('woodcraft', [])).toBe('Débloque : Cabane de bûcheron, Maison du forestier');
  });

  it('compte les places du jardin dans le sac qu’Adam porte', () => {
    expect(effectLine('bigBag', [], ['bigBag'])).toBe(`Places du sac : ${INVENTORY_CAPACITY + 10} → ${INVENTORY_CAPACITY + 25}`);
  });

  it('une recherche finie dit ce qu’elle a changé, pas un second cran', () => {
    expect(effectLine('sharpArrows', ['sharpArrows'])).toBe('Dégâts de l’arc : 1 → 1,5');
  });

  it('nomme le prérequis qui manque', () => {
    expect(statusLine('quickDraw', 'locked', [])).toBe('Requiert : Flèches à croc');
    expect(statusLine('sharpArrows', 'done', ['sharpArrows'])).toBe('Terminée');
    expect(statusLine('sharpArrows', 'running', [], 20 * 65)).toBe('En cours — encore 1 min 05 s');
  });

  it('écrit le temps en minutes et secondes', () => {
    expect(clock(20 * 42)).toBe('42 s');
    expect(clock(20 * 60)).toBe('1 min 00 s');
  });

  it('parle anglais quand la langue change', () => {
    setLocale('en');
    try {
      expect(effectLine('walkingBoots', [])).toBe('Adam’s speed: 4.5 tiles/s → 5.4 tiles/s');
      expect(statusLine('sharpArrows', 'running', [], 20 * 65)).toBe('Underway — 1 min 05 s left');
    } finally {
      setLocale('fr');
    }
  });
});
