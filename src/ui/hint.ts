/**
 * Le conseil du HUD — le tutoriel, sans tutoriel.
 *
 * Une seule phrase, choisie d'après l'état du monde et ce que le joueur a
 * déjà fait. Elle se tait dès que l'étape est franchie : un joueur qui sait
 * déjà jouer ne la voit presque pas.
 *
 * C'est Ève qui parle (`t().eve.hints`) : par radio tant qu'elle n'est pas
 * arrivée, de vive voix ensuite. Elle tutoie Adam. Quand elle n'a rien de
 * plus pressé à dire, c'est le conseil de l'objectif en cours
 * (`data/objectives.ts`) : le joueur sait toujours quoi faire ensuite.
 *
 * Fonction pure, sans DOM : `hud.ts` l'affiche, les tests la lisent.
 */

import { BUILDINGS, REPAIR, buildingLevel, type BuildingId } from '../data/buildings.ts';
import { EVE } from '../data/eve.ts';
import { COLONY } from '../data/inhabitants.ts';
import { TOWN_PLENTY, type ItemId } from '../data/items.ts';
import type { Goal } from '../data/objectives.ts';
import { RESEARCH_IDS } from '../data/research.ts';
import { RESOURCES } from '../data/resources.ts';
import { currentObjective, objectiveWait, type GoalWait } from '../sim/objectives.ts';
import { openingResearch, researchStatus, unlockingResearch } from '../sim/research.ts';
import type { Building } from '../sim/types.ts';
import { TICKS_PER_SECOND, type World } from '../sim/world.ts';
import { t } from '../i18n/locale.ts';

/** Ce que le joueur a déjà fait : un conseil compris ne revient pas. */
export interface HintProgress {
  harvestedWood: boolean;
  harvestedStone: boolean;
  delivered: boolean;
  /** Adam a déjà réparé un bâtiment : il sait faire. */
  repaired: boolean;
}

/** Un conseil, et la ressource qu'il envoie chercher : le repère d'objectif y mène. */
export interface Advice {
  text: string;
  wants: ItemId | null;
}

/** Le sac contient-il au moins un objet qu'on attend quelque part — chantier, recette ou ville ? */
export function carriesWanted(world: World): boolean {
  return world.player.inventory.entries().some(([item]) => world.wanted(item) > 0);
}

/**
 * Le message d'une récolte refusée (`harvestRefused`) : c'est le jeu qui
 * parle, il vouvoie. Tant qu'un chantier ou une recette attend l'objet
 * (`wanted` > 0), le sac en contient déjà assez — il faut aller livrer ;
 * « aucun chantier » ne se dit que si plus personne n'en veut. Quand la
 * ville en a déjà assez (`plenty`), c'est elle qui le dit.
 */
export function harvestRefusedText(item: ItemId, wanted: number, plenty = false): string {
  const label = t().items[item];
  const text = t().hud.hint;

  if (plenty) return text.harvestPlenty(label);
  if (wanted > 0) return text.harvestDeliver(label);
  return text.harvestNone(label);
}

/**
 * Le conseil d'un sac plein dont personne ne veut rien : il ne sert à rien
 * d'aller livrer, il faut poser un chantier ou jeter. On nomme l'objet qui
 * prend le plus de place. `null` si le sac n'est pas dans ce cas.
 */
export function uselessBagHint(world: World): string | null {
  const { inventory } = world.player;

  if (inventory.freeSpace() > 0 || carriesWanted(world)) return null;

  const [bulk] = inventory.entries().sort((a, b) => b[1] - a[1])[0] ?? [];

  return bulk ? t().eve.hints.bagUseless.replace('{item}', t().hud.hint.inSentence(t().items[bulk])) : null;
}

/**
 * Le conseil de bâtir `building`, s'il est au menu ; sinon, le chemin du labo
 * qui l'ouvre : le bâtir d'abord, puis y lancer la recherche.
 */
