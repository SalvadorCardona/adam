/**
 * Ce que le joueur entend et sent des événements du monde : les sons, les
 * éclats, la vibration du téléphone et de la manette, l'alarme de la mairie,
 * les secousses de la caméra.
 */
import { CHIEF, type WildlifeId } from '../data/enemies.ts';
import { GROUND, PARTICLES, type ParticleStyle } from '../data/artDirection.ts';
import { NIGHT_STAKES } from '../data/dayNight.ts';
import type { ItemId } from '../data/items.ts';
import type { AudioEngine } from '../audio/engine.ts';
import { TILE_SIZE } from '../core/grid.ts';
import { reducedMotion } from '../render/motion.ts';
import type { GameRenderer } from '../render/renderer.ts';
import type { Entity } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import type { Disposer } from '../ui/disposer.ts';
import type { GamepadControls } from '../ui/gamepadControls.ts';
import { haptics } from '../ui/haptics.ts';
import { HarvestCombo, comboPitch } from '../ui/harvestCombo.ts';
import type { Hud } from '../ui/hud.ts';
import type { SettingsPanel } from '../ui/settingsPanel.ts';

/** Distance, en tuiles, à laquelle Adam entend la hache d'un bûcheron. */
const CHOP_HEARING_TILES = 9;

/** Ce qui saute d'une ressource entamée, ou d'un butin ramassé : la famille de l'objet. */
const ITEM_PARTICLES: Record<ItemId, ParticleStyle> = {
  wood: PARTICLES.wood,
  stone: PARTICLES.stone,
  ironOre: PARTICLES.iron,
  coal: PARTICLES.coal,
  food: PARTICLES.food,
  meat: PARTICLES.claw,
  grilledMeat: PARTICLES.claw,
  wheat: PARTICLES.food,
  bread: PARTICLES.food,
  water: PARTICLES.water,
  ironPlate: PARTICLES.iron,
  brick: PARTICLES.stone,
  tools: PARTICLES.iron,
  steel: PARTICLES.coal,
  mutantGoo: PARTICLES.mutant,
  wolfFang: PARTICLES.bone,
  crabClaw: PARTICLES.claw,
  radCore: PARTICLES.mutant,
  amber: PARTICLES.food,
  pearl: PARTICLES.water,
  quartz: PARTICLES.iron,
  spore: PARTICLES.fur,
};


/** Le compte à rebours d'une vague commence à tant de secondes : c'est là qu'elle s'annonce. */
const WAVE_ANNOUNCE_SECONDS = 3;

/**
 * Le recul de la caméra à l'annonce d'une vague : léger, et tenu le temps de
 * l'annonce et de la sortie des flaques — assez pour voir d'où elle vient,
 * pas assez pour gêner la récolte.
 */
const WAVE_ZOOM = 0.82;
const WAVE_ZOOM_MS = 5200;

/** Les gestes qui comptent comme une activation utilisateur pour l'audio. */
const GESTURES = ['pointerdown', 'pointerup', 'keydown'] as const;

const BEAST_PARTICLES: Record<WildlifeId, ParticleStyle> = {
  crab: PARTICLES.claw,
  wolf: PARTICLES.fur,
  // Les gardiens d'une base sont des mutants : ils giclent fluo.
  guardian: PARTICLES.mutant,
  spitter: PARTICLES.mutant,
  chief: PARTICLES.mutant,
  // Les gardiens des régions : la bête qu'ils ont été, en plus grand.
  greatWolf: PARTICLES.fur,
  giantCrab: PARTICLES.claw,
  colossus: PARTICLES.mutant,
  sludgeKing: PARTICLES.mutant,
};
/** Les éclats d'un mur frappé : ceux de la pierre, dans l'ombre de la roche. */
const CHIP_PARTICLES: ParticleStyle = { ...PARTICLES.stone, colors: [GROUND.rock.shade] };

/**
 * Un son par événement de simulation. Le moteur ne connaît pas le monde,
 * le monde ne connaît pas le moteur : la table est ici, et nulle part ailleurs.
 */
