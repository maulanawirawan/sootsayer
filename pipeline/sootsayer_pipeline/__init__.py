"""Sootsayer data pipeline: open sources in, static JSON for the web app out."""

from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WEB_DATA = REPO / "web" / "public" / "data"
CACHE = REPO / "pipeline" / ".cache"

# Indonesian Kalimantan, with a small margin. [west, south, east, north]
KALIMANTAN_BBOX = (108.6, -4.3, 119.2, 4.4)

# The five Kalimantan provinces: geoBoundaries IDN ADM1 shapeISO -> (short code, name).
KALIMANTAN_PROVINCES = {
    "ID-KB": ("KB", "Kalimantan Barat"),
    "ID-KT": ("KT", "Kalimantan Tengah"),
    "ID-KS": ("KS", "Kalimantan Selatan"),
    "ID-KI": ("KI", "Kalimantan Timur"),
    "ID-KU": ("KU", "Kalimantan Utara"),
}

# The nine cities (kota) of Kalimantan, as named in geoBoundaries IDN ADM2.
# An explicit list, because "Kota Baru" in that file is Kotabaru Regency.
KALIMANTAN_KOTA = frozenset({
    "Kota Pontianak",
    "Kota Singkawang",
    "Kota Palangka Raya",
    "Kota Banjarmasin",
    "Kota Banjar Baru",
    "Kota Balikpapan",
    "Kota Samarinda",
    "Kota Bontang",
    "Kota Tarakan",
})

# CAMS sampling grid: 0.4 degrees matches the native CAMS global resolution.
GRID_STEP_DEG = 0.4

USER_AGENT = "sootsayer-pipeline/0.1 (+https://github.com/maulanawirawan/sootsayer)"


def env(name: str) -> str:
    """A setting from the environment, or from REPO/.env (git-ignored).

    Keeps keys such as FIRMS_MAP_KEY out of the shell history and the repo.
    """
    import os

    value = os.environ.get(name, "").strip()
    if value:
        return value
    dotenv = REPO / ".env"
    if dotenv.exists():
        for line in dotenv.read_text(encoding="utf-8").splitlines():
            key, sep, val = line.partition("=")
            if sep and key.strip() == name:
                return val.strip().strip('"').strip("'")
    return ""
