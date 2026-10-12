/**
 * Icônes du HUD : un SVG → une `data:` URL.
 *
 * Le HUD est du DOM, pas du Pixi : ses images sont des `<img>`. Comme tout
 * visuel du jeu est déjà un SVG, il n'y a rien à baker : le navigateur le
 * dessine lui-même, net à toutes les densités d'écran.
 *
 * Six sources : les icônes d'objets (`data/icons.ts`, une par objet,
 * garanti par le type), le bâtiment fini de chaque sprite, pour que le menu
 * de construction montre ce qu'on va poser, le médaillon de son métier
 * (`data/jobIcons.ts`, un par bâtiment), le portrait d'une créature
 * (ses morceaux de face), les familles du menu de construction
 * (`data/categoryIcons.ts`) et les pictogrammes de l'interface (`art/ui.ts`).
 */

import { DPAD_GLYPH, FACE_GLYPHS, STICK_GLYPH, type FaceButton } from '../art/padGlyphs.ts';
import { ROAD_THUMB } from '../art/road.ts';
import { UI_ICONS, type UiIcon } from '../art/ui.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { CATEGORY_ICONS, type CategoryFilter } from '../data/categoryIcons.ts';
import { ITEM_ICONS, PRESTIGE_ICON } from '../data/icons.ts';
import { JOB_ICONS } from '../data/jobIcons.ts';
import type { ItemId } from '../data/items.ts';
import { PERKS, type PerkId } from '../data/perks.ts';
import { embed, svg } from '../data/artDirection.ts';
import { SPRITES, type SpriteId } from '../data/sprites.ts';
import { t } from '../i18n/locale.ts';
import type { PadKind } from '../input/gamepad.ts';

const cache = new Map<string, string>();

function url(key: string, svg: string): string {
  const cached = cache.get(key);

  if (cached) return cached;

  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  cache.set(key, encoded);
  return encoded;
}

/** URL de l'icône d'un objet. */
export function itemIconUrl(item: ItemId): string {
  return url(`item:${item}`, ITEM_ICONS[item]);
}

/** URL de la vignette d'un bâtiment : son morceau `built`. */
export function buildingIconUrl(building: BuildingId): string {
  return url(`building:${building}`, SPRITES[BUILDINGS[building].sprite].parts.built);
}

/** URL du médaillon de métier d'un bâtiment. */
export function jobIconUrl(building: BuildingId): string {
  return url(`job:${building}`, JOB_ICONS[building]);
}

/** URL de la vignette d'une base mutante : son campement. */
export function enemyBaseIconUrl(): string {
  return url('enemyBase', SPRITES.enemyBase.parts.built);
}

/** Les morceaux d'un portrait de créature, du fond vers l'avant : les pieds, le corps de face, les pinces d'un crabe. Pas le halo d'un mutant, que seul le rendu fait respirer en transparence. */
const PORTRAIT_PARTS = ['foot', 'down', 'claws'] as const;

/**
 * URL du portrait d'une créature — habitant ou ennemi — pour la fenêtre :
 * les morceaux de son sprite, posés l'un sur l'autre dans leur cadre commun,
 * comme le pantin immobile qui regarde vers nous — celui d'une femme pour `woman`.
 */
export function creatureIconUrl(sprite: SpriteId, woman = false): string {
  const { width, height, parts } = SPRITES[sprite];
  const layers = PORTRAIT_PARTS.flatMap((part) => {
    // Une femme : son corps à elle (`woman.down`), si le sprite en a un.
    const source = (woman ? (parts as Record<string, string>)[`woman.${part}`] : undefined) ?? (parts as Record<string, string>)[part];

    return source === undefined ? [] : [embed(source, 0, 0)];
  });

  return url(`creature:${sprite}${woman ? ':woman' : ''}`, svg(width, height, ...layers));
}

