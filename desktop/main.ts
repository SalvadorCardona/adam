/**
 * Adam en application de bureau : le processus principal d'Electron.
 *
 * Il ne sait rien du jeu. Il sert le build Vite (`app/game/`, copie de
 * `dist/`) par un protocole maison, `app://adam/…` : une origine stable — le
 * `localStorage`, donc la sauvegarde, en dépend d'une version à l'autre — et
 * les URLs absolues `/adam/…` du build, routes de test comprises, marchent
 * telles quelles. Il ouvre une fenêtre plein écran, sans menu, verrouillée :
 * aucune navigation hors de `app://adam`, aucune fenêtre neuve, aucune
 * permission sauf le plein écran (et le micro dans la variante en ligne).
 *
 * `npm run desktop:dev` le lance sur le serveur Vite (`ADAM_DEV_URL`), avec
 * les DevTools ; le paquet construit n'en a pas.
 */
import { app, BrowserWindow, ipcMain, Menu, powerMonitor, protocol, session, shell } from 'electron';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const SCHEME = 'app';
const HOST = 'adam';
/** La `base` de Vite (`vite.config.ts`) : le jeu vit sous `/adam/`, comme sur le web. */
const BASE = '/adam/';
const ORIGIN = `${SCHEME}://${HOST}`;
const START_URL = `${ORIGIN}${BASE}`;

/** Le dossier de l'application empaquetée (ou `desktop/app/` en développement). */
const APP_DIR = __dirname;
const GAME_DIR = join(APP_DIR, 'game');

/**
 * Ce que `desktop/scripts/build.ts` a décidé au build : hors ligne par défaut ;
 * avec `VITE_API_URL`, la variante en ligne, qui parle à ce serveur et peut
 * demander le micro pour le vocal.
 */
interface DesktopConfig {
  apiUrl: string | null;
}

function readConfig(): DesktopConfig {
  try {
    const parsed = JSON.parse(readFileSync(join(APP_DIR, 'config.json'), 'utf8')) as Partial<DesktopConfig>;

    return { apiUrl: typeof parsed.apiUrl === 'string' && parsed.apiUrl !== '' ? parsed.apiUrl : null };
  } catch {
    return { apiUrl: null };
  }
}

const config = readConfig();
const devUrl = process.env['ADAM_DEV_URL'] ?? null;
const dev = devUrl !== null;

/*
 * Les sauvegardes sont dans le `localStorage` du profil : `~/.config/Adam`,
 * fixé ici plutôt que déduit du nom du paquet, pour qu'aucune version ne le
 * déplace. Le développement a le sien, pour ne pas toucher à la vraie partie ;
 * les tests passent un dossier jetable (`ADAM_USER_DATA`).
 */
app.setName('Adam');
app.setPath('userData', process.env['ADAM_USER_DATA'] ?? join(app.getPath('appData'), dev ? 'Adam-dev' : 'Adam'));

// Le son repart seul au retour de veille ou du menu Steam : la manette ne compte pas comme un « geste » pour Chromium.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

/** Les connexions que la page peut ouvrir : rien hors de chez elle, sauf le serveur de la variante en ligne. */
function connectSources(): string {
  if (!config.apiUrl) return "'self'";
  const api = new URL(config.apiUrl);
  const socket = `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}`;

  return `'self' ${api.origin} ${socket}`;
}

/*
 * Le CSP du jeu de bureau : plus strict que le web, qui n'en pose pas.
 * Aucun script d'ailleurs (pas d'Umami : le build `desktop` le retire) ;
 * `'unsafe-eval'` parce que PixiJS v8 compile ses shaders et ses
 * synchronisations d'uniformes par `new Function` (sans lui : « Current
 * environment does not allow unsafe-eval », écran vide). Styles
 * en ligne permis (le HUD pose des `style=`), images et sons du paquet, en
 * `data:` ou `blob:` (icônes SVG, sons décodés).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  `connect-src ${connectSources()}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Le fichier du build qui répond à un chemin. `/adam/test` répond par
 * `test/index.html` (copié par `vite.config.ts`), un chemin sans fichier par
 * `index.html`, comme le serveur de Vite ; rien ne sort de `GAME_DIR`.
 */
async function resolveFile(pathname: string): Promise<string | null> {
  if (!pathname.startsWith(BASE) && pathname !== BASE.slice(0, -1)) return null;
  let relative: string;

  try {
    relative = decodeURIComponent(pathname.slice(BASE.length));
  } catch {
    return null;
  }
  const target = normalize(join(GAME_DIR, relative));

  if (target !== GAME_DIR && !target.startsWith(GAME_DIR + sep)) return null;

  for (const candidate of [target, join(target, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Pas ce fichier-là : le suivant.
    }
  }
  // Une route inconnue sans extension : la page du jeu, qui la lira.
  return extname(target) === '' ? join(GAME_DIR, 'index.html') : null;
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.host !== HOST || (request.method !== 'GET' && request.method !== 'HEAD')) return new Response(null, { status: 404 });
  const file = await resolveFile(url.pathname);

  if (!file) return new Response(null, { status: 404 });
  const body = await readFile(file);
  const headers: Record<string, string> = {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  };

  if (extname(file) === '.html') headers['content-security-policy'] = CSP;
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}

