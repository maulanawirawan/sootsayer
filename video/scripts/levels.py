"""Level check of the score: RMS per 0.4 s window (dBFS), the loudest windows,
and the level around each scene, so no cue sticks out. Not LUFS (no K-weighting),
but good enough to see relative jumps.
  uv run --no-project --python 3.12 --with numpy python scripts/levels.py"""
import wave
from pathlib import Path

import numpy as np

p = Path(__file__).resolve().parent.parent / "public" / "audio" / "score.wav"
with wave.open(str(p)) as w:
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, 2).astype(np.float32) / 32768
mono = x.mean(axis=1)
win = int(0.4 * sr)
n = mono.size // win
rms = np.sqrt(np.mean(mono[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
db = 20 * np.log10(rms)
bed = np.median(db[db > -60])
print(f"median window {bed:.1f} dBFS; loudest windows:")
for i in np.argsort(db)[::-1][:8]:
    print(f"  {i * 0.4:6.1f} s  {db[i]:6.1f} dBFS  (+{db[i] - bed:.1f} dB over the median)")
print("per 4 s:", " ".join(f"{k * 4}:{db[k * 10:(k + 1) * 10].max():.0f}" for k in range(n // 10)))
