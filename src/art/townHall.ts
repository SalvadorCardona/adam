/**
 * La mairie : le premier toit de la colonie, et ce que les mutants visent.
 *
 * Le plus grand volume du jeu (emprise 3 × 3) : un grand bloc jaune aux
 * angles larges, un toit corail à deux pans, une terrasse à rambarde, une
 * échelle, une antenne, et le drapeau cyan tout en haut — on la retrouve de
 * loin. Son chantier est celui de la maquette validée, plus un panneau au
 * toit corail.
 *
 * Elle change avec les ères de la colonie (`data/eras.ts`) : `era1` à
 * `era3` sont la mairie finie, plus ce que chaque ère y a ajouté — elles
 * s'empilent. Le Bourg tend une guirlande de fanions et fleurit les
 * fenêtres ; la Ville remet l'horloge à l'heure et hisse un second drapeau
 * sur la terrasse ; la Cité industrielle plante une cheminée qui fume et
 * accroche un engrenage au pignon.
 *
 * Cadre 96 × 128 ; l'emprise occupe les 96 px du bas.
 */

import {
  PALETTE,
  RADIUS,
  circle,
  group,
  pill,
  polygon,
  rect,
  flag,
  flower,
  ladder,
  line,
  railing,
  shadedBlock,
  svg,
  windowPane,
} from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { damageMarks, door, gableRoof, lifeAt, siteArt, siteSign } from './building.ts';

const W = 96;
const H = 128;
const FOOTPRINT = 96;

const { ink, coral, yellow, cyan, mint, orange, paper } = PALETTE;

function hall(): string {
  return (
    shadedBlock(6, 58, 84, 64, 14, 'yellow', RADIUS.large) +
    gableRoof(4, 62, 64, 30) +
    flag(33, 8, 24, 'cyan') +
    // La terrasse du toit, sa rambarde, l'antenne de radio.
    railing(62, 50, 26, 10, 4) +
    line(80, 30, 80, 50, ink.base) +
    line(75, 37, 85, 37, ink.base) +
    circle(80, 29, 2.6, coral.base) +
    windowPane(14, 72, 12, 15, 'yellow') +
    windowPane(68, 72, 12, 15, 'yellow') +
    door(40, 82, 16, 30) +
    // L'horloge arrêtée, au-dessus de la porte.
    circle(48, 72, 5, yellow.light) +
    line(48, 72, 48, 69, ink.base) +
    ladder(86, 50, 62) +
    lifeAt(9, 116, 44) +
    flower(62, 118, 'cyan') +
    flower(70, 116, 'coral')
  );
}

/** Le Bourg : une guirlande de fanions sur la façade, des jardinières sous les fenêtres. */
function borough(): string {
  const tones = [coral, cyan, mint] as const;
  let bunting = line(8, 66, 88, 66, ink.base);

  for (let i = 0; i < 9; i += 1) {
    const x = 11 + i * 8.6;

    bunting += polygon([x, 66, x + 6, 66, x + 3, 71.5], tones[i % tones.length]!.base);
  }

  const box = (x: number): string =>
    rect(x, 87, 16, 5, orange.shade, 2) + rect(x, 87, 16, 3.6, orange.base, 2) + flower(x + 4, 85, 'coral', 0.8) + flower(x + 11, 84.5, 'violet', 0.8);

  return bunting + box(12) + box(66);
}

/** La Ville : l'horloge remise à l'heure, un second drapeau sur la terrasse. */
function town(): string {
  return (
    circle(48, 72, 6.5, yellow.shade) +
    circle(48, 72, 5.5, paper.base) +
    line(48, 72, 48, 68.5, ink.base) +
    line(48, 72, 51, 73.5, ink.base) +
    circle(48, 72, 1.1, coral.base) +
    flag(66, 32, 18, 'mint')
  );
}

/** La Cité industrielle, derrière le toit : une cheminée rayée qui fume. */
function chimney(): string {
  return (
    rect(10, 30, 10, 26, ink.shade, RADIUS.small) +
    rect(10, 30, 8, 24, ink.base, RADIUS.small) +
    rect(10, 38, 8, 3.4, coral.base, 1) +
    rect(10, 46, 8, 3.4, coral.base, 1) +
    pill(8, 28, 14, 5, ink.light) +
    circle(15, 21, 4.4, paper.shade) +
    circle(14.5, 20.5, 3.6, paper.base) +
    circle(21, 15, 3.4, paper.shade) +
    circle(20.6, 14.6, 2.7, paper.base)
  );
}

/** La Cité industrielle, au pignon : un engrenage blanc. */
function cog(): string {
  let teeth = '';

  for (let i = 0; i < 8; i += 1) teeth += group(`translate(33 50) rotate(${i * 45})`, rect(-1.6, -7.5, 3.2, 4, paper.shade, 1));

  return (
    teeth +
    circle(33, 50, 5, paper.shade) +
    circle(32.6, 49.6, 4.2, paper.base) +
    circle(33, 50, 1.8, coral.base)
  );
}

export const TOWN_HALL = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, siteArt(W, H, FOOTPRINT), siteSign(40, 96, gableRoof(42, 52, 102, 97))),
    built: svg(W, H, hall()),
    damaged: svg(W, H, hall(), damageMarks(6, 58, 84, 64)),
    era1: svg(W, H, hall(), borough()),
    era2: svg(W, H, hall(), borough(), town()),
    era3: svg(W, H, chimney(), hall(), borough(), town(), cog()),
  },
} satisfies SpriteProto;
