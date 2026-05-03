"""Composio test fixtures.

Provides mocking infrastructure for Gmail custom tool tests.
No real API credentials or network calls are made.
"""

from typing import Any, Dict
from unittest.mock import MagicMock

import pytest


def pytest_collection_modifyitems(config, items):
    for item in items:
        if "composio" in str(item.fspath):
            item.add_marker(pytest.mark.composio)


# ---------------------------------------------------------------------------
# Fake credential fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_gmail_credentials() -> Dict[str, Any]:
    """Auth credentials shape Composio passes into custom tools post-migration.

    Composio no longer returns OAuth `access_token` in connected-account
    credentials. The patched `CustomTool.__call__` injects only `user_id`,
    and tools route provider requests through `proxy_request_sync`.
    """
    return {"user_id": "test_user_123"}


# ---------------------------------------------------------------------------
# Composio mock client (for tool registration)
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_composio_client():
    """
    Minimal mock of the Composio SDK client.

    The @composio.tools.custom_tool(toolkit=...) decorator is called during
    register_gmail_custom_tools().  We capture each registered function so
    tests can invoke it directly.
    """
    registered_tools: Dict[str, Any] = {}

    def custom_tool_decorator(toolkit: str):
        """Simulate @composio.tools.custom_tool(toolkit=...)."""

        def decorator(fn):
            # Store tool indexed by its function name so tests can look it up
            registered_tools[fn.__name__] = fn
            return fn

        return decorator

    composio = MagicMock()
    composio.tools.custom_tool.side_effect = custom_tool_decorator
    composio._registered_tools = registered_tools
    return composio
