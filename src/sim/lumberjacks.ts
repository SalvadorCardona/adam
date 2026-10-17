/**
 * Les bûcherons : quel arbre couper, d'où, et leur journée.
 *
 * Les fonctions répondent à trois questions : un arbre est-il dans le rayon
 * de la cabane, lequel viser, et où se poster pour le couper.
 * `LumberjackCrew` mène l'équipe — embauche, voyages, coupe —, avec ce que
 * `World` lui prête (`CrewContext`) : `walkToward()` comme un porteur.
 *
 * Le rayon se mesure du centre de la cabane au centre de la tuile de
 * l'arbre, en distances au carré : c'est le cercle que le rendu dessine.
 * Seules les tuiles du carré qui l'englobe sont interrogées, jamais la carte.
 *
 * Deux bûcherons ne visent jamais le même arbre : l'arbre choisi est
 * réservé (`claimed`) jusqu'à ce que son bûcheron le lâche. Un arbre
 * réservé n'est plus proposé à personne.
 */

import { TILE_SIZE, coordKey, distanceSq } from '../core/grid.ts';
import { LUMBERJACKS } from '../data/workers.ts';
import type { CrewContext } from './crew.ts';
import type { ResourceIndex } from './resources.ts';
import type { EntityId, LumberCamp, Lumberjack } from './types.ts';
import { doorOf, type LineTest } from './jobs.ts';
import { standStill, walkToward, wanderFrom } from './workers.ts';

export interface TreeTile {
  tx: number;
  ty: number;
}

/** Le centre de l'emprise de la cabane, en pixels monde. */
function centerOf(camp: LumberCamp): { x: number; y: number } {
  return { x: (camp.tx + camp.width / 2) * TILE_SIZE, y: (camp.ty + camp.height / 2) * TILE_SIZE };
}

/** La tuile est-elle dans le rayon de coupe de la cabane ? */
export function inCutRange(camp: LumberCamp, tx: number, ty: number): boolean {
  const { x, y } = centerOf(camp);
  const reach = LUMBERJACKS.radius * TILE_SIZE;

  return distanceSq(x, y, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE) <= reach * reach;
}

/** Un arbre encore debout sur la tuile ? */
export function isTree(resources: ResourceIndex, tx: number, ty: number): boolean {
  return resources.at(tx, ty)?.id === 'tree';
}

/**
 * Les arbres encore debout dans le rayon, du plus proche du centre au plus loin.
 * `allowed` : la tuile se récolte-t-elle ? Pas dans la zone d'une base mutante debout.
 */
export function treesInRange(
  camp: LumberCamp,
  resources: ResourceIndex,
  allowed: (tx: number, ty: number) => boolean = () => true,
): (TreeTile & { d2: number })[] {
  const { x, y } = centerOf(camp);
  const span = Math.ceil(LUMBERJACKS.radius);
  const cx = camp.tx + Math.floor(camp.width / 2);
  const cy = camp.ty + Math.floor(camp.height / 2);
  const trees: (TreeTile & { d2: number })[] = [];

  for (let ty = cy - span - 1; ty <= cy + span; ty += 1) {
    for (let tx = cx - span - 1; tx <= cx + span; tx += 1) {
      if (!inCutRange(camp, tx, ty) || !isTree(resources, tx, ty) || !allowed(tx, ty)) continue;
      trees.push({ tx, ty, d2: distanceSq(x, y, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE) });
    }
  }
  // À distance égale, l'ordre de balayage départage : le choix ne dépend que de la carte.
  return trees.sort((a, b) => a.d2 - b.d2);
}

/**
 * L'arbre à couper : le plus proche de la cabane, dans son rayon, que
 * personne n'a réservé et qu'on atteint en ligne droite sans passer par
 * l'eau. `null` s'il n'en reste aucun.
 */
