/**
 * L'interface du jeu : le HUD, les commandes d'Adam (joystick, clavier,
 * placement), le tiroir de construction, les fenêtres — un bâtiment, le sac,
 * les ressources, les ères, le troc — l'inspection au tap, la carte du monde
 * et le zoom. L'ouverture de l'une ferme les autres.
 */
import type { AudioEngine } from '../audio/engine.ts';
import { MENU_BUILDING_IDS } from '../data/buildings.ts';
import { STORY_SEXES } from '../data/inhabitants.ts';
import { PIECES } from '../data/wardrobe.ts';
import { t } from '../i18n/locale.ts';
import { Inspect } from '../input/inspect.ts';
import { Joystick } from '../input/joystick.ts';
import { Keyboard } from '../input/keyboard.ts';
import { Placement } from '../input/placement.ts';
import { VOICES } from '../audio/synth.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { LocalZoom } from '../storage/localZoom.ts';
import { BagPanel } from '../ui/bagPanel.ts';
import { BuildMenu } from '../ui/buildMenu.ts';
import { BuildingPanel } from '../ui/buildingPanel.ts';
import { CaravanPanel } from '../ui/caravanPanel.ts';
import type { Disposer } from '../ui/disposer.ts';
import { EraPanel } from '../ui/eraPanel.ts';
import { Hud } from '../ui/hud.ts';
import { JoystickView } from '../ui/joystick.ts';
import { FogSight } from '../ui/mapSight.ts';
import { ResourcePanel } from '../ui/resourcePanel.ts';
import { testBanner } from '../ui/testRoute.ts';
import { WorldMap } from '../ui/worldMap.ts';
import { ZoomControls } from '../ui/zoomControls.ts';
import type { Boot } from './boot.ts';
import type { GameLoop } from './gameLoop.ts';
import type { Overlays } from './overlays.ts';
import type { Party } from './party.ts';
import type { Prefs } from './prefs.ts';
import type { Screens } from './screens.ts';

/** Ce que l'interface attend du reste du câblage, monté après elle. */
export interface UiHooks {
  /** La garde-robe peut s'ouvrir : partie lancée, ni pause, ni réglages, ni défaite. */
  canDress(): boolean;
}

export type Ui = ReturnType<typeof wireUi>;

