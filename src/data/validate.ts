/**
 * Contrôle d'intégrité des prototypes, exécuté au démarrage en développement.
 *
 * TypeScript attrape déjà les ids inconnus. Ce qu'il n'attrape pas, ce sont les
 * incohérences entre tables : une recette dont le bâtiment n'existe plus, une
 * quantité nulle, un libellé dupliqué, un sprite à qui il manque un morceau
 * ou qui enfreint la direction artistique — ou un objet sans débouché, qu'on
 * récolterait pour remplir son sac pour rien. Tout ça se voit ici, au chargement,
 * plutôt qu'en jeu trois semaines plus tard.
 *
 * Les recherches du labo (`research.ts`) y passent aussi : objets et
 * quantités, prérequis connus et sans cycle, un coût qui tient dans le coffre
 * du labo, un effet qui porte sur une statistique connue.
 */

import { BIOMES, ERAS, HOME_REGION, REGION_RINGS, type BiomeProto, type RegionRing } from './regions.ts';
import { TILE_SIZE } from '../core/grid.ts';
import { PALETTE, auditSvg } from './artDirection.ts';
import { BUILDINGS, RUIN, type BuildingProto } from './buildings.ts';
import { DAWN_REWARD, DAY_CYCLE } from './dayNight.ts';
import { BASE_XP, KILL_XP, LEVEL_GAINS, MAX_LEVEL, XP_CURVE, XP_SHARE } from './levels.ts';
import { ENEMY_BASE, ENEMY_BASE_LEVELS, FIREBALL, GUARD_RANGE, RAIDS, type EnemyBaseLevel } from './enemyBases.ts';
import { CHIEF, ENEMIES, LOOT_DROPS, SPITTER, NIGHT_BOSSES, WAVES, WILDLIFE, WILDLIFE_IDS, WILDLIFE_SPAWN, type LootTable, type WaveSpec, type WildlifeProto } from './enemies.ts';
import { EVE } from './eve.ts';
import { ICON_SIZE, ITEM_ICONS, PRESTIGE_ICON } from './icons.ts';
import { CATEGORY_ICONS } from './categoryIcons.ts';
import { JOB_ICONS } from './jobIcons.ts';
import { ITEMS } from './items.ts';
import { HUNTING, NEEDS, type NeedProto } from './needs.ts';
import { OBJECTIVES, type ObjectiveProto } from './objectives.ts';
import { PERKS, type PerkProto } from './perks.ts';
import { QUESTS, QUEST_IDS, TOOLS, type QuestProto } from './quests.ts';
import { RECIPES, type RecipeProto } from './recipes.ts';
import { RESEARCH, RESEARCH_STATS, type ResearchProto } from './research.ts';
import { RESOURCES, ROCK_OF_ORE } from './resources.ts';
import { TEST_SCENARIOS, type TestScenarioProto } from './testScenario.ts';
import { BUILDING_PARTS, RESOURCE_PARTS, SPRITES, UPGRADE_PARTS, WALKER_PARTS, type SpriteProto } from './sprites.ts';
import { WEAPONS } from './weapons.ts';
import {
  COLOR_SLOTS,
  DEFAULT_LOOK,
  LOOK_COLORS,
  LOOK_SLOTS,
  BASE_WARDROBE_LOOT,
  LOOT_SOURCES,
  PIECES,
  PIECE_IDS,
  RARITY_IDS,
  WARDROBE_LOOT,
  isStarter,
  piecesOf,
  type PieceId,
  type PieceProto,
  type Rarity,
  type WardrobeDrop,
} from './wardrobe.ts';
import { CHESTS } from './chests.ts';
import { PIECE_ART, adamLookParts, isFootPiece } from '../art/adamLook.ts';
import { WEATHER, WEATHER_CALENDAR, type WeatherProto } from './weather.ts';

