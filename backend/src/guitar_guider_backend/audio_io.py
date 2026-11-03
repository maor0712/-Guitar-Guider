"""Getting audio in: YouTube download via yt-dlp and ffmpeg conversion."""

import re
import shutil
import subprocess
from pathlib import Path

import yt_dlp

from .storage import DATA_DIR

YOUTUBE_COOKIES = DATA_DIR / "youtube_cookies.txt"

YOUTUBE_ID_RE = re.compile(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})")

PLAYBACK_FILE = "audio.mp3"
ANALYSIS_FILE = "analysis.wav"
ANALYSIS_SR = 22050


def youtube_id(url: str) -> str | None:
    match = YOUTUBE_ID_RE.search(url)
    if match:
        return match.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url.strip()):
        return url.strip()
    return None


def ffmpeg_path() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError("ffmpeg לא נמצא ב-PATH. יש לפתוח טרמינל חדש אחרי ההתקנה.")
    return path


class YoutubeBlocked(RuntimeError):
    pass


BLOCKED_HINTS = ("sign in to confirm", "not a bot", "cookies", "http error 429")


def download_youtube(video_id: str, folder: Path) -> dict:
    """Download best audio for a YouTube video into folder. Returns basic metadata."""
    folder.mkdir(parents=True, exist_ok=True)
    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(folder / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": {"deno": {}, "node": {}},
    }
    # Servers in the cloud are often blocked by YouTube unless they send a signed-in user's cookies.
    if YOUTUBE_COOKIES.exists():
        opts["cookiefile"] = str(YOUTUBE_COOKIES)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
            source = Path(ydl.prepare_filename(info))
    except yt_dlp.utils.DownloadError as exc:
        if any(hint in str(exc).lower() for hint in BLOCKED_HINTS):
            what = "קובץ ה-cookies כבר לא תקף, צריך להעלות חדש" if YOUTUBE_COOKIES.exists() \
                else "צריך להעלות קובץ cookies של יוטיוב (במסך הבית)"
            raise YoutubeBlocked(f"יוטיוב חסם את ההורדה מהשרת: {what}. בינתיים אפשר להעלות קובץ שמע.") from exc
        raise
    return {
        "title": info.get("title") or video_id,
        "artist": info.get("artist") or info.get("uploader"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "source_file": source.name,
    }


def convert(source: Path, folder: Path) -> None:
    """Create a browser-friendly MP3 for playback and a mono WAV for analysis."""
    ffmpeg = ffmpeg_path()
    common = [ffmpeg, "-y", "-loglevel", "error", "-i", str(source), "-vn"]
    subprocess.run(common + ["-ac", "2", "-b:a", "192k", str(folder / PLAYBACK_FILE)], check=True)
    subprocess.run(
        common + ["-ac", "1", "-ar", str(ANALYSIS_SR), str(folder / ANALYSIS_FILE)], check=True
    )
