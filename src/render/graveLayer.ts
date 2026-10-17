/**
 * Les tombes de la carte (`World.graves`) : une stèle fleurie, au ruban de la
 * couleur du trait, là où l'habitant est mort ; les plus anciennes, passé le
 * plafond, ne sont plus que des fleurs (`World.blooms`).
 *
 * Des sprites triés en profondeur avec les arbres et les personnages
 * (`EntityLayer.container`), refaits quand la liste change — au plus 200,
 * rien à culler.
 */

import { Sprite, type Container } from 'pixi.js';
import { TILE_SIZE } from '../core/grid.ts';
import type { PartOf } from '../data/sprites.ts';
import type { World } from '../sim/world.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';

export class GraveLayer {
  private readonly sprites: Sprite[] = [];
  private readonly world: World;
  private readonly library: SpriteLibrary;
  private readonly sorted: Container;
  private signature = '';

  public constructor(world: World, library: SpriteLibrary, sorted: Container) {
    this.world = world;
    this.library = library;
    this.sorted = sorted;
  }

  public update(): void {
    const graves = this.world.graves();
    const blooms = this.world.blooms();
    const signature = `${graves.length}:${graves.at(-1)?.id ?? 0}:${blooms.length}:${graves.at(0)?.id ?? 0}`;

    if (signature === this.signature) return;
    this.signature = signature;
    this.clear();
    for (const bloom of blooms) this.add(bloom.tx, bloom.ty, 'bloom');
    for (const grave of graves) this.add(grave.tx, grave.ty, grave.trait);
  }

  private add(tx: number, ty: number, part: PartOf<'grave'>): void {
    const sprite = new Sprite(this.library.part('grave', part));
    const y = (ty + 1) * TILE_SIZE - 4;

    sprite.anchor.set(0.5, 29 / 34);
    sprite.position.set((tx + 0.5) * TILE_SIZE, y);
    sprite.zIndex = y;
    this.sorted.addChild(sprite);
    this.sprites.push(sprite);
  }

  private clear(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
  }

  public destroy(): void {
    this.clear();
  }
}
