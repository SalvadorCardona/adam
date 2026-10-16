/**
 * Le conseil du HUD — le tutoriel, sans tutoriel.
 *
 * Une seule phrase, choisie d'après l'état du monde et ce que le joueur a
 * déjà fait. Elle se tait dès que l'étape est franchie : un joueur qui sait
 * déjà jouer ne la voit presque pas.
 *
 * C'est Ève qui parle (`t().eve.hints`) : par radio tant qu'elle n'est pas
 * arrivée, de vive voix ensuite. Elle tutoie Adam. Quand elle n'a rien de
 * plus pressé à dire, c'est le conseil de l'objectif choisi dans le panneau
 * (`data/objectives.ts`) — le premier du chapitre qui reste, si le joueur
 * n'en a pas touché un : il sait toujours quoi faire ensuite.
 *
 * Fonction pure, sans DOM : `hud.ts` l'affiche, les tests la lisent.
 */

import { BUILDINGS, REPAIR, buildingLevel, type BuildingId } from '../data/buildings.ts';
import { EVE } from '../data/eve.ts';
import { COLONY } from '../data/inhabitants.ts';
import { TOWN_PLENTY, type ItemId } from '../data/items.ts';
import { objectiveProto, type Goal, type ObjectiveId } from '../data/objectives.ts';
import { WAVE_STRENGTH } from '../data/enemies.ts';
import { RESEARCH_IDS, type ResearchId } from '../data/research.ts';
import { RESOURCES } from '../data/resources.ts';
import { firstOpenObjective, goalBuilding, goalProgress, objectiveWait, type GoalWait } from '../sim/objectives.ts';
import { eraReady, nextEra } from '../sim/eras.ts';
import { openingResearch, researchStatus, unlockingResearch } from '../sim/research.ts';
import { inDepotRange, isProducer } from '../sim/jobs.ts';
import type { Building, Depot, Entity } from '../sim/types.ts';
import { TICKS_PER_SECOND, type World } from '../sim/world.ts';
import { t } from '../i18n/locale.ts';

/** À partir de combien d'oisifs Ève s'en mêle. */
const IDLE_HINT_MIN = 3;

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
  /** La recherche que le conseil envoie lancer au labo : sa fenêtre la met en tête. */
  research?: ResearchId | null;
  /** Ce vers quoi le repère de bord pointe, quand ce n'est pas ce qu'on récolte (`wants`) : l'eau du puits. */
  pointTo?: ItemId | null;
  /** Une urgence hors chapitre (vague proche, ville à sec, mairie qui faiblit) : le HUD la marque en corail, comme une alerte. */
  urgent?: boolean;
}

/** Une vague sans grâce qui sort dans moins de ce temps rend la défense urgente. */
const WAVE_URGENT_SECONDS = 60;

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
 * qui l'ouvre, pas à pas : bâtir le labo, y lancer la recherche, lui apporter
 * son coût, attendre qu'elle finisse. `null` quand rien ne l'ouvre encore :
 * Ève ne demande jamais de poser ce qui n'est pas dans « Bâtir ».
 */
function viaLab(world: World, building: BuildingId, line: string): Advice | null {
  if (world.inMenu(building)) return { text: line, wants: null };

  const research = openingResearch(building) ?? unlockingResearch(building);

  if (research === null || !world.researchOpen(research)) return null;

  const lines = t().eve.hints;
  const name = t().buildings[building].label;
  const label = t().research[research].label;
  const labs = world.labs();

  if (labs.length === 0) return { text: lines.labOpen.replace('{building}', name), wants: null };

  const running = labs.find((lab) => lab.research === research);

  if (running) {
    const missing = world.labLedger(running).find((entry) => entry.missing > 0);

    if (missing) {
      const text = lines.labSupply.replace('{research}', label).replace('{item}', t().hud.hint.inSentence(t().items[missing.item]));

      return { text, wants: missing.item, research };
    }
    return { text: lines.labRunning.replace('{research}', label), wants: null, research };
  }
  return { text: lines.labResearch.replace('{research}', label).replace('{building}', name), wants: null, research };
}

export function tutorialHint(world: World, progress: HintProgress, towers: boolean, mutants: number, selected?: ObjectiveId | null): string | null {
  return tutorialAdvice(world, progress, towers, mutants, selected)?.text ?? null;
}

/**
 * `selected` : l'objectif choisi dans le panneau ; absent, le premier du chapitre qui reste.
 * Le conseil est son prochain pas, sauf une urgence (`Advice.urgent`).
 */
export function tutorialAdvice(
  world: World,
  progress: HintProgress,
  towers: boolean,
  mutants: number,
  selected: ObjectiveId | null = firstOpenObjective(world),
): Advice | null {
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

  // Les urgences, seules à passer devant l'objectif choisi : une vague, la soif, la mairie qui lâche.
  const urgent = urgentAdvice(world, hall, towers, mutants);

  if (urgent) return { ...urgent, urgent: true };

  // Le fil rouge : le prochain pas de l'objectif choisi, et rien d'autre.
  if (selected) return selectedAdvice(world, selected, mutants);

  return fallbackAdvice(world, towers, mutants);
}

