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

  /** Les zones nommées d'un `grid-template-areas` : une chaîne par rangée, mots séparés. */
  function areas(media: string): string[][] {
    const rule = rules.find((r) => r.media === media && r.selectors.includes('.hud-top') && r.declarations.has('grid-template-areas'));

    return (rule?.declarations.get('grid-template-areas') ?? '').split("' '").map((row) => row.replace(/'/g, '').trim().split(' '));
  }

  it('ne met la météo ni dans la rangée de la ville ni dans sa colonne, sous 1600 px', () => {
    for (const media of ['', '@media (min-width: 600px)']) {
      const grid = areas(media);

      expect(grid.length, media).toBeGreaterThan(1);
      for (const row of grid) {
        if (row.includes('left')) expect(row, `${media} : ${row.join(' ')}`).not.toContain('right');
      }
    }
  });

  it('ne passe à la rangée unique qu’à 1600 px, où le groupe de gauche tient tout entier', () => {
    expect(areas('@media (min-width: 1600px)')).toEqual([['left', 'main', 'right', 'controls']]);
    expect(rules.some((rule) => rule.media === '@media (min-width: 1366px)' && rule.selectors.includes('.hud-top'))).toBe(false);
  });

  it('retire le groupe de droite de la grille tant qu’aucune météo ne tombe', () => {
    const empty = rules.find((rule) => rule.selectors.some((selector) => selector.startsWith('.hud-right:not(:has(.hud-weather')));

    expect(empty?.declarations.get('display')).toBe('none');
  });

  it('laisse la ville se réduire et défiler dans son groupe', () => {
    const town = rules.find((rule) => rule.selectors.includes('.hud .hud-top .hud-town'));

    expect(town?.declarations.get('flex')).toBe('0 1 auto');
    expect(town?.declarations.get('overflow')).toBe('hidden');
  });

  /** La largeur minimale du bandeau de la ville, à une largeur d'écran : ce qui l'entoure, `--town-chrome`, et ses objets. */
  function townMin(width: number): { min: number; item: number } {
    const vars = new Map<string, number>();
    const matching = rules.filter((rule) => rule.selectors.includes('.hud .hud-top .hud-town') && rule.declarations.has('--town-item'));

    for (const rule of matching) {
      const max = /max-width: (\d+)px/.exec(rule.media)?.[1];

      if (max !== undefined && width > Number(max)) continue;
      for (const name of ['--town-item', '--town-chrome']) {
        const value = rule.declarations.get(name);

        if (value) vars.set(name, parseFloat(value));
      }
    }
    const item = vars.get('--town-item')!;

    return { min: vars.get('--town-chrome')! + 4 * item, item };
  }

  it('garde au bandeau de la ville la place de quatre objets', () => {
    const town = rules.find((rule) => rule.selectors.includes('.hud .hud-top .hud-town') && rule.declarations.has('min-width'));
    const items = rules.find((rule) => rule.selectors.includes('.hud-town .hud-stock-items') && rule.declarations.has('min-width'));

    expect(town?.declarations.get('min-width')).toBe('calc(var(--town-chrome) + 4 * var(--town-item))');
    expect(items?.declarations.get('min-width')).toBe('calc(4 * var(--town-item))');
  });

  /*
   * Avec tous les événements actifs (faveur, vague, vivres, météo, combo, « Passer la nuit »),
   * la pile n'occupe que sa capsule de tête et son « +N » : sur la rangée du groupe de gauche,
   * la ville garde sa place minimale. Largeurs prudentes des autres blocs de la rangée.
   */
  const OTHERS = { people: 330, clock: 110, stack: 150 + 48 };

  it.each([1366, 1460, 1920])('laisse au moins quatre objets à la ville à %i px, tous les événements actifs', (width) => {
    const row = width - 2 * 8;
    const gaps = 3 * 8;
    const { min, item } = townMin(width);

    expect(item).toBeGreaterThan(0);
    expect(min).toBeGreaterThanOrEqual(4 * item);
    expect(min + OTHERS.people + OTHERS.clock + OTHERS.stack + gaps).toBeLessThanOrEqual(row);
  });

  it.each([320, 390])('tient la ville sur sa propre rangée à %i px, quatre objets lisibles', (width) => {
    const { min } = townMin(width);

    expect(min).toBeLessThanOrEqual(width - 2 * (width < 360 ? 4 : 8));
  });

  it('range tous les événements dans une seule pile', () => {
    const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');

    for (const id of ['hasten', 'combo', 'boon', 'wave', 'hunger', 'weather']) expect(hud).toContain(`this.events.add('${id}'`);
    expect(hud).toContain('this.left.append(this.town, this.people, this.dayClock, this.events.root)');
  });

});
