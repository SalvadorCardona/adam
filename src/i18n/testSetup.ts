/** Pose le dictionnaire anglais avant chaque fichier de test : dans le jeu, `loadLocale` le charge à la demande. */

import { EN } from './en/index.ts';
import { registerMessages } from './locale.ts';

registerMessages('en', EN);
