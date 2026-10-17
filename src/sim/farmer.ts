/**
 * Le champ d'une ferme : quelles cases ses fermiers cultivent, et dans quel
 * ordre.
 *
 * C'est le carré du forestier (`sim/forester.ts`), de `FARMERS.plot` de
 * côté : centré sur la ferme, ni l'emprise ni l'allée devant la porte, rang
 * par rang de haut en bas et de gauche à droite. `FarmerCrew` mène les
 * fermiers, comme `ForesterCrew` le forestier.
 *
 * Ce qu'est chaque case — libre, semée, en pousse, mûre, ou prise par autre
 * chose (eau, sable, bâti, route, rocher, filon, arbre) — se juge dans
 * `FarmerCrew.field()`, qui connaît la carte.
 */

import { coordKey, type TileCoord } from '../core/grid.ts';
import { CROPS } from '../data/resources.ts';
import { FARMERS } from '../data/workers.ts';
import type { CrewContext } from './crew.ts';
import { plantSpot, plotOrigin, plotTiles, type Footprint } from './forester.ts';
import { doorOf } from './jobs.ts';
import { oreAt, terrainAt } from './terrain.ts';
import type { Farm, Farmer, FarmerState } from './types.ts';
import { standStill, walkToward, wanderFrom } from './workers.ts';

/** Ce qu'est une case du champ : `free` se sème, `ripe` se récolte, `blocked` ne se cultivera pas tant que rien ne change. */
export type FieldState = 'free' | 'sown' | 'growing' | 'ripe' | 'blocked';

export interface FieldTile extends TileCoord {
  state: FieldState;
}

/** Le coin haut-gauche du champ. */
export function fieldOrigin(farm: Footprint): TileCoord {
  return plotOrigin(farm, FARMERS.plot);
}

/** Les cases du champ, dans l'ordre de semis : rang par rang, de gauche à droite. */
export function fieldTiles(farm: Footprint): TileCoord[] {
  return plotTiles(farm, FARMERS.plot);
}

/** Ce que la fenêtre compte : semis et pousses, cultures mûres, cases libres. */
export interface FieldCount {
  growing: number;
  ripe: number;
  free: number;
}

export function countField(tiles: readonly FieldTile[]): FieldCount {
  const count: FieldCount = { growing: 0, ripe: 0, free: 0 };

  for (const { state } of tiles) {
    if (state === 'sown' || state === 'growing') count.growing += 1;
    else if (state === 'ripe') count.ripe += 1;
    else if (state === 'free') count.free += 1;
  }
  return count;
}

/**
 * Les fermiers des fermes : embauche, et leur journée — semer, récolter,
 * rapporter au coffre — ; les cultures d'un champ abandonné s'arrachent ici
 * aussi. Ce que `World` leur prête passe par `CrewContext`.
 */
export class FarmerCrew {
  private readonly world: CrewContext;

  public constructor(world: CrewContext) {
    this.world = world;
  }

  public *members(): IterableIterator<Farmer> {
    for (const mobile of this.world.mobiles.values()) {
      if (mobile.kind === 'farmer') yield mobile;
    }
  }

  /** Pourvoit la ferme de fermiers, autant que de postes pourvus : les ouvriers libres les plus proches de sa porte. */
  public staff(farm: Farm): void {
    const { world } = this;
    let lodged = 0;

    for (const farmer of this.members()) {
      if (farmer.homeId === farm.id) lodged += 1;
    }

    const door = doorOf(farm);
    const posts = world.posts(farm.id);

    for (let i = lodged; i < posts; i += 1) {
      const person = world.recruit(door);

      if (!person) break;

      world.hire({
        kind: 'farmer',
        ...person,
        homeId: farm.id,
        inside: false,
        state: 'idle',
        plot: null,
        workTicks: 0,
        load: 0,
        // Ils ne partent pas du même pas : chacun suit le précédent.
        searchTicks: 1 + i * 10,
        ...wanderFrom(person.x, person.y),
      });
    }
  }

  /** Le premier fermier d'une ferme, par id, ou `undefined` : la fenêtre dit ce qu'il fait. */
  public of(farm: Farm): Farmer | undefined {
    let found: Farmer | undefined;

    for (const farmer of this.members()) {
      if (farmer.homeId === farm.id && (!found || farmer.id < found.id)) found = farmer;
    }
    return found;
  }

