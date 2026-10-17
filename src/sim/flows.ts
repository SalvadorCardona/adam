/**
 * Le tableau de bord de la ville : ce qui entre, ce qui sort, ce qui manque.
 *
 * Une liste de chiffres ne dit pas si l'on est riche ou bloqué : 311
 * minerais de fer peuvent être une réserve, ou le signe que la forge, faute
 * de charbon, n'en prend plus. Ce module répond aux deux questions.
 *
 * - **Débit net** : toutes les `FLOW_SAMPLE_TICKS`, un échantillon du stock
 *   de la ville entre dans un anneau de `FLOW_SAMPLES` cases — deux minutes
 *   de jeu. Le débit d'un objet est l'écart entre le plus ancien et le plus
 *   récent, ramené à la minute.
 * - **Entrées et sorties** : à chaque tick, l'écart du stock avec le tick
 *   d'avant est compté en entrée (ce qui arrive : porteurs, Adam, récoltes)
 *   ou en sortie (ce qui part : chantiers, recettes, repas) ; chaque
 *   échantillon garde les siennes. Production et consommation par minute
 *   s'en déduisent, et leur différence est le débit net.
 * - **Tendance** : la flèche du HUD. Elle lit le débit net de la dernière
 *   minute de jeu (`TREND_SPAN`), pas d'un tick à l'autre, et ne change qu'à
 *   un échantillon ; un seuil d'entrée plus haut que le seuil de sortie
 *   (`TREND_RISE`, `TREND_KEEP`) l'empêche de clignoter autour de zéro. Tout
 *   se compte en ticks : en pause, rien ne bouge.
 * - **Alertes** : une recette qui attend un objet dont la ville manque
 *   (pénurie), ou un gros stock que rien n'utilise (surplus).
 *
 * L'anneau n'est pas de l'état de jeu : il n'est pas sauvegardé, et se
 * remplit de nouveau après un chargement. Les alertes se lisent dans le
 * monde à la demande, sans rien garder.
 */

import { CROPS } from '../data/resources.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { ITEM_IDS, type ItemId } from '../data/items.ts';
import { RECIPES } from '../data/recipes.ts';
import { consumerRecipe, isConsumer, isStarving } from './consumers.ts';
import { labNeeds } from './research.ts';
import type { Store } from './store.ts';
import type { Entity, EntityId, Forge, Nursery } from './types.ts';
import type { World } from './world.ts';

/** Un échantillon du stock de la ville toutes les … ticks (5 s). */
export const FLOW_SAMPLE_TICKS = 100;

/** Échantillons gardés : 24 × 5 s, les deux dernières minutes de jeu. */
export const FLOW_SAMPLES = 24;

/** Au-delà de ce stock, un objet que rien n'utilise est un surplus. */
export const SURPLUS_STOCK = 100;

/** Alertes montrées au plus : le panneau est petit, la première compte. */
export const MAX_ALERTS = 2;

/** La tendance du HUD lit la dernière minute de jeu : 12 intervalles de 5 s. */
export const TREND_SPAN = 12;

/** Une flèche paraît quand le stock a bougé d'au moins tant d'unités sur la minute… */
export const TREND_RISE = 2;

/** … et tient tant qu'il a bougé d'au moins celui-ci, dans le même sens : pas de clignotement autour du seuil. */
export const TREND_KEEP = 1;

const TICKS_PER_MINUTE = 20 * 60;

/** Ce que fait un objet en ville : il monte, il stagne, il baisse. */
export type Trend = 'up' | 'flat' | 'down';

/**
 * Le relevé d'un objet de la ville, pour le panneau des ressources : son
 * stock, sa tendance, ce qui entre et sort par minute sur l'anneau, son
 * stock à chaque échantillon (la mini-courbe) et, s'il baisse, les minutes
 * avant qu'il soit à sec.
 */
export interface ItemFlow {
  item: ItemId;
  stock: number;
  trend: Trend;
  produced: number;
  consumed: number;
  net: number;
  history: readonly number[];
  /** Minutes avant épuisement au débit net de l'anneau ; `null` s'il ne baisse pas. */
  minutesLeft: number | null;
}

