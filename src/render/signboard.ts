/**
 * Les pancartes des bâtiments : un panneau planté au pied de la façade, qui
 * porte le médaillon de son métier, son nom court et, pour une foreuse, le
 * filon qu'elle extrait (`signs.ts` décide quoi et à quel zoom).
 *
 * Vue de 3/4 comme les façades : le panneau fait face à la caméra, une
 * capsule blanche et sa face avant lavande — les couleurs des cartes du HUD
 * —, posée sur deux piquets indigo. Le médaillon, un disque jaune, emplit
 * son bout gauche ; de loin, la pancarte ne garde que lui, agrandi. Une
 * pancarte n'a pas de vie propre : c'est un sprite du bâtiment
 * (`entityLayer.ts`), qui bouge, se trie et disparaît avec lui.
 *
 * Une texture par (bâtiment, objet, mode, langue), dessinée une fois et
 * partagée par tous les bâtiments du même type : le texte n'est jamais
 * remis en page à la frame, et cent foreuses de charbon font cent sprites
 * d'une seule texture. Elle est rendue à la densité de l'écran fois le zoom
 * le plus fort, pour rester nette quand on avance.
 *
 * Fredoka arrive avec les feuilles de style : tant qu'elle n'est pas chargée,
 * une pancarte s'écrit dans la police de repli, puis toutes se redessinent
 * (`generation` change, et avec elle la clé de chaque texture).
 */

import { Container, Graphics, Rectangle, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import { PALETTE, hex } from '../data/artDirection.ts';
import type { BuildingId } from '../data/buildings.ts';
import { ICON_SIZE } from '../data/icons.ts';
import type { ItemId } from '../data/items.ts';
import { TEXT_ZOOM } from './camera.ts';
import type { SignMode } from './signs.ts';
import { type SpriteLibrary } from './spriteLibrary.ts';

/** Taille du nom et côté de l'icône d'objet, en pixels monde. */
const FONT = 9;
const ICON = 11;
/**
 * Hauteur du panneau et diamètre du médaillon, de près (`full`) et de loin
 * (`icon`) : seul, le médaillon grandit — à 0,8 de zoom, il paraît à peu
 * près aussi grand que de près au zoom 1.
 */
const HEIGHT = { full: 13, icon: 17 } as const;
const MEDAL = { full: 12, icon: 16 } as const;
/** Marge intérieure, écart entre deux éléments. */
const PAD = 4;
const GAP = 2;
/** La face avant, plus sombre, sous le panneau : son épaisseur. */
const FACE = 2;
/** Les piquets : largeur, hauteur sous le panneau, retrait depuis chaque bord. */
const POST_W = 2;
const POST_H = 3;
const POST_INSET = 5;

const FONT_WEIGHT = '600';
const FONT_FAMILY = 'Fredoka';

const INK = hex(PALETTE.ink.base);

export class Signboards {
  private readonly textures = new Map<string, Texture>();
  /** Les textures d'avant le chargement de la police : gardées jusqu'au bout, des sprites les montrent encore une frame. */
  private readonly stale: Texture[] = [];
  private readonly renderer: Renderer;
  private readonly library: SpriteLibrary;
  private readonly resolution = Math.min(3, window.devicePixelRatio || 1) * TEXT_ZOOM;
  /** Change quand la police arrive : la clé de chaque texture avec. */
  public generation = 0;

  public constructor(renderer: Renderer, library: SpriteLibrary) {
    this.renderer = renderer;
    this.library = library;

    const font = `${FONT_WEIGHT} ${FONT}px ${FONT_FAMILY}`;

    if (typeof document === 'undefined' || !document.fonts || document.fonts.check(font)) return;
    document.fonts
      .load(font)
      .then(() => {
        this.stale.push(...this.textures.values());
        this.textures.clear();
        this.generation += 1;
      })
      .catch(() => {
        // Hors ligne et sans cache : la police de repli fera l'affaire.
      });
  }

  /** La texture d'une pancarte : le médaillon de `job`, `name` (`full` seulement) et l'icône de `item`. */
  public texture(job: BuildingId, name: string, item: ItemId | null, mode: Exclude<SignMode, 'none'>): Texture {
    const key = `${mode}:${job}:${item ?? ''}:${mode === 'full' ? name : ''}`;
    const cached = this.textures.get(key);

    if (cached) return cached;

    const texture = this.draw(job, mode === 'full' ? name : null, item, mode);

    this.textures.set(key, texture);
    return texture;
  }

  /** Panneau, face avant, piquets, puis médaillon, nom et icône : rendus une fois dans une texture. */
  private draw(job: BuildingId, name: string | null, item: ItemId | null, mode: Exclude<SignMode, 'none'>): Texture {
    const board = new Container();
    const back = new Graphics();
    const text =
      name === null
        ? null
        : new Text({
            text: name,
            style: { fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT, fontSize: FONT, fill: INK },
            resolution: this.resolution,
          });
    const boardHeight = HEIGHT[mode];
    const medalSize = MEDAL[mode];
    const medal = new Sprite(this.library.part('jobs', job));
    const icon = item === null ? null : new Sprite(this.library.part('loot', item));
    // Le médaillon emplit le bout arrondi de gauche : sa marge est celle qui reste autour de lui.
    const inset = (boardHeight - medalSize) / 2;
    const rest = (text ? GAP + Math.ceil(text.width) : 0) + (icon ? GAP + ICON : 0);
    const width = inset + medalSize + (rest > 0 ? rest + PAD : inset);
    const height = boardHeight + FACE + POST_H;

    // Les piquets d'abord : le panneau les recouvre en haut.
    for (const x of width > POST_INSET * 4 ? [POST_INSET, width - POST_INSET - POST_W] : [(width - POST_W) / 2]) {
      back.rect(x, boardHeight, POST_W, FACE + POST_H).fill(INK);
    }
    back
      .roundRect(0, 0, width, boardHeight + FACE, boardHeight / 2)
      .fill(hex(PALETTE.paper.shade))
      .roundRect(0, 0, width, boardHeight, boardHeight / 2)
      .fill(hex(PALETTE.paper.base));
    board.addChild(back);

    medal.anchor.set(0.5);
    medal.scale.set(medalSize / ICON_SIZE);
    medal.position.set(inset + medalSize / 2, boardHeight / 2);
    board.addChild(medal);

    let left = inset + medalSize + GAP;

    if (text) {
      text.anchor.set(0, 0.5);
      text.position.set(left, boardHeight / 2 + 0.5);
      board.addChild(text);
      left += Math.ceil(text.width) + GAP;
    }
    if (icon) {
      icon.anchor.set(0.5);
      icon.scale.set(ICON / ICON_SIZE);
      icon.position.set(left + ICON / 2, boardHeight / 2);
      board.addChild(icon);
    }

    const texture = this.renderer.generateTexture({
      target: board,
      frame: new Rectangle(0, 0, width, height),
      resolution: this.resolution,
      antialias: true,
    });

    board.destroy({ children: true });
    return texture;
  }

  public destroy(): void {
    for (const texture of [...this.textures.values(), ...this.stale]) texture.destroy(true);
    this.textures.clear();
    this.stale.length = 0;
  }
}
