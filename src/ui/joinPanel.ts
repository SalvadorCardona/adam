/**
 * « Rejoindre la partie de <pseudo> » : l'écran de l'ami qui a ouvert le lien
 * (`?join=CODE`). Il s'ouvre par-dessus l'écran titre, regarde l'invitation,
 * demande de se connecter si besoin — la fenêtre du compte s'ouvre par-dessus
 * et, une fois connecté, on retrouve ici l'invitation —, puis place l'ami
 * dans la salle d'attente de l'hôte. Lien expiré, fermé, invalide ou partie
 * pleine : un message clair et « Retour à l'écran titre ».
 *
 * La synchronisation de la partie viendra ensuite ; ici, on attend.
 */

import type { PartyInfo } from '../../shared/api.ts';
import { onLocale, t } from '../i18n/locale.ts';
import type { AccountClient } from '../net/account.ts';
import type { Connection } from '../net/connection.ts';
import type { PartyClient, PartyFailure } from '../net/party.ts';
import { uiIcon } from './icons.ts';
import { POLL_MS } from './invitePanel.ts';
import { createRoom, fillRoom } from './partyRoom.ts';

type State = 'loading' | 'ready' | 'joining' | 'waiting' | 'own' | 'failed';

export class JoinPanel {
  public readonly root: HTMLElement;

  private readonly code: string;
  private readonly party: PartyClient;
  private readonly accounts: AccountClient;
  private readonly openAccount: () => void;
  private readonly onLeave: () => void;
  private readonly title: HTMLHeadingElement;
  private readonly status: HTMLParagraphElement;
  private readonly signIn: HTMLButtonElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly backButton: HTMLButtonElement;
  private readonly roomTitle: HTMLHeadingElement;
  private readonly room: HTMLUListElement;
  private state: State = 'loading';
  private info: PartyInfo | null = null;
  private failure: PartyFailure | null = null;
  private owner: number | null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  /** `code` : le code lu dans le lien, `''` s'il est illisible. `onLeave` : retour à l'écran titre. */
  public constructor(
    code: string,
    party: PartyClient,
    accounts: AccountClient,
    connection: Connection,
    openAccount: () => void,
    onLeave: () => void,
  ) {
    this.code = code;
    this.party = party;
    this.accounts = accounts;
    this.openAccount = openAccount;
    this.onLeave = onLeave;
    this.owner = accounts.user?.id ?? null;
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen join-screen';

    const panel = document.createElement('div');

    panel.className = 'panel overlay-panel settings-panel join-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    this.title = document.createElement('h2');
    this.title.className = 'overlay-title';
    this.title.id = 'join-title';
    panel.setAttribute('aria-labelledby', this.title.id);
    this.status = document.createElement('p');
    this.status.className = 'settings-note account-status';
    this.status.setAttribute('role', 'status');
    this.signIn = button('button-primary', () => this.openAccount());
    this.joinButton = button('button-primary', () => void this.join());
    this.roomTitle = document.createElement('h3');
    this.roomTitle.className = 'invite-room-title';
    this.room = createRoom();
    this.leaveButton = button('button-secondary', () => void this.leave());
    this.retryButton = button('button-secondary', () => void this.look());
    this.backButton = button('button-secondary', () => this.dismiss());
    panel.append(this.title, this.status, this.signIn, this.joinButton, this.roomTitle, this.room, this.leaveButton, this.retryButton, this.backButton);
    this.root.append(panel);

    accounts.subscribe((user) => {
      const id = user?.id ?? null;

      // Connecté (ou reconnecté) : on revient sur l'invitation, qui sait maintenant qui l'ouvre.
      if (id !== this.owner && !this.closed) {
        this.owner = id;
        if (this.state !== 'failed' || this.failure?.reason === 'offline' || this.failure?.reason === 'unauthorized') void this.look();
        else this.render();
      }
    });
    connection.subscribe((state) => {
      if (state === 'online' && this.state === 'failed' && this.failure?.reason === 'offline') void this.look();
    });
    onLocale(() => this.render());
    this.render();
    void this.look();
  }

  public get open(): boolean {
    return !this.closed;
  }

  private get closed(): boolean {
    return this.root.hidden !== false;
  }