export function pickTree(
  camp: LumberCamp,
  from: { x: number; y: number },
  resources: ResourceIndex,
  claimed: ReadonlySet<string>,
  clear: LineTest,
  allowed: (tx: number, ty: number) => boolean = () => true,
): TreeTile | null {
  for (const tree of treesInRange(camp, resources, allowed)) {
    if (claimed.has(coordKey(tree.tx, tree.ty))) continue;

    const spot = chopSpot(tree);

    if (!clear(from.x, from.y, spot.x, spot.y)) continue;
    return { tx: tree.tx, ty: tree.ty };
  }
  return null;
}

/** Où se poste le bûcheron : à gauche du tronc, face à lui — la hache frappe de profil. */
export function chopSpot(tree: TreeTile): { x: number; y: number } {
  return { x: tree.tx * TILE_SIZE + 3, y: (tree.ty + 1) * TILE_SIZE - 5 };
}

/**
 * L'équipe des cabanes : embauche, voyages, coupe, et les arbres réservés.
 * Les bûcherons sont des mobiles du monde ; seule la réservation des arbres
 * vit ici, rejouée au chargement (`restore`).
 */
export class LumberjackCrew {
  /** Les arbres visés par un bûcheron, `coordKey` : personne d'autre ne les vise. Non sauvegardé. */
  public readonly claimed = new Set<string>();

  /** Le dernier compte d'arbres d'une cabane, cf. `treesLeft()`. */
  private treeCount: { id: EntityId; tick: number; count: number } | null = null;

  private readonly world: CrewContext;

  public constructor(world: CrewContext) {
    this.world = world;
  }

  public *members(): IterableIterator<Lumberjack> {
    for (const mobile of this.world.mobiles.values()) {
      if (mobile.kind === 'lumberjack') yield mobile;
    }
  }

  /** Pourvoit la cabane d'autant de bûcherons que de postes pourvus : les ouvriers libres les plus proches. */
  public staff(camp: LumberCamp): void {
    const { world } = this;
    let lodged = 0;

    for (const lumberjack of this.members()) {
      if (lumberjack.homeId === camp.id) lodged += 1;
    }

    const door = doorOf(camp);
    const posts = world.posts(camp.id);

    for (let i = lodged; i < posts; i += 1) {
      const person = world.recruit(door);

      if (!person) break;

      world.hire({
        kind: 'lumberjack',
        ...person,
        homeId: camp.id,
        inside: false,
        state: 'idle',
        tree: null,
        chopTicks: 0,
        load: 0,
        // Ils ne partent pas du même pas : le second suit le premier.
        searchTicks: 1 + i * 12,
        ...wanderFrom(person.x, person.y),
      });
    }
  }

  /**
   * Les arbres encore debout dans le rayon de la cabane — zéro : « Plus
   * d'arbres à portée ». La fenêtre le demande à chaque image : le compte
   * n'est refait qu'une fois par tick.
   */
  public treesLeft(camp: LumberCamp): number {
    const { world } = this;

    if (this.treeCount?.id !== camp.id || this.treeCount.tick !== world.tickCount) {
      this.treeCount = { id: camp.id, tick: world.tickCount, count: treesInRange(camp, world.resources, world.harvestable).length };
    }
    return this.treeCount.count;
  }

