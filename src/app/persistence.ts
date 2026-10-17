/**
 * Ce qui s'écrit sur l'appareil au fil de la partie : la sauvegarde
 * automatique, le jardin des souvenirs, les succès, le record d'après le
 * Signal et le meilleur score de la carte du jour.
 */
import type { AudioEngine } from '../audio/engine.ts';
import { rewardOf } from '../data/achievements.ts';
import { seedsFor, type PerkId } from '../data/perks.ts';
import { t } from '../i18n/locale.ts';
import { AchievementTracker } from '../sim/achievements.ts';
import type { Collection } from '../sim/collection.ts';
import { harvestSeeds, plant, type Garden } from '../sim/garden.ts';
import type { World } from '../sim/world.ts';
import { AutosaveClock } from '../storage/autosaveClock.ts';
import type { LocalCollection } from '../storage/localCollection.ts';
import type { LocalDaily } from '../storage/localDaily.ts';
import type { LocalGarden } from '../storage/localGarden.ts';
import type { LocalRecord } from '../storage/localRecord.ts';
import type { LocalSave } from '../storage/localSave.ts';
import type { TabLock } from '../storage/localTab.ts';
import { rewardText } from '../ui/collectionPanel.ts';
import type { Disposer } from '../ui/disposer.ts';
import type { Hud } from '../ui/hud.ts';
import { mapUrl } from '../ui/seed.ts';

export interface Autosave {
  /** À appeler entre deux ticks : écrit la partie si l'intervalle est écoulé ou si un moment clé l'a demandé. */
  update(deltaMs: number): void;
  /** Écrit la partie sur-le-champ — onglet caché, page quittée. */
  now(): void;
  /** Suspend l'écriture jusqu'au prochain tick : une commande poussée (`catchUp`) n'a pas encore agi sur l'état. */
  hold(): void;
  /** Efface la partie et recharge la page sur une carte neuve (ou la seed de l'URL). */
  restart(): void;
  /** Efface la partie et ouvre une carte neuve, quelle que soit la seed de l'adresse. */
  refound(): void;
}

/**
 * La sauvegarde automatique. Elle n'écrit qu'une partie commencée — l'écran
 * titre ne doit pas écraser la sauvegarde qu'il propose de continuer — et
 * jamais une partie perdue : à la chute de la mairie, elle est effacée.
 *
 * Les moments clés (un bâtiment terminé, une vague repoussée, l'aube, un
 * objectif réussi, un échange sac ⇄ coffre) arrivent en plein tick ; ils ne
 * font que marquer la partie à sauver, et l'écriture attend la fin du tick,
 * quand l'état est cohérent — au plus une par seconde (`AutosaveClock`) : des
 * taps à la chaîne dans la zone d'échange ne font pas une écriture chacun.
 */
export function wireSave(
  life: Disposer,
  world: World,
  saves: LocalSave,
  tabs: TabLock,
  started: () => boolean,
  alerts: {
    /** Un autre onglet a repris la partie : celui-ci n'écrit plus. */
    lost(): void;
    /** L'écriture vient d'échouer (une seule fois, jusqu'à la prochaine réussie). */
    failed(): void;
  },
): Autosave {
  const clock = new AutosaveClock();
  let enabled = true;
  let failing = false;
  let heldAt: number | null = null;

  const write = (): void => {
    clock.wrote();
    if (!enabled || !started() || world.defeated) return;
    if (!tabs.held()) {
      alerts.lost();
      return;
    }
    // Le tick n'a pas encore consommé la commande en attente : on garde la sauvegarde d'avant, qui date de l'absence.
    if (heldAt === world.tickCount) return;
    heldAt = null;

    const saved = saves.save(world);

    if (!saved && !failing) alerts.failed();
    failing = !saved;
  };

  life.on(world.events, 'buildingCompleted', () => {
    clock.mark();
  });
  life.on(world.events, 'decorRemoved', () => {
    clock.mark();
  });
  life.on(world.events, 'siteCancelled', () => {
    clock.mark();
  });
  life.on(world.events, 'buildingUpgraded', () => {
    clock.mark();
  });
  life.on(world.events, 'objectiveCompleted', () => {
    clock.mark();
  });
  life.on(world.events, 'chapterCompleted', () => {
    clock.mark();
  });
  life.on(world.events, 'eraReached', () => {
    clock.mark();
  });
  const waveOver = (): void => {
    for (const mobile of world.mobiles.values()) if (mobile.kind === 'mutant') return;
    clock.mark();
  };

  life.on(world.events, 'mutantDied', waveOver);
  life.on(world.events, 'mutantStunned', waveOver);
  life.on(world.events, 'mutantHealed', () => {
    clock.mark();
  });
  life.on(world.events, 'dawnBroke', () => {
    clock.mark();
  });
  // Un échange sac ⇄ coffre est un geste du joueur : il ne doit pas se perdre à la fermeture de l'onglet.
  life.on(world.events, 'itemsTransferred', () => {
    clock.mark();
  });
  // Le temps rattrapé hors ligne est acquis : il s'écrit, pour ne pas le rattraper deux fois.
  life.on(world.events, 'offlineCaughtUp', () => {
    clock.mark();
  });
  life.on(world.events, 'townHallDestroyed', () => saves.clear());

  return {
    update(deltaMs) {
      if (clock.due(deltaMs)) write();
    },
    now: write,
    hold() {
      heldAt = world.tickCount;
    },
    restart() {
      // Plus rien ne s'écrit : le `pagehide` du rechargement ressusciterait la partie effacée.
      enabled = false;
      saves.clear();
      window.umami?.track('partie-recommencee');
      window.location.reload();
    },
    refound() {
      enabled = false;
      saves.clear();
      window.umami?.track('colonie-refondee');
      window.location.assign(mapUrl(window.location.href, null));
    },
  };
}

