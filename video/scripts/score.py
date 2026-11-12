"""'Ember': the original score and sound design of the Sootsayer demo, synthesised.

numpy only: no samples, no third-party recordings, so nothing can carry a
copyright claim. Every cue is read from the video's own timeline
(src/timeline.json + src/clips.generated.json), placed exactly as the
composition places the shots, so sounds land on the picture.

Sound rules (after video-shotcraft's sound-design notes and onetake's
"sound in one room"): the music is a bed, the effects follow only what the
picture really does, nothing repeats like a machine gun, the music ducks under
the few big hits, and everything shares one room (one reverb).

  music   low D drone, a dark pad that opens with the dusk, a slow pulse under
          the product, brighter chords for Kiro, the drone again at the end.
  effects charcoal scratching while the map and the words draw themselves;
          fire crackle at the ignition and in every burn; a heartbeat under
          "who is coming?"; a riser and one big hit at the reveal; soft air
          whooshes on the four real camera flights; a quiet click on each
          recorded click; one hit on +88%; a slam and a burn on each chapter
          card; three stamps for the hooks' catches; riser and hit on the title.
  no      bells, chimes, synth blips, per-cut stingers.

  uv run --no-project --python 3.12 --with numpy python scripts/score.py
Output: public/audio/score.wav (48 kHz, 16-bit stereo, -16 LUFS integrated via
ffmpeg loudnorm when ffmpeg is on PATH).
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
LEAD = 4.5          # Demo.tsx: the fly-in starts this long under the cold open
XFADE = 9 / 30      # Demo.tsx: later shots push in over this
CARD_WRITE = (0.2, 1.0)    # BurnCard.tsx CARD
CARD_BURN = (1.6, 2.55)

# ---------------------------------------------------------------- timeline
tl = json.loads((HERE / "src" / "timeline.json").read_text(encoding="utf-8"))
FPS = tl["fps"]
clips_file = HERE / "src" / "clips.generated.json"
CLIPS = json.loads(clips_file.read_text(encoding="utf-8")) if clips_file.exists() else {}

shots, t = [], 0.0
for s in tl["shots"]:
    if s.get("optional") and s.get("clip") not in CLIPS:
        continue
    frames = round(s["seconds"] * FPS)
    shots.append({**s, "start": t, "dur": frames / FPS})
    t += frames / FPS
TOTAL = t
for i, s in enumerate(shots):
    after_cold = i > 0 and shots[i - 1]["kind"] == "cold"
    card = bool(s.get("chapter") and not s.get("label") and s["kind"] != "cold")
    s["card"] = card
    s["lead"] = LEAD if after_cold else (XFADE if i > 0 and not card else 0.0)


def clip_to_video(s: dict, clip_t: float) -> float:
    """Video time at which clip time `clip_t` is on screen (AppShot.tsx's trimBefore / playbackRate)."""
    rate = s.get("rate", 1.0)
    lead_f = round(s["lead"] * FPS)
    trim = max(0, round((s.get("from", 0.0) - (lead_f / FPS) * rate) * FPS))
    return s["start"] - lead_f / FPS + (clip_t - trim / FPS) / rate


by_id = {s["id"]: s for s in shots}
kiro = [s for s in shots if s["kind"] == "kiro"]
night = by_id.get("night")
end = by_id["end"]
product_start = by_id["cold"]["start"] + by_id["cold"]["dur"]
kiro_start = kiro[0]["start"] if kiro else (night or end)["start"]
night_start = (night or end)["start"]

N = int(SR * (TOTAL + 0.6))
music = np.zeros((2, N), dtype=np.float32)
sfx = np.zeros((2, N), dtype=np.float32)
ducks: list[tuple[float, float]] = []  # (time, depth in dB)


def add(bus: np.ndarray, sig: np.ndarray, start: float, pan: float = 0.0, gain: float = 1.0):
    i0 = int(round(start * SR))
    if i0 < 0:
        sig, i0 = sig[-i0:], 0
    if i0 >= N or sig.size == 0:
        return
    sig = sig[: N - i0] * gain
    a = (pan + 1) * np.pi / 4
    bus[0, i0:i0 + sig.size] += sig * np.cos(a)
    bus[1, i0:i0 + sig.size] += sig * np.sin(a)


def env(n: int, attack: float, release: float) -> np.ndarray:
    t = np.arange(n) / SR
    return (np.minimum(1.0, t / max(attack, 1e-3)) * np.clip((n / SR - t) / max(release, 1e-3), 0, 1)).astype(np.float32)


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def band_noise(n: int, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(rng.normal(0, 1, n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= np.exp(-0.5 * ((np.log(np.maximum(f, 1)) - np.log(np.sqrt(lo * hi))) / (np.log(hi / lo) / 2.5)) ** 2)
    out = np.fft.irfft(spec, n)
    return (out / (np.max(np.abs(out)) + 1e-9)).astype(np.float32)


# ---------------------------------------------------------------- music
def drone(start, stop, gain, opening=(0.2, 1.0)):
    dur = stop - start
    t = np.arange(int(dur * SR)) / SR
    open_ = np.interp(t, [0, dur], opening)
    s = np.zeros(t.size)
    for m, amp in ((38, 1.0), (45, 0.5), (50, 0.28)):
        f0 = midi(m)
        for h in range(1, 7):
            level = amp / h ** 1.3 * (1 if h == 1 else open_ ** (0.6 * h))
            s += level * np.sin(2 * np.pi * f0 * h * (1 + 0.0015 * np.sin(2 * np.pi * 0.07 * h * t + h)) * t + rng.uniform(0, 6.28))
    add(music, (s * env(t.size, 3.0, 3.5)).astype(np.float32), start, 0, gain)


def pad(start, dur, notes, gain, attack=2.0, release=2.4, pan=0.0):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros(t.size)
    for m in notes:
        f = midi(m)
        for h, amp in ((1, 0.5), (2, 0.12), (3, 0.05)):
            s += amp * np.sin(2 * np.pi * f * h * (1 + 0.002 * np.sin(2 * np.pi * 0.11 * t + m)) * t + rng.uniform(0, 6.28))
    add(music, (s * env(t.size, attack, release)).astype(np.float32), start, pan, gain)


def rub(start, dur, gain):
    """A low semitone rub (D2 against Eb2) swelling slowly: the dread under the dusk."""
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * midi(38) * t) + 0.8 * np.sin(2 * np.pi * midi(39) * t + 1.0)
    s *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.09 * t) ** 2
    add(music, (s * env(t.size, dur * 0.6, dur * 0.35)).astype(np.float32), start, 0, gain)


def pulse(start, gain):
    t = np.arange(int(0.7 * SR)) / SR
    f = 48 + 30 * np.exp(-t / 0.03)
    add(music, (np.exp(-t / 0.13) * np.sin(2 * np.pi * np.cumsum(f) / SR)).astype(np.float32), start, 0, gain)


def bass(start, m, dur, gain):
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * midi(m) * t) + 0.25 * np.sin(2 * np.pi * 2 * midi(m) * t)
    add(music, (s * env(t.size, 0.04, dur * 0.8)).astype(np.float32), start, 0, gain)


def pluck(start, m, gain, pan):
    t = np.arange(int(1.2 * SR)) / SR
    s = np.exp(-t / 0.3) * (np.sin(2 * np.pi * midi(m) * t) + 0.2 * np.sin(4 * np.pi * midi(m) * t) * np.exp(-t / 0.1))
    add(music, s.astype(np.float32), start, pan, gain)


# ---------------------------------------------------------------- effects
def scratch(start, dur, gain, density=9.0):
    """Charcoal on paper: short gritty strokes of band-passed noise."""
    n = int(dur * SR)
    grit = band_noise(n, 1500, 6500) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * rng.uniform(35, 60) * np.arange(n) / SR)))
    e = np.zeros(n, dtype=np.float32)
    for s0 in np.sort(rng.uniform(0, dur, int(density * dur) + 1)):
        L = int(SR * rng.uniform(0.06, 0.2))
        i = int(s0 * SR)
        if i + L > n:
            L = n - i
        if L <= 8:
            continue
        e[i:i + L] = np.maximum(e[i:i + L], env(L, 0.012, 0.05) * rng.uniform(0.5, 1.0))
    add(sfx, grit * e * env(n, 0.05, 0.15), start, rng.uniform(-0.3, 0.3), gain)


