"""Music-theory helpers: note names, keys and chord templates."""

import numpy as np

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Krumhansl-Kessler key profiles, index 0 = tonic.
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Chord quality -> (intervals, weight of each interval, prior penalty).
# Sevenths get a penalty so they only win when the seventh is clearly audible.
QUALITIES = {
    "": ([0, 4, 7], [1.0, 1.0, 1.0], 0.0),
    "m": ([0, 3, 7], [1.0, 1.0, 1.0], 0.0),
    "7": ([0, 4, 7, 10], [1.0, 1.0, 1.0, 0.75], 0.08),
    "m7": ([0, 3, 7, 10], [1.0, 1.0, 1.0, 0.75], 0.08),
    # Without maj7, colourful chords like Fmaj7/Fmaj9 get mistaken for G or G7.
    "maj7": ([0, 4, 7, 11], [1.0, 1.0, 1.0, 0.75], 0.08),
}

# Major keys (by tonic pitch class) conventionally spelled with flats; minor keys use their relative major.
FLAT_MAJOR_KEYS = {5, 10, 3, 8, 1, 6}  # F Bb Eb Ab Db Gb


def uses_flats(tonic: int, mode: str) -> bool:
    major_tonic = tonic if mode == "major" else (tonic + 3) % 12
    return major_tonic in FLAT_MAJOR_KEYS


def parse_label(label: str) -> tuple[int, str] | None:
    """'F#m7' -> (6, 'm7'). Returns None for unknown roots or qualities."""
    root = label[:2] if len(label) > 1 and label[1] in "#b" else label[:1]
    names = SHARP_NAMES if "#" in root else FLAT_NAMES
    if root not in names or label[len(root):] not in QUALITIES:
        return None
    return names.index(root), label[len(root):]


def note_name(pc: int, flats: bool) -> str:
    return (FLAT_NAMES if flats else SHARP_NAMES)[pc % 12]


def detect_key(chroma_mean: np.ndarray) -> tuple[int, str, float]:
    """Return (tonic pitch class, 'major'|'minor', confidence) for a 12-bin mean chroma."""
    best = (0, "major", -np.inf)
    scores = []
    for mode, profile in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
        for tonic in range(12):
            r = np.corrcoef(chroma_mean, np.roll(profile, tonic))[0, 1]
            scores.append(r)
            if r > best[2]:
                best = (tonic, mode, r)
    scores = np.sort(np.array(scores))[::-1]
    confidence = float(scores[0] - scores[1])
    return best[0], best[1], confidence


def diatonic_chords(tonic: int, mode: str) -> set[tuple[int, str]]:
    """Common diatonic triads (and V7) of a key as (root, quality) pairs."""
    major = tonic if mode == "major" else (tonic + 3) % 12
    chords = {
        (major, ""), ((major + 2) % 12, "m"), ((major + 4) % 12, "m"),
        ((major + 5) % 12, ""), ((major + 7) % 12, ""), ((major + 7) % 12, "7"),
        ((major + 9) % 12, "m"),
    }
    if mode == "minor":
        # Harmonic-minor dominant (E in A minor) is very common.
        chords |= {((tonic + 7) % 12, ""), ((tonic + 7) % 12, "7")}
    return chords


def chord_vocabulary() -> list[tuple[int, str]]:
    return [(root, q) for q in QUALITIES for root in range(12)]


def chord_templates(vocab: list[tuple[int, str]]) -> np.ndarray:
    """Unit-norm 12-bin templates, shape (len(vocab), 12)."""
    templates = np.zeros((len(vocab), 12))
    for i, (root, quality) in enumerate(vocab):
        intervals, weights, _ = QUALITIES[quality]
        for interval, weight in zip(intervals, weights):
            templates[i, (root + interval) % 12] = weight
    return templates / np.linalg.norm(templates, axis=1, keepdims=True)
