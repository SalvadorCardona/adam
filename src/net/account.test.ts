import { describe, expect, it } from 'vitest';
import { AccountClient } from './account.ts';
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
});
