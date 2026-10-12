/**
 * Jobs de transport : qui porte quoi, d'où, vers où — et les réservations.
 *
 * C'est là que les jeux de colonie se cassent : deux porteurs qui partent
 * chercher le même tas, ou qui livrent tous les deux un chantier qui n'avait
 * de place que pour un. La parade : **réserver à la création du job**. Le
 * stock est marqué sortant à la source (`Store.reserveOut`), la place
 * réservée à l'arrivée (`Store.reserveIn`, ou le registre des chantiers) ;
 * si la seconde réservation échoue, la première est annulée. Un job est une
 * promesse déjà couverte des deux côtés, et toute décision se prend sur
 * `available()` et la place libre, jamais sur le stock brut : un second job
 * ne voit plus ce qui est promis. Le bug n'existe pas, structurellement.
 *
 * Un chantier n'a pas de coffre : ce qui lui est promis tient dans le
 * registre `incoming` de ce tableau. Ce registre n'est pas sauvegardé — il se
 * recalcule depuis les jobs des ouvriers (`rebuild`), comme les réservations
 * des coffres, dont la sauvegarde ne garde que le stock réel.
 *
 * Premier périmètre : livrer les chantiers, l'étage suivant de l'antenne, le labo de recherche, les forges
 * (la forge, le four à charbon) et la nurserie depuis la mairie — un
 * consommateur aussi depuis une ferme voisine (`demandOffers`) —, et vider
 * dans la mairie les coffres des foreuses, des fermes et des cabanes de
 * bûcheron, et les sorties des forges — plaques, charbon.
 *
 * Trois équipes se partagent le travail (`Crew`). Un producteur dans le rayon
 * d'un poste de logistique fini est à ses logisticiens, qui le vident, le
 * coffre le plus rempli d'abord — après avoir servi la demande des
 * consommateurs de leur rayon : nourrir la nurserie passe avant. Un chantier dans le rayon d'un poste de
 * construction qui tourne est à ses bâtisseurs, qui ne font que ça : le plus
 * ancien d'abord. Les porteurs livrent le labo, la forge, la nurserie et les
 * chantiers qu'aucun poste de construction ne couvre, et ne vident que les
 * producteurs qu'aucun poste de logistique ne couvre.
 */

import { TILE_SIZE, distanceSq } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { BUILDERS, JOB_PRIORITY, LOGISTICIANS, PORTERS, SUPPLY } from '../data/workers.ts';
import { floorCost, floorWants } from './antenna.ts';
import { labSurplus, labWants, researchCost } from './research.ts';
import { consumerDemands, forgeOutputs, isConsumer } from './consumers.ts';
import { priorityRank } from './staffing.ts';
import type { Store } from './store.ts';
import type { Depot, Drill, Entity, EntityId, Farm, Forge, Job, LumberCamp, Nursery, PigPen, Quarry, Site, TownHall, Yard } from './types.ts';

/** Le trajet en ligne droite de (x0, y0) à (x1, y1) est-il praticable ? */
export type LineTest = (x0: number, y0: number, x1: number, y1: number) => boolean;

/** Un transport pas encore réservé : ce que le tableau propose. */
type Offer = Omit<Job, 'carried'>;

/**
 * Qui cherche du travail : un porteur (maison des constructeurs, ex-mutant
 * de la clinique), un logisticien ou un bâtisseur, avec le poste qui le loge.
 */
export type Crew = { kind: 'porter' } | { kind: 'logistician'; depot: Depot } | { kind: 'builder'; yard: Yard };

export const PORTER_CREW: Crew = { kind: 'porter' };

type Footprint = { tx: number; ty: number; width: number; height: number };

/** `entity` est-il à `radius` tuiles de `post` ? Mesuré de centre d'emprise à centre d'emprise, comme le cercle affiché. */
function inRadius(post: Footprint, entity: Footprint, radius: number): boolean {
  const reach = radius * TILE_SIZE;
  const x = (post.tx + post.width / 2) * TILE_SIZE;
  const y = (post.ty + post.height / 2) * TILE_SIZE;

  return distanceSq(x, y, (entity.tx + entity.width / 2) * TILE_SIZE, (entity.ty + entity.height / 2) * TILE_SIZE) <= reach * reach;
}

