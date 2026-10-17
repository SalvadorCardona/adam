/**
 * Le relevé d'un chantier dans sa fenêtre, une ligne par objet : icône et
 * « livré/requis », puis ce qui est en route et ce que la ville en a. La
 * fenêtre du labo montre le même pour le coût de sa recherche.
 */

import type { UiIcon } from '../art/ui.ts';
import { t } from '../i18n/locale.ts';
import type { SiteLine } from '../sim/siteLedger.ts';
import { itemAmount, uiIcon } from './icons.ts';

/**
 * La ligne d'un objet du chantier : son icône et « livré/requis », puis, s'il
 * en manque, deux puces — en route (porteurs, bâtisseurs) et en ville. Un
 * objet que la ville n'a plus et que personne n'apporte est marqué à sec.
 */
export function siteNeedRow(line: SiteLine): HTMLElement {
  const row = document.createElement('div');

  row.className = 'site-need';
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', siteNeedLabel(line));
  row.title = siteNeedLabel(line);
  row.dataset['dry'] = String(line.dry);
  row.append(itemAmount(line.item, line.needed, line.delivered));
  if (line.done) return row;

  row.append(siteNeedChip('worker', line.incoming, 'coming'));
  if (line.inTown !== null) row.append(siteNeedChip('town', line.inTown, 'town'));
  return row;
}

/**
 * L'en-tête du relevé, comme celui d'un tableau : livré · en route · en ville,
 * en pictogramme et en texte court, sur la grille des lignes. L'antenne, qui
 * n'a que le livré, passe `false`.
 */
export function siteNeedHeader(withFlows = true): HTMLElement {
  const head = document.createElement('div');
  const text = t().panel.site.needHeader;

  head.className = 'site-need site-need-head';
  head.setAttribute('aria-hidden', 'true');
  head.append(headCell('chest', text.delivered));
  if (withFlows) head.append(headCell('worker', text.incoming), headCell('town', text.town));
  return head;
}

function headCell(icon: UiIcon, label: string): HTMLElement {
  const cell = document.createElement('span');

  cell.className = 'site-need-head-cell';
  cell.append(uiIcon(icon, 12), label);
  return cell;
}

function siteNeedChip(icon: UiIcon, value: number, kind: string): HTMLElement {
  const chip = document.createElement('span');

  chip.className = 'site-need-chip';
  chip.dataset['kind'] = kind;
  chip.dataset['empty'] = String(value === 0);
  chip.append(uiIcon(icon, 16), String(value));
  return chip;
}

/** « Pierre : 0/8 livrés, 2 en route, aucune en ville » — le libellé d'une ligne. */
export function siteNeedLabel(line: SiteLine): string {
  const label = t().items[line.item];
  const text = t().panel.site;

  if (line.done) return text.needDone(label, line.delivered, line.needed);

  const parts = [text.needDelivered(label, line.delivered, line.needed), text.needIncoming(line.incoming)];

  if (line.inTown !== null) parts.push(line.inTown === 0 ? text.needTownEmpty : text.needInTown(line.inTown));
  return parts.join(', ');
}
