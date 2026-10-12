# Sons du jeu — sources et licences

Chaque son existe en deux encodages, `.ogg` (Vorbis) et `.m4a` (AAC, pour
Safari). Les bruitages ont été coupés (< 1 s pour les impacts), passés en
mono 44,1 kHz, normalisés vers −16 LUFS avec une crête vraie ≤ −1,5 dBTP
(limiteur au besoin). Le gain de chaque son dans le jeu est réglé dans
`src/audio/samples.ts`.

## Jingles — générés avec Google Lyria 3

Musique générée avec **Google Lyria 3** (via OpenRouter) pour ce jeu :
instruments acoustiques (marimba, kalimba, glockenspiel, ukulélé, petits
cuivres, percussions en bois), coupés sur la première phrase avec fondu,
normalisés à −16 LUFS. `.m4a` : `ffmpeg -i x.ogg -c:a aac -b:a 128k x.m4a`.

| Fichier | Moment |
| --- | --- |
| `build` | chantier achevé |
| `upgrade` | bâtiment amélioré |
| `objective` | objectif réussi |
| `eureka` | recherche aboutie |
| `baby` | naissance |
| `dawn` | l'aube |
| `victory` | vague repoussée |
| `colony` | victoire finale (le Signal) |
| `horn` | une vague s'annonce |
| `alarm` | la vague arrive |
| `defeat` | la mairie est tombée |
| `tap` | tap sur un bouton de l'interface — un sinus de 900 Hz, 50 ms, généré avec ffmpeg (`sine`, fondus), sans source externe |

## Bruitages — enregistrements CC0

Tous sous **Creative Commons Zero (CC0 1.0)** —
<https://creativecommons.org/publicdomain/zero/1.0/>. Les packs Kenney
viennent de <https://kenney.nl> (crédit facultatif, donné quand même).

| Fichier | Source | Auteur | Retouche |
| --- | --- | --- | --- |
| `chop_1` | Kenney *RPG Audio* — `chop.ogg` | Kenney | — |
| `chop_2` | Kenney *Impact Sounds* — `impactWood_medium_001.ogg` | Kenney | — |
| `chop_3` | Kenney *Impact Sounds* — `impactWood_medium_003.ogg` | Kenney | — |
| `rock_1` | Kenney *Impact Sounds* — `impactMining_000.ogg` | Kenney | coupé à 0,5 s |
| `rock_2` | Kenney *Impact Sounds* — `impactMining_001.ogg` | Kenney | coupé à 0,5 s |
| `rock_3` | Kenney *Impact Sounds* — `impactMining_002.ogg` | Kenney | coupé à 0,5 s |
| `hit_1` | Kenney *Impact Sounds* — `impactSoft_medium_000.ogg` | Kenney | — |
| `hit_2` | Kenney *Impact Sounds* — `impactSoft_medium_001.ogg` | Kenney | — |
| `hit_3` | Kenney *Impact Sounds* — `impactSoft_medium_002.ogg` | Kenney | — |
| `thud` | Kenney *Impact Sounds* — `impactWood_heavy_000.ogg` | Kenney | ralenti × 0,85 |
| `brute` | Kenney *Impact Sounds* — `impactPunch_heavy_000.ogg` | Kenney | ralenti × 0,7 |
| `repair` | Kenney *Impact Sounds* — `impactPlank_medium_000.ogg` | Kenney | coupé à 0,5 s |
| `deny` | Kenney *Impact Sounds* — `impactWood_light_000.ogg` + `impactWood_light_001.ogg` | Kenney | deux coups, le second plus grave (× 0,84) |
| `deliver` | Kenney *RPG Audio* — `bookPlace1.ogg` | Kenney | — |
| `open` | Kenney *RPG Audio* — `bookOpen.ogg` | Kenney | — |
| `arrow_1` | [Arrow Loose.wav](https://freesound.org/people/saturdaysoundguy/sounds/394185/) | saturdaysoundguy (Freesound) | — |
| `arrow_2` | [Arrow Loose and Flyby](https://freesound.org/people/saturdaysoundguy/sounds/394180/) | saturdaysoundguy (Freesound) | coupé à 0,55 s |
| `arrow_3` | [Basic Melee Swing / Miss / Whoosh](https://freesound.org/people/SypherZent/sounds/420668/) | SypherZent (Freesound) | — |
| `die` | [Zombie Death 1.wav](https://freesound.org/people/tonsil5/sounds/555412/) | tonsil5 (Freesound) | accéléré × 1,12 (plus comique) |
| `dizzy` | [Boink_v3.wav](https://freesound.org/people/simon.rue/sounds/61847/) | simon.rue (Freesound) | — |
| `collapse` | [Wooden Structure Breaking](https://freesound.org/people/modusmogulus/sounds/794523/) | modusmogulus (Freesound) | — |
| `countdown` | [Wood block hit](https://freesound.org/people/thomasjaunism/sounds/218460/) | thomasjaunism (Freesound) | ralenti × 0,75 (plus grave) |
| `bite` | [Bite (Cartoon Style)](https://freesound.org/people/Jofae/sounds/353067/) | Jofae (Freesound) | — |
| `faint` | [FX swanee whistle down.wav](https://freesound.org/people/v0idation/sounds/497093/) | v0idation (Freesound) | — |
| `gloop` | [Bubbles.wav](https://freesound.org/people/erkanozan/sounds/51745/) | erkanozan (Freesound) | coupé à 0,7 s |
| `pickup` | [Item or Material Pickup Pop 1 of 3](https://freesound.org/people/el_boss/sounds/665183/) | el_boss (Freesound) | — |

## Voix des habitants — synthèse vocale Piper

« Hé ho ! » (un homme qu'on tape) et « Hé ! » (une femme), dits par des voix
neuronales [Piper](https://github.com/rhasspy/piper) (`rhasspy/piper-voices`),
générées hors ligne pour ce jeu. Trois prises par sexe (vitesse et bruit du
modèle variés, choisies à l'écoute de la transcription et de la hauteur),
blancs coupés, hauteur retouchée formants préservés (`rubberband`),
crête à −1,5 dBTP, mono 44,1 kHz ; `.m4a` : `ffmpeg -i x.ogg -c:a aac -b:a 96k x.m4a`.

| Fichier | Voix | Licence du jeu de données | Retouche |
| --- | --- | --- | --- |
| `heho_1` | `fr_FR-gilles-low` — « Hé, ho ! » | [CC0](https://www.kaggle.com/datasets/bryanpark/french-single-speaker-speech-dataset) | × 0,97 (≈ 100 Hz) |
| `heho_2` | `fr_FR-gilles-low` — « Hé, ho ! » | CC0 | — |
| `heho_3` | `fr_FR-gilles-low` — « Hé, ho ! » | CC0 | × 0,94 |
| `he_1` | `fr_FR-siwis-medium` — « Hé ! » | [CC BY 4.0](https://datashare.is.ed.ac.uk/handle/10283/2353) — SIWIS French Speech Synthesis Database, Université d'Édimbourg | × 1,19 (≈ 200 Hz) |
| `he_2` | `fr_FR-siwis-medium` — « Hé ! » | CC BY 4.0 — SIWIS | × 1,22 |
| `he_3` | `fr_FR-siwis-medium` — « Héé ! » | CC BY 4.0 — SIWIS | × 1,16 |
