"""Build the app's track index and waveform masks from the local library.

Inputs
  - Internet Archive metadata for `MusopenCollectionAsFlac` (cached at
    .temp/musopen/metadata.json) and the index built by
    .temp/musopen/build_index.py.
  - The downloaded files under MUSIC_ROOT.

Outputs
  apps/music/server/data/tracks.json      served by GET /api/tracks
  apps/music/server/data/waves/<id>.png   alpha silhouette used by mask-image

The IA cover is a black rectangle with the waveform cut out (alpha 0 where the
wave is), so the usable shape is the inverted alpha, tinted in CSS.
"""

import json
import os
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
MUSIC_ROOT = Path(os.environ.get("MUSIC_ROOT", r"C:\Users\kxh\Music\musopen-flac"))
INDEX = ROOT / ".temp" / "musopen" / "tracks.json"
APP_DATA = ROOT / "apps" / "music" / "server" / "data"
WAVES = APP_DATA / "waves"
ITEM = "MusopenCollectionAsFlac"


def mask_for(cover_relative: str, track_id: str) -> str | None:
    source = MUSIC_ROOT / cover_relative.replace("/", os.sep)
    if not source.is_file():
        return None
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    silhouette = Image.new("RGBA", image.size, (255, 255, 255, 0))
    silhouette.putalpha(alpha.point(lambda value: 255 - value))
    out = WAVES / f"{track_id}.png"
    silhouette.save(out, optimize=True)
    return f"/waves/{track_id}.png"


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    APP_DATA.mkdir(parents=True, exist_ok=True)
    WAVES.mkdir(parents=True, exist_ok=True)

    tracks = []
    missing = 0
    for track in index["tracks"]:
        audio = MUSIC_ROOT / track["path"].replace("/", os.sep)
        if not audio.is_file():
            missing += 1
            continue
        mask = mask_for(track["cover"], track["id"])
        tracks.append(
            {
                "id": track["id"],
                "composer": track["composer"],
                "work": track["work"],
                "movement": track["movement"],
                "trackNo": track["track_no"],
                "title": track["title"],
                "artist": track["artist"],
                "format": track["format"],
                "bytes": track["bytes"],
                "seconds": round(track["seconds"], 1),
                "sampleRate": track.get("sample_rate", 0),
                "bits": track.get("bits", 0),
                "audio": f"/media/{track['path']}",
                "cover": f"/media/{track['cover']}",
                "mask": mask,
                "sourceUrl": track["source_url"],
                "md5": track["md5"],
                "license": track["license"],
            }
        )

    payload = {
        "item": ITEM,
        "license": index["license"],
        "source": index["source"],
        "library": {"tracks": len(tracks), "works": len(index["works"])},
        "tracks": tracks,
    }
    (APP_DATA / "tracks.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"tracks={len(tracks)} works={len(index['works'])} missing={missing} "
        f"waves={len(list(WAVES.glob('*.png')))} bytes={(APP_DATA / 'tracks.json').stat().st_size}"
    )


if __name__ == "__main__":
    main()
