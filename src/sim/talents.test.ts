import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../data/levels.ts';
import { TALENT_IDS, TALENT_OFFER, TALENTS, type TalentId } from '../data/talents.ts';
import { validatePrototypes } from '../data/validate.ts';
import { xpForLevel } from './levels.ts';
import { INVENTORY_CAPACITY } from './player.ts';
import { decodeSave, deserialize, encodeSave, serialize } from './save.ts';
import { cleanTalents, defaultTalents, drawTalents, pendingTalents } from './talents.ts';
import { World } from './world.ts';

const SEED = 31;

/** Un monde où Adam vient d'atteindre `level`, sans talent choisi. */
function atLevel(level: number, seed = SEED): World {
  const world = new World(seed);

  world.player.xp = xpForLevel(level);
  return world;
}

/** Choisit la carte `index` de l'offre en cours et rend le talent pris. */
function choose(world: World, index = 0): TalentId {
  const talent = world.talentOffer()!.choices[index]!;

  world.push({ type: 'chooseTalent', index });
  world.tick();
  return talent;
}

describe('talents d’Adam', () => {
  it('les données sont valides', () => {
    expect(validatePrototypes()).toEqual([]);
  });

  it('trois talents distincts, tirés de la seed et du niveau', () => {
    const seen = new Set<TalentId>();

    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      const choices = drawTalents(42, level, []);

      expect(choices).toHaveLength(TALENT_OFFER.choices);
      expect(new Set(choices).size).toBe(TALENT_OFFER.choices);
      expect(drawTalents(42, level, [])).toEqual(choices);
      for (const id of choices) seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(TALENT_OFFER.choices);
    expect(drawTalents(42, 2, [])).not.toEqual(drawTalents(43, 2, []));
  });

  it('un talent au bout de son max ne revient plus, et il reste trois cartes jusqu’au dernier niveau', () => {
    const full: TalentId[] = Array.from({ length: TALENTS.deepPockets.max }, () => 'deepPockets');

    for (let level = 2; level < 40; level += 1) expect(drawTalents(5, level, full)).not.toContain('deepPockets');

    // Le pire cas : on reprend toujours la première carte, jusqu'au niveau max.
    const taken: TalentId[] = [];

    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      const choices = drawTalents(9, level, taken);

      expect(choices).toHaveLength(TALENT_OFFER.choices);
      taken.push(choices[0]!);
    }
  });

  it('passer un niveau ouvre une offre, que « Plus tard » garde', () => {
    const world = atLevel(2);
    const offer = world.talentOffer();

    expect(offer).toMatchObject({ level: 2, pending: 1 });
    expect(offer!.choices).toEqual(drawTalents(world.seed, 2, []));
    for (let i = 0; i < 100; i += 1) world.tick();
    expect(world.talentOffer()).toEqual(offer);
    expect(atLevel(1).talentOffer()).toBeNull();
  });

  it('chooseTalent prend la carte, l’effet passe par World.bonus', () => {
    const world = atLevel(2);
    const events: TalentId[] = [];

    world.events.on('talentChosen', ({ talent }) => events.push(talent));

    const talent = choose(world, 1);
    const { stat, amount } = TALENTS[talent].effect;

    expect(world.player.talents).toEqual([talent]);
    expect(events).toEqual([talent]);
    expect(world.bonus(stat)).toBeCloseTo(new World(SEED).bonus(stat) + amount);
    expect(world.talentOffer()).toBeNull();
  });

  it('une carte hors de l’offre, ou sans offre, est ignorée', () => {
    const world = atLevel(2);

    world.push({ type: 'chooseTalent', index: 5 });
    world.tick();
    expect(world.player.talents).toEqual([]);

    const flat = atLevel(1);

    flat.push({ type: 'chooseTalent', index: 0 });
    flat.tick();
    expect(flat.player.talents).toEqual([]);
  });

  it('chaque talent est un modificateur additif lu par World.bonus, qui se cumule', () => {
    for (const id of TALENT_IDS) {
      const world = new World(SEED);
      const { stat, amount } = TALENTS[id].effect;
      const before = world.bonus(stat);

      world.player.talents.push(id);
      expect(world.bonus(stat)).toBeCloseTo(before + amount);
      world.player.talents.push(id);
      expect(world.bonus(stat)).toBeCloseTo(before + 2 * amount);
    }
  });

  it('plusieurs niveaux d’un coup : une offre par niveau, dans l’ordre', () => {
    const world = atLevel(4);

    expect(world.talentOffer()).toMatchObject({ level: 2, pending: 3 });
    choose(world);
    expect(world.talentOffer()).toMatchObject({ level: 3, pending: 2 });
    choose(world);
    choose(world);
    expect(world.talentOffer()).toBeNull();
    expect(world.player.talents).toHaveLength(3);
  });

  it('« Poches profondes » agrandit le sac sur-le-champ, et après rechargement', () => {
    let seed = 1;

    while (!drawTalents(seed, 2, []).includes('deepPockets')) seed += 1;

    const world = atLevel(2, seed);

    choose(world, world.talentOffer()!.choices.indexOf('deepPockets'));
    expect(world.player.inventory.capacity).toBe(INVENTORY_CAPACITY + TALENTS.deepPockets.effect.amount);

    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect(loaded.player.talents).toEqual(['deepPockets']);
    expect(loaded.player.inventory.capacity).toBe(INVENTORY_CAPACITY + TALENTS.deepPockets.effect.amount);
  });

  it('« Infirmier » : au calme, Adam reprend ses PV plus vite', () => {
    const healed = (talents: TalentId[]): number => {
      const world = new World(SEED);

      world.player.talents.push(...talents);
      world.player.hp = 1;
      for (let i = 0; i < 20 * 8; i += 1) world.tick();
      return world.player.hp;
    };

    expect(healed(['medic', 'medic'])).toBeGreaterThan(healed([]));
  });

  it('les talents pris se sauvegardent', () => {
    const world = atLevel(3);

    choose(world);
    choose(world);

    const loaded = decodeSave(encodeSave(world, 1));

    if (!loaded.ok) throw new Error('relecture');
    expect(loaded.world.player.talents).toEqual(world.player.talents);
    expect(loaded.world.talentOffer()).toBeNull();
  });

  it('une ancienne sauvegarde convertit ses niveaux en talents par défaut', () => {
    const world = atLevel(5);
    const old = JSON.parse(JSON.stringify(serialize(world))) as { player: Record<string, unknown> };

    delete old.player['talents'];

    const legacy = decodeSave(JSON.stringify({ version: 11, savedAt: 1, state: old }));

    if (!legacy.ok) throw new Error('ancienne sauvegarde refusée');
    expect(legacy.world.player.talents).toEqual(defaultTalents(5));
    expect(legacy.world.player.talents).toHaveLength(4);
    expect(legacy.world.player.talents[0]).toBe(TALENT_OFFER.defaults[0]);
    expect(legacy.world.talentOffer()).toBeNull();
    // Les anciens dégâts d'arc ne sont pas perdus : le premier talent par défaut les rend.
    expect(legacy.world.bonus('bowDamage')).toBeGreaterThan(0);
  });

  it('par défaut, jamais au-delà du max d’un talent ; une sauvegarde abîmée est nettoyée', () => {
    const many = defaultTalents(MAX_LEVEL);

    expect(many).toHaveLength(MAX_LEVEL - 1);
    for (const id of TALENT_IDS) expect(many.filter((taken) => taken === id).length).toBeLessThanOrEqual(TALENTS[id].max);
    expect(defaultTalents(1)).toEqual([]);
    expect(cleanTalents(['medic', 'nope', 'medic', 'medic', 'medic', 'medic', 'greenThumb'], 10)).toEqual(['medic', 'medic', 'medic', 'medic', 'greenThumb']);
    expect(cleanTalents(['medic', 'greenThumb'], 1)).toEqual(['medic']);
    expect(pendingTalents(4, ['medic'])).toBe(2);
  });
});