/**
 * Ce qui presse assez pour couper l'objectif choisi : l'arc pendant une vague
 * des premières nuits, la ville à sec, une vague sans grâce dans la minute
 * sans tour, la mairie sous la moitié de ses points de vie.
 */
function urgentAdvice(world: World, hall: Entity, towers: boolean, mutants: number): Advice | null {
  const lines = t().eve.hints;

  if (mutants > 0 && world.night <= 2) return { text: lines.bow, wants: null };
  if (mutants > 0) return null;

  // L'eau de départ est épuisée et rien n'en tire : sans puits, les ouvriers s'arrêteront.
  const welled = [...world.entities.values()].some((entity) => entity.proto === 'well');
  const water = world.townStock()?.available('water') ?? 0;

  if (!welled && (water === 0 || world.needAlert()?.need === 'thirst')) {
    const well = viaLab(world, 'well', lines.well);

    // Le repère de bord montre la rive la plus proche : le puits s'y pose.
    if (well) return { ...well, pointTo: 'water' };
  }

  // Une vague sans grâce sort dans la minute et aucune tour ne garde la mairie.
  const forecast = world.waveForecast();

  if (forecast && !towers && forecast.night > WAVE_STRENGTH.earlyCaps.length && forecast.ticks <= WAVE_URGENT_SECONDS * TICKS_PER_SECOND) {
    const tower = viaLab(world, 'watchtower', lines.tower);

    if (tower) return tower;
  }

  // La mairie est sous la moitié de ses PV, et Ève pas encore là pour la réparer : à Adam de le faire.
  if (hall.kind !== 'site' && !world.eve() && hall.hp * 2 < buildingLevel(hall.proto, hall.level).hp) {
    return world.repairStock(hall) > 0 ? { text: lines.repair, wants: null } : { text: lines.repairFetch, wants: REPAIR.item };
  }
  return null;
}

/**
 * Sans objectif à suivre (la partie sans fin), Ève revient à ses conseils de
 * jeu : de quoi tenir la colonie, du plus pressé au moins pressé.
 */
function fallbackAdvice(world: World, towers: boolean, mutants: number): Advice | null {
  const lines = t().eve.hints;
  const entities = [...world.entities.values()];
  const has = (...protos: string[]): boolean => entities.some((entity) => protos.includes(entity.proto));

  if (mutants > 0) return null;

  // La nourriture fond et rien ne la refait (ni boulangerie, ni élevage) : la ferme, puis la boulangerie — le blé ne se mange pas cru.
  const food = world.townStock()?.available('food') ?? 0;

  if (!has('bakery', 'pigPen') && (food < COLONY.startingStock.food / 2 || world.needAlert()?.need === 'hunger')) {
    const food = has('farm') ? viaLab(world, 'bakery', lines.bakery) : viaLab(world, 'farm', lines.farm);

    if (food) return food;
  }

  // Un producteur plein que personne ne vide : sans logisticiens ni porteurs, ce qu'il fait n'arrive jamais en ville.
  const stuck = stuckProducer(world);

  if (stuck && world.isUnlocked('logisticsPost')) {
    return { text: lines.storeStuck.replace('{building}', t().hud.hint.inSentence(t().buildings[stuck.proto].label)), wants: null };
  }

  // Un chantier ou un labo hors du rayon de la mairie, à sec : la ville ne le livrera pas, Ève ne dit pas qu'elle couvre.
  const stranded = strandedBuilding(world);

  if (stranded) {
    return { text: lines.outOfRange.replace('{building}', t().hud.hint.inSentence(t().buildings[stranded.proto].label)), wants: null };
  }

  if (!towers) {
    const tower = viaLab(world, 'watchtower', lines.tower);

    if (tower) return tower;
  }

  // Des ouvriers qui glandent, sans urgence : une maison pour les loger, un bâtiment qui les emploie.
  if (world.census().idle >= IDLE_HINT_MIN) {
    const { housed, population } = world.housing();

    return { text: (housed < population ? lines.idleHousing : lines.idle).replace('{n}', String(world.census().idle)), wants: null };
  }

  // La pierre manque en ville, et rien n'en produit : la carrière, avant que les rochers ne soient vidés.
  if (!has('quarry') && (world.townStock()?.available('stone') ?? 0) === 0) {
    const quarry = viaLab(world, 'quarry', lines.quarry);

    if (quarry) return quarry;
  }

  // L'ère suivante est à portée.
  const next = nextEra(world.era);

  if (next !== null && eraReady(world)) return { text: lines.eraReady.replace('{era}', t().eras[next]!.label), wants: null };

  // Entre deux nuits, tant qu'elle n'est pas là : elle annonce son arrivée.
  if (world.night > 0 && world.night < EVE.arrivalNight && !world.eve()) {
    const left = EVE.arrivalNight - world.night;

    return { text: lines.coming.replace('{n}', String(left)).replace('{s}', t().common.plural(left)), wants: null };
  }

  // Les plaques de fer passent par la forge, et la forge par le labo : après la première nuit, Ève y envoie.
  if (world.night > 0 && !world.isUnlocked('forge')) return { text: has('lab') ? lines.foundry : lines.labForge, wants: null };

  // La forge débloquée au labo : le charbon, jusque-là sans usage, devient un objectif.
  const forged = has('forge');

  if (world.isUnlocked('forge') && !forged) return { text: lines.forge, wants: 'coal' };
  if (forged && !has('charcoalKiln') && (world.townStock()?.available('coal') ?? 0) === 0) return { text: lines.kiln, wants: null };

  return null;
}

