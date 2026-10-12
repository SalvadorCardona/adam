/**
 * Armes — contenu pur.
 *
 * Toutes tirent des flèches, toutes sont automatiques : le joueur n'a pas de
 * bouton, la tour de guet non plus. Une arme cherche le mutant le plus proche
 * à portée et tire dès que son délai est écoulé.
 */

export interface WeaponProto {
  label: string;
  /** Portée, en tuiles, depuis le tireur. */
  range: number;
  /** Ticks entre deux flèches. */
  cooldown: number;
  /** Points de vie retirés par flèche. */
  damage: number;
  /** Vitesse de la flèche, en tuiles par seconde. */
  arrowSpeed: number;
}

export const WEAPONS = {
  /** L'arc d'Adam : porté en permanence, cf. `LORE.weapons.bow`. */
  bow: { label: 'Arc de fortune', range: 6, cooldown: 14, damage: 1, arrowSpeed: 16 },
  /** L'arc de la tour de guet : plus loin, un peu plus lent. */
  towerBow: { label: 'Arc de tour', range: 8, cooldown: 18, damage: 1, arrowSpeed: 16 },
  /** L'arc de la tour renforcée : deux tuiles de plus, 30 % plus rapide (18 / 1,3 ≈ 14). */
  /** Les arcs de la tour d'archers, ses deux archers à leur poste : plus loin et plus fort qu'une tour de guet. */
  archerBow: { label: 'Arcs d’archers', range: 9, cooldown: 12, damage: 1.5, arrowSpeed: 18 },
  reinforcedBow: { label: 'Arc renforcé', range: 10, cooldown: 14, damage: 1, arrowSpeed: 16 },
} as const satisfies Record<string, WeaponProto>;

export type WeaponId = keyof typeof WEAPONS;
