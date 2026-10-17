/**
 * Le forestier : quel carré planter, dans quel ordre, et sa journée.
 *
 * Les fonctions répondent à deux questions : quelles cases forment la forêt
 * d'une maison, et où se poster pour planter sur l'une d'elles.
 * `ForesterCrew` mène le forestier, avec `walkToward()` comme un bûcheron et
 * ce que `World` lui prête (`CrewContext`).
 *
 * Le carré (`FORESTERS.plot` de côté) est centré sur l'emprise de la maison.
 * Ni l'emprise ni l'allée devant la porte n'en font partie. Les cases sont
 * rendues rang par rang, de haut en bas et de gauche à droite : c'est l'ordre
 * de plantation, et la forêt se remplit proprement.
 *
 * Ce qu'est chaque case — libre, en pousse, arbre, ou prise par autre chose
 * (eau, bâti, route, rocher, filon) — se juge dans `ForesterCrew.plot()`,
 * qui connaît la carte.
 *
 * Le champ d'une ferme est le même carré, d'un autre côté (`side`) : les
 * fermiers le sèment dans le même ordre (`sim/farmer.ts`).
 */

import { TILE_SIZE, type TileCoord } from '../core/grid.ts';
import { FORESTERS } from '../data/workers.ts';
import type { CrewContext } from './crew.ts';
import { doorOf } from './jobs.ts';
import { oreAt, terrainAt } from './terrain.ts';
import type { Forester, ForesterHouse } from './types.ts';
import { standStill, walkToward, wanderFrom } from './workers.ts';

/** Une emprise : ce qu'il faut savoir d'une maison, posée ou en fantôme. */
export interface Footprint {
  tx: number;
  ty: number;
  width: number;
  height: number;
}

/** Ce qu'est une case du carré : `free` se plante, `blocked` ne se plantera pas tant que rien ne change. */
export type PlotState = 'free' | 'sapling' | 'tree' | 'blocked';

export interface PlotTile extends TileCoord {
  state: PlotState;
}

/** Le coin haut-gauche du carré de côté `side` : centré sur l'emprise, arrondi vers le haut-gauche si les parités diffèrent. */
export function plotOrigin(house: Footprint, side: number = FORESTERS.plot): TileCoord {
  return {
    tx: house.tx - Math.floor((side - house.width) / 2),
    ty: house.ty - Math.floor((side - house.height) / 2),
  };
}

/**
 * Les cases du carré, dans l'ordre de plantation : rang par rang, de gauche
 * à droite. L'emprise et l'allée — les deux cases sous la porte — en sont exclues.
 */
export function plotTiles(house: Footprint, side: number = FORESTERS.plot): TileCoord[] {
  const origin = plotOrigin(house, side);
  const doorY = house.ty + house.height;
  const doorX = house.tx + Math.floor(house.width / 2);
  const tiles: TileCoord[] = [];

  for (let ty = origin.ty; ty < origin.ty + side; ty += 1) {
    for (let tx = origin.tx; tx < origin.tx + side; tx += 1) {
      const inside = tx >= house.tx && tx < house.tx + house.width && ty >= house.ty && ty < house.ty + house.height;
      const aisle = ty === doorY && (tx === doorX || tx === doorX - 1);

      if (!inside && !aisle) tiles.push({ tx, ty });
    }
  }
  return tiles;
}

/** La tuile est-elle dans le carré de cette maison ? */
export function inPlot(house: Footprint, tx: number, ty: number, side: number = FORESTERS.plot): boolean {
  return plotTiles(house, side).some((tile) => tile.tx === tx && tile.ty === ty);
}

/** Où se poste le forestier — ou le fermier : juste à gauche de la case, face à elle — l'outil s'enfonce de profil. */
export function plantSpot(tile: TileCoord): { x: number; y: number } {
  return { x: tile.tx * TILE_SIZE - 4, y: (tile.ty + 1) * TILE_SIZE - 5 };
}

