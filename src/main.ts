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
import { HASTEN } from './data/dayNight.ts';
import { AudioEngine } from './audio/engine.ts';
import { prefetchMusic } from './audio/music.ts';
import { VOICES } from './audio/synth.ts';
import { assertPrototypes } from './data/validate.ts';
import { GROUND, PARTICLES, type ParticleStyle } from './data/artDirection.ts';
import { MENU_BUILDING_IDS } from './data/buildings.ts';
import { NOTIFICATION_KINDS, type NotificationKind } from './data/notifications.ts';
import { CHIEF, type WildlifeId } from './data/enemies.ts';
import { STORY_SEXES } from './data/inhabitants.ts';
import type { ItemId } from './data/items.ts';
import { TEST_SCENARIOS, type TestScenarioProto } from './data/testScenario.ts';
import { PIECES } from './data/wardrobe.ts';
import { IndicatorTap } from './input/indicatorTap.ts';
import { mapUrl } from './ui/seed.ts';
import { seedsFor, type PerkId } from './data/perks.ts';
import { Inspect } from './input/inspect.ts';
import { installCursors } from './ui/cursors.ts';
import { Joystick } from './input/joystick.ts';
import { Keyboard, isTyping, type KeyboardState } from './input/keyboard.ts';
import { shortcutOf, type Shortcut } from './input/shortcuts.ts';
import { Placement } from './input/placement.ts';
import { PointerRouter } from './input/pointer.ts';
import { Pinch, bindWheelZoom } from './input/zoom.ts';
import { GameRenderer } from './render/renderer.ts';
import { AchievementTracker } from './sim/achievements.ts';
import { earnedSkins, type Collection } from './sim/collection.ts';
import { activePerks, harvestSeeds, plant, type Garden } from './sim/garden.ts';
import { awayMs } from './sim/offline.ts';
import { stageScenario } from './sim/testScenario.ts';
import type { Entity } from './sim/types.ts';
import { STEP_MS, TICKS_PER_SECOND, World } from './sim/world.ts';
import { LocalCollection } from './storage/localCollection.ts';
import { LocalGarden } from './storage/localGarden.ts';
import { LocalRecord } from './storage/localRecord.ts';
import { LocalSave, type LoadResult } from './storage/localSave.ts';
import { TAB_KEY, TabLock } from './storage/localTab.ts';
import { LocalLocale } from './storage/localLocale.ts';
import { LocalGamepad, type GamepadPrefs } from './storage/localGamepad.ts';
import { LocalHaptics } from './storage/localHaptics.ts';
import { LocalNotifications } from './storage/localNotifications.ts';
import { LocalPerf } from './storage/localPerf.ts';
import { LocalSigns } from './storage/localSigns.ts';
import { LocalZoom } from './storage/localZoom.ts';
import { TILE_SIZE } from './core/grid.ts';
import { nextWave } from './sim/dayNight.ts';
import { detectLocale, onLocale, setLocale, t } from './i18n/locale.ts';
import { BuildingPanel } from './ui/buildingPanel.ts';
import { EraPanel } from './ui/eraPanel.ts';
import { CaravanPanel } from './ui/caravanPanel.ts';
import { BagPanel } from './ui/bagPanel.ts';
import { ResourcePanel } from './ui/resourcePanel.ts';
import { escapeAction } from './ui/escape.ts';
import { GamepadControls } from './ui/gamepadControls.ts';
import { JoystickView } from './ui/joystick.ts';
import { BuildMenu } from './ui/buildMenu.ts';
import { rewardText } from './ui/collectionPanel.ts';
import { Hud, clock as clockText } from './ui/hud.ts';
import { OfflineRecap } from './ui/offlineRecap.ts';
import { BoonPanel } from './ui/boonPanel.ts';
import { PauseScreen, TitleScreen } from './ui/screens.ts';
import { haptics } from './ui/haptics.ts';
import { PAD_POINTER_ID } from './ui/padCursor.ts';
import { PadHelp } from './ui/padHelp.ts';
import { PadHints } from './ui/padHints.ts';
import { PerfSampler } from './ui/perfMeter.ts';
import { NotificationPrompt } from './ui/notificationPrompt.ts';
import { TabLockPanel } from './ui/tabLockPanel.ts';
import { Notifier, browserBackend } from './ui/notifier.ts';
import { SettingsPanel } from './ui/settingsPanel.ts';
import { formatSeed, parseSeed } from './ui/seed.ts';
import { testBanner, testScenarioOf } from './ui/testRoute.ts';
import { ZoomControls } from './ui/zoomControls.ts';
import { FogSight } from './ui/mapSight.ts';
import { WorldMap } from './ui/worldMap.ts';
import { AccountClient } from './net/account.ts';
import { inviteCodeOf, playCodeOf, playUrl, resyncsOf, titleUrl, withoutInvite } from './net/invite.ts';
import { GuestSession, HostSession, type GuestStatus } from './net/play.ts';
import { PartyClient } from './net/party.ts';
import { Connection } from './net/connection.ts';
import { LocalAccount } from './storage/localAccount.ts';
import { adoptLegacyData } from './storage/legacyKeys.ts';
import { AccountPanel } from './ui/accountPanel.ts';
import { InvitePanel } from './ui/invitePanel.ts';
import { JoinPanel } from './ui/joinPanel.ts';
import { PlayScreen } from './ui/playScreen.ts';
import { VoiceChat } from './net/voice.ts';
import { BrowserVoiceEnv } from './net/voiceBrowser.ts';
import { VoicePanel } from './ui/voicePanel.ts';

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
  grilledMeat: PARTICLES.claw,
  wheat: PARTICLES.food,
  bread: PARTICLES.food,
  water: PARTICLES.water,
  ironPlate: PARTICLES.iron,
  brick: PARTICLES.stone,
  tools: PARTICLES.iron,
  steel: PARTICLES.coal,
  mutantGoo: PARTICLES.mutant,
  wolfFang: PARTICLES.bone,
  crabClaw: PARTICLES.claw,
  radCore: PARTICLES.mutant,
  amber: PARTICLES.food,
  pearl: PARTICLES.water,
  quartz: PARTICLES.iron,
  spore: PARTICLES.fur,
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
  // Les gardiens des régions : la bête qu'ils ont été, en plus grand.
  greatWolf: PARTICLES.fur,
  giantCrab: PARTICLES.claw,
  colossus: PARTICLES.mutant,
  sludgeKing: PARTICLES.mutant,
};
/** Les éclats d'un mur frappé : ceux de la pierre, dans l'ombre de la roche. */
const CHIP_PARTICLES: ParticleStyle = { ...PARTICLES.stone, colors: [GROUND.rock.shade] };

