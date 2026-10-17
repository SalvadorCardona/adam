/**
 * Ce qui loge ou réjouit : la Maison et ses lits, la clinique et ses places,
 * une décoration — ce qu'elle ajoute au bonheur, et le bouton qui la retire.
 */

import { BUILDINGS, type BuildingProto } from '../../data/buildings.ts';
import { CLINIC } from '../../data/clinic.ts';
import type { Clinic, Decor, House } from '../../sim/types.ts';
import { buildingView } from './building.ts';

export const houseView = buildingView<House>({
  describe({ entity, text, lines }) {
    // La Maison n'emploie personne : ses lits sont à qui n'en a pas.
    lines.push(BUILDINGS[entity.proto].workers > 0 ? text.house.sleeping : text.house.beds);
  },
});

export const clinicView = buildingView<Clinic>({
  describe({ world, entity, text, stats, lines }) {
    const used = world.clinicBedsUsed(entity.id);

    stats.push({ icon: 'people', value: `${used}/${CLINIC.beds}`, label: text.clinic.beds(used, CLINIC.beds) });
    lines.push(used >= CLINIC.beds ? text.clinic.full : text.clinic.open);
  },
});

export const decorView = buildingView<Decor>({
  describe({ entity, text, stats, host }) {
    // Une décoration debout se retire d'un tap : son coût retourne en ville.
    host.buttons.cancel.hidden = false;

    // Ce qu'elle ajoute au bonheur, et jusqu'où.
    const decor: BuildingProto = BUILDINGS[entity.proto];
    const mood = decor.mood;

    if (mood) stats.push({ icon: 'heart', value: `+${mood.amount}`, label: text.decor.mood(mood.amount, mood.radius) });
  },
});
