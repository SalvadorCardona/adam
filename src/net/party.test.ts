import { describe, expect, it } from 'vitest';
import { LocalAccount } from '../storage/localAccount.ts';
import { AccountClient } from './account.ts';
import { PartyClient } from './party.ts';

const USER = { id: 1, nickname: 'Adam', email: 'adam@example.com' };
const PARTY = { code: 'ABCD2345', host: 'Adam', expiresAt: 1, role: 'host', guests: [], full: false };

function store(signedIn: boolean): LocalAccount {
  const data = new Map<string, string>(signedIn ? [['adam:account', JSON.stringify({ token: 'jeton', user: USER })]] : []);

  return new LocalAccount({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  });
}

function client(respond: (url: string, init: RequestInit) => Response | Promise<Response>, signedIn = true) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    calls.push({ url, init });

    return Promise.resolve(respond(url, init));
  }) as unknown as typeof fetch;
  const account = new AccountClient('https://api.example', store(signedIn), fetcher);

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

describe('PartyClient.joinAs : l’ami sans compte', () => {
  const LINA = { id: 9, nickname: 'Lina', email: '', guest: true };
  const GUEST_PARTY = { ...PARTY, role: 'guest', guests: ['Lina'], full: true };

  /** Le serveur : une session d'invité, puis la salle — ou le refus donné pour la salle. */
  function server(refusal?: { status: number; error: string }) {
    return (url: string): Response => {
      if (url.endsWith('/auth/guest')) return Response.json({ ok: true, token: 'invite', user: LINA }, { status: 201 });
      if (refusal) return Response.json({ ok: false, error: refusal.error }, { status: refusal.status });

      return Response.json({ ok: true, party: GUEST_PARTY });
    };
  }

  it('ouvre une session d’invité avec son pseudo, puis rejoint la salle avec elle', async () => {
    const { party, account, calls } = client(server(), false);
    const result = await party.joinAs('ABCD2345', '  Lina ');

    expect(result).toEqual({ ok: true, party: GUEST_PARTY });
    expect(account.user).toEqual(LINA);
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      'POST https://api.example/auth/guest',
      'POST https://api.example/parties/ABCD2345/join',
    ]);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ nickname: 'Lina' });
    expect((calls[1]!.init.headers as Record<string, string>)['Authorization']).toBe('Bearer invite');
  });

  it('refuse un pseudo illisible sans rien demander au serveur', async () => {
    const { party, calls } = client(server(), false);

    expect(await party.joinAs('ABCD2345', '')).toEqual({ ok: false, reason: 'nickname', problem: 'empty' });
    expect(await party.joinAs('ABCD2345', 'x')).toEqual({ ok: false, reason: 'nickname', problem: 'tooShort' });
    expect(calls).toHaveLength(0);
  });

  it('garde le compte d’un joueur déjà connecté', async () => {
    const { party, calls } = client(server());

    await party.joinAs('ABCD2345', 'Autre');
    expect(calls.map((call) => call.url)).toEqual(['https://api.example/parties/ABCD2345/join']);
  });

  it('dit pourquoi on n’entre pas : lien expiré, session fermée, partie pleine', async () => {
    for (const [status, error] of [
      [410, 'expired'],
      [410, 'closed'],
      [409, 'full'],
      [404, 'notFound'],
    ] as const) {
      const { party } = client(server({ status, error }), false);

      expect(await party.joinAs('ABCD2345', 'Lina')).toEqual({ ok: false, reason: error });
    }
  });

  it('dit « hors ligne » quand le serveur est injoignable', async () => {
    const { party } = client(() => {
      throw new Error('réseau');
    }, false);

    expect(await party.joinAs('ABCD2345', 'Lina')).toEqual({ ok: false, reason: 'offline' });
  });

  it('héberge aussi sans compte : l’hôte n’entre qu’un pseudo', async () => {
    const { party, calls } = client((url) =>
      url.endsWith('/auth/guest')
        ? Response.json({ ok: true, token: 'hote', user: { ...LINA, nickname: 'Salva' } }, { status: 201 })
        : Response.json({ ok: true, party: PARTY }, { status: 201 }),
    false);

    expect(await party.hostAs('Salva')).toEqual({ ok: true, party: PARTY });
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      'POST https://api.example/auth/guest',
      'POST https://api.example/parties',
    ]);
  });
});
