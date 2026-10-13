/**
 * Les salles du jeu à deux : une par partie hébergée, ouverte quand l'hôte ou
 * l'ami s'y annonce par le WebSocket. Le serveur n'y fait que vérifier qui
 * entre et relayer : la partie tourne chez l'hôte, qui fait autorité, et
 * l'ami la rejoue chez lui (`src/net/lockstep.ts`). Aucune simulation ici,
 * aucune lecture des messages du jeu.
 *
 * - L'hôte s'annonce avec le code de sa partie et son jeton : il doit en être
 *   l'hôte, et la session ne doit pas être fermée.
 * - L'ami aussi : il doit être dans la salle d'attente (`POST /parties/:code/join`).
 *   Une partie expirée se joue encore — l'invitation ne fait plus entrer
 *   personne, mais l'ami déjà dedans peut s'y reconnecter.
 * - Chacun apprend l'arrivée et le départ de l'autre (`guestIn` / `guestOut`,
 *   `hostIn` / `hostOut`) ; l'hôte qui ferme sa session la termine pour tous
 *   (`ended`).
 * - Un même joueur qui se reconnecte prend la place de son ancienne
 *   connexion, qui reçoit `replaced` et se ferme.
 */

import { PLAY_LIMITS, type AccountUser, type ServerMessage } from '../../shared/api.ts';
import type { PartyDirectory } from './parties.ts';

/** Une connexion, vue de la salle : on lui écrit, on la ferme. `ws` en est une. */
export interface Peer {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface Seat {
  readonly code: string;
  readonly role: 'host' | 'guest';
  readonly user: AccountUser;
  /** Les relais de la seconde en cours, pour la limite. */
  second: number;
  relays: number;
}

interface Room {
  readonly code: string;
  readonly hostId: number;
  readonly hostName: string;
  host: Peer | null;
  readonly guests: Map<number, { readonly peer: Peer; readonly nickname: string }>;
}

export class PartyRooms {
  private readonly directory: PartyDirectory;
  private readonly userOf: (token: string) => AccountUser | null;
  private readonly clock: () => number;
  private readonly rooms = new Map<string, Room>();
  private readonly seats = new Map<Peer, Seat>();

  public constructor(directory: PartyDirectory, userOf: (token: string) => AccountUser | null, clock: () => number = Date.now) {
    this.directory = directory;
    this.userOf = userOf;
    this.clock = clock;
  }

  /** Le nombre de salles ouvertes : ce que les tests et `/health` peuvent lire. */
  public get size(): number {
    return this.rooms.size;
  }

  /** L'hôte (`host`) ou l'ami (`join`) s'annonce. Refusé, il reçoit une erreur et reste hors de toute salle. */
  public enter(peer: Peer, role: 'host' | 'guest', code: string, token: string): void {
    const user = this.userOf(token);

    if (!user) return send(peer, { type: 'error', reason: 'unauthorized' });

    const party = this.directory.find(code);

    if (!party) return send(peer, { type: 'error', reason: 'notFound' });
    if (party.closed) return send(peer, { type: 'error', reason: 'closed' });
    if (role === 'host' ? party.hostId !== user.id : !this.directory.isGuest(code, user.id)) {
      return send(peer, { type: 'error', reason: 'forbidden' });
    }

    // Une connexion qui change de salle, ou de rôle, quitte d'abord l'ancienne.
    this.leave(peer);

    let room = this.rooms.get(code);

    if (!room) {
      room = { code, hostId: party.hostId, hostName: party.host, host: null, guests: new Map() };
      this.rooms.set(code, room);
    }
    this.seats.set(peer, { code, role, user, second: 0, relays: 0 });

    if (role === 'host') {
      if (room.host && room.host !== peer) this.replace(room.host);
      room.host = peer;
      send(peer, { type: 'hosting', code });
      for (const [id, guest] of room.guests) {
        send(peer, { type: 'guestIn', guest: id, nickname: guest.nickname });
        send(guest.peer, { type: 'hostIn' });
      }
      return;
    }

    const previous = room.guests.get(user.id);

    if (previous && previous.peer !== peer) this.replace(previous.peer);
    room.guests.set(user.id, { peer, nickname: user.nickname });
    send(peer, { type: 'joined', code, host: room.hostName, hostOnline: room.host !== null });
    if (room.host) send(room.host, { type: 'guestIn', guest: user.id, nickname: user.nickname });
  }

  /**
   * Un message du jeu : de l'hôte à ses amis (à `to` seulement, s'il est
   * donné), de l'ami à l'hôte. Hors d'une salle, refusé ; au-delà de la
   * limite par seconde, jeté sans bruit — le jeu ne s'en sert pas.
   */
  public relay(peer: Peer, data: unknown, to?: number): void {
    const seat = this.seats.get(peer);
    const room = seat ? this.rooms.get(seat.code) : undefined;

    if (!seat || !room) return send(peer, { type: 'error', reason: 'notInRoom' });

    const second = Math.floor(this.clock() / 1000);

    if (second !== seat.second) {
      seat.second = second;
      seat.relays = 0;
    }
    seat.relays += 1;
    if (seat.relays > PLAY_LIMITS.relaysPerSecond) return;

    if (seat.role === 'guest') {
      if (room.host) send(room.host, { type: 'relay', data, from: seat.user.id });
      return;
    }

    const text = JSON.stringify({ type: 'relay', data } satisfies ServerMessage);

    for (const [id, guest] of room.guests) {
      if (to === undefined || to === id) guest.peer.send(text);
    }
  }

  /** La connexion se ferme (ou change de salle) : l'autre côté l'apprend. */
  public leave(peer: Peer): void {
    const seat = this.seats.get(peer);

    if (!seat) return;
    this.seats.delete(peer);

    const room = this.rooms.get(seat.code);

    if (!room) return;
    if (seat.role === 'host' && room.host === peer) {
      room.host = null;
      for (const guest of room.guests.values()) send(guest.peer, { type: 'hostOut' });
    } else if (seat.role === 'guest' && room.guests.get(seat.user.id)?.peer === peer) {
      room.guests.delete(seat.user.id);
      if (room.host) send(room.host, { type: 'guestOut', guest: seat.user.id });
    }
    if (!room.host && room.guests.size === 0) this.rooms.delete(room.code);
  }

  /** L'hôte a fermé sa session : tout le monde l'apprend, et la salle disparaît. */
  public end(code: string): void {
    const room = this.rooms.get(code);

    if (!room) return;
    this.rooms.delete(code);

    const peers = [...(room.host ? [room.host] : []), ...[...room.guests.values()].map((guest) => guest.peer)];

    for (const peer of peers) {
      this.seats.delete(peer);
      send(peer, { type: 'ended' });
      peer.close(1000, 'party closed');
    }
  }

  /** Une connexion plus récente du même joueur prend sa place. */
  private replace(peer: Peer): void {
    this.seats.delete(peer);
    send(peer, { type: 'error', reason: 'replaced' });
    peer.close(4000, 'replaced');
  }
}

function send(peer: Peer, message: ServerMessage): void {
  peer.send(JSON.stringify(message));
}