def crackle(start, stop, rate, gain):
    for s0 in rng.uniform(start, stop, int(rate * (stop - start))):
        L = int(SR * rng.uniform(0.002, 0.012))
        b = rng.normal(0, 1, L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.2, 1.0)
        add(sfx, (np.diff(b, prepend=0) * 0.6 + b * 0.4).astype(np.float32), s0, rng.uniform(-0.7, 0.7), gain)


def fire_bed(start, dur, gain):
    """The roar of a burning page: low band noise that swells and dies."""
    n = int(dur * SR)
    s = band_noise(n, 120, 900) * env(n, dur * 0.45, dur * 0.4)
    add(sfx, s, start, 0, gain)


def impact(at, gain, sub=True, duck_db=6.0):
    t = np.arange(int(2.4 * SR)) / SR
    f = 50 + 42 * np.exp(-t / 0.04)
    body = np.exp(-t / 0.2) * np.sin(2 * np.pi * np.cumsum(f) / SR)
    crack = band_noise(t.size, 200, 2500) * np.exp(-t / 0.03) * 0.5
    tail = (np.exp(-t / 0.9) * np.sin(2 * np.pi * 38 * t) * 0.6) if sub else 0
    add(sfx, (body + crack + tail).astype(np.float32), at, 0, gain)
    ducks.append((at, duck_db))


