import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Le haut de l'écran : une seule rangée, collée en haut, de blocs de même
 * hauteur (cf. `.hud-top` dans `style.css`). Les tests tournent sans
 * navigateur : on ne mesure pas, on verrouille les règles qui font l'égalité —
 * une seule variable de hauteur, `--hud-h`, que tous les blocs prennent, un
 * seul décalage depuis le haut, et rien qui décale un bloc de sa rangée
 * (marge, `top`, transformation, hauteur à part).
 */

interface Rule {
  readonly selectors: readonly string[];
  readonly media: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/** Les règles d'une feuille, celles des `@media` comprises : de quoi juger, pas un vrai parseur. */
function parseRules(css: string, media = ''): Rule[] {
  const rules: Rule[] = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('{', index);

    if (open < 0) break;
    const prelude = source.slice(index, open).trim();
    let depth = 1;
    let close = open + 1;

    while (depth > 0 && close < source.length) {
      if (source[close] === '{') depth += 1;
      if (source[close] === '}') depth -= 1;
      close += 1;
    }
    const body = source.slice(open + 1, close - 1);

    if (prelude.startsWith('@media')) {
      rules.push(...parseRules(body, prelude));
    } else if (!prelude.startsWith('@')) {
      const declarations = new Map<string, string>();

      for (const line of body.split(';')) {
        const colon = line.indexOf(':');

        if (colon > 0) declarations.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim().replace(/\s+/g, ' '));
      }
      rules.push({ selectors: prelude.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')), media, declarations });
    }
    index = close;
  }
  return rules;
}

const rules = parseRules(readFileSync(new URL('../style.css', import.meta.url), 'utf8'));

/** Le dernier composé d'un sélecteur vise-t-il ce bloc lui-même, hors état passager (`:active`) ? */
function targets(selector: string, block: string): boolean {
  const last = selector.split(/[\s>+~]+/).at(-1) ?? '';

  return !last.includes(':') && last.replace(/\[[^\]]*\]/g, '').split('.').includes(block.slice(1));
}

function declared(block: string, property: string): string[] {
  return rules
    .filter((rule) => rule.selectors.some((selector) => targets(selector, block)))
    .flatMap((rule) => {
      const value = rule.declarations.get(property);

      return value === undefined ? [] : [value];
    });
}

/** Les blocs de la rangée du haut : la barre, et ceux des groupes de gauche et de droite. */
const BLOCKS = ['.hud-topbar', '.hud-town', '.hud-people', '.hud-clock', '.hud-hunger', '.hud-wave', '.hud-weather'];
/** Les cases de la barre : toutes de la hauteur `--cell-h`, tirée de `--hud-h`. */
const CELLS = ['.hud-objective'];

describe('le haut de l’écran', () => {
  it('se colle au bord : la zone sûre et la marge fixe, partout', () => {
    expect(declared('.hud-top', 'top')).toEqual(['calc(var(--safe-top) + var(--hud-margin))']);
    expect(declared('.hud-top', 'align-items')).toEqual(['start']);
    expect(declared('.hud-top', 'margin-top')).toEqual([]);
  });

  it('n’a qu’une variable de hauteur, posée sur la rangée elle-même', () => {
    const owners = rules.filter((rule) => rule.declarations.has('--hud-h')).flatMap((rule) => rule.selectors);

    expect(owners.length).toBeGreaterThan(0);
    expect(new Set(owners)).toEqual(new Set(['.hud-top']));
    expect(rules.filter((rule) => rule.declarations.has('--cell-h')).map((rule) => rule.declarations.get('--cell-h'))).toEqual([
      'calc(var(--hud-h) - 2 * var(--hud-pad))',
    ]);
  });

  it('donne `--hud-h` à chaque bloc des deux groupes et à la barre', () => {
    const group = rules.find((rule) => rule.selectors.includes('.hud .hud-top .hud-left > *'));

    expect(group?.selectors).toContain('.hud .hud-top .hud-right > *');
    expect(group?.declarations.get('height')).toBe('var(--hud-h)');
    expect(group?.declarations.get('margin')).toBe('0');
    expect(declared('.hud-topbar', 'height')).toEqual(['var(--hud-h)']);
  });

  it.each(BLOCKS)('ne décale ni ne redimensionne %s à part', (block) => {
    for (const property of ['height', 'min-height', 'max-height', 'top', 'margin', 'margin-top', 'transform']) {
      const values = declared(block, property).filter((value) => value !== 'var(--hud-h)' && value !== '0');

      expect(values, `${block} { ${property} }`).toEqual([]);
    }
  });

  it.each(CELLS)('tient %s à la hauteur des cases de la barre', (cell) => {
    const heights = rules
      .filter((rule) => rule.selectors.some((selector) => selector.includes('.hud-topbar') && targets(selector, cell)))
      .flatMap((rule) => [rule.declarations.get('height')].filter((value) => value !== undefined));

    expect(heights.length).toBeGreaterThan(0);
    expect(new Set(heights)).toEqual(new Set(['var(--cell-h)']));
  });

  it('laisse l’objectif à sa place quand la quête est ouverte', () => {
    const expanded = rules.filter((rule) => rule.selectors.some((selector) => selector.endsWith(".hud-objective[aria-expanded='true']")));

    expect(expanded.length).toBeGreaterThan(0);
    for (const rule of expanded) expect(rule.declarations.has('transform')).toBe(false);
  });

});
