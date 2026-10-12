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

  it('refuse un WebSocket venu d’une origine inconnue', async () => {
    const server = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { Origin: 'https://evil.example' } });

    await expect(new Promise((resolve, reject) => ws.on('open', resolve).on('error', reject))).rejects.toThrow(/403/);
  });
});
