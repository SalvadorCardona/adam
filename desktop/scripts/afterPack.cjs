/*
 * Après l'empaquetage, avant l'AppImage et le tar.gz : l'exécutable `adam`
 * devient un petit lanceur, et le vrai binaire d'Electron `adam.bin`.
 *
 * Chromium isole ses processus par les espaces de noms utilisateur. SteamOS
 * les permet ; Ubuntu 24.04 et suivantes les restreignent par AppArmor, et le
 * repli (`chrome-sandbox` setuid root) n'existe pas dans un dossier détaré :
 * Electron s'arrêterait au lancement. Le lanceur sonde (`unshare -Ur true`,
 * comme l'AppRun de l'AppImage) et ne passe `--no-sandbox` que si le bac à
 * sable ne peut pas démarrer — le Steam Deck garde le sien.
 *
 * Avant de le renommer, les fusibles d'Electron sont posés sur le binaire
 * (ici plutôt que par `electronFuses`, qu'electron-builder appliquerait après
 * ce hook, au lanceur) : pas de mode Node (`ELECTRON_RUN_AS_NODE`), pas de
 * `NODE_OPTIONS`, l'application lue dans l'asar seulement. L'inspecteur reste
 * permis : le test de bout en bout (`e2e/desktop.spec.mts`) s'y branche.
 */
const { chmodSync, renameSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const LAUNCHER = `#!/bin/sh
# Adam — lanceur. Le binaire d'Electron est adam.bin, à côté.
HERE="$(dirname "$(readlink -f "$0")")"
for arg in "$@"; do
  if [ "$arg" = "--no-sandbox" ]; then exec "$HERE/adam.bin" "$@"; fi
done
if [ ! -u "$HERE/chrome-sandbox" ] && ! unshare -Ur true 2>/dev/null; then
  exec "$HERE/adam.bin" --no-sandbox "$@"
fi
exec "$HERE/adam.bin" "$@"
`;

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  const name = context.packager.executableName;
  const binary = join(context.appOutDir, name);

  const packager = context.packager;

  await packager.addElectronFuses(
    context,
    await packager.generateFuseConfig({
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      grantFileProtocolExtraPrivileges: false,
      onlyLoadAppFromAsar: true,
      enableCookieEncryption: true,
    }),
  );

  renameSync(binary, `${binary}.bin`);
  writeFileSync(binary, LAUNCHER);
  chmodSync(binary, 0o755);
};
