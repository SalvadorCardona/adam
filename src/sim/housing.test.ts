import { describe, expect, it } from "vitest";
import { TILE_SIZE } from "../core/grid.ts";
import { BUILDINGS, bedsOf } from "../data/buildings.ts";
import { DAY_CYCLE } from "../data/dayNight.ts";
import { HAPPINESS, MOOD } from "../data/housing.ts";
import { AGES } from "../data/inhabitants.ts";
import type { ItemId } from "../data/items.ts";
import { CYCLE_TICKS } from "./dayNight.ts";
import {
  assignBeds,
  freshHousing,
  moodCauses,
  moodOf,
  moodPace,
  nightlyMood,
  type Lodging,
  type Sleeper,
} from "./housing.ts";
import { freshNeeds } from "./needs.ts";
import { goalProgress } from "./objectives.ts";
import { decodeSave, encodeSave, type SavedEntity } from "./save.ts";
import { isWalkable, terrainAt } from "./terrain.ts";
import type { Worker } from "./types.ts";
import { walkToward, wanderFrom } from "./workers.ts";
import { World } from "./world.ts";
import type { Laborer } from "./world.ts";

/** Une seed dont la mairie a une plaine sans eau autour et au sud. */
function landSeed(): { world: World; hx: number; hy: number } {
  for (let seed = 1; seed < 400; seed += 1) {
    const world = new World(seed);
    const hall = world.entities.get(world.townHallId)!;
    let dry = true;

    for (let ty = hall.ty - 1; ty < hall.ty + 16 && dry; ty += 1) {
      for (let tx = hall.tx - 12; tx < hall.tx + 12 && dry; tx += 1) {
        if (!isWalkable(terrainAt(world.seed, tx, ty))) dry = false;
      }
    }
    if (dry) return { world, hx: hall.tx, hy: hall.ty };
  }
  throw new Error("aucune seed testable — la génération de terrain a changé");
}

/**
 * Une colonie au matin : la mairie et de quoi manger et boire, une maison
 * des constructeurs (quatre porteurs, quatre lits) et un poste de
 * construction (quatre bâtisseurs, aucun lit). Huit ouvriers, quatre lits.
 */
function colony(): { world: World; hx: number; hy: number } {
  const { world, hx, hy } = landSeed();
  const state = world.snapshot();
  let nextId = state.nextId;
  const at = (
    proto: "builderHouse" | "constructionPost",
    dx: number,
    dy: number,
  ) => ({
    id: nextId++,
    proto,
    tx: hx + dx,
    ty: hy + dy,
    width: BUILDINGS[proto].width,
    height: BUILDINGS[proto].height,
  });
  const built = { hp: 100, level: 1, paused: false };
  const town: Partial<Record<ItemId, number>> = { food: 400, water: 400 };
  const entities: SavedEntity[] = [
    {
      kind: "townHall",
      id: world.townHallId,
      proto: "townHall",
      tx: hx,
      ty: hy,
      width: 3,
      height: 3,
      store: town,
      ...built,
      hp: BUILDINGS.townHall.hp,
      staff: 0,
    },
    {
      ...at("builderHouse", 2, 6),
      kind: "house",
      store: {},
      ...built,
      staff: BUILDINGS.builderHouse.workers,
    },
    {
      ...at("constructionPost", -9, 4),
      kind: "yard",
      store: {},
      ...built,
      staff: BUILDINGS.constructionPost.workers,
    },
  ];

  // Adam à l'écart, immobile.
  state.player = {
    ...state.player,
    x: (hx - 20) * TILE_SIZE,
    y: (hy - 20) * TILE_SIZE,
  };
  state.entities = entities;
  state.nextId = nextId;
  state.mobiles = [];
  state.colonists =
    BUILDINGS.builderHouse.workers + BUILDINGS.constructionPost.workers;
  state.tick = Math.max(state.tick, 1);
  state.cycleStartTick = state.tick;

  const restored = World.restore(state);

  restored.tick();
  return { world: restored, hx, hy };
}

