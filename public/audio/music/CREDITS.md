# Musique du jeu — sources et licences

Chaque boucle existe en deux encodages, `.ogg` (Vorbis) et `.m4a` (AAC,
pour Safari). Le jeu les boucle sur leur longueur exacte en échantillons
(`src/audio/music.ts`), pas sur celle du fichier décodé.

| Fichier | Moment | Origine | Durée |
| --- | --- | --- | --- |
| `adam-melancolique-loop` | le jour | thème orchestral (violoncelle, harpe, cordes) choisi pour le jeu | 4 811 751 éch. à 44,1 kHz |
| `adam-night-loop` | la nuit calme, du crépuscule à l'aube | composé et synthétisé pour ce jeu | 2 116 800 éch. (48 s) |
| `adam-combat-loop` | tant que des mutants sont dehors | composé et synthétisé pour ce jeu | 2 116 800 éch. (48 s) |

## Nuit et combat — composés dans le dépôt

Les deux boucles de la nuit ne viennent d'aucune banque de sons ni d'aucun
modèle : elles sont écrites note à note et synthétisées par
`src/tools/music.ts` (nappe, kalimba, cordes piquées, batterie, écho), sans
échantillon extérieur. Elles appartiennent au projet et suivent sa licence
(MIT, voir `package.json`).

Même tempo (80 BPM), même grille (la m, fa, do, sol, la m, fa, ré m, mi),
même longueur : le combat se joue calé sur la nuit, et le fondu de l'une à
l'autre sonne comme une batterie qui entre ou sort.

Pour les refaire (le rendu est déterministe) :

```bash
npm run music:night -- /tmp/music   # écrit night.wav et combat.wav
# puis les quatre commandes ffmpeg qu'il affiche :
#   .ogg : -c:a libvorbis -q:a 2   (~0,26 et ~0,52 Mo)
#   .m4a : -c:a aac -b:a 96k       (~0,6 Mo)
```

Elles ne sont téléchargées qu'à la première tombée de la nuit, jamais au
démarrage.