export function wireUi(life: Disposer, boot: Boot, renderer: GameRenderer, audio: AudioEngine, loop: GameLoop, hooks: UiHooks) {
  const { world, scenario, saves } = boot;

  const joystick = new Joystick();
  const stick = new JoystickView(joystick);
  const keyboard = new Keyboard();
  const placement = new Placement(
    world,
    (x, y) => renderer.screenToWorld(x, y),
    () => buildMenu.refresh(),
    () => {
      audio.play('deny');
      renderer.refuseGhost();
    },
  );

  const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug');

  // Débogage : `?nofog` (en dev) lève le brouillard de guerre — toute la carte se voit et se bâtit.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('nofog')) {
    world.push({ type: 'setFog', enabled: false });
  }
  const hud = new Hud(world, debug, () => saves.stats);
  const buildMenu = new BuildMenu(world, placement, MENU_BUILDING_IDS, () => {
    panel.close();
    inventory.close();
    resources.close();
    trade.close();
    audio.play('open');
  });
  // La fenêtre d'un bâtiment, le sac, les ressources, le troc et le tiroir : l'un ferme les autres.
  const panel = new BuildingPanel(world, () => {
    inventory.close();
    resources.close();
    trade.close();
    audio.play('open');
  });
  panel.setAdvisedResearch(() => hud.adviceResearch());
  /*
   * Le sac : une fenêtre à deux onglets, l'inventaire et l'habillement
   * d'Adam. Sur l'habillement, l'horloge s'arrête comme pour les réglages ;
   * « Valider » pousse `dressAdam`.
   */
  const inventory = new BagPanel(world, hud.bag, {
    onToggle: (open) => {
      loop.reset();
      if (!open) return;
      buildMenu.close();
      panel.close();
      resources.close();
      trade.close();
      audio.play('open');
    },
    onAlert: (alert) => renderer.pointTo(alert.target, alert.item),
  });
  const resources = new ResourcePanel(
    world,
    () => {
      panel.close();
      inventory.close();
      trade.close();
      audio.play('open');
    },
    hud.resourcesButton,
  );
  // Le panneau des ères s'ouvre depuis la fenêtre de la mairie, qu'il remplace.
  const eras = new EraPanel(world);

  panel.setOnEras(() => {
    panel.close();
    eras.show();
    audio.play('open');
  });
  const trade = new CaravanPanel(world, () => {
    panel.close();
    inventory.close();
    resources.close();
    audio.play('open');
  });

  // Adam arrive au contact de la caravane garée : la fenêtre Troc s'ouvre.
  life.on(world.events, 'caravanReached', ({ id }) => trade.show(id));
  const inspect = new Inspect(
    world,
    (x, y) => renderer.screenToWorld(x, y),
    // Pendant que la carte glisse d'elle-même, un tap viserait un point qui bouge : il n'ouvre rien.
    () => placement.mode === 'idle' && !renderer.cameraDrifting,
    // Un bâtiment, un habitant ou un ennemi : la même fenêtre. Un habitant répond : « Hé ho ! », « Hé ! ».
    (selection) => {
      if (selection.kind === 'building') {
        panel.show(selection.id);
        return;
      }
      panel.showCreature(selection.id);

      const mobile = world.mobiles.get(selection.id);

      if (mobile && 'sex' in mobile) audio.speak(VOICES[mobile.sex]);
    },
    () => {
      hud.talkToEve();
      audio.speak(VOICES[STORY_SEXES.eve]);
    },
    () => panel.open,
    () => panel.close(),
    (id) => panel.showBase(id),
  );

  // Le zoom de la carte : un niveau choisi par le joueur, mémorisé sur l'appareil.
  const zoomPrefs = scenario ? new LocalZoom(null) : LocalZoom.browser();
  const savedZoom = zoomPrefs.load();

  if (savedZoom !== null) renderer.restoreZoom(savedZoom);

  // La carte du monde montre ce que le brouillard de guerre a découvert : explorée, ou visible en direct.
  const seen = new FogSight(world);

  const worldMap = new WorldMap(world, seen, {
    onOpen: () => {
      buildMenu.close();
      panel.close();
      inventory.close();
      resources.close();
      trade.close();
      audio.play('open');
    },
    goTo: (x, y) => renderer.lookAt(x, y),
    cameraView: () => renderer.cameraView,
  });

  // Carte du monde ouverte, les boutons du bord zooment la carte, et celui du milieu la ramène sur Adam.
  const zoom = new ZoomControls({
    zoomIn: () => (worldMap.open ? worldMap.stepZoom(1) : renderer.stepZoom(1)),
    zoomOut: () => (worldMap.open ? worldMap.stepZoom(-1) : renderer.stepZoom(-1)),
    recenter: () => (worldMap.open ? worldMap.recenter() : renderer.resetZoom()),
  });

  // Une pièce trouvée : un toast, et son bouton « Essayer » ouvre l'habillement sur son emplacement.
  life.on(world.events, 'pieceFound', ({ piece }) => {
    hud.notify(t().wardrobe.found(t().pieces[piece]), 'good', {
      label: t().wardrobe.tryOn,
      run: () => {
        if (hooks.canDress()) inventory.show('wardrobe', PIECES[piece].slot);
      },
    });
  });
  life.on(world.events, 'lookRejected', () => hud.notify(t().wardrobe.rejected, 'bad'));
  life.on(world.events, 'piecesSpared', ({ prestige }) => hud.notify(t().wardrobe.spare(prestige), 'good'));

  hud.bag.addEventListener('click', () => inventory.toggle());
  hud.resourcesButton.addEventListener('click', () => resources.toggle());
  hud.setProjector((x, y) => renderer.worldToScreen(x, y));
  buildMenu.setProjector((x, y) => renderer.worldToScreen(x, y));
  hud.setFocus((x, y) => renderer.peek(x, y));
  // Ce qui écoute hors de soi part avec la partie.
  life.add(() => keyboard.destroy());
  life.add(() => panel.dispose());
  life.add(() => hud.dispose());

  // Seul un niveau choisi se mémorise : le cadrage de départ suit l'écran.
  let shownZoom = renderer.zoomLevel;
  const rememberZoom = (): void => {
    if (renderer.zoomChosen && renderer.zoomLevel !== shownZoom) {
      shownZoom = renderer.zoomLevel;
      zoomPrefs.save(shownZoom);
    }
  };

  return { hud, joystick, stick, keyboard, placement, buildMenu, panel, inventory, resources, eras, trade, inspect, worldMap, zoom, rememberZoom };
}

