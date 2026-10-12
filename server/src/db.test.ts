import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, readMigrations, schemaVersion, type Migration } from './db.ts';

const dirs: string[] = [];

function migrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-migrations-'));

  dirs.push(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);

  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migrations du serveur', () => {
  it('s’appliquent sur une base neuve, puis plus jamais', () => {
    const db = openDatabase(':memory:');
    const migrations = readMigrations();

    expect(migrations.length).toBeGreaterThan(0);
    expect(migrate(db, migrations)).toHaveLength(migrations.length);
    expect(schemaVersion(db)).toBe(migrations.length);
    expect(migrate(db, migrations)).toEqual([]);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'created_at'").get()).toBeDefined();
    db.close();
  });
});

describe('readMigrations', () => {
  it('lit les fichiers dans l’ordre', () => {
    const dir = migrationsDir({ '0002_b.sql': 'SELECT 2;', '0001_a.sql': 'SELECT 1;' });

    expect(readMigrations(dir).map((m) => `${m.version}_${m.name}`)).toEqual(['1_a', '2_b']);
  });

  it('refuse un nom mal formé ou un numéro qui saute', () => {
    expect(() => readMigrations(migrationsDir({ 'init.sql': '' }))).toThrow(/mal nommée/);
    expect(() => readMigrations(migrationsDir({ '0001_a.sql': '', '0003_c.sql': '' }))).toThrow(/contiguës/);
  });
});

describe('migrate', () => {
  const first: Migration = { version: 1, name: 'a', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' };

  it('n’applique que les migrations nouvelles', () => {
    const db = openDatabase(':memory:');

    migrate(db, [first]);
    const applied = migrate(db, [first, { version: 2, name: 'b', sql: 'CREATE TABLE b (id INTEGER);' }]);

    expect(applied.map((m) => m.name)).toEqual(['b']);
    expect(schemaVersion(db)).toBe(2);
    db.close();
  });

  it('annule une migration qui échoue, sans rien laisser', () => {
    const db = openDatabase(':memory:');
    const broken: Migration = { version: 2, name: 'broken', sql: 'CREATE TABLE b (id INTEGER); SELECT nope FROM nowhere;' };

    migrate(db, [first]);
    expect(() => migrate(db, [first, broken])).toThrow(/2_broken/);
    expect(schemaVersion(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined();
    db.close();
  });

  it('refuse une base plus récente que le code, ou une migration renommée', () => {
    const db = openDatabase(':memory:');

    migrate(db, [first, { version: 2, name: 'b', sql: 'SELECT 1;' }]);
    expect(() => migrate(db, [first])).toThrow(/plus récente/);
    expect(() => migrate(db, [{ ...first, name: 'renamed' }, { version: 2, name: 'b', sql: '' }])).toThrow(/s'appelait/);
    db.close();
  });
});
