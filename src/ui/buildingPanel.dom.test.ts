// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { CHAPTERS } from '../data/objectives.ts';
import { QUEST_IDS } from '../data/quests.ts';
import { RESEARCH_IDS } from '../data/research.ts';
import { setLocale } from '../i18n/locale.ts';
import { TILE_SIZE } from '../core/grid.ts';
import { finish } from '../sim/defenseKit.ts';
import type { EntityId } from '../sim/types.ts';
import { World } from '../sim/world.ts';
import { BuildingPanel } from './buildingPanel.ts';

/*
 * La fenêtre d'un bâtiment dans un faux DOM : une vue par sorte de bâtiment,
 * chantier puis bâtiment fini. Elle ne juge pas la mise en page (happy-dom n'a
 * pas de moteur de rendu : le test Playwright le fait), seulement que la vue
 * s'ouvre, se remplit, et ne montre que ce que la sorte permet.
 */

beforeAll(() => setLocale('fr'));

/** Un bâtiment de chaque sorte (le premier qu'on sait poser), sur un terrain libre autour de la mairie. */
function oneOfEachKind(): BuildingId[] {
  const seen = new Set<string>();

  return (Object.keys(BUILDINGS) as BuildingId[]).filter((id) => {
    const { kind } = BUILDINGS[id];

    if (kind === 'townHall' || seen.has(kind)) return false;
    seen.add(kind);
    return true;
  });
}

/** Une partie où tout est débloqué et exploré : seule la place compte pour poser. */
function openWorld(): World {
  const world = new World(42);

  world.researchDone = [...RESEARCH_IDS];
  world.questsDone = QUEST_IDS.length;
  world.chapter = CHAPTERS.length;
  world.push({ type: 'setFog', enabled: false });
  world.tick();
  return world;
}

/** Ouvre un chantier de `building` quelque part où l'on peut poser ; `null` si aucune case ne l'accepte. */
function openSite(world: World, building: BuildingId): EntityId | null {
  const hall = world.entities.get(world.townHallId);

  if (!hall) throw new Error('pas de mairie');
  for (let radius = 6; radius <= 30; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

        const tx = hall.tx + dx;
        const ty = hall.ty + dy;

        world.player.x = (tx + 0.5) * TILE_SIZE;
        world.player.y = (ty + 3.5) * TILE_SIZE;
        if (world.canPlace(building, tx, ty) !== null) continue;

        const before = new Set(world.entities.keys());

        world.push({ type: 'placeBuilding', building, tx, ty });
        world.tick();

        const id = [...world.entities.keys()].find((key) => !before.has(key));

        if (id !== undefined) return id;
      }
    }
  }
  return null;
}

describe('la fenêtre d’un bâtiment', () => {
  const kinds = oneOfEachKind();

  it('couvre toutes les sortes de bâtiment', () => {
    expect(kinds.length).toBeGreaterThanOrEqual(15);
  });

  it.each(kinds)('%s : la vue du chantier puis du bâtiment fini s’ouvre et porte un titre', (building) => {
    const world = openWorld();
    const hall = finish(world, world.townHallId);
    const panel = new BuildingPanel(world);

    document.body.append(panel.root);
    world.player.x = world.player.prevX = (hall.tx + hall.width / 2) * TILE_SIZE;
    world.player.y = world.player.prevY = (hall.ty + hall.height + 0.5) * TILE_SIZE;

    const id = openSite(world, building);

    expect(id, `aucune case pour ${building}`).not.toBeNull();
    panel.show(id!);
    expect(panel.root.hidden).toBe(false);
    expect(panel.root.querySelector('h2')?.textContent ?? '').not.toBe('');

    // L'antenne, trop chère pour le sac, reste un chantier : on ne juge que cette vue-là.
    if (building === 'antenna') {
      panel.close();
      panel.root.remove();
      return;
    }

    const built = finish(world, id!);

    expect(built.kind).not.toBe('site');
    panel.show(built.id);
    panel.update();
    expect(panel.root.hidden).toBe(false);
    expect(panel.root.querySelector('h2')?.textContent ?? '').not.toBe('');
    // Un bâtiment fini n'a plus de bouton « Annuler le chantier » à l'écran.
    const cancel = panel.root.querySelector<HTMLElement>('[data-tone="cancel"]');

    if (BUILDINGS[building].kind !== 'decor') expect(cancel === null || cancel.hidden).toBe(true);
    panel.close();
    expect(panel.root.hidden).toBe(true);
    panel.root.remove();
  });

  it('se ferme d’elle-même quand le bâtiment tombe', () => {
    const world = new World(42);
    const panel = new BuildingPanel(world);

    panel.show(world.townHallId);
    expect(panel.root.hidden).toBe(false);
    world.entities.delete(world.townHallId);
    panel.update();
    expect(panel.root.hidden).toBe(true);
  });
});