  /**
   * Le champ d'une ferme — posée, ou en fantôme —, case par case dans
   * l'ordre de semis : libre, semée, en pousse, mûre, ou prise par autre
   * chose. Une case libre est une herbe nue, sans bâti, sans route, sans
   * filon, sans arbre ni pousse du forestier.
   */
  public field(farm: { tx: number; ty: number; width: number; height: number }): FieldTile[] {
    return fieldTiles(farm).map(({ tx, ty }): FieldTile => ({ tx, ty, state: this.fieldState(tx, ty) }));
  }

  private fieldState(tx: number, ty: number): FieldState {
    const crop = this.world.resources.crop(tx, ty);

    if (crop) return crop;

    const blocked =
      this.world.resources.isTaken(tx, ty) ||
      terrainAt(this.world.seed, tx, ty) !== 'grass' ||
      oreAt(this.world.seed, tx, ty) !== null ||
      this.world.chunks.occupantAt(tx, ty) !== undefined ||
      this.world.chestAt(tx, ty) !== null;

    return blocked ? 'blocked' : 'free';
  }

  /** Nourriture d'une case récoltée : celle des données, plus les fermes fertiles du labo. */
  public cropYield(): number {
    return CROPS.yield + this.world.bonus('farmYield');
  }

  /**
   * La première case du champ dans l'état `want`, dans l'ordre, qu'aucun
   * autre fermier ne vise et qu'on atteint en ligne droite sans passer par
   * l'eau ; `null` sinon.
   */
  private nextField(farm: Farm, farmer: Farmer, from: { x: number; y: number }, want: FieldState): { tx: number; ty: number } | null {
    const claimed = new Set<string>();

    for (const other of this.members()) {
      if (other !== farmer && other.plot) claimed.add(coordKey(other.plot.tx, other.plot.ty));
    }
    for (const tile of fieldTiles(farm)) {
      if (claimed.has(coordKey(tile.tx, tile.ty)) || this.fieldState(tile.tx, tile.ty) !== want) continue;

      const spot = plantSpot(tile);

      if (this.world.lineIsClear(from.x, from.y, spot.x, spot.y)) return tile;
    }
    return null;
  }

  /**
   * Un tick de fermier. Hors d'un geste, il cherche toutes les `retryTicks`
   * de quoi faire : semer la première case libre de son champ, sinon
   * récolter la première case mûre — sa place au coffre réservée d'abord ;
   * coffre plein, il attend devant la porte. Récolte faite, il la rapporte au
   * coffre, puis revient semer. La nuit, il ne repart pas ; pendant une
   * vague, il rentre s'abriter, et reprendra sa case après.
   */
  public step(farmer: Farmer, alarm: boolean, bedtime: boolean): void {
    const farm = this.world.entities.get(farmer.homeId);

    // Sa ferme est tombée : il redevient un ouvrier libre.
    if (farm?.kind !== 'farm') {
      this.world.release(farmer);
      return;
    }

    const door = doorOf(farm);

    if (alarm) {
      if (farmer.state === 'sow') farmer.state = 'toSow';
      if (farmer.state === 'harvest') farmer.state = 'toHarvest';
      this.world.goHome(farmer, door);
      return;
    }

    // Ferme en pause, ou lui retiré de son poste : il lâche sa case — la récolte qu'il porte, il la rapporte —, puis flâne.
    const working = !farm.paused && this.world.onDuty(farmer);

    if (!working && farmer.state !== 'idle' && farmer.state !== 'toFarm') this.stopFarming(farmer, farm, door);

    // Retiré de son poste, sa récolte rangée : il rentre, et redevient un ouvrier libre.
    if (!this.world.onDuty(farmer) && farmer.state === 'idle') {
      this.world.release(farmer);
      return;
    }

    switch (farmer.state) {
      case 'idle':
      case 'wait':
        farmer.searchTicks -= 1;
        if (farmer.searchTicks <= 0 && working && !bedtime) {
          farmer.searchTicks = FARMERS.retryTicks;
          this.seekField(farmer, farm, farmer.inside ? door : farmer);
        }
        if (farmer.state === 'idle') this.world.idle(farmer, door, bedtime);
        else if (farmer.state === 'wait') this.waitAtFarm(farmer, door, bedtime);
        else farmer.inside = false;
        break;

      case 'toSow':
      case 'toHarvest': {
        const plot = farmer.plot;
        const want: FieldState = farmer.state === 'toSow' ? 'free' : 'ripe';

        farmer.inside = false;
        if (!plot || this.fieldState(plot.tx, plot.ty) !== want) {
          // Prise entre-temps — un chantier, une route — : il en cherche une autre.
          this.dropPlot(farmer, farm);
          if (!this.seekField(farmer, farm, farmer) && (farmer.state as FarmerState) === 'idle') this.stopFarming(farmer, farm, door);
          break;
        }

        const spot = plantSpot(plot);

        if (walkToward(farmer, spot.x, spot.y, this.world.walkStep())) {
          const sowing = farmer.state === 'toSow';

          farmer.state = sowing ? 'sow' : 'harvest';
          farmer.facing = 'right';
          farmer.workTicks = sowing ? FARMERS.sowTicks : FARMERS.harvestTicks;
        }
        break;
      }

      case 'sow':
      case 'harvest':
        standStill(farmer);
        farmer.inside = false;
        farmer.workTicks -= this.world.toil(farmer.needs);
        if (farmer.workTicks > 0) break;
        if (farmer.state === 'sow') this.sow(farmer, farm, door, bedtime);
        else this.reap(farmer, farm, door, bedtime);
        break;

      case 'toFarm':
        farmer.inside = false;
        if (walkToward(farmer, door.x, door.y, this.world.walkStep())) this.storeCrop(farmer, farm, door, bedtime);
        break;
    }
  }

