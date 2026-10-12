/**
 * Planche de relecture : tous les visuels du jeu sur une seule image.
 *
 *   npm run art:sheet -- planche.svg [échelle] [section]
 *
 * Écrit un SVG où chaque morceau de chaque sprite, chaque tuile de sol,
 * chaque icône est posé sur l'herbe, agrandi, avec son nom. La section
 * « Bâtiments » met chaque bâtiment sur sa ligne — chantier, fini,
 * endommagé, puis sa vignette du menu à sa taille réelle — pour vérifier
 * qu'on les distingue ; `section` (« Bâtiments », « Sol »…) ne garde qu'elle. C'est ce qu'on
 * regarde avant de valider un visuel (cf. le skill `art-direction`) : pour
 * l'ouvrir avec `Read`, le convertir en PNG avec Chrome sans interface —
 *
 *   google-chrome --headless --screenshot=planche.png --window-size=L,H planche.svg
 *
 * (L et H sont affichés à la fin). Outil de Node : il lit les SVG en chaînes,
 * sans navigateur.
 */

import { writeFileSync } from 'node:fs';
import { CURSOR_SVGS } from '../art/cursors.ts';
import { ROAD_TILES } from '../art/road.ts';
import { GROUND_TILES, cornerTile, edgeTile, shadowTile } from '../art/terrain.ts';
import { UI_ICONS, dayDialSvg } from '../art/ui.ts';
import { DIAL_ARCS } from '../sim/dayNight.ts';
import { GROUND, PALETTE, rect, svg, type Ground } from '../data/artDirection.ts';
import { BUILDINGS, BUILDING_IDS, type BuildingProto } from '../data/buildings.ts';
import { ITEM_ICONS } from '../data/icons.ts';
import { JOB_ICONS } from '../data/jobIcons.ts';
import { ROAD_LINK } from '../data/roads.ts';
import { BUILDING_PARTS, SPRITES, SPRITE_IDS, type SpriteProto } from '../data/sprites.ts';

interface Cell {
  label: string;
  svg: string;
  width: number;
  height: number;
  /** Échelle propre à la case : 1 pour une vignette à sa taille réelle. */
  scale?: number;
}

const [output = 'planche.svg', scaleArg = '3', only] = process.argv.slice(2);
const scale = Number(scaleArg);
const COLUMNS = 8;
const GAP = 16;
const LABEL = 18;

function sizeOf(svg: string): [number, number] {
  const match = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);

  return match ? [Number(match[1]), Number(match[2])] : [32, 32];
}

function cell(label: string, svg: string, cellScale?: number): Cell {
  const [width, height] = sizeOf(svg);

  return { label, svg, width, height, scale: cellScale };
}

/** Découpe une liste de cases en lignes de `COLUMNS`. */
function rows(cells: Cell[]): Cell[][] {
  const result: Cell[][] = [];

  for (let start = 0; start < cells.length; start += COLUMNS) result.push(cells.slice(start, start + COLUMNS));
  return result;
}

/** Une ligne par bâtiment : ses trois états, puis sa vignette du menu (40 px, comme dans le tiroir). */
function buildingRows(): Cell[][] {
  return BUILDING_IDS.map((id) => {
    const parts = SPRITES[BUILDINGS[id].sprite].parts as Record<string, string>;
    const thumbnail = parts['built'] ?? '';
    const [w, h] = sizeOf(thumbnail);

    return [
      ...BUILDING_PARTS.map((part) => cell(`${id}.${part}`, parts[part] ?? '')),
      cell(`${id} (menu)`, thumbnail, 40 / Math.max(w, h)),
    ];
  });
}

/**
 * La planche des niveaux : une ligne par bâtiment qui monte, ses niveaux
 * côte à côte (bois, pierre, brique) puis le dernier endommagé ; et les
 * décorations, finies, avec leur chantier.
 */
function levelRows(): Cell[][] {
  const levelled = BUILDING_IDS.filter((id) => BUILDINGS[id].upgrades.length > 0 && BUILDINGS[id].kind !== 'antenna' && BUILDINGS[id].kind !== 'tower');
  const upgrades = levelled.map((id): Cell[] => {
    const proto: BuildingProto = BUILDINGS[id];
    const sprites = [proto.sprite, ...proto.upgrades.map((upgrade) => upgrade.sprite)];
    const last = SPRITES[sprites[sprites.length - 1] ?? proto.sprite].parts as Record<string, string>;

    return [
      ...sprites.map((sprite, index) => cell(`${id} niveau ${index + 1}`, (SPRITES[sprite].parts as Record<string, string>)['built'] ?? '')),
      cell(`${id} niveau ${sprites.length} abîmé`, last['damaged'] ?? ''),
    ];
  });
  const decor = BUILDING_IDS.filter((id) => BUILDINGS[id].kind === 'decor').flatMap((id): Cell[] => {
    const parts = SPRITES[BUILDINGS[id].sprite].parts as Record<string, string>;

    return BUILDING_PARTS.map((part) => cell(`${id}.${part}`, parts[part] ?? ''));
  });

  return [...upgrades, ...rows(decor)];
}

