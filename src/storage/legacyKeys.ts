/**
 * Le jeu s'appelait Mobile Factory : ses clés de l'appareil portaient le
 * préfixe `mobile-factory:`, elles portent maintenant `adam:`. Ce module est
 * le seul à connaître l'ancien nom (avec `client/legacy/`, la page de
 * transfert de l'ancienne adresse).
 *
 * Deux chemins, sans aucune perte :
 *
 * - même origine (GitHub Pages : `cardona.digital/mobile-factory/` et
 *   `cardona.digital/adam/` partagent leur `localStorage`) — au démarrage,
 *   `migrateLegacyKeys` copie chaque ancienne clé vers la nouvelle si celle-ci
 *   n'existe pas, puis retire l'ancienne ;
 * - autre origine (`mobile-factory.cardona.digital` → `adam.cardona.digital`) —
 *   l'ancienne adresse sert une page qui lit ses clés et les envoie, compressées,
 *   dans le fragment de l'URL (`#import=…`, jamais dans la requête ni les
 *   journaux) ; `importTransfer` les pose ici sous les mêmes règles.
 *
 * Une clé déjà présente sous le nouveau nom n'est jamais écrasée. Comme tout
 * accès au stockage, chaque opération peut lever : aucune n'empêche de jouer.
 */

/** Le préfixe d'avant le renommage. */
export const LEGACY_PREFIX = 'mobile-factory:';

/** Le préfixe des clés du jeu. */
export const KEY_PREFIX = 'adam:';

/** Le fragment d'URL qui porte les clés d'une autre origine. */
export const IMPORT_PARAM = 'import';

/** Les clés propres à un onglet, qui n'ont pas de sens ailleurs. */
const NOT_CARRIED = new Set(['tab']);

/** Ce dont la migration a besoin d'un `Storage`. */
export type MigrationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Le nom d'aujourd'hui d'une clé, ancienne ou nouvelle ; `null` si elle n'est pas du jeu. */
export function currentKey(key: string): string | null {
  if (key.startsWith(KEY_PREFIX)) return key;
  if (key.startsWith(LEGACY_PREFIX)) return KEY_PREFIX + key.slice(LEGACY_PREFIX.length);

  return null;
}

/** Pose `value` sous `key` si la clé est libre. Rend `true` si elle a été écrite. */
function adopt(storage: MigrationStorage, key: string, value: string): boolean {
  if (storage.getItem(key) !== null) return false;
  storage.setItem(key, value);

  return true;
}

/**
 * Renomme les clés `mobile-factory:*` en `adam:*` : copie si la nouvelle
 * manque, puis retire l'ancienne. Rend le nombre de clés copiées. Une ancienne
 * clé qu'on n'a pas pu copier (stockage plein) reste en place : elle sera
 * reprise au lancement suivant.
 */
export function migrateLegacyKeys(storage: MigrationStorage | null): number {
  if (!storage) return 0;

  let copied = 0;

  try {
    const legacy: string[] = [];

    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);

      if (key?.startsWith(LEGACY_PREFIX)) legacy.push(key);
    }

    for (const key of legacy) {
      const value = storage.getItem(key);
      const target = currentKey(key);

      if (value === null || target === null) continue;
      try {
        if (adopt(storage, target, value)) copied++;
        storage.removeItem(key);
      } catch {
        // Quota plein : l'ancienne clé reste, rien n'est perdu.
      }
    }
  } catch {
    // Stockage illisible : rien à migrer.
  }

  return copied;
}

/** Des octets en base64 d'URL, sans remplissage. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);

  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/**
 * Les clés à transférer, en texte d'URL : JSON, `deflate-raw`, base64 d'URL.
 * C'est ce que fait la page de transfert (`client/legacy/index.html`) ; ici
 * pour les tests.
 */
export async function encodeTransfer(entries: Readonly<Record<string, string>>): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(entries));

  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** L'inverse d'`encodeTransfer` ; `null` si le texte ne se relit pas. */
export async function decodeTransfer(text: string): Promise<Record<string, string> | null> {
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(text), new DecompressionStream('deflate-raw')));
    const parsed: unknown = JSON.parse(json);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return null;
  }
}

/** Le texte du fragment `#import=…`, ou `null` s'il n'y en a pas. */
export function transferOf(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));

  return params.get(IMPORT_PARAM);
}

/** L'adresse sans son fragment d'import : ce que la barre d'adresse doit montrer ensuite. */
export function withoutTransfer(href: string): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));

  params.delete(IMPORT_PARAM);
  url.hash = params.toString();

  return url.href;
}

/**
 * Pose les clés reçues d'une autre origine, sous leur nom d'aujourd'hui, sans
 * jamais écraser une clé déjà là. Rend le nombre de clés écrites.
 */
export async function importTransfer(storage: MigrationStorage | null, text: string): Promise<number> {
  const entries = await decodeTransfer(text);

  if (!storage || !entries) return 0;

  let written = 0;

  for (const [key, value] of Object.entries(entries)) {
    const target = currentKey(key);

    if (target === null || NOT_CARRIED.has(target.slice(KEY_PREFIX.length))) continue;
    try {
      if (adopt(storage, target, value)) written++;
    } catch {
      // Quota plein : cette clé ne passe pas, les autres si.
    }
  }

  return written;
}

/**
 * Au démarrage, avant toute lecture de l'appareil : importe un transfert venu
 * de l'ancienne adresse (puis efface le fragment), renomme les anciennes clés,
 * et retire l'ancien service worker et ses caches, restés sous
 * `/mobile-factory/` sur la même origine.
 */
export async function adoptLegacyData(): Promise<void> {
  let storage: MigrationStorage | null;

  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    storage = null;
  }

  const transfer = transferOf(window.location.hash);

  if (transfer !== null) {
    await importTransfer(storage, transfer);
    history.replaceState(history.state, '', withoutTransfer(window.location.href));
  }

  migrateLegacyKeys(storage);
  void dropLegacyWorker();
}

/** Désinscrit le service worker de l'ancien chemin et supprime ses caches. */
async function dropLegacyWorker(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        if (new URL(registration.scope).pathname.startsWith('/mobile-factory/')) await registration.unregister();
      }
    }
    if ('caches' in globalThis) {
      for (const key of await caches.keys()) if (key.startsWith('mobile-factory-')) await caches.delete(key);
    }
  } catch {
    // Rien de grave : l'ancien worker ne sert plus que l'ancien chemin.
  }
}
