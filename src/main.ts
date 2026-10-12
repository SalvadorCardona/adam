/**
 * Câblage, et rien d'autre.
 *
 * Aucune règle de jeu ici : ce fichier crée le monde, le renderer, les
 * entrées, l'UI, l'audio, et les branche ensemble. Si une décision de
 * gameplay finit dans ce fichier, elle est au mauvais endroit.
 */

// Police arrondie embarquée dans le build, pas chargée d'un CDN : le jeu est
// une PWA, il doit avoir sa typo hors ligne. Fredoka plutôt qu'une autre :
// ses formes rondes répondent aux capsules de la direction artistique, et ses
// chiffres ne se confondent pas — un HUD de ressources, c'est d'abord des chiffres.
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';
import { rewardOf } from './data/achievements.ts';
import { AudioEngine } from './audio/engine.ts';
import { prefetchMusic } from './audio/music.ts';
import { VOICES } from './audio/synth.ts';
import { assertPrototypes } from './data/validate.ts';
import { GROUND, PARTICLES, type ParticleStyle } from './data/artDirection.ts';
import { MENU_BUILDING_IDS } from './data/buildings.ts';
import { CHIEF, type WildlifeId } from './data/enemies.ts';
import { STORY_SEXES } from './data/inhabitants.ts';
import type { ItemId } from './data/items.ts';
import { OBJECTIVES, type ObjectiveProto } from './data/objectives.ts';
import { TEST_SCENARIOS, type TestScenarioProto } from './data/testScenario.ts';
import { PIECES } from './data/wardrobe.ts';
import { IndicatorTap } from './input/indicatorTap.ts';
import { seedsFor, type PerkId } from './data/perks.ts';
import { Inspect } from './input/inspect.ts';
import { installCursors } from './ui/cursors.ts';
import { Joystick } from './input/joystick.ts';
import { Keyboard, isTyping, type KeyboardState } from './input/keyboard.ts';
import { shortcutOf } from './input/shortcuts.ts';
import { Placement } from './input/placement.ts';
import { PointerRouter } from './input/pointer.ts';
import { Pinch, bindWheelZoom } from './input/zoom.ts';
import { GameRenderer } from './render/renderer.ts';
import { AchievementTracker } from './sim/achievements.ts';
import { earnedSkins, type Collection } from './sim/collection.ts';
import { activePerks, harvestSeeds, plant, type Garden } from './sim/garden.ts';
import { stageScenario } from './sim/testScenario.ts';
import type { Entity } from './sim/types.ts';
import { STEP_MS, TICKS_PER_SECOND, World } from './sim/world.ts';
import { LocalCollection } from './storage/localCollection.ts';
import { LocalGarden } from './storage/localGarden.ts';
import { LocalRecord } from './storage/localRecord.ts';
import { LocalSave, type LoadResult } from './storage/localSave.ts';
import { LocalLocale } from './storage/localLocale.ts';
import { LocalSigns } from './storage/localSigns.ts';
import { LocalZoom } from './storage/localZoom.ts';
import { TILE_SIZE } from './core/grid.ts';
import { detectLocale, onLocale, setLocale, t } from './i18n/locale.ts';
import { BuildingPanel } from './ui/buildingPanel.ts';
import { CaravanPanel } from './ui/caravanPanel.ts';
import { InventoryPanel } from './ui/inventoryPanel.ts';
import { ResourcePanel } from './ui/resourcePanel.ts';
import { escapeAction } from './ui/escape.ts';
import { JoystickView } from './ui/joystick.ts';
import { BuildMenu } from './ui/buildMenu.ts';
import { rewardText } from './ui/collectionPanel.ts';
import { Hud } from './ui/hud.ts';
import { PauseScreen, TitleScreen } from './ui/screens.ts';
import { SettingsPanel } from './ui/settingsPanel.ts';
import { WardrobePanel } from './ui/wardrobePanel.ts';
import { formatSeed, parseSeed } from './ui/seed.ts';
import { testBanner, testScenarioOf } from './ui/testRoute.ts';
import { ZoomControls } from './ui/zoomControls.ts';
import { SeenArea } from './ui/mapSight.ts';
import { WorldMap } from './ui/worldMap.ts';

/**
 * Clamp anti-spirale de la mort.
 *
 * Critique sur mobile : revenir sur l'onglet après deux minutes en arrière-plan
 * demanderait 2 400 ticks en une frame, ce qui gèle l'application — et comme le
 * gel rallonge le retard, elle ne s'en remet jamais. Au-delà de 250 ms, on
 * saute le temps perdu au lieu de le rattraper.
 */
const MAX_FRAME_MS = 250;

/** Hauteur du bouton « Bâtir » et de sa marge, en pixels écran : le minimum réservé en bas. */
const HUD_BOTTOM_INSET = 84;

/** Seuil sous lequel un mouvement d'axe ne vaut pas une commande. */
const AXIS_EPSILON = 0.01;

/** L'axe d'un clavier au repos : ce que lit le déplacement quand le menu de construction a le clavier. */
const STILL: KeyboardState = { active: false, axisX: 0, axisY: 0 };

/**
 * Ce que la carte du monde montre déjà au chargement, en tuiles autour
 * d'Adam et de chaque bâtiment : la colonie se voit avant d'avoir bougé.
 */
const KNOWN_AROUND_PLAYER = 20;
const KNOWN_AROUND_BUILDING = 8;

/** Distance, en tuiles, à laquelle Adam entend la hache d'un bûcheron. */
const CHOP_HEARING_TILES = 9;

/** Ce qui saute d'une ressource entamée, ou d'un butin ramassé : la famille de l'objet. */
const ITEM_PARTICLES: Record<ItemId, ParticleStyle> = {
  wood: PARTICLES.wood,
  stone: PARTICLES.stone,
  ironOre: PARTICLES.iron,
  coal: PARTICLES.coal,
  food: PARTICLES.food,
  meat: PARTICLES.claw,
  water: PARTICLES.water,
  ironPlate: PARTICLES.iron,
  mutantGoo: PARTICLES.mutant,
  wolfFang: PARTICLES.bone,
  crabClaw: PARTICLES.claw,
  radCore: PARTICLES.mutant,
};

/**
 * Sauvegarde automatique toutes les cinq secondes de jeu. Sérialiser le monde
 * coûte quelques millisecondes : jamais à chaque frame, et jamais pendant un
 * tick — seulement entre deux.
 */
const AUTOSAVE_MS = 5000;

/** Ce que l'écran titre dit, discrètement, d'une sauvegarde qu'il n'a pas pu reprendre. */
const LOAD_NOTICES: Partial<Record<LoadResult['status'], () => string>> = {
  version: () => t().screens.title.oldSave,
  corrupt: () => t().screens.title.corruptSave,
};