export function validatePrototypes(): string[] {
  const errors: string[] = [];

  for (const [id, item] of Object.entries(ITEMS)) {
    if (item.stack <= 0) {
      errors.push(`ITEMS.${id} : stack doit être strictement positif`);
    }

    // TypeScript garantit qu'une icône existe ; on vérifie ici son cadre et la direction artistique.
    const icon = ITEM_ICONS[id as keyof typeof ITEM_ICONS];

    if (!icon.includes(`width="${ICON_SIZE}" height="${ICON_SIZE}"`)) {
      errors.push(`ITEM_ICONS.${id} : l'icône doit faire ${ICON_SIZE} × ${ICON_SIZE}`);
    }
    for (const problem of auditSvg(icon)) errors.push(`ITEM_ICONS.${id} : ${problem}`);
  }

  if (!PRESTIGE_ICON.includes(`width="${ICON_SIZE}" height="${ICON_SIZE}"`)) {
    errors.push(`PRESTIGE_ICON : l'icône doit faire ${ICON_SIZE} × ${ICON_SIZE}`);
  }
  for (const problem of auditSvg(PRESTIGE_ICON)) errors.push(`PRESTIGE_ICON : ${problem}`);

  // Le type garantit une icône de métier par bâtiment ; ici, son cadre, la DA, et que deux bâtiments ne la partagent pas.
  const jobOwners = new Map<string, string>();

  for (const [id, icon] of Object.entries(JOB_ICONS)) {
    if (!icon.includes(`width="${ICON_SIZE}" height="${ICON_SIZE}"`)) {
      errors.push(`JOB_ICONS.${id} : l'icône doit faire ${ICON_SIZE} × ${ICON_SIZE}`);
    }
    for (const problem of auditSvg(icon)) errors.push(`JOB_ICONS.${id} : ${problem}`);

    const owner = jobOwners.get(icon);

    if (owner) errors.push(`JOB_ICONS.${id} : même icône que ${owner}`);
    jobOwners.set(icon, id);
  }

  // Le type garantit une icône par famille du menu ; ici, son cadre et la DA.
  for (const [id, icon] of Object.entries(CATEGORY_ICONS)) {
    if (!icon.includes(`width="${ICON_SIZE}" height="${ICON_SIZE}"`)) {
      errors.push(`CATEGORY_ICONS.${id} : l'icône doit faire ${ICON_SIZE} × ${ICON_SIZE}`);
    }
    for (const problem of auditSvg(icon)) errors.push(`CATEGORY_ICONS.${id} : ${problem}`);
  }

  for (const [id, building] of Object.entries(BUILDINGS)) {
    if (building.width <= 0 || building.height <= 0) {
      errors.push(`BUILDINGS.${id} : emprise invalide`);
    }
    if (building.storage < 0) {
      errors.push(`BUILDINGS.${id} : capacité de coffre négative`);
    }
    for (const [itemId, amount] of Object.entries<number>(building.cost)) {
      if (!(itemId in ITEMS)) {
        errors.push(`BUILDINGS.${id} : coût en objet inconnu « ${itemId} »`);
      }
      if (amount <= 0) {
        errors.push(`BUILDINGS.${id} : coût nul ou négatif en « ${itemId} »`);
      }
    }
    if (building.logisticRadius < 0) {
      errors.push(`BUILDINGS.${id} : rayon logistique négatif`);
    }
    if (building.logisticRadius > 0 && Number.isFinite(building.storage)) {
      errors.push(`BUILDINGS.${id} : un rayon logistique sans entrepôt (coffre Infinity) ne sert à rien`);
    }
    if (building.hp <= 0) {
      errors.push(`BUILDINGS.${id} : points de vie nuls`);
    }
    if (building.workers < 0 || !Number.isInteger(building.workers)) {
      errors.push(`BUILDINGS.${id} : nombre d'ouvriers invalide`);
    }
    if (building.minWorkers < 0 || !Number.isInteger(building.minWorkers) || building.minWorkers > building.workers) {
      errors.push(`BUILDINGS.${id} : minimum d'ouvriers hors de [0, ${building.workers}]`);
    }
    if (building.weapon !== null && !(building.weapon in WEAPONS)) {
      errors.push(`BUILDINGS.${id} : arme inconnue « ${String(building.weapon)} »`);
    }
    // Une foreuse se pose au bord d'un filon : il lui faut des gisements que la carte pose vraiment.
    const deposits: readonly string[] = (building as BuildingProto).deposits ?? [];

    if (building.kind === 'drill' && deposits.length === 0) {
      errors.push(`BUILDINGS.${id} : une foreuse sans gisement (deposits) ne se poserait nulle part`);
    }
    for (const item of deposits) {
      if (!(item in ROCK_OF_ORE)) errors.push(`BUILDINGS.${id} : gisement « ${item} » qu'aucun filon ne porte`);
    }
    // Le stock visé d'un consommateur : des entrées de sa recette, de quoi lancer un cycle, dans son coffre.
    const demand: Partial<Record<string, number>> = (building as BuildingProto).demand ?? {};
    const consumes = Object.values(RECIPES as Record<string, RecipeProto>).filter((recipe) => recipe.building === id);

    for (const [item, amount = 0] of Object.entries(demand)) {
      const needed = consumes.find((recipe) => item in recipe.inputs)?.inputs[item as keyof RecipeProto['inputs']];

      if (building.kind !== 'nursery' && building.kind !== 'forge') {
        errors.push(`BUILDINGS.${id} : un stock visé (demand) sur un bâtiment qui ne consomme pas`);
      } else if (needed === undefined) {
        errors.push(`BUILDINGS.${id} : stock visé en « ${item} », que sa recette ne consomme pas`);
      } else if (amount < needed || amount > building.storage) {
        errors.push(`BUILDINGS.${id} : stock visé en « ${item} » hors de [${needed}, ${building.storage}]`);
      }
    }
    if (building.kind === 'tower' && building.weapon === null) {
      errors.push(`BUILDINGS.${id} : une tour sans arme ne sert à rien`);
    }
    // La ligne d'effet du menu cite des chiffres : ils doivent suivre la donnée.
    if (building.effect.trim() === '') {
      errors.push(`BUILDINGS.${id} : ligne d'effet vide`);
    }
    if (building.weapon !== null && building.weapon in WEAPONS) {
      const range = `${WEAPONS[building.weapon].range} cases`;

      if (!building.effect.includes(range)) errors.push(`BUILDINGS.${id} : l'effet doit citer la portée (« ${range} »)`);
    }
    if (building.kind === 'nursery') {
      const minutes = `${RECIPES.raiseChild.duration / (20 * 60)} min`;

      if (!building.effect.includes(minutes)) errors.push(`BUILDINGS.${id} : l'effet doit citer « ${minutes} »`);
    }
    if (!(building.sprite in SPRITES)) {
      errors.push(`BUILDINGS.${id} : planche inconnue « ${building.sprite} »`);
    } else {
      const sprite: SpriteProto = SPRITES[building.sprite];
      const expectedW = building.width * TILE_SIZE;
      const expectedH = building.height * TILE_SIZE;

      // Vue 3/4 : aussi large que l'emprise, au moins aussi haut — le toit dépasse.
      if (sprite.width !== expectedW || sprite.height < expectedH) {
        errors.push(
          `BUILDINGS.${id} : le sprite « ${building.sprite} » fait ` +
            `${sprite.width}×${sprite.height}, l'emprise demande ${expectedW} de large ` +
            `et au moins ${expectedH} de haut`,
        );
      }
      if (sprite.anchorX !== 0 || sprite.anchorY !== 1) {
        errors.push(`BUILDINGS.${id} : le sprite « ${building.sprite} » doit être ancré en (0, 1)`);
      }
      for (const part of BUILDING_PARTS) {
        if (!(part in sprite.parts)) errors.push(`BUILDINGS.${id} : le sprite « ${building.sprite} » n'a pas de morceau « ${part} »`);
      }
    }
  }

  // Un niveau d'amélioration change le bâtiment sur place : même cadre, ni chantier ni emprise nouvelle.
  for (const [id, building] of Object.entries(BUILDINGS) as [string, BuildingProto][]) {
    let previousHp = building.hp;

    building.upgrades.forEach((upgrade, index) => {
      const where = `BUILDINGS.${id}.upgrades[${index}]`;
      const costs = Object.entries(upgrade.cost);

      if (costs.length === 0) errors.push(`${where} : une amélioration gratuite`);
      for (const [itemId, amount] of costs) {
        if (!(itemId in ITEMS)) errors.push(`${where} : coût en objet inconnu « ${itemId} »`);
        if (amount <= 0) errors.push(`${where} : coût nul ou négatif en « ${itemId} »`);
      }
      if (upgrade.hp < previousHp) errors.push(`${where} : moins de points de vie qu'au niveau d'avant`);
      previousHp = upgrade.hp;
      if (upgrade.label.trim() === '' || upgrade.action.trim() === '' || upgrade.description.trim() === '') {
        errors.push(`${where} : nom, verbe ou description vide`);
      }
      if (upgrade.weapon !== null && !(upgrade.weapon in WEAPONS)) {
        errors.push(`${where} : arme inconnue « ${String(upgrade.weapon)} »`);
      }
      if (building.kind === 'tower' && upgrade.weapon === null) errors.push(`${where} : une tour sans arme ne sert à rien`);
      if (!(upgrade.sprite in SPRITES)) {
        errors.push(`${where} : planche inconnue « ${upgrade.sprite} »`);
      } else {
        const sprite: SpriteProto = SPRITES[upgrade.sprite];
        const base: SpriteProto | undefined = SPRITES[building.sprite];

        if (base && (sprite.width !== base.width || sprite.height !== base.height || sprite.anchorX !== base.anchorX || sprite.anchorY !== base.anchorY)) {
          errors.push(`${where} : le sprite « ${upgrade.sprite} » doit avoir le cadre et l'ancre de « ${building.sprite} »`);
        }
        for (const part of UPGRADE_PARTS) {
          if (!(part in sprite.parts)) errors.push(`${where} : le sprite « ${upgrade.sprite} » n'a pas de morceau « ${part} »`);
        }
      }
    });
  }

  const buildingsWithRecipe = new Set<string>();

  for (const [id, recipe] of Object.entries(RECIPES) as [string, RecipeProto][]) {
    if (!(recipe.building in BUILDINGS)) {
      errors.push(`RECIPES.${id} : bâtiment inconnu « ${recipe.building} »`);
    } else if (buildingsWithRecipe.has(recipe.building) && BUILDINGS[recipe.building].kind === 'forge') {
      // Une forge trouve sa recette par son id (`recipeOf`) : une seconde ne tournerait jamais.
      errors.push(`RECIPES.${id} : « ${recipe.building} » a déjà une recette`);
    } else {
      buildingsWithRecipe.add(recipe.building);
    }

    if (recipe.duration <= 0) {
      errors.push(`RECIPES.${id} : durée nulle ou négative`);
    }

    for (const [itemId, amount] of Object.entries({ ...recipe.inputs, ...recipe.outputs })) {
      if (!(itemId in ITEMS)) {
        errors.push(`RECIPES.${id} : objet inconnu « ${itemId} »`);
      }
      if (amount <= 0) {
        errors.push(`RECIPES.${id} : quantité nulle ou négative pour « ${itemId} »`);
      }
    }

    // La nurserie seule produit autre chose qu'un objet : un enfant.
    if (Object.keys(recipe.outputs).length === 0 && BUILDINGS[recipe.building].kind !== 'nursery') {
      errors.push(`RECIPES.${id} : aucune sortie`);
    }

    const needs = sum(recipe.inputs);

    if (needs > BUILDINGS[recipe.building].storage) {
      errors.push(`RECIPES.${id} : le coffre de « ${recipe.building} » ne peut pas contenir ses entrées`);
    }
  }

  // Un débouché par objet : un coût de bâtiment ou d'amélioration, une entrée de recette, un coût de recherche — ou un besoin des habitants (l'eau se boit).
  const consumed = new Set<string>();

  for (const building of Object.values(BUILDINGS) as BuildingProto[]) {
    for (const itemId of Object.keys(building.cost)) consumed.add(itemId);
    for (const upgrade of building.upgrades) for (const itemId of Object.keys(upgrade.cost)) consumed.add(itemId);
  }
  for (const recipe of Object.values(RECIPES) as RecipeProto[]) {
    for (const itemId of Object.keys(recipe.inputs)) consumed.add(itemId);
  }
  for (const research of Object.values(RESEARCH) as ResearchProto[]) {
    for (const itemId of Object.keys(research.cost)) consumed.add(itemId);
  }
  for (const need of Object.values(NEEDS) as NeedProto[]) consumed.add(need.item);
  consumed.add(HUNTING.meat);
  for (const id of Object.keys(ITEMS)) {
    if (!consumed.has(id)) {
      errors.push(`ITEMS.${id} : aucun débouché — ni coût de bâtiment ou d'amélioration, ni entrée de recette, ni coût de recherche, ni besoin`);
    }
  }

  errors.push(...researchErrors());

  for (const [id, building] of Object.entries(BUILDINGS)) {
    if (
      (building.kind === 'drill' ||
        building.kind === 'quarry' ||
        building.kind === 'nursery' ||
        building.kind === 'forge') &&
      !buildingsWithRecipe.has(id)
    ) {
      errors.push(`BUILDINGS.${id} : aucun bâtiment producteur sans recette associée`);
    }
    if (building.kind === 'farm' && building.storage <= 0) {
      errors.push(`BUILDINGS.${id} : une ferme sans coffre ne peut rien récolter`);
    }
    if (building.kind === 'quarry' && building.storage <= 0) {
      errors.push(`BUILDINGS.${id} : une carrière sans coffre ne peut rien tailler`);
    }
  }

  for (const [id, resource] of Object.entries(RESOURCES)) {
    if (!(resource.item in ITEMS)) {
      errors.push(`RESOURCES.${id} : objet inconnu « ${resource.item} »`);
    }
    if (resource.amount <= 0) {
      errors.push(`RESOURCES.${id} : quantité nulle`);
    }
    if ((resource.sprites as readonly string[]).length === 0) {
      errors.push(`RESOURCES.${id} : aucun sprite`);
    }
    for (const sprite of resource.sprites) {
      if (!(sprite in SPRITES)) {
        errors.push(`RESOURCES.${id} : sprite inconnu « ${sprite} »`);
        continue;
      }
      for (const part of RESOURCE_PARTS) {
        if (!(part in SPRITES[sprite].parts)) {
          errors.push(`RESOURCES.${id} : le sprite « ${sprite} » n'a pas de morceau « ${part} »`);
        }
      }
    }
  }

  for (const [id, enemy] of Object.entries(ENEMIES)) {
    if (enemy.hp <= 0 || enemy.speed <= 0 || enemy.damage <= 0 || enemy.attackTicks <= 0) {
      errors.push(`ENEMIES.${id} : points de vie, vitesse, dégâts ou cadence nuls`);
    }
    if (enemy.halfW <= 0 || enemy.halfH <= 0 || enemy.halfW * 2 > TILE_SIZE) {
      errors.push(`ENEMIES.${id} : boîte de collision invalide`);
    }
    if (!(enemy.sprite in SPRITES)) {
      errors.push(`ENEMIES.${id} : sprite inconnu « ${enemy.sprite} »`);
    } else {
      for (const part of WALKER_PARTS) {
        if (!(part in SPRITES[enemy.sprite].parts)) {
          errors.push(`ENEMIES.${id} : le sprite « ${enemy.sprite} » n'a pas de morceau « ${part} »`);
        }
      }
    }
    errors.push(...lootErrors(`ENEMIES.${id}`, enemy.loot));
  }

  for (const [id, beast] of Object.entries(WILDLIFE)) {
    const proto: WildlifeProto = beast;

    if (proto.hp <= 0 || proto.speed <= 0 || proto.chargeSpeed <= 0 || proto.damage <= 0 || proto.attackTicks <= 0) {
      errors.push(`WILDLIFE.${id} : points de vie, vitesses, dégâts ou cadence nuls`);
    }
    if (proto.halfW <= 0 || proto.halfH <= 0 || proto.halfW * 2 > TILE_SIZE) {
      errors.push(`WILDLIFE.${id} : boîte de collision invalide`);
    }
    // Rentrer avant d'avoir repéré Adam, ou lâcher la poursuite dans son propre rayon : la bête tournerait en rond.
    if (proto.aggroRadius <= 0 || proto.giveUpRadius <= proto.aggroRadius || proto.leashRadius <= proto.aggroRadius) {
      errors.push(`WILDLIFE.${id} : rayons d'aggro, d'abandon et de laisse incohérents`);
    }
    if (proto.groupMin < 1 || proto.groupMax < proto.groupMin || proto.densPerChunk < 0 || (proto.densPerChunk > 0 && proto.respawnTicks <= 0)) {
      errors.push(`WILDLIFE.${id} : effectif, densité ou repeuplement incohérents`);
    }
    errors.push(...lootErrors(`WILDLIFE.${id}`, proto.loot));
    if (!(proto.sprite in SPRITES)) {
      errors.push(`WILDLIFE.${id} : sprite inconnu « ${proto.sprite} »`);
    } else {
      for (const part of ['down', 'downHurt', 'foot']) {
        if (!(part in SPRITES[proto.sprite].parts)) {
          errors.push(`WILDLIFE.${id} : le sprite « ${proto.sprite} » n'a pas de morceau « ${part} »`);
        }
      }
    }
  }

  // Un cracheur qui tirerait plus loin que l'arc d'Adam ne se laisserait jamais approcher.
  if (SPITTER.range <= SPITTER.fleeRadius || SPITTER.range >= WEAPONS.bow.range || SPITTER.speed <= 0 || SPITTER.tellTicks >= WILDLIFE.spitter.attackTicks) {
    errors.push('SPITTER : portée, recul ou vitesse incohérents');
  }
  // Un coup de zone sans préavis, ou dont on ne sort pas au pas d'Adam, ne s'esquive pas.
  if (CHIEF.slam.windupTicks <= 0 || CHIEF.slam.radius <= 0 || CHIEF.slam.cooldownTicks <= CHIEF.slam.windupTicks || CHIEF.regenTicks % WILDLIFE_SPAWN.checkTicks !== 0) {
    errors.push('CHIEF : coup de zone ou regain incohérents');
  }

  if (WILDLIFE_SPAWN.minPlayerDistance >= WILDLIFE_SPAWN.despawnDistance || WILDLIFE_SPAWN.cap <= 0) {
    errors.push('WILDLIFE_SPAWN : distances ou plafond incohérents');
  }

  for (const [id, weapon] of Object.entries(WEAPONS)) {
    if (weapon.range <= 0 || weapon.cooldown <= 0 || weapon.damage <= 0 || weapon.arrowSpeed <= 0) {
      errors.push(`WEAPONS.${id} : portée, cadence, dégâts ou vitesse nuls`);
    }
  }

  if (
    LOOT_DROPS.lifetimeTicks <= 0 ||
    LOOT_DROPS.pickupRadius <= 0 ||
    LOOT_DROPS.magnetRadius < LOOT_DROPS.pickupRadius ||
    LOOT_DROPS.magnetSpeed <= 0 ||
    LOOT_DROPS.scatter < 0 ||
    LOOT_DROPS.scatter > LOOT_DROPS.pickupRadius ||
    LOOT_DROPS.cap <= 0
  ) {
    errors.push('LOOT_DROPS : durée, rayons, vitesse, dispersion ou plafond incohérents');
  }

  if (WAVES.perNight <= 0 || WAVES.interval <= 0 || WAVES.firstAt < 0) {
    errors.push('WAVES : délais incohérents');
  }
  if (WAVES.cycle <= 0 || WAVES.cycle > NIGHT_BOSSES.length) {
    errors.push('WAVES.cycle : doit tenir dans NIGHT_BOSSES');
  }
  NIGHT_BOSSES.forEach((night: WaveSpec, index) => {
    if (Object.values(night).some((count) => count < 0)) errors.push(`NIGHT_BOSSES[${index}] : effectif négatif`);
  });

  // Les régions : un gardien de région par biome à conquérir, sa spécialité ; des anneaux qui s'éloignent et durcissent.
  for (const [id, biome] of Object.entries(BIOMES) as [string, BiomeProto][]) {
    if (id === HOME_REGION.biome) continue;
    if (!biome.guardian || WILDLIFE[biome.guardian].habitat !== 'region') errors.push(`BIOMES.${id} : son gardien doit être une bête d'habitat « region »`);
    if (!biome.specialty) errors.push(`BIOMES.${id} : une région à conquérir rapporte une spécialité`);
    if (biome.findChance <= 0 || biome.findChance >= 1) errors.push(`BIOMES.${id}.findChance : entre 0 et 1, exclus`);
  }
  for (const id of WILDLIFE_IDS) {
    if (WILDLIFE[id].habitat === 'region' && !Object.values(BIOMES).some((biome: BiomeProto) => biome.guardian === id)) {
      errors.push(`WILDLIFE.${id} : un gardien de région sans biome`);
    }
  }
  REGION_RINGS.forEach((ring: RegionRing, index) => {
    const previous: RegionRing | undefined = REGION_RINGS[index - 1];
    const inner = previous ? previous.outer : HOME_REGION.radius;

    if (ring.inner !== inner || ring.outer <= ring.inner || ring.lair <= ring.inner || ring.lair >= ring.outer) {
      errors.push(`REGION_RINGS[${index}] : bande ou repaire incohérents`);
    }
    if (ring.sectors < 1 || ring.era < 0 || ring.era >= ERAS.length || ring.spoils.min < 1 || ring.spoils.max < ring.spoils.min) {
      errors.push(`REGION_RINGS[${index}] : secteurs, ère ou butin incohérents`);
    }
    if (previous && (ring.hpScale <= previous.hpScale || ring.era < previous.era)) {
      errors.push(`REGION_RINGS[${index}] : un anneau plus lointain doit avoir un gardien plus coriace, d'une ère au moins égale`);
    }
  });

  for (const [index, level] of ENEMY_BASE_LEVELS.entries()) {
    const { raid, guards, chief, fire }: EnemyBaseLevel = level;
    const previous = index > 0 ? ENEMY_BASE_LEVELS[index - 1]! : null;

    if (raid.from < 1 || raid.ticksPerRaider <= 0 || raid.capacity < 1 || raid.capacity > RAIDS.capacityMax) {
      errors.push(`ENEMY_BASE_LEVELS[${index}].raid : nuit, cadence ou capacité incohérentes`);
    }
    if (guards.count < 0 || guards.spitters < 0 || guards.respawnTicks <= 0) {
      errors.push(`ENEMY_BASE_LEVELS[${index}].guards : effectif ou cadence incohérents`);
    }
    // Un gardien sortirait de la zone qu'il tient.
    for (const [id, beast] of Object.entries(WILDLIFE)) {
      if (beast.habitat === 'base' && beast.leashRadius > level.zoneRadius) {
        errors.push(`ENEMY_BASE_LEVELS[${index}] : zone plus petite que la laisse de WILDLIFE.${id}`);
      }
    }
    if (chief.hp <= 0 || chief.damage <= 0 || chief.slamDamage <= 0 || chief.prestige < 0) {
      errors.push(`ENEMY_BASE_LEVELS[${index}].chief : points de vie, coups ou Prestige incohérents`);
    }
    if (index > 0 && chief.hp <= ENEMY_BASE_LEVELS[index - 1]!.chief.hp) {
      errors.push(`ENEMY_BASE_LEVELS[${index}].chief : un anneau plus lointain doit avoir un chef plus coriace`);
    }
    errors.push(...lootErrors(`ENEMY_BASE_LEVELS[${index}].chief`, chief.loot));
    // Une base ne tire que dans sa zone, et plus loin que l'arc d'Adam : on ne l'entame pas sans risque.
    if (fire.range > level.zoneRadius || fire.range < WEAPONS.bow.range + ENEMY_BASE.reach) {
      errors.push(`ENEMY_BASE_LEVELS[${index}].fire : portée hors de la zone ou en deçà de l'arc d'Adam`);
    }
    if (fire.damage <= 0 || fire.buildingDamage <= 0 || fire.cooldownTicks <= FIREBALL.tellTicks) {
      errors.push(`ENEMY_BASE_LEVELS[${index}].fire : dégâts ou cadence incohérents (la lueur doit tenir dans le délai)`);
    }
    // Plus loin, plus dangereux.
    if (previous && (level.hp <= previous.hp || fire.damage < previous.fire.damage || fire.cooldownTicks > previous.fire.cooldownTicks)) {
      errors.push(`ENEMY_BASE_LEVELS[${index}] : un anneau plus lointain doit avoir plus de points de vie et tirer au moins aussi fort et vite`);
    }
  }
  if (FIREBALL.speed <= 0 || FIREBALL.tellTicks <= 0) {
    errors.push('FIREBALL : vitesse ou lueur incohérentes');
  }
  if (RAIDS.paceGrowth < 0 || RAIDS.capacityEvery <= 0 || RAIDS.capacityMax > 9 || RAIDS.exitStagger <= 0) {
    errors.push('RAIDS : croissance, capacité (un chiffre au badge) ou sortie incohérentes');
  }
  if (GUARD_RANGE.showTiles >= GUARD_RANGE.hideTiles) errors.push('GUARD_RANGE : les gardiens rentreraient aussitôt sortis');

  if (QUEST_IDS.length < 3) errors.push('QUESTS : Ève doit donner au moins trois quêtes');
  if (EVE.arrivalNight < 1 || EVE.rideSpeed <= 0 || EVE.walkSpeed <= 0 || EVE.repairTicks <= 0 || EVE.repairAmount <= 0) {
    errors.push('EVE : nuit d’arrivée, vitesses ou cadence de réparation nulles');
  }

  const plansGiven = new Set<string>();

  for (const id of QUEST_IDS) {
    const quest: QuestProto = QUESTS[id];

    if (quest.goal.count <= 0) errors.push(`QUESTS.${id} : objectif nul`);
    if (quest.goal.building === 'townHall') errors.push(`QUESTS.${id} : la mairie est unique, on n'en bâtit pas d'autre`);
    // Un bâtiment à plan demandé avant que son plan soit donné : la quête ne finirait jamais.
    if (BUILDINGS[quest.goal.building].plan && !plansGiven.has(quest.goal.building)) {
      errors.push(`QUESTS.${id} : demande « ${quest.goal.building} » avant d'en donner le plan`);
    }
    if (quest.reward.type === 'plan') {
      if (!BUILDINGS[quest.reward.building].plan) errors.push(`QUESTS.${id} : « ${quest.reward.building} » n'a pas besoin de plan`);
      if (plansGiven.has(quest.reward.building)) errors.push(`QUESTS.${id} : plan « ${quest.reward.building} » donné deux fois`);
      plansGiven.add(quest.reward.building);
    } else if (!(quest.reward.tool in TOOLS)) {
      errors.push(`QUESTS.${id} : outil inconnu « ${quest.reward.tool} »`);
    }
  }

  for (const [id, building] of Object.entries(BUILDINGS)) {
    if (building.plan && !plansGiven.has(id)) errors.push(`BUILDINGS.${id} : aucune quête n'en donne le plan`);
  }

  for (const [id, tool] of Object.entries(TOOLS)) {
    if (tool.harvestSpeed <= 1 || (tool.resources as readonly string[]).length === 0) errors.push(`TOOLS.${id} : l'outil ne sert à rien`);
  }

  for (const [phase, ticks] of Object.entries(DAY_CYCLE)) {
    if (!Number.isInteger(ticks) || ticks <= 0) errors.push(`DAY_CYCLE.${phase} : durée nulle ou fractionnaire`);
  }

  // Toutes les vagues d'une nuit tombent avant l'aube : une journée reste sans mutant.
  if (WAVES.targetChance < 0 || WAVES.targetChance > 1) errors.push('WAVES.targetChance : une probabilité, entre 0 et 1');
  if (RUIN.delivered < 0 || RUIN.delivered >= 1) errors.push('RUIN.delivered : une part du coût, de 0 à moins de 1');

  if (WAVES.firstAt + (WAVES.perNight - 1) * WAVES.interval >= DAY_CYCLE.night) {
    errors.push('WAVES : la dernière vague de la nuit tomberait après l’aube');
  }

  for (const [item, amount] of Object.entries(DAWN_REWARD)) {
    if (amount <= 0) errors.push(`DAWN_REWARD.${item} : quantité nulle`);
  }

  const { slotTicks, announceTicks, calmWeight, waveMarginTicks } = WEATHER_CALENDAR;

  for (const [id, weather] of Object.entries(WEATHER) as [string, WeatherProto][]) {
    // Une météo tient dans son créneau, annonce comprise de chaque côté : deux météos ne se chevauchent jamais.
    if (weather.durationTicks <= 0 || weather.durationTicks + announceTicks * 2 > slotTicks) {
      errors.push(`WEATHER.${id} : durée nulle ou trop longue pour un créneau`);
    }
    if (weather.weight <= 0) errors.push(`WEATHER.${id} : poids de tirage nul`);
    if (weather.playerSpeed <= 0 || weather.harvestYield < 1 || weather.weaponRange <= 0) {
      errors.push(`WEATHER.${id} : vitesse, récolte ou portée nulles`);
    }
    if (weather.corrosion && (weather.corrosion.everyTicks <= 0 || weather.corrosion.damage <= 0)) {
      errors.push(`WEATHER.${id} : corrosion nulle`);
    }
  }
  if (calmWeight < 0 || announceTicks <= 0 || waveMarginTicks >= slotTicks) {
    errors.push('WEATHER_CALENDAR : poids du calme, annonce ou marge incohérents');
  }

  for (const [id, sprite] of Object.entries(SPRITES) as [string, SpriteProto][]) {
    const frame = `width="${sprite.width}" height="${sprite.height}"`;

    for (const [part, source] of Object.entries(sprite.parts)) {
      // Tous les morceaux d'un sprite partagent son cadre : c'est ce qui les superpose.
      if (!source.startsWith('<svg') || !source.includes(frame)) {
        errors.push(`SPRITES.${id}.${part} : le SVG doit avoir le cadre du sprite (${sprite.width}×${sprite.height})`);
      }
      for (const problem of auditSvg(source)) errors.push(`SPRITES.${id}.${part} : ${problem}`);
    }
    for (const part of Object.keys(sprite.pivots ?? {})) {
      if (!(part in sprite.parts)) errors.push(`SPRITES.${id} : pivot d'un morceau inconnu « ${part} »`);
    }
    if (sprite.anchorX < 0 || sprite.anchorX > 1 || sprite.anchorY < 0 || sprite.anchorY > 1) {
      errors.push(`SPRITES.${id} : ancre hors du cadre`);
    }
  }

  // Des bonus de confort : un bonus qui fait gagner une vague n'a rien à faire dans le jardin.
  for (const [id, perk] of Object.entries(PERKS) as [string, PerkProto][]) {
    const { bag, start, freeSite, harvestSpeed } = perk.effect;

    if (perk.cost <= 0 || !Number.isInteger(perk.cost)) {
      errors.push(`PERKS.${id} : coût en graines nul ou non entier`);
    }
    if (bag === undefined && start === undefined && freeSite === undefined && harvestSpeed === undefined) {
      errors.push(`PERKS.${id} : aucun effet`);
    }
    if (bag !== undefined && (bag <= 0 || !Number.isInteger(bag))) {
      errors.push(`PERKS.${id} : places de sac nulles ou non entières`);
    }
    for (const [itemId, amount] of Object.entries<number>(start ?? {})) {
      if (!(itemId in ITEMS) || amount <= 0 || !Number.isInteger(amount)) {
        errors.push(`PERKS.${id} : objet de départ invalide « ${itemId} »`);
      }
    }
    if (freeSite !== undefined && !(freeSite in BUILDINGS)) {
      errors.push(`PERKS.${id} : chantier offert inconnu « ${freeSite} »`);
    }
    for (const [resourceId, speed] of Object.entries<number>(harvestSpeed ?? {})) {
      if (!(resourceId in RESOURCES) || speed <= 0 || speed > 0.5) {
        errors.push(`PERKS.${id} : accélération de récolte invalide sur « ${resourceId} »`);
      }
    }
  }

  // Une partie de test : des quantités entières, et un chantier en cours qui l'est vraiment.
  for (const [id, scenario] of Object.entries(TEST_SCENARIOS) as [string, TestScenarioProto][]) {
    const at = `TEST_SCENARIOS.${id}`;

    if (!Number.isInteger(scenario.seed) || scenario.seed < 0) errors.push(`${at} : seed invalide`);
    for (const [where, amounts] of [['town', scenario.town], ['bag', scenario.bag]] as const) {
      for (const [itemId, amount] of Object.entries<number>(amounts)) {
        if (!(itemId in ITEMS) || amount <= 0 || !Number.isInteger(amount)) {
          errors.push(`${at}.${where} : quantité invalide de « ${itemId} »`);
        }
      }
    }
    for (const { building, delivered } of scenario.buildings) {
      if (delivered === undefined) continue;

      const cost: Partial<Record<string, number>> = BUILDINGS[building].cost;

      for (const [itemId, amount] of Object.entries<number>(delivered)) {
        if (!(itemId in cost) || amount <= 0 || !Number.isInteger(amount) || amount > (cost[itemId] ?? 0)) {
          errors.push(`${at} : livraison de « ${itemId} » invalide sur le chantier ${building}`);
        }
      }
      if (sum(delivered) >= sum(cost)) errors.push(`${at} : le chantier ${building} est livré en entier — ce n'est plus un chantier en cours`);
    }
  }

  const objectives: readonly ObjectiveProto[] = OBJECTIVES;

  for (const [index, objective] of objectives.entries()) {
    const at = `OBJECTIVES[${index}]`;

    if (objective.title === '' || objective.hint === '' || objective.celebration === '') {
      errors.push(`${at} : titre, conseil ou célébration vide`);
    }
    if (objective.goals.length === 0) errors.push(`${at} : aucune condition, il serait réussi d'office`);

    for (const goal of objective.goals) {
      if (!Number.isInteger(goal.count) || goal.count <= 0) errors.push(`${at} : condition « ${goal.type} » à compte invalide`);
      if (goal.type === 'build' && !(goal.building in BUILDINGS)) errors.push(`${at} : bâtiment inconnu « ${goal.building} »`);
      if (goal.type === 'produce' && !(goal.item in ITEMS)) errors.push(`${at} : objet inconnu « ${goal.item} »`);
      if (goal.type === 'quests' && goal.count > QUEST_IDS.length) errors.push(`${at} : plus de quêtes qu'Ève n'en donne`);
    }

    const { items, bag } = objective.reward;

    for (const [item, amount] of Object.entries<number>(items ?? {})) {
      if (!(item in ITEMS) || amount <= 0) errors.push(`${at} : récompense invalide en « ${item} »`);
    }
    if (bag !== undefined && (!Number.isInteger(bag) || bag <= 0)) errors.push(`${at} : places de sac invalides`);
  }

  const labels = new Map<string, string>();

  for (const [id, proto] of [...Object.entries(ITEMS), ...Object.entries(BUILDINGS)]) {
    const previous = labels.get(proto.label);

    if (previous) {
      errors.push(`Libellé « ${proto.label} » partagé par ${previous} et ${id}`);
    }
    labels.set(proto.label, id);
  }

  errors.push(...levelErrors());
  errors.push(...wardrobeErrors());

  return errors;
}

