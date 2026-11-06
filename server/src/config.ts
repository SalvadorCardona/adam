/**
 * La configuration du serveur, tout entière lue dans l'environnement — le
 * `.env` en local (`.env.example` en donne la liste), les variables du
 * conteneur en production. Une valeur absente prend celle du développement ;
 * une valeur illisible arrête le démarrage plutôt que de tourner de travers.
 */

import { existsSync } from 'node:fs';

export interface ServerConfig {
  /** Port HTTP et WebSocket (le même serveur). */
  readonly port: number;
  /** Adresse d'écoute : `0.0.0.0` dans un conteneur. */
  readonly host: string;
  /** Fichier SQLite ; `:memory:` pour une base jetable. */
  readonly databasePath: string;
  /**
   * Origines du navigateur autorisées (CORS et WebSocket) ; `*` les accepte
   * toutes, `http://localhost:*` cet hôte sur tout port.
   */
  readonly corsOrigins: readonly string[];
  /** Combien de temps une invitation reste valable, en millisecondes. */
  readonly inviteTtlMs: number;
  /** L'envoi des e-mails (mot de passe oublié). */
  readonly mail: MailConfig;
}

/**
 * L'envoi des e-mails, par l'API transactionnelle de Brevo. Sans clé (`apiKey`
 * à `null` : le développement, les tests), l'e-mail est écrit dans les
 * journaux au lieu de partir, et le serveur démarre quand même.
 */
export interface MailConfig {
  /** `BREVO_API_KEY` ; `null` : rien ne part, tout va aux journaux. */
  readonly apiKey: string | null;
  /** L'expéditeur, `MAIL_FROM` : une adresse validée chez Brevo. Obligatoire avec une clé. */
  readonly from: string;
  /** Son nom affiché, `MAIL_FROM_NAME`. */
  readonly fromName: string;
  /** L'adresse publique du jeu, `PUBLIC_URL` : les liens des e-mails y mènent. */
  readonly publicUrl: string;
}

/** L'adresse du jeu en ligne, où mènent les liens des e-mails. */
export const DEFAULT_PUBLIC_URL = 'https://hermez.dev/adam/';
export const DEFAULT_MAIL_FROM_NAME = 'Adam';

/** Une invitation vaut une heure par défaut ; réglable de 1 minute à 24 heures. */
export const DEFAULT_INVITE_MINUTES = 60;
const MAX_INVITE_MINUTES = 24 * 60;

/** Le port par défaut : celui que le client vise en développement (`.env.online`). */
export const DEFAULT_PORT = 8790;

/**
 * Les origines par défaut : le serveur de Vite, en local, quel que soit son
 * port (5173 pris, il passe au suivant), et les adresses publiques du jeu —
 * hermez.dev, puis les anciennes, qu'un client encore en cache peut appeler
 * pendant la transition.
 */
const DEFAULT_ORIGINS = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'https://hermez.dev',
  'https://cardona.digital',
  'https://adam.cardona.digital',
  'https://mobile-factory.cardona.digital',
];

/** Le fichier de la base, par défaut. */
const DEFAULT_DATABASE = 'data/adam.sqlite';

/**
 * Le nom de la base suit celui du jeu : un `DATABASE_PATH` resté à l'ancien
 * nom prend le nouveau, et `openDatabase` renomme le fichier au démarrage.
 */
export function currentDatabasePath(path: string): string {
  return path.replace(/mobile-factory(?=[^/\\]*$)/, 'adam');
}

/**
 * L'environnement du processus, complété par `.env` s'il existe dans le
 * dossier courant (`server/` en dev). Une variable déjà posée garde sa
 * valeur : le conteneur a le dernier mot. (Pas `--env-file-if-exists` :
 * avec `--watch`, Node plante quand le fichier manque.)
 */
export function readEnv(file = '.env'): NodeJS.ProcessEnv {
  if (existsSync(file)) process.loadEnvFile(file);

  return process.env;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): ServerConfig {
  const port = Number(env['PORT'] ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`PORT invalide : ${env['PORT']}`);

  const minutes = Number(env['INVITE_TTL_MINUTES'] ?? DEFAULT_INVITE_MINUTES);

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_INVITE_MINUTES) {
    throw new Error(`INVITE_TTL_MINUTES invalide : ${env['INVITE_TTL_MINUTES']}`);
  }

  const origins = (env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

  const apiKey = env['BREVO_API_KEY']?.trim() || null;
  const from = env['MAIL_FROM']?.trim() ?? '';

  if (apiKey && !/^[^\s@]+@[^\s@]+$/u.test(from)) throw new Error(`MAIL_FROM invalide (obligatoire avec BREVO_API_KEY) : ${env['MAIL_FROM'] ?? ''}`);

  const publicUrl = env['PUBLIC_URL']?.trim() || DEFAULT_PUBLIC_URL;

  if (!URL.canParse(publicUrl) || !/^https?:$/u.test(new URL(publicUrl).protocol)) throw new Error(`PUBLIC_URL invalide : ${publicUrl}`);

  return {
    port,
    host: env['HOST'] || '0.0.0.0',
    databasePath: currentDatabasePath(env['DATABASE_PATH'] || DEFAULT_DATABASE),
    corsOrigins: origins.length > 0 ? origins : DEFAULT_ORIGINS,
    inviteTtlMs: minutes * 60_000,
    mail: { apiKey, from, fromName: env['MAIL_FROM_NAME']?.trim() || DEFAULT_MAIL_FROM_NAME, publicUrl },
  };
}

/** Cette origine a-t-elle le droit de parler au serveur ? */
export function originAllowed(config: ServerConfig, origin: string | undefined): boolean {
  // Sans en-tête Origin, ce n'est pas un navigateur (curl, sonde du conteneur) : CORS ne le concerne pas.
  if (origin === undefined) return true;

  return config.corsOrigins.some(
    (allowed) =>
      allowed === '*' ||
      allowed === origin ||
      (allowed.endsWith(':*') && new RegExp(`^${escapeRegExp(allowed.slice(0, -2))}:\\d+$`).test(origin)),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
