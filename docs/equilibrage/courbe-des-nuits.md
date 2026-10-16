# Courbe des nuits — rapport du joueur simulé

`npm run playtest -- --seeds 30 --minutes 60 --strategy both` (graines 1 à 30).

Changements : plafond commun `WAVE_STRENGTH.earlyCaps` prolongé et adouci
(2, 3, 4, 4, 5, 6, 6, 7, 8…), grâce de la mairie bornée aux trois premières
nuits (`graceNights`), gros mutant repoussé de la nuit 5 à la nuit 6, objectif
« Bâtir une tour de guet » au chapitre 2, Ève prévient au crépuscule de la nuit 4.

Lecture : la stratégie `base` tient toujours la nuit 6 (30/30 ; la mairie ne
tombe qu'à la Reine, nuit 10). Le joueur AFK tenait 4 nuits (mairie tombée
médiane nuit 5) ; il en tient désormais 6,5 (mairie tombée médiane nuit 7,5,
p10 nuit 5,9).

## Avant

## Stratégie « base » — 30 parties de 60 min

| Mesure                               | unité | médiane |  p10 |  p90 |     n |
| ------------------------------------ | ----- | ------: | ---: | ---: | ----: |
| Mairie bâtie                         | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Chapitre 1 fini (Le premier toit)    | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Chapitre 2 fini (Les fondations)     | min   |     2.9 |  2.5 |  5.6 | 30/30 |
| Chapitre 3 fini (Passer la nuit)     | min   |    15.4 | 15.3 | 20.5 | 30/30 |
| Chapitre 4 fini (Les demandes d’Ève) | min   |    16.6 | 16.4 | 21.7 | 30/30 |
| Arrivée d’Ève                        | min   |    15.5 | 15.4 | 15.5 | 30/30 |
| Première naissance                   | min   |    24.9 | 19.5 | 49.2 | 17/30 |
| Morts (toutes causes)                |       |     2.5 |    0 |  8.2 | 30/30 |
| Morts de faim                        |       |       0 |    0 |  6.1 | 30/30 |
| Morts de soif                        |       |       0 |    0 |  8.2 | 30/30 |
| … de soif, un puits plein            |       |       0 |    0 |  1.1 | 30/30 |
| Première mort, nuit                  |       |       8 |    7 |   11 | 21/30 |
| Adam à terre                         | fois  |       0 |    0 |    0 | 30/30 |
| Nuits tenues                         |       |      11 |    9 |   11 | 30/30 |
| Mairie tombée, nuit                  |       |      10 |  9.6 |   11 |  7/30 |
| Nuit 1 : effectif de la vague        |       |       2 |    0 |    2 | 30/30 |
| Nuit 1 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 2 : effectif de la vague        |       |       3 |    3 |    3 | 30/30 |
| Nuit 2 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 3 : effectif de la vague        |       |       4 |    3 |    4 | 30/30 |
| Nuit 3 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 4 : effectif de la vague        |       |       6 |    3 |    9 | 30/30 |
| Nuit 4 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 5 : effectif de la vague        |       |       9 |    6 |   10 | 30/30 |
| Nuit 5 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 6 : effectif de la vague        |       |       8 |  6.9 |   10 | 30/30 |
| Nuit 6 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 7 : effectif de la vague        |       |      10 |    7 | 12.1 | 30/30 |
| Nuit 7 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 8 : effectif de la vague        |       |      12 |   10 |   18 | 30/30 |
| Nuit 8 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 9 : effectif de la vague        |       |      14 | 10.9 |   17 | 30/30 |
| Nuit 9 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 10 : effectif de la vague       |       |      15 | 11.8 |   19 | 29/30 |
| Nuit 10 : PV de la mairie à l’aube   | %     |     100 |    0 |  100 | 29/30 |
| Nuit 11 : effectif de la vague       |       |      16 | 12.4 | 21.6 | 25/30 |
| Nuit 11 : PV de la mairie à l’aube   | %     |     100 |  100 |  100 | 25/30 |
| Sans rien à faire                    | min   |    31.3 | 25.4 | 32.7 | 30/30 |
| Ouvriers à la fin                    |       |       8 |  1.8 |   10 | 30/30 |
| Bâtiments à la fin                   |       |      16 | 13.9 |   19 | 30/30 |
| Temps réel par partie                | s     |    23.2 | 12.5 | 28.6 | 30/30 |

## Stratégie « afk » — 30 parties de 60 min

