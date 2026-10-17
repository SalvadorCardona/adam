import { defineConfig } from 'vitest/config';

/*
 * Les tests tournent en Node, sans canvas : c'est exactement le bénéfice de
 * la règle d'isolation. `world.tick()` s'exécute headless, donc vite, donc en
 * CI sans navigateur. Les tests du DOM (`ui/*.dom.test.ts`) ont leur
 * environnement propre, happy-dom : un faux DOM, pas un navigateur.
 *
 * Si un test de sim/ échoue avec « document is not defined », ce n'est pas la
 * config qu'il faut changer : c'est qu'un import interdit a franchi la
 * frontière de sim/.
 *
 * Un test de render/ ne teste que de la logique pure (la profondeur de
 * l'eau, par exemple) : il n'importe de Pixi que des types.
 *
 * Deux projets :
 *  - `fast` (`npm test`, avant chaque commit) : tout sauf les `*.slow.test.ts`,
 *    les balayages de graines réduits à 200 (`SWEEP_SEEDS`, `sim/sweep.ts`) ;
 *  - `slow` (`npm run test:slow`, en CI et avant une release) : la suite
 *    entière, balayages à 1 000 graines, courbes de défense et longues parties.
 *
 * Les tests de bout en bout dans un vrai navigateur sont à part : Playwright
 * (`playwright.config.ts`, `npm run test:e2e`).
 */
const include = [
  'src/{app,sim,core,data,art,input,ui,storage,render,audio,i18n,net}/**/*.test.ts',
  // Le back-end se teste avec le reste : même Vitest, même Node.
  'server/src/**/*.test.ts',
];

export default defineConfig({
  test: {
    // Plusieurs tests de sim/ déroulent des minutes de partie tick par tick
    // (porteurs, carrière, forge…) : 2 à 5 s sur une machine calme, davantage
    // sur un runner de CI ou une machine chargée. Les 5 s par défaut les
    // faisaient échouer au hasard ; 30 s laisse la marge sans masquer une
    // vraie boucle infinie.
    testTimeout: 30_000,
    // L'anglais est un morceau chargé à la demande dans le jeu ; les tests le veulent sous la main.
    setupFiles: ['src/i18n/testSetup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'fast',
          environment: 'node',
          include,
          exclude: ['**/node_modules/**', '**/*.slow.test.ts'],
          env: { ADAM_SWEEP: '200' },
        },
      },
      {
        extends: true,
        test: {
          name: 'slow',
          environment: 'node',
          include,
          // Les parties longues passent largement les 30 s des tests rapides.
          testTimeout: 180_000,
          env: { ADAM_SWEEP: '1000' },
        },
      },
    ],
  },
});
