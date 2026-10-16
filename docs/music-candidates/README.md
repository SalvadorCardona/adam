# Musique de nuit — variantes non retenues

Le jeu ne charge rien d'ici. Ce sont les deux autres variantes de la paire
nuit + combat rendue par `npm run music:night` (`VARIANTS` de
`src/tools/music.ts`), pour les écouter et, au besoin, en préférer une.
Même tonalité (mi♭ mineur), même tempo (66 BPM), même grille et même
longueur (2 565 818 échantillons) que celle du jeu : nuit et combat d'une
même variante vont ensemble.

| Variante | Nuit | Combat | Volume (nuit / combat) |
| --- | --- | --- | --- |
| 1 · ostinato (dans le jeu) | violoncelle tout du long, harpe assez dense | doubles croches, timbales aux temps 1 et 3 | −17,3 / −15,6 LUFS |
| 2 · galop | le violoncelle n'entre qu'à mi-boucle, harpe plus dense | galop (croche, deux doubles), timbales à chaque temps, cuivres plus présents | −19,1 / −14,8 LUFS |
| 3 · sombre | violoncelle une octave plus bas, harpe clairsemée | croches une octave plus bas, timbales rares, cuivres en retrait | −19,7 / −18,5 LUFS |

Pour en mettre une dans le jeu : copier ses quatre fichiers sous
`public/audio/music/` en retirant le suffixe (`-2-galop`…), puis régler
`level` de la nuit et du combat dans `src/audio/music.ts` pour qu'ils
tombent vers −17 LUFS (niveau = 10^((−17 − LUFS) / 20)).