function laborers(world: World): Laborer[] {
  return [...world.mobiles.values()].filter(
    (mobile): mobile is Laborer =>
      mobile.kind === "worker" ||
      mobile.kind === "lumberjack" ||
      mobile.kind === "forester",
  );
}

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) world.tick();
}

/** Saute jusqu'à la prochaine aube, sans traverser la nuit et ses vagues : l'aube se lève au tick suivant. */
function nextDawn(world: World): void {
  const clock = world.clock()!;
  const dawnOffset = DAY_CYCLE.day + DAY_CYCLE.dusk + DAY_CYCLE.night;
  const ahead =
    clock.offset < dawnOffset
      ? dawnOffset - clock.offset
      : CYCLE_TICKS - clock.offset + dawnOffset;

  world.cycleStartTick -= ahead - 1;
  world.tick();
  expect(world.clock()).toMatchObject({ phase: "dawn", elapsed: 0 });
}

/** Saute au crépuscule de ce cycle : les ouvriers sans travail vont dormir. */
function toDusk(world: World): void {
  const clock = world.clock()!;

  world.cycleStartTick -= DAY_CYCLE.day - clock.offset - 1;
  world.tick();
  expect(world.clock()?.phase).toBe("dusk");
}

/** Pose une Maison en (tx, ty) et la livre d'un coup, depuis le sac d'Adam : le dernier objet livré l'achève. */
function buildHome(world: World, tx: number, ty: number): void {
  const { x, y } = world.player;

  world.player.x = world.player.prevX = (tx + 1) * TILE_SIZE;
  world.player.y = world.player.prevY = (ty + 2.5) * TILE_SIZE;
  expect(world.canPlace("home", tx, ty)).toBeNull();
  world.push({ type: "placeBuilding", building: "home", tx, ty });
  world.tick();

  const site = [...world.entities.values()].find(
    (entity) => entity.kind === "site" && entity.proto === "home",
  )!;

  for (const [item, amount] of Object.entries(BUILDINGS.home.cost) as [
    ItemId,
    number,
  ][])
    world.player.inventory.add(item, amount);
  world.push({ type: "transferToSite", id: site.id });
  world.tick();
  expect(world.entities.get(site.id)?.kind).toBe("house");
  world.player.x = world.player.prevX = x;
  world.player.y = world.player.prevY = y;
}

/** Jamais deux dormeurs dans un lit : aucune maison n'a plus de dormeurs que de lits. */
function expectNoSharedBed(world: World): void {
  for (const entity of world.entities.values()) {
    if (entity.kind === "site") continue;
    expect(world.sleepersIn(entity.id).length).toBeLessThanOrEqual(
      bedsOf(entity.proto),
    );
  }
}

describe("Maison — données", () => {
  it("se bâtit dès le départ, offre quatre lits, et n’emploie personne", () => {
    expect(BUILDINGS.home).toMatchObject({
      kind: "house",
      menu: true,
      plan: false,
      workers: 0,
    });
    expect(bedsOf("home")).toBe(4);
    // Le dortoir des porteurs reste un logement ; la mairie n'en est pas un.
    expect(bedsOf("builderHouse")).toBe(BUILDINGS.builderHouse.workers);
    expect(bedsOf("townHall")).toBe(0);
  });
});