/** Ce que la fenêtre compte : pousses, arbres adultes, cases libres. */
export interface PlotCount {
  saplings: number;
  trees: number;
  free: number;
}

export function countPlot(tiles: readonly PlotTile[]): PlotCount {
  const count: PlotCount = { saplings: 0, trees: 0, free: 0 };

  for (const { state } of tiles) {
    if (state === 'sapling') count.saplings += 1;
    else if (state === 'tree') count.trees += 1;
    else if (state === 'free') count.free += 1;
  }
  return count;
}

/**
 * Les forestiers des maisons : embauche, et leur journée — chercher une case
 * libre du carré, y marcher, planter, enchaîner. Ce que `World` leur prête
 * passe par `CrewContext`.
 */
export class ForesterCrew {
  private readonly world: CrewContext;

  public constructor(world: CrewContext) {
    this.world = world;
  }

  public *members(): IterableIterator<Forester> {
    for (const mobile of this.world.mobiles.values()) {
      if (mobile.kind === 'forester') yield mobile;
    }
  }

  /** Pourvoit la maison du forestier si son poste l'est : l'ouvrier libre le plus proche devient forestier. */
  public staff(house: ForesterHouse): void {
    const { world } = this;
    let lodged = 0;

    for (const forester of this.members()) {
      if (forester.homeId === house.id) lodged += 1;
    }

    const door = doorOf(house);
    const posts = world.posts(house.id);

    for (let i = lodged; i < posts; i += 1) {
      const person = world.recruit(door);

      if (!person) break;

      world.hire({
        kind: 'forester',
        ...person,
        homeId: house.id,
        inside: false,
        state: 'idle',
        plot: null,
        plantTicks: 0,
        searchTicks: 1,
        ...wanderFrom(person.x, person.y),
      });
    }
  }

  /** Le forestier d'une maison — le premier logé —, ou `undefined` : la fenêtre dit ce qu'il fait. */
  public of(house: ForesterHouse): Forester | undefined {
    let found: Forester | undefined;

    for (const forester of this.members()) {
      if (forester.homeId === house.id && (!found || forester.id < found.id)) found = forester;
    }
    return found;
  }

  /**
   * Le carré de forêt d'une maison — posée, ou en fantôme à (tx, ty) —, case
   * par case dans l'ordre de plantation : libre, en pousse, arbre, ou prise
   * par autre chose. Une case libre est une herbe nue, sans bâti, sans route,
   * sans filon — il resterait à la foreuse — et qu'aucune pousse n'occupe.
   */
  public plot(house: Footprint): PlotTile[] {
    const { world } = this;

    return plotTiles(house).map(({ tx, ty }): PlotTile => {
      if (world.resources.sapling(tx, ty)) return { tx, ty, state: 'sapling' };

      const resource = world.resources.at(tx, ty);

      if (resource?.id === 'tree') return { tx, ty, state: 'tree' };

      const blocked =
        resource !== null ||
        world.resources.crop(tx, ty) !== null ||
        terrainAt(world.seed, tx, ty) !== 'grass' ||
        oreAt(world.seed, tx, ty) !== null ||
        world.chunks.occupantAt(tx, ty) !== undefined ||
        world.chestAt(tx, ty) !== null;

      return { tx, ty, state: blocked ? 'blocked' : 'free' };
    });
  }

  /** La première case libre du carré, dans l'ordre, qu'on atteint en ligne droite sans passer par l'eau ; `null` sinon. */
  private nextPlot(house: ForesterHouse, from: { x: number; y: number }): { tx: number; ty: number } | null {
    for (const tile of this.plot(house)) {
      if (tile.state !== 'free') continue;

      const spot = plantSpot(tile);

      if (this.world.lineIsClear(from.x, from.y, spot.x, spot.y)) return { tx: tile.tx, ty: tile.ty };
    }
    return null;
  }

