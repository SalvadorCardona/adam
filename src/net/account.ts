/**
 * Le compte du joueur, facultatif. Sans lui le jeu se joue comme avant ; les
 * sauvegardes restent locales. Le client garde le jeton sur l'appareil
 * (`LocalAccount`) et le renvoie en `Authorization: Bearer` — pas de cookie :
 * le jeu et le serveur sont sur deux origines, et un cookie « tiers » est
 * refusé par Safari et les navigateurs mobiles.
 *
 * Tout appel peut échouer sans rien casser : hors ligne, on le dit
 * (`offline`) et on ne touche pas à la session gardée. Seul un 401 du serveur
 * la périme.
 */

import {
  API_PATHS,
  isAccountError,
  isMeResponse,
  isSessionResponse,
  type AccountErrorResponse,
  type AccountUser,
  type FieldError,
  type LoginRequest,
  type RegisterRequest,
} from '../../shared/api.ts';
import type { LocalAccount } from '../storage/localAccount.ts';

/** Le temps au-delà duquel un appel de compte est tenu pour perdu. */
export const ACCOUNT_TIMEOUT_MS = 10_000;

export type AccountFailure =
  | { readonly ok: false; readonly reason: 'offline' | 'server' }
  | {
      readonly ok: false;
      readonly reason: AccountErrorResponse['error'];
      readonly fields?: readonly FieldError[];
      readonly retryAfter?: number;
    };

export type AccountResult = { readonly ok: true; readonly user: AccountUser } | AccountFailure;

type Listener = (user: AccountUser | null) => void;

export class AccountClient {
  private readonly base: string | null;
  private readonly store: LocalAccount;
  private readonly fetcher: typeof fetch;
  private readonly listeners = new Set<Listener>();
  private session: { token: string; user: AccountUser } | null;

  public constructor(base: string | null, store: LocalAccount, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.base = base;
    this.store = store;
    this.fetcher = fetcher;
    this.session = base ? store.load() : null;
  }

  /** Le compte connecté, ou `null`. Gardé d'une visite à l'autre, même hors ligne. */
  public get user(): AccountUser | null {
    return this.session?.user ?? null;
  }

  /** Le jeton de la session, pour s'annoncer au WebSocket quand on joue à deux ; `null` sans compte. */
  public get token(): string | null {
    return this.session?.token ?? null;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  /** Redemande au serveur si la session tient encore. Hors ligne : on garde ce qu'on sait. */
  public async refresh(): Promise<void> {
    const session = this.session;

    if (!session) return;

    const answer = await this.call('GET', API_PATHS.me, undefined, session.token);

    if (answer.status === 'offline') return;
    if (answer.status === 401) {
      this.set(null);

      return;
    }
    if (isMeResponse(answer.body)) this.set({ token: session.token, user: answer.body.user });
  }

  /**
   * Un appel au serveur au nom du joueur connecté (parties hébergées). Un 401
   * périme la session gardée : le jeton n'est plus bon, le joueur se
   * reconnectera. Hors ligne, rien ne change.
   */
  public async authorized(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: 'offline' } | { status: number; body: unknown }> {
    const token = this.session?.token;
    const answer = await this.call(method, path, body, token);

    if (token && answer.status === 401) this.set(null);

    return answer;
  }

  public async register(request: RegisterRequest): Promise<AccountResult> {
    return this.open(API_PATHS.register, request);
  }

  public async login(request: LoginRequest): Promise<AccountResult> {
    return this.open(API_PATHS.login, request);
  }

  /** Se déconnecter vaut toujours côté appareil ; le serveur est prévenu si on peut. */
  public async logout(): Promise<void> {
    const session = this.session;

    this.set(null);
    if (session) await this.call('POST', API_PATHS.logout, {}, session.token);
  }

  private async open(path: string, request: RegisterRequest | LoginRequest): Promise<AccountResult> {
    const answer = await this.call('POST', path, request);

    if (answer.status === 'offline') return { ok: false, reason: 'offline' };
    if (isSessionResponse(answer.body)) {
      this.set({ token: answer.body.token, user: answer.body.user });

      return { ok: true, user: answer.body.user };
    }
    if (isAccountError(answer.body)) {
      const { error, fields, retryAfter } = answer.body;

      return { ok: false, reason: error, ...(fields && { fields }), ...(retryAfter !== undefined && { retryAfter }) };
    }

    return { ok: false, reason: 'server' };
  }

  private set(session: { token: string; user: AccountUser } | null): void {
    this.session = session;
    if (session) this.store.save(session);
    else this.store.clear();
    for (const listener of this.listeners) listener(session?.user ?? null);
  }

  private async call(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{ status: 'offline' } | { status: number; body: unknown }> {
    if (!this.base) return { status: 'offline' };

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ACCOUNT_TIMEOUT_MS);

    try {
      const response = await this.fetcher(`${this.base}${path}`, {
        method,
        cache: 'no-store',
        signal: abort.signal,
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const parsed: unknown = await response.json().catch(() => null);

      return { status: response.status, body: parsed };
    } catch {
      return { status: 'offline' };
    } finally {
      clearTimeout(timer);
    }
  }
}
