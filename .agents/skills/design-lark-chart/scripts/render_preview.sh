#!/usr/bin/env bash
# Render a board.json to PNG via whiteboard-cli.
#
# Usage:
#   scripts/render_preview.sh <board.json> <preview.png> [--scale N]
#
# Idempotent: overwrites the output file.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <board.json> <preview.png> [--scale N]" >&2
  exit 2
fi

INPUT="$1"
OUTPUT="$2"
shift 2

SCALE=2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scale) SCALE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -f "$INPUT" ]]; then
  echo "error: $INPUT not found" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUTPUT")"
npx -y @larksuite/whiteboard-cli@^0.2.0 -i "$INPUT" -o "$OUTPUT" -s "$SCALE"
echo "rendered: $OUTPUT"
