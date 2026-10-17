/**
 * Les réglages : la fenêtre et les préférences de l'appareil qu'elle tient —
 * langue, sons, pancartes, taille de l'interface, contraste, compteur de
 * performances, vibrations, notifications, manette. Aucune n'est de la partie.
 */
import type { AudioEngine } from '../audio/engine.ts';
import { NOTIFICATION_KINDS, type NotificationKind } from '../data/notifications.ts';
import { loadLocale, setLocale } from '../i18n/locale.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { LocalContrast } from '../storage/localContrast.ts';
import { LocalGamepad, type GamepadPrefs } from '../storage/localGamepad.ts';
import { LocalHaptics } from '../storage/localHaptics.ts';
import { LocalNotifications } from '../storage/localNotifications.ts';
import { LocalPerf } from '../storage/localPerf.ts';
import { LocalSigns } from '../storage/localSigns.ts';
import { LocalUiScale, nextUiScale } from '../storage/localUiScale.ts';
import type { Disposer } from '../ui/disposer.ts';
import type { GamepadControls } from '../ui/gamepadControls.ts';
import { haptics } from '../ui/haptics.ts';
import type { Hud } from '../ui/hud.ts';
import { NotificationPrompt } from '../ui/notificationPrompt.ts';
import { Notifier, browserBackend } from '../ui/notifier.ts';
import { PadHelp } from '../ui/padHelp.ts';
import { PerfSampler } from '../ui/perfMeter.ts';
import { SettingsPanel } from '../ui/settingsPanel.ts';
import type { Boot } from './boot.ts';
import type { GameLoop, PlayFlags } from './gameLoop.ts';
import { wireNotifications } from './notifications.ts';

export type Prefs = ReturnType<typeof wirePrefs>;

export function wirePrefs(life: Disposer, boot: Boot, renderer: GameRenderer, audio: AudioEngine, hud: Hud, loop: GameLoop, flags: PlayFlags) {
  const { world, scenario, localePrefs } = boot;

  // Les pancartes des bâtiments : une préférence de l'appareil — la partie de test ne touche à aucun stockage.
  const signPrefs = scenario ? new LocalSigns(null) : LocalSigns.browser();
  let signsOn = signPrefs.load();
  const showSigns = (on: boolean): void => {
    signsOn = on;
    signPrefs.save(on);
    renderer.setSigns(on);
    settings.setSigns(on);
  };

  // La taille de l'interface et le contraste élevé : des variables CSS racine, appliquées à chaud.
  const uiScalePrefs = scenario ? new LocalUiScale(null) : LocalUiScale.browser();
  let uiScale = uiScalePrefs.load();
  const showUiScale = (scale: typeof uiScale): void => {
    uiScale = scale;
    uiScalePrefs.save(scale);
    document.documentElement.style.setProperty('--ui-scale', String(scale / 100));
    settings.setUiScale(scale);
  };
  const contrastPrefs = scenario ? new LocalContrast(null) : LocalContrast.browser();
  let contrastOn = contrastPrefs.load();
  const showContrast = (on: boolean): void => {
    contrastOn = on;
    contrastPrefs.save(on);
    document.documentElement.dataset['contrast'] = on ? 'high' : 'normal';
    settings.setContrast(on);
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
      // L'anglais arrive à la demande : la langue change dès que son dictionnaire est là.
      void loadLocale(locale).then(() => {
        setLocale(locale);
        localePrefs.save(locale);
      });
    },
    toggleSound: () => settings.setSound(!audio.toggleMuted()),
    toggleMusic: () => settings.setMusic(audio.toggleMusic()),
    toggleSigns: () => showSigns(!signsOn),
    cycleUiScale: () => showUiScale(nextUiScale(uiScale)),
    toggleContrast: () => showContrast(!contrastOn),
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
      loop.reset();
      if (open) audio.play('open');
    },
  });

  renderer.setSigns(signsOn);
  settings.setSigns(signsOn);
  showUiScale(uiScale);
  showContrast(contrastOn);
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
      loop.reset();
      if (open) audio.play('open');
    },
  });

  showNotifications();
  wireNotifications(life, world, notifier, () => {
    if (flags.started && notifier.shouldExplain) notifyPrompt.show();
  });

  // La manette arrive après les réglages : ses préférences s'appliquent à son branchement.
  const padPrefs = scenario ? new LocalGamepad(null) : LocalGamepad.browser();
  let gamepadPrefs = padPrefs.load();
  let pad: GamepadControls | null = null;
  const showGamepad = (prefs: GamepadPrefs): void => {
    gamepadPrefs = prefs;
    padPrefs.save(prefs);
    pad?.setPrefs(prefs);
    settings.setGamepad(prefs.rumble, prefs.deadZone);
  };
  const attachPad = (controls: GamepadControls): void => {
    pad = controls;
    pad.setPrefs(gamepadPrefs);
    settings.setGamepad(gamepadPrefs.rumble, gamepadPrefs.deadZone);
  };

  return {
    settings,
    padHelp,
    notifyPrompt,
    attachPad,
    /** Le compteur de performances : allumé, la boucle mesure chaque tick et chaque image. */
    perf: {
      sampler: perfSampler,
      get on(): boolean {
        return perfOn;
      },
    },
  };
}
