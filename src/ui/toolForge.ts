/**
 * La hache et la pioche d'Adam, dans la fenêtre de la forge : pour chacune, le
 * niveau en main, le suivant, son coût — ce qui manque en rouge — et
 * « Forger » (`craftTool`). Chaque niveau donne +1 unité par coup sur sa
 * famille (`TOOL_GEAR`, `World.bonus`).
 */

import { GEAR_WORKSHOP, MAX_TOOL, TOOL_SLOTS, toolOf, type ToolSlot } from '../data/gear.ts';
import type { ItemId } from '../data/items.ts';
import { t } from '../i18n/locale.ts';
import type { Building } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { itemAmount } from './icons.ts';

interface ToolRow {
  root: HTMLElement;
  text: HTMLElement;
  cost: HTMLElement;
  button: HTMLButtonElement;
  shown: string;
}

export class ToolForge {
  public readonly root: HTMLElement;

  private readonly world: World;
  private readonly forge: () => number | null;
  private readonly rows = new Map<ToolSlot, ToolRow>();

  public constructor(world: World, forge: () => number | null) {
    this.world = world;
    this.forge = forge;
    this.root = document.createElement('div');
    this.root.hidden = true;
    for (const slot of TOOL_SLOTS) {
      const row = this.build(slot);

      this.rows.set(slot, row);
      this.root.append(row.root);
    }
  }

  /** Oublie ce qui est affiché : la prochaine mise à jour reconstruit tout. */
  public reset(): void {
    for (const row of this.rows.values()) row.shown = '';
  }

  public hide(): void {
    this.root.hidden = true;
  }

  public refresh(entity: Building, inReach: boolean): void {
    this.root.hidden = entity.proto !== GEAR_WORKSHOP;
    if (this.root.hidden) return;
    for (const slot of TOOL_SLOTS) this.refreshRow(slot, entity, inReach);
  }

  private build(slot: ToolSlot): ToolRow {
    const root = document.createElement('div');
    const text = document.createElement('p');
    const cost = document.createElement('div');
    const actions = document.createElement('div');
    const button = document.createElement('button');

    root.className = 'building-panel-upgrade';
    text.className = 'building-panel-upgrade-effect';
    cost.className = 'building-panel-items';
    actions.className = 'building-panel-actions';
    button.type = 'button';
    button.dataset['tone'] = 'upgrade';
    button.addEventListener('click', () => {
      const forge = this.forge();

      if (forge !== null) this.world.push({ type: 'craftTool', forge, slot });
    });
    actions.append(button);
    root.append(text, cost, actions);
    return { root, text, cost, button, shown: '' };
  }

  private refreshRow(slot: ToolSlot, entity: Building, inReach: boolean): void {
    const row = this.rows.get(slot)!;
    const level = this.world.player[slot];
    const missing = this.world.toolMissing(entity, slot);
    const short = missing !== null && Object.keys(missing).length > 0;
    const text = t().panel.tools;

    row.button.disabled = missing === null || !inReach || short;

    const key = `${text.names[slot]}:${level}:${inReach}:${JSON.stringify(missing)}`;

    if (key === row.shown) return;
    row.shown = key;

    const current = text.current(text.names[slot], level === 0 ? text.bare : (t().toolGear[slot][level - 1] ?? ''), level);

    if (missing === null) {
      row.text.textContent = `${current} · ${text.best}`;
      row.cost.replaceChildren();
      row.cost.hidden = true;
      row.button.textContent = t().panel.maxLevel;
      return;
    }

    row.text.textContent = `${current} · ${text.next(t().toolGear[slot][level] ?? '', text.families[slot])}${inReach ? '' : text.comeCloser}`;
    row.cost.hidden = false;
    row.cost.replaceChildren(
      ...(Object.entries(toolOf(slot, Math.min(MAX_TOOL, level + 1)).cost) as [ItemId, number][]).map(([item, needed]) => {
        const line = itemAmount(item, needed);
        const lacking = missing[item] ?? 0;

        if (lacking > 0) {
          const note = document.createElement('span');

          line.dataset['missing'] = 'true';
          note.className = 'item-missing';
          note.textContent = t().panel.upgrade.lacking(lacking);
          line.append(note);
        }
        return line;
      }),
    );
    row.button.textContent = text.button(text.names[slot]);
  }
}
