import { describe, expect, it } from 'vitest';
import { ESCAPE_REPEAT_MS, escapeRepeats, shortcutOf } from './shortcuts.ts';

describe('shortcutOf', () => {
  it('P met en pause, Échap ferme ou met en pause, I ouvre le sac', () => {
    expect(shortcutOf({ code: 'KeyP', key: 'p' })).toBe('pause');
    expect(shortcutOf({ code: 'Escape', key: 'Escape' })).toBe('escape');
    expect(shortcutOf({ code: 'KeyI', key: 'i' })).toBe('inventory');
    expect(shortcutOf({ code: 'Backquote', key: '²' })).toBe('debug');
  });

  it('V coupe ou rouvre le micro du vocal', () => {
    expect(shortcutOf({ code: 'KeyV', key: 'v' })).toBe('mic');
    expect(shortcutOf({ code: 'KeyV', key: 'v', typing: true })).toBeNull();
    expect(shortcutOf({ code: 'KeyV', key: 'v', ctrlKey: true })).toBeNull();
  });

  it('M ouvre la carte, lu par caractère : le M d’un AZERTY comme celui d’un QWERTY', () => {
    expect(shortcutOf({ code: 'KeyM', key: 'm' })).toBe('map');
    expect(shortcutOf({ code: 'Semicolon', key: 'm' })).toBe('map');
    expect(shortcutOf({ code: 'KeyM', key: ',' })).toBeNull();
    expect(shortcutOf({ code: 'KeyM', key: 'M' })).toBe('map');
  });

  it('une touche tapée dans un champ n’est jamais un raccourci, sauf Échap qui rend la main au jeu', () => {
    for (const [code, key] of [['KeyP', 'p'], ['KeyI', 'i'], ['KeyM', 'm'], ['Backquote', '`']] as const) {
      expect(shortcutOf({ code, key, typing: true })).toBeNull();
    }
    expect(shortcutOf({ code: 'Escape', key: 'Escape', typing: true })).toBe('escape');
  });

  it('Ctrl, Alt ou Cmd : la touche est au navigateur', () => {
    expect(shortcutOf({ code: 'KeyP', key: 'p', ctrlKey: true })).toBeNull();
    expect(shortcutOf({ code: 'KeyM', key: 'm', metaKey: true })).toBeNull();
    expect(shortcutOf({ code: 'KeyI', key: 'i', altKey: true })).toBeNull();
  });

  it('une touche tenue ne bascule pas en boucle', () => {
    expect(shortcutOf({ code: 'KeyP', key: 'p', repeat: true })).toBeNull();
    expect(shortcutOf({ code: 'Escape', key: 'Escape', repeat: true })).toBeNull();
  });

  it('les touches de marche et les autres ne sont pas des raccourcis', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'Space', 'Enter']) {
      expect(shortcutOf({ code, key: '' })).toBeNull();
    }
  });

  it('un Échap qui suit de près une fermeture est une répétition : pas de pause', () => {
    expect(escapeRepeats(null, 1000)).toBe(false);
    expect(escapeRepeats(1000, 1000 + ESCAPE_REPEAT_MS - 1)).toBe(true);
    expect(escapeRepeats(1000, 1000 + ESCAPE_REPEAT_MS)).toBe(false);
    expect(escapeRepeats(1000, 5000)).toBe(false);
  });
});
