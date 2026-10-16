import { BUILDINGS } from '../data/buildings.ts';
import { NIGHT_STAKES } from '../data/dayNight.ts';
import type { World } from '../sim/world.ts';

/**
 * Le danger de la mairie, de 0 (au-dessus de la moitié de ses PV, ou en
 * chantier) à 1 (à zéro) : la vignette, le repère de bord et le battement
 * sourd s'y calent.
 */
export function hallDanger(world: World): number {
  const hall = world.entities.get(world.townHallId);

  if (!hall || hall.kind === 'site' || world.defeated) return 0;

  const ratio = hall.hp / BUILDINGS[hall.proto].hp;

  return Math.max(0, Math.min(1, (NIGHT_STAKES.hallLowRatio - ratio) / NIGHT_STAKES.hallLowRatio));
}
