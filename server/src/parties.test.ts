import { describe, expect, it } from 'vitest';
import { PARTY_ALPHABET, PARTY_LIMITS, isPartyError, isPartyResponse, isSessionResponse } from '../../shared/api.ts';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, openDatabase, readMigrations } from './db.ts';
import { LOOKUP_MAX_PER_IP, newPartyCode } from './parties.ts';

const TTL_MINUTES = 30;

function setup() {
  const db = openDatabase(':memory:');
  const time = { now: 1_700_000_000_000 };

  migrate(db, readMigrations());

  const api = createApp({
    config: loadConfig({ INVITE_TTL_MINUTES: String(TTL_MINUTES) }),
    db,
    clock: () => time.now,
    clientIp: () => '10.0.0.1',
  });
  const send = (method: string, path: string, token?: string, body?: unknown) =>
    api.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const signUp = async (nickname: string): Promise<string> => {
    const response = await send('POST', '/auth/register', undefined, {
      nickname,
      email: `${nickname.toLowerCase()}@example.com`,
      password: 'une-phrase-secrète',
    });
    const body: unknown = await response.json();

    if (!isSessionResponse(body)) throw new Error('inscription attendue');

    return body.token;
  };

  return { api, db, time, send, signUp };
}

async function party(response: Response) {
  const body: unknown = await response.json();

  if (!isPartyResponse(body)) throw new Error(`partie attendue : ${JSON.stringify(body)}`);

  return body.party;
}

async function error(response: Response): Promise<string> {
  const body: unknown = await response.json();

  if (!isPartyError(body)) throw new Error(`refus attendu : ${JSON.stringify(body)}`);

  return body.error;
}

describe('newPartyCode', () => {
  it('tire des codes de la bonne longueur, dans l’alphabet lisible', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = newPartyCode();

      expect(code).toHaveLength(PARTY_LIMITS.codeLength);
      expect([...code].every((char) => PARTY_ALPHABET.includes(char))).toBe(true);
    }
    expect(new Set(Array.from({ length: 200 }, newPartyCode)).size).toBe(200);
  });
});

describe('POST /parties', () => {
  it('crée une session avec un code et une échéance', async () => {
    const { send, signUp, time } = setup();
    const adam = await signUp('Adam');
    const response = await send('POST', '/parties', adam);
    const created = await party(response);

    expect(response.status).toBe(201);
    expect(created.role).toBe('host');
    expect(created.host).toBe('Adam');
    expect(created.guests).toEqual([]);
    expect(created.expiresAt).toBe(time.now + TTL_MINUTES * 60_000);
    expect(created.code).toMatch(/^[A-Z2-9]{8}$/u);
  });

  it('demande un joueur connecté', async () => {
    const { send } = setup();
    const response = await send('POST', '/parties');

    expect(response.status).toBe(401);
    expect(await error(response)).toBe('unauthorized');
  });

  it('ferme l’invitation précédente du même hôte', async () => {
    const { send, signUp } = setup();
    const adam = await signUp('Adam');
    const first = await party(await send('POST', '/parties', adam));
    const second = await party(await send('POST', '/parties', adam));

    expect(second.code).not.toBe(first.code);
    expect((await send('GET', `/parties/${first.code}`)).status).toBe(410);
    expect((await send('GET', `/parties/${second.code}`)).status).toBe(200);
  });
});

describe('GET /parties/:code', () => {
  it('montre l’hôte sans compte, mais pas la salle', async () => {
    const { send, signUp } = setup();
    const adam = await signUp('Adam');
    const eve = await signUp('Eve');
    const { code } = await party(await send('POST', '/parties', adam));

    await send('POST', `/parties/${code}/join`, eve);

    const anonymous = await party(await send('GET', `/parties/${code}`));

    expect(anonymous.host).toBe('Adam');
    expect(anonymous.role).toBe('none');
    expect(anonymous.guests).toEqual([]);
    expect(anonymous.full).toBe(true);
  });

  it('accepte le code tapé en minuscules, avec des tirets', async () => {
    const { send, signUp } = setup();
    const { code } = await party(await send('POST', '/parties', await signUp('Adam')));
    const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();

    expect((await send('GET', `/parties/${typed}`)).status).toBe(200);
  });

  it('répond 404 à un code inconnu ou mal formé', async () => {
    const { send } = setup();

    for (const code of ['ZZZZZZZZ', 'court', 'AAAAAAA0']) {
      const response = await send('GET', `/parties/${code}`);

      expect(response.status).toBe(404);
      expect(await error(response)).toBe('notFound');
    }
  });

  it('limite les essais de codes inconnus par IP', async () => {
    const { send } = setup();

    for (let i = 0; i < LOOKUP_MAX_PER_IP; i += 1) expect((await send('GET', '/parties/ZZZZZZZZ')).status).toBe(404);

    const response = await send('GET', '/parties/ZZZZZZZZ');

    expect(response.status).toBe(429);
    expect(await error(response)).toBe('tooManyAttempts');
  });
});

