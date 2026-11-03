"""On-disk storage: one folder per song holding audio files, meta.json and analysis.json."""

import json
import os
import shutil
import threading
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("GG_DATA_DIR", BACKEND_DIR / "data"))
SONGS_DIR = DATA_DIR / "songs"
SONGS_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()


def song_dir(song_id: str) -> Path:
    return SONGS_DIR / song_id


def _write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def read_meta(song_id: str) -> dict | None:
    path = song_dir(song_id) / "meta.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def update_meta(song_id: str, **fields) -> dict:
    with _lock:
        folder = song_dir(song_id)
        folder.mkdir(parents=True, exist_ok=True)
        meta = read_meta(song_id) or {"id": song_id, "created_at": time.time()}
        meta.update(fields)
        meta["updated_at"] = time.time()
        _write_json(folder / "meta.json", meta)
        return meta


def read_analysis(song_id: str) -> dict | None:
    path = song_dir(song_id) / "analysis.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_analysis(song_id: str, analysis: dict) -> None:
    _write_json(song_dir(song_id) / "analysis.json", analysis)


def list_songs() -> list[dict]:
    songs = []
    for folder in SONGS_DIR.iterdir():
        if folder.is_dir():
            meta = read_meta(folder.name)
            if meta:
                songs.append(meta)
    return sorted(songs, key=lambda m: m.get("created_at", 0), reverse=True)


def delete_song(song_id: str) -> None:
    shutil.rmtree(song_dir(song_id), ignore_errors=True)
