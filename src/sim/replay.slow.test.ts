import { describe, expect, it } from 'vitest';
import { TEST_SCENARIOS, type TestScenarioId } from '../data/testScenario.ts';
import { PlaytestBot } from './playtest.ts';
import { stageScenario } from './testScenario.ts';
import { TICKS_PER_SECOND, World } from './world.ts';

/*
 * Le rejeu de référence : des parties de 30 minutes, rejouées tick par tick,
 * doivent finir sur les mêmes empreintes. Il garde les refactorisations de
 * `world.ts` — un système qui en sort ne change rien à la partie.
 *
 * Deux empreintes par partie : `World.checksum()`, celle du jeu à deux, et
 * celle de la sauvegarde entière, plus fine (jauges, réservations, cultures).
 * Un changement de gameplay voulu les change : relancer ce test, puis
 * recopier les valeurs reçues.
 */

const TICKS = 30 * 60 * TICKS_PER_SECOND;

/** Une empreinte FNV-1a de la sauvegarde entière. */
function stateHash(world: World): number {
  const text = JSON.stringify(world.snapshot());
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

function prints(world: World): [number, number] {
  return [world.checksum(), stateHash(world)];
}

/** Un scénario de test, déroulé 30 minutes ; `awayAt` : le tick où rentre le joueur après deux heures d'absence. */
function scenario(id: TestScenarioId, awayAt: number | null): World {
  const world = stageScenario(TEST_SCENARIOS[id]);

  for (let i = 0; i < TICKS; i += 1) {
    if (i === awayAt) world.push({ type: 'catchUp', awayMs: 2 * 60 * 60 * 1000 });
    world.tick();
  }
  return world;
}

describe('rejeu de référence, 30 minutes', () => {
  it('le joueur simulé, graine 1', () => {
    const bot = new PlaytestBot(World.newColony(1), { seed: 1, now: () => 0 });

    bot.run(TICKS);
    expect(prints(bot.world)).toEqual([3663157910, 1735284714]);
  });

  // Bûcherons, ferme, puits, postes, et deux heures d'absence rattrapées à la cinquième minute.
  it('la petite base', () => {
    expect(prints(scenario('base', 6000))).toEqual([578755868, 2758817568]);
  });

  it('le forestier', () => {
    expect(prints(scenario('forest', 6000))).toEqual([2723680799, 1089842262]);
  });

  it('la ferme', () => {
    expect(prints(scenario('farm', 6000))).toEqual([3644282354, 2349476581]);
  });

  // Le soir tombe : bûcherons, bâtisseurs et logisticiens se couchent, dedans ou dehors.
  it('les maisons', () => {
    expect(prints(scenario('housing', null))).toEqual([2164273792, 2112402026]);
  });
});
