/**
 * La boucle de rendu : à chaque image, la manette lue, les pas de simulation
 * dus joués (`GameLoop`), la carte dessinée, puis le HUD et les fenêtres à
 * leur cadence (`UiClock`).
 */
import type { Ticker } from 'pixi.js';
import type { AudioEngine } from '../audio/engine.ts';
import { hallDanger } from '../render/hallDanger.ts';
import { reducedMotion } from '../render/motion.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { TimeDilation } from '../render/timeDilation.ts';
import { TICKS_PER_SECOND } from '../sim/world.ts';
import type { Disposer } from '../ui/disposer.ts';
import { UiClock } from '../ui/uiClock.ts';
import type { Boot } from './boot.ts';
import type { GameLoop, PlayFlags } from './gameLoop.ts';
import type { Input } from './input.ts';
import type { Overlays } from './overlays.ts';
import type { Party } from './party.ts';
import type { Prefs } from './prefs.ts';
import type { Screens } from './screens.ts';
import type { Ui } from './ui.ts';

/** Hauteur du bouton « Bâtir » et de sa marge, en pixels écran : le minimum réservé en bas. */
const HUD_BOTTOM_INSET = 84;

export function wireFrame(
  life: Disposer,
  boot: Boot,
  renderer: GameRenderer,
  audio: AudioEngine,
  loop: GameLoop,
  flags: PlayFlags,
  parts: { ui: Ui; prefs: Prefs; party: Party; screens: Screens; overlays: Overlays; input: Input },
): void {
  const { world, guest } = boot;
  const { hud, stick, placement, buildMenu, panel, eras, inventory, resources, trade, worldMap, zoom, rememberZoom } = parts.ui;
  const { settings, notifyPrompt, perf } = parts.prefs;
  const { tabPanel, autosave, achievements } = parts.screens;
  const { recap, boons, talents } = parts.overlays;
  const { pad, padHints, pushAxisIfChanged } = parts.input;

  /** Un pas de simulation : l'axe de marche frais, le tick, sa mesure, et les pas qui partent à l'ami. */
  const step = (): void => {
    pushAxisIfChanged();
    const tickStart = perf.on ? performance.now() : 0;

    world.tick();
    if (perf.on) perf.sampler.tick(performance.now() - tickStart, world.wakesLastTick());
    parts.party.afterTick();
  };

  // Le HUD et les fenêtres à `UI_HZ` ; un geste les fait suivre chaque frame, le temps que sa commande se voie.
  const uiClock = new UiClock();

  for (const type of ['pointerdown', 'pointerup', 'keydown'] as const) {
    life.listen(window, type, () => uiClock.poke(), { capture: true, passive: true });
  }

  // Ce que le bas de l'écran occupe (tiroir, barre de placement, fenêtres,
  // joystick, zoom) : relu seulement quand l'un d'eux change de taille ou finit
  // d'entrer — une fenêtre glisse (`panel-in`) —, jamais à chaque frame.
  let insetsDirty = true;
  const markInsets = (): void => {
    insetsDirty = true;
  };
  const insetWatch = new ResizeObserver(markInsets);

  for (const node of [...buildMenu.bottomParts, panel.root, resources.root, trade.root, stick.root, zoom.root]) {
    insetWatch.observe(node);
    node.addEventListener('animationend', markInsets);
  }
  life.add(() => insetWatch.disconnect());
  life.listen(window, 'resize', markInsets);
  // Arrêt sur image à la mise à mort, ralenti sur le dernier mutant : le temps de la vue, pas de la simulation.
  const dilation = new TimeDilation(reducedMotion);

  for (const kill of ['mutantDied', 'mutantStunned'] as const) life.on(world.events, kill, () => dilation.hit());
  life.on(world.events, 'waveCleared', () => dilation.slow());

  const frame = (ticker: Ticker): void => {
    // La mise en page se lit en tête de frame, avant toute écriture dans le DOM :
    // celle de la dernière image peinte tient encore, rien n'est recalculé de force.
    if (hud.measureLayout() || insetsDirty) {
      insetsDirty = false;
      renderer.setHudInsets(hud.topInset(), bottomInset(), [
        ...hud.obstacles(),
        stick.root.getBoundingClientRect(),
        zoom.root.getBoundingClientRect(),
      ]);
    }

    const running = flags.started && !flags.paused && !settings.open && !notifyPrompt.open && !tabPanel.open && !inventory.dressing && !recap.open && !boons.open && !talents.open;

    // La manette se lit une fois par frame, avant les ticks : l'axe de marche est frais.
    pad.update(ticker.deltaMS, performance.now(), !worldMap.open);
    if (pad.padMode) padHints.update();

    if (guest) {
      // L'ami ne fait pas autorité : sa partie avance au rythme des pas de l'hôte, pause et écrans compris.
      pushAxisIfChanged();
      guest.session.sync?.advance(ticker.deltaMS);
      loop.follow(guest.session.sync?.alpha ?? 0);
    } else if (running && !flags.celebrating) {
      // Une nuit calme que le joueur fait passer : plus de ticks par image, la simulation n'en sait rien.
      loop.advance(ticker.deltaMS, hud.hastening && world.calmNight(), dilation.scale(ticker.deltaMS));
      audio.setDanger(hallDanger(world));
    }
    if (!guest && !flags.celebrating) loop.run(step);
    if (running) autosave.update(ticker.deltaMS);
    // Une fois par seconde de jeu : les succès dont la condition vient d'être remplie.
    if (running && world.tickCount % TICKS_PER_SECOND === 0 && world.tickCount !== achievements.checkedAt) achievements.update();

    // La carte du monde couvre l'écran : la scène du jeu ne se dessine plus, la carte si.
    renderer.setHidden(worldMap.open);
    if (hud.root.dataset['map'] !== String(worldMap.open)) hud.root.dataset['map'] = String(worldMap.open);
    worldMap.update(ticker.deltaMS);

    renderer.draw(loop.alpha, placement.armedBuilding(), placement.ghost);
    if (perf.on) {
      const reading = perf.sampler.frame(ticker.deltaMS);

      if (reading) hud.showPerf(reading);
    }
    // Ce qui suit la caméra, à chaque frame ; le reste du HUD et les fenêtres, à la cadence de l'UI.
    hud.frame();
    if (uiClock.due(ticker.deltaMS)) {
      hud.update(ticker.FPS, renderer.bakedChunks, renderer.atlasStats, renderer.waterStats, renderer.weatherParticles);
      buildMenu.refresh();
      panel.update();
      eras.update();
      inventory.update();
      resources.update();
      trade.update();
      rememberZoom();
    }
    zoom.update(worldMap.open ? worldMap.zoomLimits : renderer.zoomLimits);
    renderer.setObjective(hud.pointedItem());
    renderer.setSelected(panel.selection);
    // Un menu, une fenêtre ou la pause par-dessus : le joystick s'efface et
    // lâche son doigt ; il revient à la fermeture.
    stick.setEnabled(
      running && !world.defeated && !buildMenu.isOpen && !panel.open && !eras.open && !inventory.open && !resources.open && !trade.open && !worldMap.open,
    );
    if (hud.root.dataset['stick'] !== String(stick.shown)) hud.root.dataset['stick'] = String(stick.shown);
  };

  renderer.app.ticker.add(frame);
  life.add(() => renderer.app.ticker.remove(frame));

  /**
   * Ce que le bas de l'écran occupe : le bouton « Bâtir », ou plus quand
   * le tiroir, la barre de placement ou la fenêtre d'un bâtiment sont ouverts.
   */
  function bottomInset(): number {
    const height = renderer.app.screen.height;
    let top = height - HUD_BOTTOM_INSET;

    for (const node of [...buildMenu.bottomParts, panel.root, resources.root, trade.root]) {
      const rect = node.getBoundingClientRect();

      if (rect.height > 0) top = Math.min(top, rect.top);
    }
    return height - top;
  }
}
