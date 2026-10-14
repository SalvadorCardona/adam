import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupDatabase, backupName, listBackups } from './backup.ts';

describe('sauvegarde de la base', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mf-backup-'));
    path = join(dir, 'adam.sqlite');

    const db = new DatabaseSync(path);

    db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('adam')");
    db.close();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('nomme la copie d’après la base et l’instant', () => {
    expect(backupName(path, new Date('2026-10-13T03:04:05.678Z'))).toBe('adam-20261013T030405Z.sqlite');
  });

  it('copie les données dans backups/', async () => {
    const target = await backupDatabase(path, 14, new Date('2026-10-13T03:00:00Z'));

    expect(existsSync(target)).toBe(true);

    const copy = new DatabaseSync(target);

    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'adam' });
    copy.close();
  });

  it('ne garde que les copies les plus récentes', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await backupDatabase(path, 3, new Date(Date.UTC(2026, 9, day)));
    }

    const kept = listBackups(join(dir, 'backups'), path);

    expect(kept).toEqual([
      'adam-20261003T000000Z.sqlite',
      'adam-20261004T000000Z.sqlite',
      'adam-20261005T000000Z.sqlite',
    ]);
  });

  it('refuse une base en mémoire', async () => {
    await expect(backupDatabase(':memory:')).rejects.toThrow();
  });
});
