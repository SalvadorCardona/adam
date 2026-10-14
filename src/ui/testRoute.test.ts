import { describe, expect, it } from 'vitest';
import { testRoutes, testScenarioOf } from './testRoute.ts';

const BASE = '/adam/';

describe('testScenarioOf', () => {
  it('ouvre le scénario par défaut sur /test, avec ou sans barre finale', () => {
    expect(testScenarioOf('/adam/test', BASE)).toBe('base');
    expect(testScenarioOf('/adam/test/', BASE)).toBe('base');
    expect(testScenarioOf('/adam/test/index.html', BASE)).toBe('base');
  });

  it('ouvre un scénario nommé sur /test/<id>', () => {
    expect(testScenarioOf('/adam/test/base', BASE)).toBe('base');
  });

  it('laisse la partie normale partout ailleurs', () => {
    expect(testScenarioOf('/adam/', BASE)).toBeNull();
    expect(testScenarioOf('/adam/index.html', BASE)).toBeNull();
    expect(testScenarioOf('/adam/test/inconnu', BASE)).toBeNull();
    expect(testScenarioOf('/adam/testeur', BASE)).toBeNull();
    expect(testScenarioOf('/test', BASE)).toBeNull();
  });
});

describe('testRoutes', () => {
  it('pose une page sous chaque route, et chacune se relit', () => {
    const routes = testRoutes();

    expect(routes).toContain('test');
    for (const route of routes) expect(testScenarioOf(`${BASE}${route}/`, BASE)).not.toBeNull();
  });
});
