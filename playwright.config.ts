import { defineConfig } from '@playwright/test';

/*
 * Le test de fumée : le vrai jeu, construit, dans Chromium headless, à deux
 * tailles d'écran (un téléphone en portrait, un bureau). Ce que les tests de
 * simulation ne voient jamais : la page réelle — HUD hors écran, `hidden`
 * contredit par le CSS, erreur console au lancement.
 *
 * `npm run test:e2e` construit le jeu puis le sert (`vite preview`) ; en local
 * un serveur déjà lancé sur ce port est réutilisé.
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}/adam/`,
    // Les textes sont testés en français, la langue du jeu par défaut ici.
    locale: 'fr-FR',
    // Le jeu coupe ses boucles d'animation sous reduced-motion : les boutons se laissent cliquer, la capture est stable.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Pixi demande WebGL : sans GPU, le rendu logiciel de Chromium s'en charge.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'mobile 390×844', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'bureau 1440×900', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/adam/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