  /**
   * Un tick de forestier. Hors d'une plantation, il cherche toutes les
   * `retryTicks` la première case libre de son carré ; il y marche, plante,
   * puis enchaîne sur la suivante sans rentrer. Carré plein, il flâne devant
   * sa porte jusqu'à ce qu'on coupe un arbre. La nuit, il ne repart pas ;
   * pendant une vague, il rentre s'abriter, et reprendra sa case après.
   */
  public step(forester: Forester, alarm: boolean, bedtime: boolean): void {
    const { world } = this;
    const house = world.entities.get(forester.homeId);

    // Sa maison est tombée : il redevient un ouvrier libre.
    if (house?.kind !== 'foresterHouse') {
      world.release(forester);
      return;
    }

    const door = doorOf(house);

    if (alarm) {
      if (forester.state === 'plant') forester.state = 'toPlot';
      world.goHome(forester, door);
      return;
    }

    // Maison en pause, ou lui retiré de son poste : il lâche sa case et flâne — une pousse à moitié plantée ne pousse pas.
    const working = !house.paused && world.onDuty(forester);

    if (!working && forester.state !== 'idle') this.stopPlanting(forester, door);

    // Retiré de son poste : il rentre, et redevient un ouvrier libre.
    if (!world.onDuty(forester) && forester.state === 'idle') {
      world.release(forester);
      return;
    }

    switch (forester.state) {
      case 'idle':
        forester.searchTicks -= 1;
        if (forester.searchTicks <= 0 && working && !bedtime) {
          forester.searchTicks = FORESTERS.retryTicks;
          this.seekPlot(forester, house, forester.inside ? door : forester);
        }
        if (forester.state === 'idle') world.idle(forester, door, bedtime);
        else forester.inside = false;
        break;

      case 'toPlot': {
        const plot = forester.plot;

        forester.inside = false;
        if (!plot || this.plot(house).find((tile) => tile.tx === plot.tx && tile.ty === plot.ty)?.state !== 'free') {
          // Prise entre-temps — une route, un chantier, l'autre forestier — : il en cherche une autre.
          if (!this.seekPlot(forester, house, forester)) this.stopPlanting(forester, door);
          break;
        }

        const spot = plantSpot(plot);

        if (walkToward(forester, spot.x, spot.y, world.walkStep())) {
          forester.state = 'plant';
          forester.facing = 'right';
          forester.plantTicks = FORESTERS.plantTicks;
        }
        break;
      }

      case 'plant':
        standStill(forester);
        forester.inside = false;
        forester.plantTicks -= world.toil(forester.needs);
        if (forester.plantTicks <= 0) this.plant(forester, house, door);
        break;
    }
  }

  /** La prochaine case : il y va ; plus rien à planter, il reste — ou redevient — oisif. Vrai s'il en a une. */
  private seekPlot(forester: Forester, house: ForesterHouse, from: { x: number; y: number }): boolean {
    const plot = this.nextPlot(house, from);

    forester.plot = plot;
    forester.state = plot ? 'toPlot' : 'idle';
    return plot !== null;
  }

  /** La bêche s'enfonce : une pousse en terre, puis la case suivante, sans rentrer. */
  private plant(forester: Forester, house: ForesterHouse, door: { x: number; y: number }): void {
    const { world } = this;
    const plot = forester.plot;
    const free = plot && this.plot(house).find((tile) => tile.tx === plot.tx && tile.ty === plot.ty)?.state === 'free';

    if (plot && free && world.resources.plant(plot.tx, plot.ty, world.tickCount)) {
      world.dirtyTile(plot.tx, plot.ty);
      world.events.emit('treePlanted', { foresterId: forester.id, tx: plot.tx, ty: plot.ty });
    }

    if (!this.seekPlot(forester, house, forester)) this.stopPlanting(forester, door);
  }

  /** Plus de case à planter : il lâche la sienne et flâne à partir de sa porte. */
  private stopPlanting(forester: Forester, door: { x: number; y: number }): void {
    forester.plot = null;
    forester.state = 'idle';
    forester.searchTicks = FORESTERS.retryTicks;
    Object.assign(forester, wanderFrom(door.x, door.y));
  }
}
