#!/usr/bin/env bash
set -euo pipefail

# Ink Night: Full Cel-Ink Roster Aseprite CLI + Fallback QA Pipeline
# Supports native local Aseprite ($ASEPRITE) with automatic pure-script fallback across all 7 Cel-Ink actors:
#   Heroes (96x96, 29f, zero-vermilion): player_mortal_cel, player_sheng_cel, player_dan_cel
#   Daytime Ecology (64x64 / 96x96, 19f): enemy_wolf_cel, enemy_boar_cel, enemy_treant_cel, enemy_shanxiao_cel

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ART_ROOT="$PROJECT_DIR/art_pipeline"
SPRITES_DIR="$PROJECT_DIR/assets/sprites"

mkdir -p "$ART_ROOT/source_384" "$ART_ROOT/frames_96" "$ART_ROOT/aseprite" "$ART_ROOT/preview"

ASEPRITE_BIN="${ASEPRITE:-}"
if [ -z "$ASEPRITE_BIN" ]; then
  if [ -x "/Applications/Aseprite.app/Contents/MacOS/aseprite" ]; then
    ASEPRITE_BIN="/Applications/Aseprite.app/Contents/MacOS/aseprite"
  elif command -v aseprite >/dev/null 2>&1; then
    ASEPRITE_BIN="$(command -v aseprite)"
  fi
fi

if [ -n "$ASEPRITE_BIN" ] && [ -x "$ASEPRITE_BIN" ]; then
  echo "[InkPipeline] Detected Aseprite CLI: $ASEPRITE_BIN"
  "$ASEPRITE_BIN" --version
  if ls "$ART_ROOT/frames_96/"*.png >/dev/null 2>&1; then
    INK_ART_ROOT="$ART_ROOT" "$ASEPRITE_BIN" -b --script "$SCRIPT_DIR/assemble_frames.lua"
    "$ASEPRITE_BIN" -b "$ART_ROOT/aseprite/player_mortal_cel.aseprite" \
      --sheet "$SPRITES_DIR/player_mortal_cel.png" \
      --data "$SPRITES_DIR/player_mortal_cel.json" \
      --format json-array \
      --sheet-type horizontal \
      --list-tags
    echo "[InkPipeline] Exported native Aseprite sheet & JSON metadata."
  fi
else
  echo "[InkPipeline] Local Aseprite binary not found (set ASEPRITE=/path/to/aseprite). Using pure-script fallback QA."
fi

ACTORS=(
  "player_mortal_cel:"
  "player_sheng_cel:"
  "player_dan_cel:"
  "enemy_wolf_cel:"
  "enemy_boar_cel:"
  "enemy_treant_cel:"
  "enemy_shanxiao_cel:--allow-vermilion"
  "ghost_cel:"
  "jiangshi_cel:--allow-vermilion"
  "boss_magistrate_cel:--allow-vermilion"
)

for entry in "${ACTORS[@]}"; do
  name="${entry%%:*}"
  flag="${entry#*:}"
  png="$SPRITES_DIR/${name}.png"
  js="$SPRITES_DIR/${name}.json"
  qa="$SPRITES_DIR/${name}.qa.json"
  if [ -f "$png" ] && [ -f "$js" ]; then
    echo "[InkPipeline] Running QA gate on ${name}..."
    if [ -n "$flag" ]; then
      python3 "$SCRIPT_DIR/qa_check.py" "$png" "$js" "$qa" "$flag" >/dev/null
    else
      python3 "$SCRIPT_DIR/qa_check.py" "$png" "$js" "$qa" >/dev/null
    fi
    echo "[InkPipeline] PASSED -> ${name}.qa.json"
  else
    echo "[InkPipeline] ERROR: Missing $png or $js" >&2
    exit 1
  fi
done

echo "[InkPipeline] All 10 multi-direction Cel-Ink spritesheets passed QA gate."