  /**
   * Un tick de bûcheron. Hors d'un voyage, il cherche un arbre toutes les
   * `retryTicks` — à condition qu'il y ait au coffre la place d'un voyage,
   * réservée aussitôt : le bois rapporté y entre toujours. Coffre plein, il
   * attend devant la porte ; plus d'arbre à portée, il flâne. La nuit, il ne
   * repart pas ; pendant une vague, il rentre s'abriter, bois compris, et
   * reprend son voyage ensuite.
   */
  public step(lumberjack: Lumberjack, alarm: boolean, bedtime: boolean): void {
    const { world } = this;
    const camp = world.entities.get(lumberjack.homeId);

    // Sa cabane est tombée : il lâche son arbre et redevient un ouvrier libre.
    if (camp?.kind !== 'lumberCamp') {
      this.releaseTree(lumberjack);
      world.release(lumberjack);
      return;
    }

    const door = doorOf(camp);

    if (alarm) {
      // Il reprendra son arbre après la vague : il lui faudra d'abord y retourner.
      if (lumberjack.state === 'chop') lumberjack.state = 'toTree';
      world.goHome(lumberjack, door);
      return;
    }

    // Cabane en pause, ou lui retiré de son poste : il finit son geste — rapporter le bois qu'il a —, puis flâne.
    const working = !camp.paused && world.onDuty(lumberjack);

    if (!working) {
      if (lumberjack.state === 'toTree' || lumberjack.state === 'chop') this.endTrip(lumberjack, door);
      else if (lumberjack.state === 'wait' && lumberjack.load === 0) lumberjack.state = 'idle';
    }

    // Retiré de son poste, son bois rapporté : il rentre, et redevient un ouvrier libre.
    if (!world.onDuty(lumberjack) && lumberjack.state === 'idle' && lumberjack.load === 0) {
      world.release(lumberjack);
      return;
    }

    switch (lumberjack.state) {
      case 'idle':
      case 'wait':
        lumberjack.searchTicks -= 1;
        if (lumberjack.searchTicks <= 0 && working && !bedtime && lumberjack.load === 0) {
          lumberjack.searchTicks = LUMBERJACKS.retryTicks;
          this.startTrip(lumberjack, camp, door);
        }
        if (lumberjack.state === 'idle') world.idle(lumberjack, door, bedtime);
        else if (lumberjack.state === 'wait') this.waitAtCamp(lumberjack, door, bedtime);
        else lumberjack.inside = false;
        break;

      case 'toTree': {
        const tree = lumberjack.tree;

        lumberjack.inside = false;
        if (!tree || !isTree(world.resources, tree.tx, tree.ty)) {
          // Adam l'a coupé avant lui : il en cherche un autre sans attendre.
          this.endTrip(lumberjack, door);
          break;
        }

        const spot = chopSpot(tree);

        if (walkToward(lumberjack, spot.x, spot.y, world.walkStep())) {
          lumberjack.state = 'chop';
          lumberjack.facing = 'right';
          lumberjack.chopTicks = LUMBERJACKS.chopTicks;
        }
        break;
      }

      case 'chop':
        standStill(lumberjack);
        lumberjack.inside = false;
        // Affamé, il ne frappe plus qu'un tick sur deux.
        lumberjack.chopTicks -= world.toil(lumberjack.needs);
        if (lumberjack.chopTicks <= 0) this.chop(lumberjack, door);
        break;

      case 'toCamp':
        lumberjack.inside = false;
        if (walkToward(lumberjack, door.x, door.y, world.walkStep())) this.storeWood(lumberjack, camp);
        break;
    }
  }

  /** Un voyage commence : la place au coffre, puis l'arbre — les deux réservés, ou rien. */
  private startTrip(lumberjack: Lumberjack, camp: LumberCamp, door: { x: number; y: number }): void {
    const { world } = this;

    if (!camp.store.reserveIn('wood', LUMBERJACKS.carry)) {
      lumberjack.state = 'wait';
      return;
    }

    const tree = pickTree(camp, door, world.resources, world.claimedNodes(), world.lineIsClear, world.harvestable);

    if (!tree) {
      camp.store.releaseIn('wood', LUMBERJACKS.carry);
      lumberjack.state = 'idle';
      return;
    }

    this.claimed.add(coordKey(tree.tx, tree.ty));
    lumberjack.tree = tree;
    lumberjack.state = 'toTree';
  }

  /** Un coup de hache : une unité de bois dans les bras. Arbre tombé ou bras pleins, il rentre. */
  private chop(lumberjack: Lumberjack, door: { x: number; y: number }): void {
    const { world } = this;
    const tree = lumberjack.tree;
    const taken = tree ? world.resources.take(tree.tx, tree.ty) : null;

    if (!tree || !taken || taken.resource.id !== 'tree') {
      this.endTrip(lumberjack, door);
      return;
    }

    lumberjack.load += 1;
    lumberjack.chopTicks = LUMBERJACKS.chopTicks;
    // La même règle que pour Adam : entamé à mi-chemin, disparu à la dernière unité.
    if (taken.stageChanged) world.dirtyTile(tree.tx, tree.ty);
    world.events.emit('treeChopped', {
      lumberjackId: lumberjack.id,
      tx: tree.tx,
      ty: tree.ty,
      remaining: taken.resource.remaining,
    });

    if (taken.resource.remaining <= 0 || lumberjack.load >= LUMBERJACKS.carry) this.endTrip(lumberjack, door);
  }

