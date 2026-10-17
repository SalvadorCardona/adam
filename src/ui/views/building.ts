/**
 * Le tronc commun d'un bâtiment debout : points de vie, réparation, pause,
 * ouvriers, « Transférer », zone d'échange, lits, coffre, niveau suivant,
 * forge d'équipement. Chaque sorte n'y ajoute que ce qui est à elle
 * (`BuildingSpec`) : ses puces et ses lignes, et ce qu'elle change au reste.
 */

import { BUILDINGS, REPAIR, bedsOf, buildingLevel } from '../../data/buildings.ts';
import { canPause } from '../../sim/staffing.ts';
import type { Building } from '../../sim/types.ts';
import { repairCost } from '../../sim/world.ts';
import { t } from '../../i18n/locale.ts';
import { itemAmount } from '../icons.ts';
import type { BuildingContext, EntityView, TimerStyle } from './types.ts';

/** Ce qu'une sorte de bâtiment ajoute au tronc commun ; tout est facultatif. */
export interface BuildingSpec<E extends Building> {
  readonly timer?: TimerStyle;
  /** Son coffre est le stock de la ville : la zone d'échange le dit (la mairie). */
  readonly town?: boolean;
  /** Ses puces et ses lignes, après la ligne de réparation et avant celles des lits. */
  describe?(context: BuildingContext<E>): void;
  /** « Transférer » la remplit : elle consomme (nurserie, forge) ou attend son étage suivant (antenne). */
  supplied?(entity: E): boolean;
  /** Son coffre, quand il n'a pas de zone d'échange et ne se lit pas en objets (jauges de l'antenne, rien au labo). */
  chest?(context: BuildingContext<E>): void;
}

/** La vue d'un bâtiment debout : le tronc commun, plus ce que dit `spec`. */
export function buildingView<E extends Building>(spec: BuildingSpec<E> = {}): EntityView<E> {
  return {
    timer: spec.timer ?? 'plain',
    render(base) {
      const { world, entity, inReach, text, lines, stats, host } = base;
      const { buttons } = host;
      const proto = BUILDINGS[entity.proto];
      const level = buildingLevel(entity.proto, entity.level);
      const meterValue = `${entity.hp}/${level.hp}`;
      const context: BuildingContext<E> = {
        ...base,
        level,
        full: world.problem(entity) === 'storeFull',
        stopped: world.stopped(entity),
      };

      // Abîmé : le bouton dit ce que coûte la remise à neuf, la ligne dit comment s'en passer.
      const cost = repairCost(entity);
      const stock = world.repairStock(entity);
      const material = t().items[REPAIR.item];

      if (cost > 0) {
        lines.push(stock === 0 ? text.repair.noStock(material, REPAIR.hp) : text.repair.damaged(material, REPAIR.hp));
      }
      buttons.repair.hidden = cost === 0;
      buttons.repair.disabled = !inReach || stock === 0;
      const repairCostLabel = text.repair.buttonCost(stock > 0 ? Math.min(cost, stock) : cost, material);

      if (buttons.repair.getAttribute('aria-label') !== repairCostLabel) {
        // « Réparer · 🪵1 » : le coût en icône à droite, sans parenthèses.
        buttons.repair.setAttribute('aria-label', repairCostLabel);
        buttons.repair.replaceChildren(text.repair.button, itemAmount(REPAIR.item, stock > 0 ? Math.min(cost, stock) : cost));
      }

      // Seule la mairie mène d'une ère à l'autre : sa vue montre le bouton.
      buttons.era.hidden = true;

      buttons.pause.hidden = !canPause(entity.proto);
      buttons.pause.textContent = entity.paused ? text.resume : text.pause;
      buttons.pause.dataset['tone'] = entity.paused ? 'resume' : 'pause';
      host.refreshCrew(entity);
      // Seule une décoration se retire : sa vue montre le bouton.
      buttons.cancel.hidden = true;
      buttons.cancel.textContent = text.decor.remove;
      buttons.transfer.hidden = !(spec.supplied?.(entity) ?? false);
      buttons.transfer.textContent = world.inTownRange(entity) ? text.transferButton : text.transferBag;
      buttons.transfer.disabled = !inReach || !world.canSupply(entity);

      // Un coffre où échanger : la mairie, un producteur, une forge, une nurserie.
      const rules = world.transferRules(entity);

      host.setInventory(rules !== null);
      host.exchange.show(
        rules && {
          id: entity.id,
          store: entity.store,
          rules,
          title: spec.town ? text.chest.town : text.chest.plain,
          icon: spec.town ? 'town' : 'chest',
          reachable: inReach,
        },
      );

      spec.describe?.(context);

      // Ses lits : combien sont pris, sur combien — sa part de l'Habitation.
      const beds = bedsOf(entity.proto, entity.level);

      if (beds > 0) {
        const used = world.sleepersIn(entity.id).length;

        stats.push({ icon: 'home', value: `${used}/${beds}`, label: text.house.bedsTaken(used, beds) });
      }

      // Le coffre de la mairie est le stock de la ville. Un coffre où échanger se lit dans la zone d'échange,
      // celui du labo dans le panneau Recherche, celui de l'antenne en jauges de son étage suivant, comme un chantier.
      if (rules) {
        host.stock.hidden = true;
        host.setItems([], 'exchange');
      } else if (spec.chest) {
        spec.chest(context);
      } else if (proto.storage > 0) {
        const capacity = Number.isFinite(proto.storage) ? `/${proto.storage}` : '';
        const entries = entity.store.entries();
        const label = text.chest.label(`${entity.store.total()}${capacity}`);
        // Sans plafond, un coffre ne dit son compte que vide.
        const count = entries.length === 0 ? text.chest.empty : capacity ? `${entity.store.total()}${capacity}` : '';

        host.stock.hidden = false;
        host.stock.setAttribute('aria-label', entries.length ? label : text.chest.emptyLabel(label));
        host.stock.title = label;
        if (host.stockCount.textContent !== count) host.stockCount.textContent = count;
        host.setItems(
          entries.map(([item, amount]) => itemAmount(item, amount)),
          `store:${entity.id}:${entries.map(([item, amount]) => `${item}=${amount}`).join(',')}`,
        );
      } else {
        noChest(context);
      }
      host.refreshUpgrade(entity, inReach);
      host.refreshGear(entity, inReach);
      host.tools.refresh(entity, inReach);

      return { ratio: entity.hp / level.hp, barClass: 'hp', value: meterValue, label: text.hp(meterValue) };
    },
  };
}

/** Pas de coffre à montrer. */
export function noChest({ host }: BuildingContext<Building>): void {
  host.stock.hidden = true;
  host.setItems([], 'none');
}