/**
 * La garde-robe d'Adam : chaque emplacement a une pièce du départ, l'Adam
 * par défaut ne porte que des pièces du départ, chacune à sa place ; les
 * nuanciers ne proposent que des tons de la palette, sans doublon ; chaque
 * source de butin peut donner quelque chose. Et chaque pièce, portée par
 * Adam, passe la direction artistique — le corps pour un calque du corps, le
 * pied pour le pantalon et les chaussures.
 */
export function wardrobeErrors(): string[] {
  const errors: string[] = [];
  const labels = new Map<string, string>();

  for (const slot of LOOK_SLOTS) {
    if (!piecesOf(slot).some(isStarter)) errors.push(`PIECES : aucune pièce du départ pour l'emplacement « ${slot} »`);

    const piece = DEFAULT_LOOK.pieces[slot];

    if (PIECES[piece].slot !== slot) errors.push(`DEFAULT_LOOK.${slot} : « ${piece} » n'est pas de cet emplacement`);
    if (!isStarter(piece)) errors.push(`DEFAULT_LOOK.${slot} : « ${piece} » n'est pas une pièce du départ`);
  }

  for (const slot of COLOR_SLOTS) {
    const tones: readonly string[] = LOOK_COLORS[slot];

    if (tones.length < 2) errors.push(`LOOK_COLORS.${slot} : un nuancier propose au moins deux tons`);
    if (new Set(tones).size !== tones.length) errors.push(`LOOK_COLORS.${slot} : ton en double`);
    for (const tone of tones) if (!(tone in PALETTE)) errors.push(`LOOK_COLORS.${slot} : ton inconnu « ${tone} »`);
    if (!tones.includes(DEFAULT_LOOK.colors[slot])) errors.push(`DEFAULT_LOOK.colors.${slot} : hors du nuancier`);
    // Le vert fluo est aux mutants : Adam ne s'en habille pas.
    if (tones.includes('toxic')) errors.push(`LOOK_COLORS.${slot} : le vert fluo est réservé aux mutants`);
  }

  for (const [id, piece] of Object.entries(PIECES) as [PieceId, PieceProto][]) {
    const previous = labels.get(piece.label);

    if (previous) errors.push(`PIECES.${id} : libellé « ${piece.label} » partagé avec ${previous}`);
    labels.set(piece.label, id);

    // Le dessin d'une pièce du pied est une jambe ou une chaussure ; celui d'une pièce du corps, des calques.
    const drawn: unknown = (PIECE_ART[id] as (facing: 'down', paint: typeof DEFAULT_LOOK.colors) => unknown)('down', DEFAULT_LOOK.colors);

    if (isFootPiece(id) !== (typeof drawn === 'string')) errors.push(`PIECE_ART.${id} : dessin du pied pour une pièce du corps, ou l'inverse`);

    const worn = { pieces: { ...DEFAULT_LOOK.pieces, [piece.slot]: id }, colors: DEFAULT_LOOK.colors };

    for (const [part, source] of Object.entries(adamLookParts(worn))) {
      for (const problem of auditSvg(source)) errors.push(`PIECES.${id} (${part}) : ${problem}`);
    }
  }

  // Chaque table de butin : une chance dans ]0, 1], des poids positifs, au moins un tirage, et de quoi trouver.
  const drops: [string, WardrobeDrop][] = [
    ...(Object.entries(WARDROBE_LOOT) as [string, WardrobeDrop][]).map(([source, drop]): [string, WardrobeDrop] => [`WARDROBE_LOOT.${source}`, drop]),
    ...BASE_WARDROBE_LOOT.flatMap((level, index) =>
      (Object.entries(level) as [string, WardrobeDrop][]).map(([source, drop]): [string, WardrobeDrop] => [`BASE_WARDROBE_LOOT[${index}].${source}`, drop]),
    ),
  ];

  for (const [name, drop] of drops) {
    if (drop.chance <= 0 || drop.chance > 1) errors.push(`${name} : chance hors de ]0, 1]`);
    if (drop.count !== undefined && (!Number.isInteger(drop.count) || drop.count < 1)) errors.push(`${name} : count entier ≥ 1`);
    for (const [rarity, weight] of Object.entries(drop.weights)) {
      if (!RARITY_IDS.includes(rarity as Rarity)) errors.push(`${name} : rareté inconnue « ${rarity} »`);
      if (!(weight > 0)) errors.push(`${name} : poids de « ${rarity} » non positif`);
    }

    const found = PIECE_IDS.some((id) => !isStarter(id) && (drop.weights[PIECES[id].rarity] ?? 0) > 0);

    if (!found) errors.push(`${name} : aucune pièce à trouver dans ses raretés`);
  }
  for (const source of LOOT_SOURCES) if (!drops.some(([name]) => name.endsWith(`.${source}`))) errors.push(`LOOT_SOURCES : « ${source} » n'a pas de table`);
  if (BASE_WARDROBE_LOOT.length !== ENEMY_BASE_LEVELS.length) errors.push('BASE_WARDROBE_LOOT : une table par niveau de base (ENEMY_BASE_LEVELS)');
  // Plus haute la base, plus de pièces : jamais moins que le niveau d'avant.
  for (let index = 1; index < BASE_WARDROBE_LOOT.length; index += 1) {
    const count = (drop: WardrobeDrop): number => drop.count ?? 1;

    if (count(BASE_WARDROBE_LOOT[index]!.enemyBase) < count(BASE_WARDROBE_LOOT[index - 1]!.enemyBase)) {
      errors.push(`BASE_WARDROBE_LOOT[${index}] : moins généreux que le niveau d'avant`);
    }
  }
  // Chaque emplacement a au moins trois pièces à trouver : le butin a de l'intérêt partout.
  for (const slot of LOOK_SLOTS) {
    if (piecesOf(slot).filter((id) => !isStarter(id)).length < 3) errors.push(`PIECES : moins de trois pièces à trouver pour « ${slot} »`);
  }
  if (!(CHESTS.chance > 0 && CHESTS.chance <= 1)) errors.push('CHESTS.chance hors de ]0, 1]');
  if (!(CHESTS.openTiles > 0) || !(CHESTS.tries >= 1) || !(CHESTS.minSpawnTiles >= 0)) errors.push('CHESTS : portée, tentatives ou distance invalides');

  // Une partie de test ne donne que des pièces à trouver, et n'habille Adam que de ce qu'il a.
  for (const [id, scenario] of Object.entries(TEST_SCENARIOS) as [string, TestScenarioProto][]) {
    if (!scenario.wardrobe) continue;

    const { found, look } = scenario.wardrobe;

    for (const piece of found) if (isStarter(piece)) errors.push(`TEST_SCENARIOS.${id} : « ${piece} » est une pièce du départ`);
    for (const slot of LOOK_SLOTS) {
      const piece = look?.pieces[slot];

      if (piece === undefined) continue;
      if (PIECES[piece].slot !== slot) errors.push(`TEST_SCENARIOS.${id} : « ${piece} » n'est pas de l'emplacement « ${slot} »`);
      if (!isStarter(piece) && !found.includes(piece)) errors.push(`TEST_SCENARIOS.${id} : Adam porte « ${piece} » sans l'avoir trouvée`);
    }
  }
  return errors;
}