describe('POST /parties/:code/join', () => {
  it('place l’ami dans la salle d’attente, que l’hôte voit', async () => {
    const { send, signUp } = setup();
    const adam = await signUp('Adam');
    const eve = await signUp('Eve');
    const { code } = await party(await send('POST', '/parties', adam));
    const joined = await party(await send('POST', `/parties/${code}/join`, eve));

    expect(joined.role).toBe('guest');
    expect(joined.guests).toEqual(['Eve']);

    const hostView = await party(await send('GET', `/parties/${code}`, adam));

    expect(hostView.role).toBe('host');
    expect(hostView.guests).toEqual(['Eve']);
  });

  it('est sans effet la deuxième fois', async () => {
    const { send, signUp } = setup();
    const adam = await signUp('Adam');
    const eve = await signUp('Eve');
    const { code } = await party(await send('POST', '/parties', adam));

    await send('POST', `/parties/${code}/join`, eve);

    expect((await party(await send('POST', `/parties/${code}/join`, eve))).guests).toEqual(['Eve']);
  });

  it('demande un joueur connecté', async () => {
    const { send, signUp } = setup();
    const { code } = await party(await send('POST', '/parties', await signUp('Adam')));

    expect((await send('POST', `/parties/${code}/join`)).status).toBe(401);
  });

  it('refuse un troisième joueur : la salle est pleine', async () => {
    const { send, signUp } = setup();
    const { code } = await party(await send('POST', '/parties', await signUp('Adam')));

    await send('POST', `/parties/${code}/join`, await signUp('Eve'));

    const response = await send('POST', `/parties/${code}/join`, await signUp('Cain'));

    expect(response.status).toBe(409);
    expect(await error(response)).toBe('full');
  });

  it('rend sa salle à l’hôte qui ouvre son propre lien', async () => {
    const { send, signUp } = setup();
    const adam = await signUp('Adam');
    const { code } = await party(await send('POST', '/parties', adam));
    const own = await party(await send('POST', `/parties/${code}/join`, adam));

    expect(own.role).toBe('host');
    expect(own.guests).toEqual([]);
  });
});

describe('expiration et fermeture', () => {
  it('un lien expiré ne permet plus de rejoindre', async () => {
    const { send, signUp, time } = setup();
    const adam = await signUp('Adam');
    const eve = await signUp('Eve');
    const { code } = await party(await send('POST', '/parties', adam));

    time.now += TTL_MINUTES * 60_000 - 1;
    expect((await send('GET', `/parties/${code}`)).status).toBe(200);
    time.now += 1;

    const lookup = await send('GET', `/parties/${code}`);
    const join = await send('POST', `/parties/${code}/join`, eve);

    expect(lookup.status).toBe(410);
    expect(await error(lookup)).toBe('expired');
    expect(join.status).toBe(410);
    expect(await error(join)).toBe('expired');
  });

  it('l’hôte ferme la session : plus personne ne rejoint', async () => {
    const { send, signUp } = setup();
    const adam = await signUp('Adam');
    const { code } = await party(await send('POST', '/parties', adam));
    const closing = await send('DELETE', `/parties/${code}`, adam);
    const after = await send('POST', `/parties/${code}/join`, await signUp('Eve'));

    expect(closing.status).toBe(200);
    expect(after.status).toBe(410);
    expect(await error(after)).toBe('closed');
  });

  it('seul l’hôte ferme sa session', async () => {
    const { send, signUp } = setup();
    const { code } = await party(await send('POST', '/parties', await signUp('Adam')));
    const response = await send('DELETE', `/parties/${code}`, await signUp('Eve'));

    expect(response.status).toBe(403);
    expect(await error(response)).toBe('forbidden');
    expect((await send('GET', `/parties/${code}`)).status).toBe(200);
  });

  it('un invité quitte la salle et libère sa place', async () => {
    const { send, signUp } = setup();
    const adam = await signUp('Adam');
    const eve = await signUp('Eve');
    const { code } = await party(await send('POST', '/parties', adam));

    await send('POST', `/parties/${code}/join`, eve);
    expect((await send('POST', `/parties/${code}/leave`, eve)).status).toBe(200);
    expect((await party(await send('GET', `/parties/${code}`, adam))).guests).toEqual([]);
    expect((await party(await send('POST', `/parties/${code}/join`, await signUp('Cain')))).guests).toEqual(['Cain']);
  });

  it('efface les parties finies depuis plus d’un jour', async () => {
    const { send, signUp, time, db } = setup();
    const adam = await signUp('Adam');

    await send('POST', '/parties', adam);
    time.now += 2 * 24 * 3600 * 1000;
    await send('POST', '/parties', adam);

    expect((db.prepare('SELECT COUNT(*) AS n FROM parties').get() as { n: number }).n).toBe(1);
  });
});