  /**
   * De quoi faire, depuis `from` : semer d'abord — le champ reste plein —,
   * sinon récolter, sa place au coffre réservée ; coffre plein, il attend à
   * la porte (`wait`) ; rien du tout, il reste oisif. Vrai s'il part sur une case.
   */
  private seekField(farmer: Farmer, farm: Farm, from: { x: number; y: number }): boolean {
    const free = this.nextField(farm, farmer, from, 'free');

    if (free) {
      farmer.plot = free;
      farmer.state = 'toSow';
      return true;
    }

    const ripe = this.nextField(farm, farmer, from, 'ripe');

    farmer.plot = null;
    if (!ripe) {
      farmer.state = 'idle';
      return false;
    }

    const amount = this.cropYield();

    if (!farm.store.reserveIn(CROPS.item, amount)) {
      farmer.state = 'wait';
      farmer.searchTicks = FARMERS.retryTicks;
      return false;
    }
    farmer.load = amount;
    farmer.plot = ripe;
    farmer.state = 'toHarvest';
    return true;
  }

  /** La graine en terre, puis la case suivante — sauf à la nuit tombée : il rentre. */
  private sow(farmer: Farmer, farm: Farm, door: { x: number; y: number }, bedtime: boolean): void {
    const plot = farmer.plot;

    if (plot && this.fieldState(plot.tx, plot.ty) === 'free' && this.world.resources.sow(plot.tx, plot.ty, this.world.tickCount)) {
      this.world.dirtyTile(plot.tx, plot.ty);
      this.world.events.emit('cropSown', { farmerId: farmer.id, tx: plot.tx, ty: plot.ty });
    }
    farmer.plot = null;
    if (bedtime || !this.seekField(farmer, farm, farmer)) {
      if (farmer.state !== 'wait') this.stopFarming(farmer, farm, door);
    }
  }

  /** La case mûre récoltée : le blé dans le panier, il le rapporte au coffre. */
  private reap(farmer: Farmer, farm: Farm, door: { x: number; y: number }, bedtime: boolean): void {
    const plot = farmer.plot;

    if (plot && this.world.resources.reap(plot.tx, plot.ty)) {
      this.world.dirtyTile(plot.tx, plot.ty);
      this.world.events.emit('cropHarvested', { farmerId: farmer.id, tx: plot.tx, ty: plot.ty, amount: farmer.load });
      farmer.plot = null;
      farmer.state = 'toFarm';
      return;
    }
    // Plus rien sur pied : sa place au coffre se libère, il cherche autre chose.
    this.dropPlot(farmer, farm);
    if (bedtime || !this.seekField(farmer, farm, farmer)) {
      if (farmer.state !== 'wait') this.stopFarming(farmer, farm, door);
    }
  }

