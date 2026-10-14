---
name: art-direction
description: Direction artistique vectorielle « post-apo joyeux » d'Adam. À charger AVANT toute création ou modification de visuel — sprite, bâtiment, personnage, terrain, décor, effet, icône, écran d'interface, bannière. Donne les dix règles, la palette chiffrée, les helpers SVG de src/data/artDirection.ts et la check-list de relecture.
---

# Direction artistique — « post-apo joyeux »

La vie reprend ses droits sur la ruine : ruines arrondies envahies de
lianes, fleurs, drapeaux, échelles, grues, antennes. La fin du monde est
passée et c'est plutôt gai ; les mutants sont drôles plus qu'effrayants.

Références à regarder (avec `Read`) avant de dessiner :
`docs/art-direction/maquette-validee.png` (l'écran de jeu validé),
`docs/art-direction/reference-illustrateur-cabane.png` et
`docs/art-direction/reference-illustrateur-tour.png`, puis ce qui existe
déjà : `docs/art-direction/planche-sprites.png` et `ecran-jeu.png`. Le détail est dans
`docs/art-direction.md` ; la vérité exécutable dans `src/data/artDirection.ts`.

## La règle d'or

**Tout nouveau visuel est un SVG construit avec les helpers de
`src/data/artDirection.ts`.** Jamais de couleur tapée à la main (le type
`Color` le refuse), jamais d'image générée par un modèle, jamais de pixel
art, jamais de `Graphics` Pixi dessiné « à l'œil » pour un sprite.

## Les dix règles, en bref

1. Formes pures : capsules, rectangles très arrondis (`RADIUS`), cercles. **Aucun contour.**
2. Trois tons : `base`, `shade` (même teinte, vers le violet/bleu — jamais gris ni noir ni transparent), `light` en capsule à l'intérieur. Lumière **en haut à gauche**.
3. Palette courte : violet, jaune, corail, orange, menthe, cyan, **indigo** (remplace noir et marron : troncs, cheveux, traits).
4. Traits seulement pour les petits détails (échelles, rambardes, grues, antennes, hampes, tiges, lianes) : **une épaisseur** (`STROKE.width` = 2), bouts ronds, indigo ou teinte foncée. Lianes = tracé régulier + feuilles en capsule.
5. Arbres : coussins aplatis empilés (`cushion`) sur un tronc indigo ramifié. Pas de boules.
6. Des détails qui racontent une vie plutôt que de la texture.
7. Ombres portées **pleines**, teinte foncée du sol (`groundShadow`, `GROUND[sol].shade`).
8. Vue de dessus 3/4 : le dessus + un peu de face avant ; la grille reste lisible.
9. Une teinte dominante par famille (`FAMILY_TONES`), sans collision.
10. Personnages lisibles à petite taille. Adam : sac à dos, écharpe, arc. Mutants : tête déformée, bras trop long, halo vert.

## Palette (base / shade / light)

| | base | shade | light | famille réservée |
| --- | --- | --- | --- | --- |
| ink | `#2b2d8f` | `#1f2070` | `#3d40b8` | charbon ; troncs, cheveux, traits |
| violet | `#7b5cff` | `#5a3fd6` | `#a08bff` | ruines |
| yellow | `#ffd23f` | `#ffa91a` | `#fff27a` | colonie (bâtiments du joueur) |
| coral | `#ff4d6d` | `#d92a5b` | `#ff8aa3` | pierre ; toits en accent |
| orange | `#ff7b2e` | `#e05a1a` | `#ffa84d` | humains |
| mint | `#2fd67b` | `#15a866` | `#8ff5b5` | végétation |
| cyan | `#45d6ff` | `#2fb8ea` | `#b8f1ff` | eau ; fer |
| toxic | `#7df25f` | `#3fcf6a` | `#d2ffb8` | **mutants seulement** |
| skin | `#ffc9a3` | `#f29a8c` | `#ffe2cf` | visages, mains |
| paper | `#ffffff` | `#dcdcff` | `#ffffff` | HUD, yeux, os |

Sols (`GROUND`, base / alt / ombre portée) : herbe `#93e8ae` / `#8ae0a6` / `#62c894` ;
sable `#ffd98a` / `#ffd382` / `#f2b766` ; eau `#45d6ff` / `#3ccaf8` / `#2fb8ea`
(dégradé du shader : rive `#74ecec`, eau franche `#45d6ff`, fond `#3a94f2`) ;
roche `#f3bfc8` / `#ecb3be` / `#c97d9f`.

## Construire un volume

Du fond vers l'avant : `groundShadow` → forme entière en `shade` → dessus en
`base` un peu moins haut (la face avant dépasse en bas) → `highlight` en haut
à gauche → détails au trait. `shadedBlock`, `shadedPill`, `shadedCircle` et
`cushion` font les trois tons d'un coup ; `ladder`, `railing`, `flag`, `vine`,
`leaf`, `flower`, `windowPane` posent les détails.

Coordonnées en pixels monde (tuile = 32 px). Bâtiment : cadre large comme
l'emprise, plus haut qu'elle, ancre (0, 1). Personnage : 32 × 48, ancre
(0.5, 0.8). Décor et tuiles de sol : dans 32 × 32.

## Ajouter ou modifier un sprite

1. Lire `src/data/artDirection.ts` et un sprite voisin de `src/art/` (un
   bâtiment pour un bâtiment, `people.ts` pour un personnage).
2. Écrire le module dans `src/art/<id>.ts` : un objet `satisfies SpriteProto`
   — cadre et ancre en pixels monde, un SVG par morceau (`svg(W, H, …)`),
   rien que des helpers et des couleurs de `PALETTE`/`GROUND`. Les morceaux
   exigés : `down`, `up`, `side`, `foot` (personnage) ; `site`, `built`,
   `damaged` (bâtiment) ; `full`, `damaged` (ressource). Un morceau animé
   (roue, halo, arc) déclare son pivot dans `pivots`.
3. L'inscrire dans `SPRITES` (`src/data/sprites.ts`). `spriteLibrary` le
   rastérise et le range dans l'atlas tout seul.
4. `npm run art:sheet -- /tmp/planche.svg`, convertir en PNG avec
   `google-chrome --headless --screenshot=/tmp/planche.png --window-size=L,H /tmp/planche.svg`
   (L, H affichés par la commande), l'ouvrir avec `Read`, dérouler la
   check-list ci-dessous.
5. Vérifier en jeu (`npm run dev`), à la taille réelle, sur le sol.

## Check-list de relecture

Regarder le rendu (capture PNG ouverte avec `Read`), pas seulement le code :

- [ ] **Contours ?** Aucune forme pleine n'a de `stroke`. Les traits ne servent qu'aux petits détails.
- [ ] **Gris ? Noir ?** Aucun. Les ombres sont la même teinte, plus sombre, saturée. L'indigo remplace le noir et le marron.
- [ ] **Transparence ?** Aucune dans un sprite : ombres portées pleines, pas d'`opacity`.
- [ ] **Traits d'épaisseur différente ?** Un seul : `STROKE.width`. Bouts ronds.
- [ ] **Couleur en collision ?** La teinte dominante est celle de la famille (`FAMILY_TONES`) ; le vert fluo n'apparaît que sur un mutant ; ruine violette ≠ rocher.
- [ ] **Trois tons ?** Base, ombre en bas/à droite, reflet en capsule en haut à gauche, à l'intérieur de la forme.
- [ ] **Formes pures ?** Rayons de `RADIUS`, capsules, cercles. Pas de courbe à main levée.
- [ ] **Vue 3/4 et ancre ?** Dessus + face avant ; le pied tombe sur l'ancre ; l'emprise est respectée.
- [ ] **Lisible petit ?** Silhouette reconnaissable à la taille réelle sur téléphone.
- [ ] **Une vie racontée ?** Un drapeau, une fleur, une liane, une échelle — plutôt que du grain.

`auditSvg()` automatise les quatre premières cases ; `npm test` la passe sur
tous les sprites. Les six autres demandent un regard.

## Vérifier

```bash
npm run lint && npm run typecheck && npm test && npm run build
```
