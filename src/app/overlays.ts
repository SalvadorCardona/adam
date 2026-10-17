/**
 * Ce qui passe par-dessus la partie et arrête l'horloge le temps qu'on le
 * lise : la victoire, une ère atteinte, le récap de l'absence, les faveurs
 * de l'aube, les talents d'un niveau passé.
 */
import type { AudioEngine } from '../audio/engine.ts';
import { t } from '../i18n/locale.ts';
import type { World } from '../sim/world.ts';
import type { Disposer } from '../ui/disposer.ts';
import { BoonPanel } from '../ui/boonPanel.ts';
import { OfflineRecap } from '../ui/offlineRecap.ts';
import type { SettingsPanel } from '../ui/settingsPanel.ts';
import { TalentPanel } from '../ui/talentPanel.ts';
import type { GameLoop, PlayFlags } from './gameLoop.ts';
import type { Screens } from './screens.ts';
import type { Ui } from './ui.ts';

export type Overlays = ReturnType<typeof wireOverlays>;

export function wireOverlays(life: Disposer, world: World, ui: Ui, audio: AudioEngine, loop: GameLoop, flags: PlayFlags, screens: Screens, settings: SettingsPanel) {
  const { hud, buildMenu, panel, inventory, resources, trade, eras, placement } = ui;

  life.on(world.events, 'victory', () => {
    flags.celebrating = true;
    window.umami?.track('victoire');
  });
  // Une ère atteinte : l'horloge s'arrête sur l'écran du passage, les feuilles tombent, « En avant ! » rend la main.
  life.on(world.events, 'eraReached', ({ era }) => {
    flags.celebrating = true;
    hud.rainLeaves();
    eras.showReached(era, () => {
      flags.celebrating = false;
      loop.reset();
    });
    window.umami?.track(`ere-${era}`);
  });
  // Refonder : les graines de la colonie au jardin, la partie effacée, puis une carte neuve.
  let refounding = false;

  hud.setOnRefound(() => {
    if (refounding) return;
    refounding = true;
    screens.garden.bank();
    screens.autosave.refound();
  });
  hud.setOnContinue(() => {
    flags.celebrating = false;
    loop.reset();
  });

  // Le récap « Pendant votre absence » : ouvert, il arrête l'horloge ; « Récupérer » rend la main.
  const recap = new OfflineRecap(
    () => hud.townBanner,
    () => {
      loop.reset();
    },
  );

  life.on(world.events, 'offlineCaughtUp', (report) => {
    buildMenu.close();
    panel.close();
    inventory.close();
    resources.close();
    trade.close();
    recap.show(report);
    audio.play('open');
  });

  // Les faveurs de l'aube : la capsule du HUD ouvre les cartes ; ouvertes, elles arrêtent l'horloge.
  const boons = new BoonPanel(world, (boon) => {
    loop.reset();
    hud.notify(t().hud.boon.chosen(t().boons[boon].label), 'good');
  });

  hud.onBoonOpen = () => {
    buildMenu.close();
    panel.close();
    boons.show();
    audio.play('open');
  };
  life.on(world.events, 'starfallAnnounced', () => hud.notify(t().hud.starfall, 'good'));
  life.on(world.events, 'challengeCompleted', ({ id, prestige, streak }) => hud.notify(t().hud.daily.done(t().challenges[id], prestige, streak), 'good'));
  life.on(world.events, 'boonOffered', () => hud.notify(t().hud.boon.ready, 'good', { label: t().hud.boon.see, run: () => hud.onBoonOpen() }));

  // Les talents d'Adam : au passage d'un niveau, trois cartes ; ouvertes, elles arrêtent l'horloge.
  const talents = new TalentPanel(world, () => {
    loop.reset();
  });

  hud.onTalentOpen = () => {
    buildMenu.close();
    panel.close();
    talents.show();
    audio.play('open');
  };
  // Le niveau passé ouvre les cartes, sauf si le joueur est occupé ailleurs : le toast et la capsule les gardent.
  life.on(world.events, 'levelUp', () => {
    if (placement.mode === 'idle' && !flags.paused && !boons.open && !recap.open && !settings.open) hud.onTalentOpen();
  });
  // Un talent pris : s'il en reste à choisir (plusieurs niveaux d'un coup), les cartes suivantes.
  life.on(world.events, 'talentChosen', ({ talent }) => {
    hud.notify(t().hud.talent.chosen(t().talents[talent].label), 'good');
    if (world.talentOffer()) talents.show();
  });


  return { recap, boons, talents };
}
