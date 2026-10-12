/**
 * Le suivi des succès (`data/achievements.ts`) : il lit le monde, compte ce
 * que seuls les événements racontent, et dit quand un succès tombe.
 *
 * Les statistiques « jauge » se lisent sur le monde à chaque `update()` ; les
 * statistiques « de colonie » se comptent ici, au fil des événements, dans
 * `Collection.run`. La collection est le seul état : seed + commandes ne
 * changent pas, et rien ici n'agit sur la partie — c'est `main.ts` qui offre
 * les récompenses.
 */

import { ACHIEVEMENTS, ACHIEVEMENT_IDS, isRareBuilding, type AchievementId, type StatId } from '../data/achievements.ts';
import { emptyRun, type Collection } from './collection.ts';
import type { World } from './world.ts';

export type Tally = Record<StatId, number>;

/** Les valeurs de toutes les statistiques, maintenant. */
export function tally(world: World, collection: Collection): Tally {
  const { stats } = collection.run;
  let buildings = 0;

  for (const entity of world.entities.values()) if (entity.kind !== 'site') buildings += 1;

  return {
    buildings,
    colonists: world.colonists,
    nights: world.stats.nightsSurvived,
    births: world.stats.births,
    level: world.level(),
    research: world.researchDone.length,
    quests: world.questsDone,
    companions: world.companionCount(),
    bases: world.enemyBases.filter((base) => base.hp <= 0).length,
    pieces: world.player.wardrobe.length,
    signal: world.victory ? 1 : 0,
    rares: collection.found.length,
    ...stats,
  };
}

/** Les succès dont la condition est remplie et qui ne sont pas encore obtenus. */
export function reached(values: Tally, collection: Collection): AchievementId[] {
  return ACHIEVEMENT_IDS.filter((id) => !collection.unlocked.includes(id) && values[ACHIEVEMENTS[id].stat] >= ACHIEVEMENTS[id].goal);
}

export interface TrackerHooks {
  /** Un succès vient d'être obtenu. */
  onUnlock: (id: AchievementId) => void;
  /** La collection a changé : à écrire. */
  onChange: () => void;
}

export class AchievementTracker {
  public readonly collection: Collection;

  private readonly world: World;
  private readonly hooks: TrackerHooks;

  public constructor(world: World, collection: Collection, hooks: TrackerHooks) {
    this.world = world;
    this.collection = collection;
    this.hooks = hooks;

    const { events } = world;
    const { stats } = collection.run;
    const bump = (stat: keyof typeof stats): void => {
      stats[stat] += 1;
      hooks.onChange();
    };

    events.on('mutantDied', () => bump('kills'));
    events.on('beastDied', () => bump('kills'));
    events.on('chestOpened', () => bump('chests'));
    events.on('traded', () => bump('trades'));
    events.on('enemyChiefDefeated', () => bump('chiefs'));
    events.on('queenSlain', () => bump('queens'));
    events.on('mutantHealed', () => bump('healed'));
    events.on('playerKnockedOut', () => bump('knockouts'));
    events.on('buildingDestroyed', () => {
      collection.run.lossTonight = true;
      hooks.onChange();
    });
    events.on('workerStarved', () => {
      collection.run.starveTonight = true;
      bump('starved');
    });
    events.on('dawnBroke', () => {
      const { run } = collection;

      stats.cleanNights = run.lossTonight ? 0 : stats.cleanNights + 1;
      stats.fedNights = run.starveTonight ? 0 : stats.fedNights + 1;
      run.lossTonight = false;
      run.starveTonight = false;
      hooks.onChange();
    });
    events.on('townHallDestroyed', () => {
      // La chute compte, puis la colonie suivante repart de zéro.
      bump('fallen');
      this.update();
      this.newRun();
    });
    events.on('victory', () => this.update());
  }

  /** Une nouvelle colonie : les compteurs repartent de zéro, les succès restent. */
  public newRun(): void {
    // En place : les écouteurs tiennent les compteurs d'origine.
    const { run } = this.collection;

    Object.assign(run.stats, emptyRun().stats);
    run.lossTonight = false;
    run.starveTonight = false;
    this.hooks.onChange();
  }

  /** Trouve les bâtiments rares debout, puis donne les succès dont la condition est remplie. */
  public update(): void {
    const { collection } = this;

    for (const entity of this.world.entities.values()) {
      if (entity.kind === 'site' || !isRareBuilding(entity.proto) || collection.found.includes(entity.proto)) continue;
      collection.found.push(entity.proto);
      this.hooks.onChange();
    }
    for (const id of reached(tally(this.world, collection), collection)) {
      collection.unlocked.push(id);
      this.hooks.onChange();
      this.hooks.onUnlock(id);
    }
  }
}
