/**
 * Le dictionnaire français, celui qui fait foi : `Messages` (`../messages.ts`)
 * se déduit de lui. Une section par partie de l'interface, et le contenu de
 * `data/` à plat (`items`, `buildings`, `eve`…).
 */

import { collection } from './collection.ts';
import { common, settings } from './common.ts';
import { content } from './content.ts';
import { hud } from './hud.ts';
import { inventory } from './inventory.ts';
import { menu } from './menu.ts';
import { panel } from './panel.ts';
import { researchPanel } from './researchPanel.ts';
import { resourcePanel } from './resourcePanel.ts';
import { screens } from './screens.ts';
import { trade } from './trade.ts';
import { wardrobe } from './wardrobe.ts';

export const FR = {
  common,
  settings,
  screens,
  hud,
  panel,
  menu,
  inventory,
  trade,
  researchPanel,
  resourcePanel,
  wardrobe,
  collection,
  ...content,
};
