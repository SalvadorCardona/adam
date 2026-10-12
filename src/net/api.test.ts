import { describe, expect, it } from 'vitest';
import { API_SERVICE, API_VERSION } from '../../shared/api.ts';
import { apiBaseUrl, probeHealth, socketUrl } from './api.ts';

const healthy = { ok: true, service: API_SERVICE, api: API_VERSION, schema: 1, uptime: 3 };

function answering(body: unknown, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe('apiBaseUrl', () => {
  it('nettoie une URL http(s)', () => {
    expect(apiBaseUrl('https://api.cardona.digital/')).toBe('https://api.cardona.digital');
    expect(apiBaseUrl(' http://localhost:8790 ')).toBe('http://localhost:8790');
    expect(apiBaseUrl('https://cardona.digital/mf-api//')).toBe('https://cardona.digital/mf-api');
  });

  it('rend null sans URL ou pour une URL illisible', () => {
    expect(apiBaseUrl(undefined)).toBeNull();
    expect(apiBaseUrl('')).toBeNull();
    expect(apiBaseUrl('pas une url')).toBeNull();
    expect(apiBaseUrl('ftp://example.org')).toBeNull();
  });
});

describe('socketUrl', () => {
  it('passe au protocole WebSocket', () => {
    expect(socketUrl('http://localhost:8790')).toBe('ws://localhost:8790/ws');
    expect(socketUrl('https://api.cardona.digital')).toBe('wss://api.cardona.digital/ws');
  });
});

describe('probeHealth', () => {
  it('dit oui au serveur du jeu, dans la bonne version', async () => {
    expect(await probeHealth('http://x', answering(healthy))).toBe(true);
  });

  it('dit non à une autre version, un autre service ou une erreur', async () => {
    expect(await probeHealth('http://x', answering({ ...healthy, api: API_VERSION + 1 }))).toBe(false);
    expect(await probeHealth('http://x', answering({ ...healthy, service: 'autre' }))).toBe(false);
    expect(await probeHealth('http://x', answering({ ok: false }, 503))).toBe(false);
    expect(await probeHealth('http://x', () => Promise.reject(new TypeError('Failed to fetch')))).toBe(false);
  });

  it('abandonne un serveur qui ne répond pas', async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));

    expect(await probeHealth('http://x', hanging, 10)).toBe(false);
  });
});
