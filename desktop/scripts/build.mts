/**
 * `npm run desktop:build` : le jeu construit par Vite (mode `desktop`), puis
 * empaqueté par electron-builder pour Linux x64 — un AppImage
 * (`Adam-<version>.AppImage`) et un tar.gz de secours, dans `desktop/release/`.
 *
 * Hors ligne par défaut : `VITE_API_URL` n'est lue que si on la passe
 * (`VITE_API_URL=https://… npm run desktop:build`, la variante en ligne).
 * `--dir` s'arrête au dossier dépaqueté (`release/linux-unpacked/`), plus vite
 * pour les tests.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { APP, DESKTOP, bin, ensureDependencies, run, stageShell } from './stage.mts';

const apiUrl = process.env['VITE_API_URL'] || null;
const dirOnly = process.argv.includes('--dir');

ensureDependencies();

// Le jeu : le même build que le web, sans Umami (mode `desktop`, `vite.config.ts`) et sans serveur s'il n'est pas demandé.
const env = { ...process.env, VITE_API_URL: apiUrl ?? '' };

rmSync(join(APP, 'game'), { recursive: true, force: true });
run(bin('tsc'), ['--noEmit']);
run(bin('vite'), ['build', '--mode', 'desktop', '--outDir', join(APP, 'game'), '--emptyOutDir'], { env });
stageShell(apiUrl);

rmSync(join(DESKTOP, 'release'), { recursive: true, force: true });
run(bin('electron-builder'), ['--linux', '--x64', '--publish', 'never', ...(dirOnly ? ['--dir'] : [])], { cwd: DESKTOP });
console.log(`\nAdam de bureau ${apiUrl ? `en ligne (${apiUrl})` : 'hors ligne'} : ${join(DESKTOP, 'release')}`);
