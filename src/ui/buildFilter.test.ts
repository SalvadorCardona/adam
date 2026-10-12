import { describe, expect, it } from 'vitest';
import { BUILDING_CATEGORIES, BUILDINGS, MENU_BUILDING_IDS, type BuildingCategory, type BuildingId } from '../data/buildings.ts';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { setLocale, t } from '../i18n/locale.ts';
import { stageScenario } from '../sim/testScenario.ts';
import { BuildFilter, filterCards, type FilterCard } from './buildFilter.ts';
import { buildingTerms } from './buildSearch.ts';

/** Les cartes du menu, toutes débloquées sauf `locked`, cherchées en français (nom, métier, produits). */
function cards(locked: readonly BuildingId[] = []): Map<BuildingId, FilterCard> {
  setLocale('fr');
  return new Map(
    MENU_BUILDING_IDS.map((id) => [id, { category: BUILDINGS[id].category, terms: buildingTerms(id, t()), shown: !locked.includes(id) }]),
  );
}

function ids(visible: Set<BuildingId>): BuildingId[] {
  return [...visible].sort();
}

describe('catégories des bâtiments', () => {
  it('chaque bâtiment a une famille connue, et chaque famille a au moins un bâtiment du menu', () => {
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) expect(Object.keys(BUILDING_CATEGORIES), id).toContain(BUILDINGS[id].category);
    for (const category of Object.keys(BUILDING_CATEGORIES) as BuildingCategory[]) {
      expect(MENU_BUILDING_IDS.some((id) => BUILDINGS[id].category === category), category).toBe(true);
    }
  });

  it('Minerai : la foreuse et la carrière', () => {
    expect(MENU_BUILDING_IDS.filter((id) => BUILDINGS[id].category === 'ore').sort()).toEqual(['drill', 'quarry']);
  });
});

describe('filterCards', () => {
  it('« Tous » montre tout ce qui est au menu, avec une puce par famille', () => {
    const view = filterCards(cards(), 'all', '');

    expect(view.active).toBe('all');
    expect(view.visible.size).toBe(MENU_BUILDING_IDS.length);
    expect(view.chips.map((chip) => chip.filter)).toEqual(['all', ...Object.keys(BUILDING_CATEGORIES)]);
    expect(view.chips[0]?.count).toBe(MENU_BUILDING_IDS.length);
    expect(view.elsewhere).toBeNull();
  });

  it('une famille ne montre que ses bâtiments', () => {
    expect(ids(filterCards(cards(), 'ore', '').visible)).toEqual(['drill', 'quarry']);
    expect(ids(filterCards(cards(), 'defense', '').visible)).toEqual(['archerTower', 'barracks', 'palisade', 'watchtower']);
  });

  it('un bâtiment verrouillé ne compte pas, et une famille toute verrouillée n’a pas de puce', () => {
    const view = filterCards(cards(['forge', 'charcoalKiln', 'watchtower', 'barracks', 'archerTower', 'palisade']), 'production', '');

    expect(view.visible.has('forge')).toBe(false);
    expect(view.visible.has('well')).toBe(true);
    expect(view.chips.find((chip) => chip.filter === 'production')?.count).toBe(
      MENU_BUILDING_IDS.filter((id) => BUILDINGS[id].category === 'production').length - 2,
    );
    expect(view.chips.some((chip) => chip.filter === 'defense')).toBe(false);
    expect(view.chips.every((chip) => chip.count > 0)).toBe(true);
  });

  it('une famille choisie qui n’a plus de carte retombe sur « Tous »', () => {
    const view = filterCards(cards(['watchtower', 'barracks', 'archerTower', 'palisade']), 'defense', '');

    expect(view.active).toBe('all');
    expect(view.visible.size).toBe(MENU_BUILDING_IDS.length - 4);
  });

  it('le texte et la famille s’appliquent ensemble', () => {
    expect(ids(filterCards(cards(), 'production', 'four').visible)).toEqual(['charcoalKiln']);
    expect(ids(filterCards(cards(), 'all', 'poste').visible)).toEqual(['constructionPost', 'logisticsPost']);
    expect(ids(filterCards(cards(), 'logistics', 'poste').visible)).toEqual(['constructionPost', 'logisticsPost']);
  });

  it('la famille n’a rien pour le texte mais « Tous » si : la vue le dit', () => {
    const view = filterCards(cards(), 'ore', 'poste');

    expect(view.visible.size).toBe(0);
    expect(view.elsewhere).toEqual({ filter: 'all', count: 2 });
  });

  it('rien nulle part : pas de renvoi vers « Tous »', () => {
    const view = filterCards(cards(), 'ore', 'zzz');

    expect(view.visible.size).toBe(0);
    expect(view.elsewhere).toBeNull();
  });

  it('un bâtiment verrouillé ne sort pas d’une recherche', () => {
    expect(filterCards(cards(['forge']), 'all', 'forge').visible.has('forge')).toBe(false);
  });

  it('le texte est celui de la recherche : métier et produits comptent aussi', () => {
    expect(ids(filterCards(cards(), 'production', 'FORESTIER').visible)).toEqual(['foresterHouse']);
    expect(filterCards(cards(), 'production', 'bois').visible.has('lumberCamp')).toBe(true);
    expect(filterCards(cards(), 'all', '  ').visible.size).toBe(MENU_BUILDING_IDS.length);
  });

  it('dans une vraie partie, rien de ce que le menu cache n’entre dans une puce', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const shown = new Map(
      MENU_BUILDING_IDS.map((id) => [
        id,
        { category: BUILDINGS[id].category, terms: [id], shown: world.inMenu(id) && !world.atLimit(id) },
      ]),
    );
    const view = filterCards(shown, 'production', '');

    expect(world.inMenu('forge')).toBe(false);
    expect(view.visible.has('forge')).toBe(false);
    expect(view.visible.has('well')).toBe(true);
    expect(view.chips[0]?.count).toBe([...shown.values()].filter((card) => card.shown).length);
  });
});

describe('BuildFilter', () => {
  it('rouvrir le tiroir garde la famille et vide la recherche', () => {
    const filter = new BuildFilter();

    filter.choose('ore');
    filter.search('fore');
    expect(ids(filter.view(cards()).visible)).toEqual(['drill']);

    filter.open();
    expect(filter.category).toBe('ore');
    expect(filter.query).toBe('');
    expect(ids(filter.view(cards()).visible)).toEqual(['drill', 'quarry']);
  });

  it('part sur « Tous »', () => {
    expect(new BuildFilter().category).toBe('all');
  });
});