/** Une URL que la fenêtre a le droit d'afficher : le jeu, et en développement le serveur Vite. */
function isGameUrl(raw: string): boolean {
  try {
    const url = new URL(raw);

    if (url.protocol === `${SCHEME}:` && url.host === HOST) return true;
    return devUrl !== null && url.origin === new URL(devUrl).origin;
  } catch {
    return false;
  }
}

/** Un lien externe s'ouvre dans le navigateur du système, en https seulement. */
function openOutside(raw: string): void {
  try {
    if (new URL(raw).protocol === 'https:') void shell.openExternal(raw);
  } catch {
    // Une adresse illisible : rien.
  }
}

function lockSession(): void {
  const ses = session.defaultSession;

  /*
   * Tout est refusé, sauf le plein écran et, dans la variante en ligne, le
   * micro du vocal. La manette n'est pas une permission dans Chromium : la
   * Gamepad API marche sans rien demander.
   */
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (!isGameUrl(contents.getURL())) return callback(false);
    if (permission === 'fullscreen') return callback(true);
    if (permission === 'media' && config.apiUrl) {
      const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : [];

      return callback(types.length > 0 && types.every((type) => type === 'audio'));
    }
    callback(false);
  });
  ses.setPermissionCheckHandler((_contents, permission, origin) => {
    if (!isGameUrl(origin)) return false;
    return permission === 'fullscreen' || (permission === 'media' && config.apiUrl !== null);
  });
  ses.setDevicePermissionHandler(() => false);

  // Hors ligne : aucune requête ne sort, Umami compris. En ligne, le seul serveur du build.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      url.startsWith(`${ORIGIN}/`) ||
      url.startsWith('devtools:') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      (devUrl !== null && isGameUrl(url)) ||
      (devUrl !== null && url.startsWith(new URL(devUrl).origin.replace(/^http/, 'ws'))) ||
      (config.apiUrl !== null && sameServer(url, config.apiUrl));

    callback({ cancel: !allowed });
  });
}

function sameServer(raw: string, api: string): boolean {
  try {
    return new URL(raw).host === new URL(api).host;
  } catch {
    return false;
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Adam',
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    fullscreen: true,
    autoHideMenuBar: true,
    show: false,
    // L'herbe du jeu (`GROUND.grass.base`) : pas d'éclair blanc avant le premier rendu.
    backgroundColor: '#93e8ae',
    icon: join(APP_DIR, 'icon.png'),
    webPreferences: {
      preload: join(APP_DIR, 'preload.js'),
      additionalArguments: [`--adam-version=${app.getVersion()}`],
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      devTools: dev,
      // La partie s'arrête d'elle-même fenêtre cachée ; rien à brider de plus.
      backgroundThrottling: true,
    },
  });

  window.setMenuBarVisibility(false);
  window.once('ready-to-show', () => window.show());

  const contents = window.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isGameUrl(url)) return;
    event.preventDefault();
    openOutside(url);
  });
  contents.on('will-redirect', (event, url) => {
    if (!isGameUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());

  // F11 bascule le plein écran sur PC ; F12 ouvre les DevTools, en développement seulement.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (input.key === 'F12' && dev) {
      event.preventDefault();
      contents.toggleDevTools();
    }
  });

  // Le serveur Vite n'est peut-être pas encore prêt : on réessaie.
  contents.on('did-fail-load', (_event, code, _description, url, mainFrame) => {
    if (dev && mainFrame && code !== -3) setTimeout(() => void window.loadURL(url), 500);
  });

  void window.loadURL(devUrl ?? START_URL);
  return window;
}

// Une seule instance : deux fenêtres écriraient la même sauvegarde.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);

  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();

    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  // « Quitter », depuis l'écran titre ou la pause : la page a déjà écrit la partie, on la pousse sur le disque avant de sortir.
  ipcMain.on('adam:quit', (event) => {
    if (!isGameUrl(event.senderFrame?.url ?? '')) return;
    session.defaultSession.flushStorageData();
    app.quit();
  });

  app.on('before-quit', () => session.defaultSession.flushStorageData());
  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    lockSession();
    const window = createWindow();

    /*
     * Retour de veille (Steam Deck) : sous gamescope, une fenêtre peut revenir
     * sans être repeinte. On redemande une image ; la page, elle, relance le son
     * en reprenant le focus.
     */
    powerMonitor.on('resume', () => {
      if (!window.isDestroyed()) window.webContents.invalidate();
    });
    powerMonitor.on('suspend', () => session.defaultSession.flushStorageData());
  });
}