/** Le producteur est-il dans le rayon du poste de logistique ? */
export function inDepotRange(depot: Depot, entity: Footprint): boolean {
  return inRadius(depot, entity, LOGISTICIANS.radius);
}

/** Le chantier est-il dans le rayon du poste de construction ? */
export function inYardRange(yard: Yard, entity: Footprint): boolean {
  return inRadius(yard, entity, BUILDERS.radius);
}

/**
 * Le poste de construction tourne-t-il ? En pause, ou réglé à zéro
 * bâtisseur, il ne couvre plus rien : ses chantiers reviennent aux porteurs
 * et à Adam. Tout bâtiment qui emploie apporte ses ouvriers à la population,
 * aussi un poste réglé à `staff` en a-t-il toujours `staff` en poste
 * (`sim/staffing.ts`).
 */
export function yardWorks(yard: Yard): boolean {
  return !yard.paused && yard.staff > 0;
}

/** Le travail d'un chantier, en ticks de bâtisseur : `BUILDERS.workPerItem` par objet de son coût. */
export function siteWork(site: Site): number {
  const cost: Partial<Record<ItemId, number>> = BUILDINGS[site.proto].cost;
  let items = 0;

  for (const amount of Object.values(cost)) items += amount;
  return items * BUILDERS.workPerItem;
}

/** Un bâtiment qui produit dans son coffre, et que porteurs ou logisticiens vident dans la mairie. */
export function isProducer(entity: Entity): entity is Drill | Farm | Quarry | PigPen | LumberCamp {
  return entity.kind === 'drill' || entity.kind === 'farm' || entity.kind === 'quarry' || entity.kind === 'pigPen' || entity.kind === 'lumberCamp';
}

/**
 * Le seuil d'une emprise : le milieu de son bord bas, juste dehors. C'est
 * là qu'un porteur ramasse, dépose, et rentre chez lui.
 */
export function doorOf(entity: { tx: number; ty: number; width: number; height: number }): { x: number; y: number } {
  return { x: (entity.tx + entity.width / 2) * TILE_SIZE, y: (entity.ty + entity.height) * TILE_SIZE + 6 };
}

export class JobBoard {
  /** Ce qui est déjà promis à chaque chantier, par objet. */
  private readonly incoming = new Map<EntityId, Map<ItemId, number>>();

  /** Ce qu'un job en route apporte déjà au chantier. */
  public siteIncoming(id: EntityId, item: ItemId): number {
    return this.incoming.get(id)?.get(item) ?? 0;
  }

  /** Ce que le chantier attend encore et que personne n'apporte : la « place libre » d'un chantier. */
  public siteWants(site: Site, item: ItemId): number {
    const needed = (BUILDINGS[site.proto].cost as Partial<Record<ItemId, number>>)[item] ?? 0;

    return Math.max(0, needed - (site.delivered[item] ?? 0) - this.siteIncoming(site.id, item));
  }

