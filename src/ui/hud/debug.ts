/**
 * Les statistiques de debug, seulement avec `?debug` (ou la touche `²`/`` ` ``),
 * et le compteur de performances du réglage, en bas au centre.
 */

import type { AtlasStats } from '../../render/spriteLibrary.ts';
import type { WaterStats } from '../../render/waterLayer.ts';
import type { World } from '../../sim/world.ts';
import type { SaveStats } from '../../storage/localSave.ts';
import { t } from '../../i18n/locale.ts';
import type { PerfReading } from '../perfMeter.ts';
import { element } from './dom.ts';

export class DebugStats {
  public readonly stats: HTMLElement;
  /** Le compteur de performances (réglage), caché par défaut. */
  public readonly perf: HTMLElement;

  private on: boolean;

  private readonly world: World;
  /** Ce qu'a coûté la dernière sauvegarde automatique. */
  private readonly saveStats: () => SaveStats | null;

  public constructor(world: World, on: boolean, saveStats: () => SaveStats | null) {
    this.world = world;
    this.on = on;
    this.saveStats = saveStats;
    this.stats = element('div', 'panel hud-stats');
    this.stats.hidden = !on;
    this.perf = element('div', 'hud-perf');
    this.perf.hidden = true;
  }

  /** Le panneau de debug est-il ouvert ? Ses raccourcis (brouillard) n'agissent qu'alors. */
  public get open(): boolean {
    return this.on;
  }

  public toggle(): void {
    this.on = !this.on;
    this.stats.hidden = !this.on;
  }

  /** Affiche ou masque le compteur de performances ; il attend sa première mesure. */
  public setPerf(on: boolean): void {
    this.perf.hidden = !on;
    if (on) this.perf.textContent = '';
  }

  /** La moyenne de la dernière fenêtre du compteur (`PerfSampler`). */
  public showPerf(reading: PerfReading): void {
    this.perf.textContent = t().hud.perf(reading.fps, reading.tickMs, reading.wakes);
  }

  /** Le panneau, s'il est ouvert. */
  public update(fps: number, chunks: number, atlas: AtlasStats, water: WaterStats, weatherParticles: number): void {
    if (!this.on) return;

    const { world } = this;
    const { cx, cy } = world.playerChunk();
    const lines = [
      `tick ${world.tickCount}   ${fps.toFixed(0)} fps   seed ${world.seed}`,
      `chunk ${cx},${cy}   ${chunks} blocs de sol   ${world.resources.size()} tuiles entamées`,
      `eau ${water.blocks} bloc(s) à l'écran, ${water.tiles} tuile(s) au shader`,
      `atlas ${atlas.images} images → ${atlas.pages} texture(s), ${atlas.megapixels.toFixed(1)} Mpx @${atlas.resolution}x, ${atlas.ms} ms`,
      `${world.entities.size} bâtiment(s)   ${world.mobiles.size} mobile(s)   ${world.pendingWakes()} réveil(s)`,
      `météo ${world.weather()?.id ?? 'calme'}   ${weatherParticles} particule(s)`,
      `brouillard ${world.fog.enabled ? 'oui' : 'levé'} (F)   ${world.fog.exploredCount()} case(s) explorée(s), ${world.fog.sourceCount} source(s)`,
      saveLine(this.saveStats()),
    ];

    for (const entity of world.entities.values()) {
      if (entity.kind === 'site') continue;

      const contents = entity.store
        .entries()
        .map(([item, amount]) => `${t().items[item]} ${amount}`)
        .join(', ');
      const stopped = (entity.kind === 'drill' || entity.kind === 'forge') && entity.blocked ? ' — arrêtée' : '';

      lines.push(`#${entity.id} ${t().buildings[entity.proto].label} : ${contents || 'vide'}${stopped}`);
    }

    this.stats.textContent = lines.join('\n');
  }

  /** Rien de branché hors des deux panneaux. */
  public dispose(): void {}
}

/** La ligne du panneau de debug sur la sauvegarde : taille, temps de chaque étape, pics de la session. */
function saveLine(stats: SaveStats | null): string {
  if (!stats) return 'sauvegarde : aucune écriture encore';

  const ko = (chars: number): string => `${(chars / 1024).toFixed(1)} ko`;
  const ms = (value: number): string => value.toFixed(1);
  const total = stats.snapshotMs + stats.stringifyMs + stats.writeMs;

  return `sauvegarde ${ko(stats.bytes)}   ${ms(total)} ms (état ${ms(stats.snapshotMs)} + JSON ${ms(stats.stringifyMs)} + écriture ${ms(stats.writeMs)})   pic ${ko(stats.peakBytes)}, ${ms(stats.peakMs)} ms   ${stats.writes} écriture(s)`;
}
