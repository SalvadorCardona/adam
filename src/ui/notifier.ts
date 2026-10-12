/**
 * Les notifications du navigateur : le jeu prévient quand il n'a pas la main
 * (fenêtre en retrait, autre application devant) qu'une recherche est finie,
 * qu'un enfant est né, que la ville va manquer de vivres ou qu'une vague
 * approche.
 *
 * Sans serveur. La page doit être ouverte : la partie s'arrête onglet caché
 * et rien n'arrive pendant qu'elle est fermée — aucune notification ne peut
 * donc partir d'un jeu fermé tant qu'il n'a pas de temps hors ligne.
 *
 * La politique (type permis, plafond du jour) est pure et testée ; la
 * livraison est un `NotifyBackend`, que le navigateur fournit
 * (`browserBackend`) et que les tests remplacent.
 */

import { NOTIFICATIONS, type NotificationKind } from '../data/notifications.ts';
import type { LocalNotifications, NotificationPrefs } from '../storage/localNotifications.ts';

export type NotifyPermission = NotificationPermission | 'unsupported';

export interface NotifyBackend {
  permission(): NotifyPermission;
  /** Ouvre la demande du navigateur ; ne se rappelle qu'après l'écran d'explication. */
  request(): Promise<NotifyPermission>;
  /** Pose la notification ; `tag` en remplace une plus ancienne du même type. */
  show(title: string, body: string, tag: string): void;
}

export interface NotifyMessage {
  title: string;
  body: string;
}

/** Le jour local, `AAAA-MM-JJ` : le compte du plafond repart à zéro à minuit. */
export function dayKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class Notifier {
  private prefs: NotificationPrefs;
  private readonly store: LocalNotifications;
  private readonly backend: NotifyBackend;
  private readonly away: () => boolean;
  private readonly today: () => string;

  /**
   * `away` : le joueur regarde-t-il ailleurs ? Une notification par-dessus
   * un jeu qu'on a sous les yeux ne sert à rien.
   */
  public constructor(store: LocalNotifications, backend: NotifyBackend, away: () => boolean, today: () => string = () => dayKey(new Date())) {
    this.store = store;
    this.backend = backend;
    this.away = away;
    this.today = today;
    this.prefs = store.load();
  }

  public get supported(): boolean {
    return this.backend.permission() !== 'unsupported';
  }

  public get permission(): NotifyPermission {
    return this.backend.permission();
  }

  public get limit(): number {
    return this.prefs.limit;
  }

  public enabled(kind: NotificationKind): boolean {
    return this.prefs.kinds[kind];
  }

  /** L'écran d'explication est à montrer : le navigateur n'a pas encore tranché, et on ne l'a pas déjà montré. */
  public get shouldExplain(): boolean {
    return this.permission === 'default' && !this.prefs.explained;
  }

  /** L'écran a été montré : on ne le remontre pas, quelle qu'ait été la réponse. */
  public markExplained(): void {
    this.prefs.explained = true;
    this.store.save(this.prefs);
  }

  /** La demande du navigateur, à lancer depuis un geste du joueur. */
  public async ask(): Promise<NotifyPermission> {
    this.markExplained();
    return this.backend.request();
  }

  public setEnabled(kind: NotificationKind, on: boolean): void {
    this.prefs.kinds[kind] = on;
    this.store.save(this.prefs);
  }

  /** Passe au plafond suivant, et revient au premier après le dernier. */
  public cycleLimit(): number {
    const limits: readonly number[] = NOTIFICATIONS.dailyLimits;

    this.prefs.limit = limits[(limits.indexOf(this.prefs.limit) + 1) % limits.length] ?? NOTIFICATIONS.defaultLimit;
    this.store.save(this.prefs);
    return this.prefs.limit;
  }

  /** Combien de notifications peuvent encore partir aujourd'hui. */
  public remainingToday(): number {
    return this.prefs.day === this.today() ? Math.max(0, this.prefs.limit - this.prefs.sent) : this.prefs.limit;
  }

  /** Envoie la notification si tout l'y autorise ; dit si elle est partie. */
  public notify(kind: NotificationKind, message: NotifyMessage): boolean {
    if (!this.prefs.kinds[kind] || this.backend.permission() !== 'granted' || !this.away()) return false;
    if (this.remainingToday() <= 0) return false;

    const today = this.today();

    this.prefs.sent = (this.prefs.day === today ? this.prefs.sent : 0) + 1;
    this.prefs.day = today;
    this.store.save(this.prefs);
    this.backend.show(message.title, message.body, `mobile-factory:${kind}`);
    return true;
  }
}

/**
 * Le navigateur. Android n'accepte `new Notification` nulle part : seul un
 * service worker enregistré peut poser une notification, d'où `sw.js`
 * (aussi ce qui rend la notification cliquable, pour ramener la fenêtre).
 */
export function browserBackend(workerUrl: string): NotifyBackend {
  const registration = (): Promise<ServiceWorkerRegistration | undefined> =>
    'serviceWorker' in navigator ? navigator.serviceWorker.register(workerUrl).catch(() => undefined) : Promise.resolve(undefined);
  const fallback = (title: string, body: string, tag: string): void => {
    try {
      new Notification(title, { body, tag, icon: `${import.meta.env.BASE_URL}icon.png` });
    } catch {
      // Constructeur refusé (Android sans service worker) : rien d'autre à tenter.
    }
  };

  return {
    permission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
    request: async () => {
      if (typeof Notification === 'undefined') return 'unsupported';
      try {
        return await Notification.requestPermission();
      } catch {
        return Notification.permission;
      }
    },
    show: (title, body, tag) => {
      void registration().then((worker) => {
        if (!worker) return fallback(title, body, tag);
        return worker
          .showNotification(title, { body, tag, icon: `${import.meta.env.BASE_URL}icon.png`, badge: `${import.meta.env.BASE_URL}favicon.png` })
          .catch(() => fallback(title, body, tag));
      });
    },
  };
}
