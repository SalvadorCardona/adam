import { describe, expect, it } from 'vitest';
import { CHALLENGE_IDS, CHALLENGES } from '../data/challenges.ts';
import { drawChallenge } from './challenges.ts';
import { deserialize, serialize } from './save.ts';
import { World } from './world.ts';

/** La mairie bâtie : le premier jour se lève. */
function builtHall(seed = 1): World {
  const world = new World(seed);

  world.player.inventory.add('wood', 25);
  world.player.inventory.add('stone', 12);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  world.tick();
  return world;
}

describe('défi du jour', () => {
  it('un défi par jour, jamais deux fois de suite le même, et tous finissent par sortir', () => {
    const seen = new Set<string>();

    for (let day = 1; day < 60; day += 1) {
      const today = drawChallenge(9, day);

      seen.add(today);
      if (day > 1) expect(today).not.toBe(drawChallenge(9, day - 1));
      expect(drawChallenge(9, day)).toBe(today);
    }
    expect(seen.size).toBe(CHALLENGE_IDS.length);
  });

  it('le premier jour se lève avec son défi ; l’aube suivante en tire un autre', () => {
    const world = builtHall();

    expect(world.challenge()).toMatchObject({ have: 0, done: false });
    expect(world.challenge()!.id).toBe(drawChallenge(world.seed, 1));

    while (world.clock()?.phase !== 'night') world.tick();
    while (world.clock()?.phase !== 'day') world.tick();
    world.tick();
    expect(world.challenge()!.id).toBe(drawChallenge(world.seed, 2));
  });

  it('se compte, paie une seule fois, et survit au rechargement', () => {
    // Une graine dont le premier défi est une récolte de bois.
    let seed = 1;

    while (drawChallenge(seed, 1) !== 'woodcutter') seed += 1;

    const world = builtHall(seed);
    const town = world.townStock()!;
    const food = town.count('food');
    const prestige = world.prestige;
    const goal = CHALLENGES.woodcutter.goal.count;
    let paid = 0;

    world.events.on('challengeCompleted', () => (paid += 1));

    // Adam coupe : on lui fait récolter des arbres jusqu'au but, par la vraie récolte.
    const tree = (() => {
      for (let r = 1; r < 40; r += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            const tx = Math.floor(world.player.x / 32) + dx;
            const ty = Math.floor(world.player.y / 32) + dy;

            if (world.resources.at(tx, ty)?.id === 'tree') return { tx, ty };
          }
        }
      }
      throw new Error('pas d’arbre');
    })();

    world.player.x = (tree.tx + 1.5) * 32;
    world.player.y = (tree.ty + 0.5) * 32;

    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect(loaded.challenge()).toEqual(world.challenge());

    for (let i = 0; i < 20 * 120 && world.challenge()!.have < goal; i += 1) {
      world.tick();
      // Le sac se vide à la main : seul le compte du défi nous intéresse.
      world.player.inventory.remove('wood', world.player.inventory.count('wood'));
      if (!world.resources.at(tree.tx, tree.ty)) {
        // L'arbre tombé, Adam passe au suivant.
        for (let r = 1; r < 40; r += 1) {
          const next = [...Array(2 * r + 1).keys()]
            .flatMap((a) => [...Array(2 * r + 1).keys()].map((b) => ({ tx: tree.tx + a - r, ty: tree.ty + b - r })))
            .find(({ tx, ty }) => world.resources.at(tx, ty)?.id === 'tree');

          if (next) {
            tree.tx = next.tx;
            tree.ty = next.ty;
            world.player.x = (tree.tx + 1.5) * 32;
            world.player.y = (tree.ty + 0.5) * 32;
            break;
          }
        }
      }
    }

    expect(world.challenge()).toMatchObject({ have: goal, done: true });
    expect(paid).toBe(1);
    expect(town.count('food')).toBeGreaterThan(food);
    expect(world.prestige).toBe(prestige + CHALLENGES.woodcutter.prestige);
  });
});
