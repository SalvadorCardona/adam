# Musique du jeu — sources et licences

Chaque boucle existe en deux encodages, `.ogg` (Vorbis) et `.m4a` (AAC,
pour Safari). Le jeu les boucle sur leur longueur exacte en échantillons
(`src/audio/music.ts`), pas sur celle du fichier décodé.

| Fichier | Moment | Origine | Durée |
| --- | --- | --- | --- |
| `adam-melancolique-loop` | le jour | thème orchestral (violoncelle, harpe, cordes) choisi pour le jeu | 4 811 751 éch. à 44,1 kHz |
| `adam-night-loop` | la nuit calme, du crépuscule à l'aube | composé et synthétisé pour ce jeu | 2 565 818 éch. (16 mesures à 66 BPM, 58,2 s) |
| `adam-combat-loop` | tant que des mutants sont dehors | composé et synthétisé pour ce jeu | 2 565 818 éch. (16 mesures à 66 BPM, 58,2 s) |

## Nuit et combat — composés dans le dépôt

Les deux boucles de la nuit ne viennent d'aucune banque de sons ni d'aucun
modèle : elles sont écrites note à note et synthétisées par
`src/tools/music.ts`, sans échantillon extérieur. Elles appartiennent au
projet et suivent sa licence (MIT, voir `package.json`).

Elles prolongent le thème du jour, analysé pour l'occasion : fa♯ majeur
(sa relative, ré♯ / mi♭ mineur, colore le morceau), ~66 BPM (la boucle fait
30 mesures pile à ce tempo), violoncelle, harpe et cordes. Nuit et combat
sont donc en mi♭ mineur, à 66 BPM, et n'emploient que des timbres
d'orchestre :

- nuit : cordes en sourdine, contrebasses tenues, violoncelle seul, harpe
  en arpèges (cordes pincées Karplus-Strong), une timbale sourde ;
- combat : violoncelles et contrebasses en ostinato, cordes en trémolo,
  timbales (roulement en fin de phrase), grosse caisse lointaine, cuivres
  graves discrets, et la même harpe que la nuit, note pour note.

Même tempo (66 BPM), même grille (mi♭ m, si, fa♯, do♯, mi♭ m, si, sol♯ m,
la♯ — le i, VI, III, VII de l'ancienne grille en la mineur, transposé),
même longueur : le combat se joue calé sur la nuit, et le fondu de l'une à
l'autre sonne comme l'orchestre qui se lève ou se rassoit. Le rendu est en
anneau (les queues de notes et la réverbération repartent au début) : le
raccord de boucle ne claque pas.

Pour les refaire (le rendu est déterministe) :

```bash
npm run music:night -- /tmp/music   # écrit night.wav, combat.wav et les variantes
# puis les commandes ffmpeg qu'il affiche :
#   .ogg : -c:a libvorbis -q:a 2   (~0,56 Mo)
#   .m4a : -c:a aac -b:a 96k       (~0,72 Mo)
```

Niveaux (`src/audio/music.ts`) : jour −11,3 LUFS × 0,5, nuit −17,3 LUFS × 1,
combat −15,6 LUFS × 0,85 — environ −17 LUFS chacun une fois dans le jeu.

### Variantes

L'outil rend trois variantes de la paire nuit + combat. La première
(« ostinato » : doubles croches, timbales aux temps 1 et 3, violoncelle
tout du long la nuit) est celle du jeu. Les deux autres sont dans
`docs/music-candidates/`, que le jeu ne charge pas — voir son `README.md`.

### Pourquoi pas Lyria

Le ticket demandait de les générer avec Google Lyria 3 Pro via OpenRouter
(comme les jingles de `public/audio/sfx/`). Aucune clé OpenRouter n'était
disponible pour l'outil le 16/10/2026 : c'est le plan B qui a été suivi
(synthèse déterministe, timbres orchestraux). Rien ici n'est donc soumis
aux conditions de Lyria.

Elles ne sont téléchargées qu'à la première tombée de la nuit, jamais au
démarrage.
