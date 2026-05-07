"""Shared pytest fixtures + ephemeral test password.

The literal-looking password values in this file (and any of the test_*.py
files) are intentionally throw-away values used only to register short-lived
TEST_user_<random>@example.com fixtures inside the test database. They are not
real secrets and never authenticate any real user. Override via
SNAPBURST_TEST_PASSWORD env var if your security scanner objects.
"""
import os
import uuid

# Per-process ephemeral test password.
TEST_PASSWORD = os.environ.get("SNAPBURST_TEST_PASSWORD") or (
    "Test_" + uuid.uuid4().hex[:12] + "!"
)  # noqa: S105
