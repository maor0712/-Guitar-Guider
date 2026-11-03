"""Song-specific strumming and fingerpicking patterns.

We measure where the accompaniment actually hits inside the bar (on a 16th-note
grid, averaged over many bars) and turn that rhythm profile into patterns for
each difficulty level. Quiet and loud parts of the song get their own patterns
when the song has real dynamics (e.g. a soft verse and a big chorus).
"""

import librosa
import numpy as np

HOP = 512
SUB = 4  # profile resolution: 16th notes
MIN_BARS = 4
DYNAMIC_RATIO = 1.35  # loud/soft energy ratio that counts as "real dynamics"

LEVEL_NAMES = {1: "מתחיל", 2: "בינוני", 3: "מתקדם"}


def onset_env(y: np.ndarray, sr: int) -> np.ndarray:
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP, aggregate=np.median)
    return env / (np.percentile(env, 99) + 1e-9)


def _slot_values(env: np.ndarray, sr: int, beat_times: np.ndarray) -> np.ndarray:
    """Onset strength at each 16th of each beat, shape (n_beats, SUB)."""
    times = []
    for i, t in enumerate(beat_times):
        nxt = beat_times[i + 1] if i + 1 < len(beat_times) else t + (t - beat_times[i - 1])
        times.extend(t + (nxt - t) * k / SUB for k in range(SUB))
    frames = librosa.time_to_frames(np.array(times), sr=sr, hop_length=HOP)
    vals = [env[max(0, f - 1):f + 2].max() if f < len(env) else 0.0 for f in frames]
    return np.array(vals).reshape(-1, SUB)


def _profile(slots: np.ndarray, beats: list[dict], bar_ids: set[int], meter: int) -> np.ndarray | None:
    rows: dict[int, list] = {}
    for i, beat in enumerate(beats):
        if beat["bar"] in bar_ids:
            rows.setdefault(beat["bar"], []).append((beat["beat"], slots[i]))
    full = [r for r in rows.values() if len(r) == meter]
    if len(full) < MIN_BARS:
        return None
    profile = np.zeros(meter * SUB)
    for bar in full:
        for beat_no, vals in bar:
            profile[(beat_no - 1) * SUB:beat_no * SUB] += vals
    profile /= len(full)
    return profile / (profile.max() + 1e-9)


# ---------- pattern generation ----------

