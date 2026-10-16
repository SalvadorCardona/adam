/**
 * Le classement de la carte du jour, côté client : un score déposé au serveur
 * s'il y en a un et si le joueur a une session. Jamais d'exception, jamais
 * d'attente : sans serveur, hors ligne ou refusé, le meilleur score reste
 * sur l'appareil (`adam:daily`) et le jeu ne le sait pas.
 */

import { dailyPath } from '../../shared/api.ts';

/** Dépose `score` pour `date`. `true` si le serveur l'a pris. */
export async function submitDailyScore(baseUrl: string | null, token: string | null, date: string, score: number): Promise<boolean> {
  if (baseUrl === null || token === null) return false;

  try {
    const response = await fetch(new URL(dailyPath(date), baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ score }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