/** Un échantillon : le stock de chaque objet, et ce qui est entré et sorti depuis le précédent, dans l'ordre d'`ITEM_IDS`. */
interface Sample {
  stock: number[];
  in: number[];
  out: number[];
}

/**
 * Une alerte : une pénurie (une recette attend ce que la ville n'a pas) ou
 * un surplus (un gros stock que rien n'utilise). `target` est le bâtiment
 * concerné — celui qui attend, ou celui qui produit en trop —, vers lequel
 * le repère de bord pointe. Des faits, pas de phrase : l'UI les dit dans la
 * langue du joueur.
 * - pénurie : `waiting`, la sorte de bâtiment qui attend, et `stock`, ce que
 *   la ville en a ;
 * - surplus : `rate`, le débit net arrondi en unités par minute (0 ou moins :
 *   il ne monte pas), et `stock`.
 */
export type FlowAlert =
  | { kind: 'shortage'; item: ItemId; target: EntityId; waiting: (Nursery | Forge)['kind']; stock: number }
  | { kind: 'surplus'; item: ItemId; target: EntityId; rate: number; stock: number };

export class TownFlows {
  /**
   * Les échantillons, en anneau : `FLOW_SAMPLES` cases allouées une fois, la
   * plus ancienne à `head`, `size` remplies. Un nouvel échantillon recopie
   * ses chiffres dans la plus ancienne.
   */
  private readonly ring: Sample[] = Array.from({ length: FLOW_SAMPLES }, () => ({ stock: ITEM_IDS.map(() => 0), in: ITEM_IDS.map(() => 0), out: ITEM_IDS.map(() => 0) }));
  private head = 0;
  private size = 0;
  /** Le stock du tick d'avant, par objet ; sans valeur (`primed` faux) tant qu'il n'y a pas de ville. */
  private readonly last: number[] = ITEM_IDS.map(() => 0);
  private primed = false;
  /** Entrées et sorties depuis le dernier échantillon. */
  private readonly pendingIn: number[] = ITEM_IDS.map(() => 0);
  private readonly pendingOut: number[] = ITEM_IDS.map(() => 0);
  /** La tendance de chaque objet, décidée à chaque échantillon. */
  private readonly trends: Trend[] = ITEM_IDS.map(() => 'flat');
  private samples = 0;

  /** Monte à chaque échantillon : ce que l'UI montre ne change pas entre deux. */
  public get revision(): number {
    return this.samples;
  }

  /** Le `index`-ième échantillon de l'anneau, du plus ancien (0) au plus récent (`size - 1`). */
  private sample(index: number): Sample {
    return this.ring[(this.head + index) % FLOW_SAMPLES]!;
  }

  /**
   * Appelé à chaque tick : compte ce qui est entré et sorti de la ville
   * depuis le tick d'avant, et l'échantillonne toutes les
   * `FLOW_SAMPLE_TICKS`. Sans ville, tout se vide. N'alloue rien.
   */
  public observe(tick: number, town: Store | null): void {
    if (!town) {
      if (this.primed) this.reset();
      return;
    }

    for (let index = 0; index < ITEM_IDS.length; index += 1) {
      const count = town.count(ITEM_IDS[index]!);

      if (this.primed) {
        const delta = count - this.last[index]!;

        if (delta > 0) this.pendingIn[index]! += delta;
        else if (delta < 0) this.pendingOut[index]! -= delta;
      }
      this.last[index] = count;
    }
    this.primed = true;

    if (tick % FLOW_SAMPLE_TICKS !== 0) return;

    // Anneau plein : la plus ancienne case devient la plus récente.
    const slot = this.ring[(this.head + this.size) % FLOW_SAMPLES]!;

    if (this.size < FLOW_SAMPLES) this.size += 1;
    else this.head = (this.head + 1) % FLOW_SAMPLES;
    for (let index = 0; index < ITEM_IDS.length; index += 1) {
      slot.stock[index] = this.last[index]!;
      slot.in[index] = this.pendingIn[index]!;
      slot.out[index] = this.pendingOut[index]!;
    }
    this.pendingIn.fill(0);
    this.pendingOut.fill(0);
    this.samples += 1;
    this.decideTrends();
  }

