/**
 * Le WebSocket, sur le même port que l'API (`/ws`). Il servira à jouer à
 * deux ; pour l'instant il salue, répond au ping et écarte les connexions
 * mortes. `ws` plutôt qu'une surcouche : la bibliothèque de référence de
 * Node, sans magie, branchée sur l'`upgrade` du serveur HTTP.
 */

import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { API_PATHS, API_VERSION, parseClientMessage, type ServerMessage } from '../../shared/api.ts';
import { originAllowed, type ServerConfig } from './config.ts';

/** Un message plus gros est refusé : rien dans le protocole n'en a besoin. */
const MAX_PAYLOAD = 64 * 1024;
/** Une connexion qui ne répond pas à deux pings de suite est fermée. */
const HEARTBEAT_MS = 30_000;

export interface SocketHub {
  readonly wss: WebSocketServer;
  close(): void;
}

export function attachSocket(server: Server, config: ServerConfig): SocketHub {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  const alive = new WeakSet<WebSocket>();

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;

    if (path !== API_PATHS.socket || !originAllowed(config, request.headers.origin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');

      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws: WebSocket) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    ws.on('message', (data, isBinary) => {
      const message = isBinary ? null : parseClientMessage(text(data));

      if (!message) {
        send(ws, { type: 'error', reason: 'badMessage' });

        return;
      }
      if (message.type === 'ping') send(ws, { type: 'pong', t: message.t });
    });
    send(ws, { type: 'hello', api: API_VERSION });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_MS);

  heartbeat.unref();

  return {
    wss,
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.close(1001, 'server shutdown');
      wss.close();
    },
  };
}

/** Un message texte, quel que soit le découpage que `ws` en a reçu. */
function text(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');

  return (Buffer.isBuffer(data) ? data : Buffer.from(data)).toString('utf8');
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}
