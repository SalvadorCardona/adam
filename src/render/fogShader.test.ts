import { describe, expect, it } from 'vitest';
import { World } from '../sim/world.ts';
import { CLOUD_TEXELS, FOG_FRAGMENT, fogClouds } from './fogShader.ts';

describe('la brume du brouillard', () => {
  it('ne dépend que de la seed : même graine, même brume ; autre graine, autre brume', () => {
    expect(fogClouds(42)).toEqual(fogClouds(42));
    expect(fogClouds(42)).not.toEqual(fogClouds(43));
    expect(fogClouds(42)).toHaveLength(CLOUD_TEXELS * CLOUD_TEXELS * 4);
  });

  it('ne trahit rien de la carte : la brume se tire de la graine, jamais de ce que le monde porte', () => {
    const fresh = World.newColony(7);
    const played = World.newColony(7);

    // Le monde vit — récolte, porteurs, brouillard qui recule — : la brume, elle, ne bouge pas.
    for (let tick = 0; tick < 400; tick += 1) played.tick();
    expect(fogClouds(played.seed)).toEqual(fogClouds(fresh.seed));
  });

  it('ne lit que son champ, son bruit et des coordonnées', () => {
    const samplers = [...FOG_FRAGMENT.matchAll(/uniform sampler2D (\w+);/g)].map((match) => match[1]);

    expect(samplers).toEqual(['uField', 'uClouds']);
    expect(FOG_FRAGMENT).not.toMatch(/[^\x20-\x7e\n]/);
  });
});