def heartbeat(at, gain):
    for off, g in ((0.0, 1.0), (0.28, 0.6)):
        t = np.arange(int(0.6 * SR)) / SR
        f = 52 + 38 * np.exp(-t / 0.035)
        add(sfx, (np.exp(-t / 0.16) * np.sin(2 * np.pi * np.cumsum(f) / SR)).astype(np.float32), at + off, 0, gain * g)


def riser(start, stop, gain):
    n = int((stop - start) * SR)
    noise = rng.normal(0, 1, n)
    k = np.linspace(400, 10, n).astype(int)
    c = np.cumsum(np.insert(noise, 0, 0))
    idx = np.arange(n)
    lo = np.clip(idx - k, 0, None)
    s = (c[idx + 1] - c[lo]) / (idx + 1 - lo) * np.linspace(0, 1, n) ** 2.2
    add(sfx, s.astype(np.float32), start, 0, gain)


def whoosh(start, dur, gain, pan=0.0):
    """Air past the lens: band noise whose centre rises and falls with the camera's speed."""
    n = int(dur * SR)
    hop, win = 512, 2048
    noise = rng.normal(0, 1, n + win)
    out = np.zeros(n + win)
    w = np.hanning(win)
    f = np.fft.rfftfreq(win, 1 / SR)
    for i in range(0, n, hop):
        p = i / max(n - 1, 1)
        speed = np.sin(np.pi * p) ** 1.5  # an eased camera move: fastest in the middle
        fc = 250 + 1600 * speed
        spec = np.fft.rfft(noise[i:i + win] * w)
        spec *= np.exp(-0.5 * ((np.log(np.maximum(f, 1)) - np.log(fc)) / 0.55) ** 2)
        out[i:i + win] += np.fft.irfft(spec, win) * w * speed
    out = out[:n]
    out /= np.max(np.abs(out)) + 1e-9
    add(sfx, out.astype(np.float32), start, pan, gain)


def click(at, gain):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    s = band_noise(n, 2000, 8000) * np.exp(-t / 0.002) + 0.5 * np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.012)
    add(sfx, s.astype(np.float32), at, 0.1, gain)


