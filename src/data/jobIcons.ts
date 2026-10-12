/**
 * Icônes de métier des bâtiments — contenu pur.
 *
 * Un bâtiment = une icône qui dit ce qu'il **fait**, pas à quoi il
 * ressemble : la hache des bûcherons, la pousse du forestier, l'éprouvette
 * du labo. `JOB_ICONS` est un `Record<BuildingId, string>` : ajouter un
 * bâtiment dans `buildings.ts` sans lui donner d'icône ici ne compile pas,
 * comme un objet sans icône (`icons.ts`). `validatePrototypes()` vérifie le
 * cadre, la direction artistique, et que deux bâtiments n'en partagent jamais.
 *
 * Toute la famille tient dans un même médaillon : un disque jaune de la
 * colonie, en trois tons, et l'outil posé dessus — jamais jaune, pour qu'il
 * s'en détache. C'est ce médaillon qui les distingue des icônes d'objets
 * (formes libres, sans fond) : sur la pancarte d'une foreuse, le métier et
 * le filon se lisent côte à côte sans se confondre. Mêmes règles que les
 * sprites : formes pures, aucun contour, un seul trait, lumière en haut à
 * gauche. Le carré fait `ICON_SIZE` de côté, comme les icônes d'objets.
 */

import { PALETTE, circle, curve, ellipse, group, line, pill, polygon, rect, shadedBlock, shadedCircle, shadedPill, shape, svg } from './artDirection.ts';
import type { BuildingId } from './buildings.ts';
import { ICON_SIZE } from './icons.ts';

const S = ICON_SIZE;
const C = S / 2;
const { ink, coral, orange, mint, cyan, violet, paper, skin } = PALETTE;

/** Le médaillon commun : un disque jaune de la colonie, son ombre en bas à droite, son reflet en haut à gauche. */
const MEDAL = shadedCircle(C, C, C - 0.5, 'yellow');

/** Une icône de métier : le médaillon, puis l'outil. */
function job(...body: string[]): string {
  return svg(S, S, MEDAL, ...body);
}

/** Un manche de bois en trois tons, vertical dans son repère : de `top` à `top + length`. */
function handle(top: number, length: number): string {
  return rect(-1.5, top, 3, length, orange.shade, 1.5) + rect(-1.5, top, 2, length - 0.6, orange.base, 1) + pill(-1, top + 1.5, 1, 4, orange.light);
}

/**
 * Les dessins, sous leurs clés littérales : c'est ce que l'atlas range
 * (`art/jobs.ts`). Il ne dépend pas du type des bâtiments, qui dépend
 * lui-même du registre des sprites — sans quoi les types tourneraient en rond.
 * Le reste du jeu lit `JOB_ICONS`.
 */
