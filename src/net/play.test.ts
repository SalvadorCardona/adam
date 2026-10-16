import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { SAVE_VERSION } from '../sim/save.ts';
import { stageScenario } from '../sim/testScenario.ts';
import { GuestSession, HOST_RETRY_MS, HostSession, type GuestStatus, type HostEvent, type SocketLike } from './play.ts';

/** Un faux WebSocket : ce que le jeu envoie, et de quoi lui faire recevoir ou perdre la connexion. */
class FakeSocket implements SocketLike {
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public readonly sent: Record<string, unknown>[] = [];
  public closed = false;

  public send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  public close(): void {
    this.closed = true;
  }

  public receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  public drop(): void {
    this.onclose?.();
  }
}

let sockets: FakeSocket[] = [];
const open = (): FakeSocket => {
  const socket = new FakeSocket();

  sockets.push(socket);
  return socket;
};

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('HostSession', () => {
  it('s’annonce, accueille l’ami, lui envoie l’image après le tick', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const events: HostEvent[] = [];
    const session = new HostSession(world, 'http://localhost:8790', 'ABCD2345', 'jeton', (event) => events.push(event), open);

    session.start();
    sockets[0]!.onopen?.();
    expect(sockets[0]!.sent[0]).toEqual({ type: 'host', code: 'ABCD2345', token: 'jeton' });

    sockets[0]!.receive({ type: 'hosting', code: 'ABCD2345' });
    sockets[0]!.receive({ type: 'guestIn', guest: 2, nickname: 'Lina' });
    world.tick();
    session.afterTick();

    expect(events).toEqual([{ kind: 'guestIn', nickname: 'Lina' }]);
    expect(sockets[0]!.sent[1]).toMatchObject({ type: 'relay', to: 2, data: { t: 'key', v: SAVE_VERSION } });
    expect(world.partner?.name).toBe('Lina');
  });

  it('se reconnecte quand le réseau tombe, et cesse quand la session est fermée', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const events: HostEvent[] = [];
    const session = new HostSession(world, 'http://localhost:8790', 'ABCD2345', 'jeton', (event) => events.push(event), open);

    session.start();
    sockets[0]!.drop();
    vi.advanceTimersByTime(HOST_RETRY_MS[0]!);
    expect(sockets).toHaveLength(2);

    sockets[1]!.receive({ type: 'ended' });
    expect(events).toEqual([{ kind: 'ended', reason: 'ended' }]);
    expect(sockets[1]!.closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });
});

describe('GuestSession', () => {
  function joined(): { session: GuestSession; statuses: GuestStatus[]; socket: FakeSocket } {
    const statuses: GuestStatus[] = [];
    const session = new GuestSession('https://api.example.com', 'ABCD2345', 'jeton', (status) => statuses.push(status), open);

    session.start();

    const socket = sockets.at(-1)!;

    socket.onopen?.();
    socket.receive({ type: 'joined', code: 'ABCD2345', host: 'Salva', hostOnline: true });

    return { session, statuses, socket };
  }

  it('entre, attend l’image, puis joue dans le monde de l’hôte', () => {
    const { session, statuses, socket } = joined();
    const host = stageScenario(TEST_SCENARIOS.base);

    host.push({ type: 'partnerJoin', name: 'Lina' });
    host.tick();

    expect(socket.sent[0]).toEqual({ type: 'join', code: 'ABCD2345', token: 'jeton' });
    expect(statuses.map((status) => status.kind)).toEqual(['connecting', 'waiting']);

    socket.receive({ type: 'relay', data: { t: 'key', v: SAVE_VERSION, state: host.snapshot() } });
    expect(statuses.at(-1)?.kind).toBe('playing');
    expect(session.world?.checksum()).toBe(host.checksum());
    expect(session.world?.player).toBe(session.world?.partner?.player);

    // Ce que l'ami fait part à l'hôte.
    session.world?.push({ type: 'dropItem' });
    expect(socket.sent.at(-1)).toEqual({ type: 'relay', data: { t: 'c', c: { type: 'dropItem' } } });

    socket.receive({ type: 'hostOut' });
    socket.receive({ type: 'hostIn' });
    socket.drop();
    expect(statuses.slice(-3).map((status) => status.kind)).toEqual(['hostLeft', 'hostBack', 'lost']);
  });

  it('refuse l’image d’une autre version du jeu', () => {
    const { statuses, socket } = joined();

    socket.receive({ type: 'relay', data: { t: 'key', v: SAVE_VERSION + 1, state: {} } });
    expect(statuses.at(-1)).toEqual({ kind: 'failed', reason: 'version' });
    expect(socket.closed).toBe(true);
  });

  it('refuse une image illisible, et dit une session refusée', () => {
    const first = joined();

    first.socket.receive({ type: 'relay', data: { t: 'key', v: SAVE_VERSION, state: { seed: 'x' } } });
    expect(first.statuses.at(-1)).toEqual({ kind: 'failed', reason: 'badImage' });

    const second = joined();

    second.socket.receive({ type: 'error', reason: 'forbidden' });
    expect(second.statuses.at(-1)).toEqual({ kind: 'failed', reason: 'forbidden' });
  });

  it('la session fermée par l’hôte met fin à la partie', () => {
    const { statuses, socket } = joined();

    socket.receive({ type: 'ended' });
    expect(statuses.at(-1)).toEqual({ kind: 'ended' });
  });
});