/** Le compte à rebours d'une vague commence à tant de secondes : c'est là qu'elle s'annonce. */
const WAVE_ANNOUNCE_SECONDS = 3;

/**
 * Le recul de la caméra à l'annonce d'une vague : léger, et tenu le temps de
 * l'annonce et de la sortie des flaques — assez pour voir d'où elle vient,
 * pas assez pour gêner la récolte.
 */
const WAVE_ZOOM = 0.82;
const WAVE_ZOOM_MS = 5200;

/** Les gestes qui comptent comme une activation utilisateur pour l'audio. */
const GESTURES = ['pointerdown', 'pointerup', 'keydown'] as const;

/** Umami expose cet objet globalement une fois `nx.js` chargé (voir index.html). */
declare global {
  interface Window {
    umami?: { track: (eventName: string) => void };
  }
}

const BEAST_PARTICLES: Record<WildlifeId, ParticleStyle> = {
  crab: PARTICLES.claw,
  wolf: PARTICLES.fur,
  // Les gardiens d'une base sont des mutants : ils giclent fluo.
  guardian: PARTICLES.mutant,
  spitter: PARTICLES.mutant,
  chief: PARTICLES.mutant,
};
/** Les éclats d'un mur frappé : ceux de la pierre, dans l'ombre de la roche. */
const CHIP_PARTICLES: ParticleStyle = { ...PARTICLES.stone, colors: [GROUND.rock.shade] };

