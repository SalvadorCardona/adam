import { describe, expect, it } from 'vitest';
import { BREVO_URL, createMailer, resetEmail } from './mail.ts';

const MAIL = { to: 'adam@example.com', toName: 'Adam', subject: 'Sujet', html: '<p>Bonjour</p>', text: 'Bonjour' };
const CONFIG = { apiKey: 'cle-secrete', from: 'adam@hermez.dev', fromName: 'Adam', publicUrl: 'https://hermez.dev/adam/' };

describe('createMailer', () => {
  it('envoie par l’API transactionnelle de Brevo, la clé en en-tête', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = ((url: string, init: RequestInit) => {
      calls.push({ url, init });

      return Promise.resolve(new Response('{"messageId":"x"}', { status: 201 }));
    }) as unknown as typeof fetch;

    expect(await createMailer(CONFIG, fetcher, () => {}).send(MAIL)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(BREVO_URL);
    expect((calls[0]!.init.headers as Record<string, string>)['api-key']).toBe('cle-secrete');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      sender: { email: 'adam@hermez.dev', name: 'Adam' },
      to: [{ email: 'adam@example.com', name: 'Adam' }],
      subject: 'Sujet',
      htmlContent: '<p>Bonjour</p>',
      textContent: 'Bonjour',
    });
  });

  it('répond false sans lever ni journaliser la clé quand Brevo refuse ou ne répond pas', async () => {
    const lines: string[] = [];
    const refused = (() => Promise.resolve(new Response('{}', { status: 401 }))) as unknown as typeof fetch;
    const down = (() => Promise.reject(new TypeError('network'))) as unknown as typeof fetch;

    expect(await createMailer(CONFIG, refused, (line) => lines.push(line)).send(MAIL)).toBe(false);
    expect(await createMailer(CONFIG, down, (line) => lines.push(line)).send(MAIL)).toBe(false);
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).not.toContain('cle-secrete');
  });

  it('sans clé, écrit l’e-mail dans les journaux au lieu de l’envoyer', async () => {
    const lines: string[] = [];
    const fetcher = (() => {
      throw new Error('aucun envoi attendu');
    }) as unknown as typeof fetch;

    expect(await createMailer({ ...CONFIG, apiKey: null }, fetcher, (line) => lines.push(line)).send(MAIL)).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('adam@example.com');
    expect(lines[0]).toContain('Bonjour');
  });
});

describe('resetEmail', () => {
  it('donne le lien en HTML de client mail et en texte, signé', () => {
    const mail = resetEmail('fr', 'Lina', 'https://hermez.dev/adam/?reset=abc');

    expect(mail.html).toContain('<table');
    expect(mail.html).toContain('href="https://hermez.dev/adam/?reset=abc"');
    expect(mail.html).not.toMatch(/<style|class=/u);
    expect(mail.text).toContain('https://hermez.dev/adam/?reset=abc');
    expect(mail.text).toContain('Bonjour Lina,');
    expect(mail.text.trim().endsWith('Un produit Hermez')).toBe(true);
    expect(resetEmail('en', 'Lina', 'https://x/').text.trim().endsWith('A Hermez product')).toBe(true);
  });

  it('échappe le pseudo dans le HTML', () => {
    expect(resetEmail('fr', '<b>Ève</b>', 'https://x/').html).toContain('&lt;b&gt;Ève&lt;/b&gt;');
  });
});
