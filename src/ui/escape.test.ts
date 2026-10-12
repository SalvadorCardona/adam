import { describe, expect, it } from 'vitest';
import { escapeAction, type EscapeState } from './escape.ts';

const NOTHING: EscapeState = { settingsOpen: false, bagOpen: false, paused: false, mapOpen: false, menuOpen: false, panelOpen: false, resourcesOpen: false };

describe('escapeAction', () => {
  it('rien d’ouvert : pause', () => {
    expect(escapeAction(NOTHING)).toBe('pause');
  });

  it('en pause : la pause se lève, même avec une fenêtre derrière', () => {
    expect(escapeAction({ ...NOTHING, paused: true })).toBe('resume');
    expect(escapeAction({ ...NOTHING, paused: true, panelOpen: true })).toBe('resume');
  });

  it('les réglages se ferment d’abord, même en pause', () => {
    expect(escapeAction({ ...NOTHING, settingsOpen: true })).toBe('closeSettings');
    expect(escapeAction({ ...NOTHING, settingsOpen: true, paused: true, panelOpen: true })).toBe('closeSettings');
  });

  it('la fenêtre du sac se ferme, après les réglages', () => {
    expect(escapeAction({ ...NOTHING, bagOpen: true, panelOpen: true })).toBe('closeBag');
    expect(escapeAction({ ...NOTHING, bagOpen: true, settingsOpen: true })).toBe('closeSettings');
  });

  it('la carte du monde se ferme avant le reste, sans pause', () => {
    expect(escapeAction({ ...NOTHING, mapOpen: true, menuOpen: true, panelOpen: true })).toBe('closeMap');
    expect(escapeAction({ ...NOTHING, mapOpen: true, paused: true })).toBe('resume');
  });

  it('le menu de construction ouvert se ferme', () => {
    expect(escapeAction({ ...NOTHING, menuOpen: true })).toBe('closeMenu');
  });

  it('la fenêtre d’un bâtiment (ou du labo) se ferme, sans pause', () => {
    expect(escapeAction({ ...NOTHING, panelOpen: true })).toBe('closePanel');
  });

  it('le panneau des ressources se ferme, sans pause', () => {
    expect(escapeAction({ ...NOTHING, resourcesOpen: true })).toBe('closeResources');
  });
});
