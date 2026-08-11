"""Pause the workflows of users who have stopped using GAIA, and resume them on return.

Nothing else deactivates a workflow on inactivity: the only automatic paths are
``mark_error`` (unrunnable) and ``set_steps`` (missing integration), neither of
which knows when a user was last seen. So a workflow armed months ago keeps
firing — burning LLM spend and delivering notifications nobody is reading.

Pausing goes through ``WorkflowService.deactivate_workflow`` rather than a bulk
write: that is the path that also unregisters the workflow's Composio triggers,
and an integration workflow whose webhook is still registered keeps firing no
matter what ``activated`` says.

Resume only ever touches workflows carrying ``DeactivationReason.USER_DORMANT``.
A workflow the user switched off themselves records no reason, so coming back
from dormancy can never silently re-enable something they deliberately disabled.
"""

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field

from app.constants.log_tags import LogTag
from app.db.repositories.users import user_repository
from app.db.repositories.workflows import workflow_repository
from app.models.workflow_models import DeactivationReason
from app.services.workflow.service import WorkflowService
from shared.py.wide_events import log

DORMANCY_THRESHOLD = timedelta(days=30)


class DormantUserWorkflows(BaseModel):
    """One dormant user and the workflows the sweep would pause for them."""

    user_id: str
    last_active_at: datetime | None
    workflow_ids: list[str]


class DormancySweepResult(BaseModel):
    dry_run: bool
    cutoff: datetime
    dormant_users: int
    workflows_paused: int
    failures: int
    candidates: list[DormantUserWorkflows] = Field(default_factory=list)


async def find_dormancy_candidates(
    *, threshold: timedelta = DORMANCY_THRESHOLD
) -> tuple[datetime, list[DormantUserWorkflows]]:
    """Dormant users that still own at least one activated workflow, with the
    cutoff the cohort was resolved against."""
    cutoff = datetime.now(UTC) - threshold
    candidates: list[DormantUserWorkflows] = []

    for user in await user_repository.find_dormant_since(cutoff):
        workflows = await workflow_repository.find_activated_for_user(user.id)
        if workflows:
            candidates.append(
                DormantUserWorkflows(
                    user_id=user.id,
                    last_active_at=user.last_active_at,
                    workflow_ids=[w.id for w in workflows],
                )
            )
    return cutoff, candidates


async def sweep_dormant_workflows(
    *, threshold: timedelta = DORMANCY_THRESHOLD, dry_run: bool = False
) -> DormancySweepResult:
    """Pause every activated workflow owned by a user dormant for ``threshold``.

    ``dry_run`` resolves the same cohort and reports it without writing anything.
    A single workflow that fails to pause (e.g. Composio unregistration errors)
    is counted and skipped rather than aborting the sweep for every other user.
    """
    cutoff, candidates = await find_dormancy_candidates(threshold=threshold)
    paused = 0
    failures = 0

    if not dry_run:
        for candidate in candidates:
            for workflow_id in candidate.workflow_ids:
                try:
                    await WorkflowService.deactivate_workflow(
                        workflow_id,
                        candidate.user_id,
                        reason=DeactivationReason.USER_DORMANT,
                    )
                    paused += 1
                except Exception as e:
                    failures += 1
                    log.warning(
                        f"{LogTag.WORKFLOW} Dormancy pause failed for workflow",
                        workflow_id=workflow_id,
                        user_id=candidate.user_id,
                        error=str(e),
                        error_type=type(e).__name__,
                    )

    return DormancySweepResult(
        dry_run=dry_run,
        cutoff=cutoff,
        dormant_users=len(candidates),
        workflows_paused=paused,
        failures=failures,
        candidates=candidates,
    )


async def resume_dormancy_paused_workflows(user_id: str) -> int:
    """Re-activate the workflows this sweep paused for ``user_id``. Returns the count
    resumed. A workflow whose integrations are no longer connected cannot be
    re-activated — it is left paused and logged rather than failing the others."""
    resumed = 0

    for workflow in await workflow_repository.find_paused_for_reason(
        user_id, DeactivationReason.USER_DORMANT
    ):
        try:
            await WorkflowService.activate_workflow(workflow.id, user_id)
            resumed += 1
        except Exception as e:
            log.warning(
                f"{LogTag.WORKFLOW} Dormancy resume skipped workflow",
                workflow_id=workflow.id,
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )

    if resumed:
        log.info(
            f"{LogTag.WORKFLOW} Resumed workflows paused for dormancy",
            user_id=user_id,
            resumed=resumed,
        )
    return resumed
