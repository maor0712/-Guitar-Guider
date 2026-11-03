"""HTTP API (and, when built, the frontend) served by FastAPI."""

import hashlib
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import audio_io, jobs, storage
from .analysis import relabel

FRONTEND_DIST = storage.BACKEND_DIR.parent / "frontend" / "dist"
ALLOWED_UPLOADS = {".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus", ".webm", ".aac", ".mp4"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    jobs.resume_interrupted()
    yield


app = FastAPI(title="Guitar Guider", lifespan=lifespan)


class YoutubeRequest(BaseModel):
    url: str


def _require(song_id: str) -> dict:
    meta = storage.read_meta(song_id)
    if not meta:
        raise HTTPException(404, "השיר לא נמצא")
    return meta


@app.get("/api/songs")
def list_songs():
    return storage.list_songs()


@app.post("/api/songs/youtube")
def add_youtube(req: YoutubeRequest):
    video_id = audio_io.youtube_id(req.url)
    if not video_id:
        raise HTTPException(400, "זה לא נראה כמו קישור יוטיוב תקין")
    song_id = f"yt-{video_id}"
    meta = storage.read_meta(song_id)
    if meta and meta.get("status") in ("ready", "queued", "processing"):
        return meta
    jobs.submit_youtube(song_id, video_id)
    return storage.read_meta(song_id)


@app.post("/api/songs/upload")
async def upload(file: UploadFile):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_UPLOADS:
        raise HTTPException(400, "סוג קובץ לא נתמך")
    data = await file.read()
    song_id = "up-" + hashlib.sha1(data).hexdigest()[:12]
    meta = storage.read_meta(song_id)
    if meta and meta.get("status") in ("ready", "queued", "processing"):
        return meta
    folder = storage.song_dir(song_id)
    folder.mkdir(parents=True, exist_ok=True)
    source_name = "source" + suffix
    (folder / source_name).write_bytes(data)
    storage.update_meta(song_id, source_file=source_name)
    jobs.submit_file(song_id, Path(file.filename).stem)
    return storage.read_meta(song_id)


@app.get("/api/songs/{song_id}")
def get_song(song_id: str):
    meta = _require(song_id)
    return {**meta, "analysis": storage.read_analysis(song_id) if meta.get("status") == "ready" else None}


@app.get("/api/songs/{song_id}/audio")
def get_audio(song_id: str):
    _require(song_id)
    path = storage.song_dir(song_id) / audio_io.PLAYBACK_FILE
    if not path.exists():
        raise HTTPException(404, "האודיו עדיין לא מוכן")
    return FileResponse(path, media_type="audio/mpeg")


class ChordEdit(BaseModel):
    index: int
    label: str
    scope: Literal["one", "all"] = "one"


@app.post("/api/songs/{song_id}/chords")
def edit_chord(song_id: str, edit: ChordEdit):
    _require(song_id)
    current = storage.read_analysis(song_id)
    if not current:
        raise HTTPException(409, "השיר עדיין לא נותח")
    try:
        updated = relabel(current, edit.index, edit.label, edit.scope)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    storage.write_analysis(song_id, updated)
    storage.update_meta(song_id, chord_set=updated["chord_set"][:8])
    return updated


@app.post("/api/songs/{song_id}/reanalyze")
def reanalyze(song_id: str):
    _require(song_id)
    jobs.submit_reanalyze(song_id)
    return storage.read_meta(song_id)


@app.delete("/api/songs/{song_id}")
def delete(song_id: str):
    _require(song_id)
    storage.delete_song(song_id)
    return {"ok": True}


if FRONTEND_DIST.exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        file = FRONTEND_DIST / path
        if path and file.is_file():
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