async function main(): Promise<void> {
  // Le contrôle d'intégrité des prototypes ne tourne qu'en dev : en production
  // les données sont figées au build, et TypeScript a déjà tout vérifié.
  if (import.meta.env.DEV) assertPrototypes();

  // Les curseurs dessinés, sur un appareil à souris seulement.
  installCursors();

  // La langue d'abord : tout ce qui suit s'écrit dans elle. Au premier lancement, celle du navigateur.
  const localePrefs = LocalLocale.browser();

  setLocale(localePrefs.load() ?? detectLocale(navigator.languages ?? [navigator.language]));
  onLocale((locale) => {
    document.documentElement.lang = locale;
    document.title = t().common.pageTitle;
  });

  // La musique se télécharge pendant que l'écran titre se monte, sans le retarder.
  prefetchMusic();

  const mount = document.querySelector<HTMLDivElement>('#app');

  if (!mount) throw new Error('#app introuvable');

  /*
   * `…/test` : une base déjà bâtie, rebâtie à chaque chargement. Elle ne lit
   * ni n'écrit aucun stockage — ni la sauvegarde du joueur, ni son jardin,
   * ni son record — et s'ouvre sans écran titre.
   */
  const scenario = testScenarioOf(window.location.pathname, import.meta.env.BASE_URL);

  // Une partie sauvegardée reprend là où elle s'était arrêtée ; sinon, une carte neuve.
  const saves = scenario ? new LocalSave(null) : LocalSave.browser();
  const loaded = saves.load();
  const world = scenario
    ? stageScenario(TEST_SCENARIOS[scenario])
    : loaded.status === 'ok'
      ? loaded.world
      : World.newColony(readSeed());

  // Le joystick repart au repos : un doigt posé au moment où l'onglet s'est fermé ne fait plus marcher Adam.
  if (loaded.status === 'ok') world.push({ type: 'setMoveAxis', x: 0, y: 0 });

  const renderer = await GameRenderer.create(world, mount);
  const audio = new AudioEngine();

  // En dev seulement : le monde sous la main dans la console du navigateur,
  // pour provoquer une vague ou une naissance sans attendre trois minutes.
  if (import.meta.env.DEV) Object.assign(window, { mobileFactory: { world, audio } });

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
  const hud = new Hud(world, debug);
  const buildMenu = new BuildMenu(world, placement, MENU_BUILDING_IDS, () => audio.play('open'));
  // La fenêtre d'un bâtiment, le sac, les ressources et le troc occupent la même place : l'un ferme les autres.
  const panel = new BuildingPanel(world, () => {
    inventory.close();
    resources.close();
    trade.close();
    audio.play('open');
  });
  const inventory = new InventoryPanel(
    world,
    () => {
      panel.close();
      resources.close();
      trade.close();
      audio.play('open');
    },
    (alert) => renderer.pointTo(alert.target, alert.item),
  );
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
  const trade = new CaravanPanel(world, () => {
    panel.close();
    inventory.close();
    resources.close();
    audio.play('open');
  });

  // Adam arrive au contact de la caravane garée : la fenêtre Troc s'ouvre.
  world.events.on('caravanReached', ({ id }) => trade.show(id));
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
  const zoomPrefs = LocalZoom.browser();
  const savedZoom = zoomPrefs.load();

  if (savedZoom !== null) renderer.restoreZoom(savedZoom);

  /*
   * La carte du monde. En attendant le brouillard de guerre, elle montre ce
   * que la caméra a montré depuis le chargement (`SeenArea`), plus les
   * abords d'Adam et du bâti.
   */
  const seen = new SeenArea();

  seen.seeAround(Math.floor(world.player.x / TILE_SIZE), Math.floor(world.player.y / TILE_SIZE), KNOWN_AROUND_PLAYER);
  for (const entity of world.entities.values()) {
    seen.seeAround(entity.tx + Math.floor(entity.width / 2), entity.ty + Math.floor(entity.height / 2), KNOWN_AROUND_BUILDING);
  }

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
  let shownZoom = renderer.zoomLevel;
  const zoom = new ZoomControls({
    zoomIn: () => (worldMap.open ? worldMap.stepZoom(1) : renderer.stepZoom(1)),
    zoomOut: () => (worldMap.open ? worldMap.stepZoom(-1) : renderer.stepZoom(-1)),
    recenter: () => (worldMap.open ? worldMap.recenter() : renderer.resetZoom()),
  });

  // L'éditeur de personnage : ouvert, il arrête l'horloge comme les réglages ; « Valider » pousse `dressAdam`.
  const wardrobe = new WardrobePanel(world, {
    onToggle: (open) => {
      accumulator = 0;
      if (!open) return;
      buildMenu.close();
      panel.close();
      inventory.close();
      resources.close();
      trade.close();
      audio.play('open');
    },
  });

  // Une pièce trouvée : un toast, et son bouton « Essayer » ouvre l'éditeur sur son onglet.
  world.events.on('pieceFound', ({ piece }) => {
    hud.notify(t().wardrobe.found(t().pieces[piece]), 'good', {
      label: t().wardrobe.tryOn,
      run: () => {
        if (started && !paused && !settings.open && !world.defeated) wardrobe.show(PIECES[piece].slot);
      },
    });
  });
  world.events.on('lookRejected', () => hud.notify(t().wardrobe.rejected, 'bad'));
  world.events.on('piecesSpared', ({ prestige }) => hud.notify(t().wardrobe.spare(prestige), 'good'));

  // La rangée du haut à droite : Pause, Réglages, la carte du monde, puis le zoom.
  zoom.root.prepend(hud.pauseButton, hud.settingsButton, worldMap.button);
  hud.mountControls(zoom.root);
  // Les trois boutons du joueur, en bas à droite : la garde-robe d'Adam, le sac, « Bâtir ».
  hud.actions.append(wardrobe.button, hud.bag, buildMenu.buildButton);
  hud.root.append(worldMap.root, stick.root, buildMenu.root, panel.root, inventory.root, resources.root, trade.root);
  stick.avoid(buildMenu.bottomParts, hud.root);
  hud.bag.addEventListener('click', () => inventory.toggle());
  hud.resourcesButton.addEventListener('click', () => resources.toggle());
  hud.setProjector((x, y) => renderer.worldToScreen(x, y));
  buildMenu.setProjector((x, y) => renderer.worldToScreen(x, y));
  hud.setFocus((x, y) => renderer.peek(x, y));

  /*
   * L'horloge : la simulation n'avance que si la partie a commencé et n'est
   * pas en pause. Le rendu, lui, tourne toujours — la carte se dessine
   * derrière l'écran titre et derrière la pause.
   */
  let started = false;
  let paused = false;
  // L'écran de victoire arrête l'horloge jusqu'à « Continuer sans fin ».
  let celebrating = false;

  // Les pancartes des bâtiments : une préférence de l'appareil — la partie de test ne touche à aucun stockage.
  const signPrefs = scenario ? new LocalSigns(null) : LocalSigns.browser();
  let signsOn = signPrefs.load();
  const showSigns = (on: boolean): void => {
    signsOn = on;
    signPrefs.save(on);
    renderer.setSigns(on);
    settings.setSigns(on);
  };

  // Les réglages ouverts arrêtent l'horloge, comme la pause, sans en montrer l'écran.
  const settings = new SettingsPanel({
    setLocale: (locale) => {
      setLocale(locale);
      localePrefs.save(locale);
    },
    toggleSound: () => settings.setSound(!audio.toggleMuted()),
    toggleMusic: () => settings.setMusic(audio.toggleMusic()),
    toggleSigns: () => showSigns(!signsOn),
    setSfxVolume: (volume) => audio.setSfxVolume(volume),
    setMusicVolume: (volume) => audio.setMusicVolume(volume),
    onToggle: (open) => {
      accumulator = 0;
      if (open) audio.play('open');
    },
  });

  renderer.setSigns(signsOn);
  settings.setSigns(signsOn);

  const autosave = wireSave(world, saves, () => started);
  const garden = wireGarden(world, scenario ? new LocalGarden(null) : LocalGarden.browser());
  const record = wireRecord(world, scenario ? new LocalRecord(null) : LocalRecord.browser());

  const achievements = wireAchievements(world, scenario ? new LocalCollection(null) : LocalCollection.browser(), hud, audio);
  const pause = new PauseScreen(world.seed, () => achievements.collection, () => setPaused(false), () => autosave.restart());
  const title = new TitleScreen({
    resume: loaded.status === 'ok',
    notice: LOAD_NOTICES[loaded.status] ?? linkNotice(world),
    garden: garden.current(),
    gardenActions: garden,
    record,
    collection: () => achievements.collection,
    onPlay: () => {
      // Une nouvelle colonie part avec les bonus du jardin ; une colonie reprise garde les siens.
      if (loaded.status !== 'ok') world.push({ type: 'applyPerks', perks: activePerks(garden.current()) });
      // Les compteurs de colonie repartent de zéro ; les skins gagnés l'attendent dans sa garde-robe.
      if (loaded.status !== 'ok') achievements.newRun();
      world.push({ type: 'grantPieces', pieces: earnedSkins(achievements.collection), silent: true });
      started = true;
      hud.root.dataset['started'] = 'true';
      window.umami?.track(loaded.status === 'ok' ? 'partie-reprise' : 'partie-demarree');
    },
    onRestart: () => autosave.restart(),
    onSettings: () => settings.show(),
  });

  function setPaused(value: boolean): void {
    if (!started || world.defeated) return;
    paused = value;
    pause.visible = value;
    accumulator = 0;
    audio.setPaused(value);
  }

  world.events.on('victory', () => {
    celebrating = true;
    window.umami?.track('victoire');
  });
  hud.setOnContinue(() => {
    celebrating = false;
    accumulator = 0;
  });

  hud.pauseButton.addEventListener('click', () => setPaused(!paused));
  hud.settingsButton.addEventListener('click', () => settings.toggle());
  hud.root.append(pause.root);

  if (scenario) {
    started = true;
    hud.root.dataset['started'] = 'true';
    hud.root.append(testBanner(scenario));
  } else {
    hud.root.append(title.root);
  }
  hud.root.append(wardrobe.root);
  // Par-dessus tout, écran titre compris : la langue se choisit avant même de jouer.
  hud.root.append(settings.root);
  mount.append(hud.root);

  /*
   * Le menu de construction au clavier : Espace, flèches, Entrée, Échap.
   * Écouté en phase de capture, donc avant les autres écouteurs de `window` :
   * une touche que le menu prend ne fait ni marcher Adam ni basculer la pause.
   */
  window.addEventListener(
    'keydown',
    (event) => {
      // Ctrl, Alt ou Cmd : un raccourci du navigateur ou du système, pas du menu.
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

      const canOpen = started && !paused && !settings.open && !wardrobe.open && !world.defeated && !worldMap.open;

      if (buildMenu.handleKey(event.code, event.repeat, canOpen)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );

  // Onglet caché, appel entrant, écran verrouillé : la partie s'arrête d'elle-même,
  // et elle est écrite tout de suite — sur mobile, un onglet caché peut être tué sans prévenir.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    setPaused(true);
    autosave.now();
  });
  window.addEventListener('pagehide', () => autosave.now());
  // Les raccourcis du jeu (`input/shortcuts.ts`) : P, Échap, I, M, ². Le menu de construction a pris les siens avant.
  window.addEventListener('keydown', (event) => {
    const typing = isTyping(event.target);
    const { code, key, repeat, ctrlKey, metaKey, altKey } = event;
    const shortcut = shortcutOf({ code, key, repeat, ctrlKey, metaKey, altKey, typing });

    if (shortcut === 'pause' && !settings.open) setPaused(!paused);
    // Échap ferme d'abord ce qui est au premier plan ; la pause, si rien ne l'est.
    if (shortcut === 'escape') {
      // Le champ qui avait le clavier le rend : les touches suivantes reviennent au jeu.
      if (typing && event.target instanceof HTMLElement) event.target.blur();

      const action = escapeAction({
        settingsOpen: settings.open,
        wardrobeOpen: wardrobe.open,
        paused,
        mapOpen: worldMap.open,
        menuOpen: buildMenu.isOpen,
        panelOpen: panel.open || trade.open,
        inventoryOpen: inventory.open || resources.open,
      });

      if (action === 'closeSettings') settings.close();
      else if (action === 'closeWardrobe') wardrobe.close();
      else if (action === 'closeMap') worldMap.close();
      else if (action === 'closeMenu') buildMenu.close();
      else if (action === 'closePanel') {
        panel.close();
        trade.close();
      }
      else if (action === 'closeInventory') {
        inventory.close();
        resources.close();
      }
      else setPaused(action === 'pause');
    }
    if (shortcut === 'inventory' && started && !paused && !settings.open && !wardrobe.open && !worldMap.open) inventory.toggle();
    if (shortcut === 'map') {
      if (worldMap.open) worldMap.close();
      else if (started && !paused && !settings.open && !wardrobe.open && !world.defeated) worldMap.show();
    }
    if (shortcut === 'debug' && import.meta.env.DEV) hud.toggleDebug();
    // Débogage : F lève ou rabat le brouillard de guerre — en dev, panneau de debug ouvert.
    if (event.code === 'KeyF' && import.meta.env.DEV && hud.debugOn && !isTyping(event.target)) {
      world.push({ type: 'setFog', enabled: !world.fog.enabled });
    }
  });

  // Taper le repère de la mairie : sa fenêtre si Adam est à portée de
  // transfert, sinon un coup d'œil d'une seconde vers elle.
  const homeTap = new IndicatorTap(
    (x, y) => renderer.homeIndicatorAt(x, y),
    () => {
      const hall = world.entities.get(world.townHallId);

      if (!hall) return;
      if (world.inReach(hall)) panel.show(hall.id);
      else renderer.peek((hall.tx + hall.width / 2) * TILE_SIZE, (hall.ty + hall.height / 2) * TILE_SIZE);
    },
  );

  // Ordre d'interrogation des doigts du canvas : le repère de la mairie
  // d'abord (il ne revendique qu'un doigt posé dessus), l'inspection ensuite
  // (elle ne revendique qu'un tap sur un bâtiment ou une créature), le
  // placement en dernier (il ne revendique rien tant qu'aucun bâtiment
  // n'est armé). Le joystick
  // est dans le DOM, au-dessus du canvas, et garde ses doigts pour lui —
  // Adam marche au pouce pendant que l'autre doigt vise. Un pouce qui rate
  // l'anneau, en bas au milieu, passe après les taps : l'anneau
  // saute sous lui, sauf si un bâtiment armé attend d'être posé.
  //
  // À la souris, le survol seul fait suivre le fantôme au curseur : le mode
  // PC se décide à l'événement (`pointerType`), le tactile n'en voit rien.
  const pointers = new PointerRouter(renderer.canvas, (sample) => placement.hover(sample));

  pointers.add(homeTap);
  pointers.add(inspect);
  // Le curseur de la souris sur la carte : la main sur ce qui se tape, l'interdit
  // sur une case refusée, la flèche ailleurs. Le HUD (DOM) a ses propres règles CSS.
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || event.target !== renderer.canvas) return;

    const rect = renderer.canvas.getBoundingClientRect();
    const sample = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top, mouse: true };
    const over =
      placement.mode !== 'idle'
        ? placement.block() !== null
          ? 'forbidden'
          : 'arrow'
        : renderer.homeIndicatorAt(sample.x, sample.y) || inspect.hovers(sample)
          ? 'hand'
          : 'arrow';

    renderer.canvas.style.cursor = `var(--cursor-${over})`;
  });
  pointers.add(stick.canvasFinger(renderer.canvas, () => placement.mode === 'idle'));
  pointers.add(placement);
  // Deux doigts sur la carte : le pinch, autour du milieu des deux. Il ne
  // prend que des doigts libres ou de tap — jamais le pouce du joystick ni
  // le doigt qui place un bâtiment.
  pointers.setGesture(new Pinch((factor, x, y) => renderer.zoomBy(factor, { x, y }, true)));
  // La molette zoome sous le curseur ; ni elle ni le pinch d'un pavé tactile ne zooment la page.
  bindWheelZoom(
    renderer.canvas,
    () => started && !paused && !settings.open,
    ({ factor, immediate }, x, y) => renderer.zoomBy(factor, { x, y }, immediate),
  );

  wireAudio(world, audio, settings);
  wireParticles(world, renderer);
  wireAlarm(world, renderer, hud);
  // Le joueur vise ou lit : un bâtiment armé, le menu, une fenêtre ou le sac ouverts.
  wireShake(
    world,
    renderer,
    () => placement.mode !== 'idle' || buildMenu.isOpen || panel.open || inventory.open || resources.open || trade.open || worldMap.open,
  );

  let accumulator = 0;
  let frame = 0;

  // Une partie de test peut s'ouvrir sur l'éditeur de personnage, pour les captures.
  if (scenario && (TEST_SCENARIOS[scenario] as TestScenarioProto).wardrobe?.open) wardrobe.show();
  let lastAxisX = 0;
  let lastAxisY = 0;

  renderer.app.ticker.add((ticker) => {
    const running = started && !paused && !settings.open && !wardrobe.open;

    if (running && !celebrating) accumulator += Math.min(ticker.deltaMS, MAX_FRAME_MS);

    while (accumulator >= STEP_MS && !celebrating) {
      pushAxisIfChanged();
      world.tick();
      accumulator -= STEP_MS;
    }
    if (running) autosave.update(ticker.deltaMS);
    // Une fois par seconde de jeu : les succès dont la condition vient d'être remplie.
    if (running && world.tickCount % TICKS_PER_SECOND === 0 && world.tickCount !== achievements.checkedAt) achievements.update();

    const roadTool = placement.roadTool();

    // La carte du monde couvre l'écran : la scène du jeu ne se dessine plus, la carte si.
    renderer.setHidden(worldMap.open);
    if (hud.root.dataset['map'] !== String(worldMap.open)) hud.root.dataset['map'] = String(worldMap.open);
    worldMap.update(ticker.deltaMS);

    renderer.draw(
      accumulator / STEP_MS,
      placement.armedBuilding(),
      placement.ghost,
      roadTool && { tool: roadTool, trail: placement.roadTrail() },
    );
    hud.update(ticker.FPS, renderer.bakedChunks, renderer.atlasStats, renderer.waterStats, renderer.weatherParticles);

    // Lire la mise en page force un reflow : une fois tous les dix cadres suffit.
    if (++frame % 10 === 0) {
      renderer.setHudInsets(hud.topInset(), bottomInset(), [
        ...hud.obstacles(),
        stick.root.getBoundingClientRect(),
        zoom.root.getBoundingClientRect(),
      ]);
      // Ce que la caméra montre entre dans la zone découverte de la carte du monde.
      if (!worldMap.open) {
        const view = renderer.cameraView;

        seen.see({
          minTx: Math.floor((view.x - view.width / 2) / TILE_SIZE),
          minTy: Math.floor((view.y - view.height / 2) / TILE_SIZE),
          maxTx: Math.floor((view.x + view.width / 2) / TILE_SIZE),
          maxTy: Math.floor((view.y + view.height / 2) / TILE_SIZE),
        });
      }
      if (renderer.zoomLevel !== shownZoom) {
        shownZoom = renderer.zoomLevel;
        zoomPrefs.save(shownZoom);
      }
    }
    zoom.update(worldMap.open ? worldMap.zoomLimits : renderer.zoomLimits);
    renderer.setObjective(hud.wantedItem());
    renderer.setSelected(panel.selection);
    buildMenu.refresh();
    panel.update();
    inventory.update();
    resources.update();
    trade.update();
    // Un menu, une fenêtre ou la pause par-dessus : le joystick s'efface et
    // lâche son doigt ; il revient à la fermeture.
    stick.setEnabled(
      running && !world.defeated && !buildMenu.isOpen && !panel.open && !inventory.open && !resources.open && !trade.open && !worldMap.open,
    );
    if (hud.root.dataset['stick'] !== String(stick.shown)) hud.root.dataset['stick'] = String(stick.shown);
  });

  /**
   * Ce que le bas de l'écran occupe : le bouton « Bâtir », ou plus quand
   * le tiroir, la barre de placement ou la fenêtre d'un bâtiment sont ouverts.
   */
  function bottomInset(): number {
    const height = renderer.app.screen.height;
    let top = height - HUD_BOTTOM_INSET;

    for (const node of [...buildMenu.bottomParts, panel.root, inventory.root, resources.root, trade.root]) {
      const rect = node.getBoundingClientRect();

      if (rect.height > 0) top = Math.min(top, rect.top);
    }
    return height - top;
  }

  /**
   * L'axe est lu en continu mais ne devient une commande que lorsqu'il bouge
   * vraiment. Sans ce filtre, le journal de commandes — la base de la
   * rejouabilité — grossirait de 20 entrées par seconde sans rien apprendre.
   *
   * Le pouce a la priorité sur le clavier : sur un PC tactile, un joystick
   * posé pendant qu'une touche est tenue ne doit pas se battre avec elle.
   * Menu de construction ouvert, le clavier sert à choisir un bâtiment :
   * une flèche tenue au moment de l'ouvrir n'emmène pas Adam avec elle. La
   * carte du monde ouverte, Adam ne marche pas à l'aveugle.
   */
  function pushAxisIfChanged(): void {
    const keys = buildMenu.isOpen || worldMap.open ? STILL : keyboard.state;
    const { axisX, axisY } = joystick.state.active ? joystick.state : keys;

    if (
      Math.abs(axisX - lastAxisX) < AXIS_EPSILON &&
      Math.abs(axisY - lastAxisY) < AXIS_EPSILON
    ) {
      return;
    }
    lastAxisX = axisX;
    lastAxisY = axisY;
    world.push({ type: 'setMoveAxis', x: axisX, y: axisY });
  }
}

