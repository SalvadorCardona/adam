import { describe, expect, it } from 'vitest';
import { AccountClient, resetTokenOf, withoutReset } from './account.ts';
import { LocalAccount } from '../storage/localAccount.ts';

const USER = { id: 1, nickname: 'Adam', email: 'adam@example.com' };

function memory() {
  const data = new Map<string, string>();

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const reply = (status: number, body: unknown): typeof fetch =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status })));
const down: typeof fetch = () => Promise.reject(new TypeError('network'));

describe('AccountClient', () => {
  it('garde la session après une connexion, et la retrouve au rechargement', async () => {
    const storage = memory();
    const client = new AccountClient('http://x', new LocalAccount(storage), reply(200, { ok: true, token: 't', user: USER }));
    const result = await client.login({ email: USER.email, password: 'secret-secret' });

    expect(result).toEqual({ ok: true, user: USER });
    expect(new AccountClient('http://x', new LocalAccount(storage), down).user).toEqual(USER);
  });

  it('ouvre une session d’invité avec un simple pseudo, gardée au rechargement', async () => {
    const storage = memory();
    const guest = { id: 7, nickname: 'Lina', email: '', guest: true };
    const sent: { url: string; body: unknown }[] = [];
    const fetcher = ((url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) });

      return Promise.resolve(new Response(JSON.stringify({ ok: true, token: 'g', user: guest }), { status: 201 }));
    }) as unknown as typeof fetch;
    const client = new AccountClient('http://x', new LocalAccount(storage), fetcher);

    expect(await client.guest('Lina')).toEqual({ ok: true, user: guest });
    expect(sent).toEqual([{ url: 'http://x/auth/guest', body: { nickname: 'Lina' } }]);
    expect(client.token).toBe('g');
    expect(new AccountClient('http://x', new LocalAccount(storage), down).user).toEqual(guest);
  });

  it('dit « hors ligne » sans toucher à la session', async () => {
    const storage = memory();

    new LocalAccount(storage).save({ token: 't', user: USER });

    const client = new AccountClient('http://x', new LocalAccount(storage), down);

    expect(await client.login({ email: 'a@b.fr', password: 'x' })).toEqual({ ok: false, reason: 'offline' });
    await client.refresh();
    expect(client.user).toEqual(USER);
  });

  it('périme la session quand le serveur la refuse', async () => {
    const storage = memory();

    new LocalAccount(storage).save({ token: 't', user: USER });

    const client = new AccountClient('http://x', new LocalAccount(storage), reply(401, { ok: false, error: 'unauthorized' }));

    await client.refresh();
    expect(client.user).toBeNull();
    expect(new LocalAccount(storage).load()).toBeNull();
  });

  it('transmet les refus du serveur', async () => {
    const client = new AccountClient('http://x', new LocalAccount(memory()), reply(409, { ok: false, error: 'emailTaken' }));

    expect(await client.register({ nickname: 'Adam', email: USER.email, password: 'secret-secret' })).toEqual({
      ok: false,
      reason: 'emailTaken',
    });
  });

  it('se déconnecte même sans réseau', async () => {
    const storage = memory();

    new LocalAccount(storage).save({ token: 't', user: USER });

    const client = new AccountClient('http://x', new LocalAccount(storage), down);

    await client.logout();
    expect(client.user).toBeNull();
    expect(new LocalAccount(storage).load()).toBeNull();
  });

  it('sans serveur configuré, ne demande rien et reste déconnecté', async () => {
    const client = new AccountClient(null, new LocalAccount(memory()), down);

    expect(client.user).toBeNull();
    expect(await client.login({ email: 'a@b.fr', password: 'x' })).toEqual({ ok: false, reason: 'offline' });
  });

  it('demande un lien de réinitialisation, dans la langue du jeu', async () => {
    const sent: { url: string; body: unknown }[] = [];
    const fetcher = ((url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) });

      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as unknown as typeof fetch;
    const client = new AccountClient('http://x', new LocalAccount(memory()), fetcher);

    expect(await client.forgot('adam@example.com', 'en')).toEqual({ ok: true });
    expect(sent).toEqual([{ url: 'http://x/auth/forgot', body: { email: 'adam@example.com', locale: 'en' } }]);
    expect(client.user).toBeNull();
  });

  it('dit pourquoi la demande de lien est refusée', async () => {
    const client = new AccountClient('http://x', new LocalAccount(memory()), reply(429, { ok: false, error: 'tooManyAttempts', retryAfter: 30 }));

    expect(await client.forgot('adam@example.com', 'fr')).toEqual({ ok: false, reason: 'tooManyAttempts', retryAfter: 30 });
    expect(await new AccountClient('http://x', new LocalAccount(memory()), down).forgot('a@b.fr', 'fr')).toEqual({ ok: false, reason: 'offline' });
  });

  it('se connecte avec le lien et le nouveau mot de passe, ou dit que le lien ne vaut plus', async () => {
    const storage = memory();
    const client = new AccountClient('http://x', new LocalAccount(storage), reply(200, { ok: true, token: 'n', user: USER }));

    expect(await client.reset({ token: 'jeton', password: 'nouveau-secret' })).toEqual({ ok: true, user: USER });
    expect(client.token).toBe('n');

    const stale = new AccountClient('http://x', new LocalAccount(memory()), reply(400, { ok: false, error: 'badToken' }));

    expect(await stale.reset({ token: 'vieux', password: 'nouveau-secret' })).toEqual({ ok: false, reason: 'badToken' });
  });
});

describe('lien de réinitialisation', () => {
  it('lit le jeton dans la requête de la page, et l’en retire', () => {
    expect(resetTokenOf('?reset=abc_-1')).toBe('abc_-1');
    expect(resetTokenOf('?join=X&reset=')).toBeNull();
    expect(resetTokenOf('')).toBeNull();
    expect(withoutReset('https://hermez.dev/adam/?reset=abc&seed=3')).toBe('https://hermez.dev/adam/?seed=3');
  });
});
