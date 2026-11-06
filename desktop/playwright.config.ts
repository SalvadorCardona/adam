import { defineConfig } from '@playwright/test';

/*
 * L'application de bureau, empaquetée, lancée par Playwright (`_electron`).
 * À lancer après `npm run desktop:build` (ou `-- --dir`) :
 * `npm run test:desktop`. Le paquet testé est `release/linux-unpacked/adam`,
 * le dossier même qu'emballent l'AppImage et le tar.gz.
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  timeout: 120_000,
  use: { trace: 'retain-on-failure' },
});