def stamp(at, gain):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.06) + band_noise(n, 600, 2400) * np.exp(-t / 0.018) * 0.7
    add(sfx, s.astype(np.float32), at, 0.15, gain)


# ================================================================ cold open
c0 = by_id["cold"]["start"]
drone(c0, c0 + 31.0, 0.10, (0.15, 1.0))
scratch(c0 + 0.3, 7.2, 0.035, density=7)              # the map draws itself
for at, dur in ((0.9, 0.9), (8.6, 0.8), (9.2, 0.9), (14.5, 0.9), (15.0, 1.0), (20.5, 0.8), (21.4, 0.8), (22.8, 1.0)):
    scratch(c0 + at, dur, 0.05, density=12)           # each hand-lettered line
crackle(c0 + 0.5, c0 + 8.4, 2.0, 0.025)
impact(c0 + 8.6, 0.32, sub=False, duck_db=2.0)        # ignition: a soft low whoomp
crackle(c0 + 8.6, c0 + 12.0, 20, 0.05)
crackle(c0 + 12.0, c0 + 25.4, 5, 0.035)
pad(c0 + 12.0, 14.5, [50, 53, 57, 64], 0.05)          # the page darkens
rub(c0 + 12.5, 13.0, 0.04)
for k in range(2):                                    # heartbeat with the pulsing puskesmas
    heartbeat(c0 + 23.0 + 1.6 * k, 0.4)
riser(c0 + 25.4, c0 + 29.4, 0.45)
crackle(c0 + 25.4, c0 + 29.4, 38, 0.06)               # the burn
fire_bed(c0 + 25.4, 4.4, 0.10)
impact(c0 + 29.4, 0.8)                               # the reveal

# ================================================================ the product
beat, t = 1.6, product_start
while t < night_start - 0.1:
    pulse(t, 0.16 if t < kiro_start else 0.13)
    t += beat
D_MINOR = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]  # Dm Bb F C
i, t = 0, product_start
while t < kiro_start - 0.5:
    dur = min(6.4 + 1.2, kiro_start - t + 1.5)
    pad(t, dur, D_MINOR[i % 4], 0.06, attack=1.6, release=2.2, pan=-0.1 if i % 2 else 0.1)
    for k in range(8):
        at = t + k * 0.8
        if at < kiro_start - 0.2:
            bass(at, D_MINOR[i % 4][0] - 12, 0.7, 0.045)
    t += 6.4
    i += 1

# camera flights, as the clips recorded them (MapLibre durations in web/src/map.ts)
FLIGHTS = {"globe-flyin": [(6.0, 6.5)], "district": [(0.8, 2.6)], "puskesmas": [(0.8, 2.4)], "sumatra": [(0.7, 3.5)]}
for s in shots:
    if s["kind"] != "app" or s.get("clip") not in CLIPS:
        continue
    for c in CLIPS[s["clip"]].get("clicks", []):
        at = clip_to_video(s, c["t"])
        if s["start"] - s["lead"] <= at <= s["start"] + s["dur"]:
            click(at, 0.10)
    for t0, dur in FLIGHTS.get(s["clip"], []):
        whoosh(clip_to_video(s, t0), dur / s.get("rate", 1.0), 0.09 if dur > 3 else 0.06, pan=-0.2)
    for cap in s.get("captions", []):
        if cap.get("hit"):
            impact(s["start"] + cap["at"] + 0.85, 0.42, sub=True, duck_db=6.0)

# chapter cards: slam to black, the title writes itself, then it burns away
for s in shots:
    if not s["card"]:
        continue
    impact(s["start"], 0.45, sub=True, duck_db=7.0)
    scratch(s["start"] + CARD_WRITE[0], CARD_WRITE[1] - CARD_WRITE[0], 0.05, density=14)
    crackle(s["start"] + CARD_BURN[0] - 0.2, s["start"] + CARD_BURN[1] + 0.3, 34, 0.055)
    fire_bed(s["start"] + CARD_BURN[0] - 0.2, CARD_BURN[1] - CARD_BURN[0] + 0.6, 0.09)
    riser(s["start"] - 1.6, s["start"] - 0.02, 0.22)