export function wireAudio(life: Disposer, world: World, audio: AudioEngine, settings: SettingsPanel): void {
  // Les navigateurs mobiles exigent un geste avant le moindre son : le
  // premier doigt posé n'importe où déverrouille tout, musique comprise.
  // On réessaie à chaque geste tant que le contexte n'a pas démarré — iOS
  // n'accepte pas toujours le premier `pointerdown` comme un vrai geste.
  const unlock = (): void => {
    audio.unlock();

    if (!audio.ready) return;
    for (const type of GESTURES) window.removeEventListener(type, unlock);
  };

  for (const type of GESTURES) window.addEventListener(type, unlock);
  life.add(() => {
    for (const type of GESTURES) window.removeEventListener(type, unlock);
  });

  // Onglet caché, plus de musique ; au retour, elle reprend. Si le navigateur
  // refuse de reprendre sans geste (iOS), le prochain doigt posé s'en charge.
  life.listen(document, 'visibilitychange', () => {
    audio.setHidden(document.hidden);
    if (!document.hidden) for (const type of GESTURES) window.addEventListener(type, unlock);
  });

  // Un « tic » sous chaque bouton de l'interface (pas sur la carte, qui a ses propres sons).
  life.listen(
    document,
    'pointerdown',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;

      if (button && !button.disabled) audio.play('tap');
    },
    { capture: true },
  );

  settings.setSound(!audio.muted);
  settings.setMusic(audio.musicOn);
  settings.setVolumes(audio.sfxVolume, audio.musicVolume);

  // Une partie rechargée au crépuscule ou en pleine vague : l'oreille le sait aussitôt.
  const phase = world.clock()?.phase;

  if (phase === 'dusk' || phase === 'night') audio.night('dusk');
  if ([...world.mobiles.values()].some((mobile) => mobile.kind === 'mutant')) audio.night('wave');

  // Récolter sans s'arrêter fait monter le son en hauteur (`ui/harvestCombo.ts`).
  const combo = new HarvestCombo();

  life.on(world.events, 'resourceHarvested', ({ item }) => audio.play(item === 'wood' ? 'chop' : 'rock', comboPitch(combo.hit(performance.now()))));
  // Une hache de bûcheron ne s'entend qu'à côté d'Adam : dix cabanes au loin ne font pas un vacarme.
  life.on(world.events, 'treeChopped', ({ tx, ty }) => {
    const dx = (tx + 0.5) * TILE_SIZE - world.player.x;
    const dy = (ty + 0.5) * TILE_SIZE - world.player.y;

    if (dx * dx + dy * dy <= (CHOP_HEARING_TILES * TILE_SIZE) ** 2) audio.play('chop');
  });
  life.on(world.events, 'siteDelivered', () => audio.play('deliver'));
  life.on(world.events, 'storeTaken', () => audio.play('deliver'));
  life.on(world.events, 'buildingSupplied', () => audio.play('deliver'));
  life.on(world.events, 'labSupplied', () => audio.play('deliver'));
  life.on(world.events, 'researchCompleted', () => audio.play('eureka'));
  life.on(world.events, 'boonChosen', () => audio.play('eureka'));
  life.on(world.events, 'starFell', () => audio.play('pickup'));
  life.on(world.events, 'challengeCompleted', () => audio.play('objective'));
  life.on(world.events, 'townDeposited', () => audio.play('deliver'));
  life.on(world.events, 'itemDropped', () => audio.play('pickup'));
  life.on(world.events, 'buildingCompleted', () => audio.play('build'));
  life.on(world.events, 'buildingUpgraded', () => audio.play('upgrade'));
  life.on(world.events, 'arrowShot', () => audio.play('arrow'));
  life.on(world.events, 'skillCast', () => audio.play('volley'));
  life.on(world.events, 'workerStarved', () => audio.mourn());
  life.on(world.events, 'comboBroken', () => audio.play('deny'));
  life.on(world.events, 'mutantHit', () => audio.play('hit'));
  life.on(world.events, 'mutantDied', () => audio.play('die'));
  life.on(world.events, 'mutantStunned', () => audio.play('dizzy'));
  life.on(world.events, 'patientFollowing', () => audio.play('pickup'));
  life.on(world.events, 'patientAdmitted', () => audio.play('open'));
  life.on(world.events, 'mutantHealed', () => audio.play('baby'));
  life.on(world.events, 'kidGrewUp', () => audio.play('baby'));
  life.on(world.events, 'survivorJoined', () => audio.play('baby'));
  life.on(world.events, 'woundedFollowing', () => audio.play('pickup'));
  life.on(world.events, 'deerCaught', () => audio.play('eureka'));
  life.on(world.events, 'beastHit', () => audio.play('hit'));
  life.on(world.events, 'beastDied', () => audio.play('die'));
  life.on(world.events, 'playerHurt', ({ hp }) => {
    if (hp > 0) audio.play('bite');
  });
  life.on(world.events, 'playerKnockedOut', () => audio.play('faint'));
  life.on(world.events, 'buildingDamaged', ({ hp }) => {
    if (hp > 0) audio.play('thud');
  });
  life.on(world.events, 'playerRepaired', () => audio.play('repair'));
  life.on(world.events, 'buildingDestroyed', () => audio.play('collapse'));
  life.on(world.events, 'enemyBaseHit', () => audio.play('thud'));
  life.on(world.events, 'enemyBaseDestroyed', () => {
    audio.play('collapse');
    audio.play('objective');
  });
  life.on(world.events, 'enemyBaseResisted', () => audio.play('deny'));
  life.on(world.events, 'enemyBaseShielded', () => audio.play('deny'));
  life.on(world.events, 'spitShot', () => audio.play('gloop'));
  life.on(world.events, 'chiefSlamWarned', () => audio.play('brute'));
  life.on(world.events, 'baseFireWarned', () => audio.play('brute'));
  life.on(world.events, 'baseFired', () => audio.play('gloop'));
  life.on(world.events, 'chiefSlammed', () => audio.play('thud'));
  life.on(world.events, 'enemyChiefDefeated', () => audio.play('objective'));
  life.on(world.events, 'regionConquered', () => audio.play('objective'));
  life.on(world.events, 'levelUp', () => audio.play('objective'));
  life.on(world.events, 'gearCrafted', () => audio.play('upgrade'));
  life.on(world.events, 'companionTraining', () => audio.play('upgrade'));
  life.on(world.events, 'companionJoined', () => audio.play('objective'));
  life.on(world.events, 'companionDied', () => audio.play('deny'));
  life.on(world.events, 'recruitRejected', () => audio.play('deny'));
  life.on(world.events, 'companionHealed', () => audio.play('pickup'));
  life.on(world.events, 'siteCancelled', () => audio.play('deliver'));
  life.on(world.events, 'decorRemoved', () => audio.play('pickup'));
  life.on(world.events, 'waveCountdown', ({ seconds }) => {
    if (seconds === WAVE_ANNOUNCE_SECONDS) audio.play('horn');
    audio.play('countdown');
  });
  life.on(world.events, 'duskFell', () => audio.night('dusk'));
  life.on(world.events, 'waveStarted', ({ boss }) => {
    audio.play('alarm');
    audio.play('gloop');
    audio.night('wave');
    if (boss) audio.play('brute');
  });
  life.on(world.events, 'waveCleared', () => {
    audio.play('victory');
    audio.night('cleared');
  });
  life.on(world.events, 'dawnBroke', () => {
    audio.night('dawn');
    audio.play('dawn');
  });
  life.on(world.events, 'queenAnnounced', () => audio.play('horn'));
  life.on(world.events, 'graceEnding', () => audio.play('horn'));
  life.on(world.events, 'queenLaid', () => audio.play('gloop'));
  life.on(world.events, 'queenDived', () => audio.play('gloop'));
  life.on(world.events, 'queenSlain', () => audio.play('objective'));
  life.on(world.events, 'lootPicked', () => audio.play('pickup'));
  life.on(world.events, 'pieceFound', () => audio.play('pickup'));
  life.on(world.events, 'chestOpened', () => audio.play('eureka'));
  life.on(world.events, 'discoveryFound', ({ kind }) => {
    if (kind !== 'chest') audio.play(kind === 'ruin' ? 'eureka' : 'pickup');
  });
  life.on(world.events, 'childBorn', () => audio.play('baby'));
  life.on(world.events, 'eveArrived', () => audio.play('build'));
  life.on(world.events, 'traded', () => audio.play('deliver'));
  life.on(world.events, 'questCompleted', () => audio.play('build'));
  life.on(world.events, 'townHallDestroyed', () => {
    audio.play('defeat');
    audio.night('dawn');
  });
  // Un objectif a son jingle ; le dernier d'un chapitre laisse la fanfare à la fin du chapitre.
  life.on(world.events, 'objectiveCompleted', ({ closing }) => {
    if (!closing) audio.play('objective');
  });
  life.on(world.events, 'chapterCompleted', () => audio.play('colony'));
  // Une ère atteinte a la fanfare d'une fin d'acte.
  life.on(world.events, 'eraReached', () => audio.play('colony'));
  life.on(world.events, 'antennaRaised', () => audio.play('build'));
  life.on(world.events, 'antennaFell', () => audio.play('alarm'));
  life.on(world.events, 'survivorsArrived', () => audio.play('build'));
}

