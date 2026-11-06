import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/*
 * Le paquet construit, comme sur le Deck : il s'ouvre sur l'écran titre,
 * sans Node dans la page, sans navigation hors d'`app://adam` ; une partie
 * lancée, « Quitter » de la pause ferme l'application, et relancée elle
 * propose « Continuer ». Le profil (`ADAM_USER_DATA`) est un dossier jetable.
 */

const EXECUTABLE = resolve(import.meta.dirname, '..', 'release', 'linux-unpacked', 'adam');

/** Pas de fenêtre à l'écran : Chromium dessine sans affichage, WebGL par SwiftShader. */
const HEADLESS = process.env['ADAM_E2E_HEADED'] ? [] : ['--ozone-platform=headless', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** Ce que le preload expose (`desktop/preload.ts`). */
declare global {
  interface Window {
    adamDesktop?: { isDesktop: true; version: string; quit(): void };
  }
}

let profile = '';

test.beforeAll(() => {
  if (!existsSync(EXECUTABLE)) throw new Error(`Paquet introuvable : ${EXECUTABLE}. Lancez d'abord npm run desktop:build -- --dir.`);
  profile = mkdtempSync(join(tmpdir(), 'adam-desktop-'));
});

test.afterAll(() => {
  if (profile) rmSync(profile, { recursive: true, force: true });
});

async function launch(): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    args: HEADLESS,
    env: { ...process.env, ADAM_USER_DATA: profile, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr' },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(`exception : ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console : ${message.text()}`);
  });
  await page.waitForLoadState('domcontentloaded');
  // Comme le test du web : sans boucles d'animation, les boutons se laissent cliquer.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page, errors };
}

test('le paquet : écran titre hors ligne, page sans Node, partie retrouvée après « Quitter »', async () => {
  const first = await launch();
  const { page } = first;

  // L'origine stable du protocole maison, et la fenêtre en plein écran.
  expect(page.url()).toBe('app://adam/adam/');
  // Sans gestionnaire de fenêtres (Ozone headless), pas de plein écran possible : vérifié en fenêtre seulement.
  if (HEADLESS.length === 0) await expect.poll(() => first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(true);

  const title = page.locator('.title-screen');

  await expect(title).toBeVisible();
  // Le drapeau du preload, et rien de Node.
  expect(await page.evaluate(() => typeof (window as { require?: unknown }).require)).toBe('undefined');
  expect(await page.evaluate(() => typeof (window as { process?: unknown }).process)).toBe('undefined');
  expect(await page.evaluate(() => window.adamDesktop?.isDesktop)).toBe(true);
  expect(await page.evaluate(() => Object.keys(window.adamDesktop ?? {}).sort())).toEqual(['isDesktop', 'quit', 'version']);
  // Pas de service worker dans l'application : `app://` n'en accepte d'ailleurs aucun.
  expect(await page.evaluate(async () => navigator.serviceWorker?.getRegistrations?.().then((list) => list.length, () => 0) ?? 0)).toBe(0);
  // window.open est refusé (en http : un lien https s'ouvrirait dans le navigateur du système).
  expect(await page.evaluate(() => window.open('http://example.com/') === null)).toBe(true);
  // Aucune requête hors du paquet : le réseau est refusé.
  expect(await page.evaluate(async () => fetch('https://example.com/').then(() => 'ok', () => 'refusé'))).toBe('refusé');

  // « Quitter » est sur l'écran titre. On joue.
  await expect(title.locator('.title-quit')).toBeVisible();
  await title.locator('.button-primary').first().click();
  await expect(title).toBeHidden();
  await expect(page.locator('.hud-bag')).toBeVisible();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');

  // La pause, et « Quitter » : l'application se ferme.
  const pause = page.locator('.pause-screen');

  await page.locator('.hud-pause').click();
  await expect(pause).toBeVisible();
  const closed = first.app.waitForEvent('close');

  await pause.locator('.pause-quit').click();
  await closed;
  // Seul le refus voulu de la requête ci-dessus a parlé.
  expect(first.errors.filter((error) => !error.includes('https://example.com/'))).toEqual([]);

  // Relancée : la partie est là, « Continuer ».
  const second = await launch();

  await expect(second.page.locator('.title-screen .title-save')).toBeVisible();
  expect(await second.page.evaluate(() => localStorage.getItem('adam:save') !== null)).toBe(true);
  // La route de test répond aussi : /adam/test, un fichier copié par le build.
  await second.page.evaluate(() => window.location.assign('/adam/test'));
  await second.page.waitForURL('app://adam/adam/test');
  await expect(second.page.locator('.hud-bag')).toBeVisible();
  expect(second.errors).toEqual([]);

  // La navigation hors d'app:// est bloquée : la fenêtre reste sur le jeu. (Lu côté Electron : Playwright attendrait une navigation qui n'arrive jamais.)
  await second.app.evaluate(({ BrowserWindow }) => {
    void BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript("window.location.href = 'http://example.com/'");
  });
  await new Promise((done) => setTimeout(done, 1000));
  expect(await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getURL())).toBe('app://adam/adam/test');
  await second.app.close();
});
