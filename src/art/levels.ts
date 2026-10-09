/**
 * Les niveaux d'un bâtiment : la même silhouette, d'une ère à l'autre.
 *
 * Un bâtiment amélioré ne se redessine pas : on pose sur son sprite de base
 * (`built`, `damaged`) ce qui raconte le temps qui passe, dans le même cadre
 * et sur la même ancre. Le **bois**, c'est le niveau 1, tel qu'il est bâti ;
 * le niveau 2 passe à la **pierre** — un soubassement de moellons corail,
 * des chaînages d'angle, un fanion corail — et le niveau 3 à la **brique** —
 * un soubassement de briques orange, des lanternes aux angles, une guirlande
 * de fanions et l'étendard doré. Chaque ère empile ce que l'autre portait :
 * on lit le niveau de loin, par la couleur du pied et de la hampe.
 *
 * Le chantier (`site`) n'a pas de niveau : on ne bâtit jamais qu'au premier.
 */

import { PALETTE, RADIUS, circle, flag, line, pill, polygon, rect, shadedBlock } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const { ink, coral, orange, yellow, mint, cyan } = PALETTE;

/** Où se pose l'ornement d'un bâtiment : ce que son sprite de base laisse libre. */
export interface LevelSpot {
  /** Largeur de l'emprise, en pixels : le soubassement et les angles la suivent. */
  footprint: number;
  /** Où plante la hampe du fanion, au sommet du bâtiment. */
  flagX: number;
  flagY: number;
  /** La hauteur à laquelle court la guirlande du niveau 3, entre les deux angles. */
  bunting: number;
}

/** Les moellons du soubassement de pierre : une rangée de petits blocs corail. */
function stonePlinth(width: number, bottom: number): string {
  const count = Math.round(width / 16);
  const w = width / count;
  let out = '';

  for (let index = 0; index < count; index += 1) {
    out += shadedBlock(index * w + 0.5, bottom - 8, w - 1, 8, 3, 'coral', RADIUS.small);
  }
  return out;
}

/** Les briques du soubassement : deux rangées décalées, orange, jointoyées de leur ombre. */
function brickPlinth(width: number, bottom: number): string {
  const w = 10;
  let out = rect(0, bottom - 9, width, 9, orange.shade, RADIUS.small);

  for (let row = 0; row < 2; row += 1) {
    const shift = row === 0 ? 0 : w / 2;

    for (let x = -shift; x < width; x += w) {
      const left = Math.max(0, x + 0.6);
      const right = Math.min(width, x + w - 0.6);

      if (right - left > 2) out += rect(left, bottom - 9 + row * 4.6 + 0.4, right - left, 3.8, orange.base, 1.2);
    }
  }
  return out + pill(2, bottom - 8.2, Math.min(14, width * 0.2), 1.2, orange.light);
}

/** Un chaînage d'angle : une colonne de pierre, ou de brique, du pied à mi-mur. */
function corner(x: number, bottom: number, tone: 'coral' | 'orange'): string {
  return shadedBlock(x, bottom - 30, 5, 28, 2, tone, 2);
}

/** Une lanterne sur sa potence, au sommet d'un chaînage d'angle. */
function lantern(x: number, bottom: number): string {
  return (
    line(x + 2.5, bottom - 38, x + 2.5, bottom - 30, ink.base) +
    circle(x + 2.5, bottom - 41, 4, yellow.shade) +
    circle(x + 2.2, bottom - 41.4, 3, yellow.base) +
    circle(x + 1.4, bottom - 42.4, 1.1, yellow.light)
  );
}

/** Une guirlande de fanions d'un angle à l'autre, qui pend en deux festons. */
function bunting(width: number, y: number): string {
  const tones = [coral, cyan, mint, yellow, coral, cyan, mint] as const;
  const count = 7;
  let out = line(6, y, width / 2, y + 3, ink.base) + line(width / 2, y + 3, width - 6, y, ink.base);

  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const x = 6 + t * (width - 12);
    const sag = 3 * (1 - Math.abs(t - 0.5) * 2);

    out += polygon([x - 2.4, y + sag + 0.4, x + 2.4, y + sag + 0.4, x, y + sag + 6], tones[index]?.base ?? coral.base);
  }
  return out;
}

/** Le fanion du sommet : corail en pierre, étendard doré à queue d'aronde et boule en brique. */
function pennant(level: 2 | 3, x: number, y: number): string {
  if (level === 2) return flag(x, y, 13, 'coral');
  return (
    line(x, y - 4, x, y + 14, ink.base) +
    circle(x, y - 5, 2.2, yellow.base) +
    polygon([x, y - 1, x + 13, y - 1, x + 9.5, y + 3, x + 13, y + 7, x, y + 7], yellow.shade) +
    polygon([x, y - 1, x + 12, y - 1, x + 8.8, y + 2.4, x, y + 2.4], yellow.base) +
    pill(x + 1.5, y, 5.5, 1.4, yellow.light)
  );
}

/** Ce qu'on pose par-dessus le sprite d'un bâtiment, au niveau `level`. */
export function levelOverlay(level: 2 | 3, spot: LevelSpot, height: number): string {
  const { footprint, flagX, flagY } = spot;
  const stone = level === 2;

  return (
    corner(1, height, stone ? 'coral' : 'orange') +
    corner(footprint - 6, height, stone ? 'coral' : 'orange') +
    (stone ? stonePlinth(footprint, height) : brickPlinth(footprint, height)) +
    (stone ? '' : lantern(1, height) + lantern(footprint - 6, height) + bunting(footprint, spot.bunting)) +
    pennant(level, flagX, flagY)
  );
}

/**
 * Le sprite du bâtiment au niveau `level` : tous les morceaux de `base`, sauf
 * le chantier, dont `built` et `damaged` portent l'ornement de l'ère.
 */
export function levelled(base: SpriteProto, level: 2 | 3, spot: LevelSpot): SpriteProto {
  const overlay = levelOverlay(level, spot, base.height);
  const parts: Record<string, string> = {};

  for (const [name, source] of Object.entries(base.parts)) {
    if (name === 'site') continue;
    // L'ornement va juste avant `</svg>` : devant le bâtiment, derrière les marques de dégâts.
    parts[name] = name === 'built' || name === 'damaged' ? source.replace(/<\/svg>$/, `${overlay}</svg>`) : source;
  }
  return { ...base, parts };
}

