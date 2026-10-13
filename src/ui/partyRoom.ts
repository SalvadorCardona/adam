/**
 * La salle d'attente d'une partie hébergée : l'hôte, puis les amis arrivés,
 * ou « En attente d'un ami… » tant que la place est vide. Partagée par la
 * fenêtre de l'hôte (`invitePanel.ts`) et l'écran de l'invité (`joinPanel.ts`).
 */

import { t } from '../i18n/locale.ts';
import { uiIcon } from './icons.ts';

export function createRoom(): HTMLUListElement {
  const list = document.createElement('ul');

  list.className = 'party-room';
  list.setAttribute('aria-live', 'polite');

  return list;
}

/** Remplit la liste : l'hôte d'abord, puis les invités ; une ligne creuse s'il n'y en a pas. */
export function fillRoom(list: HTMLUListElement, host: string, guests: readonly string[]): void {
  const text = t().party;
  const rows = [
    row(text.hostLine(host), 'host'),
    ...guests.map((guest) => row(guest, 'guest')),
    ...(guests.length === 0 ? [row(text.waitingForFriend, 'empty')] : []),
  ];

  list.replaceChildren(...rows);
}

function row(label: string, kind: 'host' | 'guest' | 'empty'): HTMLLIElement {
  const item = document.createElement('li');

  item.className = 'party-member';
  item.dataset['kind'] = kind;
  if (kind !== 'empty') item.append(uiIcon('account', 20));
  item.append(label);

  return item;
}