/** Le téléphone vibre aux moments clés : un bâtiment fini, une recherche, un objectif, une naissance. */
export function wireHaptics(life: Disposer, world: World): void {
  life.on(world.events, 'resourceHarvested', () => haptics.pulse('tick'));
  life.on(world.events, 'buildingPlaced', () => haptics.pulse('place'));
  life.on(world.events, 'waveAnnounced', () => haptics.pulse('wave'));
  life.on(world.events, 'duskFell', () => haptics.pulse('wave'));
  life.on(world.events, 'buildingCompleted', () => haptics.pulse('done'));
  life.on(world.events, 'buildingUpgraded', () => haptics.pulse('done'));
  life.on(world.events, 'childBorn', () => haptics.pulse('done'));
  life.on(world.events, 'researchCompleted', () => haptics.pulse('win'));
  life.on(world.events, 'chapterCompleted', () => haptics.pulse('win'));
  life.on(world.events, 'levelUp', () => haptics.pulse('win'));
}

/** La manette vibre, légèrement, à quelques moments clés : réglage « Vibrations de la manette ». */
export function wireRumble(life: Disposer, world: World, pad: GamepadControls): void {
  life.on(world.events, 'buildingCompleted', () => pad.rumble('done'));
  life.on(world.events, 'objectiveCompleted', () => pad.rumble('done'));
  life.on(world.events, 'levelUp', () => pad.rumble('done'));
  life.on(world.events, 'playerHurt', () => pad.rumble('hurt'));
  life.on(world.events, 'waveStarted', () => pad.rumble('alarm'));
}

