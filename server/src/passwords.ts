/**
 * Le hachage des mots de passe : Argon2id, celui que `node:crypto` embarque
 * depuis Node 24.7 — aucun module natif à compiler, comme `node:sqlite`.
 * Réglages de l'OWASP (19 Mio, deux passes, un fil) : environ 80 ms par
 * hachage, assez pour qu'une attaque par force brute coûte cher.
 *
 * Le hachage se range en une chaîne qui porte ses propres réglages
 * (`argon2id$m$t$p$sel$empreinte`) : relever le coût plus tard ne casse pas
 * les comptes déjà créés. Un mot de passe n'est jamais écrit nulle part, ni
 * dans la base ni dans les journaux.
 */

import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

const MEMORY_KIB = 19_456;
const PASSES = 2;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function derive(password: string, salt: Buffer, memory: number, passes: number, parallelism: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      { message: password, nonce: salt, memory, passes, parallelism, tagLength: HASH_BYTES },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, MEMORY_KIB, PASSES, PARALLELISM);

  return ['argon2id', MEMORY_KIB, PASSES, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Le mot de passe correspond-il à ce hachage ? Un hachage illisible ne correspond à rien. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, memory, passes, parallelism, salt, hash] = stored.split('$');

  if (kind !== 'argon2id' || !memory || !passes || !parallelism || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(memory), Number(passes), Number(parallelism));

  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Un hachage valide que personne ne peut retrouver : on le vérifie quand
 * l'adresse est inconnue, pour qu'« adresse inconnue » et « mauvais mot de
 * passe » mettent le même temps à répondre.
 */
export const DECOY_HASH = await hashPassword(randomBytes(16).toString('hex'));
