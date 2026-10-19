import { describe, expect, it } from 'vitest';
import { DEFAULT_INVITE_MINUTES, DEFAULT_PORT, loadConfig, originAllowed } from './config.ts';

describe('loadConfig', () => {
  it('prend les valeurs du développement quand rien n’est fixé', () => {
    const config = loadConfig({});

    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.host).toBe('0.0.0.0');
    expect(config.databasePath).toBe('data/adam.sqlite');
    expect(originAllowed(config, 'http://localhost:5174')).toBe(true);
    expect(originAllowed(config, 'http://localhost.evil.example:5173')).toBe(false);
    expect(originAllowed(config, 'https://hermez.dev')).toBe(true);
    expect(originAllowed(config, 'https://adam.cardona.digital')).toBe(true);
    expect(originAllowed(config, 'https://mobile-factory.cardona.digital')).toBe(true);
  });

  it('donne à la base le nom du jeu', () => {
    expect(loadConfig({ DATABASE_PATH: '/data/mobile-factory.sqlite' }).databasePath).toBe('/data/adam.sqlite');
    expect(loadConfig({ DATABASE_PATH: '/mobile-factory/game.sqlite' }).databasePath).toBe('/mobile-factory/game.sqlite');
  });

  it('lit les variables d’environnement', () => {
    const config = loadConfig({
      PORT: '9000',
      HOST: '127.0.0.1',
      DATABASE_PATH: '/data/game.sqlite',
      CORS_ORIGINS: 'https://cardona.digital, https://example.org',
      INVITE_TTL_MINUTES: '15',
    });

    expect(config).toEqual({
      port: 9000,
      host: '127.0.0.1',
      databasePath: '/data/game.sqlite',
      corsOrigins: ['https://cardona.digital', 'https://example.org'],
      inviteTtlMs: 15 * 60_000,
    });
  });

  it('refuse un port illisible', () => {
    expect(() => loadConfig({ PORT: 'huit' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('borne la durée des invitations', () => {
    expect(loadConfig({}).inviteTtlMs).toBe(DEFAULT_INVITE_MINUTES * 60_000);
    expect(() => loadConfig({ INVITE_TTL_MINUTES: '0' })).toThrow(/INVITE_TTL_MINUTES/);
    expect(() => loadConfig({ INVITE_TTL_MINUTES: '2000' })).toThrow(/INVITE_TTL_MINUTES/);
    expect(() => loadConfig({ INVITE_TTL_MINUTES: 'long' })).toThrow(/INVITE_TTL_MINUTES/);
  });
});

describe('originAllowed', () => {
  const config = loadConfig({ CORS_ORIGINS: 'https://cardona.digital' });

  it('accepte une origine listée et un client sans origine', () => {
    expect(originAllowed(config, 'https://cardona.digital')).toBe(true);
    expect(originAllowed(config, undefined)).toBe(true);
  });

  it('refuse une autre origine, sauf avec *', () => {
    expect(originAllowed(config, 'https://evil.example')).toBe(false);
    expect(originAllowed(loadConfig({ CORS_ORIGINS: '*' }), 'https://evil.example')).toBe(true);
  });
});