describe('le vocal sur la session', () => {
  const line = () => {
    const calls: string[] = [];

    return {
      calls,
      line: {
        receive: (from: number, nickname: string, data: unknown) => calls.push(`receive ${from} ${nickname} ${JSON.stringify(data)}`),
        peerGone: (id: number) => calls.push(`gone ${id}`),
        allGone: () => calls.push('allGone'),
        close: () => calls.push('close'),
      },
    };
  };

  it('l’hôte envoie la signalisation hors du flux de la partie, et reçoit celle de l’ami', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const session = new HostSession(world, 'http://localhost:8790', 'ABCD2345', 'jeton', () => undefined, open);
    const voice = line();

    session.voice = voice.line;
    session.start();
    sockets[0]!.onopen?.();
    sockets[0]!.receive({ type: 'guestIn', guest: 2, nickname: 'Lina' });
    session.sendVoice({ k: 'join', muted: false });
    session.sendVoice({ k: 'offer', sdp: 'v=0' }, 2);
    sockets[0]!.receive({ type: 'voice', from: 2, nickname: 'Lina', data: { k: 'here', muted: false } });
    sockets[0]!.receive({ type: 'guestOut', guest: 2 });

    expect(sockets[0]!.sent.slice(1)).toEqual([
      { type: 'voice', data: { k: 'join', muted: false } },
      { type: 'voice', data: { k: 'offer', sdp: 'v=0' }, to: 2 },
    ]);
    expect(voice.calls).toEqual(['receive 2 Lina {"k":"here","muted":false}', 'gone 2']);

    sockets[0]!.drop();
    expect(voice.calls.at(-1)).toBe('allGone');
    session.stop();
    expect(voice.calls.at(-1)).toBe('close');
  });

  it('l’ami reçoit le vocal, le perd avec l’hôte, et le ferme en quittant la partie', () => {
    const statuses: GuestStatus[] = [];
    const session = new GuestSession('http://localhost:8790', 'ABCD2345', 'jeton', (status) => statuses.push(status), open);
    const voice = line();

    session.voice = voice.line;
    session.start();
    sockets[0]!.onopen?.();
    sockets[0]!.receive({ type: 'joined', code: 'ABCD2345', host: 'Salva', hostOnline: true });
    session.sendVoice({ k: 'mute', muted: true });
    sockets[0]!.receive({ type: 'voice', from: 1, nickname: 'Salva', data: { k: 'join', muted: false } });
    sockets[0]!.receive({ type: 'hostOut' });

    expect(sockets[0]!.sent.at(-1)).toEqual({ type: 'voice', data: { k: 'mute', muted: true } });
    expect(voice.calls).toEqual(['receive 1 Salva {"k":"join","muted":false}', 'allGone']);

    session.stop();
    expect(voice.calls.at(-1)).toBe('close');
  });
});
