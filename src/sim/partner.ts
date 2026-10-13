/**
 * L'ami, quand on joue à deux.
 *
 * La partie tourne chez l'hôte, qui fait autorité ; l'ami rejoue chez lui
 * les mêmes commandes, aux mêmes ticks (`net/lockstep.ts`). Son personnage
 * vit donc dans la simulation, comme Adam : une position, un sac, un pas, et
 * les mêmes gestes — il récolte de proximité, heurte les chantiers, bâtit,
 * porte, échange avec les coffres. Il ne tire pas, ne se fait pas mordre, ne
 * meurt pas : les bêtes et les mutants n'en veulent qu'à Adam.
 *
 * Ses commandes entrent enveloppées (`asPartner`) : le monde les applique
 * avec l'ami comme acteur. Seules celles de `PARTNER_COMMANDS` passent — rien
 * de ce qui touche à Adam lui-même (son arc, sa garde-robe), ni les réglages
 * de l'hôte (bonus, rattrapage, brouillard). `parsePartnerCommand` le vérifie
 * sur ce qui arrive du réseau : un message douteux ne devient jamais une
 * commande.
 */

import { BUILDING_IDS } from '../data/buildings.ts';
import { COMPANION_CLASS_IDS } from '../data/companions.ts';
import { ITEM_IDS, type ItemId } from '../data/items.ts';
import { RESEARCH_IDS } from '../data/research.ts';
import { WORK_PRIORITIES } from '../data/workers.ts';
import type { Command } from './commands.ts';
import { TRANSFER_QUANTITIES } from './transfer.ts';
import type { Player } from './types.ts';

export { PARTNER_LOOK } from '../data/wardrobe.ts';

/** L'ami et ce que son pas retient d'un tick à l'autre — ce qu'Adam garde dans le monde lui-même. */
export interface Partner {
  /** Son pseudo, affiché au-dessus de lui. */
  name: string;
  player: Player;
  /** L'axe de son joystick, dans [-1, 1]. */
  moveX: number;
  moveY: number;
  /** La tuile contre laquelle il pousse, et depuis combien de ticks (`handleContact`). */
  contactKey: string;
  contactTicks: number;
}

/** Le pseudo, au plus long : celui d'un compte (`ACCOUNT_LIMITS.nickname.max`). */
export const PARTNER_NAME_MAX = 20;

/**
 * Ce que l'ami peut faire : ses gestes, et les réglages de la colonie qu'on
 * partage (ouvriers, pause, recherche, ère). Pas l'arc d'Adam
 * (`craftGear`), pas sa garde-robe, pas ce que l'hôte seul pousse.
 */
export const PARTNER_COMMANDS: ReadonlySet<Command['type']> = new Set<Command['type']>([
  'setMoveAxis',
  'placeBuilding',
  'transferToSite',
  'takeFromBuilding',
  'supplyBuilding',
  'depositToTown',
  'transferItems',
  'dropItem',
  'startResearch',
  'cancelResearch',
  'dequeueResearch',
  'transferToLab',
  'upgradeBuilding',
  'removeDecor',
  'advanceEra',
  'renameInhabitant',
  'recruitCompanion',
  'repairBuilding',
  'pauseBuilding',
  'setWorkers',
  'setPriority',
  'cancelSite',
  'trade',
]);

type Fields = Record<string, unknown>;

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const isAxis = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1;
const isOneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);
const isItem = (value: unknown): value is ItemId => isOneOf(ITEM_IDS, value);
const optionalItem = (value: unknown): value is ItemId | undefined => value === undefined || isItem(value);
const optionalAmount = (value: unknown): value is number | undefined => value === undefined || (isInt(value) && value > 0);

/**
 * Une commande de l'ami, lue sur le réseau : sa forme exacte, ses ids connus,
 * ou `null`. Les objets visés (bâtiment, labo, caravane) peuvent ne plus
 * exister : le monde le refuse alors comme pour Adam.
 */
export function parsePartnerCommand(value: unknown): Command | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const raw = value as Fields;
  const type = raw['type'];

  if (typeof type !== 'string' || !PARTNER_COMMANDS.has(type as Command['type'])) return null;

  const id = raw['id'];

  switch (type as Command['type']) {
    case 'setMoveAxis':
      return isAxis(raw['x']) && isAxis(raw['y']) ? { type: 'setMoveAxis', x: raw['x'], y: raw['y'] } : null;

    case 'placeBuilding': {
      const { building, tx, ty } = raw;

      return isOneOf(BUILDING_IDS, building) && isInt(tx) && isInt(ty) ? { type: 'placeBuilding', building: building, tx, ty } : null;
    }

    case 'transferToSite':
    case 'takeFromBuilding':
    case 'supplyBuilding':
    case 'transferToLab':
    case 'upgradeBuilding':
    case 'removeDecor':
    case 'repairBuilding':
    case 'cancelSite':
      return isInt(id) ? ({ type, id } as Command) : null;

    case 'depositToTown':
    case 'dropItem': {
      const { item, amount } = raw;

      if (!optionalItem(item) || !optionalAmount(amount)) return null;

      return { type, ...(item !== undefined && { item }), ...(amount !== undefined && { amount }) } as Command;
    }

    case 'transferItems': {
      const { direction, quantity, item } = raw;

      if (!isInt(id) || (direction !== 'take' && direction !== 'deposit') || !isOneOf(TRANSFER_QUANTITIES, quantity) || !optionalItem(item)) return null;

      return {
        type: 'transferItems',
        id,
        direction: direction,
        quantity: quantity,
        ...(item !== undefined && { item }),
      };
    }

    case 'startResearch':
    case 'dequeueResearch': {
      const { lab, research } = raw;

      return isInt(lab) && isOneOf(RESEARCH_IDS, research) ? ({ type, lab, research: research } as Command) : null;
    }

    case 'cancelResearch':
      return isInt(raw['lab']) ? { type: 'cancelResearch', lab: raw['lab'] } : null;

    case 'advanceEra':
      return { type: 'advanceEra' };

    case 'renameInhabitant': {
      const { name } = raw;

      return isInt(id) && typeof name === 'string' && name.length <= 64 ? { type: 'renameInhabitant', id, name } : null;
    }

    case 'recruitCompanion': {
      const { barracks, role } = raw;

      return isInt(barracks) && isOneOf(COMPANION_CLASS_IDS, role) ? { type: 'recruitCompanion', barracks, role: role } : null;
    }

    case 'pauseBuilding':
      return isInt(id) && typeof raw['paused'] === 'boolean' ? { type: 'pauseBuilding', id, paused: raw['paused'] } : null;

    case 'setWorkers':
      return isInt(id) && isInt(raw['count']) ? { type: 'setWorkers', id, count: raw['count'] } : null;

    case 'setPriority':
      return isInt(id) && isOneOf(WORK_PRIORITIES, raw['priority']) ? { type: 'setPriority', id, priority: raw['priority'] } : null;

    case 'trade': {
      const { caravan, offer } = raw;

      return isInt(caravan) && isInt(offer) ? { type: 'trade', caravan, offer } : null;
    }

    default:
      return null;
  }
}

/** Le pseudo affiché : nettoyé, coupé, jamais vide. */
export function partnerName(raw: string): string {
  const name = raw.trim().replace(/\s+/gu, ' ').slice(0, PARTNER_NAME_MAX);

  return name === '' ? '?' : name;
}