  /**
   * Le meilleur job pour un porteur en (x, y), déjà réservé des deux côtés,
   * ou `null`. Le plus prioritaire d'abord, puis la source la plus proche ;
   * un trajet qui traverserait l'eau — jusqu'à la source, jusqu'à la
   * destination, puis jusqu'à la maison — n'est pas proposé. `carry` : ce
   * que le porteur prend en un voyage.
   *
   * Un logisticien ne regarde que les bâtiments de son rayon. Il sert
   * d'abord la demande des consommateurs — la nurserie à nourrir —, puis va
   * au coffre le plus rempli — ce qui reste à prendre, rapporté à sa
   * capacité — avant le plus proche : un coffre plein, qui bloque son
   * producteur, passe avant les autres.
   *
   * Avant tout cela, la priorité de travail du bâtiment servi — vidé ou
   * livré — : Haute passe devant Moyenne, qui passe devant Basse.
   *
   * Un bâtisseur ne regarde que les chantiers de son rayon, le plus ancien —
   * le plus petit id — d'abord : les chantiers se finissent dans l'ordre où
   * on les a posés. Si la mairie n'a rien de ce qu'il attend, il passe au suivant.
   */
  public assign(
    entities: ReadonlyMap<EntityId, Entity>,
    hallId: EntityId,
    from: { x: number; y: number },
    home: { x: number; y: number },
    clear: LineTest,
    carry: number = PORTERS.carry,
    crew: Crew = PORTER_CREW,
  ): Job | null {
    const offers = this.offers(entities, hallId, carry, crew).map((offer) => {
      const source = entities.get(offer.from)!;
      const door = doorOf(source);
      const feeds = crew.kind === 'logistician' && offer.to !== hallId ? 1 : 0;
      const fill = crew.kind === 'logistician' && !feeds && source.kind !== 'site' ? fillOf(source.store) : 0;
      // Le bâtiment servi — celui qui n'est pas la mairie, le consommateur livré par une ferme voisine — passe devant selon sa priorité de travail.
      const served = offer.to === hallId ? source : entities.get(offer.to)!;
      const rank = priorityRank(served.kind === 'site' ? undefined : served.priority);

      return { offer, door, feeds, fill, rank, distance: distanceSq(from.x, from.y, door.x, door.y) };
    });

    const age = (offer: Offer): number => (crew.kind === 'builder' ? offer.to : 0);

    offers.sort(
      (a, b) =>
        b.rank - a.rank ||
        b.feeds - a.feeds ||
        b.fill - a.fill ||
        age(a.offer) - age(b.offer) ||
        b.offer.priority - a.offer.priority ||
        a.distance - b.distance,
    );

    for (const { offer, door } of offers) {
      const target = doorOf(entities.get(offer.to)!);

      if (!clear(from.x, from.y, door.x, door.y)) continue;
      if (!clear(door.x, door.y, target.x, target.y)) continue;
      if (!clear(target.x, target.y, home.x, home.y)) continue;

      const job: Job = { ...offer, carried: false };

      if (this.open(entities, job)) return job;
    }
    return null;
  }

