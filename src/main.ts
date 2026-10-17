/**
 * Câblage, et rien d'autre.
 *
 * Aucune règle de jeu ici : ce fichier crée le monde, le renderer, les
 * entrées, l'UI, l'audio, et les branche ensemble. Si une décision de
 * gameplay finit dans ce fichier, elle est au mauvais endroit.
 *
 * Chaque morceau se branche dans son module de `app/` (`wireUi`,
 * `wireInput`, `wireFrame`…) et range ce qu'il écoute hors de lui dans un
 * même `Disposer` : `life.dispose()` débranche toute la partie.
 */

// Police arrondie embarquée dans le build, pas chargée d'un CDN : le jeu est
// une PWA, il doit avoir sa typo hors ligne. Fredoka plutôt qu'une autre :
// ses formes rondes répondent aux capsules de la direction artistique, et ses
// chiffres ne se confondent pas — un HUD de ressources, c'est d'abord des chiffres.
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';

import { TEST_SCENARIOS, type TestScenarioProto } from './data/testScenario.ts';
import { AudioEngine } from './audio/engine.ts';
import { GameRenderer } from './render/renderer.ts';
import { Disposer } from './ui/disposer.ts';
import { bootGame } from './app/boot.ts';
import { wireAlarm, wireAudio, wireHaptics, wireParticles, wireRumble, wireShake } from './app/feedback.ts';
import { wireFrame } from './app/frame.ts';
import { GameLoop, type PlayFlags } from './app/gameLoop.ts';
import { wireInput } from './app/input.ts';
import { wireOverlays } from './app/overlays.ts';
import { wireParty } from './app/party.ts';
import { wirePrefs } from './app/prefs.ts';
import { wireScreens } from './app/screens.ts';
import { mountUi, wireUi } from './app/ui.ts';

/** Umami expose cet objet globalement une fois `nx.js` chargé (voir index.html). */
declare global {
  interface Window {
    umami?: { track: (eventName: string) => void };
  }
}

async function main(): Promise<void> {
  const boot = await bootGame();

  if (!boot) return;

  const { world, mount, scenario, connection } = boot;
  // Tout ce que la partie branche hors d'elle-même : `life.dispose()` la débranche d'un coup.
  const life = new Disposer();
  /*
   * L'horloge : la simulation n'avance que si la partie a commencé et n'est
   * pas en pause. Le rendu, lui, tourne toujours — la carte se dessine
   * derrière l'écran titre et derrière la pause. L'écran de victoire, lui,
   * l'arrête jusqu'à « Continuer sans fin ».
   */
  const loop = new GameLoop();
  const flags: PlayFlags = { started: false, paused: false, celebrating: false };

  // Héberger sa partie et inviter un ami ; ou, par un lien d'invitation (`?join=`), rejoindre celle d'un ami.
  const party = await wireParty(life, boot, {
    notify: (message, tone) => ui.hud.notify(message, tone),
    voiceShown: (state) => {
      screens.pause.setVoice(state);
      ui.hud.inviteButton.hidden = state !== 'hidden';
    },
    // L'hôte, venu de la pause, n'a rien à faire, et l'ami n'attend pas « qu'il reprenne le jeu ».
    welcomed: () => {
      if (!document.hidden) screens.setPaused(false);
    },
  });

  const renderer = await GameRenderer.create(world, mount);
  const audio = new AudioEngine();

  // En dev seulement : le monde sous la main dans la console du navigateur,
  // pour provoquer une vague ou une naissance sans attendre trois minutes.
  if (import.meta.env.DEV) Object.assign(window, { adam: { world, audio, connection } });

  const ui = wireUi(life, boot, renderer, audio, loop, {
    canDress: () => flags.started && !flags.paused && !prefs.settings.open && !world.defeated,
  });
  const prefs = wirePrefs(life, boot, renderer, audio, ui.hud, loop, flags);

  wireHaptics(life, world);

  // Le service worker garde le jeu en cache : installable, ouvert sans réseau. Rien en développement.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }

  const screens = wireScreens(life, boot, ui.hud, audio, loop, flags, party, prefs.settings);
  const overlays = wireOverlays(life, world, ui, audio, loop, flags, screens, prefs.settings);

  mountUi(boot, ui, prefs, party, screens, overlays);

  const input = wireInput(life, world, renderer, ui, prefs, party, overlays, flags, screens.setPaused);

  // En dev : la manette aussi sous la main dans la console, pour poser son curseur sans stick.
  if (import.meta.env.DEV) Object.assign(window, { adam: { world, audio, pad: input.pad, connection, hud: ui.hud, renderer } });
  wireRumble(life, world, input.pad);
  wireAudio(life, world, audio, prefs.settings);
  wireParticles(life, world, renderer);
  wireAlarm(life, world, renderer, ui.hud);
  // Le joueur vise ou lit : un bâtiment armé, le menu, une fenêtre ou le sac ouverts.
  wireShake(
    life,
    world,
    renderer,
    () =>
      ui.placement.mode !== 'idle' ||
      ui.buildMenu.isOpen ||
      ui.panel.open ||
      ui.inventory.open ||
      ui.resources.open ||
      ui.trade.open ||
      ui.worldMap.open,
  );

  // Une partie de test peut s'ouvrir sur l'éditeur de personnage, pour les captures.
  if (scenario && (TEST_SCENARIOS[scenario] as TestScenarioProto).wardrobe?.open) ui.inventory.show('wardrobe');
  wireFrame(life, boot, renderer, audio, loop, flags, { ui, prefs, party, screens, overlays, input });
}

void main();