describe("attribution des lits", () => {
  const sleeper = (
    id: number,
    x: number,
    bed: number | null = null,
  ): Sleeper => ({ id, bed, x, y: 0 });
  const lodging = (id: number, x: number, beds: number): Lodging => ({
    id,
    beds,
    x,
    y: 0,
  });

  it("le lit libre le plus proche du travail, et jamais plus de dormeurs que de lits", () => {
    const beds = assignBeds(
      [sleeper(1, 0), sleeper(2, 100), sleeper(3, 100), sleeper(4, 100)],
      [lodging(10, 0, 1), lodging(11, 100, 2)],
    );

    expect(beds.get(1)).toBe(10);
    expect(beds.get(2)).toBe(11);
    expect(beds.get(3)).toBe(11);
    // Trois lits, quatre dormeurs : le dernier dort dehors.
    expect(beds.get(4)).toBeNull();
  });

  it("stable : un dormeur garde son lit même si un autre arrive plus près", () => {
    const beds = assignBeds(
      [sleeper(1, 500, 10), sleeper(2, 0)],
      [lodging(10, 0, 1), lodging(11, 500, 1)],
    );

    expect(beds.get(1)).toBe(10);
    expect(beds.get(2)).toBe(11);
  });

  it("un lit dans une maison tombée — absente — se libère, et le dormeur en reprend un autre", () => {
    const beds = assignBeds([sleeper(1, 0, 99)], [lodging(10, 0, 1)]);

    expect(beds.get(1)).toBe(10);
  });

  it("déterministe : l’ordre de la liste ne change rien", () => {
    const sleepers = [sleeper(3, 50), sleeper(1, 50), sleeper(2, 50)];
    const lodgings = [lodging(11, 60, 1), lodging(10, 40, 1)];
    const a = assignBeds(sleepers, lodgings);
    const b = assignBeds([...sleepers].reverse(), [...lodgings].reverse());

    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    // À distance égale, le plus petit id d'abord : 1 et 2 ont un lit, 3 dort dehors.
    expect(a.get(3)).toBeNull();
  });
});

describe("bonheur", () => {
  it("une nuit dehors le fait baisser, une nuit dans un lit remonter, entre 0 et le maximum", () => {
    expect(moodCauses({ bed: null })).toEqual(["outside"]);
    expect(moodCauses({ bed: 7 })).toEqual(["bed"]);
    expect(nightlyMood(HAPPINESS.start, ["outside"])).toBe(
      HAPPINESS.start + MOOD.outside,
    );
    expect(nightlyMood(HAPPINESS.start, ["bed"])).toBe(
      HAPPINESS.start + MOOD.bed,
    );
    expect(nightlyMood(2, ["outside"])).toBe(0);
    expect(nightlyMood(HAPPINESS.max - 1, ["bed"])).toBe(HAPPINESS.max);
  });

  it("les seuils : content, neutre, malheureux — et l’allure suit, sans délai", () => {
    expect(moodOf(HAPPINESS.contentFrom)).toBe("content");
    expect(moodOf(HAPPINESS.start)).toBe("neutral");
    expect(moodOf(HAPPINESS.unhappyBelow)).toBe("neutral");
    expect(moodOf(HAPPINESS.unhappyBelow - 1)).toBe("unhappy");
    expect(moodPace(HAPPINESS.unhappyBelow - 1)).toBe(HAPPINESS.unhappyPace);
    expect(moodPace(HAPPINESS.unhappyBelow)).toBe(1);
  });

  it("un malheureux marche moins vite, et retrouve son pas au-dessus du seuil", () => {
    const stride = (happiness: number): number => {
      const porter: Worker = {
        kind: "worker",
        id: 1,
        sex: "male",
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        facing: "right",
        moving: false,
        homeId: 1,
        exMutant: false,
        grown: false,
        age: 30,
        logistician: false,
        builder: false,
        survivor: false,
        free: false,
        build: null,
        inside: false,
        job: null,
        searchTicks: 0,
        ...wanderFrom(0, 0),
        ...freshNeeds(),
        ...freshHousing(),
        happiness,
      };

      walkToward(porter, 1000, 0, 0.05);
      return porter.x;
    };

    expect(stride(HAPPINESS.unhappyBelow - 1)).toBeCloseTo(
      stride(HAPPINESS.start) * HAPPINESS.unhappyPace,
    );
    expect(stride(HAPPINESS.unhappyBelow)).toBeCloseTo(stride(HAPPINESS.start));
  });
});

