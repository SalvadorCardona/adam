import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { API_VERSION, isHealthResponse, type ServerMessage } from '../../shared/api.ts';
import { loadConfig } from './config.ts';
import { startServer, type RunningServer } from './server.ts';

let running: RunningServer | null = null;

afterEach(async () => {
  await running?.close();
  running = null;
});

async function start(): Promise<RunningServer> {
  running = await startServer(loadConfig({ PORT: '0', HOST: '127.0.0.1', DATABASE_PATH: ':memory:' }));

  return running;
}

/** Les `count` premiers messages d'un socket. */
function messages(ws: WebSocket, count: number): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const received: ServerMessage[] = [];

    ws.on('error', reject);
    ws.on('message', (data: Buffer) => {
      received.push(JSON.parse(data.toString()) as ServerMessage);
      if (received.length === count) resolve(received);
    });
  });
}

describe('le serveur démarré', () => {
  it('applique ses migrations et répond sur /health', async () => {
    const server = await start();
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);

    expect(server.migrated.length).toBeGreaterThan(0);
    expect(isHealthResponse(await response.json())).toBe(true);
  });

  it('salue un WebSocket et lui répond au ping', async () => {
    const server = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const received = messages(ws, 3);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'ping', t: 42 }));
      ws.send('n’importe quoi');
    });

    expect(await received).toEqual([
      { type: 'hello', api: API_VERSION },
      { type: 'pong', t: 42 },
      { type: 'error', reason: 'badMessage' },
    ]);
    ws.close();
  });

  it('fait jouer l’hôte et l’ami par le WebSocket, jusqu’à la fermeture de la session', async () => {
    const server = await start();
    const base = `http://127.0.0.1:${server.port}`;
    const post = async (path: string, body: unknown, token?: string, method = 'POST'): Promise<Record<string, unknown>> => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify(body),
      });

      return (await response.json()) as Record<string, unknown>;
    };
    const register = async (nickname: string): Promise<string> =>
      (await post('/auth/register', { nickname, email: `${nickname}@example.com`, password: 'correct horse battery' }))['token'] as string;
    const hostToken = await register('Salva');
    const guestToken = await register('Lina');
    const code = ((await post('/parties', {}, hostToken))['party'] as { code: string }).code;

    await post(`/parties/${code}/join`, {}, guestToken);

    const host = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const hostSaw = messages(host, 4);

    await new Promise((resolve) => host.on('open', resolve));
    host.send(JSON.stringify({ type: 'host', code, token: hostToken }));

    const guest = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const guestSaw = messages(guest, 4);

    await new Promise((resolve) => guest.on('open', resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));
    guest.send(JSON.stringify({ type: 'join', code, token: guestToken }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    host.send(JSON.stringify({ type: 'relay', data: { t: 'f', a: 1, b: 2 } }));
    guest.send(JSON.stringify({ type: 'relay', data: { t: 'c', c: { type: 'setMoveAxis', x: 0, y: 1 } } }));

    const fromHost = await hostSaw;

    // L'ami est arrivé chez l'hôte, et sa commande aussi, avec son id.
    expect(fromHost.slice(1).map((message) => message.type)).toEqual(['hosting', 'guestIn', 'relay']);
    expect(fromHost[3]).toMatchObject({ type: 'relay', data: { t: 'c' } });

    await post(`/parties/${code}`, {}, hostToken, 'DELETE');

    expect((await guestSaw).slice(1)).toEqual([
      { type: 'joined', code, host: 'Salva', hostOnline: true },
      { type: 'relay', data: { t: 'f', a: 1, b: 2 } },
      { type: 'ended' },
    ]);
    host.close();
    guest.close();
  });

  it('refuse un WebSocket venu d’une origine inconnue', async () => {
    const server = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { Origin: 'https://evil.example' } });

    await expect(new Promise((resolve, reject) => ws.on('open', resolve).on('error', reject))).rejects.toThrow(/403/);
  });
});
