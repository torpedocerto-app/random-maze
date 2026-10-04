#!/bin/sh
# Packs the add-on into dist/RandomMaze.mcpack
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/RandomMaze.mcpack
(cd pack && zip -r -X ../dist/RandomMaze.mcpack . -x ".*" > /dev/null)
echo "dist/RandomMaze.mcpack"