/**
 * Le HUD monté dans la page. L'ordre d'insertion est l'ordre d'empilement :
 * ce qui vient après passe par-dessus — l'écran titre sur les fenêtres, les
 * réglages et le compte sur tout.
 */
export function mountUi(boot: Boot, ui: Ui, prefs: Prefs, party: Party, screens: Screens, overlays: Overlays): void {
  const { mount, connection, scenario, guest } = boot;
  const { hud, stick, buildMenu, panel, inventory, resources, eras, trade, worldMap, zoom } = ui;
  const { settings, notifyPrompt, padHelp } = prefs;
  const { accountPanel, voicePanel, invitePanel, joinPanel } = party;

  // La rangée du haut à droite : la carte du monde, le zoom, puis Pause et Réglages (en dernier).
  zoom.root.prepend(worldMap.button);
  // Inviter un ami, sans passer par la pause : seulement si le jeu a un serveur, et pas chez l'ami déjà invité.
  if (connection.enabled && !guest) zoom.root.prepend(hud.inviteButton);
  // Le vocal partage cette place : une session à deux seulement (l'ami arrivé, ou chez l'ami lui-même).
  if (connection.enabled) zoom.root.prepend(voicePanel.button);

  zoom.root.append(hud.pauseButton, hud.settingsButton);
  hud.mountControls(zoom.root);
  // Les boutons du joueur, en bas à droite : la Volée (la nuit), le sac (inventaire et habillement), « Bâtir ».
  hud.actions.append(hud.skillButton, hud.bag, buildMenu.buildButton);
  hud.root.append(worldMap.root, stick.root, buildMenu.root, panel.root, resources.root, trade.root);
  stick.avoid(buildMenu.bottomParts, hud.root);
  hud.root.append(notifyPrompt.root, screens.tabPanel.root, overlays.recap.root, overlays.boons.root, overlays.talents.root, screens.pause.root);
  // En tête du HUD : tout ce qui vient après (menu, fenêtres, voiles) passe par-dessus.
  if (scenario) hud.root.prepend(testBanner(scenario));
  // L'ami arrive dans une partie qui tourne : pas d'écran titre. Son écran de connexion passe dans le HUD.
  else if (guest) hud.root.append(guest.screen.root);
  else hud.root.append(screens.title.root);
  hud.root.append(inventory.root);
  hud.root.append(eras.root, eras.screen);
  // Par-dessus tout, écran titre compris : la langue se choisit avant même de jouer.
  settings.addAccountButton(accountPanel.button('button-secondary settings-toggle'));
  hud.root.append(voicePanel.strip, voicePanel.root, settings.root, invitePanel.root, ...(joinPanel ? [joinPanel.root] : []), accountPanel.root, padHelp.root);
  mount.append(hud.root);
}
