import { t } from '../i18n/locale.ts';
import { nextWave } from '../sim/dayNight.ts';
import { TICKS_PER_SECOND, type World } from '../sim/world.ts';
import type { Disposer } from '../ui/disposer.ts';
import { clock as clockText } from '../ui/hud.ts';
import type { Notifier } from '../ui/notifier.ts';

/**
 * Les événements qui valent une notification — la politique (type permis,
 * plafond du jour, fenêtre en retrait) est celle du `Notifier`. Les vivres se
 * surveillent à part : `needAlert` n'est pas un événement, on regarde chaque
 * seconde et on ne prévient qu'au passage de « tout va bien » à « ça manque ».
 */
export function wireNotifications(life: Disposer, world: World, notifier: Notifier, onResearchStarted: () => void): void {
  life.on(world.events, 'researchStarted', onResearchStarted);
  life.on(world.events, 'researchCompleted', ({ research }) =>
    notifier.notify('research', { title: t().notifications.research.title, body: t().notifications.research.body(t().research[research].label) }),
  );
  life.on(world.events, 'childBorn', ({ name }) =>
    notifier.notify('child', { title: t().notifications.child.title, body: t().notifications.child.body(name) }),
  );

  // Une vague s'annonce 2:30 avant (`waveAnnounced`), puis en trois temps (3, 2, 1 s) : une seule notification par vague,
  // au premier des deux. Pas de vague hors ligne : onglet caché, le jeu est en pause.
  let announced = '';

  life.on(world.events, 'waveAnnounced', ({ night, ticks, count, from }) => {
    const clock = world.clock();

    announced = `${night}:${clock ? nextWave(clock).wave : 0}`;
    notifier.notify('attack', {
      title: t().hud.wave.notifyTitle,
      body: t().hud.wave.announced(clockText(Math.ceil(ticks / TICKS_PER_SECOND)), count, t().hud.from[from]),
    });
  });
  life.on(world.events, 'waveCountdown', ({ night, wave, count }) => {
    const key = `${night}:${wave}`;

    if (key === announced) return;
    announced = key;
    notifier.notify('attack', { title: t().notifications.attack.title, body: t().notifications.attack.body(night, count) });
  });

  let short = false;

  life.interval(() => {
    const alert = world.needAlert();

    if (alert && !short) {
      const text = t().notifications.supplies;

      notifier.notify('supplies', { title: alert.item === 'water' ? text.waterTitle : text.foodTitle, body: text.body(alert.minutes) });
    }
    short = alert !== null;
  }, 1000);
}