  /**
   * Tout ce qu'il y aurait à porter pour cette équipe, calculé sur le
   * disponible et la place libre, jamais sur le stock brut.
   */
  private offers(entities: ReadonlyMap<EntityId, Entity>, hallId: EntityId, carry: number, crew: Crew): Offer[] {
    const hall = entities.get(hallId);

    // Pas de mairie debout, pas d'entrepôt : rien à porter.
    if (hall?.kind !== 'townHall') return [];

    const offers: Offer[] = [];
    const depots: Depot[] = [];
    const yards: Yard[] = [];
    const producers: (Drill | Farm | Quarry | PigPen | LumberCamp)[] = [];

    for (const entity of entities.values()) {
      if (entity.kind === 'depot') depots.push(entity);
      if (entity.kind === 'yard' && yardWorks(entity)) yards.push(entity);
      if (isProducer(entity) && (crew.kind !== 'logistician' || inDepotRange(crew.depot, entity))) producers.push(entity);
    }

    for (const entity of entities.values()) {
      if (crew.kind === 'logistician') {
        // Le logisticien sert les consommateurs de son rayon, et vide ses producteurs.
        if (!inDepotRange(crew.depot, entity)) continue;
        if (isConsumer(entity)) this.demandOffers(entity, hall, producers, carry, offers);
        if (isProducer(entity)) this.emptyOffers(entity, hall, carry, offers);
        continue;
      }

      if (crew.kind === 'builder') {
        // Le bâtisseur ne fait qu'un travail : livrer les chantiers de son rayon.
        if (entity.kind === 'site' && inYardRange(crew.yard, entity)) this.siteOffers(entity, hall, carry, offers);
        continue;
      }

      switch (entity.kind) {
        case 'site':
          // Un poste de construction couvre ce chantier : ses bâtisseurs s'en chargent.
          if (yards.some((yard) => inYardRange(yard, entity))) break;
          this.siteOffers(entity, hall, carry, offers);
          break;

        case 'lab':
          // Ce que la recherche attend, depuis la mairie, comme un chantier ; le reste d'une recherche abandonnée y retourne.
          for (const [item] of entity.research === null ? [] : researchCost(entity.research)) {
            const amount = Math.min(carry, labWants(entity, item), hall.store.available(item), entity.store.freeSpace());

            if (amount > 0) offers.push({ from: hall.id, to: entity.id, item, amount, priority: JOB_PRIORITY.site });
          }
          for (const [item] of entity.store.entries()) {
            const amount = Math.min(carry, labSurplus(entity, item), hall.store.freeSpace());

            if (amount > 0) offers.push({ from: entity.id, to: hall.id, item, amount, priority: JOB_PRIORITY.surplus });
          }
          break;

        case 'antenna':
          // L'étage suivant se livre comme un chantier, depuis la mairie.
          for (const [item] of floorCost(entity)) {
            const amount = Math.min(carry, floorWants(entity, item), hall.store.available(item), entity.store.freeSpace());

            if (amount > 0) offers.push({ from: hall.id, to: entity.id, item, amount, priority: JOB_PRIORITY.site });
          }
          break;

        case 'forge':
        case 'nursery':
          // Ce que la forge a produit — plaques, charbon du four — part à la mairie, même en pause.
          if (entity.kind === 'forge') this.outputOffers(entity, hall, carry, offers);
          this.demandOffers(entity, hall, producers, carry, offers);
          break;

        case 'drill':
        case 'farm':
        case 'quarry':
        case 'pigPen':
        case 'lumberCamp':
          // Un poste de logistique couvre ce producteur : ses logisticiens s'en chargent.
          if (depots.some((depot) => inDepotRange(depot, entity))) break;
          this.emptyOffers(entity, hall, carry, offers);
          break;

        default:
          break;
      }
    }
    return offers;
  }

  /** Livrer un chantier depuis la mairie : un voyage par objet qu'il attend encore et que la mairie a. */
  private siteOffers(site: Site, hall: TownHall, carry: number, offers: Offer[]): void {
    for (const item of Object.keys(BUILDINGS[site.proto].cost) as ItemId[]) {
      const amount = Math.min(carry, this.siteWants(site, item), hall.store.available(item));

      if (amount > 0) offers.push({ from: hall.id, to: site.id, item, amount, priority: JOB_PRIORITY.site });
    }
  }

  /**
   * Servir la demande d'un consommateur (`consumerDemands`) : depuis la
   * mairie, ou directement depuis le coffre d'un producteur voisin
   * (`SUPPLY.producerReach`) qui a l'objet. Chaque source propose au plus ce
   * qui manque ; le tableau n'en ouvre qu'une, et la demande suivante se
   * recalcule sur ce qui est déjà en route : rien n'est promis deux fois.
   */
  private demandOffers(
    consumer: Nursery | Forge,
    hall: TownHall,
    producers: readonly (Drill | Farm | Quarry | PigPen | LumberCamp)[],
    carry: number,
    offers: Offer[],
  ): void {
    for (const { item, amount: wanted, priority } of consumerDemands(consumer)) {
      const fromHall = Math.min(carry, wanted, hall.store.available(item));

      if (fromHall > 0) offers.push({ from: hall.id, to: consumer.id, item, amount: fromHall, priority });

      for (const producer of producers) {
        if (!inRadius(consumer, producer, SUPPLY.producerReach)) continue;

        const amount = Math.min(carry, wanted, producer.store.available(item));

        if (amount > 0) offers.push({ from: producer.id, to: consumer.id, item, amount, priority });
      }
    }
  }

