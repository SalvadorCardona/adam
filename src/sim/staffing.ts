/**
 * Pause et effectifs des bâtiments.
 *
 * Deux réglages, posés depuis la fenêtre d'un bâtiment par des commandes
 * (`pauseBuilding`, `setWorkers`) et sauvegardés avec lui :
 *
 * - **la pause** d'un bâtiment producteur (foreuse, ferme, carrière, forge,
 *   nurserie, cabane de bûcheron, maison du forestier) : il ne produit plus et ne consomme plus rien ; ses
 *   ouvriers finissent leur geste en cours puis flânent, et les porteurs
 *   peuvent toujours vider son coffre. Le poste de construction se met en
 *   pause aussi : ses chantiers reviennent aux porteurs et à Adam ;
 * - **l'effectif voulu** (`staff`) d'un bâtiment qui emploie, entre son
 *   minimum (`minWorkers`) et son maximum (`workers`). Zéro vaut pause ;
 * - **la priorité de travail** (`priority`, commande `setPriority`) : Basse,
 *   Moyenne ou Haute (`WORK_PRIORITIES` de `data/workers.ts`).
 *
 * Les ouvriers viennent de la population de la ville : ceux que logent les
 * bâtiments finis. Chaque bâtiment qui emploie y puise ce qu'il veut, tant
 * qu'il en reste — la priorité la plus haute d'abord, puis le plus ancien —,
 * et un poste Haute vide va chercher l'ouvrier d'un bâtiment Basse
 * (`allocateStaff`) : l'affectation ne dépend que de l'état, jamais du
 * hasard. Ce qu'il n'obtient pas reste un poste vide, « ouvrier manquant »,
 * qui se remplit tout seul dès qu'un autre bâtiment en rend un.
 *
 * Ce module ne fait que compter : `World` en tire qui travaille.
 */

import { BUILDINGS, type BuildingId, type BuildingKind } from '../data/buildings.ts';
import { WORK_PRIORITIES, WORK_PRIORITY, type WorkPriority } from '../data/workers.ts';
import type { EntityId } from './types.ts';

/**
 * Ce qu'on peut mettre en pause : ce qu'un producteur fait tourner, et le
 * poste de construction — en pause, ses chantiers reviennent aux porteurs.
 */
const PAUSABLE: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['drill', 'farm', 'quarry', 'forge', 'nursery', 'lumberCamp', 'foresterHouse', 'yard', 'pigPen']);

/** Le bâtiment produit-il quelque chose qu'on puisse arrêter ? */
export function canPause(proto: BuildingId): boolean {
  return PAUSABLE.has(BUILDINGS[proto].kind);
}

/** Le bâtiment emploie-t-il des ouvriers qu'on peut régler ? */
export function employs(proto: BuildingId): boolean {
  return BUILDINGS[proto].workers > 0;
}

/** L'effectif ramené dans les bornes du bâtiment ; un nombre illisible vaut le maximum. */
export function clampStaff(proto: BuildingId, staff: number): number {
  const { minWorkers, workers } = BUILDINGS[proto];

  if (!Number.isFinite(staff)) return workers;
  return Math.max(minWorkers, Math.min(workers, Math.trunc(staff)));
}

/** Ce que le panneau montre d'un bâtiment qui emploie. */
export interface Staffing {
  min: number;
  max: number;
  /** Ce que le joueur a demandé. */
  wanted: number;
  /** Les postes occupés : `wanted - filled` ouvriers manquent. */
  filled: number;
}

/** Un bâtiment qui emploie, vu par la répartition. */
export interface StaffDemand {
  id: EntityId;
  wanted: number;
  /** Absente : `WORK_PRIORITY.initial`. */
  priority?: WorkPriority;
  /** En pause, il garde ses ouvriers mais n'en reçoit plus, et les cède le premier. */
  paused?: boolean;
}

/**
 * Les postes occupés d'un bâtiment, et le tick où il en a gagné un pour la
 * dernière fois — `null` s'il n'en a jamais gagné sous ce compte : une
 * priorité plus haute peut le lui reprendre sans attendre.
 */
