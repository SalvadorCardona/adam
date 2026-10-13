import { describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingId, type BuildingUpgrade } from './buildings.ts';
import { ITEMS } from './items.ts';
import { QUESTS } from './quests.ts';
import { RECIPES, type RecipeProto } from './recipes.ts';
import { RESEARCH, type ResearchProto } from './research.ts';
import { validatePrototypes } from './validate.ts';

describe('prototypes', () => {
  it('passe la validation du démarrage', () => {
    expect(validatePrototypes()).toEqual([]);
  });

  /*
   * Noté sur la page projet comme manquant. Le test est là moins pour l'objet
   * lui-même que pour le contrat : un objet du jeu a un libellé français et
   * une taille de pile.
   */
  it('contient le bois', () => {
    expect(ITEMS.wood).toEqual({ label: 'Bois', stack: 100 });
  });

  it('n’a aucune recette orpheline', () => {
    for (const recipe of Object.values(RECIPES)) {
      expect(Object.keys(BUILDINGS)).toContain(recipe.building);
    }
  });

  it('refuse une recherche dont la statistique ne concerne aucun bâtiment au menu', () => {
    const farm = BUILDINGS.farm as { menu: boolean };
    const menu = farm.menu;
    const research = RESEARCH.fastDrills as ResearchProto;
    const effect = research.effect;

    research.effect = { stat: 'farmYield', amount: 1 };
    farm.menu = false;
    try {
      expect(validatePrototypes()).toContain('RESEARCH.fastDrills : « farmYield » ne concerne aucun bâtiment au menu');
    } finally {
      research.effect = effect;
      farm.menu = menu;
    }
    expect(validatePrototypes()).toEqual([]);
  });

  it('refuse un objet récoltable sans débouché', () => {
    // Sans la forge, l'aciérie, les recherches au charbon du labo ni l'étage 2 de l'antenne, le charbon ne servirait à rien : la validation doit le dire.
    const forge = RECIPES.smeltPlate as RecipeProto;
    const steel = RECIPES.castSteel as RecipeProto;
    const researches = [RESEARCH.fastDrills, RESEARCH.purification, RESEARCH.charcoalFilters, RESEARCH.steelmaking] as ResearchProto[];
    const floor = BUILDINGS.antenna.upgrades[0] as BuildingUpgrade;
    const inputs = forge.inputs;
    const steelInputs = steel.inputs;
    const costs = researches.map((research) => research.cost);
    const floorCost = floor.cost;

    forge.inputs = { ironOre: 2 };
    steel.inputs = { ironPlate: 2 };
    for (const research of researches) research.cost = { ironOre: 10 };
    floor.cost = { ironPlate: 40, radCore: 1 };
    try {
      expect(validatePrototypes()).toContain(
        "ITEMS.coal : aucun débouché — ni coût de bâtiment ou d'amélioration, ni entrée de recette, ni coût de recherche, ni besoin",
      );
    } finally {
      forge.inputs = inputs;
      steel.inputs = steelInputs;
      researches.forEach((research, index) => (research.cost = costs[index]!));
      floor.cost = floorCost;
    }
    expect(validatePrototypes()).toEqual([]);
  });

  it('refuse une quête qui demande un bâtiment qu’on ne trouve qu’au labo', () => {
    const goal = QUESTS.housing.goal as { building: BuildingId };
    const building = goal.building;

    goal.building = 'clinic';
    try {
      expect(validatePrototypes()).toContain("QUESTS.housing : demande « clinic », qui n'arrive qu'au labo");
    } finally {
      goal.building = building;
    }
    expect(validatePrototypes()).toEqual([]);
  });

  it('refuse un bâtiment débloqué par deux recherches', () => {
    const boots = RESEARCH.walkingBoots as ResearchProto;
    const unlocks = boots.unlocks;

    boots.unlocks = ['forge'];
    try {
      expect(validatePrototypes()).toContain('RESEARCH.walkingBoots : « forge » déjà débloqué par metalworking');
    } finally {
      boots.unlocks = unlocks;
    }
  });

  it('refuse un bâtiment du menu qui n’entre jamais au menu d’une colonie neuve', () => {
    const mining = RESEARCH.mining as ResearchProto;
    const opens = mining.opens;

    mining.opens = ['quarry'];
    try {
      expect(validatePrototypes()).toContain("BUILDINGS.drill : n'entre jamais au menu d'une colonie neuve");
    } finally {
      mining.opens = opens;
    }
    expect(validatePrototypes()).toEqual([]);
  });

  it('refuse un objectif qui demande un bâtiment dont la recherche coûte du butin', () => {
    const mining = RESEARCH.mining as ResearchProto;
    const cost = mining.cost;

    mining.cost = { wood: 10, wolfFang: 2 };
    try {
      expect(validatePrototypes()).toContain('OBJECTIVES[3] : demande « drill », dont la recherche coûte du butin');
    } finally {
      mining.cost = cost;
    }
    expect(validatePrototypes()).toEqual([]);
  });

  it('refuse une recette sans bâtiment capable', () => {
    const recipe = RECIPES.smeltPlate as unknown as Omit<RecipeProto, 'building'> & { building: BuildingId };
    const building = recipe.building;
    const forge = BUILDINGS.forge as { menu: boolean };

    recipe.building = 'absent' as BuildingId;
    try {
      expect(validatePrototypes()).toContain('RECIPES.smeltPlate : bâtiment inconnu « absent »');
    } finally {
      recipe.building = building;
    }
    forge.menu = false;
    try {
      expect(validatePrototypes()).toContain("RECIPES.smeltPlate : « forge » n'est pas constructible");
    } finally {
      forge.menu = true;
    }
    expect(validatePrototypes()).toEqual([]);
  });

  it('refuse une recherche qui débloque un bâtiment non constructible', () => {
    const forge = BUILDINGS.forge as { menu: boolean };

    forge.menu = false;
    try {
      expect(validatePrototypes()).toContain('RESEARCH.metalworking : « forge » ne peut pas se débloquer au labo');
    } finally {
      forge.menu = true;
    }
    expect(validatePrototypes()).toEqual([]);
  });

  it('refuse un cycle de prérequis', () => {
    const boots = RESEARCH.walkingBoots as ResearchProto & { requires: readonly string[] };
    const metalworking = RESEARCH.metalworking as ResearchProto & { requires: readonly string[] };
    const bootsRequires = boots.requires;
    const metalRequires = metalworking.requires;

    boots.requires = ['metalworking'];
    metalworking.requires = ['walkingBoots'];
    try {
      expect(validatePrototypes()).toContain('RESEARCH.walkingBoots : prérequis en boucle, ou jamais accessibles');
    } finally {
      boots.requires = bootsRequires;
      metalworking.requires = metalRequires;
    }
    expect(validatePrototypes()).toEqual([]);
  });
});
