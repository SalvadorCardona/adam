/**
 * Les images de la bibliothèque Steam, pour l'application de bureau ajoutée
 * en « jeu non-Steam » (Propriétés → Personnaliser) :
 *
 *   npm run art:steam -- <dossier>
 *
 * Toutes viennent du key art de l'écran titre (`titleScene`, ses plans
 * aplatis au grand jour : ni étoiles, ni fenêtres allumées, ni lucioles, qui
 * n'existent qu'en transparence au crépuscule) et du logo en capsules
 * (`titleLogo`) — aucun dessin de plus, la direction artistique suit d'elle-même.
 *
 * Écrit dans `<dossier>` une page HTML par image, puis affiche les commandes
 * Chrome sans interface qui en font les PNG de `docs/steam/` : capsule
 * 600 × 900, bannière 920 × 430, image héros 1920 × 620 (sans logo : Steam
 * pose le sien par-dessus), logo transparent 1280 × 600, icône 256 × 256.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brandIcon, titleLogo } from '../art/brand.ts';
import { TITLE_ART, titleScene, type TitleProp } from '../art/titleScene.ts';

const [directory = 'steam'] = process.argv.slice(2);
const out = resolve(directory);

/** Les plans qui ne sont que des lumières du soir : l'image est prise en plein jour. */
const NIGHT_ONLY = new Set(['stars', 'cityLights', 'motes']);

/** Le dessin d'un SVG, sans sa balise. */
function body(source: string): string {
  return source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

/** Un accessoire à sa place, au repos ; un groupe `clip` rogne ce qui dépasse (le mutant derrière sa ruine). */
function flatten(prop: TitleProp): string {
  if (prop.view === 'back') return '';
  const own = prop.svg ? `<svg x="${prop.x}" y="${prop.y}" width="${prop.width}" height="${prop.height}" overflow="visible">${body(prop.svg)}</svg>` : '';
  const children = (prop.children ?? []).map(flatten).join('');

  if (!prop.clip) return own + children;
  return `<svg x="${prop.x}" y="${prop.y}" width="${prop.width}" height="${prop.height}" viewBox="${prop.x} ${prop.y} ${prop.width} ${prop.height}">${own}${children}</svg>`;
}

const SCENE = titleScene()
  .filter((layer) => !NIGHT_ONLY.has(layer.id))
  .flatMap((layer) => layer.props.map(flatten))
  .join('');

/**
 * Une image : le cadre `[x, y, w, h]` du key art, étiré sur `width × height`
 * (rognant ce qui déborde), et le logo, à `logo` (x, y, largeur, en pixels de
 * l'image) s'il en faut un.
 */
function image(width: number, height: number, view: readonly [number, number, number, number], logo?: readonly [number, number, number]): string {
  const [x, y, w, h] = view;
  const mark = logo ? `<svg x="${logo[0]}" y="${logo[1]}" width="${logo[2]}" height="${(logo[2] * 180) / 432}" viewBox="0 0 432 180">${body(titleLogo())}</svg>` : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<svg width="${width}" height="${height}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid slice">${SCENE}</svg>${mark}</svg>`
  );
}

/** Une page de la taille exacte de l'image ; `transparent` laisse le fond vide (le logo). */
function page(source: string, width: number, height: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; }
svg { display: block; }
</style></head><body>${source}</body></html>`;
}

const { width: W, height: H } = TITLE_ART;
const IMAGES: readonly { name: string; width: number; height: number; source: string; transparent?: boolean }[] = [
  // La capsule, en portrait : toute la scène, le logo dans le ciel.
  { name: 'capsule', width: 600, height: 900, source: image(600, 900, [100, 0, 600, H], [90, 40, 420]) },
  // La bannière : la clairière et sa mairie, le logo à gauche dans le ciel.
  { name: 'banner', width: 920, height: 430, source: image(920, 430, [0, 220, W, 374], [24, 14, 270]) },
  // L'image héros, sans logo : la ligne de la ville et la mairie au centre.
  { name: 'hero', width: 1920, height: 620, source: image(1920, 620, [0, 336, W, 258]) },
  // Le logo seul, avec une marge : sa liane et son « m » débordent un peu de son cadre.
  {
    name: 'logo',
    width: 1280,
    height: 600,
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="600" viewBox="-24 -12 480 225">${body(titleLogo())}</svg>`,
    transparent: true,
  },
  { name: 'icon', width: 256, height: 256, source: brandIcon() },
];

mkdirSync(out, { recursive: true });
const commands: string[] = [];

for (const { name, width, height, source, transparent } of IMAGES) {
  // Le SVG agrandi à la taille de l'image : sa `viewBox` reste, le dessin suit.
  const sized = source.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${width}" height="${height}"`);

  writeFileSync(`${out}/${name}.html`, page(sized, width, height));
  commands.push(
    `google-chrome --headless --hide-scrollbars ${transparent ? '--default-background-color=00000000 ' : ''}--screenshot=docs/steam/${name}.png --window-size=${width},${height} file://${out}/${name}.html`,
  );
}
console.log(commands.join('\n'));