function viaLab(world: World, building: BuildingId, line: string): string {
  const research = openingResearch(building) ?? unlockingResearch(building);

  if (world.isUnlocked(building) || research === null) return line;

  const lines = t().eve.hints;
  const name = t().buildings[building].label;

  return (world.labs().length > 0 ? lines.labResearch.replace('{research}', t().research[research].label) : lines.labOpen).replace('{building}', name);
}

export function tutorialHint(world: World, progress: HintProgress, towers: boolean, mutants: number): string | null {
  return tutorialAdvice(world, progress, towers, mutants)?.text ?? null;
}

export function tutorialAdvice(world: World, progress: HintProgress, towers: boolean, mutants: number): Advice | null {
  const say = (text: string, wants: ItemId | null = null): Advice => ({ text, wants });
  const hall = world.entities.get(world.townHallId);
  const { inventory } = world.player;

  const lines = t().eve.hints;

  if (world.defeated || !hall) return null;

  if (hall.kind === 'site') {
    const cost = BUILDINGS[hall.proto].cost as Partial<Record<ItemId, number>>;
    const needs = (item: ItemId): boolean => (hall.delivered[item] ?? 0) < (cost[item] ?? 0);
    const carries = (Object.keys(cost) as ItemId[]).some((item) => needs(item) && inventory.count(item) > 0);

    const useless = uselessBagHint(world);

    if (useless) return say(useless);
    // Sac plein, mais de quoi livrer : le chantier le prendra.
    if (inventory.freeSpace() <= 0) return say(lines.bagFull);
    if (!progress.harvestedWood && needs('wood')) return say(lines.wood, 'wood');
    if (!progress.harvestedStone && needs('stone')) return say(lines.stone, 'stone');
    if (carries && !progress.delivered) return say(lines.deliver);
    return null;
  }

  // L'eau de départ fond et rien n'en tire : sans puits, les ouvriers s'arrêteront, tour ou pas.
  const welled = [...world.entities.values()].some((entity) => entity.proto === 'well');
  const water = world.townStock()?.available('water') ?? 0;

  if (mutants === 0 && !welled && (water < COLONY.startingStock.water / 2 || world.needAlert()?.need === 'thirst')) return say(viaLab(world, 'well', lines.well));

  if (world.night === 0 && !towers) return say(viaLab(world, 'watchtower', lines.tower));
  if (mutants > 0 && world.night <= 2) return say(lines.bow);

  // Entre deux vagues, la mairie entamée d'au moins un bois, et Ève pas encore là pour la réparer : à Adam de le faire.
  if (mutants === 0 && !progress.repaired && !world.eve() && hall.hp <= buildingLevel(hall.proto, hall.level).hp - REPAIR.hp) {
    return world.repairStock(hall) > 0 ? say(lines.repair) : say(lines.repairFetch, REPAIR.item);
  }

  // La pierre manque en ville, et rien n'en produit : la carrière, avant que les rochers ne soient vidés.
  const quarried = [...world.entities.values()].some((entity) => entity.proto === 'quarry');

  if (mutants === 0 && !quarried && (world.townStock()?.available('stone') ?? 0) === 0) return say(viaLab(world, 'quarry', lines.quarry));

  // Entre deux nuits, tant qu'elle n'est pas là : elle annonce son arrivée.
  if (mutants === 0 && world.night > 0 && world.night < EVE.arrivalNight && !world.eve()) {
    const left = EVE.arrivalNight - world.night;

    return say(lines.coming.replace('{n}', String(left)).replace('{s}', t().common.plural(left)));
  }

  // Les plaques de fer passent par la forge, et la forge par le labo : après la première nuit, Ève y envoie.
  if (mutants === 0 && world.night > 0 && !world.isUnlocked('forge')) {
    const lab = [...world.entities.values()].some((entity) => entity.proto === 'lab');

    return say(lab ? lines.foundry : lines.labForge);
  }

  // La forge débloquée au labo : le charbon, jusque-là sans usage, devient un objectif.
  const forged = [...world.entities.values()].some((entity) => entity.proto === 'forge');

  if (mutants === 0 && world.isUnlocked('forge') && !forged) return say(lines.forge, 'coal');

  // La forge debout, la ville sans charbon, et rien pour en cuire : le four à charbon.
  const kiln = [...world.entities.values()].some((entity) => entity.proto === 'charcoalKiln');

  if (mutants === 0 && forged && !kiln && (world.townStock()?.available('coal') ?? 0) === 0) return say(lines.kiln);

  // L'objectif n'attend plus qu'une horloge qui court : le temps qu'il reste, et de quoi s'occuper d'ici là.
  // Une nuit à tenir n'est une attente que de jour : le soir, le conseil de l'objectif dit comment la tenir.
  const wait = mutants === 0 ? objectiveWait(world) : null;

  if (wait && wait.blockedBy === null && (wait.goal.type !== 'nights' || world.clock()?.phase === 'day')) {
    return waitingAdvice(world, wait);
  }

  const objective = currentObjective(world);

  return objective ? say(t().objectives[world.objective]!.hint) : null;
}

