/**
 * Les textes du panneau Recherche : l'effet chiffré d'une recherche, son
 * état, et le temps qui reste.
 *
 * Fonctions pures, sans DOM : `researchPanel.ts` les affiche, les tests les
 * lisent. Les chiffres viennent des données (`STAT_BASE`, `RESEARCH`) et des
 * recherches déjà finies : « Dégâts de l'arc : 1 → 1,5 » dit ce que la
 * recherche change **maintenant**, pas dans l'absolu. Les mots et le format
 * des nombres viennent du dictionnaire de la langue du moment (`t()`).
 */

import type { BuildingId } from '../data/buildings.ts';
import { bagBonus, type PerkId } from '../data/perks.ts';
import { RESEARCH, RESEARCH_STATS, type ResearchId, type ResearchStat } from '../data/research.ts';
import { STAT_BASE, missingRequirements, researchBonus, researchBuildings, type ResearchStatus } from '../sim/research.ts';
import { TICKS_PER_SECOND } from '../sim/world.ts';
import { t } from '../i18n/locale.ts';

/** Une valeur de statistique, dans son unité : « 1,5 », « 0,5 s », « +50 % », « 5,4 cases/s ». */
export function formatStat(stat: ResearchStat, value: number): string {
  const { ticks, percent } = RESEARCH_STATS[stat];
  const { common, researchPanel, researchStats } = t();

  if (percent) return value === 0 ? researchPanel.zeroPercent : researchPanel.percent(common.number(Math.round(value * 100)));
  return `${common.number(ticks ? value / TICKS_PER_SECOND : value)}${researchStats[stat].unit}`;
}

/**
 * La valeur de la statistique avec ces recherches finies. Le sac compte
 * aussi les places offertes par le jardin : c'est celui qu'Adam porte.
 */
export function statValue(stat: ResearchStat, done: readonly ResearchId[], perks: readonly PerkId[] = []): number {
  const garden = stat === 'bagCapacity' ? bagBonus(perks) : 0;

  return STAT_BASE[stat] + garden + researchBonus(done, stat);
}

/**
 * L'effet chiffré d'une recherche : la statistique sans elle, puis avec —
 * « Dégâts de l'arc : 1 → 1,5 ». Une recherche finie se lit pareil : ce
 * qu'elle a changé. Une recherche qui ne fait que débloquer dit quoi :
 * « Débloque : Forge, Four à charbon ».
 */
export function effectLine(id: ResearchId, done: readonly ResearchId[], perks: readonly PerkId[] = []): string {
  const { effect } = RESEARCH[id];

  if (effect === null) return unlocksLine(id);

  const { stat, amount } = effect;
  const others = done.filter((other) => other !== id);
  const before = statValue(stat, others, perks);

  return t().researchPanel.effect(t().researchStats[stat].label, formatStat(stat, before), formatStat(stat, before + amount));
}

/** Les bâtiments qu'une recherche fait entrer au menu de construction — débloqués ou ouverts —, ou `''`. */
export function unlocksLine(id: ResearchId): string {
  const unlocks: readonly BuildingId[] = researchBuildings(id);

  return unlocks.length === 0 ? '' : `${t().researchPanel.unlocks} ${unlocks.map((building) => t().buildings[building].label).join(', ')}`;
}

/** L'état d'une recherche en une ligne, sous son effet. */
export function statusLine(id: ResearchId, status: ResearchStatus, done: readonly ResearchId[], ticksLeft = 0): string {
  const text = t().researchPanel;

  switch (status) {
    case 'done':
      return text.done;
    case 'running':
      return text.runningLeft(clock(ticksLeft));
    case 'collecting':
      return text.collecting;
    case 'queued':
      return text.queued;
    case 'taken':
      return text.taken;
    case 'available':
      return text.duration(clock(RESEARCH[id].duration));
    case 'locked':
      return text.requires(
        missingRequirements(id, done)
          .map((required) => t().research[required].label)
          .join(', '),
      );
  }
}

/** « 1 min 05 s » ou « 42 s » à partir d'un nombre de ticks. */
export function clock(ticks: number): string {
  const seconds = Math.ceil(Math.max(0, ticks) / TICKS_PER_SECOND);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  const text = t().researchPanel;

  return minutes > 0 ? text.minutes(minutes, rest.toString().padStart(2, '0')) : text.seconds(rest);
}