/**
 * Les recherches : un coût d'objets connus en quantités entières, qui tient
 * dans le coffre du labo ; une durée ; des prérequis connus, sans boucle ;
 * un effet non nul sur une statistique connue, ou des bâtiments à débloquer.
 * Et un labo pour les mener.
 *
 * Un bâtiment débloqué au labo ne l'est que par une recherche, n'attend ni
 * plan ni objectif, et aucune quête ni aucun objectif ne demande de le bâtir :
 * jamais le joueur ne bute sur un bâtiment absent du menu.
 */
function researchErrors(): string[] {
  const errors: string[] = [];
  const labs = Object.entries(BUILDINGS).filter(([, building]) => building.kind === 'lab');
  const room = Math.min(...labs.map(([, building]) => building.storage));
  const entries = Object.entries(RESEARCH) as [string, ResearchProto][];
  const unlockedBy = new Map<string, string>();

  if (labs.length === 0) errors.push('RESEARCH : aucun labo pour mener les recherches');

  for (const [id, research] of entries) {
    if (research.label.trim() === '' || research.description.trim() === '') errors.push(`RESEARCH.${id} : libellé ou description vide`);
    if (!Number.isInteger(research.duration) || research.duration <= 0) errors.push(`RESEARCH.${id} : durée nulle ou fractionnaire`);
    if (Object.keys(research.cost).length === 0) errors.push(`RESEARCH.${id} : une recherche gratuite`);
    for (const [itemId, amount] of Object.entries<number>(research.cost)) {
      if (!(itemId in ITEMS)) errors.push(`RESEARCH.${id} : coût en objet inconnu « ${itemId} »`);
      if (!Number.isInteger(amount) || amount <= 0) errors.push(`RESEARCH.${id} : coût nul ou fractionnaire en « ${itemId} »`);
    }
    if (sum(research.cost) > room) errors.push(`RESEARCH.${id} : le coffre du labo ne peut pas contenir son coût`);
    if (research.effect === null && research.unlocks.length === 0) errors.push(`RESEARCH.${id} : ni effet ni déblocage`);
    if (research.effect !== null) {
      if (!(research.effect.stat in RESEARCH_STATS)) errors.push(`RESEARCH.${id} : statistique inconnue « ${research.effect.stat} »`);
      if (research.effect.amount === 0) errors.push(`RESEARCH.${id} : effet nul`);
    }
    for (const building of research.unlocks) {
      const proto: BuildingProto | undefined = BUILDINGS[building];

      if (!proto) {
        errors.push(`RESEARCH.${id} : débloque un bâtiment inconnu « ${building} »`);
        continue;
      }
      if (!proto.menu || proto.kind === 'lab') errors.push(`RESEARCH.${id} : « ${building} » ne peut pas se débloquer au labo`);
      if (proto.plan || proto.unlockObjective !== undefined) errors.push(`RESEARCH.${id} : « ${building} » a déjà sa condition de déblocage`);
      if (unlockedBy.has(building)) errors.push(`RESEARCH.${id} : « ${building} » déjà débloqué par ${unlockedBy.get(building)}`);
      unlockedBy.set(building, id);
    }
    for (const required of research.requires) {
      if (!(required in RESEARCH)) errors.push(`RESEARCH.${id} : prérequis inconnu « ${required} »`);
      if (required === id) errors.push(`RESEARCH.${id} : se demande elle-même`);
    }
  }

  // Un cycle de prérequis : aucune de ses recherches ne pourrait jamais être lancée.
  const done = new Set<string>();
  let progress = true;

  while (progress) {
    progress = false;
    for (const [id, research] of entries) {
      if (done.has(id) || !research.requires.every((required) => done.has(required))) continue;
      done.add(id);
      progress = true;
    }
  }
  for (const [id] of entries) {
    if (!done.has(id)) errors.push(`RESEARCH.${id} : prérequis en boucle, ou jamais accessibles`);
  }

  // Un objectif ou une quête qui demande un bâtiment caché au menu bloquerait la partie.
  const asked = [
    ...QUEST_IDS.map((quest) => [`QUESTS.${quest}`, QUESTS[quest].goal.building] as const),
    ...OBJECTIVES.flatMap((objective, index) =>
      objective.goals.flatMap((goal) => (goal.type === 'build' ? [[`OBJECTIVES[${index}]`, goal.building] as const] : [])),
    ),
  ];

  for (const [at, building] of asked) {
    if (unlockedBy.has(building)) errors.push(`${at} : demande « ${building} », qui n'arrive qu'au labo`);
  }

  const labels = new Set<string>();

  for (const [id, research] of entries) {
    if (labels.has(research.label)) errors.push(`RESEARCH.${id} : libellé « ${research.label} » en double`);
    labels.add(research.label);
  }
  return errors;
}

