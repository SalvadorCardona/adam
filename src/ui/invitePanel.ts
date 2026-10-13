/**
 * « Inviter un ami » : l'hôte ouvre une session de sa partie en cours, le
 * serveur lui donne un lien et le jeu en dessine le QR code. La fenêtre
 * montre aussi la salle d'attente (qui a rejoint, relue toutes les
 * `POLL_MS`) et ferme la session à la demande. Ouverte depuis la pause ;
 * fermée par sa croix, un tap sur le voile ou Échap (`main.ts`).
 *
 * L'invitation ouverte, l'hôte s'annonce au serveur (`onSession`, `net/play.ts`) :
 * l'ami qui entre dans la salle entre aussi dans la partie. Fermer la
 * fenêtre ne l'arrête pas ; fermer la session, si.
 *
 * Elle ne touche pas à la partie, et rien n'y est obligatoire : sans compte
 * ou sans serveur elle le dit, et le jeu se joue comme avant. Boutons et
 * champ sont de vrais éléments focalisables — doigt, clavier et manette
 * (la croix passe de l'un à l'autre, ✕ clique) n'ont rien de plus à savoir.
 */

import type { PartyInfo } from '../../shared/api.ts';
import { onLocale, t } from '../i18n/locale.ts';
import type { AccountClient } from '../net/account.ts';
import type { Connection } from '../net/connection.ts';
import { inviteUrl } from '../net/invite.ts';
import type { PartyClient, PartyFailure } from '../net/party.ts';
import { uiIcon } from './icons.ts';
import { createRoom, fillRoom } from './partyRoom.ts';
import { qrSvg } from './qrCode.ts';

/** Le rythme auquel l'hôte relit sa salle d'attente. */
export const POLL_MS = 3000;

type State = 'idle' | 'creating' | 'open' | 'failed' | 'ended';

export class InvitePanel {
  public readonly root: HTMLElement;

