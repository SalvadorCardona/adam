# Outils

Des scripts de Node, lancés par `npm run …`, qui lisent le jeu sans navigateur.
Node exécute le TypeScript tel quel (il efface les types) : rien à compiler.

| Commande | Script | Ce qu'il fait |
| --- | --- | --- |
| `npm run art:sheet -- planche.svg` | `artSheet.ts` | la planche de relecture des visuels |
| `npm run art:brand` | `brand.ts` | l'icône, le favicon et la bannière |
| `npm run music:night -- <dossier>` | `music.ts` | les boucles de la nuit et du combat |
| `npm run playtest -- --seeds 50 --minutes 60` | `playtest.ts` | le joueur simulé, en série |

## Le joueur simulé

Un bot qui joue des parties entières, sans rendu, comme un joueur qui suit les
objectifs, et mesure ce qui s'y passe. C'est la boussole de l'équilibrage et de
l'onboarding : on règle sur des chiffres, pas à l'intuition.

```bash
npm run playtest -- --seeds 50 --minutes 60
npm run playtest -- --seeds 20 --minutes 45 --strategy both --json rapports.json
```

| Option | Par défaut | |
| --- | --- | --- |
| `--seeds N` | 10 | nombre de parties |
| `--from S` | 1 | première graine ; les suivantes à la suite |
| `--random` | | une première graine tirée au hasard |
| `--minutes M` | 60 | minutes de jeu par partie (20 ticks par seconde) |
| `--strategy` | `base` | `base`, `afk` ou `both` |
| `--json fichier` | | écrit le rapport de chaque partie |
| `--jobs J` | les cœurs | parties menées de front, une par fil |

Une partie d'une heure prend quelques secondes ; les parties tournent en
parallèle, un fil par cœur (`playtestPool.ts`, `playtestWorker.ts`).

### Les stratégies

Le bot (`src/sim/playtest.ts`) ne touche jamais l'état : il pousse les
commandes que pousserait l'UI — `setMoveAxis`, `placeBuilding`,
`transferToSite`, `transferToLab`, `startResearch`, `depositToTown`,
`transferItems`, `repairBuilding`.

- **`base`** suit les objectifs ouverts du chapitre, dans l'ordre du panneau :
  - il récolte ce que réclame le chantier ou le labo (arbres et rochers, le
    plus proche d'abord), en comptant ce que la ville et les porteurs
    apportent déjà ;
  - il pose le bâtiment demandé au plus près de la mairie, une allée libre
    autour ; le puits, à la première rive de la prairie, quitte à défricher ;
  - si le bâtiment n'est pas au menu, il pose le labo et lance la recherche
    qui l'ouvre (son prérequis d'abord) ; une recherche qui demande du butin
    d'ennemis attend qu'on en ait ;
  - au crépuscule et la nuit, il reste près de la mairie, y vide son sac et
    répare ce qui est abîmé ; le jour, il ramasse le butin tombé près d'elle ;
  - sans rien à faire, il fait des réserves de bois et de pierre pour la ville.
- **`afk`** bâtit la mairie, puis ne fait plus rien : ce que la colonie tient
  seule.

Il marche par un chemin en largeur sur la grille (arbres et zones des bases
évités d'abord), glisse autour des troncs, et renonce à un but qu'il n'atteint
pas.

### Le rapport

Chaque partie rend un `PlaytestReport` (le fichier `--json` en est la liste) :

- `milestones` : la mairie, la fin de chaque chapitre (`index` 0 pour le
  premier), l'arrivée d'Ève, la première naissance — chacun en secondes de
  jeu (`gameSeconds`) et en millisecondes réelles (`wallMs`) ;
- `nights` : le crépuscule de chaque nuit, en secondes de jeu ;
- `deaths` : les morts par cause (`hunger`, `thirst`) et par nuit, et chacune
  dans `list` — `wellHadWater` dit une mort de soif alors qu'un puits avait de
  l'eau ;
- `waves` : par nuit, l'effectif de la vague et les PV de la mairie à l'aube ;
- `activity` et `idleSeconds` : le temps passé à récolter, livrer, poser,
  garder la mairie… et sans rien qu'un objectif demande ;
- `fallNight` : la nuit où la mairie est tombée, ou `null` ;
- `playerKnockouts`, `final` : Adam à terre, et l'état de la colonie à la fin.

Le tableau du terminal donne la médiane, le 10e et le 90e centile de chaque
mesure sur les parties où elle existe, et combien en ont une (`n`).

### Le test court

`src/sim/playtest.test.ts` joue cinq graines jusqu'au crépuscule de la nuit 5
et vérifie des invariants de la stratégie de base : la mairie bâtie, pas de
mort de soif avec un puits plein, le chapitre 2 fini avant la nuit 4, la
mairie debout à la nuit 5. Il tourne dans `npm test`, en une dizaine de
secondes.
