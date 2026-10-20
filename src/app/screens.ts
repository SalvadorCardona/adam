/**
 * Les écrans qui encadrent la partie : l'écran titre, la pause, l'onglet
 * dépassé — et ce qui décide que l'horloge tourne : la partie lancée, la
 * pause, l'onglet caché. Avec eux, ce qui s'écrit sur l'appareil.
 */
import type { AudioEngine } from '../audio/engine.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { loadLocale, locale, t } from '../i18n/locale.ts';
import { submitDailyScore } from '../net/dailyBoard.ts';
import { earnedSkins } from '../sim/collection.ts';
import { dailyDate, dailyGame } from '../sim/daily.ts';
import { activePerks } from '../sim/garden.ts';
import { awayMs } from '../sim/offline.ts';
import { LocalCollection } from '../storage/localCollection.ts';
import { LocalDaily } from '../storage/localDaily.ts';
import { LocalGarden } from '../storage/localGarden.ts';
import { LocalPlayed } from '../storage/localPlayed.ts';
import { LocalRecord } from '../storage/localRecord.ts';
import type { LoadResult } from '../storage/localSave.ts';
import { TAB_KEY } from '../storage/localTab.ts';
import { dailyUrl } from '../ui/dailyMap.ts';
import type { Disposer } from '../ui/disposer.ts';
import type { Hud } from '../ui/hud.ts';
import { preloadWhenIdle } from '../ui/idleLoad.ts';
import { PauseScreen, TitleScreen } from '../ui/screens.ts';
import type { SettingsPanel } from '../ui/settingsPanel.ts';
import { TabLockPanel } from '../ui/tabLockPanel.ts';
import { linkNotice, type Boot } from './boot.ts';
import type { GameLoop, PlayFlags } from './gameLoop.ts';
import type { Party } from './party.ts';
import { wireAchievements, wireDaily, wireGarden, wireRecord, wireSave } from './persistence.ts';

/** Ce que l'écran titre dit, discrètement, d'une sauvegarde qu'il n'a pas pu reprendre. */
const LOAD_NOTICES: Partial<Record<LoadResult['status'], () => string>> = {
  version: () => t().screens.title.oldSave,
  corrupt: () => t().screens.title.corruptSave,
};

export type Screens = ReturnType<typeof wireScreens>;

