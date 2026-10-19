import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('compte les visites là où le jeu est servi', () => {
    // cardona.digital renvoie en 301 vers hermez.dev : Umami n'y verrait plus personne.
    expect(html).toMatch(/data-domains="hermez\.dev"/);
  });
});