/**
 * Un son par événement de simulation. Le moteur ne connaît pas le monde,
 * le monde ne connaît pas le moteur : la table est ici, et nulle part ailleurs.
 */
function wireAudio(world: World, audio: AudioEngine, settings: SettingsPanel): void {
  // Les navigateurs mobiles exigent un geste avant le moindre son : le
  // premier doigt posé n'importe où déverrouille tout, musique comprise.
  // On réessaie à chaque geste tant que le contexte n'a pas démarré — iOS
  // n'accepte pas toujours le premier `pointerdown` comme un vrai geste.
  const unlock = (): void => {
    audio.unlock();

    if (!audio.ready) return;
    for (const type of GESTURES) window.removeEventListener(type, unlock);
  };

  for (const type of GESTURES) window.addEventListener(type, unlock);

  // Onglet caché, plus de musique ; au retour, elle reprend. Si le navigateur
  // refuse de reprendre sans geste (iOS), le prochain doigt posé s'en charge.
  document.addEventListener('visibilitychange', () => {
    audio.setHidden(document.hidden);
    if (!document.hidden) for (const type of GESTURES) window.addEventListener(type, unlock);
  });

  settings.setSound(!audio.muted);
  settings.setMusic(audio.musicOn);
  settings.setVolumes(audio.sfxVolume, audio.musicVolume);

  // Une partie rechargée au crépuscule ou en pleine vague : l'oreille le sait aussitôt.
  const phase = world.clock()?.phase;

  if (phase === 'dusk' || phase === 'night') audio.night('dusk');
  if ([...world.mobiles.values()].some((mobile) => mobile.kind === 'mutant')) audio.night('wave');

  world.events.on('resourceHarvested', ({ item }) => audio.play(item === 'wood' ? 'chop' : 'rock'));
  // Une hache de bûcheron ne s'entend qu'à côté d'Adam : dix cabanes au loin ne font pas un vacarme.
  world.events.on('treeChopped', ({ tx, ty }) => {
    const dx = (tx + 0.5) * TILE_SIZE - world.player.x;
    const dy = (ty + 0.5) * TILE_SIZE - world.player.y;

    if (dx * dx + dy * dy <= (CHOP_HEARING_TILES * TILE_SIZE) ** 2) audio.play('chop');
  });
  world.events.on('siteDelivered', () => audio.play('deliver'));
  world.events.on('storeTaken', () => audio.play('deliver'));
  world.events.on('buildingSupplied', () => audio.play('deliver'));
  world.events.on('labSupplied', () => audio.play('deliver'));
  world.events.on('researchCompleted', () => audio.play('eureka'));
  world.events.on('townDeposited', () => audio.play('deliver'));
  world.events.on('itemDropped', () => audio.play('pickup'));
  world.events.on('buildingCompleted', () => audio.play('build'));
  world.events.on('buildingUpgraded', () => audio.play('upgrade'));
  world.events.on('arrowShot', () => audio.play('arrow'));
  world.events.on('mutantHit', () => audio.play('hit'));
  world.events.on('mutantDied', () => audio.play('die'));
  world.events.on('mutantStunned', () => audio.play('dizzy'));
  world.events.on('patientFollowing', () => audio.play('pickup'));
  world.events.on('patientAdmitted', () => audio.play('open'));
  world.events.on('mutantHealed', () => audio.play('baby'));
  world.events.on('kidGrewUp', () => audio.play('baby'));
  world.events.on('beastHit', () => audio.play('hit'));
  world.events.on('beastDied', () => audio.play('die'));
  world.events.on('playerHurt', ({ hp }) => {
    if (hp > 0) audio.play('bite');
  });
  world.events.on('playerKnockedOut', () => audio.play('faint'));
  world.events.on('buildingDamaged', ({ hp }) => {
    if (hp > 0) audio.play('thud');
  });
  world.events.on('playerRepaired', () => audio.play('repair'));
  world.events.on('buildingDestroyed', () => audio.play('collapse'));
  world.events.on('enemyBaseHit', () => audio.play('thud'));
  world.events.on('enemyBaseDestroyed', () => {
    audio.play('collapse');
    audio.play('objective');
  });
  world.events.on('enemyBaseResisted', () => audio.play('deny'));
  world.events.on('enemyBaseShielded', () => audio.play('deny'));
  world.events.on('spitShot', () => audio.play('gloop'));
  world.events.on('chiefSlamWarned', () => audio.play('brute'));
  world.events.on('baseFireWarned', () => audio.play('brute'));
  world.events.on('baseFired', () => audio.play('gloop'));
  world.events.on('chiefSlammed', () => audio.play('thud'));
  world.events.on('enemyChiefDefeated', () => audio.play('objective'));
  world.events.on('levelUp', () => audio.play('objective'));
  world.events.on('gearCrafted', () => audio.play('upgrade'));
  world.events.on('companionTraining', () => audio.play('upgrade'));
  world.events.on('companionJoined', () => audio.play('objective'));
  world.events.on('companionDied', () => audio.play('deny'));
  world.events.on('recruitRejected', () => audio.play('deny'));
  world.events.on('companionHealed', () => audio.play('pickup'));
  world.events.on('siteCancelled', () => audio.play('deliver'));
  world.events.on('roadPaved', () => audio.play('deliver'));
  world.events.on('roadRemoved', () => audio.play('pickup'));
  world.events.on('waveCountdown', ({ seconds }) => {
    if (seconds === WAVE_ANNOUNCE_SECONDS) audio.play('horn');
    audio.play('countdown');
  });
  world.events.on('duskFell', () => audio.night('dusk'));
  world.events.on('waveStarted', ({ boss }) => {
    audio.play('alarm');
    audio.play('gloop');
    audio.night('wave');
    if (boss) audio.play('brute');
  });
  world.events.on('waveCleared', () => {
    audio.play('victory');
    audio.night('cleared');
  });
  world.events.on('dawnBroke', () => {
    audio.night('dawn');
    audio.play('dawn');
  });
  world.events.on('queenAnnounced', () => audio.play('horn'));
  world.events.on('queenLaid', () => audio.play('gloop'));
  world.events.on('queenDived', () => audio.play('gloop'));
  world.events.on('queenSlain', () => audio.play('objective'));
  world.events.on('lootPicked', () => audio.play('pickup'));
  world.events.on('pieceFound', () => audio.play('pickup'));
  world.events.on('chestOpened', () => audio.play('eureka'));
  world.events.on('childBorn', () => audio.play('baby'));
  world.events.on('eveArrived', () => audio.play('build'));
  world.events.on('traded', () => audio.play('deliver'));
  world.events.on('questCompleted', () => audio.play('build'));
  world.events.on('townHallDestroyed', () => {
    audio.play('defeat');
    audio.night('dawn');
  });
  // Le dernier objectif, et la fin d'un acte, ont leur fanfare à eux.
  world.events.on('objectiveCompleted', ({ index }) =>
    audio.play(index < OBJECTIVES.length - 1 && !(OBJECTIVES[index] as ObjectiveProto).banner ? 'objective' : 'colony'),
  );
  world.events.on('antennaRaised', () => audio.play('build'));
  world.events.on('antennaFell', () => audio.play('alarm'));
  world.events.on('survivorsArrived', () => audio.play('build'));
}

