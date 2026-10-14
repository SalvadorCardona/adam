import { describe, expect, it } from 'vitest';
import {
  currentKey,
  decodeTransfer,
  encodeTransfer,
  importTransfer,
  migrateLegacyKeys,
  transferOf,
  withoutTransfer,
  type MigrationStorage,
} from './legacyKeys.ts';
import { ACCOUNT_KEY } from './localAccount.ts';
import { SAVE_KEY } from './localSave.ts';
import { ZOOM_KEY } from './localZoom.ts';

function memoryStorage(entries: Record<string, string> = {}): MigrationStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(entries));

  return {
    data,
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('migrateLegacyKeys', () => {
  it('copie chaque ancienne clé sous le nouveau nom, puis retire l’ancienne', () => {
    const storage = memoryStorage({
      'mobile-factory:save': '{"version":1}',
      'mobile-factory:save:corrupt': 'abîmée',
      'mobile-factory:account': '{"token":"jeton"}',
      'mobile-factory:zoom': '1.2',
      'autre-site:clé': 'intacte',
    });

    expect(migrateLegacyKeys(storage)).toBe(4);
    expect(Object.fromEntries(storage.data)).toEqual({
      [SAVE_KEY]: '{"version":1}',
      'adam:save:corrupt': 'abîmée',
      [ACCOUNT_KEY]: '{"token":"jeton"}',
      [ZOOM_KEY]: '1.2',
      'autre-site:clé': 'intacte',
    });
  });

  it('n’écrase jamais une nouvelle clé déjà là, mais retire l’ancienne', () => {
    const storage = memoryStorage({ 'mobile-factory:save': 'ancienne', [SAVE_KEY]: 'nouvelle' });

    expect(migrateLegacyKeys(storage)).toBe(0);
    expect(Object.fromEntries(storage.data)).toEqual({ [SAVE_KEY]: 'nouvelle' });
  });

  it('ne fait rien une seconde fois', () => {
    const storage = memoryStorage({ 'mobile-factory:locale': 'en' });

    migrateLegacyKeys(storage);
    expect(migrateLegacyKeys(storage)).toBe(0);
    expect(Object.fromEntries(storage.data)).toEqual({ 'adam:locale': 'en' });
  });

  it('garde l’ancienne clé si la copie échoue (stockage plein)', () => {
    const storage = memoryStorage({ 'mobile-factory:save': 'partie' });

    storage.setItem = () => {
      throw new DOMException('plein', 'QuotaExceededError');
    };
    expect(migrateLegacyKeys(storage)).toBe(0);
    expect(storage.data.get('mobile-factory:save')).toBe('partie');
  });

  it('survit à l’absence de stockage', () => {
    expect(migrateLegacyKeys(null)).toBe(0);
  });
});

describe('transfert entre origines', () => {
  it('nomme les clés du jeu, anciennes ou nouvelles', () => {
    expect(currentKey('mobile-factory:garden')).toBe('adam:garden');
    expect(currentKey('adam:garden')).toBe('adam:garden');
    expect(currentKey('ailleurs')).toBeNull();
  });

  it('relit ce qu’il a encodé', async () => {
    const entries = { 'mobile-factory:save': JSON.stringify({ state: 'x'.repeat(5000) }), 'mobile-factory:locale': 'fr' };
    const text = await encodeTransfer(entries);

    expect(text).toMatch(/^[\w-]+$/);
    expect(text.length).toBeLessThan(500);
    expect(await decodeTransfer(text)).toEqual(entries);
    expect(await decodeTransfer('pas du tout ça')).toBeNull();
  });

  it('pose les clés reçues sans écraser ni l’onglet ni l’existant', async () => {
    const storage = memoryStorage({ [ZOOM_KEY]: '0.8' });
    const text = await encodeTransfer({
      'mobile-factory:save': 'partie',
      'mobile-factory:zoom': '1.4',
      'mobile-factory:tab': 'onglet',
      'autre:clé': 'refusée',
    });

    expect(await importTransfer(storage, text)).toBe(1);
    expect(Object.fromEntries(storage.data)).toEqual({ [ZOOM_KEY]: '0.8', [SAVE_KEY]: 'partie' });
    // Une seconde fois : plus rien à écrire.
    expect(await importTransfer(storage, text)).toBe(0);
  });

  it('lit le fragment et le retire de l’adresse, la requête intacte', () => {
    expect(transferOf('#import=abc')).toBe('abc');
    expect(transferOf('#x')).toBeNull();
    expect(withoutTransfer('https://adam.cardona.digital/adam/?join=ABCD2345#import=abc')).toBe(
      'https://adam.cardona.digital/adam/?join=ABCD2345',
    );
  });
});
