"""Unit tests for the subscription-plan seed script.

Two behaviors decide whether a production run is safe: the script must not
rewrite a plan whose content already matches (so `--dry-run` predicts the real
run), and it must refuse to report success when the plan cache survives the
write (so the API cannot keep serving the previous prices).
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from scripts.payment_setup import (
    build_plan_catalogue,
    catalogue_fields,
    invalidate_plan_cache,
    reconcile_plan,
)


def _stored_document(plan, **overrides):
    """The catalogue plan as Mongo would hand it back, with an older timestamp."""
    stored = {
        "_id": "plan-id",
        **catalogue_fields(plan),
        "created_at": datetime(2020, 1, 1, tzinfo=UTC),
        "updated_at": datetime(2020, 1, 1, tzinfo=UTC),
    }
    stored.update(overrides)
    return stored


@pytest.mark.regression
async def test_reconcile_leaves_an_already_matching_plan_untouched() -> None:
    """A plan whose content matches is not rewritten just to move updated_at."""
    plan = build_plan_catalogue("monthly-id", "yearly-id")[1]
    collection = AsyncMock()
    collection.find_one.return_value = _stored_document(plan)

    outcome = await reconcile_plan(collection, plan, dry_run=False)

    assert outcome == "unchanged"
    collection.update_one.assert_not_awaited()


@pytest.mark.regression
async def test_dry_run_and_write_agree_on_whether_a_plan_changes() -> None:
    """Whatever the dry run reports for a plan, the real run must do."""
    plan = build_plan_catalogue("monthly-id", "yearly-id")[1]
    collection = AsyncMock()
    collection.find_one.return_value = _stored_document(plan)

    previewed = await reconcile_plan(collection, plan, dry_run=True)
    applied = await reconcile_plan(collection, plan, dry_run=False)

    assert previewed == applied


async def test_reconcile_updates_a_plan_whose_price_drifted() -> None:
    """A differing catalogue field is written, with a fresh updated_at."""
    plan = build_plan_catalogue("monthly-id", "yearly-id")[1]
    collection = AsyncMock()
    collection.find_one.return_value = _stored_document(plan, amount=plan.amount + 500)
    before = datetime.now(UTC) - timedelta(seconds=1)

    outcome = await reconcile_plan(collection, plan, dry_run=False)

    assert outcome == "updated"
    written = collection.update_one.await_args.args[1]["$set"]
    assert written["amount"] == plan.amount
    assert written["updated_at"] > before


async def test_reconcile_creates_a_missing_plan() -> None:
    """A plan with no stored counterpart is inserted."""
    plan = build_plan_catalogue("monthly-id", "yearly-id")[0]
    collection = AsyncMock()
    collection.find_one.return_value = None

    outcome = await reconcile_plan(collection, plan, dry_run=False)

    assert outcome == "created"
    collection.insert_one.assert_awaited_once()


async def test_dry_run_writes_nothing_for_a_missing_plan() -> None:
    """The preview of a create touches neither insert nor update."""
    plan = build_plan_catalogue("monthly-id", "yearly-id")[0]
    collection = AsyncMock()
    collection.find_one.return_value = None

    outcome = await reconcile_plan(collection, plan, dry_run=True)

    assert outcome == "created"
    collection.insert_one.assert_not_awaited()
    collection.update_one.assert_not_awaited()


@pytest.mark.regression
async def test_invalidate_plan_cache_raises_when_a_key_survives() -> None:
    """A cache the API still reads from must fail the run, not print success."""
    with patch("scripts.payment_setup.redis_cache.delete", AsyncMock(return_value=False)):
        with pytest.raises(RuntimeError, match="cache was not cleared"):
            await invalidate_plan_cache()


async def test_invalidate_plan_cache_passes_when_every_key_is_dropped() -> None:
    """All keys dropped is the success path."""
    with patch("scripts.payment_setup.redis_cache.delete", AsyncMock(return_value=True)):
        await invalidate_plan_cache()