interface Autosave {
  /** À appeler entre deux ticks : écrit la partie si l'intervalle est écoulé ou si un moment clé l'a demandé. */
  update(deltaMs: number): void;
  /** Écrit la partie sur-le-champ — onglet caché, page quittée. */
  now(): void;
  /** Efface la partie et recharge la page sur une carte neuve (ou la seed de l'URL). */
  restart(): void;
}

/**
 * La sauvegarde automatique. Elle n'écrit qu'une partie commencée — l'écran
 * titre ne doit pas écraser la sauvegarde qu'il propose de continuer — et
 * jamais une partie perdue : à la chute de la mairie, elle est effacée.
 *
 * Les moments clés (un bâtiment terminé, une vague repoussée, l'aube, un
 * objectif réussi) arrivent en plein tick ; ils ne font que lever un drapeau, et
 * l'écriture attend la fin du tick, quand l'état est cohérent.
 */
function wireSave(world: World, saves: LocalSave, started: () => boolean): Autosave {
  let elapsed = 0;
  let due = false;
  let enabled = true;

  const write = (): void => {
    elapsed = 0;
    due = false;
    if (!enabled || !started() || world.defeated) return;
    saves.save(world);
  };

  world.events.on('buildingCompleted', () => {
    due = true;
  });
  world.events.on('siteCancelled', () => {
    due = true;
  });
  world.events.on('buildingUpgraded', () => {
    due = true;
  });
  world.events.on('objectiveCompleted', () => {
    due = true;
  });
  const waveOver = (): void => {
    for (const mobile of world.mobiles.values()) if (mobile.kind === 'mutant') return;
    due = true;
  };

  world.events.on('mutantDied', waveOver);
  world.events.on('mutantStunned', waveOver);
  world.events.on('mutantHealed', () => {
    due = true;
  });
  world.events.on('dawnBroke', () => {
    due = true;
  });
  // Un échange sac ⇄ coffre est un geste du joueur : il ne doit pas se perdre à la fermeture de l'onglet.
  world.events.on('itemsTransferred', () => {
    due = true;
  });
  world.events.on('townHallDestroyed', () => saves.clear());

  return {
    update(deltaMs) {
      elapsed += deltaMs;
      if (due || elapsed >= AUTOSAVE_MS) write();
    },
    now: write,
    restart() {
      // Plus rien ne s'écrit : le `pagehide` du rechargement ressusciterait la partie effacée.
      enabled = false;
      saves.clear();
      window.umami?.track('partie-recommencee');
      window.location.reload();
    },
  };
}