# ================================================================ Kiro
BRIGHT = [[53, 57, 60, 65], [48, 52, 55, 64], [50, 53, 57, 62], [46, 50, 53, 58]]  # F C Dm Bb
i, t = 0, kiro_start
while t < night_start - 0.3:
    dur = min(4.8 + 1.0, night_start - t + 1.2)
    pad(t, dur, BRIGHT[i % 4], 0.055, attack=1.0, release=1.8)
    for k in range(6):
        at = t + k * 0.8
        if kiro_start + 2.6 < at < night_start - 0.2:
            pluck(at, BRIGHT[i % 4][k % 4] + 12, 0.02, 0.3 if k % 2 else -0.3)
    t += 4.8
    i += 1
hooks = by_id.get("kiro-hooks")
if hooks:
    for st in hooks.get("stamps", []):
        stamp(hooks["start"] + st, 0.22)

# ================================================================ night, end
drone(night_start - 0.5, TOTAL + 0.5, 0.08, (0.6, 0.3))
pad(night_start, TOTAL - night_start + 0.5, [50, 57, 62, 65], 0.045, attack=1.5, release=3.0)
riser(end["start"] - 2.0, end["start"] + 0.2, 0.3)
impact(end["start"] + 0.25, 0.6)
crackle(end["start"], TOTAL, 4, 0.025)


# ================================================================ mix: one room
def reverb(x: np.ndarray, seconds: float) -> np.ndarray:
    L = int(SR * seconds)
    ir = rng.normal(0, 1, (2, L)) * np.exp(-np.arange(L) / (SR * seconds / 6.5))
    ir[:, : int(0.012 * SR)] = 0
    n = 1 << int(np.ceil(np.log2(x.shape[1] + L)))
    wet = np.stack([np.fft.irfft(np.fft.rfft(x[c], n) * np.fft.rfft(ir[c], n), n)[: x.shape[1]] for c in range(2)])
    return (wet / (np.sqrt(L) + 1e-9)).astype(np.float32)


duck = np.ones(N, dtype=np.float32)
tt = np.arange(N) / SR
for at, db in ducks:
    g = 10 ** (-db / 20)
    shape = np.interp(tt, [at - 0.05, at + 0.05, at + 0.25, at + 1.1], [1, g, g, 1], left=1, right=1)
    duck = np.minimum(duck, shape.astype(np.float32))
music *= duck
room = reverb(music + sfx * 0.5, 2.6)
mix = music + sfx + room * 0.9
fade = np.ones(N, dtype=np.float32)
fade[-int(1.2 * SR):] = np.linspace(1, 0, int(1.2 * SR))
mix *= fade
mix /= np.max(np.abs(mix)) + 1e-9
mix = (np.tanh(mix * 1.05) / np.tanh(1.05)).astype(np.float32)

dst = HERE / "public" / "audio"
dst.mkdir(parents=True, exist_ok=True)
raw = dst / "score-raw.wav"
with wave.open(str(raw), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype("<i2").tobytes())
ff = shutil.which("ffmpeg")
final = dst / "score.wav"
if ff:
    # two-pass loudnorm in linear mode: one gain for the whole film, so the
    # quiet opening stays quiet and the hits keep their size
    probe = subprocess.run([ff, "-hide_banner", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=20:print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True, check=True).stderr
    m = json.loads(probe[probe.rindex("{"):probe.rindex("}") + 1])
    af = (f"loudnorm=I=-16:TP=-1.5:LRA=20:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
          f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}")
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", af, "-ar", str(SR), "-c:a", "pcm_s16le", str(final)], check=True)
    raw.unlink()
else:
    raw.replace(final)
print(f"score: {TOTAL:.1f} s; cuts {[round(s['start'], 1) for s in shots]}; cards at {[round(s['start'], 1) for s in shots if s['card']]}; "
      f"hits {len(ducks)}; -> {final}")