def strum_pattern(p: np.ndarray, meter: int, bpm: float, level: int) -> dict:
    """Keep the N strongest positions of the song's own rhythm, where N grows with
    the level, so the pattern carries the song's accents and syncopations instead
    of filling every slot. Directions follow the strumming pendulum
    (down on the beat, up between)."""
    sixteenths = p[1::2].mean() / (p[::2].mean() + 1e-9)
    if level == 3 and sixteenths >= 0.45 and bpm < 125:
        sub, n = 4, round(meter * 2.25)
    else:
        sub, n = 2, {1: meter, 2: round(meter * 1.5), 3: round(meter * 1.75)}[level]
    slots = [(b, k) for b in range(meter) for k in range(sub)]
    values = [float(p[b * SUB + k * (SUB // sub)]) for b, k in slots]

    if level == 1:
        # Beginners: only on the beat, skipping beats the song leaves weak.
        hits = [k == 0 and (b == 0 or v >= 0.4) for (b, k), v in zip(slots, values)]
    else:
        n = min(n, len(slots) - 1)  # always leave at least one "air" stroke
        # Beat 1 always, then the strongest remaining positions.
        order = [i for i in sorted(range(len(slots)), key=lambda i: (-values[i], i)) if i != 0]
        chosen = {0, *order[: n - 1]}
        hits = [i in chosen for i in range(len(slots))]

    steps = [("D" if k % 2 == 0 else "U") if hit else "-" for (_, k), hit in zip(slots, hits)]
    top = max(v for v, h in zip(values, hits) if h)
    accents = [i for i, (v, h) in enumerate(zip(values, hits)) if h and v >= 0.92 * top][:2]
    return {"subdiv": sub, "steps": steps, "accents": accents,
            "tip": _describe_strum(values, hits, meter, sub)}


def _count_name(i: int, sub: int) -> str:
    beat, k = divmod(i, sub)
    pos = k * (SUB // sub)
    return {0: f"{beat + 1}", 1: f"ה-e של {beat + 1}", 2: f"ה-& של {beat + 1}", 3: f"ה-a של {beat + 1}"}[pos]


def _describe_strum(values, hits, meter, sub) -> str:
    parts = []
    on = [(i, v) for i, v in enumerate(values) if i % sub == 0]
    strongest = max(on, key=lambda x: x[1])
    if all(v >= 0.75 for _, v in on):
        parts.append("כל הפעמות בשיר חזקות, אז כל מכה למטה צריכה להיות מלאה")
    elif strongest[0] != 0:
        parts.append(f"הפעמה החזקה בשיר היא {_count_name(strongest[0], sub)}, תדגיש אותה")
    synco = [_count_name(i, sub) for i, (v, h) in enumerate(zip(values, hits)) if h and i % sub != 0 and v >= 0.5]
    if synco:
        parts.append("המכות בין הפעמות, על " + ", ".join(synco) + ", הן הסינקופה של השיר")
    skipped = [_count_name(i, sub) for i, h in enumerate(hits) if i % sub == 0 and not h]
    if skipped:
        parts.append(f"ב-{', '.join(skipped)} היד ממשיכה לזוז בלי לפגוע במיתרים, כמו בשיר")
    return (". ".join(parts) + ".") if parts else "דפוס שיושב על הקצב של השיר."


def pick_pattern(guitar: np.ndarray, bass: np.ndarray, meter: int, level: int) -> dict:
    sub = 2
    on_beats = [b * SUB for b in range(meter)]
    # Thumb on beat 1, plus other beats where the bass really plays.
    bass_beats = [0] + [b for b in range(1, meter) if bass[on_beats[b]] >= 0.55]
    if level == 3:
        bass_beats = list(range(meter))  # Travis: thumb on every beat
    guitar_busy = guitar[2::SUB].mean() >= 0.3  # does the accompaniment move in 8ths?

    steps = []
    thumb_alt = False
    roll = ["3", "2", "1", "2"]
    r = 0
    for b in range(meter):
        for k in range(sub):
            slot = b * SUB + k * 2
            if k == 0 and b in bass_beats:
                token = "A" if thumb_alt and level >= 2 else "B"
                thumb_alt = not thumb_alt
                if level == 3 and b == 0:
                    token = "B+1"
                steps.append(token)
            elif level == 1:
                steps.append("3+2+1" if k == 0 else "-")
            elif level == 2 and not guitar_busy:
                steps.append("3+2+1" if k == 0 or guitar[slot] >= 0.5 else "-")
            else:
                if guitar[slot] < 0.12 and k == 1:
                    steps.append("-")
                else:
                    steps.append(roll[r % len(roll)])
                    r += 1
    tip = {
        1: "האגודל מנגן את הבס בפעמות שבהן הבס של השיר מכה, ושלוש אצבעות פורטות יחד את המיתרים הדקים.",
        2: "האגודל עוקב אחרי הבס של השיר, והאצבעות מתגלגלות על המיתרים הדקים "
           + ("בשמיניות, כמו הליווי בשיר." if guitar_busy else "בפעמות שבהן הליווי מכה."),
        3: "האגודל מחליף בין שני מיתרי בס בכל פעמה (טראוויס), והאצבעות ממלאות ביניהם.",
    }[level]
    return {"subdiv": sub, "steps": steps, "accents": [0], "tip": tip}


def song_patterns(stem_envs: dict[str, np.ndarray], sr: int, beat_times: np.ndarray,
                  beats: list[dict], bars: list[dict], sections: list[dict],

                  bar_energy: dict[int, float], meter: int, bpm: float) -> dict | None:
    strum_env = 0.65 * stem_envs["other"] + 0.35 * stem_envs["drums"]
    strum_slots = _slot_values(strum_env, sr, beat_times)
    guitar_slots = _slot_values(stem_envs["other"], sr, beat_times)
    bass_slots = _slot_values(stem_envs["bass"], sr, beat_times)

    playing = {b["index"] for b in bars if b["index"] >= 0 and any(c != "N" for c in b["chords"])}
    if not playing:
        return None

    # Split into soft / loud bars when the song has real dynamics.
    energies = np.array([bar_energy[i] for i in playing])
    median = float(np.median(energies))
    soft_bars = {i for i in playing if bar_energy[i] < median}
    loud_bars = playing - soft_bars
    soft_e = np.mean([bar_energy[i] for i in soft_bars]) if soft_bars else 0
    loud_e = np.mean([bar_energy[i] for i in loud_bars]) if loud_bars else 0
    dynamic = bool(soft_e > 0 and loud_e / soft_e >= DYNAMIC_RATIO)
    groups = {"soft": soft_bars, "loud": loud_bars} if dynamic else {"all": playing}

    variants = {}
    for name, ids in groups.items():
        strum_p = _profile(strum_slots, beats, ids, meter)
        guitar_p = _profile(guitar_slots, beats, ids, meter)
        bass_p = _profile(bass_slots, beats, ids, meter)
        if strum_p is None:
            continue
        variants[name] = {"strum_profile": strum_p, "guitar": guitar_p, "bass": bass_p}
    if not variants:
        return None
    if dynamic and len(variants) < 2:
        variants = {"all": next(iter(variants.values()))}
        dynamic = False

    patterns = []
    for name, v in variants.items():
        for level in (1, 2, 3):
            strum = strum_pattern(v["strum_profile"], meter, bpm, level)
            pick = pick_pattern(v["guitar"], v["bass"], meter, level)
            for kind, pat in (("strum", strum), ("pick", pick)):
                patterns.append({"id": f"song-{kind}-{level}-{name}", "kind": kind, "level": level,
                                 "variant": name, "meter": meter, **pat})

    # Decide soft/loud per section (not per bar) so the pattern doesn't flicker inside a section.
    bar_variant = {}
    for s in sections:
        ids = [i for i in range(s["start_bar"], s["end_bar"] + 1) if i in playing]
        if dynamic and ids:
            variant = "soft" if np.mean([i in soft_bars for i in ids]) >= 0.5 else "loud"
        else:
            variant = "all" if not dynamic else "loud"
        for i in range(s["start_bar"], s["end_bar"] + 1):
            bar_variant[str(i)] = variant

    return {
        "dynamic": dynamic,
        "bar_variant": bar_variant,
        "profile": {name: [round(float(x), 3) for x in v["strum_profile"]] for name, v in variants.items()},
        "patterns": patterns,
    }
