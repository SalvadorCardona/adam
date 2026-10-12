/**
 * L'état « en ligne / hors ligne » du jeu, pour qui en a besoin (comptes,
 * parties à deux). Hors ligne par défaut : tant que le serveur n'a pas
 * répondu, le jeu se comporte comme s'il n'existait pas.
 *
 * Une sonde `/health` au démarrage, sans le retarder, puis de loin en loin :
 * toutes les minutes en ligne, de plus en plus rarement hors ligne (jusqu'à
 * cinq minutes). Rien onglet caché — la partie y est en pause —, rien quand
 * le navigateur se sait sans réseau ; on resonde au retour de l'un ou de
 * l'autre. Sans URL d'API au build, aucune requête, jamais.
 */

import { apiBaseUrl, probeHealth } from './api.ts';

export type ConnectionState = 'online' | 'offline';

/** Le délai avant la prochaine sonde, en ligne. */
export const ONLINE_RECHECK_MS = 60_000;
/** Les délais successifs, hors ligne ; le dernier se répète. */
export const OFFLINE_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;

export interface ConnectionDeps {
  /** La sonde : le serveur répond-il ? */
  readonly probe: () => Promise<boolean>;
  /** L'onglet est-il visible ? */
  readonly visible: () => boolean;
  /** Le navigateur croit-il avoir du réseau ? (`navigator.onLine`) */
  readonly networkUp: () => boolean;
}

type Listener = (state: ConnectionState) => void;

export class Connection {
  /** L'URL du serveur ; `null` : pas de back-end configuré, hors ligne pour toujours. */
  public readonly baseUrl: string | null;

  private current: ConnectionState = 'offline';
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private probing = false;
  private started = false;
  private readonly listeners = new Set<Listener>();
  private readonly deps: ConnectionDeps | null;

  public constructor(baseUrl: string | null, deps: ConnectionDeps | null) {
    this.baseUrl = baseUrl;
    this.deps = baseUrl ? deps : null;
  }

  /** Celle du navigateur, sur l'URL fixée au build. */
  public static browser(): Connection {
    const base = apiBaseUrl(import.meta.env.VITE_API_URL);

    if (!base) return new Connection(null, null);

    const connection = new Connection(base, {
      probe: () => probeHealth(base),
      visible: () => document.visibilityState !== 'hidden',
      networkUp: () => navigator.onLine !== false,
    });

    document.addEventListener('visibilitychange', () => connection.wake());
    window.addEventListener('online', () => connection.wake());
    window.addEventListener('offline', () => connection.wake());

    return connection;
  }

  public get state(): ConnectionState {
    return this.current;
  }

  public get online(): boolean {
    return this.current === 'online';
  }

  /** Un back-end est-il configuré ? Sans lui, le jeu ne passera jamais en ligne. */
  public get enabled(): boolean {
    return this.deps !== null;
  }

  /** Écoute les changements d'état ; rend de quoi se désabonner. */
  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  /** Lance la première sonde, sans l'attendre. */
  public start(): void {
    if (this.started) return;
    this.started = true;
    this.wake();
  }

  /** Arrête les sondes ; l'état reste ce qu'il était. */
  public stop(): void {
    this.started = false;
    this.clearTimer();
  }

  /** Quelque chose a changé (onglet revenu, réseau retrouvé ou perdu) : sonde tout de suite, ou s'endort. */
  public wake(): void {
    if (!this.deps || !this.started) return;
    this.clearTimer();
    void this.check();
  }

  private async check(): Promise<void> {
    const deps = this.deps;

    if (!deps || this.probing) return;
    // Onglet caché : on attend son retour (`wake`).
    if (!deps.visible()) return;
    // Le navigateur se sait sans réseau : inutile de demander, on attend l'événement `online`.
    if (!deps.networkUp()) {
      this.set('offline');

      return;
    }

    this.probing = true;
    const up = await deps.probe();

    this.probing = false;
    if (!this.started) return;

    this.failures = up ? 0 : this.failures + 1;
    this.set(up ? 'online' : 'offline');
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.check();
    }, up ? ONLINE_RECHECK_MS : OFFLINE_BACKOFF_MS[Math.min(this.failures, OFFLINE_BACKOFF_MS.length) - 1]!);
  }

  private set(state: ConnectionState): void {
    if (state === this.current) return;
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
