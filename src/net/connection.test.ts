import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, OFFLINE_BACKOFF_MS, ONLINE_RECHECK_MS, type ConnectionState } from './connection.ts';

/** Une connexion dont on tient le serveur, l'onglet et le réseau. */
function harness() {
  const env = { up: true, visible: true, network: true, probes: 0 };
  const connection = new Connection('http://localhost:8790', {
    probe: () => {
      env.probes += 1;

      return Promise.resolve(env.up);
    },
    visible: () => env.visible,
    networkUp: () => env.network,
  });
  const states: ConnectionState[] = [];

  connection.subscribe((state) => states.push(state));

  return { env, connection, states };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Connection', () => {
  it('sans URL d’API, reste hors ligne et ne demande rien', () => {
    const connection = new Connection(null, null);

    connection.start();
    expect(connection.enabled).toBe(false);
    expect(connection.state).toBe('offline');
  });

  it('est hors ligne jusqu’à la première réponse, puis en ligne', async () => {
    const { connection, states } = harness();

    expect(connection.online).toBe(false);
    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.online).toBe(true);
    expect(states).toEqual(['online']);
  });

  it('serveur coupé : hors ligne, et resonde de plus en plus rarement', async () => {
    const { env, connection, states } = harness();

    env.up = false;
    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.probes).toBe(1);
    expect(states).toEqual([]);

    await vi.advanceTimersByTimeAsync(OFFLINE_BACKOFF_MS[0]);
    expect(env.probes).toBe(2);
    await vi.advanceTimersByTimeAsync(OFFLINE_BACKOFF_MS[0]);
    expect(env.probes).toBe(2);
    await vi.advanceTimersByTimeAsync(OFFLINE_BACKOFF_MS[1] - OFFLINE_BACKOFF_MS[0]);
    expect(env.probes).toBe(3);

    env.up = true;
    await vi.advanceTimersByTimeAsync(OFFLINE_BACKOFF_MS[2]);
    expect(states).toEqual(['online']);
  });

  it('serveur qui tombe : passe hors ligne à la sonde suivante', async () => {
    const { env, connection, states } = harness();

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    env.up = false;
    await vi.advanceTimersByTimeAsync(ONLINE_RECHECK_MS);
    expect(states).toEqual(['online', 'offline']);
  });

  it('ne sonde ni onglet caché ni sans réseau, et reprend au réveil', async () => {
    const { env, connection } = harness();

    env.visible = false;
    connection.start();
    await vi.advanceTimersByTimeAsync(10 * ONLINE_RECHECK_MS);
    expect(env.probes).toBe(0);

    env.visible = true;
    env.network = false;
    connection.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.probes).toBe(0);

    env.network = true;
    connection.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.probes).toBe(1);
    expect(connection.online).toBe(true);
  });

  it('arrêtée, ne sonde plus', async () => {
    const { env, connection } = harness();

    connection.start();
    await vi.advanceTimersByTimeAsync(0);
    connection.stop();
    await vi.advanceTimersByTimeAsync(10 * ONLINE_RECHECK_MS);
    expect(env.probes).toBe(1);
  });
});