/** Les éclats : copeaux à la coupe, sang vert à l'impact, gravats à l'effondrement. */
export function wireParticles(life: Disposer, world: World, renderer: GameRenderer): void {
  const { particles } = renderer;

  life.on(world.events, 'resourceHarvested', ({ tx, ty, item }) =>
    particles.burst((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, ITEM_PARTICLES[item]),
  );
  // Les petits éclats d'un coup de hache de bûcheron, au pied du tronc.
  life.on(world.events, 'treeChopped', ({ tx, ty, remaining }) =>
    particles.burst((tx + 0.4) * TILE_SIZE, (ty + 0.8) * TILE_SIZE, PARTICLES.wood, remaining > 0 ? 3 : 8, 0.07),
  );
  // Chaque flèche qui porte ouvre un anneau blanc là où elle touche.
  life.on(world.events, 'mutantHit', ({ x, y }) => {
    particles.ring(x, y - 12);
    particles.burst(x, y - 12, PARTICLES.mutant, 4);
  });
  life.on(world.events, 'mutantDied', ({ x, y }) => {
    particles.ring(x, y - 12);
    particles.burst(x, y - 12, PARTICLES.mutant, 12, 0.12);
  });
  life.on(world.events, 'mutantFled', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.mutant, 6, 0.1));
  // Une étoile filante touche le sol : une gerbe dorée, et son anneau.
  life.on(world.events, 'starFell', ({ x, y }) => {
    particles.ring(x, y);
    particles.burst(x, y - 6, PARTICLES.star, 16, 0.14);
  });
  life.on(world.events, 'beastHit', ({ proto, x, y }) => {
    particles.ring(x, y - 8);
    particles.burst(x, y - 8, BEAST_PARTICLES[proto], 4);
  });
  life.on(world.events, 'beastDied', ({ proto, x, y }) => {
    particles.ring(x, y - 8);
    particles.burst(x, y - 8, BEAST_PARTICLES[proto], 10, 0.12);
  });
  life.on(world.events, 'buildingDamaged', ({ id }) => {
    const entity = world.entities.get(id);

    if (!entity) return;

    const impact = impactOn(world, entity);

    particles.burst(impact.x, impact.y, CHIP_PARTICLES, 4);
  });
  life.on(world.events, 'buildingCorroded', ({ id }) => {
    const entity = world.entities.get(id);

    if (entity) particles.burst((entity.tx + entity.width / 2) * TILE_SIZE, entity.ty * TILE_SIZE + 8, PARTICLES.acid, 4);
  });
  life.on(world.events, 'buildingCompleted', ({ id }) => {
    const entity = world.entities.get(id);

    if (!entity) return;

    // Le bâtiment fait « pop » (`entityLayer.ts`), un anneau de poussière s'ouvre à son pied, puis
    // des confettis tout le long : ça y est, il tient debout.
    const foot = (entity.ty + entity.height) * TILE_SIZE;

    particles.dustRing((entity.tx + entity.width / 2) * TILE_SIZE, foot, entity.width * TILE_SIZE);
    for (let i = 0; i <= entity.width; i += 1) {
      particles.burst((entity.tx + i) * TILE_SIZE, foot, PARTICLES.confetti, 7, 0.16);
    }
  });
  // Une recherche aboutit : confettis et étoiles jaillissent du toit du labo.
  life.on(world.events, 'researchCompleted', ({ id }) => {
    const lab = world.entities.get(id);

    if (!lab) return;
    for (let i = 0; i <= lab.width; i += 1) {
      particles.burst((lab.tx + i) * TILE_SIZE, lab.ty * TILE_SIZE, PARTICLES.confetti, 6, 0.16);
    }
    particles.burst((lab.tx + lab.width / 2) * TILE_SIZE, lab.ty * TILE_SIZE, PARTICLES.star, 8, 0.12);
  });
  // Un enfant naît : une gerbe légère devant la nurserie.
  life.on(world.events, 'childBorn', ({ x, y }) => {
    particles.burst(x, y - 12, PARTICLES.confetti, 10, 0.14);
    particles.burst(x, y - 12, PARTICLES.star, 4, 0.1);
  });
  // Un nouveau type de bâtiment entre au menu : quelques confettis autour d'Adam.
  life.on(world.events, 'buildingsUnlocked', () => particles.burst(world.player.x, world.player.y - 16, PARTICLES.confetti, 10, 0.15));
  life.on(world.events, 'buildingUpgraded', ({ id }) => {
    const entity = world.entities.get(id);

    if (!entity) return;

    // Des éclats de fer et des confettis qui sautent du haut de l'emprise : le blindage est vissé.
    for (let i = 0; i <= entity.width; i += 1) {
      particles.burst((entity.tx + i) * TILE_SIZE, entity.ty * TILE_SIZE, PARTICLES.iron, 6, 0.14);
      particles.burst((entity.tx + i) * TILE_SIZE, entity.ty * TILE_SIZE, PARTICLES.confetti, 5, 0.16);
    }
  });
  life.on(world.events, 'buildingDestroyed', ({ tx, ty }) =>
    particles.burst((tx + 1) * TILE_SIZE, (ty + 1) * TILE_SIZE, PARTICLES.rubble, 16, 0.14),
  );
  // Une base mutante frappée crache sa gelée ; abattue, elle s'effondre dans un anneau de poussière.
  life.on(world.events, 'enemyBaseHit', ({ x, y }) => {
    particles.ring(x, y);
    particles.burst(x, y, PARTICLES.mutant, 4);
  });
  life.on(world.events, 'enemyBaseDestroyed', ({ x, y }) => {
    particles.dustRing(x, y + TILE_SIZE * 1.5, TILE_SIZE * 3);
    particles.burst(x, y, PARTICLES.rubble, 18, 0.14);
    particles.burst(x, y, PARTICLES.mutant, 14, 0.14);
    particles.burst(x, y, PARTICLES.confetti, 12, 0.16);
  });
  // La massue du chef tombe : un anneau de poussière à la taille de son cercle. Le crachat s'écrase en gouttes.
  life.on(world.events, 'chiefSlammed', ({ x, y }) => {
    particles.dustRing(x, y, CHIEF.slam.radius * 2 * TILE_SIZE);
    particles.burst(x, y, PARTICLES.rubble, 8, 0.1);
  });
  life.on(world.events, 'spitSplashed', ({ x, y }) => particles.burst(x, y, PARTICLES.mutant, 5, 0.08));
  // Un coffre s'ouvre : des confettis et des étoiles jaillissent de la caisse.
  life.on(world.events, 'chestOpened', ({ x, y }) => {
    particles.burst(x, y - 8, PARTICLES.confetti, 14, 0.15);
    particles.burst(x, y - 8, PARTICLES.star, 6, 0.1);
  });
  // Une région conquise : confettis et étoiles là où son gardien est tombé.
  life.on(world.events, 'regionConquered', ({ x, y }) => {
    particles.burst(x, y - 16, PARTICLES.confetti, 18, 0.18);
    particles.burst(x, y - 16, PARTICLES.star, 8, 0.12);
  });
  // Une ruine fouillée, un secret trouvé : même gerbe qu'un coffre (le coffre a la sienne, plus haut).
  life.on(world.events, 'discoveryFound', ({ kind, x, y }) => {
    if (kind === 'chest') return;
    particles.burst(x, y - 10, PARTICLES.confetti, 12, 0.14);
    particles.burst(x, y - 10, PARTICLES.star, 5, 0.1);
  });
  // Un niveau de plus : une gerbe de confettis et d'étoiles autour d'Adam.
  life.on(world.events, 'levelUp', ({ x, y }) => {
    particles.burst(x, y - 16, PARTICLES.confetti, 16, 0.16);
    particles.burst(x, y - 16, PARTICLES.star, 8, 0.12);
  });
  life.on(world.events, 'fireballBurst', ({ x, y, hit }) => particles.burst(x, y, PARTICLES.ember, hit ? 10 : 5, 0.1));
  life.on(world.events, 'enemyChiefDefeated', ({ x, y }) => {
    particles.burst(x, y - 16, PARTICLES.mutant, 14, 0.14);
    particles.burst(x, y - 16, PARTICLES.confetti, 12, 0.16);
  });
  life.on(world.events, 'decorRemoved', ({ tx, ty }) => particles.burst((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, PARTICLES.rubble, 5, 0.06));
  life.on(world.events, 'siteCancelled', ({ tx, ty }) => particles.burst((tx + 1) * TILE_SIZE, (ty + 1) * TILE_SIZE, PARTICLES.rubble, 8, 0.08));
  life.on(world.events, 'lootDropped', ({ x, y }) => particles.burst(x, y - 6, PARTICLES.confetti, 5, 0.08));
  life.on(world.events, 'mutantStunned', ({ x, y }) => particles.burst(x, y - 16, PARTICLES.star, 6, 0.1));
  life.on(world.events, 'mutantHealed', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.confetti, 10, 0.14));
  life.on(world.events, 'kidGrewUp', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.confetti, 10, 0.14));
  life.on(world.events, 'survivorJoined', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.confetti, 10, 0.14));
  life.on(world.events, 'deerCaught', ({ x, y }) => particles.burst(x, y - 12, PARTICLES.confetti, 12, 0.14));
  life.on(world.events, 'lootPicked', ({ item, x, y }) => particles.burst(x, y - 6, ITEM_PARTICLES[item], 6, 0.1));
  life.on(world.events, 'waveCleared', () => {
    const hall = world.entities.get(world.townHallId);

    if (!hall) return;

    // Des confettis sur le toit de la mairie : elle a tenu.
    for (let i = 0; i <= hall.width; i += 1) {
      particles.burst((hall.tx + i) * TILE_SIZE, hall.ty * TILE_SIZE, PARTICLES.confetti, 8, 0.16);
    }
  });
}