| Mesure                            | unité | médiane |  p10 |  p90 |     n |
| --------------------------------- | ----- | ------: | ---: | ---: | ----: |
| Mairie bâtie                      | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Chapitre 1 fini (Le premier toit) | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Arrivée d’Ève                     | min   |    15.5 | 15.4 | 15.5 | 30/30 |
| Première naissance                | min   |       — |    — |    — |  0/30 |
| Morts (toutes causes)             |       |      10 |    8 |   10 | 30/30 |
| Morts de faim                     |       |       0 |    0 |    0 | 30/30 |
| Morts de soif                     |       |      10 |    8 |   10 | 30/30 |
| … de soif, un puits plein         |       |       0 |    0 |    0 | 30/30 |
| Première mort, nuit               |       |       4 |    4 |    4 | 28/30 |
| Adam à terre                      | fois  |       0 |    0 |    0 | 30/30 |
| Nuits tenues                      |       |       4 |    3 |  5.1 | 30/30 |
| Mairie tombée, nuit               |       |       5 |    4 |  6.1 | 30/30 |
| Nuit 1 : effectif de la vague     |       |       2 |    0 |    2 | 30/30 |
| Nuit 1 : PV de la mairie à l’aube | %     |    96.7 | 86.7 |  100 | 30/30 |
| Nuit 2 : effectif de la vague     |       |       3 |    3 |    3 | 30/30 |
| Nuit 2 : PV de la mairie à l’aube | %     |      80 | 53.5 | 93.7 | 30/30 |
| Nuit 3 : effectif de la vague     |       |       4 |    3 |    4 | 30/30 |
| Nuit 3 : PV de la mairie à l’aube | %     |      60 |   25 | 83.3 | 30/30 |
| Nuit 4 : effectif de la vague     |       |       6 |  2.9 |  8.1 | 30/30 |
| Nuit 4 : PV de la mairie à l’aube | %     |     100 |    0 |  100 | 30/30 |
| Nuit 5 : effectif de la vague     |       |       8 |    6 |  9.9 | 22/30 |
| Nuit 5 : PV de la mairie à l’aube | %     |       0 |    0 |  100 | 22/30 |
| Nuit 6 : effectif de la vague     |       |       7 |    6 |  8.5 |  6/30 |
| Nuit 6 : PV de la mairie à l’aube | %     |      50 |    0 |  100 |  6/30 |
| Nuit 7 : effectif de la vague     |       |       7 |  6.2 |  9.4 |  3/30 |
| Nuit 7 : PV de la mairie à l’aube | %     |       0 |    0 |   80 |  3/30 |
| Nuit 8 : effectif de la vague     |       |      10 |   10 |   10 |  1/30 |
| Nuit 8 : PV de la mairie à l’aube | %     |    91.7 | 91.7 | 91.7 |  1/30 |
| Nuit 9 : effectif de la vague     |       |      12 |   12 |   12 |  1/30 |
| Nuit 9 : PV de la mairie à l’aube | %     |       0 |    0 |    0 |  1/30 |
| Sans rien à faire                 | min   |    24.2 | 19.1 | 29.8 | 30/30 |
| Ouvriers à la fin                 |       |       0 |    0 |    2 | 30/30 |
| Bâtiments à la fin                |       |       0 |    0 |    0 | 30/30 |
| Temps réel par partie             | s     |     4.2 |  2.0 |  5.1 | 30/30 |

Temps réel : 47.2 s

real	0m47,524s
user	11m26,844s
sys	0m3,223s

## Après

## Stratégie « base » — 30 parties de 60 min

| Mesure                               | unité | médiane |  p10 |  p90 |     n |
| ------------------------------------ | ----- | ------: | ---: | ---: | ----: |
| Mairie bâtie                         | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Chapitre 1 fini (Le premier toit)    | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Chapitre 2 fini (Les fondations)     | min   |     3.4 |  3.0 |  5.7 | 30/30 |
| Chapitre 3 fini (Passer la nuit)     | min   |    16.6 | 15.3 | 20.5 | 30/30 |
| Chapitre 4 fini (Les demandes d’Ève) | min   |    17.8 | 16.4 | 21.6 | 30/30 |
| Arrivée d’Ève                        | min   |    15.5 | 15.4 | 15.5 | 30/30 |
| Première naissance                   | min   |    20.9 | 19.6 | 33.0 | 11/30 |
| Morts (toutes causes)                |       |       6 |    0 |  9.1 | 30/30 |
| Morts de faim                        |       |       0 |    0 |    6 | 30/30 |
| Morts de soif                        |       |       0 |    0 |  9.1 | 30/30 |
| … de soif, un puits plein            |       |       0 |    0 |    0 | 30/30 |
| Première mort, nuit                  |       |       8 |    7 |   10 | 21/30 |
| Adam à terre                         | fois  |       0 |    0 |    0 | 30/30 |
| Nuits tenues                         |       |      11 | 10.8 |   11 | 30/30 |
| Mairie tombée, nuit                  |       |      10 |   10 |   10 |  3/30 |
| Nuit 1 : effectif de la vague        |       |       2 |    0 |    2 | 30/30 |
| Nuit 1 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 2 : effectif de la vague        |       |       3 |    3 |    3 | 30/30 |
| Nuit 2 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 3 : effectif de la vague        |       |       4 |    3 |    4 | 30/30 |
| Nuit 3 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 4 : effectif de la vague        |       |       4 |    3 |    5 | 30/30 |
| Nuit 4 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 5 : effectif de la vague        |       |       5 |    5 |    6 | 30/30 |
| Nuit 5 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 6 : effectif de la vague        |       |       7 |    6 |    8 | 30/30 |
| Nuit 6 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 7 : effectif de la vague        |       |       6 |    6 |    7 | 30/30 |
| Nuit 7 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 8 : effectif de la vague        |       |       8 |    8 |    9 | 30/30 |
| Nuit 8 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 9 : effectif de la vague        |       |       8 |    8 |    9 | 30/30 |
| Nuit 9 : PV de la mairie à l’aube    | %     |     100 |  100 |  100 | 30/30 |
| Nuit 10 : effectif de la vague       |       |      10 |   10 |   11 | 30/30 |
| Nuit 10 : PV de la mairie à l’aube   | %     |     100 | 90.0 |  100 | 30/30 |
| Nuit 11 : effectif de la vague       |       |      11 |   11 |   12 | 27/30 |
| Nuit 11 : PV de la mairie à l’aube   | %     |     100 |  100 |  100 | 27/30 |
| Sans rien à faire                    | min   |    31.5 | 27.0 | 33.4 | 30/30 |
| Ouvriers à la fin                    |       |       5 |  0.9 |   10 | 30/30 |
| Bâtiments à la fin                   |       |      16 |   14 | 18.1 | 30/30 |
| Temps réel par partie                | s     |    23.3 | 14.9 | 26.2 | 30/30 |