export const JOB_DRAWINGS = {
  /** La mairie : le fanion corail planté au cœur de la colonie. */
  townHall: job(
    pill(5.5, 17.5, 9, 3, ink.shade),
    line(8.5, 5, 8.5, 18.5, ink.base),
    rect(9, 6, 9.5, 7.5, coral.shade, 2),
    rect(9, 5.5, 9, 6.2, coral.base, 2),
    pill(10.5, 6.6, 4.5, 1.6, coral.light),
  ),
  /** Les bûcherons : la hache, fer cyan sur manche de bois. */
  lumberCamp: job(
    group(
      'translate(13 12.5) rotate(30)',
      handle(-8, 16),
      polygon([-1, -8.5, -8, -10, -8, -1.5, -1, -3.5], cyan.shade),
      polygon([-1, -8.5, -7.2, -9.8, -7.2, -3, -1, -4.6], cyan.base),
      pill(-6.4, -8.7, 1.4, 3.6, cyan.light),
    ),
  ),
  /** Le forestier : une pousse qui sort de sa motte. */
  foresterHouse: job(
    shadedPill(6, 15.5, 12, 5, 1.6, 'ink'),
    line(12, 16, 12, 9, mint.shade),
    group('translate(12 11) rotate(-155)', pill(0, -2.2, 7.5, 4.4, mint.shade), pill(0, -2.2, 7, 3.4, mint.base)),
    group('translate(12 9.5) rotate(-35)', pill(0, -2.2, 7.5, 4.4, mint.shade), pill(0, -2.2, 7, 3.4, mint.base), pill(2, -1.4, 3, 1.2, mint.light)),
  ),
  /** La carrière : le pic, et l'éclat de pierre corail qu'il vient de tailler. */
  quarry: job(
    shadedPill(3.5, 15.5, 6.5, 4.5, 1.4, 'coral'),
    group(
      'translate(13 12) rotate(-30)',
      handle(-7, 15),
      polygon([-9, -4, -4.5, -8.6, 4.5, -8.6, 9, -4, 4, -6.2, -4, -6.2], cyan.shade),
      polygon([-8.4, -4.6, -4.4, -8.6, 4.4, -8.6, 8.4, -4.6, 4, -7.2, -4, -7.2], cyan.base),
      pill(-4, -8.2, 4, 1.2, cyan.light),
    ),
  ),
  /** Le puits : le seau qui remonte, plein d'eau. */
  well: job(
    curve('M6.5 10 C6.5 3.5 17.5 3.5 17.5 10', ink.base),
    polygon([5.5, 9.5, 18.5, 9.5, 16.5, 19.5, 7.5, 19.5], violet.shade),
    polygon([5.5, 9.5, 17.5, 9.5, 15.7, 18, 7.3, 18], violet.base),
    pill(7.5, 12, 1.6, 4.5, violet.light),
    ellipse(12, 10, 6, 1.8, cyan.base),
    pill(9, 9.4, 4, 1, cyan.light),
  ),
  /** La logistique : une caisse et sa flèche — ça part d'ici vers la mairie. */
  logisticsPost: job(
    shadedBlock(4.5, 6.5, 15, 13, 3, 'orange', 3),
    polygon([7.5, 11, 12, 11, 12, 8.5, 16.5, 12, 12, 15.5, 12, 13, 7.5, 13], paper.base),
  ),
  /** Les bâtisseurs : un mur de briques qui monte, la truelle posée dessus. */
  constructionPost: job(
    shadedBlock(4, 14, 7.6, 5.5, 1.8, 'coral', 1.6),
    shadedBlock(12.4, 14, 7.6, 5.5, 1.8, 'coral', 1.6),
    shadedBlock(8.2, 8.5, 7.6, 5.5, 1.8, 'coral', 1.6),
    line(16.5, 8.5, 19, 5.5, ink.base),
    polygon([13.5, 10.5, 16, 7.5, 18.5, 12.5], cyan.shade),
    polygon([13.8, 10.2, 16, 7.8, 17.6, 11.4], cyan.base),
  ),
  /** La foreuse : la mèche qui s'enfonce dans le filon. */
  drill: job(
    rect(8, 3.5, 8, 4.5, ink.base, 1.5),
    polygon([7, 7.5, 17, 7.5, 12, 21], cyan.shade),
    polygon([7, 7.5, 15.6, 7.5, 11.6, 19], cyan.base),
    line(8.5, 10.5, 15.5, 9, cyan.shade),
    line(9.6, 13.6, 14.6, 12.4, cyan.shade),
    line(10.8, 16.6, 13.6, 15.8, cyan.shade),
    pill(8.4, 4.2, 3, 1.2, ink.light),
  ),
  /** La nurserie : un berceau à bascule, un bébé sous sa couverture. */
  nursery: job(
    curve('M5 19 Q12 22.5 19 19', ink.base),
    rect(13, 6, 6.5, 8, coral.shade, 3.2),
    shadedBlock(4.5, 10, 15, 8, 2.4, 'coral', 4),
    circle(9, 9.6, 2.6, skin.shade),
    circle(8.7, 9.3, 2.3, skin.base),
    pill(7, 10.5, 10, 3, paper.base),
  ),
  /** La maison des constructeurs : le marteau des ouvriers qui portent aux chantiers. */
  builderHouse: job(
    group(
      'translate(12 12.5) rotate(40)',
      handle(-4, 13),
      rect(-6.5, -9, 13, 5.5, ink.shade, 2),
      rect(-6.5, -9, 13, 4.2, ink.base, 2),
      pill(-5, -8.3, 5, 1.3, ink.light),
    ),
  ),
  /** La Maison : un lit, son oreiller et son édredon — on y dort. */
  home: job(
    rect(4, 7, 3, 13, ink.base, 1.5),
    line(19, 16, 19, 19.5, ink.base),
    shadedBlock(5, 11, 15, 6.5, 2, 'paper', 2.5),
    pill(7, 9, 5, 3.4, paper.shade),
    pill(7, 9, 5, 2.6, paper.base),
    rect(11, 11, 9, 6.5, coral.shade, 2.5),
    rect(11, 11, 9, 4.5, coral.base, 2.5),
    pill(12.5, 12, 3.5, 1.2, coral.light),
  ),
  /** La ferme : une carotte tout juste arrachée. */
  farm: job(
    group(
      'translate(13 11) rotate(28)',
      group('translate(0 -5) rotate(-120)', pill(0, -1.6, 6, 3.2, mint.base)),
      group('translate(0 -5) rotate(-90)', pill(0, -1.6, 6.5, 3.2, mint.shade)),
      group('translate(0 -5) rotate(-60)', pill(0, -1.6, 6, 3.2, mint.base)),
      polygon([-3.8, -5, 3.8, -5, 0, 11], orange.shade),
      polygon([-3.8, -5, 2.6, -5, -0.4, 9], orange.base),
      pill(-2.6, -3.8, 1.4, 5, orange.light),
      line(-1.6, 1, 0.8, 0.6, orange.shade),
    ),
  ),
  /** La tour de guet : l'arc bandé et sa flèche, prête à partir. */
  watchtower: job(
    line(9, 4.5, 9, 19.5, ink.light),
    shape('M8 3.5 Q22 12 8 20.5 Q18 12 8 3.5Z', ink.base),
    line(5, 12, 17, 12, orange.shade),
    polygon([20.5, 12, 16.5, 9.5, 16.5, 14.5], cyan.base),
    polygon([3.5, 9.5, 6.5, 12, 3.5, 14.5, 5, 12], coral.base),
  ),
  /** La tour d'archers : la cible corail et blanche, une flèche plantée au cœur. */
  archerTower: job(
    shadedCircle(10.5, 13, 7, 'coral'),
    circle(10.5, 13, 4.6, paper.base),
    circle(10.5, 13, 2.4, coral.base),
    line(10.5, 13, 19.5, 4.5, ink.base),
    polygon([19.5, 4.5, 20.8, 7.4, 16.6, 5.8], cyan.base),
    polygon([17.2, 3, 21.6, 3.2, 21, 6.6], cyan.shade),
  ),
  /** La palissade : trois pieux taillés en pointe, liés d'une corde. */
  palisade: job(
    ...[5.5, 10.5, 15.5].map(
      (x) =>
        polygon([x, 9, x + 1.5, 5, x + 3, 9], orange.shade) +
        rect(x, 8.5, 3, 11, orange.shade, 1.2) +
        rect(x, 8.5, 2, 10.4, orange.base, 1) +
        pill(x + 0.4, 9.6, 0.9, 3.4, orange.light),
    ),
    line(4.5, 13.5, 19.5, 13.5, ink.base),
  ),
  /** La forge : l'enclume et ses étincelles. */
  forge: job(
    polygon([3.5, 8.5, 20, 8.5, 20, 11.5, 16, 12.5, 15, 15.5, 18.5, 19, 5.5, 19, 9, 15.5, 8, 12.5, 6, 12], ink.shade),
    polygon([3.5, 8.5, 20, 8.5, 20, 10.5, 16, 11.5, 14.6, 15, 17.5, 17.5, 6.5, 17.5, 9.4, 15, 8, 11.5, 6, 11], ink.base),
    pill(6, 9.2, 6, 1.2, ink.light),
    circle(15.5, 5.2, 1.4, orange.base),
    circle(11.5, 4.2, 1, orange.light),
    circle(18.6, 6.4, 0.9, coral.base),
  ),
  /** Le four à charbon : la flamme qui couve sur sa bûche charbonnée. */
  charcoalKiln: job(
    polygon([12, 3, 17.8, 13, 6.2, 13], coral.shade),
    circle(12, 14, 6, coral.shade),
    polygon([11.6, 3.6, 16.8, 12.6, 6.4, 12.6], coral.base),
    circle(11.6, 13.6, 5.4, coral.base),
    polygon([12, 8.5, 15, 14, 9, 14], orange.base),
    circle(12, 15, 3.2, orange.base),
    circle(11.6, 15.4, 1.6, orange.light),
    shadedPill(5, 18, 14, 3.6, 1.2, 'ink'),
  ),
  /** La clinique : la croix menthe de sa porte — on y soigne. */
  clinic: job(
    rect(10, 5, 5.5, 15, mint.shade, 2),
    rect(4.8, 10, 15.5, 5.5, mint.shade, 2),
    rect(9.6, 4.6, 5, 13.6, mint.base, 2),
    rect(4.4, 9.6, 14.4, 4.4, mint.base, 2),
    pill(5.6, 10.4, 3.4, 1.4, mint.light),
  ),
  /** La station de dépollution : la goutte violette qui s'efface, et la pousse menthe qui revient. */
  purifier: job(
    polygon([9, 4.5, 13.4, 11.4, 4.6, 11.4], violet.shade),
    circle(9, 13.2, 4.4, violet.shade),
    polygon([8.6, 4.2, 12.6, 10.6, 4.8, 10.6], violet.base),
    circle(8.6, 12.6, 4, violet.base),
    pill(6.4, 11, 1.6, 3, violet.light),
    pill(13, 18, 7, 2.8, ink.shade),
    line(16.5, 18, 16.5, 14, mint.shade),
    polygon([16.5, 15.5, 13.4, 13, 15, 17], mint.base),
    polygon([16.5, 14.5, 20.4, 12.4, 19, 17], mint.light),
  ),
  /** La caserne : le bouclier rond à croix corail, deux lances croisées derrière. */
  barracks: job(
    line(6, 19, 18, 5, orange.shade),
    line(18, 19, 6, 5, orange.shade),
    circle(12.6, 13.2, 6.4, cyan.shade),
    circle(12, 12.6, 6.4, cyan.base),
    pill(7.6, 8.6, 4, 1.6, cyan.light),
    rect(11, 8, 2, 9, coral.base, 1),
    rect(7.6, 11.6, 9, 2, coral.base, 1),
  ),
  /** Le labo : l'éprouvette penchée qui glougloute. */
  lab: job(
    group(
      'translate(12.5 12.5) rotate(30)',
      rect(-3.5, -8, 7, 17, paper.shade, 3.5),
      rect(-3.5, -1, 7, 10, cyan.base, 3.5),
      rect(-4.6, -9.6, 9.2, 2.8, ink.base, 1.4),
      pill(-2.2, -6, 1.5, 5, paper.base),
      pill(-2.2, 1, 1.5, 4, cyan.light),
    ),
    circle(7.5, 6.5, 1.3, cyan.light),
    circle(5.8, 9.4, 0.9, cyan.base),
  ),
  /** L'Antenne : le pylône et son émetteur, qui appellent au loin. */
  antenna: job(
    polygon([9.5, 20.5, 14.5, 20.5, 12, 7], ink.base),
    line(10.6, 15.5, 13.4, 15.5, ink.light),
    circle(12, 6.5, 2.6, coral.shade),
    circle(11.7, 6.2, 2.2, coral.base),
    curve('M7.5 3 Q4.6 6.5 7.5 10', cyan.shade),
    curve('M16.5 3 Q19.4 6.5 16.5 10', cyan.shade),
  ),
};

/** Une icône de métier par bâtiment : en oublier une ne compile pas. */
export const JOB_ICONS: Record<BuildingId, string> = JOB_DRAWINGS;
