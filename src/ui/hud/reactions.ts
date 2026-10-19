/**
 * La table événement → réaction du HUD : ce que chaque événement du monde
 * fait paraître — une bulle, un gain qui flotte, un bandeau, une réplique
 * d'Ève, la quête qui s'ouvre, un écran de fin. Les abonnements suivent
 * l'ordre d'origine : deux réactions au même événement jouent dans cet ordre.
 */

import { BUILDINGS, type BuildingId } from '../../data/buildings.ts';
import { NIGHT_STAKES } from '../../data/dayNight.ts';
import type { ItemId } from '../../data/items.ts';
import { CHAPTERS } from '../../data/objectives.ts';
import { QUESTS, type QuestReward } from '../../data/quests.ts';
import { BIOMES } from '../../data/regions.ts';
import { RESEARCH } from '../../data/research.ts';
import { SIGNAL_WAVES } from '../../data/artDirection.ts';
import { WEATHER } from '../../data/weather.ts';
import { reducedMotion } from '../../render/motion.ts';
import { TICKS_PER_SECOND, type World } from '../../sim/world.ts';
import { t } from '../../i18n/locale.ts';
import { DeathGroup } from '../deathGroup.ts';
import { Disposer } from '../disposer.ts';
import { HarvestCombo } from '../harvestCombo.ts';
import { carriesWanted, harvestRefusedText } from '../hint.ts';
import { footingText } from '../placementReason.ts';
import { effectLine } from '../researchText.ts';
import type { Advice } from './advice.ts';
import { BANNER_CLEARED_MS, type WaveBanner } from './banner.ts';
import type { Celebration } from './celebration.ts';
import type { Death } from './death.ts';
import type { Defeat } from './defeat.ts';
import { clock } from './dom.ts';
import type { EveSpeech } from './eve.ts';
import type { Floats } from './floats.ts';
import type { People } from './people.ts';
import { QUEST_ALERT_TICKS, type Quest } from './quest.ts';
import type { Toasts } from './toasts.ts';
import type { TownBanner } from './town.ts';
import type { Victory } from './victory.ts';
import type { WaveWatch } from './wave.ts';

/** Les composants qu'un événement peut toucher. */
export interface ReactionParts {
  toasts: Toasts;
  /** Centre la caméra, pour le « Voir » du toast de deuil. */
  focus: (x: number, y: number) => void;
  floats: Floats;
  advice: Advice;
  quest: Quest;
  banner: WaveBanner;
  wave: WaveWatch;
  people: People;
  eve: EveSpeech;
  celebration: Celebration;
  town: TownBanner;
  death: Death;
  defeat: Defeat;
  victory: Victory;
  /** Ouvre les talents d'Adam (`Hud.onTalentOpen`, lu au moment du tap). */
  openTalent: () => void;
}

export class Reactions {
  private readonly harvestCombo = new HarvestCombo();
  private readonly disposer = new Disposer();

