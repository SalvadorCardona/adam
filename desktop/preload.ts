/**
 * Le pont entre la page et Electron : le strict nécessaire, rien d'autre.
 *
 * La page tourne isolée (`contextIsolation`, `sandbox`, sans Node) ; elle ne
 * voit que `window.adamDesktop` — le drapeau qui fait paraître « Quitter »
 * (`src/app/desktop.ts`), la version du paquet, et `quit()`.
 */
import { contextBridge, ipcRenderer } from 'electron';

/** `--adam-version=…`, posé par le processus principal (`additionalArguments`). */
const version = process.argv.find((arg) => arg.startsWith('--adam-version='))?.slice('--adam-version='.length) ?? '';

contextBridge.exposeInMainWorld('adamDesktop', {
  isDesktop: true,
  version,
  quit: (): void => ipcRenderer.send('adam:quit'),
});