  /** Débit net de l'objet en ville, en unités par minute, sur l'anneau ; 0 tant qu'il n'a pas deux échantillons. */
  public netRate(item: ItemId): number {
    if (this.size < 2) return 0;

    const index = ITEM_IDS.indexOf(item);
    const first = this.sample(0);
    const last = this.sample(this.size - 1);
    const ticks = (this.size - 1) * FLOW_SAMPLE_TICKS;

    return ((last.stock[index]! - first.stock[index]!) * TICKS_PER_MINUTE) / ticks;
  }

  /** La flèche du HUD : monte, stagne ou baisse sur la dernière minute de jeu. */
  public trend(item: ItemId): Trend {
    return this.trends[ITEM_IDS.indexOf(item)]!;
  }

  /** Le relevé d'un objet, sur tout l'anneau. */
  public stats(item: ItemId): ItemFlow {
    const index = ITEM_IDS.indexOf(item);
    const ticks = (this.size - 1) * FLOW_SAMPLE_TICKS;
    const history: number[] = [];
    let entered = 0;
    let left = 0;

    for (let at = 0; at < this.size; at += 1) {
      const sample = this.sample(at);

      history.push(sample.stock[index]!);
      // L'entrée du premier échantillon précède l'anneau : elle n'y compte pas.
      if (at === 0) continue;
      entered += sample.in[index]!;
      left += sample.out[index]!;
    }

    const perMinute = (amount: number): number => (ticks > 0 ? (amount * TICKS_PER_MINUTE) / ticks : 0);
    const stock = this.size > 0 ? this.sample(this.size - 1).stock[index]! : 0;
    const net = perMinute(entered - left);

    return {
      item,
      stock,
      trend: this.trends[index]!,
      produced: perMinute(entered),
      consumed: perMinute(left),
      net,
      history,
      minutesLeft: net < 0 ? stock / -net : null,
    };
  }

  /** Les objets que le panneau montre, dans l'ordre d'`ITEM_IDS` : ceux qu'a la ville, et ceux qui ont bougé sur l'anneau. */
  public tracked(): ItemId[] {
    return ITEM_IDS.filter((_, index) => {
      for (let at = 0; at < this.size; at += 1) {
        const sample = this.sample(at);

        if (sample.stock[index]! > 0 || sample.in[index]! > 0 || sample.out[index]! > 0) return true;
      }
      return false;
    });
  }

  /** Tout oublier : sans ville, ou quand le stock a sauté d'un coup (le rattrapage hors ligne). */
  public reset(): void {
    this.head = 0;
    this.size = 0;
    this.primed = false;
    this.pendingIn.fill(0);
    this.pendingOut.fill(0);
    this.trends.fill('flat');
  }

  /**
   * Une flèche paraît au-delà de `TREND_RISE`, et ne tombe que sous
   * `TREND_KEEP` : l'hystérésis évite le clignotement. On lit l'écart du
   * stock sur la minute, pas un débit extrapolé : juste après un chargement,
   * une seule livraison sur cinq secondes ne fait pas une flèche.
   */
  private decideTrends(): void {
    const from = Math.max(0, this.size - 1 - TREND_SPAN);
    const first = this.sample(from).stock;
    const last = this.sample(this.size - 1).stock;

    for (let index = 0; index < ITEM_IDS.length; index += 1) {
      const rate = last[index]! - first[index]!;
      const current = this.trends[index]!;

      if (current === 'up' && rate >= TREND_KEEP) continue;
      if (current === 'down' && rate <= -TREND_KEEP) continue;
      this.trends[index] = rate >= TREND_RISE ? 'up' : rate <= -TREND_RISE ? 'down' : 'flat';
    }
  }

