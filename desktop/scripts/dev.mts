/**
 * `npm run desktop:dev` : le jeu dans Electron, servi par Vite (rechargement à
 * chaud), DevTools ouverts par F12. Le profil est `~/.config/Adam-dev` : la
 * vraie sauvegarde du paquet n'est jamais touchée.
 */
import { spawn, spawnSync } from 'node:child_process';
import { APP, ROOT, bin, ensureDependencies, stageShell } from './stage.mts';

const PORT = 5173;
const URL = `http://localhost:${PORT}/adam/`;

ensureDependencies();
stageShell(process.env['VITE_API_URL'] || null);

const vite = spawn(bin('vite'), ['--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'inherit' });
// Ubuntu 24.04+ restreint les espaces de noms utilisateur : sans eux, Chromium ne démarre qu'hors de son bac à sable.
const sandbox = spawnSync('unshare', ['-Ur', 'true']).status === 0;
// Les arguments de `npm run desktop:dev -- …` passent à Electron (`--ozone-platform=headless`, `--remote-debugging-port=…`).
const electron = spawn(bin('electron'), [APP, ...(sandbox ? [] : ['--no-sandbox']), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, ADAM_DEV_URL: URL },
});

const stop = (): void => {
  vite.kill();
  electron.kill();
};

electron.on('exit', (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
vite.on('exit', () => electron.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
