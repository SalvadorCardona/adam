#!/bin/sh
# Pose les images de docs/steam/ dans la bibliothèque Steam, sous les noms
# qu'elle attend pour un jeu non-Steam :
#
#   desktop/steam/install-art.sh <appid> [dossier grid]
#
# Le dossier par défaut est celui de l'utilisateur Steam unique de ce poste :
# ~/.local/share/Steam/userdata/<id>/config/grid. Relancer Steam ensuite si la
# bibliothèque ne prend pas les images (steam -shutdown, puis steam -silent).
set -eu

appid="${1:?usage: install-art.sh <appid> [dossier grid]}"
here="$(cd "$(dirname "$0")" && pwd)"
art="$here/../../docs/steam"
grid="${2:-}"

if [ -z "$grid" ]; then
  grid="$(ls -d "$HOME"/.local/share/Steam/userdata/*/config/grid | head -n 1)"
fi
mkdir -p "$grid"

cp "$art/capsule.png" "$grid/${appid}p.png"
cp "$art/banner.png" "$grid/${appid}.png"
cp "$art/hero.png" "$grid/${appid}_hero.png"
cp "$art/logo.png" "$grid/${appid}_logo.png"
cp "$art/icon.png" "$grid/${appid}_icon.png"
echo "Images posées dans $grid"
