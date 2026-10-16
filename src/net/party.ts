/**
 * Les parties hébergées, côté client : ouvrir une invitation, la regarder,
 * la rejoindre, la quitter, la fermer. Au nom du joueur connecté
 * (`AccountClient.authorized`). Comme les comptes, aucun appel ne lève :
 * hors ligne, on le dit, et le jeu se joue pareil.
 */

import {
  API_PATHS,
  cleanNickname,
  isPartyError,
  nicknameProblem,
  type FieldProblem,
  isPartyResponse,
  partyJoinPath,
  partyLeavePath,
  partyPath,
  type PartyErrorResponse,
  type PartyInfo,
} from '../../shared/api.ts';
import type { AccountClient } from './account.ts';

export type PartyFailure = {
  readonly ok: false;
  readonly reason: 'offline' | 'server' | PartyErrorResponse['error'];
  readonly retryAfter?: number;
};

export type PartyResult = { readonly ok: true; readonly party: PartyInfo } | PartyFailure;

/** Le pseudo d'un invité est refusé : la raison, que la fenêtre met en mots sous le champ. */
export type NicknameFailure = { readonly ok: false; readonly reason: 'nickname'; readonly problem: FieldProblem };

export type PartyDone = { readonly ok: true } | PartyFailure;

type Answer = { status: 'offline' } | { status: number; body: unknown };

function failure(answer: Answer): PartyFailure {
  if (answer.status === 'offline') return { ok: false, reason: 'offline' };
  if (isPartyError(answer.body)) {
    const { error, retryAfter } = answer.body;

    return { ok: false, reason: error, ...(retryAfter !== undefined && { retryAfter }) };
  }

  return { ok: false, reason: 'server' };
}

export class PartyClient {
  private readonly account: AccountClient;

  public constructor(account: AccountClient) {
    this.account = account;
  }

  /** Héberge la partie : une invitation neuve (la précédente se ferme). */
  public async host(): Promise<PartyResult> {
    return this.result(await this.account.authorized('POST', API_PATHS.parties, {}));
  }

  /** L'état de l'invitation ; sans compte on voit l'hôte, avec on voit aussi la salle si l'on en est. */
  public async look(code: string): Promise<PartyResult> {
    return this.result(await this.account.authorized('GET', partyPath(code)));
  }

  public async join(code: string): Promise<PartyResult> {
    return this.result(await this.account.authorized('POST', partyJoinPath(code), {}));
  }

  /**
   * Rejoindre avec son seul pseudo : sans compte, le serveur ouvre d'abord une
   * session d'invité (`AccountClient.guest`), puis on entre dans la salle avec
   * elle. Déjà connecté, on garde son compte et le pseudo ne sert pas.
   */
  public async joinAs(code: string, nickname: string): Promise<PartyResult | NicknameFailure> {
    const signedIn = await this.signIn(nickname);

    return signedIn ?? this.join(code);
  }

  /** Héberger avec son seul pseudo, comme `joinAs` : l'hôte non plus n'a pas besoin de compte. */
  public async hostAs(nickname: string): Promise<PartyResult | NicknameFailure> {
    const signedIn = await this.signIn(nickname);

    return signedIn ?? this.host();
  }

  public async leave(code: string): Promise<PartyDone> {
    return this.done(await this.account.authorized('POST', partyLeavePath(code), {}));
  }

  /** L'hôte ferme la session. */
  public async close(code: string): Promise<PartyDone> {
    return this.done(await this.account.authorized('DELETE', partyPath(code)));
  }

  /** Une session d'invité si l'on n'en a pas ; `null` : on peut y aller, sinon pourquoi pas. */
  private async signIn(raw: string): Promise<PartyFailure | NicknameFailure | null> {
    if (this.account.user) return null;

    const nickname = cleanNickname(raw);
    const problem = nicknameProblem(nickname);

    if (problem) return { ok: false, reason: 'nickname', problem };

    const result = await this.account.guest(nickname);

    if (result.ok) return null;
    if (result.reason === 'invalid' && 'fields' in result) {
      return { ok: false, reason: 'nickname', problem: result.fields?.[0]?.problem ?? 'badFormat' };
    }
    if (result.reason === 'offline' || result.reason === 'tooManyAttempts') {
      return { ok: false, reason: result.reason, ...('retryAfter' in result && result.retryAfter !== undefined && { retryAfter: result.retryAfter }) };
    }

    return { ok: false, reason: 'server' };
  }

  private result(answer: Answer): PartyResult {
    if (answer.status !== 'offline' && isPartyResponse(answer.body)) return { ok: true, party: answer.body.party };

    return failure(answer);
  }

  private done(answer: Answer): PartyDone {
    if (answer.status !== 'offline' && answer.status >= 200 && answer.status < 300) return { ok: true };

    return failure(answer);
  }
}
