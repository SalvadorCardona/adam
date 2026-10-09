/**
 * Les ruines et les secrets de la carte (`sim/discoveries.ts`).
 *
 * Une ruine est un sprite trié en profondeur avec les arbres et les
 * personnages : scintillante tant qu'elle n'est pas fouillée, éteinte
 * ensuite, et elle reste où elle est. Un secret n'est qu'une touffe d'herbes
 * à l'éclat discret, au pied d'un arbre : une fois trouvé, elle jaillit et
 * s'efface. Seuls les points des chunks à l'écran existent, et seulement
 * sur une case explorée.
 *
 * La fouille (`discoveryFound`) est un minuteur de vue que la simulation
 * ignore. Les confettis et le son sont branchés dans `main.ts`.
 */

import { Container, Sprite } from 'pixi.js';
import { TILE_SIZE } from '../core/grid.ts';
import type { Spot } from '../sim/discoveries.ts';
import type { World } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';

/** Durée de la fouille d'une ruine et du jaillissement d'un secret, en ms. */
const FIND_MS = 600;

interface SpotView {
  root: Container;
  sprite: Sprite;
  /** Millisecondes écoulées depuis la découverte ; `null` : rien en cours. */
  finding: number | null;
  kind: Spot['kind'];
  /** Vrai une fois la ruine fouillée ou le secret trouvé et fini de jaillir. */
  done: boolean;
}

export class SpotLayer {
  private readonly views = new Map<number, SpotView>();
  private readonly world: World;
  private readonly library: SpriteLibrary;
  private readonly sorted: Container;
  private clock = 0;

  public constructor(world: World, library: SpriteLibrary, sorted: Container) {
    this.world = world;
    this.library = library;
    this.sorted = sorted;

    world.events.on('discoveryFound', ({ id, kind }) => {
      const view = this.views.get(id);

      if (view && kind !== 'chest') view.finding = 0;
    });
  }

  public update(camera: Camera, deltaMs: number): void {
    this.clock += deltaMs;

    const visible = camera.visibleChunks(0);
    const alive = new Set<number>();

    for (let cy = visible.minCy; cy <= visible.maxCy; cy += 1) {
      for (let cx = visible.minCx; cx <= visible.maxCx; cx += 1) {
        for (const kind of ['ruin', 'secret'] as const) {
          const spot = this.world.spotOfChunk(kind, cx, cy);

          if (!spot || this.world.sightAt(spot.tx, spot.ty) === 'unexplored') continue;
          // Un secret trouvé n'a plus rien à montrer, sauf le temps de sa gerbe.
          const view = this.views.get(spot.id);

          if (kind === 'secret' && this.world.isFound(spot.id) && (!view || view.done)) continue;
          alive.add(spot.id);
          this.refresh(view ?? this.create(spot), spot, deltaMs);
        }
      }
    }
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      this.drop(view);
      this.views.delete(id);
    }
  }

  private create(spot: Spot): SpotView {
    const root = new Container();
    const found = this.world.isFound(spot.id);
    const sprite = new Sprite(spot.kind === 'ruin' ? this.library.part('ruin', found ? 'searched' : 'full') : this.library.part('secret', 'hint'));
    const anchorY = spot.kind === 'ruin' ? 35 / 40 : 27 / 32;

    sprite.anchor.set(0.5, anchorY);
    root.addChild(sprite);
    root.position.set((spot.tx + 0.5) * TILE_SIZE, (spot.ty + 1) * TILE_SIZE - 4);
    root.zIndex = (spot.ty + 1) * TILE_SIZE - 4;
    this.sorted.addChild(root);

    // L'ombre portée est déjà dans le morceau.
    const view: SpotView = { root, sprite, finding: null, kind: spot.kind, done: found };

    this.views.set(spot.id, view);
    return view;
  }

  private refresh(view: SpotView, spot: Spot, deltaMs: number): void {
    const { sprite } = view;

    if (view.finding !== null) {
      view.finding += deltaMs;

      const t = Math.min(1, view.finding / FIND_MS);

      if (view.kind === 'ruin') {
        // Un sursaut : elle se tasse puis se redresse, éteinte.
        const bump = Math.sin(t * Math.PI);

        sprite.scale.set(1 + bump * 0.08, 1 - bump * 0.1);
        if (t >= 0.4) sprite.texture = this.library.part('ruin', 'searched');
      } else {
        // La touffe jaillit, grossit et s'efface.
        sprite.scale.set(1 + t * 0.5);
        sprite.y = -t * 10;
        sprite.alpha = 1 - t;
      }
      if (t >= 1) {
        view.finding = null;
        view.done = true;
        sprite.scale.set(1);
        sprite.y = 0;
        sprite.alpha = view.kind === 'ruin' ? 1 : 0;
      }
      return;
    }

    if (view.kind === 'secret') {
      // Un éclat qui respire à peine : discret.
      sprite.scale.set(1 + Math.sin((this.clock + (spot.id % 3000)) / 700) * 0.015);
      sprite.alpha = view.done ? 0 : 1;
    }
  }

  private drop(view: SpotView): void {
    view.root.destroy({ children: true });
  }

  public destroy(): void {
    for (const view of this.views.values()) this.drop(view);
    this.views.clear();
  }
}