interface GardenWiring {
  current(): Garden;
  plant(perk: PerkId): Garden;
  setPure(pure: boolean): Garden;
}

/**
 * Le jardin des souvenirs : les graines de la colonie tombée y entrent à la
 * chute de la mairie, une seule fois — la partie perdue est effacée juste
 * après, elle ne retombera pas. Chaque changement est écrit tout de suite,
 * sous sa propre clé : « Recommencer » n'y touche pas.
 */
function wireGarden(world: World, gardens: LocalGarden): GardenWiring {
  let garden = gardens.load();

  const keep = (next: Garden): Garden => {
    garden = next;
    gardens.save(next);
    return next;
  };

  world.events.on('townHallDestroyed', () => keep(harvestSeeds(garden, seedsFor(world.colonyScore()))));

  return {
    current: () => garden,
    plant: (perk) => keep(plant(garden, perk)),
    setPure: (pure) => keep({ ...garden, pure }),
  };
}

interface AchievementWiring {
  readonly collection: Collection;
  /** Le tick du dernier contrôle, pour n'en faire qu'un par seconde. */
  readonly checkedAt: number;
  update(): void;
  newRun(): void;
}

/**
 * Les succès : la collection vit à part de la partie (`storage/localCollection.ts`),
 * s'écrit à chaque changement, et chaque succès obtenu offre son toast et, le
 * cas échéant, sa pièce de garde-robe.
 */