/**
 * Le conseil d'une attente : combien de temps encore, puis une activité tirée
 * du monde, par ordre de priorité — réparer un bâtiment abîmé, une tour de
 * plus tant qu'il y en a moins de deux, l'objet le plus bas en ville, la
 * recherche à lancer. Le temps se dit en minutes : la phrase ne change pas à
 * chaque seconde, le conseil ne se rouvre pas sans cesse.
 */
function waitingAdvice(world: World, wait: GoalWait & { goal: Goal }): Advice {
  const lines = t().eve.hints;
  const time = waitTime(wait.remainingTicks);
  const head = (wait.goal.type === 'births' ? lines.waitBirth : lines.waitDawn).replace('{time}', time);
  const todo = meanwhile(world);

  return todo
    ? { text: lines.meanwhile.replace('{wait}', head).replace('{todo}', todo.text), wants: todo.wants }
    : { text: lines.meanwhileIdle.replace('{wait}', head), wants: null };
}

/** « 3 minutes », « 1 minute », « moins d’une minute ». */
function waitTime(ticks: number): string {
  const minutes = Math.ceil(ticks / (TICKS_PER_SECOND * 60));

  if (ticks < TICKS_PER_SECOND * 60) return t().hud.hint.lessThanMinute;
  return t().hud.hint.minutes(minutes);
}

/** De quoi s'occuper pendant une attente, ou `null` si rien ne presse. */
function meanwhile(world: World): Advice | null {
  const lines = t().eve.hints;
  const entities = [...world.entities.values()];

  const damaged = entities.find(
    (entity): entity is Building => entity.kind !== 'site' && entity.hp < buildingLevel(entity.proto, entity.level).hp,
  );

  if (damaged) {
    const text = lines.meanwhileRepair.replace('{building}', t().hud.hint.inSentence(t().buildings[damaged.proto].label));

    return { text, wants: world.repairStock(damaged) > 0 ? null : REPAIR.item };
  }

  // Les chantiers comptent : une tour posée n'est plus à conseiller.
  const towers = entities.filter((entity) => BUILDINGS[entity.proto].kind === 'tower').length;

  if (towers < 2 && world.isUnlocked('watchtower')) {
    return { text: towers === 0 ? lines.meanwhileTower : lines.meanwhileSecondTower, wants: null };
  }

  const town = world.townStock();
  const gathered = [...new Set(Object.values(RESOURCES).map((resource) => resource.item))];
  const lowest = town
    ? gathered.reduce<ItemId | null>((low, item) => (low === null || town.available(item) < town.available(low) ? item : low), null)
    : null;

  if (town && lowest && town.available(lowest) < TOWN_PLENTY) {
    return { text: lines.meanwhileStock.replace('{item}', t().hud.hint.inSentence(t().items[lowest])), wants: lowest };
  }

  const labs = world.labs();

  if (
    labs.some((lab) => lab.research === null) &&
    RESEARCH_IDS.some((id) => researchStatus(id, world.researchDone, null, labs) === 'available')
  ) {
    return { text: lines.meanwhileResearch, wants: null };
  }
  return null;
}
