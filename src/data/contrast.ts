/**
 * Le contraste des textes (WCAG 2.x) : le ratio de luminance entre un texte et
 * son fond, et la liste des paires de `PALETTE` que le HUD et les toasts
 * emploient pour écrire. Le seuil est AA, 4,5:1 (texte courant) ; le test
 * (`contrast.test.ts`) refuse une paire qui passe dessous, pour qu'une couleur
 * de texte trop pâle ne se glisse pas en douce.
 *
 * Contenu pur, sans DOM ni Pixi.
 */

import { PALETTE } from './artDirection.ts';

/** Le seuil AA d'un texte courant. */
export const AA_RATIO = 4.5;

type Rgb = readonly [number, number, number];

function parse(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** La luminance relative d'une couleur `#rrggbb`, de 0 (noir) à 1 (blanc). */
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((channel) => {
    const unit = channel / 255;

    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Le ratio de contraste entre deux couleurs `#rrggbb`, de 1 à 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

  return (light + 0.05) / (dark + 0.05);
}

/** Le mélange de deux couleurs dans l'espace sRGB, comme `color-mix(in srgb, …)` : `share` de `a`. */
export function mixColors(a: string, b: string, share: number): string {
  const [from, to] = [parse(a), parse(b)];
  const channel = (index: number): string =>
    Math.round(from[index]! * share + to[index]! * (1 - share))
      .toString(16)
      .padStart(2, '0');

  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * Le vert d'un texte « bon » (une tendance qui monte, un solde positif) :
 * l'ombre de la menthe, tirée vers l'indigo — la menthe elle-même n'atteint
 * pas 4,5:1 sur le blanc. `--good-text` de `style.css` en est le même mélange.
 */
export const GOOD_TEXT_SHARE = 0.65;
export const GOOD_TEXT = mixColors(PALETTE.mint.shade, PALETTE.ink.shade, GOOD_TEXT_SHARE);

/** Une paire texte / fond du HUD ou des toasts. */
export interface TextPair {
  readonly name: string;
  readonly text: string;
  readonly background: string;
}

export const TEXT_PAIRS: readonly TextPair[] = [
  { name: 'texte courant sur carte blanche', text: PALETTE.ink.base, background: PALETTE.paper.base },
  { name: 'texte courant sur carte lavande', text: PALETTE.ink.base, background: PALETTE.paper.shade },
  { name: 'texte atténué sur carte blanche', text: PALETTE.violet.shade, background: PALETTE.paper.base },
  { name: 'texte de danger sur carte blanche', text: PALETTE.coral.shade, background: PALETTE.paper.base },
  { name: 'texte « bon » sur carte blanche', text: GOOD_TEXT, background: PALETTE.paper.base },
  { name: 'toast sur fond blanc', text: PALETTE.ink.base, background: PALETTE.paper.base },
  { name: 'objectif sur jaune', text: PALETTE.ink.base, background: PALETTE.yellow.base },
  { name: 'conseil d’Ève sur cyan', text: PALETTE.ink.base, background: PALETTE.cyan.light },
  { name: 'conseil urgent sur corail clair', text: PALETTE.ink.shade, background: PALETTE.coral.light },
  { name: 'alerte de vivres : blanc sur corail foncé', text: PALETTE.paper.base, background: PALETTE.coral.shade },
  { name: 'contraste élevé : indigo foncé sur blanc', text: PALETTE.ink.shade, background: PALETTE.paper.base },
];
