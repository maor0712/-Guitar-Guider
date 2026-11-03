"""Song analysis: beats, meter, key, chords and repeating sections.

Everything is computed on a beat grid. Chords are recognised by matching
beat-synchronous chroma against chord templates, then smoothed with a Viterbi
pass so they only change when the evidence is strong.
"""

from collections import Counter
from collections.abc import Callable
from pathlib import Path

import librosa
import numpy as np

from . import rhythm, theory

HOP = 512
BINS_PER_OCTAVE = 36
N_OCTAVES = 6
FMIN_NOTE = "E1"

SOFTMAX_BETA = 40.0
STAY_PROB = 0.85
BASS_WEIGHT = 0.15
KEY_BONUS = 0.06
NO_CHORD_SIM = 0.55
PHRASE_BARS = 4
SECTION_SIMILARITY = 0.6

ProgressFn = Callable[[str, int], None]


def analyze(
    wav_path: Path,
    progress: ProgressFn = lambda stage, pct: None,
    stems: dict[str, Path] | None = None,
) -> dict:
    """Analyse a mono WAV. With Demucs `stems` ("other", "bass"), chords are read
    from the instruments only; otherwise a harmonic/percussive split is used."""
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    duration = len(y) / sr

    progress("beats", 55)
    y_harm, y_perc = librosa.effects.hpss(y)
    beat_frames, onset_env = _track_beats(y_perc, sr, duration)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP)

    progress("chords", 70)
    if stems:
        chord_src = librosa.load(stems["other"], sr=sr, mono=True)[0]
        bass_src = librosa.load(stems["bass"], sr=sr, mono=True)[0]
    else:
        chord_src = bass_src = y_harm
    tuning = float(librosa.estimate_tuning(y=chord_src, sr=sr))
    treble, bass, energy = _beat_features(chord_src, bass_src, sr, beat_frames, tuning)

    tonic, mode, key_conf = theory.detect_key(treble.mean(axis=1))
    flats = theory.uses_flats(tonic, mode)
    states, confidence, vocab = _decode_chords(treble, bass, energy, tonic, mode)

    progress("structure", 90)
    labels = [_label(vocab, s, flats) for s in states]
    meter, phase = _detect_meter(states, onset_env, beat_frames)
    beats, bars = _build_bars(beat_times, duration, labels, meter, phase)
    chords = _chord_segments(beat_times, duration, states, confidence, vocab, flats)
    sections = _find_sections(bars)

    intervals = np.diff(beat_times)
    bpm = float(60.0 / np.median(intervals)) if len(intervals) else 0.0
    counts = Counter(c["label"] for c in chords if c["label"] != "N")

    progress("rhythm", 95)
    drums_src = librosa.load(stems["drums"], sr=sr, mono=True)[0] if stems else y_perc
    envs = {"other": rhythm.onset_env(chord_src, sr), "bass": rhythm.onset_env(bass_src, sr),
            "drums": rhythm.onset_env(drums_src, sr)}
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    bar_energy = {}
    for bar in bars:
        a, b = librosa.time_to_frames([bar["start"], bar["end"]], sr=sr, hop_length=HOP)
        bar_energy[bar["index"]] = float(rms[a:max(b, a + 1)].mean()) if a < len(rms) else 0.0
    song_rhythm = rhythm.song_patterns(envs, sr, beat_times, beats, bars, sections, bar_energy, meter, bpm)

    progress("done", 100)
    return {
        "version": 2,
        "rhythm": song_rhythm,
        "separated": bool(stems),
        "duration": round(duration, 3),
        "bpm": round(bpm, 1),
        "meter": meter,
        "tuning_cents": round(tuning * 100),
        "key": {"tonic": theory.note_name(tonic, flats), "mode": mode, "confidence": round(key_conf, 3)},
        "beats": beats,
        "bars": bars,
        "chords": chords,
        "sections": sections,
        "chord_set": [label for label, _ in counts.most_common()],
    }


