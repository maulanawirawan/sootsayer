"""'Ember': the original score of the Sootsayer demo, synthesised from code.

numpy only: no samples, no third-party recordings, so the music carries no
copyright claim. The cue points come from the video's own timeline
(src/timeline.json + the clips that exist), so every accent lands on a cut.

  cold open   low D drone, ember crackle at the ignition, a glassy bell motif,
              a pad as the page darkens, a heartbeat under "who is coming?",
              a riser into the burn and a soft low hit at the reveal
  the product a slow pulse (one beat every 1.6 s) under a D minor progression,
              a soft bell on every cut
  Kiro        the same pulse, brighter chords, a quiet arpeggio
  night, end  back to the drone; a final low hit and a long tail

  uv run --no-project --python 3.12 --with numpy python scripts/score.py
Output: public/audio/score.wav (48 kHz, 16-bit stereo, about -16 LUFS after
ffmpeg loudnorm, done by the script when ffmpeg is on PATH).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent.parent
SR = 48_000
rng = np.random.default_rng(2026)


def placed_shots():
    tl = json.loads((HERE / "src" / "timeline.json").read_text(encoding="utf-8"))
    clips_file = HERE / "src" / "clips.generated.json"
    clips = json.loads(clips_file.read_text(encoding="utf-8")) if clips_file.exists() else {}
    t, out = 0.0, []
    for s in tl["shots"]:
        if s.get("optional") and s.get("clip") not in clips:
            continue
        frames = round(s["seconds"] * tl["fps"])
        out.append({**s, "start": t, "dur": frames / tl["fps"]})
        t += frames / tl["fps"]
    return out, t


SHOTS, TOTAL = placed_shots()
N = int(SR * (TOTAL + 0.5))
mix = np.zeros((2, N), dtype=np.float32)


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def add(sig: np.ndarray, start: float, pan: float = 0.0, gain: float = 1.0):
    i0 = int(start * SR)
    if i0 >= N:
        return
    sig = sig[: N - i0] * gain
    a = (pan + 1) * np.pi / 4
    mix[0, i0:i0 + sig.size] += sig * np.cos(a)
    mix[1, i0:i0 + sig.size] += sig * np.sin(a)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(attack, 1e-3))
    tail = max(release, 1e-3)
    return (e * np.minimum(1.0, (n / SR - t) / tail)).astype(np.float32)


def tone(freq: float, dur: float, harmonics=((1, 1.0),), detune=0.0015, vib=0.07):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros(t.size)
    for h, amp in harmonics:
        d = 1 + detune * np.sin(2 * np.pi * vib * h * t + h)
        s += amp * np.sin(2 * np.pi * freq * h * d * t + rng.uniform(0, 6.28))
    return s.astype(np.float32)


def drone(start: float, end: float, gain=0.20, opening=(0.2, 1.0)):
    dur = end - start
    t = np.arange(int(dur * SR)) / SR
    open_ = np.interp(t, [0, dur], opening)
    s = np.zeros(t.size)
    for m, amp in ((38, 1.0), (45, 0.5), (50, 0.3)):
        f0 = midi(m)
        for h in range(1, 7):
            level = amp / h ** 1.3 * (1 if h == 1 else open_ ** (0.6 * h))
            s += level * np.sin(2 * np.pi * f0 * h * (1 + 0.0015 * np.sin(2 * np.pi * 0.07 * h * t + h)) * t + rng.uniform(0, 6.28))
    add((s * envelope(t.size, 3.0, 3.5)).astype(np.float32), start, 0, gain)


def pad(start: float, dur: float, notes, gain=0.055, attack=2.2, release=2.6, pan=0.0):
    s = sum(tone(midi(m), dur, ((1, 0.5), (2, 0.14), (3, 0.06), (4, 0.03)), detune=0.002, vib=0.11) for m in notes)
    add(s * envelope(s.size, attack, release), start, pan, gain)


def bell(start: float, m: float, gain=0.13, pan=0.0, decay=2.6):
    f = midi(m)
    t = np.arange(int((decay * 3) * SR)) / SR
    mod = 2.2 * np.exp(-t / 1.2) * np.sin(2 * np.pi * f * 3.5 * t)
    s = np.exp(-t / decay) * np.sin(2 * np.pi * f * t + mod)
    add(s.astype(np.float32), start, pan, gain)


def pluck(start: float, m: float, gain=0.05, pan=0.0):
    f = midi(m)
    t = np.arange(int(1.4 * SR)) / SR
    s = np.exp(-t / 0.35) * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.12))
    add(s.astype(np.float32), start, pan, gain)


def thump(start: float, gain=0.5):
    t = np.arange(int(0.9 * SR)) / SR
    f = 52 + 38 * np.exp(-t / 0.035)
    s = np.exp(-t / 0.16) * np.sin(2 * np.pi * np.cumsum(f) / SR)
    add(s.astype(np.float32), start, 0, gain)


def tick(start: float, gain=0.012):
    n = int(0.05 * SR)
    s = rng.normal(0, 1, n) * np.exp(-np.arange(n) / (n / 6))
    s = np.diff(s, prepend=0)  # bright, tiny
    add(s.astype(np.float32), start, rng.uniform(-0.4, 0.4), gain)


def crackle(start: float, end: float, rate: float, gain=0.05):
    for s0 in rng.uniform(start, end, int(rate * (end - start))):
        L = int(SR * rng.uniform(0.002, 0.012))
        b = rng.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.2, 1.0)
        add((np.diff(b, prepend=0) * 0.6 + b * 0.4).astype(np.float32), s0, rng.uniform(-0.7, 0.7), gain)


def riser(start: float, end: float, gain=0.5):
    n = int((end - start) * SR)
    noise = rng.normal(0, 1, n)
    k = np.linspace(400, 10, n).astype(int)
    c = np.cumsum(np.insert(noise, 0, 0))
    idx = np.arange(n)
    lo = np.clip(idx - k, 0, None)
    s = (c[idx + 1] - c[lo]) / (idx + 1 - lo) * np.linspace(0, 1, n) ** 2.2
    add(s.astype(np.float32), start, 0, gain)


D_MINOR = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]          # Dm  Bb  F  C
BRIGHT = [[53, 57, 60, 65], [48, 52, 55, 64], [50, 53, 57, 62], [46, 50, 53, 58]]  # F  C  Dm Bb
CUT_BELLS = [69, 65, 74, 72, 69, 62]

by_id = {s["id"]: s for s in SHOTS}
cold = by_id["cold"]
kiro = [s for s in SHOTS if s["kind"] == "kiro"]
night = by_id.get("night")
end = by_id["end"]
product_start = cold["start"] + cold["dur"]
kiro_start = kiro[0]["start"] if kiro else (night or end)["start"]
night_start = (night or end)["start"]

# ---- cold open (times match ColdOpen.tsx)
c0 = cold["start"]
drone(c0, c0 + 31.0, 0.22, (0.15, 1.0))
crackle(c0 + 0.5, c0 + 8.4, 2.5, 0.03)
crackle(c0 + 8.6, c0 + 12.0, 22, 0.05)          # ignition
crackle(c0 + 12.0, c0 + 29.5, 6, 0.04)
for at, m, p in ((8.6, 69, -0.3), (10.8, 65, 0.2), (13.0, 74, 0.0), (14.5, 69, 0.3), (17.2, 65, -0.2)):
    bell(c0 + at, m, 0.14, p)
pad(c0 + 12.0, 14.5, [50, 53, 57, 62], 0.06)
for k in range(4):                               # heartbeat with the pulsing puskesmas rings
    at = c0 + 23.0 + 1.6 * k
    if at < c0 + 25.6:
        thump(at, 0.42)
        thump(at + 0.28, 0.25)
riser(c0 + 25.4, c0 + 29.4, 0.5)
crackle(c0 + 25.4, c0 + 29.4, 40, 0.06)          # the burn
thump(c0 + 29.4, 0.95)
bell(c0 + 29.45, 50, 0.16)

# ---- the product: pulse + progression + a bell on each cut
beat = 1.6
t = product_start
while t < night_start - 0.1:
    thump(t, 0.20 if t < kiro_start else 0.17)
    tick(t + 0.8)
    t += beat
chord_len = 6.4
i = 0
t = product_start
while t < kiro_start - 0.5:
    dur = min(chord_len + 1.2, kiro_start - t + 1.5)
    pad(t, dur, D_MINOR[i % 4], 0.05, attack=1.6, release=2.2, pan=-0.1 if i % 2 else 0.1)
    add(tone(midi(D_MINOR[i % 4][0] - 12), dur, ((1, 0.6), (2, 0.2))) * envelope(int(dur * SR), 1.0, 2.0), t, 0, 0.05)
    t += chord_len
    i += 1
for j, s in enumerate([s for s in SHOTS if s["start"] >= product_start - 0.01 and s["kind"] in ("app", "kiro")]):
    bell(s["start"], CUT_BELLS[j % len(CUT_BELLS)], 0.07, 0.25 if j % 2 else -0.25, 1.8)

# ---- Kiro: brighter chords and a quiet arpeggio
t = kiro_start
i = 0
while t < night_start - 0.3:
    dur = min(4.8 + 1.0, night_start - t + 1.2)
    pad(t, dur, BRIGHT[i % 4], 0.05, attack=1.0, release=1.8)
    for k in range(12):
        at = t + k * 0.4
        if at < night_start - 0.2:
            pluck(at, BRIGHT[i % 4][k % 4] + 12, 0.035, 0.3 if k % 2 else -0.3)
    t += 4.8
    i += 1

# ---- night and end
drone(night_start - 0.5, TOTAL + 0.4, 0.18, (0.6, 0.3))
pad(night_start, TOTAL - night_start + 0.4, [50, 57, 62, 65], 0.05, attack=1.5, release=3.0)
thump(end["start"] + 0.15, 0.8)
for m, p in ((62, -0.2), (69, 0.2), (74, 0.0)):
    bell(end["start"] + 0.2, m, 0.10, p, 3.2)
crackle(end["start"], TOTAL, 4, 0.03)


def reverb(x: np.ndarray, seconds=2.6, mix_=0.30) -> np.ndarray:
    L = int(SR * seconds)
    ir = rng.normal(0, 1, (2, L)) * np.exp(-np.arange(L) / (SR * seconds / 6.5))
    ir[:, : int(0.012 * SR)] = 0
    n = 1 << int(np.ceil(np.log2(x.shape[1] + L)))
    wet = np.stack([np.fft.irfft(np.fft.rfft(x[c], n) * np.fft.rfft(ir[c], n), n)[: x.shape[1]] for c in range(2)])
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = x / (np.max(np.abs(x)) + 1e-9)
    return ((1 - mix_) * dry + mix_ * wet).astype(np.float32)


out = reverb(mix)
fade = np.ones(N, dtype=np.float32)
fn = int(1.2 * SR)
fade[-fn:] = np.linspace(1, 0, fn)
out *= fade
out = np.tanh(out * 1.1) / np.tanh(1.1)
dst = HERE / "public" / "audio"
dst.mkdir(parents=True, exist_ok=True)
raw = dst / "score-raw.wav"
with wave.open(str(raw), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out.T, -1, 1) * 32767).astype("<i2").tobytes())
ff = shutil.which("ffmpeg")
final = dst / "score.wav"
if ff:
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9",
                    "-ar", str(SR), "-c:a", "pcm_s16le", str(final)], check=True)
    raw.unlink()
else:
    raw.replace(final)
print(f"score: {TOTAL:.1f} s, cuts at {[round(s['start'], 1) for s in SHOTS]}, product {product_start:.1f}, kiro {kiro_start:.1f}, night {night_start:.1f} -> {final}")
