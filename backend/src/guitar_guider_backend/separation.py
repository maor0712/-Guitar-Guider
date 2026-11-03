"""Source separation with Demucs: split the mix so chords are read from the instruments only."""

import threading
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

MODEL_NAME = "htdemucs"
STEMS = ("bass", "other", "vocals", "drums")

_model = None
_model_lock = threading.Lock()


def _get_model():
    global _model
    with _model_lock:
        if _model is None:
            from demucs.pretrained import get_model

            _model = get_model(MODEL_NAME)
            _model.eval()
        return _model


def stem_path(folder: Path, stem: str) -> Path:
    return folder / f"stem_{stem}.wav"


def has_stems(folder: Path) -> bool:
    return all(stem_path(folder, s).exists() for s in STEMS)


def separate(source: Path, folder: Path, out_sr: int) -> None:
    """Write one mono WAV per stem (at out_sr) into folder."""
    import torch
    from demucs.apply import apply_model

    model = _get_model()
    wav, _ = librosa.load(source, sr=model.samplerate, mono=False)
    if wav.ndim == 1:
        wav = np.stack([wav, wav])
    mix = torch.from_numpy(wav[:2]).float()
    ref = mix.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8

    with torch.inference_mode():
        out = apply_model(model, ((mix - mean) / std)[None], device="cpu",
                          split=True, overlap=0.25, progress=False)[0]
    out = out * std + mean

    for name, audio in zip(model.sources, out):
        if name not in STEMS:
            continue
        mono = librosa.resample(audio.mean(0).numpy(), orig_sr=model.samplerate, target_sr=out_sr)
        sf.write(stem_path(folder, name), mono, out_sr)