def relabel(analysis: dict, index: int, label: str, scope: str = "one") -> dict:
    """Manually correct a chord segment (or every segment with the same label)
    and rebuild everything derived from the chords."""
    chords = analysis["chords"]
    if not 0 <= index < len(chords):
        raise ValueError("אינדקס אקורד לא תקין")
    parsed = None if label == "N" else theory.parse_label(label)
    if label != "N" and parsed is None:
        raise ValueError(f"אקורד לא מוכר: {label}")

    old = chords[index]["label"]
    targets = [i for i, c in enumerate(chords) if c["label"] == old] if scope == "all" else [index]
    for i in targets:
        chords[i].update(label=label, confidence=1.0,
                         root=label[: len(label) - len(parsed[1])] if parsed else None,
                         quality=parsed[1] if parsed else None)

    merged = []
    for chord in chords:
        if merged and merged[-1]["label"] == chord["label"]:
            merged[-1]["end"] = chord["end"]
        else:
            merged.append(dict(chord))
    analysis["chords"] = merged

    starts = [c["start"] for c in merged]
    for bar in analysis["bars"]:
        bar["chords"] = []
    bars = {b["index"]: b for b in analysis["bars"]}
    for beat in analysis["beats"]:
        i = max(0, int(np.searchsorted(starts, beat["t"] + 1e-6)) - 1)
        bars[beat["bar"]]["chords"].append(merged[i]["label"])

    analysis["sections"] = _find_sections(analysis["bars"])
    counts = Counter(c["label"] for c in merged if c["label"] != "N")
    analysis["chord_set"] = [lbl for lbl, _ in counts.most_common()]
    analysis["edited"] = True
    return analysis


