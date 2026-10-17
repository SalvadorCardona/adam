import { describe, expect, it } from 'vitest';
import { AUTOSAVE_MS, AutosaveClock, SAVE_GAP_MS } from './autosaveClock.ts';

const FRAME_MS = 1000 / 60;

/** Les instants (ms) des écritures sur `ms` de jeu à 60 Hz ; `mark` dit à quelles frames un moment clé tombe. */
function writes(clock: AutosaveClock, ms: number, mark: (frame: number) => boolean): number[] {
  const at: number[] = [];

  for (let frame = 0; frame * FRAME_MS < ms; frame += 1) {
    if (mark(frame)) clock.mark();
    if (clock.due(FRAME_MS)) {
      clock.wrote();
      at.push((frame + 1) * FRAME_MS);
    }
  }
  return at;
}

describe('AutosaveClock', () => {
  it('sans moment clé, écrit toutes les cinq secondes', () => {
    const at = writes(new AutosaveClock(), 20_000, () => false);

    expect(at).toHaveLength(Math.floor(20_000 / AUTOSAVE_MS));
  });

  it('au plus une écriture par seconde, même quand chaque frame marque la partie (des taps « 1 / 10 / Tout » à la chaîne)', () => {
    const at = writes(new AutosaveClock(), 10_000, () => true);

    expect(at.length).toBeLessThanOrEqual(10_000 / SAVE_GAP_MS + 1);
    for (let i = 1; i < at.length; i += 1) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(SAVE_GAP_MS - 1e-9);
  });

  it('un moment clé s’écrit dans la seconde, pas cinq secondes plus tard', () => {
    const clock = new AutosaveClock();

    // La première écriture du lancement passe.
    writes(clock, 10, () => false);
    clock.mark();
    expect(clock.due(0)).toBe(true);
    clock.wrote();

    // Un second, juste après : il attend l'écart, puis s'écrit.
    clock.mark();
    expect(clock.due(SAVE_GAP_MS / 2)).toBe(false);
    expect(clock.due(SAVE_GAP_MS / 2)).toBe(true);
  });

  it('une écriture repart de zéro : le moment clé déjà écrit ne se réécrit pas', () => {
    const clock = new AutosaveClock();

    clock.mark();
    expect(clock.due(0)).toBe(true);
    clock.wrote();
    expect(clock.due(SAVE_GAP_MS)).toBe(false);
    expect(clock.due(AUTOSAVE_MS - SAVE_GAP_MS)).toBe(true);
  });
});
