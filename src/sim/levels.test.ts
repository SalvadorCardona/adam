import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { ENEMIES } from '../data/enemies.ts';
import { BASE_XP, KILL_XP, LEVEL_GAINS, MAX_LEVEL, XP_SHARE } from '../data/levels.ts';
import { RESEARCH } from '../data/research.ts';
import { TALENTS } from '../data/talents.ts';
import { WEAPONS } from '../data/weapons.ts';
import { validatePrototypes } from '../data/validate.ts';
import { baseXp, levelHp, levelOf, levelProgress, xpForLevel, xpToNext } from './levels.ts';
import { PLAYER_MAX_HP } from './player.ts';
import { decodeSave, encodeSave, serialize } from './save.ts';
import type { Arrow, Mutant } from './types.ts';
import { World } from './world.ts';

const SEED = 21;

/** Un mutant posé à `tiles` tuiles d'Adam, hors de portée de son arc quand `tiles` > 6. */
function mutantAt(world: World, tiles: number, id = 9100): Mutant {
  const x = world.player.x + tiles * TILE_SIZE;
  const y = world.player.y;
  const mutant: Mutant = {
    kind: 'mutant',
    id,
    proto: 'mutant',
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: false,
    hp: ENEMIES.mutant.hp,
    age: 30,
    attackCooldown: 0,
    emerge: 0,
  };

  world.mobiles.set(id, mutant);
  return mutant;
}

/** Une flèche déjà sur le mutant : le tick suivant la fait toucher. */
function arrowOn(world: World, mutant: Mutant, shooter?: 'tower' | 'companion'): void {
  const arrow: Arrow = {
    kind: 'arrow',
    id: 9200,
    x: mutant.x - 2,
    y: mutant.y,
    prevX: mutant.x - 2,
    prevY: mutant.y,
    facing: 'right',
    moving: true,
    vx: 2,
    vy: 0,
    ttl: 10,
    damage: 99,
    ...(shooter && { shooter }),
  };

  world.mobiles.set(arrow.id, arrow);
}

