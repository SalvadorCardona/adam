import { describe, expect, it } from 'vitest';
import { brandBanner, brandIcon, titleLogo } from '../art/brand.ts';
import { titleScene, type TitleProp } from '../art/titleScene.ts';
import { GROUND_TILES, cornerTile, edgeTile, shadowTile } from '../art/terrain.ts';
import { UI_ICONS, dayDialSvg } from '../art/ui.ts';
import { DIAL_ARCS } from '../sim/dayNight.ts';
import { GROUND, PALETTE, auditSvg, type Ground } from './artDirection.ts';
import { BUILDINGS, BUILDING_IDS } from './buildings.ts';
import { ITEM_ICONS } from './icons.ts';
import { JOB_ICONS } from './jobIcons.ts';
import { BUILDING_PARTS, SPRITES, SPRITE_IDS, WALKER_PARTS, type SpriteProto } from './sprites.ts';

const TOXIC: readonly string[] = Object.values(PALETTE.toxic);

/** Tous les SVG du jeu, avec un nom lisible pour le message d'échec. */
/** Les accessoires de l'écran titre, chacun sous son chemin (`brand.title.town.lurker.mutant…`). */
function titleProps(prefix: string, props: readonly TitleProp[]): [string, string][] {
  return props.flatMap((item): [string, string][] => [...(item.svg ? [[`${prefix}.${item.id}`, item.svg] as [string, string]] : []), ...titleProps(`${prefix}.${item.id}`, item.children ?? [])]);
}

function everySvg(): [string, string][] {
  const sprites = SPRITE_IDS.flatMap((id) =>
    Object.entries((SPRITES[id] as SpriteProto).parts).map(([part, svg]): [string, string] => [`${id}.${part}`, svg]),
  );
  const grounds = Object.keys(GROUND) as Ground[];
  const terrain = grounds.flatMap((ground) => [
    ...GROUND_TILES[ground].map((svg, i): [string, string] => [`terrain.${ground}.${i}`, svg]),
    ...(['top', 'right', 'bottom', 'left'] as const).flatMap((side): [string, string][] => {
      const svg = edgeTile(ground, side);

      return svg ? [[`terrain.edge.${ground}.${side}`, svg]] : [];
    }),
    [`terrain.shadow.${ground}`, shadowTile(ground)] as [string, string],
    [`terrain.corner.${ground}`, cornerTile(GROUND[ground].base, 'tl')] as [string, string],
  ]);
  const icons = [
    ...Object.entries(ITEM_ICONS).map(([item, svg]): [string, string] => [`icon.${item}`, svg]),
    ...Object.entries(JOB_ICONS).map(([building, svg]): [string, string] => [`job.${building}`, svg]),
    ...Object.entries(UI_ICONS).map(([name, svg]): [string, string] => [`ui.${name}`, svg]),
    ['ui.horloge.jour', dayDialSvg(DIAL_ARCS, 0.3, false, false)] as [string, string],
    ['ui.horloge.alerte', dayDialSvg(DIAL_ARCS, 0.66, false, true)] as [string, string],
    ['ui.horloge.nuit', dayDialSvg(DIAL_ARCS, 0.8, true, false)] as [string, string],
  ];
  const brand: [string, string][] = [
    ['brand.icon', brandIcon()],
    ['brand.banner', brandBanner()],
    ...titleScene().flatMap((layer) => titleProps(`brand.title.${layer.id}`, layer.props)),
    ['brand.title.logo', titleLogo()],
  ];

  return [...sprites, ...terrain, ...icons, ...brand];
}

