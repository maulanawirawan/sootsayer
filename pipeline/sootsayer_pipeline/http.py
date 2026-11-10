"""Small HTTP helpers on the standard library, with retries and a cache."""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from . import CACHE, USER_AGENT


def fetch(url: str, *, data: bytes | None = None, timeout: int = 120, retries: int = 3,
          headers: dict[str, str] | None = None) -> bytes:
    """GET (or POST when `data` is given). Retries on network errors and 429/5xx."""
    hdrs = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if headers:
        hdrs.update(headers)
    last: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
        time.sleep(2 ** attempt * 3)
    raise RuntimeError(f"giving up on {url}: {last}")


def fetch_cached(url: str, *, suffix: str = "", **kw: Any) -> bytes:
    """Fetch once and keep the bytes in pipeline/.cache (raw source snapshots)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256((url + repr(kw.get("data"))).encode()).hexdigest()[:24]
    path = CACHE / f"{key}{suffix}"
    if path.exists():
        return path.read_bytes()
    body = fetch(url, **kw)
    path.write_bytes(body)
    return body


def fetch_json(url: str, **kw: Any) -> Any:
    return json.loads(fetch(url, **kw))


def overpass(query: str) -> Any:
    """Run an Overpass API query (POST form) and return the parsed JSON."""
    body = urllib.parse.urlencode({"data": query}).encode()
    raw = fetch_cached("https://overpass-api.de/api/interpreter", data=body, suffix=".json",
                       headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=300)
    return json.loads(raw)


def write_json(path: Path, obj: Any) -> int:
    """Write compact JSON; returns the size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode())