def _track_beats(y_perc: np.ndarray, sr: int, duration: float) -> tuple[np.ndarray, np.ndarray]:
    onset_env = librosa.onset.onset_strength(y=y_perc, sr=sr, hop_length=HOP, aggregate=np.median)
    _, frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=HOP, tightness=120, trim=False
    )
    frames = np.unique(frames.astype(int))
    if len(frames) < 2:
        raise RuntimeError("לא הצלחתי לזהות פעמות בשיר")

    # Fill gaps the tracker left at the very start and end with the median period,
    # so the intro and outro still get bars.
    period = int(np.median(np.diff(frames)))
    last_frame = librosa.time_to_frames(duration, sr=sr, hop_length=HOP)
    head = np.arange(frames[0] - period, -1, -period)[::-1]
    tail = np.arange(frames[-1] + period, last_frame - period // 2, period)
    frames = np.concatenate([head, frames, tail]).astype(int)
    return frames, onset_env


def _log_cqt(y, sr, tuning):
    cqt = librosa.cqt(
        y, sr=sr, hop_length=HOP, fmin=librosa.note_to_hz(FMIN_NOTE),
        n_bins=BINS_PER_OCTAVE * N_OCTAVES, bins_per_octave=BINS_PER_OCTAVE, tuning=tuning,
    )
    return np.log1p(100.0 * np.abs(cqt))


def _beat_features(chord_src, bass_src, sr, beat_frames, tuning):
    """Beat-synchronous treble chroma, bass chroma and energy."""
    n_bins = BINS_PER_OCTAVE * N_OCTAVES
    to_chroma = librosa.filters.cq_to_chroma(
        n_bins, bins_per_octave=BINS_PER_OCTAVE, n_chroma=12, fmin=librosa.note_to_hz(FMIN_NOTE)
    )
    treble_start = BINS_PER_OCTAVE  # E2 and up
    bass_cut = BINS_PER_OCTAVE * 2  # E1..E3
    treble_mask = np.zeros(n_bins)
    treble_mask[treble_start:] = 1
    bass_mask = np.zeros(n_bins)
    bass_mask[:bass_cut] = 1

    cqt = _log_cqt(chord_src, sr, tuning)
    bass_cqt = cqt if bass_src is chord_src else _log_cqt(bass_src, sr, tuning)
    n_frames = min(cqt.shape[1], bass_cqt.shape[1])
    cqt, bass_cqt = cqt[:, :n_frames], bass_cqt[:, :n_frames]

    treble = to_chroma @ (cqt * treble_mask[:, None])
    bass = to_chroma @ (bass_cqt * bass_mask[:, None])
    energy = cqt.sum(axis=0, keepdims=True) + bass_cqt.sum(axis=0, keepdims=True)

    bounds = list(beat_frames) + [n_frames]
    bounds = [min(b, n_frames) for b in bounds]
    treble = librosa.util.sync(treble, bounds, aggregate=np.median, pad=False)
    bass = librosa.util.sync(bass, bounds, aggregate=np.median, pad=False)
    energy = librosa.util.sync(energy, bounds, aggregate=np.mean, pad=False)[0]

    # Keep exactly one column per beat.
    n = len(beat_frames)
    treble, bass, energy = _fit(treble, n), _fit(bass, n), _fit(energy[None, :], n)[0]
    treble = treble / (np.linalg.norm(treble, axis=0, keepdims=True) + 1e-9)
    bass = bass / (bass.max(axis=0, keepdims=True) + 1e-9)
    return treble, bass, energy


def _fit(x: np.ndarray, n: int) -> np.ndarray:
    if x.shape[1] >= n:
        return x[:, :n]
    pad = np.repeat(x[:, -1:], n - x.shape[1], axis=1) if x.shape[1] else np.zeros((x.shape[0], n))
    return np.concatenate([x, pad], axis=1)


def _decode_chords(treble, bass, energy, tonic, mode):
    vocab = theory.chord_vocabulary()
    templates = theory.chord_templates(vocab)
    roots = np.array([root for root, _ in vocab])
    penalties = np.array([theory.QUALITIES[q][2] for _, q in vocab])
    diatonic = theory.diatonic_chords(tonic, mode)
    key_bonus = np.array([KEY_BONUS if chord in diatonic else 0.0 for chord in vocab])

    sim = templates @ treble
    sim += BASS_WEIGHT * bass[roots, :]
    sim += (key_bonus - penalties)[:, None]

    # No-chord state: wins in silence / near-silence and on unpitched noise.
    quiet = energy < 0.15 * np.median(energy)
    no_chord = np.full((1, sim.shape[1]), NO_CHORD_SIM) + 0.6 * quiet[None, :]
    sim = np.vstack([sim, no_chord])

    logits = SOFTMAX_BETA * sim
    probs = np.exp(logits - logits.max(axis=0, keepdims=True))
    probs /= probs.sum(axis=0, keepdims=True)

    transition = librosa.sequence.transition_loop(sim.shape[0], STAY_PROB)
    states = librosa.sequence.viterbi(probs, transition)
    confidence = probs[states, np.arange(len(states))]
    return states, confidence, vocab + [None]


def _label(vocab, state, flats) -> str:
    chord = vocab[state]
    if chord is None:
        return "N"
    root, quality = chord
    return theory.note_name(root, flats) + quality


def _detect_meter(states, onset_env, beat_frames) -> tuple[int, int]:
    """Pick meter (3 or 4) and the index of the first downbeat.

    Chord changes and strong onsets tend to land on downbeats.
    """
    n = len(states)
    if n < 8:
        return 4, 0
    change = np.r_[1, (np.diff(states) != 0).astype(float)]
    accent = onset_env[np.clip(beat_frames, 0, len(onset_env) - 1)]
    accent = accent / (accent.max() + 1e-9)
    evidence = change + 0.5 * accent

    best = {}
    for meter in (3, 4):
        scores = [evidence[phase::meter].mean() - evidence.mean() for phase in range(meter)]
        phase = int(np.argmax(scores))
        best[meter] = (scores[phase], phase)
    meter = 3 if best[3][0] > 1.25 * best[4][0] and best[3][0] > 0 else 4
    return meter, best[meter][1]


def _build_bars(beat_times, duration, labels, meter, phase):
    beats = []
    for i, t in enumerate(beat_times):
        offset = i - phase
        beats.append({"t": round(float(t), 3), "bar": offset // meter, "beat": offset % meter + 1})

    bars: dict[int, dict] = {}
    for i, beat in enumerate(beats):
        bar = bars.setdefault(beat["bar"], {"index": beat["bar"], "start": beat["t"], "chords": []})
        bar["chords"].append(labels[i])
    ordered = [bars[k] for k in sorted(bars)]
    for current, nxt in zip(ordered, ordered[1:] + [None]):
        current["end"] = nxt["start"] if nxt else round(duration, 3)
    return beats, ordered


def _chord_segments(beat_times, duration, states, confidence, vocab, flats):
    segments = []
    ends = list(beat_times[1:]) + [duration]
    for i, state in enumerate(states):
        if segments and segments[-1]["_state"] == state:
            segments[-1]["end"] = ends[i]
            segments[-1]["_conf"].append(confidence[i])
            continue
        chord = vocab[state]
        segments.append({
            "_state": state, "_conf": [confidence[i]],
            "start": float(beat_times[i]), "end": float(ends[i]),
            "label": _label(vocab, state, flats),
            "root": theory.note_name(chord[0], flats) if chord else None,
            "quality": chord[1] if chord else None,
        })
    if segments and segments[0]["start"] > 0:
        segments.insert(0, {"_state": -1, "_conf": [1.0], "start": 0.0, "end": segments[0]["start"],
                            "label": "N", "root": None, "quality": None})
    for seg in segments:
        seg["confidence"] = round(float(np.mean(seg.pop("_conf"))), 3)
        seg.pop("_state")
        seg["start"], seg["end"] = round(seg["start"], 3), round(seg["end"], 3)
    return segments


def _triad(label: str) -> str:
    """Reduce sevenths to their triad so 'G' and 'G7' count as the same chord."""
    for suffix, base in (("maj7", ""), ("m7", "m"), ("7", "")):
        if label.endswith(suffix):
            return label[: -len(suffix)] + base
    return label


def _find_sections(bars):
    """Group bars into phrases and label phrases with the same progression alike (A, B, ...)."""
    full = [b for b in bars if b["index"] >= 0]
    phrases = [full[i:i + PHRASE_BARS] for i in range(0, len(full), PHRASE_BARS)]
    known: list[tuple[str, list[str]]] = []
    labelled = []
    for phrase in phrases:
        flat = [_triad(c) for bar in phrase for c in bar["chords"]]
        if all(c == "N" for c in flat):
            labelled.append(("-", phrase))
            continue
        label, best = None, SECTION_SIMILARITY
        for name, ref in known:
            sim = sum(a == b for a, b in zip(ref, flat)) / max(len(ref), len(flat))
            if sim >= best:
                label, best = name, sim
        if label is None:
            label = chr(ord("A") + len(known)) if len(known) < 26 else "?"
            known.append((label, flat))
        labelled.append((label, phrase))

    sections = []
    for label, phrase in labelled:
        if sections and sections[-1]["label"] == label:
            sections[-1]["end"] = phrase[-1]["end"]
            sections[-1]["end_bar"] = phrase[-1]["index"]
            sections[-1]["repeats"] += 1
            continue
        progression = []
        for bar in phrase:
            for c in bar["chords"]:
                if not progression or progression[-1] != c:
                    progression.append(c)
        sections.append({
            "label": label, "start": phrase[0]["start"], "end": phrase[-1]["end"],
            "start_bar": phrase[0]["index"], "end_bar": phrase[-1]["index"],
            "repeats": 1, "progression": progression,
        })
    return sections
