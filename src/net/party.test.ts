import { describe, expect, it } from 'vitest';
import { LocalAccount } from '../storage/localAccount.ts';
import { AccountClient } from './account.ts';
import { PartyClient } from './party.ts';

const USER = { id: 1, nickname: 'Adam', email: 'adam@example.com' };
const PARTY = { code: 'ABCD2345', host: 'Adam', expiresAt: 1, role: 'host', guests: [], full: false };

function store(): LocalAccount {
  const data = new Map<string, string>([['mobile-factory:account', JSON.stringify({ token: 'jeton', user: USER })]]);

  return new LocalAccount({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  });
}

function client(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    calls.push({ url, init });

    return Promise.resolve(respond(url, init));
  }) as unknown as typeof fetch;
  const account = new AccountClient('https://api.example', store(), fetcher);

  return { party: new PartyClient(account), account, calls };
}

describe('PartyClient', () => {
  it('héberge au nom du joueur connecté', async () => {
    const { party, calls } = client(() => Response.json({ ok: true, party: PARTY }, { status: 201 }));
    const result = await party.host();

    expect(result).toEqual({ ok: true, party: PARTY });
    expect(calls[0]!.url).toBe('https://api.example/parties');
    expect((calls[0]!.init.headers as Record<string, string>)['Authorization']).toBe('Bearer jeton');
  });

  it('rend la raison d’un refus, avec l’attente', async () => {
    const { party } = client(() => Response.json({ ok: false, error: 'tooManyAttempts', retryAfter: 42 }, { status: 429 }));

    expect(await party.look('ABCD2345')).toEqual({ ok: false, reason: 'tooManyAttempts', retryAfter: 42 });
  });

  it('distingue un lien expiré d’un serveur qui répond de travers', async () => {
    const expired = client(() => Response.json({ ok: false, error: 'expired' }, { status: 410 }));
    const broken = client(() => new Response('oups', { status: 502 }));

    expect(await expired.party.join('ABCD2345')).toEqual({ ok: false, reason: 'expired' });
    expect(await broken.party.join('ABCD2345')).toEqual({ ok: false, reason: 'server' });
  });

  it('dit « hors ligne » quand le serveur ne répond pas', async () => {
    const { party } = client(() => {
      throw new Error('réseau');
    });

    expect(await party.look('ABCD2345')).toEqual({ ok: false, reason: 'offline' });
  });

  it('périme la session sur un 401', async () => {
    const { party, account } = client(() => Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }));

    expect(await party.host()).toEqual({ ok: false, reason: 'unauthorized' });
    expect(account.user).toBeNull();
  });

  it('ferme et quitte', async () => {
    const { party, calls } = client(() => Response.json({ ok: true }));

    expect(await party.close('ABCD2345')).toEqual({ ok: true });
    expect(await party.leave('ABCD2345')).toEqual({ ok: true });
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      'DELETE https://api.example/parties/ABCD2345',
      'POST https://api.example/parties/ABCD2345/leave',
    ]);
  });
});