/**
 * Où un bâtiment est frappé : le point de son emprise le plus proche du
 * mutant le plus proche, un peu au-dessus du sol. Le sim ne dit pas qui
 * frappe ; le plus proche, collé au mur, l'est presque toujours.
 */
function impactOn(world: World, entity: Entity): { x: number; y: number } {
  const left = entity.tx * TILE_SIZE;
  const top = entity.ty * TILE_SIZE;
  const right = (entity.tx + entity.width) * TILE_SIZE;
  const bottom = (entity.ty + entity.height) * TILE_SIZE;
  let x = (left + right) / 2;
  let y = bottom;
  let best = Infinity;

  for (const mobile of world.mobiles.values()) {
    if (mobile.kind !== 'mutant') continue;

    const px = Math.max(left, Math.min(right, mobile.x));
    const py = Math.max(top, Math.min(bottom, mobile.y));
    const distance = (px - mobile.x) ** 2 + (py - mobile.y) ** 2;

    if (distance < best) {
      best = distance;
      x = px;
      y = py;
    }
  }
  return { x, y: y - 10 };
}

/**
 * La mairie frappée hors de l'écran : son repère clignote, le bord de l'écran
 * vire au rouge et le téléphone vibre. Sous les yeux du joueur, la secousse suffit.
 */
