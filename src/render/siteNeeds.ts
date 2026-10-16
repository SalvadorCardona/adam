/**
 * Sous la barre d'un chantier, la rangée de ce qu'il attend : une capsule
 * blanche, et par objet du coût son icône et « livré/requis ».
 *
 * Un objet complet n'a plus de compteur : son icône s'estompe et porte une
 * pastille menthe. Un objet à sec (`SiteLine.dry` : la ville n'en a plus et
 * rien n'est en route) a son compteur en corail et un point corail au coin de
 * l'icône — repérable sans ouvrir la fenêtre.
 *
 * Les icônes sont celles du butin (`loot`, le même dessin que le sac), déjà
 * dans l'atlas. La rangée ne se remet en page que si son relevé change ; un
 * compteur qui monte rebondit, un minuteur de vue.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { PALETTE, hex } from '../data/artDirection.ts';
import { ICON_SIZE } from '../data/icons.ts';
import type { ItemId } from '../data/items.ts';
import type { SiteLine } from '../sim/siteLedger.ts';
import { ZOOM } from './camera.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';

/** Côté d'une icône, en pixels monde : la moitié de celle du sac. */
const ICON = 14;
const FONT = 10;
const HEIGHT = 16;
/** Marge intérieure de la capsule, écart icône–compteur et entre deux objets. */
const PAD = 5;
const GAP = 2;
const SPACING = 6;
/** Hauteur de la face avant de la capsule, plus sombre, sous elle. */
const FACE = 2;

const DONE_ALPHA = 0.5;
const BOUNCE_MS = 260;
const BOUNCE = 0.35;

/** En deçà de ce zoom, la rangée devient illisible : seule la barre reste. */
export const NEEDS_MIN_ZOOM = 0.75;

const INK = hex(PALETTE.ink.base);
const ALERT = hex(PALETTE.coral.shade);

interface Cell {
  root: Container;
  icon: Sprite;
  count: Text;
  /** Pastille menthe d'un objet complet, point corail d'un objet à sec. */
  badge: Graphics;
  delivered: number;
  bounce: number;
}

export class SiteNeeds {
  public readonly root = new Container();

  private readonly back = new Graphics();
  private readonly cells = new Map<ItemId, Cell>();
  private readonly library: SpriteLibrary;
  private key = '';

  public constructor(library: SpriteLibrary) {
    this.library = library;
    this.root.addChild(this.back);
  }

  /** Met la rangée à jour ; `(x, y)` : le centre de son bord haut, dans le repère du bâtiment. */
  public update(lines: readonly SiteLine[], x: number, y: number, deltaMs: number): void {
    this.root.position.set(x, y);

    const key = lines.map((line) => `${line.item}:${line.delivered}/${line.needed}:${line.dry ? 1 : 0}`).join(',');

    if (key !== this.key) {
      this.key = key;
      this.layout(lines);
    }

    for (const cell of this.cells.values()) {
      if (cell.bounce <= 0) continue;
      cell.bounce = Math.max(0, cell.bounce - deltaMs);
      cell.root.scale.set(1 + Math.sin((1 - cell.bounce / BOUNCE_MS) * Math.PI) * BOUNCE);
    }
  }

  private layout(lines: readonly SiteLine[]): void {
    const widths: number[] = [];

    for (const line of lines) {
      const cell = this.cell(line.item, line.delivered);

      // Un objet de plus au chantier : son compteur rebondit.
      if (line.delivered > cell.delivered) cell.bounce = BOUNCE_MS;
      cell.delivered = line.delivered;

      cell.icon.alpha = line.done ? DONE_ALPHA : 1;
      cell.count.visible = !line.done;
      // À sec : un point d’exclamation devant le compte, pour qu’un daltonien ne dépende pas du corail.
      cell.count.text = `${line.dry ? '!' : ''}${line.delivered}/${line.needed}`;
      cell.count.style.fill = line.dry ? ALERT : INK;

      cell.badge.clear();
      if (line.done) {
        cell.badge.circle(ICON / 2 - 1, ICON / 2 - 1, 3.5).fill(hex(PALETTE.mint.shade));
        cell.badge.circle(ICON / 2 - 1.5, ICON / 2 - 1.5, 2.5).fill(hex(PALETTE.mint.base));
      } else if (line.dry) {
        cell.badge.circle(ICON / 2 - 1, -ICON / 2 + 1, 3).fill(ALERT);
        cell.badge.circle(ICON / 2 - 1.5, -ICON / 2 + 0.5, 2).fill(hex(PALETTE.coral.base));
      }
      widths.push(ICON + (line.done ? 0 : GAP + cell.count.width));
    }

    const total = widths.reduce((sum, width) => sum + width, 0) + SPACING * Math.max(0, lines.length - 1) + PAD * 2;
    let left = -total / 2 + PAD;

    lines.forEach((line, index) => {
      const cell = this.cells.get(line.item)!;

      // Le pivot au centre de l'icône : le rebond part d'elle.
      cell.root.position.set(left + ICON / 2, HEIGHT / 2);
      cell.count.position.set(ICON / 2 + GAP, 0.5);
      left += widths[index]! + SPACING;
    });

    // Une capsule blanche et sa face avant lavande, comme les étiquettes des repères.
    this.back
      .clear()
      .roundRect(-total / 2, 0, total, HEIGHT + FACE, HEIGHT / 2)
      .fill(hex(PALETTE.paper.shade))
      .roundRect(-total / 2, 0, total, HEIGHT, HEIGHT / 2)
      .fill(hex(PALETTE.paper.base));
  }

  /** La case d'un objet, créée au premier relevé — sans rebond pour ce qui était déjà livré. */
  private cell(item: ItemId, delivered: number): Cell {
    const existing = this.cells.get(item);

    if (existing) return existing;

    const root = new Container();
    const icon = new Sprite(this.library.part('loot', item));

    icon.anchor.set(0.5);
    icon.scale.set(ICON / ICON_SIZE);

    const count = new Text({
      text: '',
      style: { fontFamily: 'Fredoka', fontWeight: '600', fontSize: FONT, fill: INK },
      // Net jusqu'au zoom le plus fort, à la densité de l'écran.
      resolution: Math.min(3, window.devicePixelRatio || 1) * ZOOM.max,
    });

    count.anchor.set(0, 0.5);

    const badge = new Graphics();

    root.addChild(icon, count, badge);
    this.root.addChild(root);

    const cell: Cell = { root, icon, count, badge, delivered, bounce: 0 };

    this.cells.set(item, cell);
    return cell;
  }
}