  /** À la porte : la place réservée devient du blé dans le coffre ; il repart semer. */
  private storeCrop(farmer: Farmer, farm: Farm, door: { x: number; y: number }, bedtime: boolean): void {
    farm.store.releaseIn(CROPS.item, farmer.load);

    const stored = farm.store.add(CROPS.item, farmer.load);

    farmer.load -= stored;
    if (stored > 0) {
      this.world.tally(CROPS.item, stored);
      this.world.events.emit('farmProduced', { id: farm.id, item: CROPS.item });
    }
    // Ce qui ne rentre pas — une sauvegarde retouchée, jamais en jeu — reste dans son panier : il attend.
    if (farmer.load > 0) {
      farmer.state = 'wait';
      return;
    }
    farmer.state = 'idle';
    farmer.searchTicks = 0;
    if (bedtime) Object.assign(farmer, wanderFrom(door.x, door.y));
  }

  /** Coffre plein : devant la porte, sa récolte au panier s'il en a, jusqu'à ce qu'on fasse de la place. */
  private waitAtFarm(farmer: Farmer, door: { x: number; y: number }, bedtime: boolean): void {
    if (farmer.load > 0 && !farmer.plot) {
      const farm = this.world.entities.get(farmer.homeId);

      if (farm?.kind === 'farm' && farm.store.freeSpace() > 0) {
        const stored = farm.store.add(CROPS.item, farmer.load);

        farmer.load -= stored;
        if (stored > 0) this.world.tally(CROPS.item, stored);
      }
    }
    if (bedtime && farmer.load === 0) {
      this.world.sleep(farmer, door);
      return;
    }
    farmer.inside = false;
    if (walkToward(farmer, door.x, door.y, this.world.walkStep())) farmer.facing = 'down';
  }

  /** Il lâche sa case ; une récolte pas encore cueillie rend sa place au coffre. */
  public dropPlot(farmer: Farmer, farm: Farm): void {
    if ((farmer.state === 'toHarvest' || farmer.state === 'harvest') && farmer.load > 0) {
      farm.store.releaseIn(CROPS.item, farmer.load);
      farmer.load = 0;
    }
    farmer.plot = null;
  }

  /** Plus rien à faire au champ : il lâche sa case et flâne à partir de sa porte. */
  private stopFarming(farmer: Farmer, farm: Farm, door: { x: number; y: number }): void {
    this.dropPlot(farmer, farm);
    farmer.state = 'idle';
    farmer.searchTicks = FARMERS.retryTicks;
    Object.assign(farmer, wanderFrom(door.x, door.y));
  }

  /**
   * Après un chargement : la place au coffre de chaque récolte en cours se
   * réserve à nouveau, et deux fermiers qui viseraient la même case — une
   * sauvegarde retouchée — n'en gardent qu'un.
   */
  public restore(): void {
    const claimed = new Set<string>();

    for (const farmer of this.members()) {
      const farm = this.world.entities.get(farmer.homeId);
      const holds = farmer.state === 'toHarvest' || farmer.state === 'harvest' || farmer.state === 'toFarm';

      if (farmer.plot) {
        const key = coordKey(farmer.plot.tx, farmer.plot.ty);

        if (claimed.has(key)) farmer.plot = null;
        else claimed.add(key);
      }
      if (holds && farmer.load > 0 && farm?.kind === 'farm') farm.store.reserveIn(CROPS.item, farmer.load);
    }
  }

  /**
   * Les cultures d'un champ qu'aucune ferme ne cultive plus s'arrachent : la
   * case redevient libre. Une ferme tombée en chantier garde les siennes.
   */
  public wither(): void {
    if (this.world.resources.cropTiles().next().done) return;

    const covered = new Set<string>();

    for (const entity of this.world.entities.values()) {
      if (entity.proto !== 'farm') continue;
      for (const tile of fieldTiles(entity)) covered.add(coordKey(tile.tx, tile.ty));
    }
    for (const tile of [...this.world.resources.cropTiles()]) {
      if (covered.has(coordKey(tile.tx, tile.ty))) continue;
      this.world.resources.wither(tile.tx, tile.ty);
      this.world.dirtyTile(tile.tx, tile.ty);
    }
  }
}
