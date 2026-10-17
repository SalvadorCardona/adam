/**
 * Les entrées : clavier (menu de construction, raccourcis, Volée), manette,
 * doigts et souris sur la carte (repère de la mairie, inspection, joystick,
 * placement, pinch, molette), et l'axe de marche qu'ils donnent à Adam.
 */
import { t } from '../i18n/locale.ts';
import { TILE_SIZE } from '../core/grid.ts';
import { IndicatorTap } from '../input/indicatorTap.ts';
import { isTyping, type KeyboardState } from '../input/keyboard.ts';
import { PointerRouter } from '../input/pointer.ts';
import { escapeRepeats, shortcutOf, type Shortcut } from '../input/shortcuts.ts';
import { Pinch, bindWheelZoom } from '../input/zoom.ts';
import type { GameRenderer } from '../render/renderer.ts';
import type { World } from '../sim/world.ts';
import type { Disposer } from '../ui/disposer.ts';
import { escapeAction } from '../ui/escape.ts';
import { GamepadControls } from '../ui/gamepadControls.ts';
import { PAD_POINTER_ID } from '../ui/padCursor.ts';
import { PadHints } from '../ui/padHints.ts';
import type { PlayFlags } from './gameLoop.ts';
import type { Overlays } from './overlays.ts';
import type { Party } from './party.ts';
import type { Prefs } from './prefs.ts';
import type { Ui } from './ui.ts';

/** Seuil sous lequel un mouvement d'axe ne vaut pas une commande. */
const AXIS_EPSILON = 0.01;

/** L'axe d'un clavier au repos : ce que lit le déplacement quand le menu de construction a le clavier. */
const STILL: KeyboardState = { active: false, axisX: 0, axisY: 0 };

export type Input = ReturnType<typeof wireInput>;

export function wireInput(
  life: Disposer,
  world: World,
  renderer: GameRenderer,
  ui: Ui,
  prefs: Prefs,
  party: Party,
  overlays: Overlays,
  flags: PlayFlags,
  setPaused: (paused: boolean) => void,
) {
  const { hud, joystick, keyboard, stick, placement, buildMenu, panel, inventory, resources, trade, eras, inspect, worldMap } = ui;
  const { settings, notifyPrompt, padHelp } = prefs;
  const { accountPanel, voicePanel, invitePanel, joinPanel } = party;
  const { boons, talents } = overlays;

  /**
   * La nuit, Espace et □ lancent la Volée plutôt que d'ouvrir le tiroir de
   * construction ; tiroir ouvert ou placement en cours, ils gardent leur rôle.
   * Une touche tenue ne relance rien : la recharge, de toute façon.
   */
  const castVolley = (canOpen: boolean): boolean => {
    if (!canOpen || buildMenu.isOpen || placement.mode !== 'idle' || !world.skillOn()) return false;
    world.push({ type: 'castSkill', dx: 0, dy: 0 });
    return true;
  };

  /*
   * Le menu de construction au clavier : Espace, flèches, Entrée, Échap.
   * Écouté en phase de capture, donc avant les autres écouteurs de `window` :
   * une touche que le menu prend ne fait ni marcher Adam ni basculer la pause.
   */
  life.listen(
    window,
    'keydown',
    (event) => {
      // Ctrl, Alt ou Cmd : un raccourci du navigateur ou du système, pas du menu.
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

      const canOpen = flags.started && !flags.paused && !settings.open && !inventory.open && !world.defeated && !worldMap.open;

      if (event.code === 'Space' && castVolley(canOpen)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (buildMenu.handleKey(event.code, event.repeat, canOpen)) {
        if (event.code === 'Escape') escapeClosedAt = performance.now();
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );

  /*
   * Les raccourcis du jeu (`input/shortcuts.ts`) : P, Échap, I, M, ². Le menu
   * de construction a pris les siens avant. La manette passe par la même
   * table : ○ / B est Échap, Options la pause, △ / Y le sac, View la carte.
   */
  let escapeClosedAt: number | null = null;

  function runShortcut(shortcut: Shortcut | null, field: HTMLElement | null = null): void {
    if (shortcut === 'pause' && !settings.open) setPaused(!flags.paused);
    // Échap ferme d'abord ce qui est au premier plan ; la pause, si rien ne l'est.
    if (shortcut === 'escape') {
      const before = escapeClosedAt;
      const now = performance.now();

      // Tout ce qui suit ferme quelque chose, sauf la pause, qui le défait ci-dessous.
      escapeClosedAt = now;
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
      if (talents.open) {
        talents.close();
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
        paused: flags.paused,
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
      else if (action === 'pause') {
        // Un deuxième Échap tout de suite après une fermeture : la répétition ne met pas en pause.
        escapeClosedAt = before;
        if (!escapeRepeats(before, now)) setPaused(true);
      } else setPaused(false);
    }
    if (shortcut === 'inventory' && flags.started && !flags.paused && !settings.open && !worldMap.open) inventory.toggle();
    if (shortcut === 'map') {
      if (worldMap.open) worldMap.close();
      else if (flags.started && !flags.paused && !settings.open && !inventory.open && !world.defeated) worldMap.show();
    }
    if (shortcut === 'mic') voicePanel.toggleMic();
    if (shortcut === 'debug' && import.meta.env.DEV) hud.toggleDebug();
  }

  life.listen(window, 'keydown', (event) => {
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
  const canOpenMenu = (): boolean => flags.started && !flags.paused && !settings.open && !inventory.open && !world.defeated && !worldMap.open;
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
    build: () => castVolley(canOpenMenu()) || buildMenu.handleKey('Space', false, canOpenMenu()),
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

  prefs.attachPad(pad);
  document.body.append(pad.cursor.root);

  // Les étiquettes de la manette sur le sac (△ / Y) et « Bâtir » (□ / X) : visibles seulement en mode manette.
  const padHints = new PadHints([
    [hud.bag, 'north'],
    [hud.skillButton, 'west'],
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
  life.listen(window, 'pointermove', (event) => {
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
  const unbindWheel = bindWheelZoom(
    renderer.canvas,
    () => flags.started && !flags.paused && !settings.open,
    ({ factor, immediate }, x, y) => renderer.zoomBy(factor, { x, y }, immediate),
  );

  let lastAxisX = 0;
  let lastAxisY = 0;

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

  life.add(() => pointers.destroy());
  life.add(unbindWheel);

  return { pad, padHints, pushAxisIfChanged };
}
