"""Transcode the local "classical picks" WAVs to FLAC (16 bit / 44.1 kHz).

Local build tool: needs soundfile. Reads the waveform manifest built from
.temp/music-new/scan.json and writes <id>.flac into the target directory, so the
server can serve both collections through one index.

    .temp/music-new/venv/Scripts/python.exe apps/music/scripts/transcode-classical.py \
        --manifest .temp/music-new/wave-manifest.json \
        --out C:/Users/kxh/Music/music-classical-flac
"""

import argparse
import json
from pathlib import Path

import soundfile as sf


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    entries = [e for e in json.loads(Path(args.manifest).read_text(encoding="utf-8")) if e.get("collection") == "classical"]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for index, entry in enumerate(entries, 1):
        target = out / f'{entry["id"]}.flac'
        if target.exists():
            print(f"{index}/{len(entries)} skip {entry['id']}", flush=True)
            continue
        data, rate = sf.read(entry["file"], dtype="int16", always_2d=True)
        sf.write(str(target), data, rate, format="FLAC", subtype="PCM_16")
        print(f"{index}/{len(entries)} {entry['id']} {target.stat().st_size}", flush=True)


if __name__ == "__main__":
    main()
