/**
 * Ce qu'une équipe logée — bûcherons (`sim/lumberjacks.ts`), forestier
 * (`sim/forester.ts`), fermiers (`sim/farmer.ts`) — voit du monde, et les
 * gestes communs des habitants que `World` lui prête.
 *
 * Un système ne reçoit jamais tout `World` : seulement ce contexte, que
 * `World.crewContext()` construit une fois. L'état reste au monde (mobiles,
 * bâtiments, ressources) ; le système n'y garde que ce qui se refait au
 * chargement.
 */

import type { Emitter } from '../core/events.ts';
import type { ItemId } from '../data/items.ts';
import type { ResearchStat } from '../data/research.ts';
import type { Chest } from './chests.ts';
import type { ChunkIndex } from './chunk.ts';
import type { LineTest } from './jobs.ts';
import type { Needs } from './needs.ts';
import type { ResourceIndex } from './resources.ts';
import type { Entity, EntityId, Mobile, MobileId } from './types.ts';
import type { Laborer, Person, WorldEvents } from './world.ts';

export interface CrewContext {
  readonly seed: number;
  readonly tickCount: number;
  readonly resources: ResourceIndex;
  readonly chunks: ChunkIndex;
  readonly entities: ReadonlyMap<EntityId, Entity>;
  readonly mobiles: Map<MobileId, Mobile>;
  readonly events: Emitter<WorldEvents>;
  /** La ligne droite entre deux points ne passe pas par l'eau. */
  readonly lineIsClear: LineTest;
  /** La tuile se récolte-t-elle ? Pas dans la zone d'une base mutante debout. */
  readonly harvestable: (tx: number, ty: number) => boolean;
  /** Les tuiles que plus personne ne doit viser : arbres des bûcherons, ressources des glaneurs. */
  claimedNodes(): Set<string>;
  chestAt(tx: number, ty: number): Chest | null;
  bonus(stat: ResearchStat): number;
  /** Ce que produisent les machines, pour les objectifs. */
  tally(item: ItemId, amount: number): void;
  dirtyTile(tx: number, ty: number): void;

  /** Les postes pourvus du bâtiment, d'après la répartition des ouvriers. */
  posts(id: EntityId): number;
  /** L'ouvrier libre le plus proche de `door`, tel qu'il change de métier ; `undefined` s'il n'en reste aucun. */
  recruit(door: { x: number; y: number }): Person | undefined;
  /** Le nouvel équipier prend la place de l'ouvrier libre, sous le même id. */
  hire(member: Laborer): void;
  /** L'ouvrier a-t-il un poste ? */
  onDuty(member: Laborer): boolean;
  /** Il redevient un ouvrier libre de la colonie. */
  release(member: Laborer): void;
  goHome(member: Laborer, door: { x: number; y: number }): void;
  idle(member: Laborer, door: { x: number; y: number }, bedtime: boolean): void;
  sleep(member: Laborer, door: { x: number; y: number }): void;
  /** Le pas d'un habitant, en secondes de marche. */
  walkStep(): number;
  /** Les unités de travail d'un geste ce tick. */
  toil(needs: Needs): number;
}
