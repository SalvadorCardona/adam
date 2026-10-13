/**
 * La fenêtre du compte, facultative : inscription, connexion, déconnexion.
 * Ouverte depuis l'écran titre et depuis les Réglages ; fermée par sa croix,
 * un tap sur le voile ou Échap (`main.ts`). Elle ne touche pas à la partie :
 * jouer sans compte, et sans serveur, reste le cas normal.
 *
 * Hors ligne (serveur injoignable ou absent du build), elle le dit en tête et
 * désactive l'envoi, sans rien bloquer d'autre. Les champs sont de vrais
 * `<input>` dans un `<form>` : le clavier du téléphone, le gestionnaire de mots
 * de passe, Entrée pour valider, et la manette — la croix passe d'un champ à
 * l'autre, ✕ clique — marchent sans code à eux.
 */

import {
  ACCOUNT_LIMITS,
  cleanEmail,
  cleanNickname,
  emailProblem,
  nicknameProblem,
  passwordProblem,
  type AccountField,
  type FieldError,
  type FieldProblem,
} from '../../shared/api.ts';
import type { AccountClient, AccountFailure } from '../net/account.ts';
import type { Connection } from '../net/connection.ts';
import { onLocale, t } from '../i18n/locale.ts';
import { uiIcon } from './icons.ts';

type Mode = 'signIn' | 'signUp';

const FIELDS = ['nickname', 'email', 'password'] as const;

interface Field {
  readonly root: HTMLLabelElement;
  readonly input: HTMLInputElement;
  readonly name: HTMLSpanElement;
  readonly hint: HTMLSpanElement;
  readonly error: HTMLSpanElement;
}

export class AccountPanel {
  public readonly root: HTMLElement;

  private readonly client: AccountClient;
  private readonly connection: Connection;
  private readonly closeButton: HTMLButtonElement;
  private readonly title: HTMLHeadingElement;
  private readonly status: HTMLParagraphElement;
  private readonly form: HTMLFormElement;
  private readonly fields: Record<AccountField, Field>;
  private readonly reveal: HTMLButtonElement;
  private readonly submit: HTMLButtonElement;
  private readonly switcher: HTMLButtonElement;
  private readonly profile: HTMLElement;
  private readonly profileName: HTMLParagraphElement;
  private readonly profileEmail: HTMLParagraphElement;
  private readonly signOut: HTMLButtonElement;
  private readonly buttons = new Set<HTMLButtonElement>();
  private mode: Mode = 'signIn';
  private busy = false;
  /** Le dernier message du haut, relu à chaque langue. */
  private message: (() => string) | null = null;
  private problems: readonly FieldError[] = [];