/** Le conseil de l'objectif choisi : son attente, s'il n'attend qu'une horloge, sinon sa réplique. */
function selectedAdvice(world: World, selected: ObjectiveId, mutants: number): Advice | null {
  // L'objectif n'attend plus qu'une horloge qui court : le temps qu'il reste, et de quoi s'occuper d'ici là.
  // Une nuit à tenir n'est une attente que de jour : le soir, le conseil de l'objectif dit comment la tenir.
  const wait = mutants === 0 ? objectiveWait(world, selected) : null;

  if (wait && wait.blockedBy === null && (wait.goal.type !== 'nights' || world.clock()?.phase === 'day')) {
    return waitingAdvice(world, wait);
  }

  return objectiveAdvice(world, selected);
}

/** Un chantier (hors mairie) ou un labo qui attend son coût, hors du rayon de la mairie, et que rien ne livre. */
function strandedBuilding(world: World): Entity | null {
  for (const entity of world.entities.values()) {
    if (entity.id === world.townHallId || world.inTownRange(entity)) continue;

    const lines = entity.kind === 'site' ? world.siteLedger(entity) : entity.kind === 'lab' ? world.labLedger(entity) : [];

    if (lines.some((line) => line.dry)) return entity;
  }
  return null;
}

/**
 * Un producteur dont le coffre est plein (`storeFull`) et que rien ne vide :
 * aucun poste de logistique ne le couvre, aucun porteur n'existe en ville.
 */
function stuckProducer(world: World): Building | null {
  const entities = [...world.entities.values()];
  const porters = entities.some((entity) => entity.kind === 'house' && BUILDINGS[entity.proto].workers > 0);

  if (porters) return null;

  const depots = entities.filter((entity): entity is Depot => entity.kind === 'depot');

  for (const entity of entities) {
    if (entity.kind === 'site' || !isProducer(entity) || world.problem(entity) !== 'storeFull') continue;
    if (depots.some((depot) => inDepotRange(depot, entity))) continue;
    return entity;
  }
  return null;
}

/** Le labo n'a pas, ni dans le sac, ni en ville, ni sur son chantier, tout le fer qu'il demande. */
function labIronShort(world: World): boolean {
  const needed = BUILDINGS.lab.cost.ironOre;
  const site = [...world.entities.values()].find((entity) => entity.kind === 'site' && entity.proto === 'lab');
  const delivered = site?.kind === 'site' ? (site.delivered.ironOre ?? 0) : 0;

  return delivered + world.player.inventory.count('ironOre') + (world.townStock()?.available('ironOre') ?? 0) < needed;
}

/**
 * Le conseil d'un objectif : sa réplique, ou, si le bâtiment qu'il demande —
 * ou qui produit ce qu'il demande — n'est pas encore au menu, le chemin du
 * labo qui l'ouvre, tant que la recherche est de l'ère atteinte.
 */
function objectiveAdvice(world: World, id: ObjectiveId): Advice | null {
  const line = t().objectives[id].hint;
  const goal = objectiveProto(id).goals.find((condition) => {
    const { have, need } = goalProgress(world, condition);

    return have < need;
  });
  const building = goal ? goalBuilding(goal) : null;

  // Le puits se pose au bord de l'eau : le repère montre la rive la plus proche.
  // Le labo veut du fer, qu'on n'a pas encore vu : le repère montre le filon.
  const pointTo = building === 'well' ? 'water' : building === 'lab' && labIronShort(world) ? 'ironOre' : null;

  if (building && !world.inMenu(building)) {
    const way = viaLab(world, building, line);

    // Ni au menu ni ouvrable : Ève se tait plutôt que de demander de poser ce qui n'y est pas.
    return way ? { ...way, pointTo } : null;
  }
  return { text: line, wants: null, pointTo };
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

  if (towers < 2 && world.inMenu('watchtower')) {
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
    RESEARCH_IDS.some((id) => world.researchOpen(id) && researchStatus(id, world.researchDone, null, labs) === 'available')
  ) {
    return { text: lines.meanwhileResearch, wants: null };
  }
  return null;
}