  public constructor(world: World, parts: ReactionParts) {
    const { toasts, floats, advice, quest, banner, wave, people, eve, celebration, town, death, defeat, victory } = parts;
    const notify = toasts.notify.bind(toasts);
    // Les morts de faim ou de soif rapprochées, leur toast encore affiché et l'endroit que « Voir » centre.
    const deaths = new DeathGroup();
    let deathToast: { update: (message: string) => boolean } | null = null;
    let deathSpot = { x: 0, y: 0 };
    const float = floats.float.bind(floats);
    const learned = advice.learned;
    const on = this.disposer.add.bind(this.disposer);

    on(world.mine('placementRejected', ({ reason, ore }) =>
      notify(reason === 'footing' ? footingText(ore) : t().hud.rejection[reason], 'bad'),
    ));
    on(world.mine('resourceHarvested', ({ item, amount }) => {
      if (item === 'wood') learned.harvestedWood = true;
      if (item === 'stone') learned.harvestedStone = true;
      float(item, amount, this.harvestCombo.hit(performance.now()));
      floats.flyToBag(item);
    }));
    on(world.mine('siteDelivered', ({ item, amount, source }) => {
      learned.delivered = true;
      // Ce que la ville donne ne sort pas du sac : rien ne tombe de la tête d'Adam.
      if (source === 'bag') float(item, -amount);
    }));
    on(world.mine('townDeposited', ({ item, amount }) => float(item, -amount)));
    on(world.mine('itemDropped', ({ item, amount }) => float(item, -amount)));
    on(world.mine('depositRejected', ({ reason }) => {
      if (reason === 'outOfReach') notify(t().hud.toast.depositFar, 'bad');
      if (reason === 'noTown') notify(t().hud.toast.depositNoTown, 'bad');
    }));
    on(world.mine('siteRejected', ({ reason }) => {
      if (reason === 'outOfReach') notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'nothingToGive') notify(t().hud.toast.siteNothing, 'bad');
    }));
    on(world.mine('storeTaken', ({ item, amount }) => float(item, amount)));
    on(world.mine('buildingSupplied', ({ item, amount, source }) => {
      if (source === 'bag') float(item, -amount);
    }));
    on(world.mine('supplyRejected', ({ reason }) => {
      if (reason === 'outOfReach') notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'nothingToGive') notify(t().hud.toast.supplyNothing, 'bad');
    }));
    on(world.events.on('nurseryHungry', () => notify(t().hud.toast.nurseryHungry, 'bad')));
    on(world.mine('takeRejected', ({ reason }) => {
      if (reason === 'outOfReach') notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'empty') notify(t().hud.toast.chestEmpty, 'bad');
      if (reason === 'bagFull') notify(t().hud.toast.bagFullTake, 'bad');
    }));
    on(world.mine('transferRejected', ({ reason }) => {
      if (reason === 'outOfReach') notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'bagFull') notify(t().hud.toast.bagFullTake, 'bad');
    }));
    on(world.mine('inventoryFull', () => notify(bagFullMessage(world), 'bad')));
    on(world.mine('harvestRefused', ({ item, wanted, plenty }) => {
      floats.refused(item);
      notify(harvestRefusedText(item, wanted, plenty), 'info');
    }));
    on(world.events.on('buildingCompleted', ({ id }) => {
      const entity = world.entities.get(id);

      if (entity) floats.celebrate(entity, t().hud.float.built(t().buildings[entity.proto].label));
    }));
    // Le cochon : apprivoisé, effrayé, entré à l'élevage, échappé.
    on(world.events.on('pigTamed', () => notify(t().hud.pigs.tamed, 'good')));
    on(world.events.on('pigFled', ({ reason }) => notify(reason === 'scare' ? t().hud.pigs.fledScare : t().hud.pigs.fledLost, 'bad')));
    on(world.events.on('pigPenned', ({ id, pigs }) => {
      const pen = world.entities.get(id);

      if (pen) floats.celebrate(pen, t().hud.pigs.penned(pigs));
    }));
    // Les rencontres de la route : le blessé qui suit, qui fuit, qui arrive ; la biche qui se laisse approcher.
    on(world.events.on('woundedFollowing', () => notify(t().hud.encounters.following, 'good')));
    on(world.events.on('woundedFled', ({ reason }) => notify(reason === 'scare' ? t().hud.encounters.fledScare : t().hud.encounters.fledLost, 'bad')));
    on(world.events.on('survivorJoined', ({ name }) => notify(t().hud.encounters.joined(name), 'good')));
    on(world.events.on('deerCaught', () => notify(t().hud.encounters.deerCaught, 'good')));
    on(world.events.on('pigsEscaped', ({ count }) => notify(t().hud.pigs.escaped(count), 'bad')));
    // Un coffre ouvert : « Coffre ouvert ! » monte au-dessus de lui.
    on(world.events.on('chestOpened', ({ tx, ty }) => floats.celebrate({ tx, ty, width: 1, height: 1 }, t().wardrobe.chestOpened)));
    // Une ruine fouillée, un secret trouvé : le mot monte du lieu, et le butin vole vers le sac.
    on(world.mine('discoveryFound', ({ kind, tx, ty, x, y, items, plan }) => {
      if (kind !== 'chest') floats.celebrate({ tx, ty, width: 1, height: 1 }, t().hud.discovery[kind]);
      if (plan) notify(t().hud.discovery.plan(t().buildings[plan].label), 'good');
      floats.flyFindsToBag(items, x, y);
    }));
    // Le colis d'une faveur de l'aube, la récompense d'un défi du jour : ils volent d'Adam jusqu'à la ville (ou au sac).
    on(world.events.on('boonChosen', ({ reward, to }) => floats.flyFindsToBag(reward, world.player.x, world.player.y, to)));
    on(world.events.on('challengeCompleted', ({ reward, to }) => floats.flyFindsToBag(reward, world.player.x, world.player.y, to)));
    on(world.events.on('prestigeGained', ({ amount, x, y }) => floats.floatPrestige(amount, x, y)));
    on(world.events.on('xpGained', ({ amount, x, y }) => floats.floatXp(amount, x, y)));
    on(world.events.on('levelUp', ({ level, maxHp }) => {
      notify(t().hud.toast.levelUp(level, maxHp), 'good', { label: t().hud.talent.see, run: () => parts.openTalent() });
      town.levelUp();
    }));
    on(world.events.on('buildingUpgraded', ({ id, level, fromBag }) => {
      const entity = world.entities.get(id);

      for (const [item, amount] of fromBag) float(item, -amount);
      if (entity) floats.celebrate(entity, t().hud.float.upgraded(levelLabel(entity.proto, level)));
    }));
    on(world.events.on('enemyBaseResisted', ({ level }) =>
      notify(t().hud.toast.betterGear(t().gear[Math.min(level, t().gear.length - 1)] ?? '', level), 'bad'),
    ));
    on(world.events.on('enemyBaseShielded', () => notify(t().hud.toast.baseShielded, 'bad')));
    on(world.events.on('enemyChiefDefeated', ({ prestige }) => notify(t().hud.toast.chiefDefeated(prestige), 'good')));
    on(world.events.on('enemyZoneEntered', ({ level }) => notify(t().hud.toast.enemyZone(level), 'info')));
    on(world.events.on('regionEntered', ({ id, biome, state, era }) => {
      const guardian = BIOMES[biome].guardian;
      const name = t().biomes[biome];

      if (state === 'locked') notify(t().hud.toast.regionLocked(name, t().eras[era]?.label ?? ''), 'info');
      else if (guardian && world.regions[id]?.lair) notify(t().hud.toast.regionOpen(name, t().wildlife[guardian]), 'info');
    }));
    on(world.events.on('regionConquered', ({ biome, prestige }) => notify(t().hud.toast.regionConquered(t().biomes[biome], prestige), 'good')));
    on(world.mine('specialtyFound', ({ item, amount }) => float(item, amount)));
    // Le « +N Prestige » monte déjà de la base (`prestigeGained`) : il ne reste que le bandeau.
    on(world.events.on('enemyBaseDestroyed', ({ prestige }) => notify(t().hud.toast.baseDestroyed(prestige), 'good')));
    on(world.events.on('gearCrafted', ({ level, fromBag }) => {
      for (const [item, amount] of fromBag) float(item, -amount);
      notify(t().hud.toast.gearCrafted(t().gear[level] ?? '', level), 'good');
    }));
    on(world.events.on('toolCrafted', ({ slot, level, fromBag }) => {
      for (const [item, amount] of fromBag) float(item, -amount);
      notify(t().hud.toast.toolCrafted(t().toolGear[slot][level - 1] ?? ''), 'good');
    }));
    on(world.events.on('companionTraining', ({ role, endTick, fromBag }) => {
      for (const [item, amount] of fromBag) float(item, -amount);
      notify(t().hud.toast.companionTraining(t().companionClasses[role].label, Math.ceil((endTick - world.tickCount) / TICKS_PER_SECOND)), 'info');
    }));
    on(world.events.on('companionJoined', ({ role }) => notify(t().hud.toast.companionJoined(t().companionClasses[role].label), 'good')));
    on(world.events.on('companionDied', ({ role }) => notify(t().hud.toast.companionDied(t().companionClasses[role].label), 'bad')));
    on(world.mine('recruitRejected', ({ reason }) => {
      if (reason !== 'missing') notify(t().hud.recruit[reason], 'bad');
    }));
    on(world.mine('gearRejected', ({ reason }) => {
      if (reason !== 'missing') notify(t().hud.gear[reason], 'bad');
    }));
    on(world.mine('upgradeRejected', ({ reason }) => {
      if (reason === 'outOfReach') notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'missingItems') notify(t().hud.toast.upgradeMissing, 'bad');
      if (reason === 'locked') notify(t().hud.toast.upgradeLocked, 'bad');
    }));
    on(world.mine('playerRepaired', ({ item, amount, fromBag }) => {
      learned.repaired = true;
      if (fromBag > 0) float(item, -fromBag);
      if (amount > fromBag) notify(t().hud.toast.repairedFromTown(amount - fromBag, t().items[item]), 'good');
    }));
    on(world.mine('repairRejected', ({ reason }) => {
      if (reason !== 'missing') notify(t().hud.repair[reason], 'bad');
    }));
    on(world.events.on('waveCountdown', ({ seconds, night, wave: rank, count, bases, boss, queen, from, targetProto, x, y }) => {
      banner.showCountdown(String(seconds));
      banner.announce(night, rank, count, bases, boss, queen, from, targetProto, { x, y });
    }));
    // La veille au soir : Ève prévient, dans sa bulle — ou par radio si elle n'est pas là.
    on(world.events.on('queenAnnounced', () => {
      if (world.eve()) eve.say([t().eve.queen]);
      else notify(t().hud.toast.eveRadio(t().eve.queen), 'bad');
    }));
    on(world.events.on('graceEnding', () => {
      if (world.eve()) eve.say([t().eve.graceEnding]);
      else notify(t().hud.toast.eveRadio(t().eve.graceEnding), 'bad');
    }));
    on(world.events.on('queenSlain', ({ night }) =>
      banner.show('cleared', t().hud.wave.queenSlain, t().hud.wave.queenSlainText(night), null, BANNER_CLEARED_MS),
    ));
    on(world.events.on('duskFell', () => notify(t().hud.toast.dusk, 'bad')));
    // Une vague qui n'a pas eu son compte à rebours (partie reprise pile avant) s'annonce quand même.
    on(world.events.on('waveStarted', ({ night, wave: rank, count, bases, boss, queen, from, targetProto, x, y }) => {
      banner.announce(night, rank, count, bases, boss, queen, from, targetProto, { x, y });
      quest.unfold(QUEST_ALERT_TICKS);
    }));
    on(world.events.on('buildingDamaged', ({ id, hp }) => {
      const hall = world.entities.get(id);

      if (id !== world.townHallId || !hall) return;
      quest.hallHit(hp / BUILDINGS[hall.proto].hp);
    }));
    on(world.events.on('waveStarted', ({ wave: rank, count, from }) => wave.started(rank, count, from)));
    for (const kill of ['mutantDied', 'mutantStunned'] as const) {
      on(world.events.on(kill, () => wave.downedOne()));
    }
    on(world.events.on('dawnBroke', () => wave.dawn()));
    // Le dernier mutant tombe : le ralenti court d'abord, le grand bandeau suit.
    on(world.events.on('waveCleared', ({ night }) => {
      window.setTimeout(
        () => banner.show('cleared', t().hud.wave.cleared(night), t().hud.wave.clearedText, null, BANNER_CLEARED_MS),
        reducedMotion() ? 0 : NIGHT_STAKES.slowMoMs,
      );
    }));
    on(world.events.on('waveAnnounced', ({ ticks, count, from }) =>
      notify(t().hud.wave.announced(clock(Math.ceil(ticks / TICKS_PER_SECOND)), count, t().hud.from[from]), 'bad'),
    ));
    on(world.events.on('waveRewarded', ({ night, reward }) => {
      if (reward.length === 0) return;
      for (const [item, amount] of reward) float(item, amount);
      notify(t().hud.wave.bounty(night, reward.map(([item, amount]) => t().hud.toast.storedItem(amount, t().items[item])).join(', ')), 'good');
    }));
    on(world.mine('lootPicked', ({ item, amount }) => {
      float(item, amount);
      floats.flyToBag(item);
    }));
    on(world.events.on('comboBroken', ({ count }) => notify(t().hud.skill.comboBroken(count), 'bad')));
    on(world.events.on('nightShortened', ({ ticks }) => notify(t().hud.skill.cleanNight(Math.ceil(ticks / TICKS_PER_SECOND)), 'good')));
    on(world.events.on('comboPaid', ({ prestige, clean }) => {
      if (prestige > 0) notify(clean ? `${t().hud.skill.cleanPaid} · ${t().hud.skill.comboPaid(prestige)}` : t().hud.skill.comboPaid(prestige), 'good');
    }));
    on(world.events.on('happinessChanged', ({ from, to }) => people.moodChanged(from, to)));
    on(world.events.on('dawnBroke', ({ night, reward }) => {
      notify(t().hud.toast.dawn(night), 'good');
      for (const [item, amount] of reward) float(item, amount);
    }));
    on(world.events.on('buildingDestroyed', ({ proto }) => notify(t().hud.toast.destroyed(t().buildings[proto].label), 'bad')));
    on(world.events.on('decorRemoved', ({ proto, toTown }) => notify(t().hud.toast.decorRemoved(t().buildings[proto].label, toTown), 'info')));
    on(world.events.on('siteCancelled', ({ proto, toTown }) =>
      notify(t().hud.toast.siteCancelled(t().buildings[proto].label, toTown), 'info'),
    ));
    on(world.events.on('childBorn', ({ name }) => notify(t().hud.toast.childBorn(name), 'good')));
    on(world.events.on('mutantStunned', () => notify(t().hud.toast.mutantStunned, 'good')));
    on(world.events.on('patientFollowing', () => notify(t().hud.toast.patientFollowing, 'good')));
    on(world.events.on('patientAdmitted', () => notify(t().hud.toast.patientAdmitted, 'good')));
    on(world.events.on('mutantHealed', () => notify(t().hud.toast.mutantHealed, 'good')));
    on(world.events.on('kidGrewUp', ({ name }) => notify(t().hud.toast.kidGrewUp(name), 'good')));
    on(world.events.on('starving', ({ name, need, seconds }) => notify(t().hud.toast.starving[need](name, seconds), 'bad')));
    on(world.events.on('workerStarved', ({ name, need, x, y }) => {
      // Plusieurs morts en moins de `GRAVES.groupSeconds` : le même toast réécrit en « N colons sont morts de soif ».
      const reading = deaths.add(performance.now(), need, x, y);
      const message = reading.count === 1 ? t().hud.toast.workerStarved[need](name) : t().hud.toast.workersStarved(reading.count, reading.need);

      deathSpot = { x: reading.x, y: reading.y };
      if (reading.count > 1 && deathToast?.update(message)) return;
      deathToast = notify(message, 'bad', { label: t().hud.toast.see, run: () => parts.focus(deathSpot.x, deathSpot.y) });
    }));
    on(world.events.on('growthStunted', ({ name, need }) => notify(t().hud.toast.growthStunted[need](name), 'bad')));
    on(world.events.on('townHallDestroyed', () => defeat.show()));
    on(world.events.on('playerKnockedOut', () => death.show()));
    on(world.events.on('playerRespawned', () => death.hide()));
    on(world.events.on('weatherAnnounced', ({ id, seconds }) => {
      const { label, advice: tip } = t().weather[id];

      notify(t().hud.toast.weatherSoon(label, seconds, tip), WEATHER[id].harsh ? 'bad' : 'info');
    }));
    on(world.events.on('weatherEnded', ({ id }) => notify(t().hud.toast.weatherEnded(t().weather[id].label), 'good')));
    on(world.events.on('playerKnockedOut', () => notify(t().hud.toast.knockedOut, 'bad')));
    on(world.events.on('eveArriving', () => notify(t().hud.toast.eveArriving, 'good')));
    on(world.events.on('caravanArriving', () => {
      notify(t().hud.toast.caravanArriving, 'good');
      eve.say([t().eve.caravan]);
    }));
    on(world.events.on('caravanLeaving', () => notify(t().hud.toast.caravanLeaving, 'info')));
    on(world.mine('traded', ({ fromBag, stored }) => {
      for (const [item, amount] of fromBag) float(item, -amount);
      for (const [item, amount] of Object.entries(stored) as [ItemId, number][]) {
        if (amount > 0) notify(t().hud.toast.storedAtHall(t().hud.toast.storedItem(amount, t().items[item])), 'info');
      }
    }));
    on(world.mine('tradeRejected', ({ reason }) => {
      if (reason === 'outOfReach') notify(t().hud.toast.tradeFar, 'bad');
      if (reason === 'missingItems') notify(t().hud.toast.tradeMissing, 'bad');
      if (reason === 'done') notify(t().hud.toast.tradeDone, 'bad');
      if (reason === 'missing') notify(t().hud.toast.tradeGone, 'bad');
    }));
    on(world.events.on('eveArrived', () => {
      notify(t().hud.toast.eveArrived, 'good');
      eve.say(t().eve.arrival);
    }));
    on(world.events.on('questStarted', ({ quest: id }) => eve.say([t().quests[id].give])));
    on(world.events.on('questCompleted', ({ quest: id }) => {
      eve.say([t().quests[id].done]);
      notify(rewardLabel(QUESTS[id].reward), 'good');
    }));
    on(world.events.on('labSupplied', ({ item, amount, source }) => {
      if (source === 'bag') float(item, -amount);
    }));
    on(world.events.on('researchStarted', ({ research }) => notify(t().hud.toast.researchStarted(t().research[research].label), 'info')));
    on(world.events.on('researchCompleted', ({ research }) =>
      notify(
        t().hud.toast.researchCompleted(
          RESEARCH[research].effect === null ? t().research[research].label : effectLine(research, world.researchDone, world.perks),
        ),
        'good',
      ),
    ));
    on(world.events.on('buildingsUnlocked', ({ buildings }) => {
      const labels = buildings.map((building) => t().buildings[building].label).join(', ');

      notify(t().hud.toast.buildingsUnlocked(buildings.length, labels), 'good');
    }));
    on(world.events.on('eraRejected', () => notify(t().eraPanel.rejected, 'bad')));
    on(world.events.on('researchRejected', ({ reason }) => {
      if (reason === 'busy') notify(t().hud.toast.researchBusy, 'bad');
      if (reason === 'taken') notify(t().hud.toast.researchTaken, 'bad');
      if (reason === 'locked') notify(t().hud.toast.researchLocked, 'bad');
      if (reason === 'outOfReach') notify(t().hud.rejection.outOfReach, 'bad');
      if (reason === 'nothingToGive') notify(t().hud.toast.researchNothing, 'bad');
    }));
    on(world.events.on('objectiveCompleted', ({ id, stored, closing }) => {
      // Le dernier objectif d'un chapitre, c'est la fin du chapitre qui le fête, en grand.
      if (!closing) celebration.objectiveDone(id);
      quest.unfold(QUEST_ALERT_TICKS);
      toasts.notifyStored(stored);
    }));
    on(world.events.on('chapterCompleted', ({ index, stored }) => {
      // Le dernier chapitre, c'est l'écran de victoire qui le fête.
      if (index < CHAPTERS.length - 1) celebration.chapterDone(index);
      quest.unfold(QUEST_ALERT_TICKS);
      toasts.notifyStored(stored);
    }));
    // L'antenne s'allume d'abord, ses ondes couvrent l'écran : l'écran du Signal vient après.
    on(world.events.on('victory', () => window.setTimeout(() => victory.show(), SIGNAL_WAVES.durationMs)));
    on(world.events.on('antennaRaised', ({ floor, lureNight }) => {
      notify(t().hud.toast.antennaRaised(floor, lureNight), 'info');
    }));
    on(world.events.on('antennaFell', ({ floor }) => notify(t().hud.toast.antennaFell(floor), 'bad')));
    // Ève le dit tout de suite, à la place de ce qu'elle disait.
    on(world.events.on('signalSent', () => eve.interrupt(t().lore.signal.answer)));
    on(world.events.on('survivorsArrived', ({ count }) =>
      notify(t().hud.toast.survivors(count), 'good'),
    ));
  }

  /** Se désabonne de tout le monde. */
  public dispose(): void {
    this.disposer.dispose();
  }
}

/** « Sac plein » dit où vider : la ville, le chantier qui attend ce qu'Adam porte, ou le sol. */
function bagFullMessage(world: World): string {
  const text = t().hud.toast;

  if (world.townStock()) return text.bagFullTown;
  return carriesWanted(world) ? text.bagFullSite : text.bagFullDrop;
}

/** La récompense d'une quête, dite par le jeu. */
function rewardLabel(reward: QuestReward): string {
  return reward.type === 'plan'
    ? t().hud.toast.planReceived(t().buildings[reward.building].label)
    : t().hud.toast.toolReceived(t().tools[reward.tool]);
}

/** Le nom d'un niveau : le bâtiment au niveau 1, son amélioration au-delà. */
function levelLabel(id: BuildingId, level: number): string {
  const words = t().buildings[id];

  return level <= 1 ? words.label : (words.upgrades[level - 2]?.label ?? words.label);
}