async function main(): Promise<void> {
  // Le contrôle d'intégrité des prototypes ne tourne qu'en dev : en production
  // les données sont figées au build, et TypeScript a déjà tout vérifié.
  if (import.meta.env.DEV) assertPrototypes();

  // Les curseurs dessinés, sur un appareil à souris seulement.
  installCursors();

  // Les données de l'appareil d'avant le renommage du jeu, avant toute lecture.
  await adoptLegacyData();

  // La langue d'abord : tout ce qui suit s'écrit dans elle. Au premier lancement, celle du navigateur.
  // Lue et écrite même sur la partie de test, comme voulu : la langue est un réglage de l'appareil, pas une donnée de partie.
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

  /*
   * Le back-end, s'il y en a un (`VITE_API_URL`) : une sonde qui ne retarde
   * rien et n'empêche rien. Hors ligne par défaut ; serveur coupé ou absent,
   * le jeu se joue exactement pareil.
   */
  const connection = Connection.browser();

  connection.start();

  // Le compte, facultatif : la session gardée sur l'appareil se revérifie au passage en ligne.
  const accounts = new AccountClient(connection.baseUrl, scenario ? new LocalAccount(null) : LocalAccount.browser());

  /*
   * `?play=CODE` : l'ami joue dans la partie de l'hôte. Son monde est l'image
   * que l'hôte lui envoie, rejouée tick par tick (`net/lockstep.ts`) ; rien
   * n'en est sauvegardé ici — sa propre partie, son jardin, sa collection
   * restent intacts, il les retrouve à l'écran titre.
   */
  const playCode = scenario ? null : playCodeOf(window.location.search);
  const guest = playCode === null ? null : await joinAsGuest(playCode, connection, accounts, mount);

  if (playCode !== null && !guest) return;

  const sandbox = scenario !== null || guest !== null;

  // Une partie sauvegardée reprend là où elle s'était arrêtée ; sinon, une carte neuve.
  const saves = sandbox ? new LocalSave(null) : LocalSave.browser();
  const loaded = saves.load();
  // Cet onglet prend la main sur la sauvegarde ; un onglet plus ancien cesse d'y écrire (`TabLock`).
  const tabs = sandbox ? new TabLock(null) : TabLock.browser();

  tabs.claim();
  const world = guest
    ? guest.world
    : scenario
      ? stageScenario(TEST_SCENARIOS[scenario])
      : loaded.status === 'ok'
        ? loaded.world
        : World.newColony(readSeed());

  // L'ami d'une partie à deux sauvegardée n'est plus là : son sac reste au sol, où il l'a laissé.
  if (!guest && world.partner) world.push({ type: 'partnerLeave' });

  // Le joystick repart au repos : un doigt posé au moment où l'onglet s'est fermé ne fait plus marcher Adam.
  if (loaded.status === 'ok') world.push({ type: 'setMoveAxis', x: 0, y: 0 });
  // La ville a vécu pendant que le jeu était fermé : elle rattrape ce temps au premier tick, borné au plafond.
  if (loaded.status === 'ok') world.push({ type: 'catchUp', awayMs: awayMs(loaded.savedAt, Date.now()) });

  const accountPanel = new AccountPanel(accounts, connection);

  connection.subscribe((state) => {
    if (state === 'online') void accounts.refresh();
  });

  // Héberger sa partie et inviter un ami ; ou, par un lien d'invitation (`?join=`), rejoindre celle d'un ami.
  const parties = new PartyClient(accounts);
  /*
   * L'hôte : dès que son invitation est ouverte, il s'annonce au serveur et
   * l'ami qui entre reçoit la partie (`HostSession`) ; elle continue de se
   * sauvegarder ici, comme en solo.
   */
  let hosting: HostSession | null = null;
  /*
   * Le vocal (`net/voice.ts`) : seulement dans une partie à deux, jamais en solo
   * ni hors ligne — sans session, il n'y a pas de `VoiceChat`, et le micro
   * n'est demandé qu'au clic « Rejoindre le vocal ». Le bouton prend la place
   * de « Inviter un ami » quand l'ami est là.
   */
  const voicePanel = new VoicePanel(
    (message, tone) => hud.notify(message, tone),
    (state) => {
      pause.setVoice(state);
      hud.inviteButton.hidden = state !== 'hidden';
    },
  );
  const attachVoice = (session: HostSession | GuestSession): void => {
    const id = accounts.user?.id;

    if (id === undefined) return;

    const chat = new VoiceChat(id, new BrowserVoiceEnv(), (data, to) => session.sendVoice(data, to));

    session.voice = chat;
    voicePanel.bind(chat);
  };
  const hostParty = (code: string | null): void => {
    if (guest || hosting?.code === code) return;
    hosting?.stop();
    hosting = null;
    voicePanel.bind(null);
    voicePanel.setPartner(false);

    const token = accounts.token;

    if (code === null || connection.baseUrl === null || token === null) return;

    const session = new HostSession(world, connection.baseUrl, code, token, (event) => {
      if (hosting !== session) return;
      /*
       * L'ami est dans la salle : la fenêtre le dit un instant, puis se retire
       * et la partie reprend — l'hôte, venu de la pause, n'a rien à faire, et
       * l'ami n'attend pas « qu'il reprenne le jeu ».
       */
      if (event.kind === 'guestIn') voicePanel.setPartner(true);
      if (event.kind === 'guestOut') voicePanel.setPartner(false);
      if (event.kind === 'guestIn') {
        setTimeout(() => {
          invitePanel.close();
          if (!document.hidden) setPaused(false);
        }, WELCOME_MS);
        return;
      }
      if (event.kind !== 'ended') return;
      hosting = null;
      voicePanel.bind(null);
      voicePanel.setPartner(false);
      hud.notify(t().party.play.sessionEnded, 'good');
    });

    hosting = session;
    attachVoice(session);
    session.start();
  };
  const invitePanel = new InvitePanel(parties, accounts, connection, () => accountPanel.show(), hostParty);
  const inviteCode = scenario || guest ? null : inviteCodeOf(window.location.search);
  const joinPanel =
    inviteCode === null
      ? null
      : new JoinPanel(
          inviteCode,
          parties,
          accounts,
          connection,
          () => accountPanel.show(),
          () => window.history.replaceState(null, '', withoutInvite(window.location.href)),
          // Dans la salle : l'ami entre dans la partie de l'hôte.
          (code) => window.location.replace(playUrl(window.location.href, code)),
        );

  // Connecté depuis l'écran « Rejoindre » : la fenêtre du compte se retire, l'invitation est là.
  accounts.subscribe((user) => {
    if (user && joinPanel?.open) accountPanel.close();
  });

  const renderer = await GameRenderer.create(world, mount);
  const audio = new AudioEngine();

  // En dev seulement : le monde sous la main dans la console du navigateur,
  // pour provoquer une vague ou une naissance sans attendre trois minutes.
  if (import.meta.env.DEV) Object.assign(window, { adam: { world, audio, connection } });

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
      accumulator = 0;
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
  let shownZoom = renderer.zoomLevel;
  const zoom = new ZoomControls({
    zoomIn: () => (worldMap.open ? worldMap.stepZoom(1) : renderer.stepZoom(1)),
    zoomOut: () => (worldMap.open ? worldMap.stepZoom(-1) : renderer.stepZoom(-1)),
    recenter: () => (worldMap.open ? worldMap.recenter() : renderer.resetZoom()),
  });

  // Une pièce trouvée : un toast, et son bouton « Essayer » ouvre l'habillement sur son emplacement.
  world.events.on('pieceFound', ({ piece }) => {
    hud.notify(t().wardrobe.found(t().pieces[piece]), 'good', {
      label: t().wardrobe.tryOn,
      run: () => {
        if (started && !paused && !settings.open && !world.defeated) inventory.show('wardrobe', PIECES[piece].slot);
      },
    });
  });
  world.events.on('lookRejected', () => hud.notify(t().wardrobe.rejected, 'bad'));
  world.events.on('piecesSpared', ({ prestige }) => hud.notify(t().wardrobe.spare(prestige), 'good'));

  // La rangée du haut à droite : la carte du monde, le zoom, puis Pause et Réglages (en dernier).
  zoom.root.prepend(worldMap.button);
  // Inviter un ami, sans passer par la pause : seulement si le jeu a un serveur, et pas chez l'ami déjà invité.
  if (connection.enabled && !guest) zoom.root.prepend(hud.inviteButton);
  // Le vocal partage cette place : une session à deux seulement (l'ami arrivé, ou chez l'ami lui-même).
  if (connection.enabled) zoom.root.prepend(voicePanel.button);

  zoom.root.append(hud.pauseButton, hud.settingsButton);
  hud.mountControls(zoom.root);
  // Les deux boutons du joueur, en bas à droite : le sac (inventaire et habillement), « Bâtir ».
  hud.actions.append(hud.bag, buildMenu.buildButton);
  hud.root.append(worldMap.root, stick.root, buildMenu.root, panel.root, resources.root, trade.root);
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

  // Le compteur de performances : même principe, caché tant qu'on ne l'a pas demandé.
  const perfPrefs = scenario ? new LocalPerf(null) : LocalPerf.browser();
  const perfSampler = new PerfSampler();
  let perfOn = perfPrefs.load();
  const showPerf = (on: boolean): void => {
    perfOn = on;
    perfPrefs.save(on);
    perfSampler.reset();
    hud.setPerf(on);
    settings.setPerf(on);
  };

  // L'aide « Contrôles manette », ouverte depuis les réglages, par-dessus eux.
  const padHelp = new PadHelp();

  // Les réglages ouverts arrêtent l'horloge, comme la pause, sans en montrer l'écran.
  const settings = new SettingsPanel({
    setLocale: (locale) => {
      setLocale(locale);
      localePrefs.save(locale);
    },
    toggleSound: () => settings.setSound(!audio.toggleMuted()),
    toggleMusic: () => settings.setMusic(audio.toggleMusic()),
    toggleSigns: () => showSigns(!signsOn),
    togglePerf: () => showPerf(!perfOn),
    toggleHaptics: () => showHaptics(!haptics.enabled),
    toggleNotification: (kind) => {
      notifier.setEnabled(kind, !notifier.enabled(kind));
      showNotifications();
    },
    cycleNotificationLimit: () => {
      notifier.cycleLimit();
      showNotifications();
    },
    askNotifications: () => notifyPrompt.show(),
    showPadHelp: () => padHelp.show(),
    togglePadRumble: () => showGamepad({ ...gamepadPrefs, rumble: !gamepadPrefs.rumble }),
    setDeadZone: (deadZone) => showGamepad({ ...gamepadPrefs, deadZone }),
    setSfxVolume: (volume) => audio.setSfxVolume(volume),
    setMusicVolume: (volume) => audio.setMusicVolume(volume),
    onToggle: (open) => {
      accumulator = 0;
      if (open) audio.play('open');
    },
  });

  renderer.setSigns(signsOn);
  settings.setSigns(signsOn);
  hud.setPerf(perfOn);
  settings.setPerf(perfOn);


  // Les vibrations : même principe, et l'interrupteur disparaît là où le navigateur ne sait pas vibrer.
  const hapticPrefs = scenario ? new LocalHaptics(null) : LocalHaptics.browser();
  const showHaptics = (on: boolean): void => {
    haptics.setEnabled(on);
    hapticPrefs.save(on);
    settings.setHaptics(on);
  };

  haptics.setEnabled(hapticPrefs.load());
  settings.setHaptics(haptics.enabled);
  if (!haptics.supported) settings.hideHaptics();
  wireHaptics(world);

  // Le service worker garde le jeu en cache : installable, ouvert sans réseau. Rien en développement.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }

  // Les notifications : demandées après la première recherche lancée, jamais au premier lancement.
  const notifier = new Notifier(
    scenario ? new LocalNotifications(null) : LocalNotifications.browser(),
    browserBackend(`${import.meta.env.BASE_URL}sw.js`),
    () => document.hidden || !document.hasFocus(),
  );
  const showNotifications = (): void =>
    settings.setNotifications(
      notifier.supported
        ? { permission: notifier.permission, kinds: Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, notifier.enabled(kind)])) as Record<NotificationKind, boolean>, limit: notifier.limit }
        : null,
    );
  const notifyPrompt = new NotificationPrompt({
    onAccept: () => void notifier.ask().then(showNotifications),
    onLater: () => {
      notifier.markExplained();
      showNotifications();
    },
    onToggle: (open) => {
      accumulator = 0;
      if (open) audio.play('open');
    },
  });

  hud.root.append(notifyPrompt.root);
  showNotifications();
  wireNotifications(world, notifier, () => {
    if (started && notifier.shouldExplain) notifyPrompt.show();
  });

  const tabPanel = new TabLockPanel(() => {
    tabs.claim();
    window.location.reload();
  });

  hud.root.append(tabPanel.root);
  window.addEventListener('storage', (event) => {
    if (event.key === TAB_KEY && !tabs.held()) tabPanel.show();
  });

  const autosave = wireSave(world, saves, tabs, () => started, {
    lost: () => tabPanel.show(),
    // Une partie de test ou celle d'un autre ne s'écrit nulle part : ce n'est pas un échec.
    failed: () => {
      if (!sandbox) hud.notify(t().hud.toast.saveFailed, 'bad');
    },
  });
  const garden = wireGarden(world, sandbox ? new LocalGarden(null) : LocalGarden.browser());
  const record = wireRecord(world, sandbox ? new LocalRecord(null) : LocalRecord.browser());

  const achievements = wireAchievements(world, sandbox ? new LocalCollection(null) : LocalCollection.browser(), hud, audio);

  // Jouer à deux : chacun voit l'autre arriver et partir.
  world.events.on('partnerJoined', ({ name }) => hud.notify(t().party.play.partnerJoined(name), 'good'));
  world.events.on('partnerLeft', ({ name }) => hud.notify(t().party.play.partnerLeft(name), 'bad'));
  const pause = new PauseScreen(world.seed, () => achievements.collection, () => setPaused(false), () => autosave.restart(), guest ? null : () => invitePanel.show(), () => voicePanel.toggleMembership());
  // Chez l'ami, l'hôte est là d'emblée : le vocal est à portée dès l'arrivée.
  if (guest) {
    attachVoice(guest.session);
    voicePanel.setPartner(true);
  }
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
    accountButton: accountPanel.button('button-secondary title-garden'),
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
  // Une ère atteinte : l'horloge s'arrête sur l'écran du passage, les feuilles tombent, « En avant ! » rend la main.
  world.events.on('eraReached', ({ era }) => {
    celebrating = true;
    hud.rainLeaves();
    eras.showReached(era, () => {
      celebrating = false;
      accumulator = 0;
    });
    window.umami?.track(`ere-${era}`);
  });
  // Refonder : les graines de la colonie au jardin, la partie effacée, puis une carte neuve.
  let refounding = false;

  hud.setOnRefound(() => {
    if (refounding) return;
    refounding = true;
    garden.bank();
    autosave.refound();
  });
  hud.setOnContinue(() => {
    celebrating = false;
    accumulator = 0;
  });

  // Le récap « Pendant votre absence » : ouvert, il arrête l'horloge ; « Récupérer » rend la main.
  const recap = new OfflineRecap(
    () => hud.townBanner,
    () => {
      accumulator = 0;
    },
  );

  world.events.on('offlineCaughtUp', (report) => {
    buildMenu.close();
    panel.close();
    inventory.close();
    resources.close();
    trade.close();
    recap.show(report);
    audio.play('open');
  });
  hud.root.append(recap.root);

  // Les faveurs de l'aube : la capsule du HUD ouvre les cartes ; ouvertes, elles arrêtent l'horloge.
  const boons = new BoonPanel(world, (boon) => {
    accumulator = 0;
    hud.notify(t().hud.boon.chosen(t().boons[boon].label), 'good');
  });

  hud.onBoonOpen = () => {
    buildMenu.close();
    panel.close();
    boons.show();
    audio.play('open');
  };
  world.events.on('starfallAnnounced', () => hud.notify(t().hud.starfall, 'good'));
  world.events.on('challengeCompleted', ({ id, prestige, streak }) => hud.notify(t().hud.daily.done(t().challenges[id], prestige, streak), 'good'));
  world.events.on('boonOffered', () => hud.notify(t().hud.boon.ready, 'good', { label: t().hud.boon.see, run: () => hud.onBoonOpen() }));
  hud.root.append(boons.root);

  hud.pauseButton.addEventListener('click', () => setPaused(!paused));
  hud.inviteButton.addEventListener('click', () => invitePanel.show());
  hud.settingsButton.addEventListener('click', () => settings.toggle());
  hud.root.append(pause.root);

  if (scenario) {
    started = true;
    hud.root.dataset['started'] = 'true';
    // En tête du HUD : tout ce qui vient après (menu, fenêtres, voiles) passe par-dessus.
    hud.root.prepend(testBanner(scenario));
  } else if (guest) {
    // L'ami arrive dans une partie qui tourne : pas d'écran titre. Son écran de connexion passe dans le HUD.
    started = true;
    hud.root.dataset['started'] = 'true';
    hud.root.append(guest.screen.root);
  } else {
    hud.root.append(title.root);
  }
  hud.root.append(inventory.root);
  hud.root.append(eras.root, eras.screen);
  // Par-dessus tout, écran titre compris : la langue se choisit avant même de jouer.
  settings.addAccountButton(accountPanel.button('button-secondary settings-toggle'));
  hud.root.append(voicePanel.strip, voicePanel.root, settings.root, invitePanel.root, ...(joinPanel ? [joinPanel.root] : []), accountPanel.root, padHelp.root);
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

      const canOpen = started && !paused && !settings.open && !inventory.open && !world.defeated && !worldMap.open;

      if (buildMenu.handleKey(event.code, event.repeat, canOpen)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );

  // Onglet caché, appel entrant, écran verrouillé : la partie s'arrête d'elle-même,
  // et elle est écrite tout de suite — sur mobile, un onglet caché peut être tué sans prévenir.
  // Revenu d'un long arrière-plan sans que la page ait été rechargée, la ville rattrape ce temps comme à la réouverture.
  let hiddenAt = 0;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Un autre onglet a joué pendant ce temps : rattraper l'absence sur un état dépassé l'écraserait.
      if (!tabs.held()) tabPanel.show();
      else if (started && !scenario && hiddenAt > 0) {
        world.push({ type: 'catchUp', awayMs: awayMs(hiddenAt, Date.now()) });
        // La pause garde le rattrapage en attente : d'ici là, la sauvegarde de fermeture ne doit pas dater la partie d'aujourd'hui.
        autosave.hold();
      }
      hiddenAt = 0;
      return;
    }
    hiddenAt = Date.now();
    setPaused(true);
    autosave.now();
  });
  window.addEventListener('pagehide', () => autosave.now());
  /*
   * Les raccourcis du jeu (`input/shortcuts.ts`) : P, Échap, I, M, ². Le menu
   * de construction a pris les siens avant. La manette passe par la même
   * table : ○ / B est Échap, Options la pause, △ / Y le sac, View la carte.
   */
  function runShortcut(shortcut: Shortcut | null, field: HTMLElement | null = null): void {
    if (shortcut === 'pause' && !settings.open) setPaused(!paused);
    // Échap ferme d'abord ce qui est au premier plan ; la pause, si rien ne l'est.
    if (shortcut === 'escape') {
      // Le champ qui avait le clavier le rend : les touches suivantes reviennent au jeu.
      field?.blur();

      if (notifyPrompt.open) notifyPrompt.dismiss();
      // La fenêtre du compte est par-dessus les réglages (ou l'écran titre) : elle se ferme la première.
      if (accountPanel.open) {
        accountPanel.close();
        return;
      }
      if (voicePanel.open) {
        voicePanel.close();
        return;
      }
      // L'invitation, par-dessus la pause : elle se ferme avant elle ; l'écran « Rejoindre », lui, ramène au titre.
      if (invitePanel.open) {
        invitePanel.close();
        return;
      }
      if (joinPanel?.open) {
        joinPanel.dismiss();
        return;
      }
      // Les cartes de l'aube : « Plus tard ».
      if (boons.open) {
        boons.close();
        return;
      }
      // L'aide de la manette est par-dessus les réglages : elle se ferme la première.
      if (padHelp.open) {
        padHelp.close();
        return;
      }

      const action = escapeAction({
        settingsOpen: settings.open || notifyPrompt.open,
        bagOpen: inventory.open,
        paused,
        mapOpen: worldMap.open,
        menuOpen: buildMenu.isOpen,
        panelOpen: panel.open || trade.open || eras.open,
        resourcesOpen: resources.open,
      });

      if (action === 'closeSettings') settings.close();
      else if (action === 'closeBag') inventory.close();
      else if (action === 'closeMap') worldMap.close();
      else if (action === 'closeMenu') buildMenu.close();
      else if (action === 'closePanel') {
        panel.close();
        trade.close();
        eras.hide();
      }
      else if (action === 'closeResources') resources.close();
      else setPaused(action === 'pause');
    }
    if (shortcut === 'inventory' && started && !paused && !settings.open && !worldMap.open) inventory.toggle();
    if (shortcut === 'map') {
      if (worldMap.open) worldMap.close();
      else if (started && !paused && !settings.open && !inventory.open && !world.defeated) worldMap.show();
    }
    if (shortcut === 'mic') voicePanel.toggleMic();
    if (shortcut === 'debug' && import.meta.env.DEV) hud.toggleDebug();
  }

  window.addEventListener('keydown', (event) => {
    const typing = isTyping(event.target);
    const { code, key, repeat, ctrlKey, metaKey, altKey } = event;

    runShortcut(shortcutOf({ code, key, repeat, ctrlKey, metaKey, altKey, typing }), typing && event.target instanceof HTMLElement ? event.target : null);
    // Débogage : F lève ou rabat le brouillard de guerre — en dev, panneau de debug ouvert.
    if (event.code === 'KeyF' && import.meta.env.DEV && hud.debugOn && !isTyping(event.target)) {
      world.push({ type: 'setFog', enabled: !world.fog.enabled });
    }
  });

  /*
   * La manette (`ui/gamepadControls.ts`) : le stick gauche fait marcher Adam,
   * le droit promène un curseur qui clique comme une souris, les boutons
   * reprennent les raccourcis du clavier. Débranchée en pleine partie : pause.
   */
  const canOpenMenu = (): boolean => started && !paused && !settings.open && !inventory.open && !world.defeated && !worldMap.open;
  const pad = new GamepadControls({
    canvas: renderer.canvas,
    canvasHand: (x, y) => placement.mode === 'idle' && (renderer.homeIndicatorAt(x, y) || inspect.hovers({ id: PAD_POINTER_ID, x, y, mouse: true })),
    back: () => {
      // Comme Échap : le menu de construction d'abord (il annule aussi un placement), puis le reste.
      if (!buildMenu.handleKey('Escape', false, canOpenMenu())) runShortcut('escape', document.activeElement instanceof HTMLElement ? document.activeElement : null);
    },
    pause: () => {
      if (settings.open) settings.close();
      else runShortcut('pause');
    },
    inventory: () => runShortcut('inventory'),
    build: () => buildMenu.handleKey('Space', false, canOpenMenu()),
    map: () => runShortcut('map'),
    mic: () => runShortcut('mic'),
    zoomStep: (direction) => (worldMap.open ? worldMap.stepZoom(direction) : renderer.stepZoom(direction)),
    zoomBy: (factor) => {
      if (!worldMap.open) renderer.zoomBy(factor, null, true);
    },
    recenter: () => (worldMap.open ? worldMap.recenter() : renderer.resetZoom()),
    connected: (info) => {
      hud.notify(t().gamepad.connected(t().gamepad.kinds[info.kind]), 'good');
      padHelp.setPad(info.kind, info.id);
    },
    disconnected: () => {
      setPaused(true);
      hud.notify(t().gamepad.disconnected, 'bad');
      padHelp.setPad(null, null);
    },
    modeChanged: (mode, kind) => {
      document.documentElement.dataset['input'] = mode;
      padHints.setKind(kind);
    },
  });
  const padPrefs = scenario ? new LocalGamepad(null) : LocalGamepad.browser();
  let gamepadPrefs = padPrefs.load();
  const showGamepad = (prefs: GamepadPrefs): void => {
    gamepadPrefs = prefs;
    padPrefs.save(prefs);
    pad.setPrefs(prefs);
    settings.setGamepad(prefs.rumble, prefs.deadZone);
  };

  pad.setPrefs(gamepadPrefs);
  settings.setGamepad(gamepadPrefs.rumble, gamepadPrefs.deadZone);
  document.body.append(pad.cursor.root);
  // En dev : la manette aussi sous la main dans la console, pour poser son curseur sans stick.
  if (import.meta.env.DEV) Object.assign(window, { adam: { world, audio, pad, connection, hud, renderer } });
  wireRumble(world, pad);

  // Les étiquettes de la manette sur le sac (△ / Y) et « Bâtir » (□ / X) : visibles seulement en mode manette.
  const padHints = new PadHints([
    [hud.bag, 'north'],
    [buildMenu.buildButton, 'west'],
  ]);

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
  if (scenario && (TEST_SCENARIOS[scenario] as TestScenarioProto).wardrobe?.open) inventory.show('wardrobe');
  let lastAxisX = 0;
  let lastAxisY = 0;

  renderer.app.ticker.add((ticker) => {
    const running = started && !paused && !settings.open && !notifyPrompt.open && !tabPanel.open && !inventory.dressing && !recap.open && !boons.open;

    // La manette se lit une fois par frame, avant les ticks : l'axe de marche est frais.
    pad.update(ticker.deltaMS, performance.now(), !worldMap.open);
    if (pad.padMode) padHints.update();

    if (guest) {
      // L'ami ne fait pas autorité : sa partie avance au rythme des pas de l'hôte, pause et écrans compris.
      pushAxisIfChanged();
      guest.session.sync?.advance(ticker.deltaMS);
      accumulator = (guest.session.sync?.alpha ?? 0) * STEP_MS;
    } else if (running && !celebrating) {
      // Une nuit calme que le joueur fait passer : plus de ticks par image, la simulation n'en sait rien.
      accumulator += Math.min(ticker.deltaMS, MAX_FRAME_MS) * (hud.hastening && world.calmNight() ? HASTEN.speed : 1);
    }

    while (!guest && accumulator >= STEP_MS && !celebrating) {
      pushAxisIfChanged();
      const tickStart = perfOn ? performance.now() : 0;

      world.tick();
      if (perfOn) perfSampler.tick(performance.now() - tickStart, world.wakesLastTick());
      hosting?.afterTick();
      accumulator -= STEP_MS;
    }
    if (running) autosave.update(ticker.deltaMS);
    // Une fois par seconde de jeu : les succès dont la condition vient d'être remplie.
    if (running && world.tickCount % TICKS_PER_SECOND === 0 && world.tickCount !== achievements.checkedAt) achievements.update();

    // La carte du monde couvre l'écran : la scène du jeu ne se dessine plus, la carte si.
    renderer.setHidden(worldMap.open);
    if (hud.root.dataset['map'] !== String(worldMap.open)) hud.root.dataset['map'] = String(worldMap.open);
    worldMap.update(ticker.deltaMS);

    renderer.draw(accumulator / STEP_MS, placement.armedBuilding(), placement.ghost);
    if (perfOn) {
      const reading = perfSampler.frame(ticker.deltaMS);

      if (reading) hud.showPerf(reading);
    }
    hud.update(ticker.FPS, renderer.bakedChunks, renderer.atlasStats, renderer.waterStats, renderer.weatherParticles);

    // Lire la mise en page force un reflow : une fois tous les dix cadres suffit.
    if (++frame % 10 === 0) {
      renderer.setHudInsets(hud.topInset(), bottomInset(), [
        ...hud.obstacles(),
        stick.root.getBoundingClientRect(),
        zoom.root.getBoundingClientRect(),
      ]);
      if (renderer.zoomLevel !== shownZoom) {
        shownZoom = renderer.zoomLevel;
        zoomPrefs.save(shownZoom);
      }
    }
    zoom.update(worldMap.open ? worldMap.zoomLimits : renderer.zoomLimits);
    renderer.setObjective(hud.pointedItem());
    renderer.setSelected(panel.selection);
    buildMenu.refresh();
    panel.update();
    eras.update();
    inventory.update();
    resources.update();
    trade.update();
    // Un menu, une fenêtre ou la pause par-dessus : le joystick s'efface et
    // lâche son doigt ; il revient à la fermeture.
    stick.setEnabled(
      running && !world.defeated && !buildMenu.isOpen && !panel.open && !eras.open && !inventory.open && !resources.open && !trade.open && !worldMap.open,
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

    for (const node of [...buildMenu.bottomParts, panel.root, resources.root, trade.root]) {
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
    const stickAxis = pad.axis;
    const padAxis = { active: stickAxis.x !== 0 || stickAxis.y !== 0, axisX: stickAxis.x, axisY: stickAxis.y };
    const { axisX, axisY } = joystick.state.active ? joystick.state : padAxis.active ? padAxis : keys;

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

  // Un « tic » sous chaque bouton de l'interface (pas sur la carte, qui a ses propres sons).
  document.addEventListener(
    'pointerdown',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;

      if (button && !button.disabled) audio.play('tap');
    },
    { capture: true },
  );

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
  world.events.on('boonChosen', () => audio.play('eureka'));
  world.events.on('starFell', () => audio.play('pickup'));
  world.events.on('challengeCompleted', () => audio.play('objective'));
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
  world.events.on('regionConquered', () => audio.play('objective'));
  world.events.on('levelUp', () => audio.play('objective'));
  world.events.on('gearCrafted', () => audio.play('upgrade'));
  world.events.on('companionTraining', () => audio.play('upgrade'));
  world.events.on('companionJoined', () => audio.play('objective'));
  world.events.on('companionDied', () => audio.play('deny'));
  world.events.on('recruitRejected', () => audio.play('deny'));
  world.events.on('companionHealed', () => audio.play('pickup'));
  world.events.on('siteCancelled', () => audio.play('deliver'));
  world.events.on('decorRemoved', () => audio.play('pickup'));
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
  world.events.on('discoveryFound', ({ kind }) => {
    if (kind !== 'chest') audio.play(kind === 'ruin' ? 'eureka' : 'pickup');
  });
  world.events.on('childBorn', () => audio.play('baby'));
  world.events.on('eveArrived', () => audio.play('build'));
  world.events.on('traded', () => audio.play('deliver'));
  world.events.on('questCompleted', () => audio.play('build'));
  world.events.on('townHallDestroyed', () => {
    audio.play('defeat');
    audio.night('dawn');
  });
  // Un objectif a son jingle ; le dernier d'un chapitre laisse la fanfare à la fin du chapitre.
  world.events.on('objectiveCompleted', ({ closing }) => {
    if (!closing) audio.play('objective');
  });
  world.events.on('chapterCompleted', () => audio.play('colony'));
  // Une ère atteinte a la fanfare d'une fin d'acte.
  world.events.on('eraReached', () => audio.play('colony'));
  world.events.on('antennaRaised', () => audio.play('build'));
  world.events.on('antennaFell', () => audio.play('alarm'));
  world.events.on('survivorsArrived', () => audio.play('build'));
}

interface Autosave {
  /** À appeler entre deux ticks : écrit la partie si l'intervalle est écoulé ou si un moment clé l'a demandé. */
  update(deltaMs: number): void;
  /** Écrit la partie sur-le-champ — onglet caché, page quittée. */
  now(): void;
  /** Suspend l'écriture jusqu'au prochain tick : une commande poussée (`catchUp`) n'a pas encore agi sur l'état. */
  hold(): void;
  /** Efface la partie et recharge la page sur une carte neuve (ou la seed de l'URL). */
  restart(): void;
  /** Efface la partie et ouvre une carte neuve, quelle que soit la seed de l'adresse. */
  refound(): void;
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
function wireSave(
  world: World,
  saves: LocalSave,
  tabs: TabLock,
  started: () => boolean,
  alerts: {
    /** Un autre onglet a repris la partie : celui-ci n'écrit plus. */
    lost(): void;
    /** L'écriture vient d'échouer (une seule fois, jusqu'à la prochaine réussie). */
    failed(): void;
  },
): Autosave {
  let elapsed = 0;
  let due = false;
  let enabled = true;
  let failing = false;
  let heldAt: number | null = null;

  const write = (): void => {
    elapsed = 0;
    due = false;
    if (!enabled || !started() || world.defeated) return;
    if (!tabs.held()) {
      alerts.lost();
      return;
    }
    // Le tick n'a pas encore consommé la commande en attente : on garde la sauvegarde d'avant, qui date de l'absence.
    if (heldAt === world.tickCount) return;
    heldAt = null;

    const saved = saves.save(world);

    if (!saved && !failing) alerts.failed();
    failing = !saved;
  };

  world.events.on('buildingCompleted', () => {
    due = true;
  });
  world.events.on('decorRemoved', () => {
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
  world.events.on('chapterCompleted', () => {
    due = true;
  });
  world.events.on('eraReached', () => {
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
  // Le temps rattrapé hors ligne est acquis : il s'écrit, pour ne pas le rattraper deux fois.
  world.events.on('offlineCaughtUp', () => {
    due = true;
  });
  world.events.on('townHallDestroyed', () => saves.clear());

  return {
    update(deltaMs) {
      elapsed += deltaMs;
      if (due || elapsed >= AUTOSAVE_MS) write();
    },
    now: write,
    hold() {
      heldAt = world.tickCount;
    },
    restart() {
      // Plus rien ne s'écrit : le `pagehide` du rechargement ressusciterait la partie effacée.
      enabled = false;
      saves.clear();
      window.umami?.track('partie-recommencee');
      window.location.reload();
    },
    refound() {
      enabled = false;
      saves.clear();
      window.umami?.track('colonie-refondee');
      window.location.assign(mapUrl(window.location.href, null));
    },
  };
}

interface GardenWiring {
  current(): Garden;
  plant(perk: PerkId): Garden;
  setPure(pure: boolean): Garden;
  /** Verse au jardin les graines de la colonie en cours (refondation après le Signal). */
  bank(): Garden;
}

/**
 * Le jardin des souvenirs : les graines de la colonie tombée y entrent à la
 * chute de la mairie, une seule fois — la partie perdue est effacée juste
 * après, elle ne retombera pas. Une colonie qui a envoyé le Signal verse
 * les siennes en en fondant une nouvelle (`bank`). Chaque changement est écrit tout de suite,
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
    bank: () => keep(harvestSeeds(garden, seedsFor(world.colonyScore()))),
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

/** Le téléphone vibre aux moments clés : un bâtiment fini, une recherche, un objectif, une naissance. */
/**
 * Les événements qui valent une notification — la politique (type permis,
 * plafond du jour, fenêtre en retrait) est celle du `Notifier`. Les vivres se
 * surveillent à part : `needAlert` n'est pas un événement, on regarde chaque
 * seconde et on ne prévient qu'au passage de « tout va bien » à « ça manque ».
 */
function wireNotifications(world: World, notifier: Notifier, onResearchStarted: () => void): void {
  world.events.on('researchStarted', onResearchStarted);
  world.events.on('researchCompleted', ({ research }) =>
    notifier.notify('research', { title: t().notifications.research.title, body: t().notifications.research.body(t().research[research].label) }),
  );
  world.events.on('childBorn', ({ name }) =>
    notifier.notify('child', { title: t().notifications.child.title, body: t().notifications.child.body(name) }),
  );

  // Une vague s'annonce 2:30 avant (`waveAnnounced`), puis en trois temps (3, 2, 1 s) : une seule notification par vague,
  // au premier des deux. Pas de vague hors ligne : onglet caché, le jeu est en pause.
  let announced = '';

  world.events.on('waveAnnounced', ({ night, ticks, count, from }) => {
    const clock = world.clock();

    announced = `${night}:${clock ? nextWave(clock).wave : 0}`;
    notifier.notify('attack', {
      title: t().hud.wave.notifyTitle,
      body: t().hud.wave.announced(clockText(Math.ceil(ticks / TICKS_PER_SECOND)), count, t().hud.from[from]),
    });
  });
  world.events.on('waveCountdown', ({ night, wave, count }) => {
    const key = `${night}:${wave}`;

    if (key === announced) return;
    announced = key;
    notifier.notify('attack', { title: t().notifications.attack.title, body: t().notifications.attack.body(night, count) });
  });

  let short = false;

  window.setInterval(() => {
    const alert = world.needAlert();

    if (alert && !short) {
      const text = t().notifications.supplies;

      notifier.notify('supplies', { title: alert.item === 'water' ? text.waterTitle : text.foodTitle, body: text.body(alert.minutes) });
    }
    short = alert !== null;
  }, 1000);
}

function wireHaptics(world: World): void {
  world.events.on('resourceHarvested', () => haptics.pulse('tick'));
  world.events.on('buildingPlaced', () => haptics.pulse('place'));
  world.events.on('waveAnnounced', () => haptics.pulse('wave'));
  world.events.on('duskFell', () => haptics.pulse('wave'));
  world.events.on('buildingCompleted', () => haptics.pulse('done'));
  world.events.on('buildingUpgraded', () => haptics.pulse('done'));
  world.events.on('childBorn', () => haptics.pulse('done'));
  world.events.on('researchCompleted', () => haptics.pulse('win'));
  world.events.on('chapterCompleted', () => haptics.pulse('win'));
  world.events.on('levelUp', () => haptics.pulse('win'));
}

/** La manette vibre, légèrement, à quelques moments clés : réglage « Vibrations de la manette ». */
function wireRumble(world: World, pad: GamepadControls): void {
  world.events.on('buildingCompleted', () => pad.rumble('done'));
  world.events.on('objectiveCompleted', () => pad.rumble('done'));
  world.events.on('levelUp', () => pad.rumble('done'));
  world.events.on('playerHurt', () => pad.rumble('hurt'));
  world.events.on('waveStarted', () => pad.rumble('alarm'));
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
  // Une étoile filante touche le sol : une gerbe dorée, et son anneau.
  world.events.on('starFell', ({ x, y }) => {
    particles.ring(x, y);
    particles.burst(x, y - 6, PARTICLES.star, 16, 0.14);
  });
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
  // Une recherche aboutit : confettis et étoiles jaillissent du toit du labo.
  world.events.on('researchCompleted', ({ id }) => {
    const lab = world.entities.get(id);

    if (!lab) return;
    for (let i = 0; i <= lab.width; i += 1) {
      particles.burst((lab.tx + i) * TILE_SIZE, lab.ty * TILE_SIZE, PARTICLES.confetti, 6, 0.16);
    }
    particles.burst((lab.tx + lab.width / 2) * TILE_SIZE, lab.ty * TILE_SIZE, PARTICLES.star, 8, 0.12);
  });
  // Un enfant naît : une gerbe légère devant la nurserie.
  world.events.on('childBorn', ({ x, y }) => {
    particles.burst(x, y - 12, PARTICLES.confetti, 10, 0.14);
    particles.burst(x, y - 12, PARTICLES.star, 4, 0.1);
  });
  // Un nouveau type de bâtiment entre au menu : quelques confettis autour d'Adam.
  world.events.on('buildingsUnlocked', () => particles.burst(world.player.x, world.player.y - 16, PARTICLES.confetti, 10, 0.15));
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
  // Une région conquise : confettis et étoiles là où son gardien est tombé.
  world.events.on('regionConquered', ({ x, y }) => {
    particles.burst(x, y - 16, PARTICLES.confetti, 18, 0.18);
    particles.burst(x, y - 16, PARTICLES.star, 8, 0.12);
  });
  // Une ruine fouillée, un secret trouvé : même gerbe qu'un coffre (le coffre a la sienne, plus haut).
  world.events.on('discoveryFound', ({ kind, x, y }) => {
    if (kind === 'chest') return;
    particles.burst(x, y - 10, PARTICLES.confetti, 12, 0.14);
    particles.burst(x, y - 10, PARTICLES.star, 5, 0.1);
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
  world.events.on('decorRemoved', ({ tx, ty }) => particles.burst((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, PARTICLES.rubble, 5, 0.06));
  world.events.on('siteCancelled', ({ tx, ty }) => particles.burst((tx + 1) * TILE_SIZE, (ty + 1) * TILE_SIZE, PARTICLES.rubble, 8, 0.08));
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
/** Les recalages d'affilée sur une image neuve avant de renoncer : au-delà, les deux jeux ne s'accordent pas. */
const MAX_RESYNCS = 3;
/** Une connexion perdue en jeu : la page se rouvre dans la partie après ce délai. */
const RECONNECT_MS = 2000;
/** Le temps de jeu après lequel les recalages passés sont oubliés. */
const RESYNC_FORGET_MS = 30_000;

/** L'ami entré, la fenêtre d'invitation le montre ce temps-là avant de rendre la partie à l'hôte. */
const WELCOME_MS = 1500;

/**
 * L'ami entre dans la partie de l'hôte : l'écran de connexion d'abord, puis,
 * l'image de l'hôte arrivée, son monde. `null` : il n'entrera pas — l'écran
 * dit pourquoi et rend la main à l'écran titre. Ensuite, l'écran revient si
 * l'hôte part, si la session se ferme ; la connexion perdue ou une
 * divergence rouvrent la page, qui se reconnecte et reçoit une image neuve.
 */
function joinAsGuest(
  code: string,
  connection: Connection,
  accounts: AccountClient,
  mount: HTMLElement,
): Promise<{ world: World; session: GuestSession; screen: PlayScreen } | null> {
  const reopen = (resync = 0): void => window.location.replace(playUrl(window.location.href, code, resync));
  const screen = new PlayScreen(
    () => reopen(),
    () => window.location.replace(titleUrl(window.location.href)),
  );

  mount.append(screen.root);

  const token = accounts.token;

  if (connection.baseUrl === null || token === null) {
    screen.show({ kind: 'failed', reason: connection.baseUrl === null ? 'offline' : 'signedOut' });
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let playing = false;
    const session = new GuestSession(connection.baseUrl!, code, token, (status: GuestStatus) => {
      switch (status.kind) {
        case 'connecting':
        case 'waiting':
          screen.show(status.kind === 'waiting' ? { kind: 'waiting', host: status.host, hostOnline: status.hostOnline } : status);
          break;
        case 'playing':
          playing = true;
          screen.show(null);
          setTimeout(() => {
            if (resyncsOf(window.location.search) > 0) window.history.replaceState(null, '', playUrl(window.location.href, code));
          }, RESYNC_FORGET_MS);
          resolve({ world: status.world, session, screen });
          break;
        case 'hostLeft':
          screen.show({ kind: 'hostLeft', host: status.host });
          break;
        case 'hostBack':
          reopen();
          break;
        case 'ended':
          screen.show({ kind: 'ended' });
          if (!playing) resolve(null);
          break;
        case 'lost':
          if (!playing) {
            screen.show({ kind: 'failed', reason: 'offline' });
            resolve(null);
            break;
          }
          screen.show({ kind: 'lost' });
          setTimeout(() => reopen(), RECONNECT_MS);
          break;
        case 'failed':
          screen.show({ kind: 'failed', reason: status.reason });
          if (!playing) resolve(null);
          break;
        case 'desync': {
          const done = resyncsOf(window.location.search);

          session.stop();
          if (done >= MAX_RESYNCS) {
            screen.show({ kind: 'failed', reason: 'desync' });
            break;
          }
          screen.show({ kind: 'resync' });
          reopen(done + 1);
          break;
        }
      }
    });

    session.start();
  });
}

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
