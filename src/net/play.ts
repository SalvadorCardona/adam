/**
 * Jouer à deux, côté navigateur : le WebSocket de l'hôte et celui de l'ami,
 * branchés sur `lockstep.ts`. Le serveur ne fait que relayer.
 *
 * - L'hôte (`HostSession`) s'annonce dès que son invitation est ouverte, et
 *   le reste tant qu'elle l'est : il se reconnecte seul si le réseau hoquette.
 *   L'ami qui entre reçoit l'image de la partie, puis ses pas.
 * - L'ami (`GuestSession`) s'annonce à l'ouverture de la page (`?play=CODE`),
 *   attend l'image de l'hôte et en fait son monde. Ensuite, il dit ce qui
 *   arrive : l'hôte parti, revenu, la session fermée, la connexion perdue.
 *
 * Rien ici ne lève : un serveur muet, un message étrange, une coupure — on le
 * dit au jeu, qui continue ou rend la main.
 */

import { parseServerMessage, type ClientMessage, type ServerMessage, type SocketError } from '../../shared/api.ts';
import { SAVE_VERSION, deserialize } from '../sim/save.ts';
import type { World } from '../sim/world.ts';
import { socketUrl } from './api.ts';
import { GuestSync, HostSync, parseHostMessage, type HostMessage } from './lockstep.ts';

/** Ce dont on se sert d'un WebSocket : de quoi en brancher un faux dans les tests. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

export type OpenSocket = (url: string) => SocketLike;

const browserSocket: OpenSocket = (url) => new WebSocket(url) as unknown as SocketLike;

/** Les délais entre deux tentatives de l'hôte pour retrouver le serveur. */
export const HOST_RETRY_MS: readonly number[] = [1000, 2000, 5000, 10_000];

/** Les erreurs après lesquelles on ne réessaie pas : ce n'est pas le réseau, c'est la session. */
const FINAL_ERRORS: ReadonlySet<SocketError> = new Set(['unauthorized', 'notFound', 'closed', 'forbidden', 'replaced']);

function send(socket: SocketLike | null, message: ClientMessage): void {
  try {
    socket?.send(JSON.stringify(message));
  } catch {
    // Le socket se ferme : `onclose` le dira.
  }
}

function read(event: { data: unknown }): ServerMessage | null {
  return typeof event.data === 'string' ? parseServerMessage(event.data) : null;
}

/* ------------------------------------------------------------------ hôte */

export type HostEvent =
  | { readonly kind: 'guestIn'; readonly nickname: string }
  | { readonly kind: 'guestOut'; readonly nickname: string }
  /** La session est finie (fermée, ou prise par une autre page de l'hôte) : on cesse d'héberger. */
  | { readonly kind: 'ended'; readonly reason: 'ended' | SocketError };

export class HostSession {
  public readonly sync: HostSync;
  public readonly code: string;
  private readonly url: string;
  private readonly token: string;
  private readonly onEvent: (event: HostEvent) => void;
  private readonly open: OpenSocket;
  private socket: SocketLike | null = null;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly nicknames = new Map<number, string>();
  private guest: number | null = null;

  public constructor(world: World, base: string, code: string, token: string, onEvent: (event: HostEvent) => void, open: OpenSocket = browserSocket) {
    this.code = code;
    this.url = socketUrl(base);
    this.token = token;
    this.onEvent = onEvent;
    this.open = open;
    this.sync = new HostSync(world, (message, to) => this.relay(message, to));
  }

  public start(): void {
    this.connect();
  }

  /** À brancher après chaque `world.tick()`. */
  public afterTick(): void {
    this.sync.afterTick();
  }

  /** On cesse d'héberger : l'ami part tout de suite, le socket se ferme. */
  public stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.sync.stop();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;

    const socket = this.socket;

