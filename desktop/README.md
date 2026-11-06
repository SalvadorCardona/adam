# Adam — l'application de bureau

Le jeu dans Electron, empaqueté pour Linux x64 : un AppImage
(`Adam-<version>.AppImage`, un seul fichier exécutable) et un tar.gz de
secours (`Adam-<version>-linux-x64.tar.gz`, un dossier dont l'exécutable est
`adam`). C'est ce qu'on installe sur un Steam Deck pour jouer en mode Game —
mode d'emploi dans le [README](../README.md#sur-steam-deck-en-mode-game).

Electron plutôt que Tauri : sur Linux, Tauri passe par WebKitGTK, dont la
Gamepad API et WebGL sont peu fiables — exactement ce dont le jeu dépend.
Electron embarque le Chromium où le jeu est déjà testé.

## Commandes (depuis la racine)

| Commande | Effet |
| --- | --- |
| `npm run desktop:dev` | le jeu dans Electron, servi par Vite (rechargement à chaud) ; F12 ouvre les DevTools ; profil `~/.config/Adam-dev` |
| `npm run desktop:build` | build Vite (mode `desktop`), puis electron-builder : AppImage et tar.gz dans `desktop/release/` |
| `npm run desktop:build -- --dir` | s'arrête au dossier dépaqueté `release/linux-unpacked/` (bien plus rapide) |
| `npm run test:desktop` | Playwright `_electron` sur `release/linux-unpacked/adam` : écran titre, page sans Node, navigation bloquée, partie lancée, « Quitter », relance, partie retrouvée |
| `npm run desktop:check` | typecheck et lint de `desktop/` |

`desktop/` a ses propres dépendances (Electron et electron-builder, versions
figées dans `desktop/package-lock.json`), installées au premier build
(`npm ci --prefix desktop`) : l'installation et le build du web n'en savent
rien. Le build tourne aussi `tsc --noEmit` du jeu. Un empaquetage complet prend
quelques minutes ; le paquet fait environ 140 Mo.

## Comment c'est fait

- **`main.ts`** — le processus principal. Le build du jeu (`app/game/`) est
  servi par un protocole maison, `app://adam/adam/…`
  (`protocol.registerSchemesAsPrivileged`, `standard` et `secure`) : les URLs
  absolues `/adam/…` du build et les routes (`/adam/test`) marchent telles
  quelles, et l'origine est stable — le `localStorage`, donc la sauvegarde,
  en dépend. Le profil est fixé à `~/.config/Adam` (`ADAM_USER_DATA` le
  remplace pour les tests). Fenêtre plein écran, sans menu ; F11 bascule.
  `adam --pad-debug` ouvre le diagnostic manette (`?pad=debug`) à la place du
  jeu.
- **`preload.ts`** — n'expose que `window.adamDesktop` : `isDesktop`,
  `version`, `quit()`. Le jeu le lit dans `src/app/desktop.ts` : bouton
  « Quitter » (écran titre, pause), pas de service worker, pause et écriture
  de la partie quand la fenêtre perd le focus (menu Steam, veille), son relancé
  au retour, curseur système caché à la manette.
- **`scripts/`** — `build.mts` et `dev.mts` (lancés par Node, types effacés),
  `stage.mts` prépare `app/` (main, preload, `package.json` du paquet, icône,
  `config.json`), `afterPack.cjs` pose les fusibles d'Electron et le lanceur
  `adam` (voir plus bas).
- **`electron-builder.json`** — cibles, icône (`public/icon.png`), nom
  « Adam », éditeur « Hermez ». Le champ `author` du `package.json` de la
  racine ne change pas.

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` : la
  page n'a pas Node (`typeof require === 'undefined'`, vérifié par le test).
- Navigation bloquée hors d'`app://adam` ; `window.open` refusé ; un lien
  externe s'ouvre dans le navigateur du système, en https seulement.
- CSP plus strict que le web (qui n'en a pas) : scripts du paquet seulement
  (`'unsafe-eval'` reste permis : PixiJS v8 compile ses shaders par
  `new Function`), connexions vers soi seul — hors ligne, `webRequest`
  annule en plus toute requête qui sortirait.
- Permissions refusées par défaut ; seuls le plein écran et, dans la variante
  en ligne, le micro (vocal WebRTC). La manette n'est pas une permission.
- DevTools désactivés dans le paquet, actifs dans `desktop:dev`.
- Fusibles : ni `ELECTRON_RUN_AS_NODE`, ni `NODE_OPTIONS`, l'application lue
  dans l'asar seulement. L'inspecteur reste permis, pour le test Playwright.

**Bac à sable de Chromium.** SteamOS permet les espaces de noms utilisateur :
Chromium s'isole normalement. Ubuntu 24.04 et suivantes les restreignent
(AppArmor) et le repli setuid (`chrome-sandbox`) n'existe pas dans un AppImage
ni dans un dossier détaré : Electron s'arrêterait au lancement. L'AppRun de
l'AppImage et le lanceur `adam` du tar.gz sondent (`unshare -Ur true`) et ne
passent `--no-sandbox` que dans ce cas.

## Variante en ligne

Le paquet est **hors ligne par défaut** : construit sans `VITE_API_URL`, il ne
contacte personne. Pour un paquet qui parle au back-end (comptes, parties à
deux, vocal) :

```bash
VITE_API_URL=https://api.exemple.dev npm run desktop:build
```

Le CSP s'ouvre alors à ce seul serveur (https et wss), et le micro peut être
demandé pour le vocal. Ce paquet-là n'est pas publié par la CI.

## Publication

`.github/workflows/desktop.yml` : sur chaque PR, empaquetage et test (les deux
fichiers restent une semaine en artefacts) ; sur un tag `v*`, ils sont
attachés à la Release du tag, numérotés comme lui.

## Hors périmètre

Steam (Steamworks, succès, cloud), Windows et macOS (rien dans la
configuration ne les empêche, mais ils ne sont ni construits ni testés),
Flatpak. Une sauvegarde du navigateur ne passe pas dans l'application.
