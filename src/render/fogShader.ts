/**
 * Le shader du brouillard de guerre : un seul quad pour tout le voile.
 *
 * Il lit le champ de la fenêtre (`fogLayer.ts` : un texel par tuile, R la
 * part d'inconnu, G le voile de l'exploré hors de vue et des régions pas
 * conquises) et un bruit qui se répète (`fogClouds`), et peint :
 *
 * - l'**inconnu**, non plus un aplat mais une brume de deux tons de l'indigo
 *   (`FOG_TINT.unexplored`, `FOG_TINT.cloud`) : des nappes rondes qui
 *   dérivent lentement avec le vent ;
 * - son **bord**, que le même bruit gonfle et creuse d'une demi-tuile : des
 *   nuages arrondis plutôt qu'un dégradé — jamais sur une case vue, où le
 *   champ vaut zéro ;
 * - le **voile** de l'exploré, tel qu'avant.
 *
 * Aucune fuite : le bruit ne dépend que de la seed et des coordonnées, jamais
 * de ce que la carte porte sous la brume.
 *
 * Tout tourne sur `uTime`, le temps de rendu en secondes, jamais sur le tick
 * de la simulation. Les couleurs viennent de `FOG_TINT`.
 */

import { RIPPLE_LATTICE, RIPPLE_TEXELS, ripplesTexture } from './waterField.ts';

/** Côté de la texture de bruit, en texels. */
export const CLOUD_TEXELS = RIPPLE_TEXELS;

/**
 * Le bruit des nappes : celui des ondulations de l'eau (`ripplesTexture`),
 * périodique et rond, tiré d'une autre graine. Fonction de la seed seule :
 * c'est ce qui garantit que la brume ne trahit rien de la carte.
 */
export function fogClouds(seed: number): Uint8Array {
  return ripplesTexture((seed ^ 0x5bd1e995) >>> 0);
}

/** Les commentaires restent ici : le GPU ne reçoit que le code, en ASCII (cf. `waterShader.ts`). */
function glsl(source: string): string {
  return source.replace(/\/\/.*$/gm, '');
}

export const FOG_VERTEX = glsl(`#version 300 es
in vec2 aPosition;
in vec2 aUV;

out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;

  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`);

export const FOG_FRAGMENT = glsl(`#version 300 es
in vec2 vUV;

out vec4 finalColor;

uniform sampler2D uField;
uniform sampler2D uClouds;

uniform float uTime;
// Coin haut gauche de la fenetre et sa taille, en tuiles.
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform vec3 uDeep;
uniform vec3 uCloud;
uniform vec3 uVeil;

// Une maille du bruit couvre autant de tuiles : des nappes de quelques tuiles.
const float SCALE = 0.12;
const float LATTICE = ${RIPPLE_LATTICE.toFixed(1)};

// Le bruit, 0 a 1, lu dans sa texture qui se repete : une maille par unite de p.
float clouds(vec2 p) {
  return texture(uClouds, p / LATTICE).r;
}

void main() {
  vec4 field = texture(uField, vUV);
  vec2 tile = uOrigin + vUV * uSize;
  vec2 drift = vec2(uTime * 0.05, uTime * 0.018);

  // Deux bruits qui glissent a des vitesses differentes : la brume change de forme en derivant.
  float big = clouds(tile * SCALE + drift);
  float small = clouds(mat2(0.8, -0.6, 0.6, 0.8) * tile * SCALE * 2.3 - drift * 1.7 + 7.0);
  float mist = big * 0.65 + small * 0.35;

  // Le bord : gonfle ou creuse la ou le champ hesite, jamais sur une case vue (dark = 0) ni au coeur de l'inconnu.
  float dark = field.r;
  float edge = dark + (mist - 0.5) * 2.4 * dark * (1.0 - dark);

  dark = smoothstep(0.0, 1.0, clamp(edge, 0.0, 1.0));

  // Des nappes rondes, au bord doux, du ton sombre vers le ton clair de l'indigo.
  float puff = smoothstep(0.4, 0.68, mist);
  vec3 unknown = mix(uDeep, uCloud, puff * 0.9);

  float veil = field.g;
  float alpha = dark + veil * (1.0 - dark);
  float share = alpha > 0.0 ? dark / alpha : 0.0;
  vec3 color = mix(uVeil, unknown, share);

  finalColor = vec4(color * alpha, alpha);
}
`);
