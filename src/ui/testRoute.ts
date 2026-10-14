/**
 * La route des parties de test : `…/adam/test`.
 *
 * `/test` ouvre le scénario par défaut, `/test/<id>` un autre
 * (`data/testScenario.ts`). GitHub Pages ne sert pas de page de repli pour
 * un chemin inconnu : le build copie donc `index.html` sous chaque route
 * (`vite.config.ts`, qui lit `testRoutes()`), et le jeu lit son chemin pour
 * savoir quelle partie ouvrir. Les fonctions pures d'abord (testées en
 * Node), le DOM ensuite.
 */

import { DEFAULT_TEST_SCENARIO, TEST_SCENARIOS, type TestScenarioId } from '../data/testScenario.ts';
import { onLocale, t } from '../i18n/locale.ts';

/** Le segment de chemin qui mène aux parties de test. */
const TEST_SEGMENT = 'test';

/**
 * Le scénario que demande le chemin de la page, ou `null` pour une partie
 * normale. `base` est la base de Vite (`/adam/`). Un scénario
 * inconnu ouvre une partie normale plutôt qu'une page blanche.
 */
export function testScenarioOf(pathname: string, base: string): TestScenarioId | null {
  if (!pathname.startsWith(base)) return null;

  const segments = pathname
    .slice(base.length)
    .split('/')
    .filter((segment) => segment !== '' && segment !== 'index.html');

  if (segments[0] !== TEST_SEGMENT || segments.length > 2) return null;

  const id = segments[1] ?? DEFAULT_TEST_SCENARIO;

  return Object.hasOwn(TEST_SCENARIOS, id) ? (id as TestScenarioId) : null;
}

/** Les chemins, relatifs à la base, où le build pose une copie d'`index.html`. */
export function testRoutes(): string[] {
  return Object.keys(TEST_SCENARIOS).map((id) =>
    id === DEFAULT_TEST_SCENARIO ? TEST_SEGMENT : `${TEST_SEGMENT}/${id}`,
  );
}

/** Le petit bandeau qui dit qu'on n'est pas dans sa vraie partie. */
export function testBanner(id: TestScenarioId): HTMLElement {
  const banner = document.createElement('div');

  banner.className = 'test-banner';
  onLocale(() => {
    banner.textContent = t().screens.test.banner(t().testScenarios[id]);
  });
  banner.setAttribute('role', 'note');
  return banner;
}
