import { describe, expect, it } from 'vitest';
import { EN } from './en/index.ts';
import { FR } from './fr/index.ts';
import { detectLocale, locale, onLocale, setLocale, t } from './locale.ts';

/** Chaque feuille du dictionnaire, avec son chemin : `hud.toast.built`. */
function leaves(node: unknown, path = ''): [string, unknown][] {
  if (typeof node === 'string' || typeof node === 'function') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((child, i) => leaves(child, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
  }
  return [[path, node]];
}

/** Ce qu'une fonction du dictionnaire écrit, appelée avec des nombres : assez pour lire ses mots. */
function sample(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'function') return String(value);
  const fn = value as (...args: unknown[]) => unknown;

  // Des nombres d'abord ; une fonction qui lit un nom (`item.toLowerCase()`) reçoit des chaînes.
  for (const [many, one] of [[2, 1], ['2', '1']] as const) {
    try {
      return [fn(...Array.from({ length: fn.length }, () => many)), fn(...Array.from({ length: fn.length }, () => one))]
        .map(String)
        .join(' ');
    } catch {
      // On essaie l'autre jeu d'arguments.
    }
  }
  // Une fonction qui attend autre chose : sa forme est vérifiée, pas son texte.
  return '';
}

/** Ce qui trahit du français : ses lettres accentuées, ses guillemets, son espace avant « : ! ? ». */
const FRENCH = /[àâäçéèêëîïôöùûüœæÀÂÇÉÈÊÎÔÙÛŒ«»]| [:!?;](?:\s|$)/u;

describe('dictionnaires', () => {
  const fr = leaves(FR);
  const en = new Map(leaves(EN));

  it('ont les mêmes clés en français et en anglais, de la même nature', () => {
    expect([...en.keys()].sort()).toEqual(fr.map(([path]) => path).sort());
    for (const [path, value] of fr) {
      const other = en.get(path);

      expect(typeof other, path).toBe(typeof value);
      if (typeof value === 'function') expect((other as () => unknown).length, path).toBe(value.length);
    }
  });

  it('ne laissent aucun texte vide', () => {
    // Le bandeau d'un objectif ordinaire est vide (il dit « Objectif réussi ! »), une statistique sans unité
    // aussi, et un refus de pose sans remède.
    for (const [path, value] of [...fr, ...en]) {
      if (/^chapters\[\d+\]\.banner$|^researchStats\.\w+\.unit$|^panel\.placement\..*\.remedy$/.test(path)) continue;
      expect(sample(value).trim(), path).not.toBe('');
    }
  });

  it('n’ont aucun mot de français en anglais', () => {
    for (const [path, value] of en) expect(sample(value), path).not.toMatch(FRENCH);
  });

  it('gardent dans chaque langue les marques à remplacer du conseil ({item}, {n}…)', () => {
    for (const [path, value] of fr) {
      if (typeof value !== 'string') continue;

      const marks = (text: string): string[] => [...text.matchAll(/\{\w+\}/g)].map(([mark]) => mark).sort();

      expect(marks(en.get(path) as string), path).toEqual(marks(value));
    }
  });
});

describe('langue', () => {
  it('se déduit du navigateur : français si fr*, anglais sinon', () => {
    expect(detectLocale(['fr-FR', 'en'])).toBe('fr');
    expect(detectLocale(['fr'])).toBe('fr');
    expect(detectLocale(['FR-ca'])).toBe('fr');
    expect(detectLocale(['en-US', 'fr'])).toBe('en');
    expect(detectLocale(['de'])).toBe('en');
    expect(detectLocale(['fri'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('bascule le dictionnaire et prévient les abonnés, sans rappel inutile', () => {
    const seen: string[] = [];
    const off = onLocale((next) => seen.push(next));

    expect(locale()).toBe('fr');
    expect(t().settings.title).toBe('Réglages');
    setLocale('en');
    setLocale('en');
    expect(t().settings.title).toBe('Settings');
    setLocale('fr');
    off();
    setLocale('en');
    setLocale('fr');
    expect(seen).toEqual(['fr', 'en', 'fr']);
  });
});