  /** Vider le coffre d'un producteur dans la mairie : un voyage par objet qu'il contient. */
  private emptyOffers(entity: Drill | Farm | Quarry | PigPen | LumberCamp, hall: TownHall, carry: number, offers: Offer[]): void {
    for (const [item] of entity.store.entries()) {
      const available = entity.store.available(item);
      const amount = Math.min(carry, available, hall.store.freeSpace());

      if (amount <= 0) continue;

      const priority = available >= carry ? JOB_PRIORITY.empty : JOB_PRIORITY.surplus;

      offers.push({ from: entity.id, to: hall.id, item, amount, priority });
    }
  }

  /** Vider les sorties d'une forge dans la mairie — ses entrées restent au four. */
  private outputOffers(forge: Forge, hall: TownHall, carry: number, offers: Offer[]): void {
    for (const item of forgeOutputs(forge)) {
      const available = forge.store.available(item);
      const amount = Math.min(carry, available, hall.store.freeSpace());

      if (amount <= 0) continue;

      const priority = available >= carry ? JOB_PRIORITY.empty : JOB_PRIORITY.surplus;

      offers.push({ from: forge.id, to: hall.id, item, amount, priority });
    }
  }

  /**
   * Réserve les deux côtés du job : la sortie à la source (sauf si la charge
   * est déjà ramassée), puis la place à l'arrivée. Si la seconde échoue, la
   * première est annulée — rien ne reste à moitié promis.
   */
  public open(entities: ReadonlyMap<EntityId, Entity>, job: Job): boolean {
    const source = entities.get(job.from);

    if (!job.carried) {
      if (!source || source.kind === 'site' || !source.store.reserveOut(job.item, job.amount)) return false;
    }

    if (this.reserveIn(entities.get(job.to), job.item, job.amount)) return true;

    if (!job.carried && source && source.kind !== 'site') source.store.releaseOut(job.item, job.amount);
    return false;
  }

  private reserveIn(target: Entity | undefined, item: ItemId, amount: number): boolean {
    if (!target) return false;
    if (target.kind !== 'site') return target.store.reserveIn(item, amount);
    if (this.siteWants(target, item) < amount) return false;

    const promised = this.incoming.get(target.id) ?? new Map<ItemId, number>();

    promised.set(item, (promised.get(item) ?? 0) + amount);
    this.incoming.set(target.id, promised);
    return true;
  }

  /**
   * Libère la place réservée à l'arrivée. Un chantier achevé entre-temps
   * garde le même id : sa promesse est toujours dans le registre.
   */
  public releaseIn(entities: ReadonlyMap<EntityId, Entity>, job: Job): void {
    const promised = this.incoming.get(job.to);
    const current = promised?.get(job.item) ?? 0;

    if (promised && current > 0) {
      const left = current - job.amount;

      if (left > 0) promised.set(job.item, left);
      else promised.delete(job.item);
      if (promised.size === 0) this.incoming.delete(job.to);
      return;
    }

    const target = entities.get(job.to);

    if (target && target.kind !== 'site') target.store.releaseIn(job.item, job.amount);
  }

  /** Abandonne un job : les deux réservations sont rendues. */
  public cancel(entities: ReadonlyMap<EntityId, Entity>, job: Job): void {
    const source = entities.get(job.from);

    if (!job.carried && source && source.kind !== 'site') source.store.releaseOut(job.item, job.amount);
    this.releaseIn(entities, job);
  }

  /**
   * Après un chargement : les coffres ne savent plus ce qui leur était
   * promis, le registre des chantiers est vide. Les jobs des ouvriers, eux,
   * sont sauvegardés — on rejoue leurs réservations.
   */
  public rebuild(entities: ReadonlyMap<EntityId, Entity>, jobs: Iterable<Job>): Job[] {
    const broken: Job[] = [];

    this.incoming.clear();
    for (const job of jobs) {
      if (!this.open(entities, job)) broken.push(job);
    }
    return broken;
  }
}

/** La part du coffre qui reste à prendre — ce qu'aucun job n'a déjà promis —, de 0 (vide) à 1 (plein). */
function fillOf(store: Store): number {
  let available = 0;

  for (const [item] of store.entries()) available += store.available(item);
  return store.capacity > 0 && store.capacity !== Infinity ? available / store.capacity : 0;
}
