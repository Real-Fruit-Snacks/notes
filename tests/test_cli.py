"""Tests for the build.py CLI helpers."""
from __future__ import annotations

import build


def test_dev_server_reuses_address():
    # Without SO_REUSEADDR, restarting --serve fails with EADDRINUSE for ~60s
    # while the old socket sits in TIME_WAIT. This guards against that regression.
    assert build._ReusableServer.allow_reuse_address is True


def test_parse_args_defaults():
    args = build.parse_args(["--vault", "vault"])
    assert args.port == 8000
    assert args.base_url == "/"
    assert args.serve is False