  /**
   * Ce qui bloque la ville, au plus `MAX_ALERTS` : les pénuries d'abord,
   * puis les surplus — ce qui s'empile le plus vite, puis le plus gros
   * stock. Un objet n'a qu'une alerte.
   */
  public alerts(world: World): FlowAlert[] {
    const town = world.townStock();

    if (!town) return [];

    const shortages = this.shortages(world, town);
    const short = new Set(shortages.map((alert) => alert.item));
    const surpluses = this.surpluses(world, town, short);

    return [...shortages, ...surpluses].slice(0, MAX_ALERTS);
  }

  /** Une recette en marche à qui il manque un objet, ni dans son coffre, ni en ville. */
  private shortages(world: World, town: Store): FlowAlert[] {
    const alerts: FlowAlert[] = [];

    for (const entity of world.entities.values()) {
      if (!isConsumer(entity) || entity.paused) continue;

      for (const item of missingInputs(entity, town)) {
        if (alerts.some((alert) => alert.item === item)) continue;
        alerts.push({
          kind: 'shortage',
          item,
          target: entity.id,
          waiting: entity.kind,
          stock: town.count(item),
        });
      }
    }
    return alerts;
  }

  /** Un gros stock dont personne n'a l'usage : ni recette en marche, ni chantier, ni recherche. */
  private surpluses(world: World, town: Store, short: ReadonlySet<ItemId>): FlowAlert[] {
    const found: { alert: FlowAlert; rate: number; stock: number }[] = [];

    for (const item of ITEM_IDS) {
      const stock = town.count(item);

      if (stock <= SURPLUS_STOCK || short.has(item) || used(world, town, item)) continue;

      const rate = Math.round(this.netRate(item));

      found.push({
        alert: {
          kind: 'surplus',
          item,
          target: producerOf(world, item) ?? world.townHallId,
          rate,
          stock,
        },
        rate,
        stock,
      });
    }
    return found.sort((a, b) => b.rate - a.rate || b.stock - a.stock).map(({ alert }) => alert);
  }
}

/** « +28 », « −4 » : le signe toujours, le vrai signe moins. */
export function formatRate(rate: number): string {
  return rate > 0 ? `+${rate}` : `−${-rate}`;
}

/** Les entrées qui manquent à une recette pour son prochain cycle, et que la ville n'a pas non plus. */
function missingInputs(consumer: Nursery | Forge, town: Store): ItemId[] {
  if (!isStarving(consumer)) return [];

  const { inputs } = consumerRecipe(consumer);

  return (Object.entries(inputs) as [ItemId, number][])
    .filter(([item, amount]) => consumer.store.count(item) < amount && town.count(item) < amount)
    .map(([item]) => item);
}

/** Quelqu'un attend-il cet objet : une recette qui tourne, un chantier, une recherche ? */
function used(world: World, town: Store, item: ItemId): boolean {
  for (const entity of world.entities.values()) {
    if (entity.kind === 'site') {
      const cost: Partial<Record<ItemId, number>> = BUILDINGS[entity.proto].cost;

      if ((cost[item] ?? 0) > (entity.delivered[item] ?? 0)) return true;
    } else if (entity.kind === 'lab') {
      if (labNeeds(entity, item) > 0) return true;
    } else if (isConsumer(entity) && !entity.paused) {
      // Une forge qui manque de charbon ne prend plus de fer : elle n'utilise rien.
      if ((consumerRecipe(entity).inputs[item] ?? 0) > 0 && missingInputs(entity, town).length === 0) return true;
    }
  }
  return false;
}

/** Le premier bâtiment qui produit cet objet : la foreuse sur son filon, ou le bâtiment d'une recette qui le sort. */
function producerOf(world: World, item: ItemId): EntityId | null {
  for (const entity of world.entities.values()) {
    if (entity.kind === 'site') continue;
    if (entity.kind === 'drill' ? entity.output === item : producesItem(entity, item)) return entity.id;
  }
  return null;
}

function producesItem(entity: Entity, item: ItemId): boolean {
  if (entity.kind === 'lumberCamp') return item === 'wood';
  // La ferme n'a pas de recette : ses fermiers récoltent le blé de son champ.
  if (entity.kind === 'farm') return item === CROPS.item;
  return Object.values(RECIPES).some((recipe) => recipe.building === entity.proto && item in recipe.outputs);
}
