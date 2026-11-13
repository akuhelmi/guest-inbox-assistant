import os

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.triage.offline import OfflineTriager

# CI sets TEST_DATABASE_URL to a real Postgres; locally the tests use in-memory SQLite.
TEST_DB = os.environ.get("TEST_DATABASE_URL", "sqlite://")


def make_settings(**overrides) -> Settings:
    from app.config import normalize_db_url

    base = {"database_url": normalize_db_url(TEST_DB), "rate_limit_per_hour": 5}
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def client():
    app = create_app(make_settings(), triager=OfflineTriager())
    with TestClient(app) as c:
        yield c
    # Leave a clean database for the next test (matters on Postgres).
    from app.db import Base

    engine = app.state.engine
    Base.metadata.drop_all(engine)
    engine.dispose()