describe('Niveaux d’Adam', () => {
  it('les données sont valides', () => {
    expect(validatePrototypes()).toEqual([]);
  });

  it('la courbe demande plus à chaque niveau et plafonne', () => {
    for (let level = 1; level < MAX_LEVEL - 1; level += 1) expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level));
    expect(levelOf(0)).toBe(1);
    expect(levelOf(xpForLevel(2) - 1)).toBe(1);
    expect(levelOf(xpForLevel(2))).toBe(2);
    expect(levelOf(xpForLevel(MAX_LEVEL))).toBe(MAX_LEVEL);
    expect(levelOf(10_000_000)).toBe(MAX_LEVEL);
    expect(levelProgress(10_000_000)).toEqual({ level: MAX_LEVEL, into: 1, needed: 1 });
    expect(levelProgress(xpForLevel(3) + 5)).toEqual({ level: 3, into: 5, needed: xpToNext(3) });
  });

  it('démarre au niveau 1, sans bonus', () => {
    const world = new World(SEED);

    expect(world.player.xp).toBe(0);
    expect(world.level()).toBe(1);
    expect(world.maxHp()).toBe(PLAYER_MAX_HP);
    expect(world.bonus('bowDamage')).toBe(0);
  });

  it('un mutant abattu par l’arc d’Adam rapporte son XP', () => {
    const world = new World(SEED);
    const events: { amount: number; total: number }[] = [];

    world.events.on('xpGained', (event) => events.push(event));
    mutantAt(world, 3);
    for (let i = 0; i < 400 && world.mobiles.has(9100); i += 1) world.tick();

    expect(world.mobiles.has(9100)).toBe(false);
    expect(events).toMatchObject([{ amount: KILL_XP.mutant, total: KILL_XP.mutant }]);
    expect(world.player.xp).toBe(KILL_XP.mutant);
  });

  it('les tours n’en donnent pas, les compagnons la moitié', () => {
    const world = new World(SEED);

    arrowOn(world, mutantAt(world, 20), 'tower');
    world.tick();
    expect(world.mobiles.has(9100)).toBe(false);
    expect(world.player.xp).toBe(0);

    arrowOn(world, mutantAt(world, 20, 9101), 'companion');
    world.tick();
    expect(world.player.xp).toBe(Math.round(KILL_XP.mutant * XP_SHARE.companion));

    arrowOn(world, mutantAt(world, 20, 9102));
    world.tick();
    expect(world.player.xp).toBe(Math.round(KILL_XP.mutant * XP_SHARE.companion) + KILL_XP.mutant);
  });

  it('une base abattue et son chef rapportent plus qu’un mutant', () => {
    expect(baseXp(1, 'base')).toBe(BASE_XP[0].base);
    expect(baseXp(99, 'chief')).toBe(BASE_XP[BASE_XP.length - 1]!.chief);
    expect(BASE_XP[0].base).toBeGreaterThan(KILL_XP.brute);
  });

  it('passer un niveau soigne Adam, annonce les PV et laisse un talent à choisir', () => {
    const world = new World(SEED);
    const ups: { level: number; maxHp: number }[] = [];

    world.events.on('levelUp', (event) => ups.push(event));
    world.player.xp = xpForLevel(2) - 1;
    world.player.hp = 3;
    arrowOn(world, mutantAt(world, 20));
    world.tick();

    expect(world.level()).toBe(2);
    expect(ups).toMatchObject([{ level: 2, maxHp: LEVEL_GAINS.maxHp }]);
    expect(world.maxHp()).toBe(PLAYER_MAX_HP + LEVEL_GAINS.maxHp);
    expect(world.player.hp).toBe(world.maxHp());
    // Aucun bonus fixe : les statistiques attendent le talent choisi.
    expect(world.bonus('bowDamage')).toBe(0);
    expect(world.talentOffer()).toMatchObject({ level: 2, pending: 1 });
    expect(levelHp(5)).toBe(4 * LEVEL_GAINS.maxHp);
  });

  it('plusieurs niveaux d’un coup : un seul message, tous les gains', () => {
    const world = new World(SEED);
    const ups: { level: number; maxHp: number }[] = [];

    world.events.on('levelUp', (event) => ups.push(event));
    (world as unknown as { gainXp(amount: number, shooter: string, x: number, y: number): void }).gainXp(xpForLevel(4), 'player', 0, 0);

    expect(ups).toHaveLength(1);
    expect(ups[0]).toMatchObject({ level: 4, maxHp: 3 * LEVEL_GAINS.maxHp });
    expect(world.talentOffer()?.pending).toBe(3);
  });

  it('au niveau maximum, l’XP ne monte plus', () => {
    const world = new World(SEED);

    world.player.xp = xpForLevel(MAX_LEVEL);
    arrowOn(world, mutantAt(world, 20));
    world.tick();
    expect(world.player.xp).toBe(xpForLevel(MAX_LEVEL));
    expect(world.level()).toBe(MAX_LEVEL);
  });

  it('se cumule avec le labo sans le remplacer', () => {
    const world = new World(SEED);
    const research = RESEARCH.sharpArrows;

    world.researchDone.push('sharpArrows');
    const labo = world.bonus('bowDamage');

    expect(labo).toBe(research.effect.amount);
    world.player.xp = xpForLevel(5);
    world.player.talents.push('piercingArrows', 'piercingArrows');
    expect(world.bonus('bowDamage')).toBeCloseTo(labo + 2 * TALENTS.piercingArrows.effect.amount);
    expect(WEAPONS.bow.damage + world.bonus('bowDamage')).toBeGreaterThan(WEAPONS.bow.damage + labo);
  });

  it('se sauvegarde, et une ancienne partie démarre au niveau 1', () => {
    const world = new World(SEED);

    world.player.xp = xpForLevel(4) + 7;

    const loaded = decodeSave(encodeSave(world, 1));

    if (!loaded.ok) throw new Error('relecture');
    const restored = loaded.world;

    expect(restored.player.xp).toBe(xpForLevel(4) + 7);
    expect(restored.level()).toBe(4);

    const old = JSON.parse(JSON.stringify(serialize(world), (_key, value: unknown) => value)) as {
      player: Record<string, unknown>;
    };

    delete old.player['xp'];

    const legacy = decodeSave(JSON.stringify({ version: 9, savedAt: 1, state: old }));

    if (!legacy.ok) throw new Error('ancienne sauvegarde refusée');
    expect(legacy.world.level()).toBe(1);
  });
});
