"""Unit tests for app.services.workflow.execution_service — wide-event contract."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.workflow.execution_service import complete_execution, create_execution
from shared.py.wide_events import log

_MOD = "app.services.workflow.execution_service"


@pytest.mark.unit
class TestExecutionWideEventFields:
    @pytest.mark.regression
    async def test_completing_an_execution_keeps_the_trigger_type_the_caller_stamped(self):
        """`log.set(workflow={...})` REPLACES the namespace; only `set_ns` merges.

        The whole-dict write erased trigger_type from 34,247 of 34,413 production
        workflow fires, leaving no way to tell a scheduled fire from a webhook one.
        """
        log.reset()
        log.set_ns("workflow", id="wf_1", trigger_type="schedule", steps_count=3)

        with patch(
            f"{_MOD}.workflow_executions_repository.complete",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(workflow_id="wf_1", duration_seconds=1.5),
        ):
            assert await complete_execution(execution_id="exec_1", status="success") is True

        workflow = log.get()["workflow"]
        assert workflow["trigger_type"] == "schedule"
        assert workflow["steps_count"] == 3
        assert workflow["status"] == "success"
        assert workflow["duration_ms"] == 1500

    @pytest.mark.regression
    async def test_creating_an_execution_keeps_the_steps_count_the_caller_stamped(self):
        log.reset()
        log.set_ns("workflow", id="wf_1", steps_count=3)

        execution = SimpleNamespace(execution_id="exec_1")
        with patch(
            f"{_MOD}.workflow_executions_repository.create",
            new_callable=AsyncMock,
            return_value=execution,
        ):
            await create_execution(workflow_id="wf_1", user_id="u1", trigger_type="integration")

        workflow = log.get()["workflow"]
        assert workflow["steps_count"] == 3
        assert workflow["trigger_type"] == "integration"
        assert workflow["execution_id"] == "exec_1"
