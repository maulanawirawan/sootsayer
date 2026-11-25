"""Starts the Sootsayer MCP server (stdio) from a local clone of the repository.

Kiro Crew copies an installed app into its own folder, so the clone is found
through the SOOTSAYER_REPO environment variable. Standard library only: this
runs under Kiro Crew's own Python and hands stdin/stdout to the real server,
which runs in the clone's uv project (mcp-server/).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def fail(msg: str) -> None:
    # stderr only: stdout belongs to the MCP protocol.
    print(f"sootsayer-morning-brief: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    repo = os.environ.get("SOOTSAYER_REPO", "").strip()
    if not repo:
        fail("set SOOTSAYER_REPO to your clone of https://github.com/maulanawirawan/sootsayer and restart Kiro Crew")
    root = Path(repo).expanduser()
    server = root / "mcp-server" / "server.py"
    if not server.is_file():
        fail(f"no mcp-server/server.py under SOOTSAYER_REPO={root}")
    exe = "sootsayer.exe" if os.name == "nt" else "sootsayer"
    if not (root / "engine" / "target" / "release" / exe).is_file():
        fail("build the engine once: cargo build --release --manifest-path engine/Cargo.toml")
    uv = shutil.which("uv")
    if not uv:
        fail("uv is not on PATH (https://docs.astral.sh/uv/)")
    # Inherited stdin/stdout: the MCP client talks to the server directly.
    code = subprocess.call([uv, "run", "--quiet", "--project", str(root / "mcp-server"), "python", str(server)], cwd=str(root))
    sys.exit(code)


if __name__ == "__main__":
    main()