  public constructor(client: AccountClient, connection: Connection) {
    this.client = client;
    this.connection = connection;
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen account-screen';
    this.root.hidden = true;
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });

    const panel = document.createElement('div');

    panel.className = 'panel overlay-panel settings-panel account-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const head = document.createElement('div');

    head.className = 'settings-head';
    this.title = document.createElement('h2');
    this.title.className = 'overlay-title';
    this.title.id = 'account-title';
    panel.setAttribute('aria-labelledby', this.title.id);
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'building-panel-close';
    this.closeButton.append(uiIcon('close'));
    this.closeButton.addEventListener('click', () => this.close());
    head.append(this.title, this.closeButton);

    this.status = document.createElement('p');
    this.status.className = 'settings-note account-status';
    this.status.setAttribute('role', 'status');

    this.form = document.createElement('form');
    this.form.className = 'account-form';
    this.form.noValidate = true;
    this.fields = {
      nickname: this.field('text', 'nickname', 'username'),
      email: this.field('email', 'email', 'email'),
      password: this.field('password', 'password', 'current-password'),
    };

    // Voir le mot de passe : indispensable sur un téléphone, où l'on tape de travers.
    this.reveal = document.createElement('button');
    this.reveal.type = 'button';
    this.reveal.className = 'account-reveal';
    this.reveal.addEventListener('click', () => {
      const input = this.fields.password.input;

      input.type = input.type === 'password' ? 'text' : 'password';
      this.render();
    });
    this.fields.password.root.append(this.reveal);

    this.submit = document.createElement('button');
    this.submit.type = 'submit';
    this.submit.className = 'button-primary';
    this.switcher = document.createElement('button');
    this.switcher.type = 'button';
    this.switcher.className = 'button-secondary';
    this.switcher.addEventListener('click', () => {
      this.mode = this.mode === 'signIn' ? 'signUp' : 'signIn';
      this.message = null;
      this.problems = [];
      this.render();
    });
    this.form.append(this.fields.nickname.root, this.fields.email.root, this.fields.password.root, this.submit, this.switcher);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.send();
    });

    this.profile = document.createElement('div');
    this.profile.className = 'account-profile';
    this.profileName = document.createElement('p');
    this.profileName.className = 'account-profile-name';
    this.profileEmail = document.createElement('p');
    this.profileEmail.className = 'settings-note';
    this.signOut = document.createElement('button');
    this.signOut.type = 'button';
    this.signOut.className = 'button-secondary';
    this.signOut.addEventListener('click', () => void this.leave());
    this.profile.append(this.profileName, this.profileEmail, this.signOut);

    panel.append(head, this.status, this.form, this.profile);
    this.root.append(panel);

    client.subscribe(() => this.render());
    connection.subscribe(() => this.render());
    onLocale(() => this.render());
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    if (this.open) return;
    this.message = null;
    this.problems = [];
    this.root.hidden = false;
    this.render();
    // Connecté, la croix ; sinon le premier champ à remplir.
    if (this.client.user) this.closeButton.focus();
    else this.firstField().focus({ preventScroll: true });
    // La session a pu expirer : on la redemande, sans bloquer.
    void this.client.refresh();
  }

  public close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.fields.password.input.value = '';
    this.fields.password.input.type = 'password';
  }

  /**
   * Un bouton « Compte » pour un autre écran (titre, Réglages) : il porte le
   * pseudo une fois connecté, et dit « hors ligne » quand le serveur ne
   * répond pas. Il se met à jour tout seul.
   */
  public button(className: string): HTMLButtonElement {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', () => this.show());
    this.buttons.add(button);
    this.paintButton(button);

    return button;
  }

  private firstField(): HTMLInputElement {
    return (this.mode === 'signUp' ? this.fields.nickname : this.fields.email).input;
  }

  private field(type: string, name: AccountField, autocomplete: AutoFill): Field {
    const root = document.createElement('label');
    const label = document.createElement('span');
    const hint = document.createElement('span');
    const input = document.createElement('input');
    const error = document.createElement('span');

    root.className = 'account-field';
    label.className = 'account-label';
    hint.className = 'account-hint';
    error.className = 'account-error';
    error.setAttribute('role', 'alert');
    input.className = 'account-input';
    input.type = type;
    input.name = name;
    input.autocomplete = autocomplete;
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.enterKeyHint = name === 'password' ? 'go' : 'next';
    input.maxLength = name === 'email' ? ACCOUNT_LIMITS.email.max : 256;
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      error.textContent = '';
    });
    root.append(label, input, hint, error);

    return { root, input, name: label, hint, error };
  }

  private get available(): boolean {
    return this.connection.enabled && this.connection.online;
  }

  private render(): void {
    const text = t().account;
    const user = this.client.user;
    const signUp = this.mode === 'signUp';

    this.title.textContent = text.title;
    this.closeButton.setAttribute('aria-label', t().common.close);
    this.profile.hidden = !user;
    this.form.hidden = user !== null;
    this.status.textContent = this.statusText();
    this.status.dataset['tone'] = this.available ? 'info' : 'offline';

    if (user) {
      this.profileName.textContent = text.signedIn(user.nickname);
      this.profileEmail.textContent = text.signedInEmail(user.email);
      this.signOut.replaceChildren(text.signOut);
    } else {
      const labels = { nickname: text.nickname, email: text.email, password: text.password } as const;
      const hidden = this.fields.password.input.type === 'password';

      this.fields.nickname.root.hidden = !signUp;
      for (const key of FIELDS) this.fields[key].name.textContent = labels[key];
      this.fields.nickname.hint.textContent = text.nicknameHint;
      this.fields.password.hint.textContent = signUp ? text.passwordHint(ACCOUNT_LIMITS.password.min) : '';
      this.fields.password.input.autocomplete = signUp ? 'new-password' : 'current-password';
      this.reveal.setAttribute('aria-pressed', String(!hidden));
      this.reveal.setAttribute('aria-label', hidden ? text.showPassword : text.hidePassword);
      this.submit.replaceChildren(this.busy ? text.working : signUp ? text.signUp : text.signIn);
      this.submit.disabled = this.busy || !this.available;
      this.switcher.textContent = signUp ? text.switchToSignIn : text.switchToSignUp;
      for (const key of FIELDS) {
        const found = this.problems.find((problem) => problem.field === key);
        const field = this.fields[key];

        field.error.textContent = found ? describe(key, found.problem) : '';
        if (found) field.input.setAttribute('aria-invalid', 'true');
        else field.input.removeAttribute('aria-invalid');
      }
    }

    for (const button of this.buttons) this.paintButton(button);
  }

  /** La ligne du haut : le serveur injoignable avant tout, sinon le dernier message. */
  private statusText(): string {
    const text = t().account;

    if (!this.connection.enabled) return text.notConfigured;
    if (!this.connection.online) return text.offline;

    return this.message?.() ?? (this.client.user ? '' : text.intro);
  }

  private paintButton(button: HTMLButtonElement): void {
    const text = t().account;
    const user = this.client.user;
    const offline = !this.available && !user;
    const label = user ? text.signedInAs(user.nickname) : offline ? text.offlineButton : text.title;

    button.replaceChildren(uiIcon('account', 22), label);
    button.dataset['offline'] = String(offline);
    button.setAttribute('aria-label', user ? `${text.title} : ${user.nickname}` : label);
  }

  /** Valide ici d'abord (le serveur re-vérifie tout), puis envoie. */
  private async send(): Promise<void> {
    if (this.busy || !this.available) return;

    const signUp = this.mode === 'signUp';
    const nickname = cleanNickname(this.fields.nickname.input.value);
    const email = cleanEmail(this.fields.email.input.value);
    const password = this.fields.password.input.value;
    const found: FieldError[] = [];
    const nicknameIssue = signUp ? nicknameProblem(nickname) : null;
    const emailIssue = emailProblem(email);
    // À la connexion, le mot de passe n'a pas de minimum : le serveur compare, c'est tout.
    const passwordIssue = signUp ? passwordProblem(password) : password === '' ? 'empty' : null;

    if (nicknameIssue) found.push({ field: 'nickname', problem: nicknameIssue });
    if (emailIssue) found.push({ field: 'email', problem: emailIssue });
    if (passwordIssue) found.push({ field: 'password', problem: passwordIssue });
    this.problems = found;
    this.message = null;
    if (found.length > 0) {
      this.render();
      this.form.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();

      return;
    }

    this.busy = true;
    this.render();

    const result = signUp ? await this.client.register({ nickname, email, password }) : await this.client.login({ email, password });

    this.busy = false;
    if (result.ok) {
      this.fields.password.input.value = '';
      this.problems = [];
      this.message = () => t().account.welcome(result.user.nickname);
      this.render();
      this.closeButton.focus();

      return;
    }

    this.problems = result.reason === 'invalid' ? (result.fields ?? []) : [];
    this.message = () => failureText(result);
    this.render();
  }

  private async leave(): Promise<void> {
    await this.client.logout();
    this.mode = 'signIn';
    this.message = () => t().account.signedOutDone;
    this.render();
    this.firstField().focus({ preventScroll: true });
  }
}

function failureText(failure: AccountFailure): string {
  const { errors, offline } = t().account;

  switch (failure.reason) {
    case 'offline':
      return offline;
    case 'server':
      return errors.server;
    case 'tooManyAttempts':
      return errors.tooManyAttempts(failure.retryAfter ?? 60);
    default:
      return errors[failure.reason];
  }
}

function describe(field: AccountField, problem: FieldProblem): string {
  const { field: text } = t().account;

  switch (problem) {
    case 'empty':
      return text.empty;
    case 'tooShort':
      return text.tooShort(field === 'nickname' ? ACCOUNT_LIMITS.nickname.min : ACCOUNT_LIMITS.password.min);
    case 'tooLong':
      return text.tooLong(ACCOUNT_LIMITS[field].max);
    case 'badFormat':
      return text.badFormat[field];
  }
}