describe("Habitation", () => {
  it("les lits suivent les maisons : le compte « logés / population » monte avec chaque Maison", () => {
    const { world, hx, hy } = colony();
    const people = laborers(world);

    expect(people).toHaveLength(8);
    expect(world.housing()).toEqual({ housed: 4, population: 8, beds: 4 });
    // Les porteurs ont leur lit dans leur maison même : la plus proche de leur travail.
    for (const porter of people.filter(
      (mobile) => mobile.kind === "worker" && !mobile.builder,
    )) {
      expect(porter.bed).toBe(porter.homeId);
    }

    buildHome(world, hx + 7, hy + 11);
    run(world, 20);
    expect(world.housing()).toEqual({ housed: 8, population: 8, beds: 8 });
    expectNoSharedBed(world);
  });

  it("plus d’habitants que de lits ne bloque rien, et jamais deux dans le même lit", () => {
    const { world } = colony();

    run(world, 200);
    expect(laborers(world)).toHaveLength(8);
    expect(world.housing().housed).toBe(4);
    expectNoSharedBed(world);
  });
});

describe("dormir", () => {
  it("à la nuit, ceux qui ont un lit y entrent, les autres dorment dehors devant leur travail", () => {
    const { world } = colony();

    toDusk(world);
    run(world, 260);

    const people = laborers(world);
    const bedded = people.filter((mobile) => mobile.bed !== null);
    const outside = people.filter((mobile) => mobile.bed === null);

    expect(bedded).toHaveLength(4);
    expect(outside).toHaveLength(4);
    for (const mobile of bedded)
      expect(mobile).toMatchObject({ inside: true, sleepingOut: false });
    for (const mobile of outside) {
      expect(mobile).toMatchObject({ inside: false, sleepingOut: true });
      expect(world.occupation(mobile)).toEqual({ kind: "outside" });
      // Un dormeur n'est pas un inactif.
      expect(world.isIdle(mobile)).toBe(false);
    }
  });

  it("la nuit, ceux qui dorment ne sont comptés ni au travail ni inactifs : ils sont au repos", () => {
    const { world } = colony();

    toDusk(world);
    run(world, 260);

    const people = laborers(world);

    expect(people.every((mobile) => mobile.inside || mobile.sleepingOut)).toBe(true);
    expect(world.census()).toMatchObject({ working: 0, idle: 0, resting: people.length });
  });

  it("pendant une vague, il rentre s’abriter chez son employeur, lit ou pas", () => {
    const { world, hx, hy } = colony();

    toDusk(world);
    run(world, 260);
    world.mobiles.set(99_999, {
      kind: "mutant",
      id: 99_999,
      proto: "mutant",
      x: (hx - 30) * TILE_SIZE,
      y: (hy - 30) * TILE_SIZE,
      prevX: (hx - 30) * TILE_SIZE,
      prevY: (hy - 30) * TILE_SIZE,
      facing: "down",
      moving: false,
      hp: 999,
      age: 30,
      attackCooldown: 0,
      emerge: 0,
    });
    run(world, 200);
    for (const mobile of laborers(world))
      expect(mobile).toMatchObject({ inside: true, sleepingOut: false });
  });

  it("trois nuits dehors font un malheureux, plus lent ; des maisons, et il retrouve le sourire et son pas", () => {
    const { world, hx, hy } = colony();
    const homeless = () =>
      laborers(world).filter((mobile) => mobile.bed === null);

    expect(homeless()).toHaveLength(4);

    for (let night = 1; night <= 3; night += 1) {
      nextDawn(world);
      for (const mobile of homeless())
        expect(mobile.happiness).toBe(HAPPINESS.start + night * MOOD.outside);
    }
    for (const mobile of laborers(world)) {
      if (mobile.bed === null) expect(moodOf(mobile.happiness)).toBe("unhappy");
      else
        expect(mobile.happiness).toBe(
          Math.min(HAPPINESS.max, HAPPINESS.start + 3 * MOOD.bed),
        );
    }
    expect(world.unhappyInhabitants()).toHaveLength(4);

    const sad = homeless();

    buildHome(world, hx + 7, hy + 11);
    run(world, 20);
    for (const mobile of sad) expect(mobile.bed).not.toBeNull();

    nextDawn(world);
    for (const mobile of sad) {
      expect(mobile.happiness).toBe(
        HAPPINESS.start + 3 * MOOD.outside + MOOD.bed,
      );
      expect(moodPace(mobile.happiness)).toBe(1);
    }
    expect(world.unhappyInhabitants()).toHaveLength(0);
  });

  it("Adam garde sa vitesse, quel que soit le moral de la ville", () => {
    const strideOfAdam = (happiness: number): number => {
      const { world } = colony();

      for (const mobile of laborers(world)) mobile.happiness = happiness;

      const x = world.player.x;

      world.push({ type: "setMoveAxis", x: 1, y: 0 });
      run(world, 10);
      return world.player.x - x;
    };

    expect(strideOfAdam(0)).toBe(strideOfAdam(HAPPINESS.max));
  });
});

