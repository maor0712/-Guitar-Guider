"""Background processing: download/convert/analyse one song at a time."""

import logging
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import audio_io, separation, storage
from .analysis import analyze

log = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=1)

STAGE_TEXT = {
    "queued": "ממתין בתור",
    "downloading": "מוריד את השיר",
    "converting": "ממיר אודיו",
    "separating": "מפריד שירה, תופים וכלים (הכי איטי, כדקה-שתיים)",
    "beats": "מזהה פעמות וקצב",
    "chords": "מזהה אקורדים",
    "structure": "מזהה מבנה וחלקים",
    "done": "מוכן",
}


def _set_stage(song_id: str, stage: str, pct: int) -> None:
    storage.update_meta(song_id, status="processing", stage=stage,
                        stage_text=STAGE_TEXT.get(stage, stage), progress=pct)


def submit_youtube(song_id: str, video_id: str) -> None:
    storage.update_meta(song_id, status="queued", stage="queued", stage_text=STAGE_TEXT["queued"],
                        progress=0, source="youtube", video_id=video_id, error=None)
    _executor.submit(_run, song_id, video_id)


def submit_file(song_id: str, title: str) -> None:
    storage.update_meta(song_id, status="queued", stage="queued", stage_text=STAGE_TEXT["queued"],
                        progress=0, source="upload", title=title, error=None)
    _executor.submit(_run, song_id, None)


def submit_reanalyze(song_id: str) -> None:
    storage.update_meta(song_id, status="queued", stage="queued", stage_text=STAGE_TEXT["queued"],
                        progress=0, error=None)
    _executor.submit(_run, song_id, None)


def _run(song_id: str, video_id: str | None) -> None:
    folder = storage.song_dir(song_id)
    video_id = video_id or (storage.read_meta(song_id) or {}).get("video_id")
    try:
        if video_id and not (folder / audio_io.PLAYBACK_FILE).exists():
            _set_stage(song_id, "downloading", 2)
            info = audio_io.download_youtube(video_id, folder)
            storage.update_meta(song_id, **info)

        if not (folder / audio_io.ANALYSIS_FILE).exists():
            _set_stage(song_id, "converting", 6)
            meta = storage.read_meta(song_id) or {}
            audio_io.convert(folder / meta["source_file"], folder)

        stems = None
        try:
            if not separation.has_stems(folder):
                _set_stage(song_id, "separating", 12)
                separation.separate(folder / audio_io.PLAYBACK_FILE, folder, audio_io.ANALYSIS_SR)
            stems = {s: separation.stem_path(folder, s) for s in separation.STEMS}
        except Exception:
            log.warning("Separation failed for %s, analysing the full mix:\n%s",
                        song_id, traceback.format_exc())

        result = analyze(folder / audio_io.ANALYSIS_FILE,
                         progress=lambda stage, pct: _set_stage(song_id, stage, pct), stems=stems)
        storage.write_analysis(song_id, result)
        meta = storage.read_meta(song_id) or {}
        storage.update_meta(song_id, status="ready", stage="done", stage_text=STAGE_TEXT["done"],
                            progress=100, duration=meta.get("duration") or result["duration"],
                            bpm=result["bpm"], key=result["key"], chord_set=result["chord_set"][:8])
    except Exception as exc:  # report any failure to the UI
        log.error("Processing %s failed:\n%s", song_id, traceback.format_exc())
        storage.update_meta(song_id, status="error", error=str(exc) or exc.__class__.__name__)


def resume_interrupted() -> None:
    """Re-queue songs that were mid-processing when the server stopped."""
    for meta in storage.list_songs():
        if meta.get("status") in ("queued", "processing"):
            if meta.get("source") == "youtube":
                submit_youtube(meta["id"], meta["video_id"])
            elif (Path(storage.song_dir(meta["id"])) / (meta.get("source_file") or "")).is_file():
                submit_reanalyze(meta["id"])