export function wireAlarm(life: Disposer, world: World, renderer: GameRenderer, hud: Hud): void {
  life.on(world.events, 'buildingDamaged', ({ id, hp }) => {
    if (id === world.townHallId && hp > 0 && renderer.alarmTownHall()) hud.alarm();
  });
}

/**
 * La caméra encaisse les coups : un peu pour un mur, beaucoup pour la mairie.
 * Et elle recule un peu quand une vague s'annonce, le temps qu'elle sorte de
 * terre, pour qu'on la voie arriver — puis elle revient d'elle-même.
 *
 * Sauf si le joueur est occupé (`busy`) : la carte ne glisse pas sous un
 * bâtiment qu'on pose ou une fenêtre qu'on lit. Le bandeau et le repère de
 * bord de la vague disent la direction à sa place.
 */
export function wireShake(life: Disposer, world: World, renderer: GameRenderer, busy: () => boolean): void {
  life.on(world.events, 'waveCountdown', ({ seconds, x, y }) => {
    // Au cor, la caméra tremble un instant.
    if (seconds === WAVE_ANNOUNCE_SECONDS && !reducedMotion()) renderer.shake(NIGHT_STAKES.hornShake);
    if (seconds === WAVE_ANNOUNCE_SECONDS && !busy()) renderer.zoomOut(WAVE_ZOOM, WAVE_ZOOM_MS, { x, y });
  });
  life.on(world.events, 'waveStarted', ({ x, y }) => {
    if (!busy()) renderer.zoomOut(WAVE_ZOOM, WAVE_ZOOM_MS - WAVE_ANNOUNCE_SECONDS * 1000, { x, y });
  });
  life.on(world.events, 'buildingDamaged', ({ id }) => renderer.shake(id === world.townHallId ? 0.28 : 0.14));
  life.on(world.events, 'buildingDestroyed', () => renderer.shake(0.6));
  life.on(world.events, 'enemyBaseDestroyed', () => renderer.shake(0.5));
  life.on(world.events, 'chiefSlammed', ({ hit }) => renderer.shake(hit ? 0.3 : 0.15));
  life.on(world.events, 'enemyChiefDefeated', () => renderer.shake(0.35));
  life.on(world.events, 'waveStarted', () => renderer.shake(0.3));
  life.on(world.events, 'buildingCompleted', () => renderer.shake(0.18));
  life.on(world.events, 'buildingUpgraded', () => renderer.shake(0.12));
  life.on(world.events, 'townHallDestroyed', () => renderer.shake(1));
  life.on(world.events, 'playerHurt', () => renderer.shake(0.12));
  life.on(world.events, 'playerKnockedOut', () => renderer.shake(0.4));
}