describe("Habitation — sauvegarde", () => {
  it("le bonheur et les lits se sauvegardent", () => {
    const { world } = colony();

    nextDawn(world);

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);
    for (const mobile of laborers(world)) {
      expect(decoded.world.mobiles.get(mobile.id)).toMatchObject({
        happiness: mobile.happiness,
        bed: mobile.bed,
      });
    }
  });

  it("une sauvegarde d’avant les maisons : des habitants neutres, et leurs lits attribués au chargement", () => {
    const { world } = colony();
    const file = JSON.parse(encodeSave(world, 0)) as {
      state: { mobiles: Record<string, unknown>[] };
    };

    for (const mobile of file.state.mobiles) {
      delete mobile["happiness"];
      delete mobile["bed"];
      delete mobile["sleepingOut"];
    }

    const decoded = decodeSave(JSON.stringify(file));

    if (!decoded.ok) throw new Error(decoded.reason);

    const people = laborers(decoded.world);

    expect(people).toHaveLength(8);
    for (const mobile of people) expect(mobile.happiness).toBe(HAPPINESS.start);
    expect(decoded.world.housing()).toEqual({
      housed: 4,
      population: 8,
      beds: 4,
    });
  });

  it("déterministe : deux mondes, mêmes commandes, mêmes lits et même moral", () => {
    const play = (): string => {
      const { world, hx, hy } = colony();

      nextDawn(world);
      buildHome(world, hx + 7, hy + 11);
      toDusk(world);
      run(world, 200);
      nextDawn(world);
      return JSON.stringify(
        laborers(world).map(({ id, bed, happiness, x, y }) => ({
          id,
          bed,
          happiness,
          x,
          y,
        })),
      );
    };

    expect(play()).toBe(play());
  });
});

