import { describe, expect, it } from 'vitest';
import { PROBLEMS } from '../data/problems.ts';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { LUMBERJACKS } from '../data/workers.ts';
import { ProblemWatch, problemsOf, type ProblemFacts } from './problems.ts';
import { stageScenario } from './testScenario.ts';
import type { Farm, LumberCamp } from './types.ts';

const CALM: ProblemFacts = { stoppedByPlayer: false, storeFull: false, noWorker: false, starved: false, noPig: false, drained: false };
const FULL: ProblemFacts = { ...CALM, storeFull: true };

describe('problèmes d’un bâtiment', () => {
  it('rangent l’entrepôt plein avant l’ouvrier manquant', () => {
    expect(problemsOf({ ...CALM, storeFull: true, noWorker: true })).toEqual(['storeFull', 'noWorker']);
    expect(problemsOf({ ...CALM, noWorker: true })).toEqual(['noWorker']);
    expect(problemsOf(CALM)).toEqual([]);
    // Un consommateur qui attend sa livraison : après les deux autres.
    expect(problemsOf({ ...CALM, noWorker: true, starved: true })).toEqual(['noWorker', 'starved']);
  });

  it('ne comptent pas la pause voulue par le joueur', () => {
    expect(problemsOf({ ...FULL, noWorker: true, stoppedByPlayer: true })).toEqual([]);
  });

  it('paraissent au tick où ils naissent, et montrent le plus important', () => {
    const watch = new ProblemWatch();

    expect(watch.step(1, CALM, 0)).toBeNull();
    expect(watch.step(1, { ...CALM, noWorker: true }, 1)).toBe('noWorker');
    expect(watch.step(1, { ...FULL, noWorker: true }, 2)).toBe('storeFull');
    expect(watch.of(1)).toBe('storeFull');
  });

  it('ne clignotent pas quand le coffre se vide un peu puis se remplit', () => {
    const watch = new ProblemWatch();

    watch.step(1, FULL, 0);
    // Un porteur entame le coffre : plus plein, pas vidé pour autant.
    for (let tick = 1; tick < PROBLEMS.holdTicks; tick += 1) expect(watch.step(1, CALM, tick)).toBe('storeFull');
    // La machine le remplit aussitôt : l'alerte n'a jamais quitté le toit.
    expect(watch.step(1, FULL, PROBLEMS.holdTicks)).toBe('storeFull');
  });

  it('s’effacent après le délai, ou tout de suite si le coffre est vidé franchement', () => {
    const watch = new ProblemWatch();

    watch.step(1, FULL, 0);
    watch.step(1, CALM, 1);
    expect(watch.step(1, CALM, PROBLEMS.holdTicks)).toBe('storeFull');
    expect(watch.step(1, CALM, PROBLEMS.holdTicks + 1)).toBeNull();

    watch.step(2, FULL, 0);
    expect(watch.step(2, { ...CALM, drained: true }, 1)).toBeNull();
  });

  it('s’effacent tout de suite quand le joueur met le bâtiment en pause : la bulle ⏸ parle', () => {
    const watch = new ProblemWatch();

    watch.step(1, FULL, 0);
    expect(watch.step(1, { ...FULL, stoppedByPlayer: true }, 1)).toBeNull();
  });

  it('un coffre vidé n’efface pas tout de suite un ouvrier manquant', () => {
    const watch = new ProblemWatch();

    watch.step(1, { ...CALM, noWorker: true }, 0);
    expect(watch.step(1, { ...CALM, drained: true }, 1)).toBe('noWorker');
  });
});

describe('World.problem', () => {
  /** Le temps d'un relevé : les problèmes se relèvent tous les `PROBLEMS.everyTicks`. */
  function settle(world: ReturnType<typeof stageScenario>): void {
    for (let i = 0; i < PROBLEMS.everyTicks; i += 1) world.tick();
  }

  function camp(): { world: ReturnType<typeof stageScenario>; camp: LumberCamp; farm: Farm } {
    const world = stageScenario(TEST_SCENARIOS.base);
    const entities = [...world.entities.values()];

    return {
      world,
      camp: entities.find((entity): entity is LumberCamp => entity.kind === 'lumberCamp')!,
      farm: entities.find((entity): entity is Farm => entity.kind === 'farm')!,
    };
  }

  it('montre l’entrepôt plein d’une cabane qui n’a plus la place d’un voyage, et l’efface une fois vidée', () => {
    const { world, camp: lumberCamp } = camp();

    settle(world);
    expect(world.problem(lumberCamp)).toBeNull();

    lumberCamp.store.add('wood', lumberCamp.store.capacity - lumberCamp.store.total() - LUMBERJACKS.carry + 1);
    settle(world);
    expect(world.problem(lumberCamp)).toBe('storeFull');

    lumberCamp.store.remove('wood', lumberCamp.store.count('wood'));
    settle(world);
    expect(world.problem(lumberCamp)).toBeNull();
  });

  it('se tait pour un bâtiment en pause', () => {
    const { world, camp: lumberCamp } = camp();

    lumberCamp.store.add('wood', lumberCamp.store.capacity);
    settle(world);
    expect(world.problem(lumberCamp)).toBe('storeFull');

    world.push({ type: 'pauseBuilding', id: lumberCamp.id, paused: true });
    settle(world);
    expect(world.problem(lumberCamp)).toBeNull();
  });

  it('dit l’ouvrier manquant d’une ferme sans personne, mais pas d’une ferme mise à zéro', () => {
    const { world, farm } = camp();

    world.colonists = 0;
    settle(world);
    expect(world.problem(farm)).toBe('noWorker');

    world.push({ type: 'setWorkers', id: farm.id, count: 0 });
    settle(world);
    expect(world.problem(farm)).toBeNull();
  });
});