/** Une table de butin : des objets connus, des quantités entières, et au moins une ligne qui tombe à coup sûr. */
function lootErrors(owner: string, table: LootTable): string[] {
  const errors: string[] = [];

  if (!table.some((entry) => entry.chance >= 1)) errors.push(`${owner} : aucun butin garanti — un ennemi abattu doit toujours lâcher quelque chose`);

  for (const { item, min, max, chance } of table) {
    if (!(item in ITEMS)) errors.push(`${owner} : butin inconnu « ${item} »`);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      errors.push(`${owner} : quantités de « ${item} » incohérentes (${min}–${max})`);
    }
    if (!(chance > 0 && chance <= 1)) errors.push(`${owner} : probabilité de « ${item} » hors de ]0, 1]`);
  }
  return errors;
}

/** Les niveaux d'Adam : une courbe qui monte, des gains positifs, de l'XP pour chaque ennemi et chaque base. */
function levelErrors(): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(MAX_LEVEL) || MAX_LEVEL < 2) errors.push('MAX_LEVEL : au moins le niveau 2');
  if (XP_CURVE.base <= 0 || XP_CURVE.growth < 1) errors.push('XP_CURVE : base positive et croissance d’au moins 1 (chaque niveau demande plus)');
  for (const [id, xp] of Object.entries(KILL_XP)) {
    if (!Number.isInteger(xp) || xp <= 0) errors.push(`KILL_XP.${id} : un nombre entier d'XP strictement positif`);
  }
  if (BASE_XP.length !== ENEMY_BASE_LEVELS.length) errors.push('BASE_XP : une entrée par niveau de base mutante');
  for (const [index, xp] of BASE_XP.entries()) {
    if (xp.base <= 0 || xp.chief <= 0) errors.push(`BASE_XP[${index}] : XP de la base et de son chef strictement positives`);
  }
  for (const [id, share] of Object.entries(XP_SHARE)) {
    if (share < 0 || share > 1) errors.push(`XP_SHARE.${id} : une part dans [0, 1]`);
  }
  if (LEVEL_GAINS.maxHp <= 0) errors.push('LEVEL_GAINS.maxHp : au moins un point de vie par niveau');
  for (const [stat, gain] of Object.entries(LEVEL_GAINS.stats)) {
    if (!(stat in RESEARCH_STATS) || !(Number(gain) > 0)) errors.push(`LEVEL_GAINS.stats.${stat} : statistique inconnue ou gain nul`);
  }
  return errors;
}

function sum(amounts: Partial<Record<string, number>>): number {
  return Object.values(amounts).reduce<number>((total, amount) => total + (amount ?? 0), 0);
}

/** Lance la validation et hurle en console. Appelé depuis `main.ts` en dev seulement. */
export function assertPrototypes(): void {
  const errors = validatePrototypes();

  if (errors.length > 0) {
    throw new Error(`Prototypes invalides :\n- ${errors.join('\n- ')}`);
  }
}
