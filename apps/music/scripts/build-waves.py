"""Generate 1600x400 binary-alpha waveform silhouettes from audio.

The site renders the silhouette through CSS mask-image; only the alpha channel
matters. Each column is a symmetric vertical bar whose half-height is the
column's peak amplitude, normalised to the loudest column of the track and
smoothed with a 3-tap moving average. The earlier 800x200 mask was too coarse
at display width (~850 px): 1600 columns give 2x supersampling, and the
smoothing removes the step-like column jumps the 800-column version showed.

Local build tool: needs soundfile (FLAC/WAV decode) and Pillow.
Run with the workspace venv, e.g.:

    .temp/music-new/venv/Scripts/python.exe apps/music/scripts/build-waves.py \
        --manifest .temp/music-new/wave-manifest.json --out apps/music/server/data/waves

Manifest: JSON array of {"id": "<12 hex>", "file": "<absolute path>"}.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image

WIDTH = 1600
HEIGHT = 400
HALF = 150  # 301 px at the loudest column = 75.25% of the canvas
SMOOTH = 5


def envelope(path: Path) -> np.ndarray:
    audio, _ = sf.read(str(path), dtype="float32", always_2d=True)
    mono = np.abs(audio).max(axis=1)
    edges = np.linspace(0, len(mono), WIDTH + 1).astype(int)
    peaks = np.empty(WIDTH, dtype=np.float64)
    for column in range(WIDTH):
        start, end = edges[column], max(edges[column] + 1, edges[column + 1])
        peaks[column] = float(mono[start:end].max())
    loudest = float(peaks.max())
    if loudest <= 0:
        return np.zeros(WIDTH)
    peaks = np.convolve(peaks / loudest, np.ones(SMOOTH) / SMOOTH, mode="same")
    peaks = np.clip(peaks, 0, None)
    # Smoothing lowers the loudest column; renormalise so the peak still hits 3/4.
    return peaks / peaks.max()


def mask(peaks: np.ndarray) -> Image.Image:
    half = np.clip(np.round(HALF * peaks).astype(int), 1, HALF)
    alpha = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    for column, height in enumerate(half):
        alpha[HEIGHT // 2 - height : HEIGHT // 2 + height + 1, column] = 255
    rgba = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    entries = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    if args.limit:
        entries = entries[: args.limit]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    for index, entry in enumerate(entries, 1):
        target = out / f'{entry["id"]}.png'
        source = Path(entry["file"])
        if not source.is_file():
            raise SystemExit(f"missing audio: {source}")
        mask(envelope(source)).save(target, optimize=True)
        print(f"{index}/{len(entries)} {entry['id']}", flush=True)


if __name__ == "__main__":
    main()