  /** Retour à l'écran titre : l'invitation est laissée, et sa salle quittée. */
  public dismiss(): void {
    if (this.closed) return;
    this.stopPolling();
    if (this.state === 'waiting' && this.accounts.user) void this.party.leave(this.code);
    this.root.hidden = true;
    this.onLeave();
  }

  private async look(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.state = 'loading';
    this.render();

    const result = this.code === '' ? ({ ok: false, reason: 'notFound' } as const) : await this.party.look(this.code);

    this.busy = false;
    this.apply(result);
    this.focusFirst();
  }

  private async join(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.state = 'joining';
    this.render();

    const result = await this.party.join(this.code);

    this.busy = false;
    this.apply(result);
    this.focusFirst();
  }

  private apply(result: { ok: true; party: PartyInfo } | PartyFailure): void {
    this.stopPolling();
    if (result.ok) {
      this.info = result.party;
      this.failure = null;
      this.state = result.party.role === 'guest' ? 'waiting' : result.party.role === 'host' ? 'own' : 'ready';
      if (this.state === 'waiting' || this.state === 'own') this.timer = setInterval(() => void this.poll(), POLL_MS);
    } else {
      this.failure = result;
      this.state = 'failed';
    }
    this.render();
  }

  /** La salle d'attente, relue : l'hôte peut avoir fermé la session entre-temps. */
  private async poll(): Promise<void> {
    if (this.busy || this.closed) return;

    const result = await this.party.look(this.code);

    if (this.state !== 'waiting' && this.state !== 'own') return;
    if (result.ok) {
      this.info = result.party;
      this.render();
    } else if (result.reason !== 'offline' && result.reason !== 'server') {
      this.apply(result);
      this.focusFirst();
    }
  }

  private async leave(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    await this.party.leave(this.code);
    this.busy = false;
    this.stopPolling();
    this.root.hidden = true;
    this.onLeave();
  }

  private stopPolling(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private focusFirst(): void {
    const target = [this.signIn, this.joinButton, this.retryButton, this.leaveButton, this.backButton].find((candidate) => !candidate.hidden);

    (target ?? this.backButton).focus({ preventScroll: true });
  }

  private render(): void {
    const text = t().party.join;
    const info = this.info;
    const state = this.state;
    const signedIn = this.accounts.user !== null;
    const failed = state === 'failed';
    const host = info?.host ?? '';
    const showRoom = (state === 'waiting' || state === 'own') && info !== null;

    this.title.textContent = failed || info === null ? t().party.joinTitle : text.title(host);
    this.status.textContent = this.statusText(signedIn);
    this.status.dataset['tone'] = failed ? 'offline' : 'info';
    this.signIn.hidden = !(state === 'ready' && !signedIn);
    this.signIn.replaceChildren(text.signInButton);
    this.joinButton.hidden = !(state === 'ready' && signedIn) && state !== 'joining';
    this.joinButton.disabled = state === 'joining';
    this.joinButton.replaceChildren(uiIcon('invite', 22), state === 'joining' ? text.joining : text.button);
    this.roomTitle.hidden = !showRoom;
    this.roomTitle.textContent = t().party.room;
    this.room.hidden = !showRoom;
    if (showRoom) fillRoom(this.room, host, info.guests);
    this.leaveButton.hidden = state !== 'waiting';
    this.leaveButton.replaceChildren(text.leave);
    this.retryButton.hidden = !(failed && (this.failure?.reason === 'offline' || this.failure?.reason === 'server'));
    this.retryButton.replaceChildren(t().party.retry);
    this.backButton.hidden = state === 'waiting' ? true : state === 'loading' || state === 'joining';
    this.backButton.replaceChildren(text.backToTitle);
  }

  private statusText(signedIn: boolean): string {
    const text = t().party.join;
    const failure = this.failure;

    switch (this.state) {
      case 'loading':
        return text.loading;
      case 'ready':
        return signedIn ? '' : text.signInFirst;
      case 'joining':
        return text.joining;
      case 'waiting':
        return text.waiting(this.info?.host ?? '');
      case 'own':
        return text.own;
      case 'failed':
        if (!failure) return '';
        if (failure.reason === 'offline') return text.offline;
        if (failure.reason === 'tooManyAttempts') return text.errors.tooManyAttempts(failure.retryAfter ?? 60);

        return text.errors[failure.reason];
    }
  }
}

function button(className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');

  element.type = 'button';
  element.className = className;
  element.addEventListener('click', onClick);

  return element;
}
