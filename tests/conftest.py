"""Shared pytest fixtures."""
from __future__ import annotations

from pathlib import Path

import pytest

from obsidian_site.models import SiteConfig

FIXTURE_VAULT = Path(__file__).parent / "fixtures" / "vault"


@pytest.fixture
def vault_path() -> Path:
    return FIXTURE_VAULT


@pytest.fixture
def config(tmp_path, vault_path) -> SiteConfig:
    return SiteConfig(vault=vault_path, out=tmp_path / "dist", base_url="/myrepo/")