describe("Bonheur de la ville", () => {
  /** La somme des jauges, refaite à la main : celle que le monde doit trouver. */
  const sum = (world: World): number =>
    laborers(world).reduce((total, mobile) => total + mobile.happiness, 0);

  it("la somme des jauges des habitants, Adam exclu, avec la moyenne et les malheureux", () => {
    const { world } = colony();
    const people = laborers(world);

    expect(world.happiness()).toEqual({
      total: 8 * HAPPINESS.start,
      population: 8,
      average: HAPPINESS.start,
      unhappy: 0,
    });

    // Adam n'a pas de jauge : son moral ne compte pas, même s'il en avait un.
    (world.player as unknown as { happiness: number }).happiness = 0;
    people[0]!.happiness = 10;
    people[1]!.happiness = 90;
    expect(world.happiness()).toEqual({
      total: sum(world),
      population: 8,
      average: Math.round(sum(world) / 8),
      unhappy: 1,
    });
  });

  it("à chaque aube : des lits le font monter, la nuit dehors baisser — et une Maison change le sens", () => {
    const { world, hx, hy } = colony();
    const changes: { from: number; to: number }[] = [];

    world.events.on("happinessChanged", (change) => changes.push(change));

    // Quatre logés, quatre dehors : +15 × 4 − 10 × 4.
    nextDawn(world);
    expect(world.happiness().total).toBe(
      8 * HAPPINESS.start + 4 * MOOD.bed + 4 * MOOD.outside,
    );
    expect(changes).toEqual([
      { from: 8 * HAPPINESS.start, to: world.happiness().total },
    ]);

    // Une Maison : les huit dorment au lit, le total monte de huit nuits au lit.
    const before = world.happiness().total;

    buildHome(world, hx + 7, hy + 11);
    run(world, 20);
    nextDawn(world);
    expect(world.happiness().total).toBe(before + 4 * MOOD.bed + 4 * MOOD.bed);
    expect(changes.at(-1)).toEqual({
      from: before,
      to: world.happiness().total,
    });
    expect(world.happiness().total).toBe(sum(world));
  });

  it("laisser des habitants dehors le fait baisser, nuit après nuit", () => {
    const { world } = colony();

    for (const mobile of laborers(world))
      if (mobile.bed !== null) mobile.happiness = HAPPINESS.max;

    const totals: number[] = [];

    for (let night = 0; night < 3; night += 1) {
      nextDawn(world);
      totals.push(world.happiness().total);
    }
    expect(totals[1]!).toBeLessThan(totals[0]!);
    expect(totals[2]!).toBeLessThan(totals[1]!);
    expect(world.happiness().unhappy).toBe(4);
  });

  it("un enfant qui naît à la vie d’ouvrier l’augmente ; un habitant qui s’en va le fait baisser", () => {
    const { world, hx, hy } = colony();
    const id = 88_888;
    const x = (hx + 1) * TILE_SIZE;
    const y = (hy + 4) * TILE_SIZE;

    // L'enfant n'a pas de jauge : il ne compte pas encore.
    world.mobiles.set(id, {
      kind: "kid",
      id,
      sex: "female",
      x,
      y,
      prevX: x,
      prevY: y,
      facing: "down",
      moving: false,
      age: AGES.work - 1,
      homeId: world.townHallId,
      homeX: x,
      homeY: y,
      dirX: 0,
      dirY: 0,
      wanderTicks: 100,
      ...freshNeeds(),
    });
    expect(world.happiness().population).toBe(8);

    nextDawn(world);

    // Il a 14 ans : un ouvrier de plus, au bonheur neutre, qui compte dès son arrivée.
    const grown = world.mobiles.get(id)!;

    expect(grown.kind).toBe("worker");
    expect(world.happiness().population).toBe(9);
    expect(world.happiness().total).toBe(
      8 * HAPPINESS.start + 4 * MOOD.bed + 4 * MOOD.outside + HAPPINESS.start,
    );

    const leaving = laborers(world)[0]!;
    const total = world.happiness().total;

    world.mobiles.delete(leaving.id);
    expect(world.happiness().total).toBe(total - leaving.happiness);
    expect(world.happiness().population).toBe(8);
  });

  it("un objectif qui le demande le lit : « atteindre 420 de bonheur »", () => {
    const { world } = colony();
    const goal = { type: "happiness", count: 420 } as const;

    expect(goalProgress(world, goal)).toEqual({
      have: 8 * HAPPINESS.start,
      need: 420,
    });
    for (const mobile of laborers(world)) mobile.happiness = 60;
    expect(goalProgress(world, goal)).toEqual({ have: 420, need: 420 });
  });

  it("rien de plus à sauvegarder : une vieille sauvegarde le retrouve dès le chargement", () => {
    const { world } = colony();

    nextDawn(world);

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.happiness()).toEqual(world.happiness());

    // D'avant les maisons : pas de jauge dans le fichier, chacun repart neutre.
    const file = JSON.parse(encodeSave(world, 0)) as {
      state: { mobiles: Record<string, unknown>[] };
    };

    for (const mobile of file.state.mobiles) delete mobile["happiness"];

    const old = decodeSave(JSON.stringify(file));

    if (!old.ok) throw new Error(old.reason);
    expect(old.world.happiness()).toEqual({
      total: 8 * HAPPINESS.start,
      population: 8,
      average: HAPPINESS.start,
      unhappy: 0,
    });
  });

  it("déterministe : deux mondes, mêmes commandes, même Bonheur", () => {
    const play = (): number[] => {
      const { world, hx, hy } = colony();
      const totals: number[] = [];

      nextDawn(world);
      totals.push(world.happiness().total);
      buildHome(world, hx + 7, hy + 11);
      toDusk(world);
      run(world, 200);
      nextDawn(world);
      totals.push(world.happiness().total);
      return totals;
    };

    expect(play()).toEqual(play());
  });
});
