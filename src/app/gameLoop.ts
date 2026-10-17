/**
 * L'horloge de la simulation : un pas fixe de `STEP_MS`, rattrapé image par
 * image. Le rendu tourne à la fréquence de l'écran et interpole entre deux
 * pas (`alpha`).
 */
import { HASTEN } from '../data/dayNight.ts';
import { STEP_MS } from '../sim/world.ts';

/**
 * Clamp anti-spirale de la mort, en pas de simulation par frame.
 *
 * Critique sur mobile : revenir sur l'onglet après deux minutes en arrière-plan
 * demanderait 2 400 ticks en une frame, ce qui gèle l'application — et comme le
 * gel rallonge le retard, elle ne s'en remet jamais. Au-delà de ce nombre de
 * ticks, on saute le temps perdu au lieu de le rattraper. Un plafond en ticks
 * et non en durée : « Passer la nuit » (×4) ne fait pas enchaîner une seconde
 * de simulation à une frame lente — 8 ticks, c'est 400 ms de jeu, assez pour
 * suivre ×4 jusqu'à 20 images par seconde.
 */
export const MAX_STEPS_PER_FRAME = 8;

/**
 * Ce qui arrête l'horloge, vu du câblage : la partie pas encore lancée,
 * la pause, un écran de célébration (victoire, ère atteinte).
 */
export interface PlayFlags {
  started: boolean;
  paused: boolean;
  celebrating: boolean;
}

export class GameLoop {
  /** Le temps de jeu dû et pas encore joué, en millisecondes. */
  private accumulator = 0;

  /**
   * Le retard repart de zéro : le temps passé sous une fenêtre qui arrête
   * l'horloge (pause, réglages, sac, cartes) ne se rattrape pas à sa fermeture.
   */
  public reset(): void {
    this.accumulator = 0;
  }

  /**
   * Le temps d'une image, à jouer. Une nuit calme que le joueur fait passer
   * (`hastened`) compte `HASTEN.speed` fois plus, la simulation n'en sait
   * rien ; `dilation` est l'arrêt sur image ou le ralenti de la vue.
   */
  public advance(deltaMs: number, hastened: boolean, dilation: number): void {
    this.accumulator += deltaMs * (hastened ? HASTEN.speed : 1) * dilation;
  }

  /** Chez l'ami, qui ne fait pas autorité : la fraction à interpoler vient des pas de l'hôte. */
  public follow(alpha: number): void {
    this.accumulator = alpha * STEP_MS;
  }

  /** Joue les pas dus, au plus `MAX_STEPS_PER_FRAME`. */
  public run(step: () => void): void {
    let steps = 0;

    while (this.accumulator >= STEP_MS) {
      // Plafond atteint : le retard est perdu, seule la fraction du pas en cours reste à interpoler.
      if (steps === MAX_STEPS_PER_FRAME) {
        this.accumulator %= STEP_MS;
        break;
      }
      steps += 1;
      step();
      this.accumulator -= STEP_MS;
    }
  }

  /** La fraction du pas en cours, de 0 à 1 : l'interpolation du rendu. */
  public get alpha(): number {
    return this.accumulator / STEP_MS;
  }
}