function wireAchievements(world: World, collections: LocalCollection, hud: Hud, audio: AudioEngine): AchievementWiring {
  let checkedAt = -1;
  const tracker = new AchievementTracker(world, collections.load(), {
    onChange: () => void collections.save(tracker.collection),
    onUnlock: (id) => {
      const reward = rewardOf(id);

      hud.notifyAchievement(t().collection.unlocked, t().achievements[id].label, rewardText(id));
      audio.play('objective');
      if (reward && 'skin' in reward) world.push({ type: 'grantPieces', pieces: [reward.skin] });
    },
  });

  return {
    collection: tracker.collection,
    get checkedAt() {
      return checkedAt;
    },
    update: () => {
      checkedAt = world.tickCount;
      tracker.update();
    },
    newRun: () => tracker.newRun(),
  };
}

/**
 * Le record « nuits tenues après le Signal » : chaque aube d'après le Signal
 * le propose, et la chute de la mairie aussi. Renvoie le record au démarrage,
 * pour l'écran titre.
 */
function wireRecord(world: World, records: LocalRecord): number {
  const offer = (): void => void records.offer(world.nightsAfterSignal());

  world.events.on('dawnBroke', offer);
  world.events.on('townHallDestroyed', offer);
  return records.load();
}

/** Les éclats : copeaux à la coupe, sang vert à l'impact, gravats à l'effondrement. */
function wireParticles(world: World, renderer: GameRenderer): void {
  const { particles } = renderer;

  world.events.on('resourceHarvested', ({ tx, ty, item }) =>
    particles.burst((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, ITEM_PARTICLES[item]),
  );
  // Les petits éclats d'un coup de hache de bûcheron, au pied du tronc.
  world.events.on('treeChopped', ({ tx, ty, remaining }) =>
    particles.burst((tx + 0.4) * TILE_SIZE, (ty + 0.8) * TILE_SIZE, PARTICLES.wood, remaining > 0 ? 3 : 8, 0.07),
  );
  // Chaque flèche qui porte ouvre un anneau blanc là où elle touche.
  world.events.on('mutantHit', ({ x, y }) => {
    particles.ring(x, y - 12);
    particles.burst(x, y - 12, PARTICLES.mutant, 4);
  });
  world.events.on('mutantDied', ({ x, y }) => {
    particles.ring(x, y - 12);
    particles.burst(x, y - 12, PARTICLES.mutant, 12, 0.12);
  });
  world.events.on('mutantFled', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.mutant, 6, 0.1));
  world.events.on('beastHit', ({ proto, x, y }) => {
    particles.ring(x, y - 8);
    particles.burst(x, y - 8, BEAST_PARTICLES[proto], 4);
  });
  world.events.on('beastDied', ({ proto, x, y }) => {
    particles.ring(x, y - 8);
    particles.burst(x, y - 8, BEAST_PARTICLES[proto], 10, 0.12);
  });
  world.events.on('buildingDamaged', ({ id }) => {
    const entity = world.entities.get(id);

    if (!entity) return;

    const impact = impactOn(world, entity);

    particles.burst(impact.x, impact.y, CHIP_PARTICLES, 4);
  });
  world.events.on('buildingCorroded', ({ id }) => {
    const entity = world.entities.get(id);

    if (entity) particles.burst((entity.tx + entity.width / 2) * TILE_SIZE, entity.ty * TILE_SIZE + 8, PARTICLES.acid, 4);
  });
  world.events.on('buildingCompleted', ({ id }) => {
    const entity = world.entities.get(id);

    if (!entity) return;

    // Le bâtiment fait « pop » (`entityLayer.ts`), un anneau de poussière s'ouvre à son pied, puis
    // des confettis tout le long : ça y est, il tient debout.
    const foot = (entity.ty + entity.height) * TILE_SIZE;

    particles.dustRing((entity.tx + entity.width / 2) * TILE_SIZE, foot, entity.width * TILE_SIZE);
    for (let i = 0; i <= entity.width; i += 1) {
      particles.burst((entity.tx + i) * TILE_SIZE, foot, PARTICLES.confetti, 7, 0.16);
    }
  });
  world.events.on('buildingUpgraded', ({ id }) => {
    const entity = world.entities.get(id);

    if (!entity) return;

    // Des éclats de fer et des confettis qui sautent du haut de l'emprise : le blindage est vissé.
    for (let i = 0; i <= entity.width; i += 1) {
      particles.burst((entity.tx + i) * TILE_SIZE, entity.ty * TILE_SIZE, PARTICLES.iron, 6, 0.14);
      particles.burst((entity.tx + i) * TILE_SIZE, entity.ty * TILE_SIZE, PARTICLES.confetti, 5, 0.16);
    }
  });
  world.events.on('buildingDestroyed', ({ tx, ty }) =>
    particles.burst((tx + 1) * TILE_SIZE, (ty + 1) * TILE_SIZE, PARTICLES.rubble, 16, 0.14),
  );
  // Une base mutante frappée crache sa gelée ; abattue, elle s'effondre dans un anneau de poussière.
  world.events.on('enemyBaseHit', ({ x, y }) => {
    particles.ring(x, y);
    particles.burst(x, y, PARTICLES.mutant, 4);
  });
  world.events.on('enemyBaseDestroyed', ({ x, y }) => {
    particles.dustRing(x, y + TILE_SIZE * 1.5, TILE_SIZE * 3);
    particles.burst(x, y, PARTICLES.rubble, 18, 0.14);
    particles.burst(x, y, PARTICLES.mutant, 14, 0.14);
    particles.burst(x, y, PARTICLES.confetti, 12, 0.16);
  });
  // La massue du chef tombe : un anneau de poussière à la taille de son cercle. Le crachat s'écrase en gouttes.
  world.events.on('chiefSlammed', ({ x, y }) => {
    particles.dustRing(x, y, CHIEF.slam.radius * 2 * TILE_SIZE);
    particles.burst(x, y, PARTICLES.rubble, 8, 0.1);
  });
  world.events.on('spitSplashed', ({ x, y }) => particles.burst(x, y, PARTICLES.mutant, 5, 0.08));
  // Un coffre s'ouvre : des confettis et des étoiles jaillissent de la caisse.
  world.events.on('chestOpened', ({ x, y }) => {
    particles.burst(x, y - 8, PARTICLES.confetti, 14, 0.15);
    particles.burst(x, y - 8, PARTICLES.star, 6, 0.1);
  });
  // Un niveau de plus : une gerbe de confettis et d'étoiles autour d'Adam.
  world.events.on('levelUp', ({ x, y }) => {
    particles.burst(x, y - 16, PARTICLES.confetti, 16, 0.16);
    particles.burst(x, y - 16, PARTICLES.star, 8, 0.12);
  });
  world.events.on('fireballBurst', ({ x, y, hit }) => particles.burst(x, y, PARTICLES.ember, hit ? 10 : 5, 0.1));
  world.events.on('enemyChiefDefeated', ({ x, y }) => {
    particles.burst(x, y - 16, PARTICLES.mutant, 14, 0.14);
    particles.burst(x, y - 16, PARTICLES.confetti, 12, 0.16);
  });
  world.events.on('siteCancelled', ({ tx, ty }) => particles.burst((tx + 1) * TILE_SIZE, (ty + 1) * TILE_SIZE, PARTICLES.rubble, 8, 0.08));
  // Une poussière de pierre sur chaque dalle posée ou retirée.
  const roadDust = ({ tiles }: { tiles: readonly { tx: number; ty: number }[] }): void => {
    for (const { tx, ty } of tiles) particles.burst((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, PARTICLES.stone, 3, 0.06);
  };

  world.events.on('roadPaved', roadDust);
  world.events.on('roadRemoved', roadDust);
  world.events.on('lootDropped', ({ x, y }) => particles.burst(x, y - 6, PARTICLES.confetti, 5, 0.08));
  world.events.on('mutantStunned', ({ x, y }) => particles.burst(x, y - 16, PARTICLES.star, 6, 0.1));
  world.events.on('mutantHealed', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.confetti, 10, 0.14));
  world.events.on('kidGrewUp', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.confetti, 10, 0.14));
  world.events.on('lootPicked', ({ item, x, y }) => particles.burst(x, y - 6, ITEM_PARTICLES[item], 6, 0.1));
  world.events.on('waveCleared', () => {
    const hall = world.entities.get(world.townHallId);

    if (!hall) return;

    // Des confettis sur le toit de la mairie : elle a tenu.
    for (let i = 0; i <= hall.width; i += 1) {
      particles.burst((hall.tx + i) * TILE_SIZE, hall.ty * TILE_SIZE, PARTICLES.confetti, 8, 0.16);
    }
  });
}