  private readonly party: PartyClient;
  private readonly accounts: AccountClient;
  private readonly connection: Connection;
  private readonly openAccount: () => void;
  private readonly now: () => number;
  private readonly onSession: (code: string | null) => void;
  private readonly closeButton: HTMLButtonElement;
  private readonly title: HTMLHeadingElement;
  private readonly status: HTMLParagraphElement;
  private readonly signIn: HTMLButtonElement;
  private readonly retry: HTMLButtonElement;
  private readonly invite: HTMLElement;
  private readonly qr: HTMLImageElement;
  private readonly codeLabel: HTMLSpanElement;
  private readonly code: HTMLElement;
  private readonly linkLabel: HTMLLabelElement;
  private readonly link: HTMLInputElement;
  private readonly shareButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly expiry: HTMLParagraphElement;
  private readonly roomTitle: HTMLHeadingElement;
  private readonly room: HTMLUListElement;
  private readonly endButton: HTMLButtonElement;
  private state: State = 'idle';
  private info: PartyInfo | null = null;
  private failure: PartyFailure['reason'] | null = null;
  /** Le compte qui a ouvert l'invitation : un autre joueur, une autre invitation. */
  private owner: number | null = null;
  private retryAfter = 0;
  private note: (() => string) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  /** `onSession` : l'invitation ouverte (son code), ou fermée (`null`) — on héberge, on cesse d'héberger. */
  public constructor(
    party: PartyClient,
    accounts: AccountClient,
    connection: Connection,
    openAccount: () => void,
    onSession: (code: string | null) => void = () => {},
    now: () => number = Date.now,
  ) {
    this.party = party;
    this.onSession = onSession;
    this.accounts = accounts;
    this.connection = connection;
    this.openAccount = openAccount;
    this.now = now;
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen invite-screen';
    this.root.hidden = true;
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });

    const panel = document.createElement('div');

    panel.className = 'panel overlay-panel settings-panel invite-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const head = document.createElement('div');

    head.className = 'settings-head';
    this.title = document.createElement('h2');
    this.title.className = 'overlay-title';
    this.title.id = 'invite-title';
    panel.setAttribute('aria-labelledby', this.title.id);
    this.closeButton = button('building-panel-close', () => this.close());
    this.closeButton.append(uiIcon('close'));
    head.append(this.title, this.closeButton);

    this.status = document.createElement('p');
    this.status.className = 'settings-note account-status';
    this.status.setAttribute('role', 'status');
    this.signIn = button('button-primary', () => this.openAccount());
    this.retry = button('button-secondary', () => void this.create());

    this.invite = document.createElement('div');
    this.invite.className = 'invite-body';
    this.qr = document.createElement('img');
    this.qr.className = 'invite-qr';
    this.qr.width = 220;
    this.qr.height = 220;
    this.qr.draggable = false;
    this.codeLabel = document.createElement('span');
    this.codeLabel.className = 'account-label';
    this.code = document.createElement('strong');
    this.code.className = 'invite-code';
    this.link = document.createElement('input');
    this.link.type = 'text';
    this.link.readOnly = true;
    this.link.className = 'account-input invite-link';
    this.link.addEventListener('focus', () => this.link.select());
    this.linkLabel = document.createElement('label');
    this.linkLabel.className = 'account-field';
    this.linkLabel.append(this.link);
    this.shareButton = button('button-primary', () => void this.share());
    this.copyButton = button('button-secondary', () => void this.copy());
    this.expiry = document.createElement('p');
    this.expiry.className = 'settings-note';
    this.roomTitle = document.createElement('h3');
    this.roomTitle.className = 'invite-room-title';
    this.room = createRoom();
    this.endButton = button('button-secondary invite-end', () => void this.end());

    const actions = document.createElement('div');

    actions.className = 'invite-actions';
    actions.append(this.shareButton, this.copyButton);
    this.invite.append(this.qr, this.codeLabel, this.code, this.linkLabel, actions, this.expiry, this.roomTitle, this.room, this.endButton);
    panel.append(head, this.status, this.signIn, this.retry, this.invite);
    this.root.append(panel);

    this.owner = accounts.user?.id ?? null;
    accounts.subscribe((user) => {
      const id = user?.id ?? null;

      // Un autre compte (ou plus aucun) : l'invitation de l'ancien n'est plus la sienne.
      if (id !== this.owner) {
        this.owner = id;
        this.info = null;
        this.state = 'idle';
        this.stopPolling();
        this.onSession(null);
      }
      if (!this.open) return;
      if (user && (this.state === 'idle' || this.state === 'failed')) void this.create();
      else this.render();
    });
    connection.subscribe(() => {
      if (this.open) this.render();
    });
    onLocale(() => this.render());
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    if (this.open) return;
    this.note = null;
    this.root.hidden = false;
    this.render();
    // Une invitation encore valable se retrouve telle quelle ; sinon, on en ouvre une.
    if (this.info && this.info.expiresAt > this.now()) {
      this.startPolling();
      void this.refresh();
    } else if (this.ready) void this.create();
    this.focusFirst();
  }

  /** Fermer la fenêtre garde la session ouverte : seul « Fermer la session » la ferme. */
  public close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.stopPolling();
  }

  private get ready(): boolean {
    return this.connection.enabled && this.connection.online && this.accounts.user !== null;
  }

  private focusFirst(): void {
    const target = [this.signIn, this.retry, this.shareButton.hidden ? this.copyButton : this.shareButton].find(
      (candidate) => !candidate.hidden,
    );

    (target ?? this.closeButton).focus({ preventScroll: true });
  }

  private startPolling(): void {
    this.stopPolling();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private async create(): Promise<void> {
    if (this.busy || !this.ready) return;
    this.busy = true;
    this.state = 'creating';
    this.render();

    const result = await this.party.host();

    this.busy = false;
    if (result.ok) {
      this.info = result.party;
      this.state = 'open';
      this.failure = null;
      this.note = null;
      this.link.value = inviteUrl(window.location.href, result.party.code);
      this.qr.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(this.link.value))}`;
      this.onSession(result.party.code);
      if (this.open) this.startPolling();
    } else {
      this.state = 'failed';
      this.failure = result.reason;
      this.retryAfter = result.retryAfter ?? 60;
    }
    this.render();
    if (this.open) this.focusFirst();
  }

  /** Relit la salle d'attente ; une invitation périmée ou fermée s'arrête là. */
  private async refresh(): Promise<void> {
    const info = this.info;

    if (!info || this.state !== 'open') return;

    const result = await this.party.look(info.code);

    if (this.info !== info || this.state !== 'open') return;
    if (result.ok) {
      this.info = result.party;
    } else if (result.reason === 'expired' || result.reason === 'closed' || result.reason === 'notFound') {
      this.ended(result.reason === 'closed' ? 'closed' : 'expired');

      return;
    }
    // Hors ligne ou serveur capricieux : on garde ce qu'on sait, la prochaine relève dira.
    this.render();
  }

  /** Une invitation expirée ne fait plus entrer personne, mais la partie en cours continue ; fermée, elle s'arrête. */
  private ended(reason: 'expired' | 'closed'): void {
    if (reason === 'closed') this.onSession(null);
    this.state = 'ended';
    this.failure = reason;
    this.info = null;
    this.stopPolling();
    this.render();
    if (this.open) this.focusFirst();
  }

  private async end(): Promise<void> {
    const info = this.info;

    if (!info || this.busy) return;
    this.busy = true;
    this.render();

    const result = await this.party.close(info.code);

    this.busy = false;
    if (result.ok || result.reason === 'expired' || result.reason === 'closed') {
      this.ended('closed');

      return;
    }
    this.note = () => failureText(result);
    this.render();
  }

  private async share(): Promise<void> {
    const info = this.info;

    if (!info) return;
    try {
      await navigator.share({ title: t().party.shareTitle, text: t().party.shareText(info.host), url: this.link.value });
    } catch {
      // Partage annulé par le joueur : rien à dire.
    }
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link.value);
      this.note = () => t().party.copied;
    } catch {
      this.link.focus();
      this.link.select();
      this.note = () => t().party.copyFailed;
    }
    this.render();
  }

  private render(): void {
    const text = t().party;
    const info = this.info;
    const signedIn = this.accounts.user !== null;
    const reachable = this.connection.enabled && this.connection.online;
    const open = this.state === 'open' && info !== null;

    this.title.textContent = text.title;
    this.closeButton.setAttribute('aria-label', t().common.close);
    this.status.textContent = this.statusText(signedIn);
    this.status.dataset['tone'] = !reachable || this.state === 'failed' || this.state === 'ended' ? 'offline' : 'info';
    this.signIn.hidden = !(reachable && !signedIn);
    this.signIn.replaceChildren(text.signInButton);
    this.retry.hidden = !(reachable && signedIn && (this.state === 'failed' || this.state === 'ended'));
    this.retry.replaceChildren(this.state === 'ended' ? text.newInvite : text.retry);
    this.retry.disabled = this.busy;
    this.invite.hidden = !open;
    if (!open) return;

    this.qr.alt = text.qrAlt;
    this.codeLabel.textContent = text.codeLabel;
    this.code.textContent = `${info.code.slice(0, 4)} ${info.code.slice(4)}`;
    this.linkLabel.setAttribute('aria-label', text.linkLabel);
    this.link.setAttribute('aria-label', text.linkLabel);
    this.shareButton.hidden = typeof navigator.share !== 'function';
    this.shareButton.replaceChildren(uiIcon('invite', 22), text.share);
    this.copyButton.replaceChildren(text.copy);
    this.expiry.textContent = text.validFor(info.expiresAt - this.now());
    this.roomTitle.textContent = text.room;
    fillRoom(this.room, info.host, info.guests);
    this.endButton.replaceChildren(text.closeSession);
    this.endButton.disabled = this.busy;
  }

  /** La ligne du haut : ce qui empêche d'inviter avant tout, sinon le dernier message. */
  private statusText(signedIn: boolean): string {
    const text = t().party;

    if (!this.connection.enabled) return text.notConfigured;
    if (!this.connection.online) return text.offline;
    if (!signedIn) return text.signInFirst;
    if (this.state === 'creating') return text.creating;
    if (this.state === 'failed' && this.failure) return failureText({ ok: false, reason: this.failure, retryAfter: this.retryAfter });
    if (this.state === 'ended') return text.ended[this.failure === 'closed' ? 'closed' : 'expired'];

    return this.note?.() ?? (this.state === 'open' ? text.intro : '');
  }
}

function button(className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');

  element.type = 'button';
  element.className = className;
  element.addEventListener('click', onClick);

  return element;
}

function failureText(failure: PartyFailure): string {
  const { errors, offline } = t().party;

  switch (failure.reason) {
    case 'offline':
      return offline;
    case 'tooManyAttempts':
      return errors.tooManyAttempts(failure.retryAfter ?? 60);
    case 'unauthorized':
      return errors.unauthorized;
    default:
      return errors.server;
  }
}
