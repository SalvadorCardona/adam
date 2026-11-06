/**
 * Prépare `desktop/app/`, le dossier qu'Electron charge et qu'electron-builder
 * empaquette : `main.js` et `preload.js` (compilés de `desktop/*.ts`), un
 * `package.json` à lui (nom, version du jeu, éditeur), l'icône, la
 * configuration du build et — pour le paquet — le jeu construit, `game/`.
 *
 * Le jeu n'est pas dans le paquet de la racine : `desktop/` a ses propres
 * dépendances (Electron, electron-builder) et son lockfile, pour que
 * l'installation et le build du web ne changent pas d'un octet.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = resolve(DESKTOP, '..');
export const APP = join(DESKTOP, 'app');

/** Le binaire d'un outil de `node_modules/.bin`, de `desktop/` d'abord, puis de la racine. */
export function bin(name: string): string {
  for (const dir of [DESKTOP, ROOT]) {
    const path = join(dir, 'node_modules', '.bin', name);

    if (existsSync(path)) return path;
  }
  throw new Error(`${name} introuvable : lancez npm ci à la racine.`);
}

export function run(command: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): void {
  execFileSync(command, args, { stdio: 'inherit', cwd: options.cwd ?? ROOT, env: options.env ?? process.env });
}

/** Les dépendances de `desktop/`, installées depuis son lockfile s'il le faut. */
export function ensureDependencies(): void {
  if (existsSync(join(DESKTOP, 'node_modules', 'electron', 'dist'))) return;
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: DESKTOP });
}

/** `main.js`, `preload.js`, `package.json`, l'icône et `config.json` dans `desktop/app/`. */
export function stageShell(apiUrl: string | null): void {
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string; license: string };

  mkdirSync(APP, { recursive: true });
  for (const file of ['main.js', 'preload.js']) rmSync(join(APP, file), { force: true });
  run(bin('tsc'), ['-p', join(DESKTOP, 'tsconfig.build.json')]);
  writeFileSync(
    join(APP, 'package.json'),
    `${JSON.stringify(
      {
        name: 'adam',
        productName: 'Adam',
        // La CI d'un tag `v1.2.3` passe `ADAM_DESKTOP_VERSION=1.2.3` : le fichier de la Release porte le numéro du tag.
        version: process.env['ADAM_DESKTOP_VERSION'] || root.version,
        description: 'Adam — jeu de construction et de survie 2D. Un produit Hermez.',
        license: root.license,
        // L'éditeur du paquet de bureau. Le champ `author` du package.json de la racine ne change pas.
        author: { name: 'Hermez', url: 'https://hermez.dev' },
        homepage: 'https://hermez.dev/adam/',
        main: 'main.js',
        type: 'commonjs',
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(APP, 'config.json'), `${JSON.stringify({ apiUrl })}\n`);
  copyFileSync(join(ROOT, 'public', 'icon.png'), join(APP, 'icon.png'));
}
