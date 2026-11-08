"""Build the unified track index from the two curated catalogs.

Inputs (all in the repository, no network):
  apps/music/scripts/data/musopen-index.json  the 145-track Musopen index (source)
  apps/music/scripts/data/old-zh.json         Chinese names for the Musopen tracks
  apps/music/scripts/data/new-catalog.json    the 202 local "classical picks" tracks

Output:
  apps/music/server/data/tracks.json          served by GET /api/tracks

Waveform masks are built separately by build-waves.py. Audio paths are
"media/<path>" for Musopen and "media/classical/<id>.flac" for the local
collection, which the server maps to MUSIC_ROOT and MUSIC_ROOT_CLASSICAL.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "apps" / "music" / "scripts" / "data"
OUT = ROOT / "apps" / "music" / "server" / "data" / "tracks.json"
SOURCE = "https://archive.org/details/MusopenCollectionAsFlac"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def old_tracks() -> list[dict]:
    index = load(DATA / "musopen-index.json")
    zh = load(DATA / "old-zh.json")
    tracks = []
    for track in index["tracks"]:
        words = zh["works"][track["work"]]
        movement = zh["tracks"][track["id"]]["movementZh"]
        tracks.append(
            {
                **track,
                "composerZh": words["composerZh"],
                "workZh": words["workZh"],
                "movementZh": movement,
                "workOriginal": words["workOriginal"],
                "catalog": words["catalog"],
                "collection": "musopen",
                "kind": "full",
                "confidence": "high",
            }
        )
    return tracks


def new_tracks() -> list[dict]:
    tracks = []
    for entry in load(DATA / "new-catalog.json"):
        tracks.append(
            {
                "id": entry["id"],
                "composer": entry["composer"],
                "composerZh": entry["composerZh"],
                "work": entry["work"],
                "workZh": entry["workZh"],
                "movement": entry["movement"],
                "movementZh": entry["movementZh"],
                "workOriginal": entry["work"],
                "catalog": entry["catalog"],
                "collection": "classical",
                "kind": entry["kind"],
                "confidence": entry["confidence"],
                "trackNo": "",
                "title": f'{entry["composerZh"]} - {entry["workZh"]}',
                "artist": "本地收藏",
                "format": "flac",
                "bytes": entry["bytes"],
                "seconds": entry["seconds"],
                "sampleRate": entry["sampleRate"],
                "bits": entry["bits"],
                "audio": f'media/classical/{entry["id"]}.flac',
                "cover": None,
                "mask": f'waves/{entry["id"]}.png',
                "sourceUrl": None,
                "md5": "",
                "license": "来源未确认",
            }
        )
    return tracks


def main() -> None:
    old = old_tracks()
    new = new_tracks()
    tracks = old + new
    ids = [track["id"] for track in tracks]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate track ids")
    works = {(track["collection"], track["composer"], track["work"]) for track in tracks}
    payload = {
        "item": "MusopenCollectionAsFlac + 古典精选",
        "license": "CC PD Mark 1.0（Musopen）；古典精选来源未确认",
        "source": SOURCE,
        "library": {"tracks": len(tracks), "works": len(works)},
        "tracks": tracks,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"tracks={len(tracks)} old={len(old)} new={len(new)} works={len(works)} bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