const allSections: [string, Cell[][]][] = [
  ['Niveaux', levelRows()],
  ['Bâtiments', buildingRows()],
  [
    'Sprites',
    rows(
      SPRITE_IDS.flatMap((id) =>
        Object.entries((SPRITES[id] as SpriteProto).parts).map(([part, svg]) => cell(`${id}.${part}`, svg)),
      ),
    ),
  ],
  [
    'Sol',
    rows(
      (Object.keys(GROUND) as Ground[]).flatMap((ground) => [
        ...GROUND_TILES[ground].map((svg, i) => cell(`${ground}.${i}`, svg)),
        ...(['top', 'bottom'] as const).flatMap((side) => {
          const svg = edgeTile(ground, side);

          return svg ? [cell(`${ground}.bord-${side}`, svg)] : [];
        }),
        cell(`${ground}.coin`, cornerTile(GROUND[ground].base, 'tl')),
        cell(`${ground}.ombre`, shadowTile(ground)),
      ]),
    ),
  ],
  [
    'Routes',
    rows(ROAD_TILES.map((tile, links) => cell(`road.${links}`, tile))).concat([[cell('road.réseau', roadSample())]]),
  ],
  // Le métier de chaque bâtiment, sous son nom : on vérifie d'un coup d'œil qu'aucun n'en double un autre.
  ['Métiers', rows(BUILDING_IDS.map((id) => cell(BUILDINGS[id].label, JOB_ICONS[id])))],
  ['Curseurs', rows(Object.entries(CURSOR_SVGS).map(([id, svg]) => cell(`curseur.${id}`, svg)))],
  [
    'Icônes',
    rows([
      ...Object.entries(ITEM_ICONS).map(([item, svg]) => cell(`objet.${item}`, svg)),
      ...Object.entries(UI_ICONS).map(([name, svg]) => cell(`ui.${name}`, svg)),
      cell('ui.horloge.jour', dayDialSvg(DIAL_ARCS, 0.3, false, false)),
      cell('ui.horloge.alerte', dayDialSvg(DIAL_ARCS, 0.66, false, true)),
      cell('ui.horloge.nuit', dayDialSvg(DIAL_ARCS, 0.8, true, false)),
    ]),
  ],
];

/** Un petit réseau sur l'herbe : droit, coins, T, croix et bouts, pour voir les dalles se recoller. */
function roadSample(): string {
  const map = ['.#....', '.#####', '.#..#.', '####..', '.#....'];
  const paved = (x: number, y: number): boolean => map[y]?.[x] === '#';
  const tiles: string[] = [];

  for (const [y, line] of map.entries()) {
    for (let x = 0; x < line.length; x += 1) {
      tiles.push(rect(x * 32, y * 32, 32, 32, (x + y) % 2 === 0 ? GROUND.grass.base : GROUND.grass.alt, 0));
      if (!paved(x, y)) continue;

      const links =
        (paved(x, y - 1) ? ROAD_LINK.top : 0) |
        (paved(x + 1, y) ? ROAD_LINK.right : 0) |
        (paved(x, y + 1) ? ROAD_LINK.bottom : 0) |
        (paved(x - 1, y) ? ROAD_LINK.left : 0);

      // Un `<svg>` imbriqué coupe à son cadre, comme la rastérisation d'une tuile seule.
      tiles.push(ROAD_TILES[links]!.replace('<svg ', `<svg x="${x * 32}" y="${y * 32}" `));
    }
  }
  return svg(map[0]!.length * 32, map.length * 32, ...tiles);
}

const sections = only ? allSections.filter(([title]) => title === only) : allSections;

let y = GAP;
let width = 0;
const body: string[] = [];

for (const [title, sectionRows] of sections) {
  body.push(`<text x="${GAP}" y="${y + 22}" font-family="sans-serif" font-size="22" fill="${PALETTE.ink.base}">${title}</text>`);
  y += 36;

  for (const row of sectionRows) {
    const rowHeight = Math.max(...row.map((c) => c.height * (c.scale ?? scale))) + LABEL;
    let x = GAP;

    for (const c of row) {
      const w = Math.max(c.width * (c.scale ?? scale), 120);

      body.push(
        `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${rowHeight + 4}" rx="8" fill="${GROUND.grass.base}"/>`,
        `<g transform="translate(${x} ${y}) scale(${c.scale ?? scale})">${c.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`,
        `<text x="${x}" y="${y + rowHeight - 4}" font-family="sans-serif" font-size="13" fill="${PALETTE.ink.base}">${c.label}</text>`,
      );
      x += w + GAP;
    }
    width = Math.max(width, x);
    y += rowHeight + GAP;
  }
}

const sheet =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}">` +
  `<rect width="100%" height="100%" fill="${PALETTE.paper.base}"/>${body.join('')}</svg>`;

writeFileSync(output, sheet);
console.log(`${output} : ${width} × ${y}`);
