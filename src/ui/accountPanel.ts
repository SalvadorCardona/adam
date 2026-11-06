/**
 * La fenêtre du compte, facultative : inscription, connexion, déconnexion,
 * mot de passe oublié (l'adresse, puis un message neutre) et la page qu'ouvre
 * le lien de l'e-mail (`?reset=` : le nouveau mot de passe, deux fois).
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
import { locale, onLocale, t } from '../i18n/locale.ts';
import { uiIcon } from './icons.ts';

/** `forgot` : l'adresse à qui envoyer un lien ; `sent` : le message neutre ; `reset` : la page du lien. */
type Mode = 'signIn' | 'signUp' | 'forgot' | 'sent' | 'reset';

/** Les champs de chaque écran. */
const SHOWN: Record<Mode, readonly (AccountField | 'confirm')[]> = {
  signIn: ['email', 'password'],
  signUp: ['nickname', 'email', 'password'],
  forgot: ['email'],
  sent: [],
  reset: ['password', 'confirm'],
};

/** Le lien du bas de chaque écran mène à celui-ci. */
const SWITCH: Record<Mode, Mode> = { signIn: 'signUp', signUp: 'signIn', forgot: 'signIn', sent: 'signIn', reset: 'forgot' };

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
  /** Le nouveau mot de passe, une seconde fois (la page du lien). */
  private readonly confirm: Field;
  private readonly forgotLink: HTMLButtonElement;
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
  /** Les deux saisies du nouveau mot de passe diffèrent. */
  private mismatch = false;
  /** Le jeton du lien ouvert (`?reset=`), et ce qu'il faut faire une fois servi ou abandonné. */
  private resetToken: string | null = null;
  private resetDone: () => void = () => {};

  public constructor(client: AccountClient, connection: Connection) {
    this.client = client;
    this.connection = connection;
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen account-screen';
    this.root.hidden = true;
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
    /*
     * Fenêtre modale : un focus parti ailleurs (l'écran titre qui pose le sien
     * sur « Continuer » juste après qu'elle s'est ouverte d'un lien `?reset=`)
     * revient dedans — le clavier et la manette restent dans le formulaire.
     */
    this.root.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;

      if (!this.open || !(next instanceof Node) || this.root.contains(next)) return;
      queueMicrotask(() => this.focusFirst());
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
    this.confirm = this.field('password', 'confirm', 'new-password');

    // Voir le mot de passe : indispensable sur un téléphone, où l'on tape de travers.
    this.reveal = document.createElement('button');
    this.reveal.type = 'button';
    this.reveal.className = 'account-reveal';
    this.reveal.addEventListener('click', () => {
      const input = this.fields.password.input;

      input.type = input.type === 'password' ? 'text' : 'password';
      this.confirm.input.type = input.type;
      this.render();
    });
    this.fields.password.root.append(this.reveal);

    this.submit = document.createElement('button');
    this.submit.type = 'submit';
    this.submit.className = 'button-primary';
    this.switcher = document.createElement('button');
    this.switcher.type = 'button';
    this.switcher.className = 'button-secondary';
    this.switcher.addEventListener('click', () => this.switchTo(SWITCH[this.mode]));
    // Un lien plutôt qu'un bouton plein : il ne passe pas devant « Se connecter ».
    this.forgotLink = document.createElement('button');
    this.forgotLink.type = 'button';
    this.forgotLink.className = 'account-link';
    this.forgotLink.addEventListener('click', () => this.switchTo('forgot'));
    this.form.append(
      this.fields.nickname.root,
      this.fields.email.root,
      this.fields.password.root,
      this.confirm.root,
      this.forgotLink,
      this.submit,
      this.switcher,
    );
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
    this.mismatch = false;
    this.root.hidden = false;
    this.render();
    this.focusFirst();
    // La session a pu expirer : on la redemande, sans bloquer.
    void this.client.refresh();
  }

  /**
   * Connecté, la croix ; sinon le premier champ à remplir. Ouverte d'un lien
   * (`?reset=`), la fenêtre l'est avant d'être montée dans la page : le focus
   * attend qu'elle y soit.
   */
  private focusFirst(): void {
    if (!this.open) return;
    if (!this.root.isConnected) {
      requestAnimationFrame(() => this.focusFirst());

      return;
    }
    if (this.client.user && this.mode !== 'reset') this.closeButton.focus();
    else this.firstField().focus({ preventScroll: true });
  }

  /**
   * La page ouverte par le lien de l'e-mail : le nouveau mot de passe, deux
   * fois. `done` : le lien est servi ou abandonné (l'adresse de la page s'en
   * débarrasse).
   */
  public showReset(token: string, done: () => void): void {
    // Déjà ouverte (sur la connexion, par exemple) : elle se rouvre sur la page du lien.
    this.root.hidden = true;
    this.resetToken = token;
    this.resetDone = done;
    this.mode = 'reset';
    this.show();
  }

  public close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    for (const field of [this.fields.password, this.confirm]) {
      field.input.value = '';
      field.input.type = 'password';
    }
    // Le lien abandonné ne revient pas ; le message « e-mail parti » non plus.
    if (this.mode === 'reset' || this.mode === 'sent') this.leaveReset('signIn');
  }

  /** Passe à un autre écran du compte, le premier champ au doigt. */
  private switchTo(mode: Mode): void {
    if (this.mode === 'reset') this.leaveReset(mode);
    else this.mode = mode;
    this.message = null;
    this.problems = [];
    this.mismatch = false;
    this.render();
    (SHOWN[mode].length > 0 ? this.firstField() : this.switcher).focus({ preventScroll: true });
  }

  private leaveReset(next: Mode): void {
    const done = this.resetToken !== null ? this.resetDone : null;

    this.mode = next;
    this.resetToken = null;
    this.resetDone = () => {};
    done?.();
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
    const first = SHOWN[this.mode][0];

    return first === undefined ? this.fields.email.input : first === 'confirm' ? this.confirm.input : this.fields[first].input;
  }

  private field(type: string, name: AccountField | 'confirm', autocomplete: AutoFill): Field {
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
    input.enterKeyHint = name === 'password' || name === 'confirm' ? 'go' : 'next';
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
    const mode = this.mode;
    const shown = SHOWN[mode];
    // La page du lien s'ouvre même connecté (un autre compte sur cet appareil) : le formulaire passe devant.
    const profile = user !== null && mode !== 'reset';

    this.title.textContent = text.title;
    this.closeButton.setAttribute('aria-label', t().common.close);
    this.profile.hidden = !profile;
    this.form.hidden = profile;
    this.status.textContent = this.statusText();
    this.status.dataset['tone'] = this.available ? 'info' : 'offline';

    if (user && profile) {
      this.profileName.textContent = text.signedIn(user.nickname);
      this.profileEmail.textContent = user.guest ? text.guestProfile : text.signedInEmail(user.email);
      this.signOut.replaceChildren(text.signOut);
    } else {
      const fresh = mode === 'signUp' || mode === 'reset';
      const labels = { nickname: text.nickname, email: text.email, password: mode === 'reset' ? text.newPassword : text.password } as const;
      const hidden = this.fields.password.input.type === 'password';
      const submits: Record<Mode, string> = {
        signIn: text.signIn,
        signUp: text.signUp,
        forgot: text.forgotSend,
        sent: text.forgotSend,
        reset: text.resetSubmit,
      };
      const switches: Record<Mode, string> = {
        signIn: text.switchToSignUp,
        signUp: text.switchToSignIn,
        forgot: text.backToSignIn,
        sent: text.backToSignIn,
        reset: text.requestNewLink,
      };

      for (const key of FIELDS) {
        this.fields[key].root.hidden = !shown.includes(key);
        this.fields[key].name.textContent = labels[key];
      }
      this.confirm.root.hidden = !shown.includes('confirm');
      this.confirm.name.textContent = text.confirmPassword;
      this.confirm.error.textContent = this.mismatch ? text.field.mismatch : '';
      if (this.mismatch) this.confirm.input.setAttribute('aria-invalid', 'true');
      else this.confirm.input.removeAttribute('aria-invalid');
      this.fields.nickname.hint.textContent = text.nicknameHint;
      this.fields.password.hint.textContent = fresh ? text.passwordHint(ACCOUNT_LIMITS.password.min) : '';
      this.fields.password.input.autocomplete = fresh ? 'new-password' : 'current-password';
      this.fields.password.input.enterKeyHint = mode === 'reset' ? 'next' : 'go';
      this.reveal.setAttribute('aria-pressed', String(!hidden));
      this.reveal.setAttribute('aria-label', hidden ? text.showPassword : text.hidePassword);
      this.forgotLink.hidden = mode !== 'signIn';
      this.forgotLink.textContent = text.forgotLink;
      this.submit.hidden = mode === 'sent';
      this.submit.replaceChildren(this.busy ? text.working : submits[mode]);
      this.submit.disabled = this.busy || !this.available;
      this.switcher.textContent = switches[mode];
      for (const key of FIELDS) {
        const found = this.problems.find((problem) => problem.field === key);
        const field = this.fields[key];

        field.error.textContent = found ? describeProblem(key, found.problem) : '';
        if (found) field.input.setAttribute('aria-invalid', 'true');
        else field.input.removeAttribute('aria-invalid');
      }
    }

    for (const button of this.buttons) this.paintButton(button);
  }

  /** La ligne du haut : le serveur injoignable avant tout, sinon le dernier message, sinon celle de l'écran. */
  private statusText(): string {
    const text = t().account;

    if (!this.connection.enabled) return text.notConfigured;
    if (!this.connection.online) return text.offline;

    const message = this.message?.();

    if (message) return message;

    switch (this.mode) {
      case 'forgot':
        return text.forgotIntro;
      case 'sent':
        return text.forgotSent;
      case 'reset':
        return text.resetIntro;
      default:
        return this.client.user ? '' : text.intro;
    }
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
    if (this.mode === 'forgot') return this.sendForgot();
    if (this.mode === 'reset') return this.sendReset();
    if (this.mode === 'sent') return;

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
    if (!this.check(found)) return;

    this.busy = true;
    this.render();

    const result = signUp ? await this.client.register({ nickname, email, password }) : await this.client.login({ email, password });

    this.busy = false;
    if (result.ok) {
      this.signedIn(() => t().account.welcome(result.user.nickname));

      return;
    }

    this.refused(result);
  }

  /** Mot de passe oublié : la réponse est la même que le compte existe ou non, le message aussi. */
  private async sendForgot(): Promise<void> {
    const email = cleanEmail(this.fields.email.input.value);
    const problem = emailProblem(email);

    if (!this.check(problem ? [{ field: 'email', problem }] : [])) return;

    this.busy = true;
    this.render();

    const result = await this.client.forgot(email, locale());

    this.busy = false;
    if (result.ok) {
      this.mode = 'sent';
      this.render();
      this.switcher.focus({ preventScroll: true });

      return;
    }

    this.refused(result);
  }

  /** La page du lien : le nouveau mot de passe, aux règles de l'inscription, deux fois le même. */
  private async sendReset(): Promise<void> {
    const token = this.resetToken;
    const password = this.fields.password.input.value;
    const problem = passwordProblem(password);

    if (token === null) return;
    this.mismatch = problem === null && password !== this.confirm.input.value;
    if (!this.check(problem ? [{ field: 'password', problem }] : [])) return;

    this.busy = true;
    this.render();

    const result = await this.client.reset({ token, password });

    this.busy = false;
    if (result.ok) {
      this.confirm.input.value = '';
      this.leaveReset('signIn');
      this.signedIn(() => t().account.resetDone(result.user.nickname));

      return;
    }

    this.refused(result);
  }

  /** Les problèmes trouvés ici : `false` (et le premier champ fautif au doigt) s'il y en a. */
  private check(found: readonly FieldError[]): boolean {
    this.problems = found;
    this.message = null;
    if (found.length === 0 && !this.mismatch) return true;
    this.render();
    this.form.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();

    return false;
  }

  private signedIn(message: () => string): void {
    this.fields.password.input.value = '';
    this.problems = [];
    this.message = message;
    this.render();
    this.closeButton.focus();
  }

  private refused(failure: AccountFailure): void {
    this.problems = failure.reason === 'invalid' ? (failure.fields ?? []) : [];
    this.message = () => failureText(failure);
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

/** Pourquoi un champ est refusé, en mots ; le pseudo d'un invité le dit pareil (`nicknameField.ts`). */
export function describeProblem(field: AccountField, problem: FieldProblem): string {
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