/**
 * Où un bâtiment est frappé : le point de son emprise le plus proche du
 * mutant le plus proche, un peu au-dessus du sol. Le sim ne dit pas qui
 * frappe ; le plus proche, collé au mur, l'est presque toujours.
 */
function impactOn(world: World, entity: Entity): { x: number; y: number } {
  const left = entity.tx * TILE_SIZE;
  const top = entity.ty * TILE_SIZE;
  const right = (entity.tx + entity.width) * TILE_SIZE;
  const bottom = (entity.ty + entity.height) * TILE_SIZE;
  let x = (left + right) / 2;
  let y = bottom;
  let best = Infinity;

  for (const mobile of world.mobiles.values()) {
    if (mobile.kind !== 'mutant') continue;

    const px = Math.max(left, Math.min(right, mobile.x));
    const py = Math.max(top, Math.min(bottom, mobile.y));
    const distance = (px - mobile.x) ** 2 + (py - mobile.y) ** 2;

    if (distance < best) {
      best = distance;
      x = px;
      y = py;
    }
  }
  return { x, y: y - 10 };
}

/**
 * La mairie frappée hors de l'écran : son repère clignote, le bord de l'écran
 * vire au rouge et le téléphone vibre. Sous les yeux du joueur, la secousse suffit.
 */
function wireAlarm(world: World, renderer: GameRenderer, hud: Hud): void {
  world.events.on('buildingDamaged', ({ id, hp }) => {
    if (id === world.townHallId && hp > 0 && renderer.alarmTownHall()) hud.alarm();
  });
}

/**
 * La caméra encaisse les coups : un peu pour un mur, beaucoup pour la mairie.
 * Et elle recule un peu quand une vague s'annonce, le temps qu'elle sorte de
 * terre, pour qu'on la voie arriver — puis elle revient d'elle-même.
 *
 * Sauf si le joueur est occupé (`busy`) : la carte ne glisse pas sous un
 * bâtiment qu'on pose ou une fenêtre qu'on lit. Le bandeau et le repère de
 * bord de la vague disent la direction à sa place.
 */
function wireShake(world: World, renderer: GameRenderer, busy: () => boolean): void {
  world.events.on('waveCountdown', ({ seconds, x, y }) => {
    if (seconds === WAVE_ANNOUNCE_SECONDS && !busy()) renderer.zoomOut(WAVE_ZOOM, WAVE_ZOOM_MS, { x, y });
  });
  world.events.on('waveStarted', ({ x, y }) => {
    if (!busy()) renderer.zoomOut(WAVE_ZOOM, WAVE_ZOOM_MS - WAVE_ANNOUNCE_SECONDS * 1000, { x, y });
  });
  world.events.on('buildingDamaged', ({ id }) => renderer.shake(id === world.townHallId ? 0.28 : 0.14));
  world.events.on('buildingDestroyed', () => renderer.shake(0.6));
  world.events.on('enemyBaseDestroyed', () => renderer.shake(0.5));
  world.events.on('chiefSlammed', ({ hit }) => renderer.shake(hit ? 0.3 : 0.15));
  world.events.on('enemyChiefDefeated', () => renderer.shake(0.35));
  world.events.on('waveStarted', () => renderer.shake(0.3));
  world.events.on('buildingCompleted', () => renderer.shake(0.18));
  world.events.on('buildingUpgraded', () => renderer.shake(0.12));
  world.events.on('townHallDestroyed', () => renderer.shake(1));
  world.events.on('playerHurt', () => renderer.shake(0.12));
  world.events.on('playerKnockedOut', () => renderer.shake(0.4));
}

/**
 * Seed depuis `?seed=1234`, sinon aléatoire.
 * Une seed dans l'URL, c'est une carte qu'on peut se repasser telle quelle —
 * indispensable pour reproduire un bug de génération.
 */
function readSeed(): number {
  return parseSeed(window.location.search) ?? (Math.random() * 0xffffffff) >>> 0;
}

/**
 * Un lien partagé mène à une carte, mais une sauvegarde l'emporte : elle
 * reprend sur la sienne. L'écran titre le dit, et « Nouvelle partie » ouvre
 * la carte du lien.
 */
function linkNotice(world: World): (() => string) | undefined {
  const linked = parseSeed(window.location.search);

  if (linked === null || linked === world.seed) return undefined;
  return () => t().screens.title.linkedMap(formatSeed(linked));
}

void main();
