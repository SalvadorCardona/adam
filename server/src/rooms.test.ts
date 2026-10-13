import { describe, expect, it } from 'vitest';
import { PLAY_LIMITS, type AccountUser, type ServerMessage } from '../../shared/api.ts';
import type { PartyDirectory } from './parties.ts';
import { PartyRooms, type Peer } from './rooms.ts';

const HOST: AccountUser = { id: 1, nickname: 'Salva', email: 'salva@example.com' };
const GUEST: AccountUser = { id: 2, nickname: 'Lina', email: 'lina@example.com' };
const STRANGER: AccountUser = { id: 3, nickname: 'Zed', email: 'zed@example.com' };
const USERS: Record<string, AccountUser> = { host: HOST, guest: GUEST, stranger: STRANGER };

class FakePeer implements Peer {
  public readonly received: ServerMessage[] = [];
  public closed: number | null = null;

  public send(data: string): void {
    this.received.push(JSON.parse(data) as ServerMessage);
  }

  public close(code = 1000): void {
    this.closed = code;
  }

  /** Ce qui est arrivé depuis le dernier appel. */
  public take(): ServerMessage[] {
    return this.received.splice(0);
  }
}

function setup(): { rooms: PartyRooms; directory: { closed: boolean }; now: { t: number } } {
  const state = { closed: false };
  const now = { t: 0 };
  const directory: PartyDirectory = {
    find: (code) => (code === 'ABCD2345' ? { hostId: HOST.id, host: HOST.nickname, closed: state.closed } : null),
    isGuest: (code, id) => code === 'ABCD2345' && id === GUEST.id,
  };

  return { rooms: new PartyRooms(directory, (token) => USERS[token] ?? null, () => now.t), directory: state, now };
}

