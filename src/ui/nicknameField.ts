/**
 * Le pseudo d'un invité : un champ, sa ligne d'aide et son erreur, aux classes
 * du formulaire de compte. L'ami qui rejoint une partie, ou l'hôte qui invite,
 * n'a besoin que de lui — pas d'adresse, pas de mot de passe (`PartyClient.joinAs`).
 */

import { ACCOUNT_LIMITS, type FieldProblem } from '../../shared/api.ts';
import { t } from '../i18n/locale.ts';
import { describeProblem } from './accountPanel.ts';

export class NicknameField {
  public readonly root: HTMLLabelElement;
  public readonly input: HTMLInputElement;

  private readonly label: HTMLSpanElement;
  private readonly hint: HTMLSpanElement;
  private readonly error: HTMLSpanElement;
  private problem: FieldProblem | null = null;

  /** `onSubmit` : Entrée dans le champ. */
  public constructor(onSubmit: () => void) {
    this.root = document.createElement('label');
    this.root.className = 'account-field';
    this.label = document.createElement('span');
    this.label.className = 'account-label';
    this.hint = document.createElement('span');
    this.hint.className = 'account-hint';
    this.error = document.createElement('span');
    this.error.className = 'account-error';
    this.error.setAttribute('role', 'alert');
    this.input = document.createElement('input');
    this.input.className = 'account-input';
    this.input.type = 'text';
    this.input.name = 'nickname';
    this.input.setAttribute('autocomplete', 'nickname');
    this.input.spellcheck = false;
    this.input.enterKeyHint = 'go';
    this.input.maxLength = ACCOUNT_LIMITS.nickname.max * 2;
    this.input.addEventListener('input', () => this.show(null));
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit();
      }
    });
    this.root.append(this.label, this.input, this.hint, this.error);
  }

  public get value(): string {
    return this.input.value;
  }

  /** Le pseudo refusé (sous le champ), ou `null` : plus d'erreur. */
  public show(problem: FieldProblem | null): void {
    this.problem = problem;
    this.render();
  }

  public render(): void {
    const text = t().party;

    this.label.textContent = text.nicknameLabel;
    this.hint.textContent = text.nicknameHint;
    this.error.textContent = this.problem ? describeProblem('nickname', this.problem) : '';
    if (this.problem) this.input.setAttribute('aria-invalid', 'true');
    else this.input.removeAttribute('aria-invalid');
  }
}
