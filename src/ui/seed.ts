/**
 * La seed de la partie, montrée et partagée.
 *
 * Une seed, c'est une carte : `?seed=1234` la rouvre à l'identique. On
 * l'affiche en pause et à la défaite (« Carte n° 1 234 »), on la partage en
 * lien — Web Share sur téléphone, presse-papiers sinon — et « Rejouer cette
 * carte » y revient. Les fonctions pures d'abord (testées en Node), le DOM
 * ensuite.
 */

import { onLocale, t } from '../i18n/locale.ts';
import type { Disposer } from './disposer.ts';

/** Le paramètre d'URL qui porte la seed. */
const SEED_PARAM = 'seed';

/** Combien de temps « Lien copié » reste affiché sur le bouton. */
const FEEDBACK_MS = 2000;

/** La seed de `?seed=1234`, ou `null` si l'URL n'en donne pas de lisible. */
export function parseSeed(search: string): number | null {
  const raw = new URLSearchParams(search).get(SEED_PARAM);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);

  return Number.isFinite(parsed) ? parsed >>> 0 : null;
}

/** « 1 234 567 » : les milliers séparés par une espace insécable, lisible à voix haute. */
export function formatSeed(seed: number): string {
  return String(seed).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/**
 * L'adresse de la carte : la page courante, `?seed=` remplacé (ou retiré si
 * `seed` est `null`, pour une carte neuve). Les autres paramètres restent —
 * `?debug` survit à un « Rejouer ».
 */
export function mapUrl(href: string, seed: number | null): string {
  const url = new URL(href);

  if (seed === null) url.searchParams.delete(SEED_PARAM);
  else url.searchParams.set(SEED_PARAM, String(seed));
  url.hash = '';
  return url.toString();
}

/** L'adresse à partager : la carte, et rien d'autre de la page. */
export function shareUrl(href: string, seed: number): string {
  const url = new URL(href);

  url.search = '';
  return mapUrl(url.toString(), seed);
}

/**
 * « Carte n° 1 234 567 · Partager cette carte » : la ligne discrète des
 * écrans pause et défaite. `disposer` : qui rend son abonnement à la langue
 * quand l'écran est défait ; sans lui, la ligne suit la langue pour toujours.
 */
export function seedLine(seed: number, disposer?: Disposer): HTMLElement {
  const line = document.createElement('div');

  line.className = 'seed-line';

  const label = document.createElement('span');

  label.className = 'seed-label';

  const share = document.createElement('button');
  let reset = 0;

  share.type = 'button';
  share.className = 'seed-share';
  share.addEventListener('click', () => {
    void shareMap(seed).then((outcome) => {
      if (outcome === 'shared') return;
      share.textContent = outcome === 'copied' ? t().screens.seed.copied : t().screens.seed.copyFailed;
      window.clearTimeout(reset);
      reset = window.setTimeout(() => {
        share.textContent = t().screens.seed.share;
      }, FEEDBACK_MS);
    });
  });
  // La ligne vit aussi longtemps que son écran (pause, défaite) : elle suit la langue.
  const unsubscribe = onLocale(() => {
    label.textContent = t().screens.seed.map(formatSeed(seed));
    share.textContent = t().screens.seed.share;
  });

  disposer?.add(unsubscribe);

  line.append(label, share);
  return line;
}

/**
 * Partage le lien de la carte : la feuille de partage du téléphone si le
 * navigateur en a une, le presse-papiers sinon. Un partage annulé par le
 * joueur n'est pas un échec : on ne copie pas dans son dos.
 */
async function shareMap(seed: number): Promise<'shared' | 'copied' | 'failed'> {
  const url = shareUrl(window.location.href, seed);

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: document.title, text: t().screens.seed.map(formatSeed(seed)), url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