## Stratégie « afk » — 30 parties de 60 min

| Mesure                             | unité | médiane |  p10 |  p90 |     n |
| ---------------------------------- | ----- | ------: | ---: | ---: | ----: |
| Mairie bâtie                       | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Chapitre 1 fini (Le premier toit)  | min   |     0.3 |  0.2 |  0.3 | 30/30 |
| Arrivée d’Ève                      | min   |    15.5 | 15.4 | 15.5 | 30/30 |
| Première naissance                 | min   |       — |    — |    — |  0/30 |
| Morts (toutes causes)              |       |      10 |   10 |   10 | 30/30 |
| Morts de faim                      |       |       0 |    0 |    0 | 30/30 |
| Morts de soif                      |       |      10 |   10 |   10 | 30/30 |
| … de soif, un puits plein          |       |       0 |    0 |    0 | 30/30 |
| Première mort, nuit                |       |       4 |    4 |    4 | 30/30 |
| Adam à terre                       | fois  |       0 |    0 |    0 | 30/30 |
| Nuits tenues                       |       |     6.5 |  4.9 |    9 | 30/30 |
| Mairie tombée, nuit                |       |     7.5 |  5.9 |   10 | 30/30 |
| Nuit 1 : effectif de la vague      |       |       2 |    0 |    2 | 30/30 |
| Nuit 1 : PV de la mairie à l’aube  | %     |    96.7 | 86.7 |  100 | 30/30 |
| Nuit 2 : effectif de la vague      |       |       3 |    3 |    3 | 30/30 |
| Nuit 2 : PV de la mairie à l’aube  | %     |      80 | 53.5 | 93.7 | 30/30 |
| Nuit 3 : effectif de la vague      |       |       4 |    3 |    4 | 30/30 |
| Nuit 3 : PV de la mairie à l’aube  | %     |      60 |   25 | 83.3 | 30/30 |
| Nuit 4 : effectif de la vague      |       |       4 |  2.9 |    4 | 30/30 |
| Nuit 4 : PV de la mairie à l’aube  | %     |     100 |  100 |  100 | 30/30 |
| Nuit 5 : effectif de la vague      |       |       5 |    4 |    5 | 29/30 |
| Nuit 5 : PV de la mairie à l’aube  | %     |     100 |  100 |  100 | 29/30 |
| Nuit 6 : effectif de la vague      |       |       7 |    6 |    7 | 27/30 |
| Nuit 6 : PV de la mairie à l’aube  | %     |     100 |    0 |  100 | 27/30 |
| Nuit 7 : effectif de la vague      |       |       6 |    6 |    6 | 17/30 |
| Nuit 7 : PV de la mairie à l’aube  | %     |     100 | 57.5 |  100 | 17/30 |
| Nuit 8 : effectif de la vague      |       |       8 |    8 |    8 | 15/30 |
| Nuit 8 : PV de la mairie à l’aube  | %     |       0 |    0 |  100 | 15/30 |
| Nuit 9 : effectif de la vague      |       |       8 |    8 |    8 |  7/30 |
| Nuit 9 : PV de la mairie à l’aube  | %     |     100 |   60 |  100 |  7/30 |
| Nuit 10 : effectif de la vague     |       |      10 |   10 |   10 |  6/30 |
| Nuit 10 : PV de la mairie à l’aube | %     |       0 |    0 |    0 |  6/30 |
| Sans rien à faire                  | min   |    36.9 | 28.7 | 49.6 | 30/30 |
| Ouvriers à la fin                  |       |       0 |    0 |    0 | 30/30 |
| Bâtiments à la fin                 |       |       0 |    0 |    0 | 30/30 |
| Temps réel par partie              | s     |     5.3 |  3.5 |  7.9 | 30/30 |

Temps réel : 49.7 s