describe('sprites', () => {
  it.each(everySvg())('%s respecte la direction artistique', (_name, svg) => {
    expect(auditSvg(svg)).toEqual([]);
  });

  it('réserve le vert fluo aux mutants', () => {
    // Seuls ont le droit de le porter : le mutant, ses gardiens, cracheurs et chefs, leur crachat, la Reine des flaques, le patient (un mutant assommé), la flaque
    // d'où il sort, leurs bases, son pictogramme, la bannière et la ville de l'écran titre, où il en passe un, la gelée et le cœur de la Reine qu'ils lâchent en
    // butin (des bouts d'eux : leur icône, le tas au sol, la charge d'un porteur) — et l'ex-mutant, pour un seul
    // détail (test suivant).
    const mutants = (name: string): boolean =>
      name.startsWith('mutant.') ||
      name.startsWith('guardian.') ||
      name.startsWith('spitter.') ||
      name.startsWith('chief.') ||
      name.startsWith('spit.') ||
      name.startsWith('queen.') ||
      name.startsWith('patient.') ||
      name.startsWith('exMutant.') ||
      name.startsWith('puddle.') ||
      name.startsWith('enemyBase.') ||
      name === 'ui.mutant' ||
      name.endsWith('.mutantGoo') ||
      name.endsWith('.radCore') ||
      name === 'brand.banner' ||
      name.startsWith('brand.title.town.lurker') ||
      name.startsWith('brand.title.town.fingers');

    for (const [name, svg] of everySvg()) {
      if (mutants(name)) continue;
      for (const color of TOXIC) expect(svg.includes(color), `${name} porte le vert des mutants`).toBe(false);
    }
  });

  it('garde l’ex-mutant humain : la tunique orange domine, le vert fluo n’est qu’un détail', () => {
    const count = (svg: string, colors: readonly string[]): number =>
      colors.reduce((total, color) => total + svg.split(color).length - 1, 0);

    for (const part of WALKER_PARTS.filter((name) => name !== 'foot')) {
      const svg = SPRITES.exMutant.parts[part];
      const toxic = count(svg, TOXIC);

      expect(toxic, `exMutant.${part} a perdu sa touffe`).toBeGreaterThan(0);
      // La touffe : trois mèches, deux tons chacune. Au-delà, le fluo déborde du détail.
      expect(toxic, `exMutant.${part} est trop vert`).toBeLessThanOrEqual(6);
      expect(count(svg, Object.values(PALETTE.orange)), `exMutant.${part} n'a plus sa tunique`).toBeGreaterThan(0);
    }
    // Sa charge et ses pieds sont ceux d'un humain.
    for (const [part, svg] of Object.entries(SPRITES.exMutant.parts)) {
      // Sauf quand il porte de la gelée de mutant ou le cœur de la Reine : c'est elle qui est verte, pas lui.
      if ((part.startsWith('load.') && part !== 'load.mutantGoo' && part !== 'load.radCore') || part === 'foot') expect(count(svg, TOXIC), `exMutant.${part}`).toBe(0);
    }
  });

  it('donne à chaque marcheur un corps par direction et un pied', () => {
    for (const id of ['adam', 'mutant', 'queen', 'kid', 'worker', 'patient', 'exMutant'] as const) {
      for (const part of WALKER_PARTS) expect(SPRITES[id].parts).toHaveProperty(part);
    }
  });

  it('donne à chaque bâtiment son chantier, sa version finie et sa version endommagée', () => {
    for (const id of BUILDING_IDS) {
      for (const part of BUILDING_PARTS) expect(SPRITES[BUILDINGS[id].sprite].parts, `${id}.${part}`).toHaveProperty(part);
    }
  });

  it('donne à chaque bâtiment son propre sprite, sans en réutiliser un autre', () => {
    const sprites = BUILDING_IDS.map((id) => BUILDINGS[id].sprite);

    expect(new Set(sprites).size, 'deux bâtiments partagent un sprite').toBe(sprites.length);

    // Aucun morceau n'est celui d'un autre bâtiment, ni un autre état du même :
    // un chantier générique partagé par tous ferait échouer ce test.
    const seen = new Map<string, string>();

    for (const id of BUILDING_IDS) {
      const parts = SPRITES[BUILDINGS[id].sprite].parts as Record<string, string>;

      for (const part of BUILDING_PARTS) {
        const svg = parts[part] ?? '';
        const twin = seen.get(svg);

        expect(twin, `${id}.${part} est identique à ${twin}`).toBeUndefined();
        seen.set(svg, `${id}.${part}`);
      }
    }
  });

  it('garde les cadres et les ancres du monde', () => {
    // Les ancres en coordonnées monde ne bougent pas : la simulation n'en sait rien.
    expect([SPRITES.adam.width, SPRITES.adam.height, SPRITES.adam.anchorX, SPRITES.adam.anchorY]).toEqual([32, 48, 0.5, 0.8]);
    expect([SPRITES.kid.width, SPRITES.kid.height, SPRITES.kid.anchorY]).toEqual([32, 32, 0.875]);
    expect([SPRITES.townHall.width, SPRITES.townHall.height]).toEqual([96, 128]);
    expect([SPRITES.decor.width, SPRITES.decor.height]).toEqual([32, 32]);
  });
});