describe('les salles du jeu à deux', () => {
  it('fait entrer l’hôte puis l’ami, et chacun apprend l’arrivée de l’autre', () => {
    const { rooms } = setup();
    const host = new FakePeer();
    const guest = new FakePeer();

    rooms.enter(host, 'host', 'ABCD2345', 'host');
    expect(host.take()).toEqual([{ type: 'hosting', code: 'ABCD2345' }]);

    rooms.enter(guest, 'guest', 'ABCD2345', 'guest');
    expect(guest.take()).toEqual([{ type: 'joined', code: 'ABCD2345', host: 'Salva', hostOnline: true }]);
    expect(host.take()).toEqual([{ type: 'guestIn', guest: GUEST.id, nickname: 'Lina' }]);
    expect(rooms.size).toBe(1);
  });

  it('l’ami arrivé avant l’hôte attend, et apprend son arrivée', () => {
    const { rooms } = setup();
    const host = new FakePeer();
    const guest = new FakePeer();

    rooms.enter(guest, 'guest', 'ABCD2345', 'guest');
    expect(guest.take()).toEqual([{ type: 'joined', code: 'ABCD2345', host: 'Salva', hostOnline: false }]);

    rooms.enter(host, 'host', 'ABCD2345', 'host');
    expect(host.take()).toEqual([
      { type: 'hosting', code: 'ABCD2345' },
      { type: 'guestIn', guest: GUEST.id, nickname: 'Lina' },
    ]);
    expect(guest.take()).toEqual([{ type: 'hostIn' }]);
  });

  it('refuse un jeton inconnu, un code inconnu, une session fermée, un intrus', () => {
    const { rooms, directory } = setup();
    const peer = new FakePeer();

    rooms.enter(peer, 'host', 'ABCD2345', 'nobody');
    rooms.enter(peer, 'host', 'ZZZZ9999', 'host');
    rooms.enter(peer, 'host', 'ABCD2345', 'guest');
    rooms.enter(peer, 'guest', 'ABCD2345', 'stranger');
    rooms.enter(peer, 'guest', 'ABCD2345', 'host');
    directory.closed = true;
    rooms.enter(peer, 'guest', 'ABCD2345', 'guest');

    expect(peer.take().map((message) => (message.type === 'error' ? message.reason : message.type))).toEqual([
      'unauthorized',
      'notFound',
      'forbidden',
      'forbidden',
      'forbidden',
      'closed',
    ]);
    expect(rooms.size).toBe(0);
  });

  it('relaie de l’hôte à l’ami, et de l’ami à l’hôte avec son id', () => {
    const { rooms } = setup();
    const host = new FakePeer();
    const guest = new FakePeer();

    rooms.enter(host, 'host', 'ABCD2345', 'host');
    rooms.enter(guest, 'guest', 'ABCD2345', 'guest');
    host.take();
    guest.take();

    rooms.relay(host, { t: 'f', a: 1, b: 2 });
    rooms.relay(guest, { t: 'c', c: { type: 'setMoveAxis', x: 1, y: 0 } });
    rooms.relay(host, { t: 'f', a: 3, b: 3 }, 99);

    expect(guest.take()).toEqual([{ type: 'relay', data: { t: 'f', a: 1, b: 2 } }]);
    expect(host.take()).toEqual([{ type: 'relay', data: { t: 'c', c: { type: 'setMoveAxis', x: 1, y: 0 } }, from: GUEST.id }]);
  });

  it('refuse de relayer hors d’une salle', () => {
    const { rooms } = setup();
    const peer = new FakePeer();

    rooms.relay(peer, {});
    expect(peer.take()).toEqual([{ type: 'error', reason: 'notInRoom' }]);
  });

  it('jette les relais au-delà de la limite par seconde', () => {
    const { rooms, now } = setup();
    const host = new FakePeer();
    const guest = new FakePeer();

    rooms.enter(host, 'host', 'ABCD2345', 'host');
    rooms.enter(guest, 'guest', 'ABCD2345', 'guest');
    host.take();
    for (let i = 0; i < PLAY_LIMITS.relaysPerSecond + 20; i += 1) rooms.relay(guest, i);
    expect(host.take()).toHaveLength(PLAY_LIMITS.relaysPerSecond);

    now.t += 1000;
    rooms.relay(guest, 'encore');
    expect(host.take()).toHaveLength(1);
  });

  it('l’ami qui part est annoncé à l’hôte ; l’hôte qui part, à l’ami', () => {
    const { rooms } = setup();
    const host = new FakePeer();
    const guest = new FakePeer();

    rooms.enter(host, 'host', 'ABCD2345', 'host');
    rooms.enter(guest, 'guest', 'ABCD2345', 'guest');
    host.take();
    guest.take();

    rooms.leave(guest);
    expect(host.take()).toEqual([{ type: 'guestOut', guest: GUEST.id }]);

    rooms.enter(guest, 'guest', 'ABCD2345', 'guest');
    host.take();
    guest.take();
    rooms.leave(host);
    expect(guest.take()).toEqual([{ type: 'hostOut' }]);

    rooms.leave(guest);
    expect(rooms.size).toBe(0);
  });

  it('une reconnexion du même ami prend la place de l’ancienne, sans faire partir le personnage', () => {
    const { rooms } = setup();
    const host = new FakePeer();
    const before = new FakePeer();
    const after = new FakePeer();

    rooms.enter(host, 'host', 'ABCD2345', 'host');
    rooms.enter(before, 'guest', 'ABCD2345', 'guest');
    host.take();

    rooms.enter(after, 'guest', 'ABCD2345', 'guest');
    expect(before.received.at(-1)).toEqual({ type: 'error', reason: 'replaced' });
    expect(before.closed).toBe(4000);
    expect(host.take()).toEqual([{ type: 'guestIn', guest: GUEST.id, nickname: 'Lina' }]);

    // La vieille connexion se ferme ensuite : l'ami, lui, est toujours là.
    rooms.leave(before);
    expect(host.take()).toEqual([]);
    rooms.relay(host, 'image');
    expect(after.received.at(-1)).toEqual({ type: 'relay', data: 'image' });
  });

  it('la session fermée par l’hôte se termine pour tous', () => {
    const { rooms } = setup();
    const host = new FakePeer();
    const guest = new FakePeer();

    rooms.enter(host, 'host', 'ABCD2345', 'host');
    rooms.enter(guest, 'guest', 'ABCD2345', 'guest');
    rooms.end('ABCD2345');

    expect(guest.received.at(-1)).toEqual({ type: 'ended' });
    expect(host.received.at(-1)).toEqual({ type: 'ended' });
    expect(guest.closed).toBe(1000);
    expect(rooms.size).toBe(0);
  });
});
