// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { AccountClient } from '../net/account.ts';
import type { Connection } from '../net/connection.ts';
import { LocalAccount } from '../storage/localAccount.ts';
import { AccountPanel } from './accountPanel.ts';

const USER = { id: 1, nickname: 'Adam', email: 'adam@example.com' };
const ONLINE = { enabled: true, online: true, subscribe: () => () => {} } as unknown as Connection;

function memory() {
  const data = new Map<string, string>();

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function setup(answer: (path: string, body: Record<string, unknown>) => { status: number; body: unknown }) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = JSON.parse((init.body as string | undefined) ?? '{}') as Record<string, unknown>;
    const reply = answer(path, body);

    calls.push({ path, body });

    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
  }) as unknown as typeof fetch;
  const client = new AccountClient('http://x', new LocalAccount(memory()), fetcher);
  const panel = new AccountPanel(client, ONLINE);

  document.body.replaceChildren(panel.root);

  const input = (name: string) => panel.root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const visible = (name: string) => !input(name).closest('label')!.hidden;
  const button = (label: string) => [...panel.root.querySelectorAll('button')].find((b) => b.textContent === label && !b.hidden)!;
  const status = () => panel.root.querySelector('.account-status')!.textContent;
  const submit = async () => {
    panel.root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  return { client, panel, calls, input, visible, button, status, submit };
}

describe('AccountPanel — mot de passe oublié', () => {
  it('mène de la connexion au formulaire d’adresse, puis à un message neutre', async () => {
    const { panel, calls, input, visible, button, status, submit } = setup(() => ({ status: 200, body: { ok: true } }));

    panel.show();
    button('Mot de passe oublié ?').click();
    expect(visible('email')).toBe(true);
    expect(visible('password')).toBe(false);
    expect(document.activeElement).toBe(input('email'));

    input('email').value = ' Adam@Example.com ';
    await submit();
    expect(calls).toEqual([{ path: '/auth/forgot', body: { email: 'adam@example.com', locale: 'fr' } }]);
    expect(status()).toContain('Si un compte existe');
    expect(visible('email')).toBe(false);
    expect(document.activeElement).toBe(button('Retour à la connexion'));

    button('Retour à la connexion').click();
    expect(visible('password')).toBe(true);
  });

  it('ouvre la page du lien : deux fois le même mot de passe, puis connecte le joueur', async () => {
    const { panel, client, calls, input, visible, status, submit } = setup(() => ({ status: 200, body: { ok: true, token: 'n', user: USER } }));
    let done = 0;

    panel.showReset('jeton', () => (done += 1));
    expect(visible('password') && visible('confirm')).toBe(true);
    expect(visible('email')).toBe(false);

    input('password').value = 'court';
    input('confirm').value = 'court';
    await submit();
    expect(calls).toHaveLength(0);
    expect(input('password').getAttribute('aria-invalid')).toBe('true');

    input('password').value = 'un-nouveau-secret';
    input('confirm').value = 'un-autre-secret';
    await submit();
    expect(calls).toHaveLength(0);
    expect(input('confirm').getAttribute('aria-invalid')).toBe('true');

    input('confirm').value = 'un-nouveau-secret';
    await submit();
    expect(calls).toEqual([{ path: '/auth/reset', body: { token: 'jeton', password: 'un-nouveau-secret' } }]);
    expect(client.user).toEqual(USER);
    expect(status()).toContain('Mot de passe changé');
    expect(done).toBe(1);
  });

  it('dit qu’un lien expiré ne vaut plus et propose d’en demander un autre', async () => {
    const { panel, input, visible, button, status, submit } = setup(() => ({ status: 400, body: { ok: false, error: 'badToken' } }));
    let done = 0;

    panel.showReset('vieux', () => (done += 1));
    input('password').value = 'un-nouveau-secret';
    input('confirm').value = 'un-nouveau-secret';
    await submit();
    expect(status()).toContain('expiré');

    button('Demander un nouveau lien').click();
    expect(visible('email')).toBe(true);
    expect(done).toBe(1);
  });

  it('garde le focus quand un autre écran le prend derrière elle', async () => {
    const { panel, input } = setup(() => ({ status: 200, body: { ok: true } }));
    const behind = document.createElement('button');

    document.body.append(behind);
    panel.showReset('jeton', () => {});
    expect(document.activeElement).toBe(input('password'));
    behind.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(input('password'));
  });
});
