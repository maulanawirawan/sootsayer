"""Which haze-day chance model applies, shared by the pipeline and the MCP
server. Mirrors chanceModelFor() in web/src/data.ts.

- live: the model trained on all of October 2026, applied by analogy;
- replay as forecast: the fold model that did not see that issue week;
- replay in hindsight: none (the window values are not a forecast).
"""

from __future__ import annotations

import json
from functools import lru_cache

from . import region

FILE = "chance-2026-10.json"


@lru_cache(maxsize=8)
def load(region_id: str) -> dict | None:
    path = region(region_id).data_dir / FILE
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def engine_model(m: dict) -> dict:
    """Only the fields the engine accepts."""
    return {"id": m["id"], "coefficients": m["coefficients"]}


def model_for(region_id: str, mode: str, window_start: str) -> dict | None:
    f = load(region_id)
    if f is None or mode == "replay":
        return None
    if mode == "live":
        return engine_model(f["final"])
    if mode == "forecast":
        for fold in f["folds"]:
            first, last = fold["issue_dates"]
            if first <= window_start <= last:
                return engine_model(fold)
        return None
    raise ValueError(f"unknown mode '{mode}'")
