/**
 * Les e-mails du serveur — pour l'instant, le seul lien « mot de passe
 * oublié ». Ils partent par l'API transactionnelle de Brevo
 * (`POST /v3/smtp/email`, en-tête `api-key`). Sans `BREVO_API_KEY` (le
 * développement, les tests), l'e-mail est écrit dans les journaux au lieu de
 * partir : le lien s'y copie, et le serveur démarre quand même.
 *
 * Un envoi n'échoue jamais en exception : il répond `false` et le dit dans les
 * journaux, sans la clé ni le contenu.
 */

import type { MailLocale } from '../../shared/api.ts';
import type { MailConfig } from './config.ts';

export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
/** Au-delà, Brevo est tenu pour injoignable. */
export const MAIL_TIMEOUT_MS = 10_000;

export interface MailMessage {
  readonly to: string;
  readonly toName?: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<boolean>;
}

/** Brevo si la clé est là, sinon les journaux. */
export function createMailer(config: MailConfig, fetcher: typeof fetch = fetch, log: (line: string) => void = console.log): Mailer {
  return config.apiKey ? brevoMailer(config.apiKey, config, fetcher, log) : logMailer(log);
}

/** Sans clé : l'e-mail, en texte, dans les journaux. */
export function logMailer(log: (line: string) => void): Mailer {
  return {
    send(message) {
      log(`[mail] (BREVO_API_KEY absente : non envoyé) à ${message.to} — ${message.subject}\n${message.text}`);

      return Promise.resolve(true);
    },
  };
}

export function brevoMailer(apiKey: string, config: Pick<MailConfig, 'from' | 'fromName'>, fetcher: typeof fetch, log: (line: string) => void): Mailer {
  return {
    async send(message) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), MAIL_TIMEOUT_MS);

      try {
        const response = await fetcher(BREVO_URL, {
          method: 'POST',
          signal: abort.signal,
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender: { email: config.from, name: config.fromName },
            to: [{ email: message.to, ...(message.toName && { name: message.toName }) }],
            subject: message.subject,
            htmlContent: message.html,
            textContent: message.text,
          }),
        });

        if (response.ok) return true;
        log(`[mail] Brevo a refusé l'envoi : HTTP ${response.status}`);

        return false;
      } catch {
        log('[mail] Brevo injoignable');

        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/*
 * L'e-mail de réinitialisation. Le jeu vouvoie le joueur ; l'e-mail aussi.
 * Le serveur ne lit pas les dictionnaires du jeu (`src/i18n/`) : ses quelques
 * phrases tiennent ici, dans les deux langues du jeu.
 */
const RESET_TEXT = {
  fr: {
    subject: 'Adam — nouveau mot de passe',
    hello: (nickname: string) => `Bonjour ${nickname},`,
    body: 'Vous avez demandé à changer le mot de passe de votre compte Adam. Ce lien sert une seule fois et expire dans 30 minutes :',
    button: 'Choisir un nouveau mot de passe',
    ignore: 'Si vous n’avez rien demandé, ignorez cet e-mail : votre mot de passe ne change pas.',
    signature: 'Un produit Hermez',
  },
  en: {
    subject: 'Adam — new password',
    hello: (nickname: string) => `Hello ${nickname},`,
    body: 'You asked to change the password of your Adam account. This link works once and expires in 30 minutes:',
    button: 'Choose a new password',
    ignore: 'If you didn’t ask for this, ignore this email: your password stays the same.',
    signature: 'A Hermez product',
  },
} as const satisfies Record<MailLocale, unknown>;

/** Les couleurs de la direction artistique (`PALETTE`), recopiées : un e-mail ne lit pas de variables CSS. */
const COLORS = { ink: '#2b2d8f', muted: '#5a3fd6', paper: '#ffffff', page: '#dcdcff', accent: '#ffd23f', accentInk: '#2b2d8f' } as const;

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function resetEmail(locale: MailLocale, nickname: string, link: string): Omit<MailMessage, 'to' | 'toName'> {
  const text = RESET_TEXT[locale];
  const font = "font-family:'Fredoka',Arial,Helvetica,sans-serif";
  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(text.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${COLORS.paper};border-radius:24px;">
<tr><td style="padding:28px 28px 8px;${font};font-size:28px;font-weight:700;color:${COLORS.ink};">Adam</td></tr>
<tr><td style="padding:8px 28px;${font};font-size:16px;line-height:24px;color:${COLORS.ink};">${escapeHtml(text.hello(nickname))}</td></tr>
<tr><td style="padding:8px 28px;${font};font-size:16px;line-height:24px;color:${COLORS.ink};">${escapeHtml(text.body)}</td></tr>
<tr><td align="center" style="padding:20px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="border-radius:999px;background:${COLORS.accent};">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 28px;${font};font-size:17px;font-weight:700;color:${COLORS.accentInk};text-decoration:none;border-radius:999px;">${escapeHtml(text.button)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 28px 8px;${font};font-size:13px;line-height:20px;color:${COLORS.muted};word-break:break-all;"><a href="${escapeHtml(link)}" style="color:${COLORS.muted};">${escapeHtml(link)}</a></td></tr>
<tr><td style="padding:8px 28px 24px;${font};font-size:14px;line-height:21px;color:${COLORS.muted};">${escapeHtml(text.ignore)}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td align="center" style="padding:16px;${font};font-size:13px;color:${COLORS.muted};">${escapeHtml(text.signature)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return {
    subject: text.subject,
    html,
    text: [text.hello(nickname), '', text.body, '', link, '', text.ignore, '', '—', text.signature].join('\n'),
  };
}
