import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * La colonne de l'écran titre ne défile qu'en hauteur : `overflow-y: auto`
 * fait passer l'axe x en `auto` aussi, et les boutons qui pulsent
 * (`scale` > 1) y dessineraient une barre horizontale, ou seraient rognés.
 */

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Les déclarations de toutes les règles `.title-panel { … }` sans `@media`, réunies. */
function panelDeclarations(): string {
  return [...css.matchAll(/(?:^|\n)\.title-panel\s*\{([^}]*)\}/g)].map((m) => m[1]).join('\n');
}

describe("colonne de l'écran titre", () => {
  it('ne défile pas en largeur', () => {
    expect(panelDeclarations()).toMatch(/overflow-x:\s*hidden/);
  });

  it('garde de quoi laisser pulser ses boutons sans les rogner', () => {
    const match = panelDeclarations().match(/padding-inline:\s*(\d+)px/);

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(6);
  });
});
