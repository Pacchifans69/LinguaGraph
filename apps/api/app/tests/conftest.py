"""Shared pytest fixtures."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client() -> TestClient:
    """TestClient against a fresh application instance (no DB dependency)."""
    return TestClient(create_app())