  /** Plus rien à couper ici : l'arbre est lâché ; avec du bois, il le rapporte, sinon il repart aussitôt. */
  private endTrip(lumberjack: Lumberjack, door: { x: number; y: number }): void {
    this.releaseTree(lumberjack);

    if (lumberjack.load > 0) {
      lumberjack.state = 'toCamp';
      return;
    }

    const camp = this.world.entities.get(lumberjack.homeId);

    if (camp?.kind === 'lumberCamp') camp.store.releaseIn('wood', LUMBERJACKS.carry);
    lumberjack.state = 'idle';
    lumberjack.searchTicks = 0;
    Object.assign(lumberjack, wanderFrom(door.x, door.y));
  }

  /** À la porte : la place réservée devient du bois dans le coffre. */
  private storeWood(lumberjack: Lumberjack, camp: LumberCamp): void {
    camp.store.releaseIn('wood', LUMBERJACKS.carry);

    const stored = camp.store.add('wood', lumberjack.load);

    lumberjack.load -= stored;
    if (stored > 0) this.world.events.emit('woodStored', { lumberjackId: lumberjack.id, id: camp.id, amount: stored });

    // Ce qui ne rentre pas — une sauvegarde retouchée, jamais en jeu — reste dans ses bras : il attend.
    lumberjack.state = lumberjack.load > 0 ? 'wait' : 'idle';
    lumberjack.searchTicks = 0;
  }

  /** Coffre plein : devant la porte, bois dans les bras s'il en a, jusqu'à ce qu'un porteur fasse de la place. */
  private waitAtCamp(lumberjack: Lumberjack, door: { x: number; y: number }, bedtime: boolean): void {
    const { world } = this;

    if (lumberjack.load > 0) {
      const camp = world.entities.get(lumberjack.homeId);

      if (camp?.kind === 'lumberCamp' && camp.store.freeSpace() > 0) {
        const stored = camp.store.add('wood', lumberjack.load);

        lumberjack.load -= stored;
        if (stored > 0) world.events.emit('woodStored', { lumberjackId: lumberjack.id, id: camp.id, amount: stored });
      }
    }
    if (bedtime && lumberjack.load === 0) {
      world.sleep(lumberjack, door);
      return;
    }
    lumberjack.inside = false;
    if (walkToward(lumberjack, door.x, door.y, world.walkStep())) lumberjack.facing = 'down';
  }

  public releaseTree(lumberjack: Lumberjack): void {
    if (lumberjack.tree) this.claimed.delete(coordKey(lumberjack.tree.tx, lumberjack.tree.ty));
    lumberjack.tree = null;
  }

  /**
   * Après un chargement : les arbres visés et la place réservée au coffre se
   * rejouent depuis les bûcherons sauvegardés. Un arbre déjà pris par un
   * autre — une sauvegarde retouchée — est lâché.
   */
  public restore(): void {
    this.claimed.clear();

    for (const lumberjack of this.members()) {
      const camp = this.world.entities.get(lumberjack.homeId);
      const onTrip = lumberjack.state === 'toTree' || lumberjack.state === 'chop' || lumberjack.state === 'toCamp';

      if (lumberjack.tree) {
        const key = coordKey(lumberjack.tree.tx, lumberjack.tree.ty);

        if (this.claimed.has(key) || !onTrip) lumberjack.tree = null;
        else this.claimed.add(key);
      }
      if (onTrip && camp?.kind === 'lumberCamp') camp.store.reserveIn('wood', LUMBERJACKS.carry);
    }
  }
}
