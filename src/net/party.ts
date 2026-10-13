/**
 * Les parties hébergées, côté client : ouvrir une invitation, la regarder,
 * la rejoindre, la quitter, la fermer. Au nom du joueur connecté
 * (`AccountClient.authorized`). Comme les comptes, aucun appel ne lève :
 * hors ligne, on le dit, et le jeu se joue pareil.
 */

import {
  API_PATHS,
  isPartyError,
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

  public async leave(code: string): Promise<PartyDone> {
    return this.done(await this.account.authorized('POST', partyLeavePath(code), {}));
  }

  /** L'hôte ferme la session. */
  public async close(code: string): Promise<PartyDone> {
    return this.done(await this.account.authorized('DELETE', partyPath(code)));
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
