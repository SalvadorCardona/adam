/**
 * Les problèmes d'un bâtiment : ce qui l'arrête sans que le joueur l'ait
 * voulu — coffre plein, ouvrier manquant, entrée attendue (`data/problems.ts`).
 *
 * `problemsOf` les range par priorité à partir de faits que `World` relève
 * tous les `PROBLEMS.everyTicks` ; `ProblemWatch` en tire celui que la carte
 * montre, avec l'hystérésis qui l'empêche de clignoter : il paraît aussitôt,
 * ne s'efface qu'après `PROBLEMS.holdTicks` sans lui — tout de suite si le
 * coffre a été vidé franchement, ou si le joueur a mis le bâtiment en pause
 * (la bulle ⏸ parle alors). Rien de tout ça n'est sauvegardé : au chargement, les faits
 * suffisent à le retrouver.
 */

import { PROBLEMS, PROBLEM_ORDER, type ProblemId } from '../data/problems.ts';
import type { EntityId } from './types.ts';

export interface ProblemFacts {
  /** Arrêté par le joueur : en pause, ou à zéro ouvrier demandé. Ce n'est pas un problème. */
  stoppedByPlayer: boolean;
  /** Le coffre de sortie n'a plus la place d'une production. */
  storeFull: boolean;
  /** Des postes demandés, pas un ouvrier en poste. */
  noWorker: boolean;
  /** Un consommateur attend de quoi lancer son prochain cycle : la nurserie, sa nourriture. */
  starved: boolean;
  /** L'élevage de cochons est vide : aucun cochon n'y a été ramené. */
  noPig: boolean;
  /** Le coffre est redescendu à `PROBLEMS.releaseRatio` de sa capacité ou moins. */
  drained: boolean;
}

/** Les problèmes du bâtiment, le plus important d'abord ; aucun s'il est arrêté par le joueur. */
export function problemsOf(facts: ProblemFacts): ProblemId[] {
  if (facts.stoppedByPlayer) return [];
  return PROBLEM_ORDER.filter((problem) => facts[problem]);
}

interface Shown {
  problem: ProblemId;
  /** Depuis quel tick plus rien ne le justifie ; `null` tant qu'il dure. */
  clearSince: number | null;
}

export class ProblemWatch {
  private readonly shown = new Map<EntityId, Shown>();

  /** Relève les faits d'un bâtiment au tick `tick`, et renvoie le problème à montrer. */
  public step(id: EntityId, facts: ProblemFacts, tick: number): ProblemId | null {
    const current = problemsOf(facts)[0] ?? null;
    const state = this.shown.get(id);

    if (current !== null) {
      this.shown.set(id, { problem: current, clearSince: null });
      return current;
    }
    if (!state) return null;

    if (facts.stoppedByPlayer || (state.problem === 'storeFull' && facts.drained)) {
      this.shown.delete(id);
      return null;
    }

    state.clearSince ??= tick;
    if (tick - state.clearSince >= PROBLEMS.holdTicks) {
      this.shown.delete(id);
      return null;
    }
    return state.problem;
  }

  /** Le problème que montre le bâtiment, ou `null`. */
  public of(id: EntityId): ProblemId | null {
    return this.shown.get(id)?.problem ?? null;
  }

  /** Oublie un bâtiment qui n'a plus de problème à relever : abattu, rasé, redevenu chantier. */
  public forget(id: EntityId): void {
    this.shown.delete(id);
  }

  /** Les bâtiments qu'il suit, pour oublier ceux qui ont disparu. */
  public ids(): IterableIterator<EntityId> {
    return this.shown.keys();
  }
}