export function wireScreens(
  life: Disposer,
  boot: Boot,
  hud: Hud,
  renderer: GameRenderer,
  audio: AudioEngine,
  loop: GameLoop,
  flags: PlayFlags,
  party: Party,
  settings: SettingsPanel,
) {
  const { world, scenario, guest, sandbox, connection, accounts, saves, loaded, tabs } = boot;

  const tabPanel = new TabLockPanel(() => {
    tabs.claim();
    window.location.reload();
  });

  life.listen(window, 'storage', (event) => {
    if (event.key === TAB_KEY && !tabs.held()) tabPanel.show();
  });

  const autosave = wireSave(life, world, saves, tabs, () => flags.started, {
    lost: () => tabPanel.show(),
    // Une partie de test ou celle d'un autre ne s'écrit nulle part : ce n'est pas un échec.
    failed: () => {
      if (!sandbox) hud.notify(t().hud.toast.saveFailed, 'bad');
    },
  });
  const garden = wireGarden(life, world, sandbox ? new LocalGarden(null) : LocalGarden.browser());
  const record = wireRecord(life, world, sandbox ? new LocalRecord(null) : LocalRecord.browser());
  const today = dailyDate(Date.now());
  const dailies = sandbox ? new LocalDaily(null) : LocalDaily.browser();
  const dailyBest = wireDaily(life, world, dailies, (date, score) => void submitDailyScore(connection.baseUrl, accounts.token, date, score));

  const achievements = wireAchievements(life, world, sandbox ? new LocalCollection(null) : LocalCollection.browser(), hud, audio);

  // Jouer à deux : chacun voit l'autre arriver et partir.
  life.on(world.events, 'partnerJoined', ({ name }) => hud.notify(t().party.play.partnerJoined(name), 'good'));
  life.on(world.events, 'partnerLeft', ({ name }) => hud.notify(t().party.play.partnerLeft(name), 'bad'));
  const pause = new PauseScreen(world.seed, () => achievements.collection, () => setPaused(false), () => autosave.restart(), guest || !connection.enabled ? null : () => party.invitePanel.with((panel) => panel.show()), () => party.voicePanel.toggleMembership(),
    () => settings.show(),
    // L'écran titre : la partie est écrite, la page se recharge sur « Continuer ». Pas de sauvegarde en partie de test ni chez l'ami.
    sandbox ? null : () => {
      autosave.now();
      window.location.reload();
    },
  );
  // Chez l'ami, l'hôte est là d'emblée : le vocal est à portée dès l'arrivée.
  if (guest) {
    void party.attachVoice(guest.session);
    party.voicePanel.setPartner(true);
  }
  // La toute première partie de l'appareil : l'écran titre y rappelle les gestes du jeu.
  const played = sandbox ? new LocalPlayed(null) : LocalPlayed.browser();
  const title = new TitleScreen({
    resume: loaded.status === 'ok',
    summary: loaded.status === 'ok' ? saves.peek() : null,
    firstRun: !played.load(),
    notice: LOAD_NOTICES[loaded.status] ?? linkNotice(world),
    garden: garden.current(),
    gardenActions: garden,
    record,
    daily: {
      date: world.dailyMap?.date ?? today,
      mod: world.dailyMap?.mod ?? dailyGame(today).mod,
      best: dailyBest(world.dailyMap?.date ?? today),
      playing: world.dailyMap !== null,
      open: () => window.location.assign(dailyUrl(window.location.href, world.dailyMap === null ? today : null)),
    },
    collection: () => achievements.collection,
    onPlay: () => {
      // Une nouvelle colonie part avec les bonus du jardin ; une colonie reprise garde les siens. La carte du jour, jamais : même départ pour tous.
      if (loaded.status !== 'ok' && !world.dailyMap) world.push({ type: 'applyPerks', perks: activePerks(garden.current()) });
      // Les compteurs de colonie repartent de zéro ; les skins gagnés l'attendent dans sa garde-robe.
      if (loaded.status !== 'ok') achievements.newRun();
      world.push({ type: 'grantPieces', pieces: earnedSkins(achievements.collection), silent: true });
      flags.started = true;
      played.save();
      hud.root.dataset['started'] = 'true';
      window.umami?.track(loaded.status === 'ok' ? 'partie-reprise' : 'partie-demarree');
      // Les morceaux à la demande arrivent aux temps morts : la langue de l'autre bord, puis, avec un serveur, l'invitation et le jeu à deux.
      preloadWhenIdle([
        () => loadLocale(locale() === 'fr' ? 'en' : 'fr'),
        ...(connection.enabled ? [() => party.invitePanel.warm(), () => import('../net/play.ts'), () => import('../net/voice.ts'), () => import('../net/voiceBrowser.ts')] : []),
      ]);
    },
    onRestart: () => autosave.restart(),
    onSettings: () => settings.show(),
    sound: { play: (name) => audio.play(name), ambience: (dusk) => audio.setAmbience(dusk) },
    accountButton: party.accountPanel.button('button-secondary title-garden'),
    scene: () => renderer.openTitle(),
  });

  function setPaused(value: boolean): void {
    if (!flags.started || world.defeated) return;
    flags.paused = value;
    pause.visible = value;
    loop.reset();
    audio.setPaused(value);
  }

  hud.pauseButton.addEventListener('click', () => setPaused(!flags.paused));
  hud.inviteButton.addEventListener('click', () => party.invitePanel.with((panel) => panel.show()));
  hud.settingsButton.addEventListener('click', () => settings.toggle());

  // La partie de test et celle de l'hôte, chez l'ami, tournent d'emblée : pas d'écran titre.
  if (scenario || guest) {
    flags.started = true;
    hud.root.dataset['started'] = 'true';
  }

  // Onglet caché, appel entrant, écran verrouillé : la partie s'arrête d'elle-même,
  // et elle est écrite tout de suite — sur mobile, un onglet caché peut être tué sans prévenir.
  // Revenu d'un long arrière-plan sans que la page ait été rechargée, la ville rattrape ce temps comme à la réouverture.
  let hiddenAt = 0;

  life.listen(document, 'visibilitychange', () => {
    if (!document.hidden) {
      // Un autre onglet a joué pendant ce temps : rattraper l'absence sur un état dépassé l'écraserait.
      if (!tabs.held()) tabPanel.show();
      else if (flags.started && !scenario && hiddenAt > 0) {
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
  life.listen(window, 'pagehide', () => autosave.now());

  return { setPaused, pause, title, tabPanel, autosave, garden, achievements };
}