export interface GardenWiring {
  current(): Garden;
  plant(perk: PerkId): Garden;
  setPure(pure: boolean): Garden;
  /** Verse au jardin les graines de la colonie en cours (refondation après le Signal). */
  bank(): Garden;
}

/**
 * Le jardin des souvenirs : les graines de la colonie tombée y entrent à la
 * chute de la mairie, une seule fois — la partie perdue est effacée juste
 * après, elle ne retombera pas. Une colonie qui a envoyé le Signal verse
 * les siennes en en fondant une nouvelle (`bank`). Chaque changement est écrit tout de suite,
 * sous sa propre clé : « Recommencer » n'y touche pas.
 */
export function wireGarden(life: Disposer, world: World, gardens: LocalGarden): GardenWiring {
  let garden = gardens.load();

  const keep = (next: Garden): Garden => {
    garden = next;
    gardens.save(next);
    return next;
  };

  life.on(world.events, 'townHallDestroyed', () => keep(harvestSeeds(garden, seedsFor(world.colonyScore()))));

  return {
    current: () => garden,
    plant: (perk) => keep(plant(garden, perk)),
    setPure: (pure) => keep({ ...garden, pure }),
    bank: () => keep(harvestSeeds(garden, seedsFor(world.colonyScore()))),
  };
}

export interface AchievementWiring {
  readonly collection: Collection;
  /** Le tick du dernier contrôle, pour n'en faire qu'un par seconde. */
  readonly checkedAt: number;
  update(): void;
  newRun(): void;
}

/**
 * Les succès : la collection vit à part de la partie (`storage/localCollection.ts`),
 * s'écrit à chaque changement, et chaque succès obtenu offre son toast et, le
 * cas échéant, sa pièce de garde-robe.
 */
export function wireAchievements(life: Disposer, world: World, collections: LocalCollection, hud: Hud, audio: AudioEngine): AchievementWiring {
  let checkedAt = -1;
  const tracker = new AchievementTracker(world, collections.load(), {
    onChange: () => void collections.save(tracker.collection),
    onUnlock: (id) => {
      const reward = rewardOf(id);

      hud.notifyAchievement(t().collection.unlocked, t().achievements[id].label, rewardText(id));
      audio.play('objective');
      if (reward && 'skin' in reward) world.push({ type: 'grantPieces', pieces: [reward.skin] });
    },
  });

  life.add(() => tracker.dispose());

  return {
    collection: tracker.collection,
    get checkedAt() {
      return checkedAt;
    },
    update: () => {
      checkedAt = world.tickCount;
      tracker.update();
    },
    newRun: () => tracker.newRun(),
  };
}

/**
 * Le record « nuits tenues après le Signal » : chaque aube d'après le Signal
 * le propose, et la chute de la mairie aussi. Renvoie le record au démarrage,
 * pour l'écran titre.
 */
export function wireRecord(life: Disposer, world: World, records: LocalRecord): number {
  const offer = (): void => void records.offer(world.nightsAfterSignal());

  life.on(world.events, 'dawnBroke', offer);
  life.on(world.events, 'townHallDestroyed', offer);
  return records.load();
}

/**
 * Le score de la carte du jour : le bilan de la colonie en graines
 * (`seedsFor(colonyScore())`), gardé s'il bat le meilleur du jour. Mesuré à
 * chaque aube, à la chute de la mairie et au Signal. Rend la lecture du
 * meilleur d'une date, pour l'écran titre.
 */
export function wireDaily(life: Disposer, world: World, dailies: LocalDaily, submit: (date: string, score: number) => void): (date: string) => number {
  const offer = (): void => {
    if (!world.dailyMap) return;

    const { date } = world.dailyMap;
    const score = seedsFor(world.colonyScore());

    // Au classement du serveur, s'il y en a un, seulement un record du jour.
    if (dailies.offer(date, score) === score) submit(date, score);
  };

  life.on(world.events, 'dawnBroke', offer);
  life.on(world.events, 'townHallDestroyed', offer);
  life.on(world.events, 'victory', offer);
  return (date) => dailies.best(date);
}
