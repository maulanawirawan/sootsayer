"""Sootsayer data pipeline: open sources in, static JSON for the web app out."""

from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WEB_DATA = REPO / "web" / "public" / "data"
CACHE = REPO / "pipeline" / ".cache"


@dataclass(frozen=True)
class Region:
    """A region pack: what the pipeline needs to build one area.

    Adding a region means adding one entry to REGIONS and running
    build_reference (and build_replay). The engine does not change.
    """

    id: str
    name: str
    #: [west, south, east, north] with a small margin. Also the CAMS grid
    #: origin: the grid starts at (west, north) in steps of GRID_STEP_DEG.
    bbox: tuple[float, float, float, float]
    #: geoBoundaries IDN ADM1 shapeISO -> (short code for district codes, province name).
    provinces: dict[str, tuple[str, str]]
    #: Cities (kota) as named in geoBoundaries IDN ADM2. An explicit list,
    #: because "Kota Baru" in that file is Kotabaru Regency.
    kota: frozenset[str]

    @property
    def data_dir(self) -> Path:
        return WEB_DATA / self.id


REGIONS: dict[str, Region] = {
    "kalimantan": Region(
        id="kalimantan",
        name="Kalimantan",
        bbox=(108.6, -4.3, 119.2, 4.4),
        provinces={
            "ID-KB": ("KB", "Kalimantan Barat"),
            "ID-KT": ("KT", "Kalimantan Tengah"),
            "ID-KS": ("KS", "Kalimantan Selatan"),
            "ID-KI": ("KI", "Kalimantan Timur"),
            "ID-KU": ("KU", "Kalimantan Utara"),
        },
        kota=frozenset({
            "Kota Pontianak",
            "Kota Singkawang",
            "Kota Palangka Raya",
            "Kota Banjarmasin",
            "Kota Banjar Baru",
            "Kota Balikpapan",
            "Kota Samarinda",
            "Kota Bontang",
            "Kota Tarakan",
        }),
    ),
    # Sumatra's peatland fire provinces. Kemenkes's 2026 karhutla ISPA reports
    # name Riau and Sumatera Selatan among the seven affected provinces; Jambi
    # is the third peatland province between them.
    "sumatra": Region(
        id="sumatra",
        name="Sumatra (Riau, Jambi, Sumatera Selatan)",
        bbox=(100.0, -5.0, 106.4, 2.8),
        provinces={
            "ID-RI": ("RI", "Riau"),
            "ID-JA": ("JA", "Jambi"),
            "ID-SS": ("SS", "Sumatera Selatan"),
        },
        kota=frozenset({
            "Kota Pekanbaru",
            "Kota Dumai",
            "Kota Jambi",
            "Kota Sungai Penuh",
            "Kota Palembang",
            "Kota Prabumulih",
            "Kota Pagar Alam",
            "Kota Lubuklinggau",
        }),
    ),
}
DEFAULT_REGION = "kalimantan"


def region(region_id: str) -> Region:
    try:
        return REGIONS[region_id]
    except KeyError:
        raise SystemExit(f"unknown region '{region_id}'; known: {', '.join(REGIONS)}") from None


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
