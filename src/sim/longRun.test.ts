import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { SHORE_SPOT, TEST_SCENARIOS, type TestScenarioProto } from '../data/testScenario.ts';
import { stageScenario } from './testScenario.ts';
import { TICKS_PER_SECOND, type World } from './world.ts';

/*
 * Simulation accélérée : la partie de test (graine 100) tourne deux heures de
 * jeu d'un trait, avec une stratégie minimale — pas une IA joueuse. Elle ne
 * fixe aucune valeur d'équilibrage : elle montre la dérive (population,
 * vivres, morts) toutes les dix minutes et n'échoue que si la colonie est
 * morte avant 30 minutes.
 */

/**
 * La base : une ferme, une boulangerie (le blé n'est pas de la nourriture), un
 * poste de logistique qui les ravitaille et rentre leurs sorties, un puits, deux Maisons. Le puits est de l'autre côté de l'eau : aucun
 * porteur ne traverse, c'est Adam qui rapporte l'eau.
 */
const SCENARIO: TestScenarioProto = {
  ...TEST_SCENARIOS.base,
  research: ['baking', 'fortification'],
  buildings: [
    { building: 'farm', dx: 10, dy: 4 },
    { building: 'well', ...SHORE_SPOT },
    { building: 'logisticsPost', dx: 6, dy: 8 },
    { building: 'bakery', dx: 10, dy: 9 },
    { building: 'archerTower', dx: 3, dy: 1 },
    { building: 'home', dx: 6, dy: -4 },
    { building: 'home', dx: 9, dy: -4 },
  ],
};

const SECONDS = (minutes: number): number => minutes * 60 * TICKS_PER_SECOND;
const DURATION = SECONDS(120);
const REPORT_EVERY = SECONDS(10);
const MIN_SURVIVAL = SECONDS(30);
/** Adam fait la tournée du puits toutes les deux minutes. */
const WATER_ROUND = SECONDS(2);

function moveAdam(world: World, tx: number, ty: number): void {
  const x = (tx + 0.5) * TILE_SIZE;
  const y = (ty + 0.5) * TILE_SIZE;

  Object.assign(world.player, { x, y, prevX: x, prevY: y });
}

/** Adam vide le puits dans son sac, puis le sac dans la mairie, et revient où il était. */
function fetchWater(world: World): void {
  const well = [...world.entities.values()].find((entity) => entity.kind === 'quarry');
  const hall = world.entities.get(world.townHallId);

  if (!well || !hall) return;

  const { x, y } = world.player;

  moveAdam(world, well.tx, well.ty + well.height);
  world.push({ type: 'transferItems', id: well.id, direction: 'take', quantity: 'all', item: 'water' });
  world.tick();
  moveAdam(world, hall.tx, hall.ty + hall.height);
  world.push({ type: 'depositToTown' });
  world.tick();
  Object.assign(world.player, { x, y, prevX: x, prevY: y });
}

describe('simulation accélérée (2 h)', () => {
  it('la colonie tient 30 minutes au moins, bilan toutes les 10 minutes', { timeout: 30_000 }, () => {
    const world = stageScenario(SCENARIO);
    const lines: string[] = [];
    let deaths = 0;
    let deadAt: number | null = null;

    world.events.on('workerStarved', () => {
      deaths += 1;
    });

    for (let tick = 1; tick <= DURATION; tick += 1) {
      if (tick % WATER_ROUND === 0 && !world.defeated) fetchWater(world);
      world.tick();

      if (deadAt === null && (world.defeated || world.population().workers <= 0)) deadAt = world.tickCount;
      if (tick % REPORT_EVERY === 0) {
        const town = world.townStock();
        const { workers, children } = world.population();

        lines.push(
          `${String(tick / SECONDS(1)).padStart(3)} min · ouvriers ${workers} · enfants ${children}` +
            ` · nourriture ${town?.count('food') ?? 0} · eau ${town?.count('water') ?? 0}` +
            ` · morts de faim/soif ${deaths}${world.defeated ? ' · MAIRIE TOMBÉE' : ''}`,
        );
      }
    }

    console.log(`Bilan sur 2 h simulées (graine ${SCENARIO.seed}) :\n${lines.join('\n')}`);
    expect(deadAt === null || deadAt >= MIN_SURVIVAL, `colonie morte au tick ${deadAt}`).toBe(true);
  });
});