/** URL du cadran de l'horloge du HUD (`dayDialSvg`) : il bouge sans cesse, rien à garder en cache. */
export function dayDialUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Un `<img>` d'icône d'objet, prêt à insérer. */
export function itemIcon(item: ItemId, size = 20): HTMLImageElement {
  const element = image(itemIconUrl(item), 'icon', size, size);

  element.alt = t().items[item];
  element.title = t().items[item];
  return element;
}

/** Un `<img>` de l'icône du Prestige (`data/prestige.ts`), libellée comme une icône d'objet. */
export function prestigeIcon(size = 20): HTMLImageElement {
  const element = image(url('prestige', PRESTIGE_ICON), 'icon', size, size);

  element.alt = t().hud.stock.prestige;
  element.title = t().hud.stock.prestige;
  return element;
}

/** Un `<img>` de vignette de bâtiment. */
export function buildingIcon(building: BuildingId, size = 40): HTMLImageElement {
  const element = image(buildingIconUrl(building), 'icon icon-building', size, size);

  element.alt = t().buildings[building].label;
  return element;
}

/** Un `<img>` du médaillon de métier d'un bâtiment, décoratif : son nom est écrit à côté. */
export function jobIcon(building: BuildingId, size = 20): HTMLImageElement {
  const element = image(jobIconUrl(building), 'icon icon-job', size, size);

  element.alt = '';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/** L'icône d'une puce de filtre du menu de construction, décorative : la puce porte son nom. */
export function categoryIcon(filter: CategoryFilter, size = 20): HTMLImageElement {
  const element = image(url(`category:${filter}`, CATEGORY_ICONS[filter]), 'icon icon-ui', size, size);

  element.alt = '';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/** La vignette de la route au menu de construction : quelques dalles qui tournent. */
export function roadIcon(size = 40): HTMLImageElement {
  const element = image(url('road', ROAD_THUMB), 'icon icon-building', size, size);

  element.alt = t().screens.road;
  return element;
}

/** Un pictogramme d'interface (pause, son, marteau…), décoratif : le bouton porte déjà son libellé. */
export function uiIcon(name: UiIcon, size = 24): HTMLImageElement {
  const element = image(url(`ui:${name}`, UI_ICONS[name]), 'icon icon-ui', size, size);

  element.alt = '';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/** Un bouton de la manette (`art/padGlyphs.ts`), décoratif : son action est écrite à côté. */
export function padGlyph(kind: PadKind, button: FaceButton | 'dpad' | 'stick', size = 24): HTMLImageElement {
  const source = button === 'dpad' ? DPAD_GLYPH : button === 'stick' ? STICK_GLYPH : FACE_GLYPHS[kind][button];
  const element = image(url(`pad:${kind}:${button}`, source), 'icon icon-ui pad-glyph', size, size);

  element.alt = '';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/** L'icône d'un bonus du jardin, décorative : la ligne porte déjà son nom. */
export function perkIcon(perk: PerkId, size = 32): HTMLImageElement {
  const { icon } = PERKS[perk];
  const element =
    'item' in icon ? itemIcon(icon.item, size) : 'building' in icon ? buildingIcon(icon.building, size) : uiIcon(icon.ui, size);

  element.alt = '';
  element.removeAttribute('title');
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function image(src: string, className: string, width: number, height: number): HTMLImageElement {
  const element = document.createElement('img');

  element.className = className;
  element.src = src;
  element.width = width;
  element.height = height;
  element.draggable = false;
  return element;
}

/**
 * Une ligne « icône + quantité », réutilisée par le sac, les coûts du menu
 * et l'avancement d'un chantier. `have` permet d'afficher `3/12` et de
 * colorer selon que la quantité est atteinte.
 */
export function itemAmount(item: ItemId, amount: number, have?: number): HTMLElement {
  const element = document.createElement('span');

  element.className = 'item-amount';
  element.append(itemIcon(item));

  const text = document.createElement('span');

  text.textContent = have === undefined ? String(amount) : `${have}/${amount}`;
  element.append(text);

  if (have !== undefined) element.dataset['done'] = String(have >= amount);
  return element;
}
