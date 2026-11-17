#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source_png="assets/app-icon-1024.png"
iconset="assets/TruTimeClock.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  printf -v file 'icon_%sx%s.png' "$size" "$size"
  sips -s format png -z "$size" "$size" "$source_png" --out "$iconset/$file" >/dev/null
  double=$((size * 2))
  printf -v doublefile 'icon_%sx%s@2x.png' "$size" "$size"
  sips -s format png -z "$double" "$double" "$source_png" --out "$iconset/$doublefile" >/dev/null
done
iconutil -c icns "$iconset" -o assets/icon.icns
test -s assets/icon.icns
echo "Generated macOS icon."
