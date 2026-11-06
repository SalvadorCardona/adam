/**
 * L'identité du jeu, prête à rastériser : l'icône et la bannière.
 *
 *   npm run art:brand -- <dossier>
 *
 * Écrit dans `<dossier>` :
 * - `icon.svg`, l'icône (`art/brand.ts`) ;
 * - `banner.html`, la bannière et son titre dans la police du jeu, chargée
 *   depuis `node_modules` (un SVG seul n'a pas accès à Fredoka).
 *
 * Puis affiche les commandes Chrome sans interface qui en font les PNG du
 * dépôt : `public/icon.png` (1024 px), `public/favicon.png` (64 px) et
 * `docs/banner.png` (1280 × 640, le titre « Adam »).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brandBanner, brandIcon } from '../art/brand.ts';
import { PALETTE } from '../data/artDirection.ts';

const [directory = 'brand'] = process.argv.slice(2);
const out = resolve(directory);
const font = resolve('node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2');

mkdirSync(out, { recursive: true });

/** Un SVG agrandi à `size` px de côté, sans marge : la page fait exactement l'image. */
function page(svg: string, width: number, height: number, overlay = ''): string {
  const sized = svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${width}" height="${height}"`);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fredoka'; font-weight: 700; src: url('file://${font}') format('woff2'); }
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
svg { display: block; }
.title { position: absolute; left: 64px; top: 40px; font-family: 'Fredoka'; font-weight: 700; }
.kicker { display: inline-block; padding: 6px 22px; border-radius: 999px; background: ${PALETTE.paper.base};
  box-shadow: 0 5px 0 ${PALETTE.paper.shade}; color: ${PALETTE.violet.base}; font-size: 26px; letter-spacing: 0.2em; text-transform: uppercase; }
.logo { margin: 18px 0 0; font-size: 190px; line-height: 0.95; color: ${PALETTE.yellow.base};
  text-shadow: 0 8px 0 ${PALETTE.yellow.shade}, 0 16px 0 ${PALETTE.ink.base}; }
</style></head><body>${sized}${overlay}</body></html>`;
}

for (const [name, size] of [
  ['icon', 1024],
  ['favicon', 64],
] as const) {
  writeFileSync(`${out}/${name}.html`, page(brandIcon(), size, size));
}

writeFileSync(
  `${out}/banner.html`,
  page(
    brandBanner(),
    1280,
    640,
    '<div class="title"><div class="kicker">Après la fin du monde</div><h1 class="logo">Adam</h1></div>',
  ),
);
writeFileSync(`${out}/icon.svg`, brandIcon());

const chrome = (file: string, png: string, width: number, height: number): string =>
  `google-chrome --headless --hide-scrollbars --screenshot=${png} --window-size=${width},${height} file://${out}/${file}`;

console.log(
  [
    chrome('icon.html', 'public/icon.png', 1024, 1024),
    chrome('favicon.html', 'public/favicon.png', 64, 64),
    chrome('banner.html', 'docs/banner.png', 1280, 640),
  ].join('\n'),
);
