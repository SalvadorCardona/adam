import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * L'attribut `hidden` doit toujours masquer : une règle `display: flex` sur une
 * classe (`.button-secondary`) l'écrase sinon, et un bouton « caché » reste
 * affiché (le vocal et « Inviter un ami » de la pause, en solo).
 */

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Les déclarations `display` de la feuille, avec leur sélecteur. */
function displays(): { selector: string; value: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, prelude, body]) =>
    [...(body ?? '').matchAll(/(?:^|;)\s*display\s*:\s*([^;]+)/g)].map((match) => ({ selector: (prelude ?? '').trim(), value: (match[1] ?? '').trim() })),
  );
}

describe('l’attribut hidden', () => {
  it('masque tout élément, quelle que soit la règle d’affichage de sa classe', () => {
    const rule = css.match(/(?:^|\})\s*\[hidden\]\s*\{([^}]*)\}/);

    expect(rule?.[1]).toMatch(/display\s*:\s*none\s*!important/);
  });

  it('n’est contredit par aucune autre règle `display: … !important`', () => {
    const forced = displays().filter(({ value, selector }) => value.includes('!important') && !/^\[hidden\]$/.test(selector) && !value.startsWith('none'));

    expect(forced).toEqual([]);
  });
});
