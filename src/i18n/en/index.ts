/** The English dictionary: the same keys as the French one, which `Messages` is derived from. */

import type { Messages } from '../messages.ts';
import { account } from './account.ts';
import { collection } from './collection.ts';
import { common, settings } from './common.ts';
import { content } from './content.ts';
import { eraPanel } from './eraPanel.ts';
import { gamepad } from './gamepad.ts';
import { hud } from './hud.ts';
import { inventory } from './inventory.ts';
import { menu } from './menu.ts';
import { notifications } from './notifications.ts';
import { offline } from './offline.ts';
import { panel } from './panel.ts';
import { party } from './party.ts';
import { researchPanel } from './researchPanel.ts';
import { resourcePanel } from './resourcePanel.ts';
import { screens } from './screens.ts';
import { trade } from './trade.ts';
import { voice } from './voice.ts';
import { wardrobe } from './wardrobe.ts';

export const EN: Messages = {
  common,
  settings,
  account,
  party,
  voice,
  screens,
  hud,
  panel,
  menu,
  notifications,
  inventory,
  trade,
  researchPanel,
  eraPanel,
  resourcePanel,
  wardrobe,
  collection,
  offline,
  gamepad,
  ...content,
};
