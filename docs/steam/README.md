# Images de la bibliothèque Steam

À poser à la main dans Steam : page du jeu → *Propriétés* (ou roue dentée →
*Gérer*) → *Personnaliser*.

| Fichier | Taille | Emplacement dans Steam |
| --- | --- | --- |
| `capsule.png` | 600 × 900 | capsule (portrait, la grille de la bibliothèque) |
| `banner.png` | 920 × 430 | bannière (capsule paysage, « Récemment joué ») |
| `hero.png` | 1920 × 620 | image héros, en tête de la page du jeu |
| `logo.png` | 1280 × 600, transparent | logo posé sur l'image héros |
| `icon.png` | 256 × 256 | icône du raccourci |

Toutes sont tirées du key art de l'écran titre et du logo en capsules
(`src/art/titleScene.ts`, `src/art/brand.ts`) : aucun dessin de plus. Pour les
refaire : `npm run art:steam -- /tmp/steam`, puis les commandes Chrome
qu'il affiche.

Pose en ligne de commande, sous les noms d'appid de Steam :
`desktop/steam/install-art.sh <appid>` (voir le README, « Sur Steam Deck »).
