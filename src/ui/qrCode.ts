/**
 * Le QR code d'un lien, dessiné comme le reste du jeu : un SVG de la palette
 * (modules indigo sur carte blanche), construit avec les helpers de la DA.
 * L'encodage est celui de `qrcode-generator` (correction d'erreur M) ; le
 * dessin reste carré et à fort contraste, un QR arrondi ou pâle ne se scanne pas.
 */

import qrcode from 'qrcode-generator';
import { PALETTE, rect, shape, svg } from '../data/artDirection.ts';

/** La marge blanche autour des modules, en modules : le minimum de la norme. */
const QUIET = 4;

/** Les modules du code : `true` pour un carré sombre. */
export function qrModules(text: string): boolean[][] {
  const code = qrcode(0, 'M');

  code.addData(text);
  code.make();

  const size = code.getModuleCount();

  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => code.isDark(row, column)));
}

/** Le SVG du QR code de `text`. */
export function qrSvg(text: string): string {
  const modules = qrModules(text);
  const side = modules.length + QUIET * 2;
  let path = '';

  // Un rectangle par suite de modules sombres d'une même rangée.
  modules.forEach((row, y) => {
    let x = 0;

    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }

      const start = x;

      while (row[x]) x += 1;
      path += `M${start + QUIET} ${y + QUIET}h${x - start}v1h${start - x}z`;
    }
  });

  return svg(side, side, rect(0, 0, side, side, PALETTE.paper.base, 2), shape(path, PALETTE.ink.base));
}
