# Écran titre vivant — mesures avant / après la couche Pixi

Protocole : build de production (`vite build` + `vite preview`), Chrome 141
headless sur le GPU réel (Intel Iris Xe, `--use-angle=gl`), 390 × 844 à
DPR 3, écran titre après l'entrée cinématique, un doigt qui glisse en continu
pendant 6 s (`Input.dispatchTouchEvent` à ~60 Hz), CPU bridé par
`Emulation.setCPUThrottlingRate`. Images par seconde lues sur une boucle
`requestAnimationFrame` ; temps du fil principal par `Performance.getMetrics`.

| CPU | Avant (DOM + CSS) | Après (Pixi) |
| --- | --- | --- |
| ×1 | 59,8 i/s — styles 0,72 ms/image | 59,8 i/s — styles 0,23 ms/image |
| ×4 | 50,9 i/s — styles 2,62 ms, tâches 17,9 ms/image | 58,4 i/s — styles 0,85 ms, tâches 14,0 ms/image |
| ×6 | 28,1 i/s (p95 83 ms) — styles 3,69 ms, tâches 34,0 ms/image | 57,9 i/s (p95 16,8 ms) — styles 1,23 ms, tâches 11,9 ms/image |
| ×8 | 19,8 i/s | 23,7 i/s |

Avant : 60 animations CSS et 122 nœuds ; même animations annulées, la
parallaxe de onze plans `will-change` tenait ~36 i/s à ×6 (calques à
composer, `Layerize`, `Commit`). Après : 4 animations dans la page (logo,
« Jouer »), aucun nœud de scène, un canvas.

Traces Chrome (onglet Performance, « Load profile ») à CPU ×4, doigt qui
glisse : `trace-avant-cpu4.json.gz`, `trace-apres-cpu4.json.gz`. Fil principal
sur la fenêtre : 5 981 ms de tâches avant, 3 474 ms après ; `UpdateLayoutTree`
726 → 323 ms, `Layerize` 374 → 0 ms, `Commit` 360 → 217 ms.

Captures de la scène peinte par Pixi : `pixi-telephone.png`,
`pixi-ordinateur.png` (à comparer à `../scene-vivante-*.png`).

Reste à faire : la même mesure sur un vrai Android moyen et un iPhone
(`npm run dev -- --host`, compteur de performances des Réglages ou onglet
Performance à distance).