export interface StaffPost {
  filled: number;
  since: number | null;
}

/** Le rang d'une priorité : plus il est haut, plus le bâtiment est servi tôt. */
export function priorityRank(priority: WorkPriority = WORK_PRIORITY.initial): number {
  return WORK_PRIORITIES.indexOf(priority);
}

/** Lisible dans une sauvegarde : une priorité inconnue vaut celle par défaut. */
export function isWorkPriority(value: unknown): value is WorkPriority {
  return (WORK_PRIORITIES as readonly unknown[]).includes(value);
}

/**
 * La répartition de `pool` ouvriers entre les bâtiments. Renvoie les postes
 * occupés par bâtiment ; `pool` moins leur somme, ce sont les ouvriers libres.
 *
 * Sans répartition d'avant (`before`, un nouveau monde), elle se fait d'un
 * coup : priorité la plus haute d'abord, puis par id croissant — le plus
 * ancien d'abord.
 *
 * Sinon, elle part de celle d'avant, pour que personne ne change de poste
 * sans raison :
 * 1. chaque bâtiment garde ses ouvriers, dans la limite de son effectif voulu ;
 * 2. les ouvriers libres vont aux postes vides, dans le même ordre ;
 * 3. un poste encore vide reprend un ouvrier à un bâtiment de priorité plus
 *    basse — en pause d'abord, puis Basse, le plus récent d'abord —, sauf à
 *    un bâtiment qui en a gagné un il y a moins de `hold` ticks.
 *
 * Un bâtiment en pause n'en reçoit jamais. À priorité égale, personne ne
 * reprend rien : le premier servi garde ses ouvriers. Tout ne dépend que de
 * l'état et du tick, jamais du hasard.
 */
export function allocateStaff(
  demands: readonly StaffDemand[],
  pool: number,
  before: ReadonlyMap<EntityId, StaffPost> | null = null,
  tick = 0,
  hold: number = WORK_PRIORITY.holdTicks,
): Map<EntityId, StaffPost> {
  const order = [...demands].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id - b.id);
  // Qui cède d'abord : en pause, puis la priorité la plus basse, le plus récent.
  const yieldRank = (demand: StaffDemand): number => (demand.paused ? -1 : priorityRank(demand.priority));
  const donors = [...order].sort((a, b) => yieldRank(a) - yieldRank(b) || b.id - a.id);
  const posts = new Map<EntityId, StaffPost>();
  const caps = new Map<EntityId, number>();
  let left = Math.max(0, pool);

  for (const demand of order) {
    const held = before?.get(demand.id);
    const wanted = Math.max(0, demand.wanted);
    // En pause, il ne reçoit personne : il garde au plus ce qu'il avait.
    const cap = demand.paused && before ? Math.min(wanted, held?.filled ?? 0) : wanted;

    caps.set(demand.id, cap);
    posts.set(demand.id, { filled: before ? Math.min(held?.filled ?? 0, cap) : 0, since: held?.since ?? null });
    left -= posts.get(demand.id)!.filled;
  }

  // La colonie a rétréci : ceux qui cèdent d'abord rendent leurs ouvriers.
  for (const demand of donors) {
    if (left >= 0) break;

    const post = posts.get(demand.id)!;
    const given = Math.min(post.filled, -left);

    post.filled -= given;
    left += given;
  }

  for (const demand of order) {
    const post = posts.get(demand.id)!;
    let need = caps.get(demand.id)! - post.filled;
    const gained = Math.min(need, left);

    if (gained > 0) {
      post.filled += gained;
      post.since = tick;
      left -= gained;
      need -= gained;
    }
    if (need <= 0 || demand.paused) continue;

    for (const donor of donors) {
      if (need <= 0 || yieldRank(donor) >= priorityRank(demand.priority)) break;

      const from = posts.get(donor.id)!;

      if (from.filled === 0 || (from.since !== null && tick - from.since < hold)) continue;

      const taken = Math.min(need, from.filled);

      from.filled -= taken;
      post.filled += taken;
      post.since = tick;
      need -= taken;
    }
  }
  return posts;
}