    this.socket = null;
    socket?.close(1000, 'stop');
  }

  private relay(message: HostMessage, to?: number): void {
    send(this.socket, { type: 'relay', data: message, ...(to !== undefined && { to }) });
  }

  private connect(): void {
    if (this.stopped) return;

    let socket: SocketLike;

    try {
      socket = this.open(this.url);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => send(socket, { type: 'host', code: this.code, token: this.token });
    socket.onmessage = (event) => {
      const message = read(event);

      if (message && this.socket === socket) this.handle(message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      // Le serveur ne relaie plus : l'ami, s'il était là, s'arrête et part s'il ne revient pas à temps.
      if (this.guest !== null) this.sync.guestOut(this.guest);
      this.retry();
    };
  }

  private retry(): void {
    if (this.stopped) return;

    const delay = HOST_RETRY_MS[Math.min(this.retries, HOST_RETRY_MS.length - 1)]!;

    this.retries += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'hosting':
        this.retries = 0;
        break;
      case 'guestIn':
        this.nicknames.set(message.guest, message.nickname);
        this.guest = message.guest;
        this.sync.guestIn(message.guest, message.nickname);
        this.onEvent({ kind: 'guestIn', nickname: message.nickname });
        break;
      case 'guestOut':
        if (this.guest === message.guest) this.guest = null;
        this.sync.guestOut(message.guest);
        this.onEvent({ kind: 'guestOut', nickname: this.nicknames.get(message.guest) ?? '' });
        break;
      case 'relay':
        this.sync.receive(message.data, message.from);
        break;
      case 'ended':
        this.stop();
        this.onEvent({ kind: 'ended', reason: 'ended' });
        break;
      case 'error':
        if (FINAL_ERRORS.has(message.reason)) {
          this.stop();
          this.onEvent({ kind: 'ended', reason: message.reason });
        }
        break;
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------------- ami */

export type GuestStatus =
  /** On cherche le serveur, puis l'hôte. */
  | { readonly kind: 'connecting' }
  /** Dans la salle, en attente de l'image : l'hôte n'est pas là, ou sa partie est en pause. */
  | { readonly kind: 'waiting'; readonly host: string; readonly hostOnline: boolean }
  /** L'image est arrivée : on joue. */
  | { readonly kind: 'playing'; readonly world: World }
  /** L'hôte a quitté la partie ; il peut revenir (`hostIn`). */
  | { readonly kind: 'hostLeft'; readonly host: string }
  | { readonly kind: 'hostBack' }
  /** La session est fermée par l'hôte. */
  | { readonly kind: 'ended' }
  /** La connexion au serveur est perdue. */
  | { readonly kind: 'lost' }
  /** On ne peut pas entrer : session refusée, image illisible, version du jeu différente. */
  | { readonly kind: 'failed'; readonly reason: SocketError | 'badImage' | 'version' }
  /** Ce monde n'est plus celui de l'hôte : il faut une image neuve. */
  | { readonly kind: 'desync' };

export class GuestSession {
  public world: World | null = null;
  public sync: GuestSync | null = null;
  private readonly url: string;
  private readonly code: string;
  private readonly token: string;
  private readonly onStatus: (status: GuestStatus) => void;
  private readonly open: OpenSocket;
  private socket: SocketLike | null = null;
  private host = '';
  private done = false;

  public constructor(base: string, code: string, token: string, onStatus: (status: GuestStatus) => void, open: OpenSocket = browserSocket) {
    this.url = socketUrl(base);
    this.code = code;
    this.token = token;
    this.onStatus = onStatus;
    this.open = open;
  }

  public start(): void {
    this.onStatus({ kind: 'connecting' });

    let socket: SocketLike;

    try {
      socket = this.open(this.url);
    } catch {
      this.finish({ kind: 'lost' });
      return;
    }
    this.socket = socket;
    socket.onopen = () => send(socket, { type: 'join', code: this.code, token: this.token });
    socket.onmessage = (event) => {
      const message = read(event);

      if (message) this.handle(message);
    };
    socket.onclose = () => {
      this.socket = null;
      this.finish({ kind: 'lost' });
    };
  }

  /** On quitte la partie : le socket se ferme, plus rien n'arrive. */
  public stop(): void {
    this.done = true;

    const socket = this.socket;

    this.socket = null;
    socket?.close(1000, 'leave');
  }

  private finish(status: GuestStatus): void {
    if (this.done) return;
    this.stop();
    this.onStatus(status);
  }

  private handle(message: ServerMessage): void {
    if (this.done) return;
    switch (message.type) {
      case 'joined':
        this.host = message.host;
        if (!this.world) this.onStatus({ kind: 'waiting', host: message.host, hostOnline: message.hostOnline });
        break;
      case 'hostIn':
        if (this.world) this.onStatus({ kind: 'hostBack' });
        else this.onStatus({ kind: 'waiting', host: this.host, hostOnline: true });
        break;
      case 'hostOut':
        if (this.world) this.onStatus({ kind: 'hostLeft', host: this.host });
        else this.onStatus({ kind: 'waiting', host: this.host, hostOnline: false });
        break;
      case 'ended':
        this.finish({ kind: 'ended' });
        break;
      case 'error':
        if (FINAL_ERRORS.has(message.reason)) this.finish({ kind: 'failed', reason: message.reason });
        break;
      case 'relay':
        this.receive(message.data);
        break;
      default:
        break;
    }
  }

  private receive(data: unknown): void {
    const message = parseHostMessage(data);

    if (!message) return;
    if (message.t === 'f' || this.world) {
      this.sync?.receive(message);
      return;
    }
    if (message.v !== SAVE_VERSION) {
      this.finish({ kind: 'failed', reason: 'version' });
      return;
    }

    let world: World;

    try {
      world = deserialize(message.state);
    } catch {
      this.finish({ kind: 'failed', reason: 'badImage' });
      return;
    }
    world.viewAsPartner();
    this.world = world;
    this.sync = new GuestSync(world, (out) => send(this.socket, { type: 'relay', data: out }));
    this.sync.onDesync = () => this.onStatus({ kind: 'desync' });
    this.onStatus({ kind: 'playing', world });
  }
}
