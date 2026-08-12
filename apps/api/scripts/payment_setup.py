#!/usr/bin/env python3
# mypy: ignore-errors
"""
Complete Payment setup script for GAIA.
This script sets up subscription plans in the database using Dodo product IDs.

IMPORTANT: Run this script from the correct directory!

1. If running locally:
    cd /path/to/your/gaia/apps/api
    python scripts/payment_setup.py --monthly-product-id <id> --yearly-product-id <id>

2. If running inside Docker container:
    cd /app
    python scripts/payment_setup.py --monthly-product-id <id> --yearly-product-id <id>

3. Alternative Docker approach (set PYTHONPATH):
    PYTHONPATH=/app python scripts/payment_setup.py --monthly-product-id <id> --yearly-product-id <id>

4. Run as module (from app directory):
    python -m scripts.payment_setup --monthly-product-id <id> --yearly-product-id <id>

Prerequisites:
- DODO_PAYMENTS_API_KEY must be available in Infisical secrets or as an environment variable.
  - The script will first attempt to fetch DODO_PAYMENTS_API_KEY from Infisical (if configured),
     and fallback to the environment variable or settings if not found.
- MongoDB connection string (MONGO_DB) must be configured
- Have your Dodo product IDs ready from your Dodo Payments dashboard

Usage:
     python payment_setup.py --monthly-product-id <product_id> --yearly-product-id <product_id>

Example:
     python payment_setup.py --monthly-product-id "xyz" --yearly-product-id "xyz"
"""

import argparse
import asyncio
from datetime import UTC, datetime
import os
from pathlib import Path
import sys

# Ensure Infisical secrets are injected before importing settings
try:
    from app.config.secrets import inject_infisical_secrets

    inject_infisical_secrets()
    # Presence only — this script is run against production, so its stdout must
    # never carry the machine-identity credentials or the Dodo API key.
    print(f"[DEBUG] ENV: {os.environ.get('ENV')}")
    for key in ("INFISICAL_PROJECT_ID", "DODO_PAYMENTS_API_KEY"):
        print(f"[DEBUG] {key}: {'present' if os.environ.get(key) else 'MISSING'} after injection")
except Exception as e:
    print(f"[WARN] Could not inject Infisical secrets: {e}")

# Add the backend directory to Python path so we can import from app
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))


from motor.motor_asyncio import AsyncIOMotorClient

from app.config.settings import settings
from app.constants.cache import PLANS_CACHE_KEYS
from app.constants.memory import FREE_MEMORY_FACT_LIMIT
from app.db.redis import redis_cache
from app.models.payment_models import PlanDocument


async def cleanup_old_indexes(collection):
    """Remove old payment gateway indexes that might conflict."""
    try:
        # List all indexes
        indexes = await collection.list_indexes().to_list(length=None)

        # Find and drop old payment gateway indexes
        old_indexes = ["razorpay_plan_id_1", "stripe_plan_id_1", "paypal_plan_id_1"]

        for index in indexes:
            index_name = index.get("name")
            if index_name in old_indexes:
                print(f"🗑️  Dropping old index: {index_name}")
                await collection.drop_index(index_name)

    except Exception as e:
        print(f"⚠️  Warning: Could not clean up old indexes: {e}")


def diff_plan(existing: dict, incoming: dict) -> dict:
    """Fields whose stored value differs from what the setup would write."""
    return {
        field: (existing.get(field), value)
        for field, value in incoming.items()
        if existing.get(field) != value
    }


async def setup_payment_plans(
    monthly_product_id: str, yearly_product_id: str, dry_run: bool = False
):
    """Set up GAIA subscription plans in the database using Dodo product IDs."""
    print("🚀 GAIA Payment Setup" + (" (DRY RUN — no writes)" if dry_run else ""))
    print("=" * 50)

    # Try to fetch DODO_PAYMENTS_API_KEY from Infisical-injected env, fallback to settings
    dodo_payments_api_key = os.environ.get("DODO_PAYMENTS_API_KEY") or getattr(
        settings, "DODO_PAYMENTS_API_KEY", None
    )
    if not dodo_payments_api_key:
        print("❌ DODO_PAYMENTS_API_KEY not found in Infisical or environment variables/settings")
        return False

    print("🔗 Dodo Payments API key resolved")
    print(f"📦 Monthly Product ID: {monthly_product_id}")
    print(f"📦 Yearly Product ID: {yearly_product_id}")
    print()

    # Define plans with their corresponding Dodo product IDs
    plans_data = [
        {
            "dodo_product_id": "",  # Free plan doesn't need Dodo product ID
            "name": "Free",
            "description": "Start free. See what GAIA can do.",
            "amount": 0,
            "currency": "USD",
            "duration": "monthly",
            "max_users": 1,
            "features": [
                "All tools & 100s of integrations",
                "Standard models",
                "Daily AI usage allowance",
                f"{FREE_MEMORY_FACT_LIMIT} saved memories",
                "Community support",
            ],
            "is_active": True,
        },
        {
            "dodo_product_id": monthly_product_id,  # Monthly plan
            "name": "Pro",
            "description": "For serious users who want to save time.",
            "amount": 3000,  # $30.00 in cents
            "currency": "USD",
            "duration": "monthly",
            "max_users": 1,
            "features": [
                "Much higher usage limits",
                "Unlimited memories",
                "More powerful models",
                "Long running tasks",
                "Priority support",
                "Early access to new features",
            ],
            "is_active": True,
        },
        {
            "dodo_product_id": yearly_product_id,  # Yearly plan
            "name": "Pro",
            "description": "For serious users who want to save time.",
            "amount": 30000,  # $300.00 in cents (2 months free, ~16.7% discount)
            "currency": "USD",
            "duration": "yearly",
            "max_users": 1,
            "features": [
                "Much higher usage limits",
                "Unlimited memories",
                "More powerful models",
                "Long running tasks",
                "Priority support",
                "Early access to new features",
            ],
            "is_active": True,
        },
        {
            # Enterprise — lead capture only, no Dodo product.
            "dodo_product_id": "",
            "name": "Enterprise",
            "description": "For teams ready to roll GAIA out to every employee.",
            "amount": 0,  # Custom pricing, frontend shows 'Custom' label.
            "currency": "USD",
            "duration": "monthly",
            "max_users": 0,  # 0 == unlimited, contact sales
            "features": [
                "Everything in Pro",
                "SSO, SCIM & audit logs",
                "Custom integrations",
                "Self-host or private cloud",
                "Private Slack support",
                "Dedicated engineer & SLA",
            ],
            "is_active": True,
        },
    ]

    # Connect to database
    client = None
    try:
        client = AsyncIOMotorClient(settings.MONGO_DB)
        db = client["GAIA"]
        collection = db["subscription_plans"]

        # Clean up old payment gateway indexes first
        if not dry_run:
            await cleanup_old_indexes(collection)

        print("📊 Setting up subscription plans...")
        print()

        created_count = 0
        updated_count = 0

        for plan_item in plans_data:
            try:
                plan_name = plan_item["name"]
                plan_duration: str = plan_item["duration"]
                dodo_product_id = plan_item["dodo_product_id"]

                print(f"⚙️  Processing: {plan_name} ({plan_duration.capitalize()})")

                # Check if plan already exists
                existing_plan = await collection.find_one(
                    {
                        "name": plan_name,
                        "duration": plan_duration,
                    }
                )

                plan_doc = PlanDocument.model_validate(
                    {
                        "dodo_product_id": dodo_product_id,
                        "name": plan_item["name"],
                        "description": plan_item["description"],
                        "amount": plan_item["amount"],
                        "currency": plan_item["currency"],
                        "duration": plan_item["duration"],
                        "max_users": plan_item["max_users"],
                        "features": plan_item["features"],
                        "is_active": plan_item["is_active"],
                        "created_at": datetime.now(UTC),
                        "updated_at": datetime.now(UTC),
                    }
                )

                update_fields = plan_doc.model_dump(by_alias=True, exclude={"id", "created_at"})

                if existing_plan:
                    if dry_run:
                        changes = diff_plan(existing_plan, update_fields)
                        changes.pop("updated_at", None)
                        if changes:
                            print("   📝 Would update existing plan:")
                            for field, (before, after) in changes.items():
                                print(f"      - {field}: {before!r} → {after!r}")
                        else:
                            print("   ➖ Would leave existing plan unchanged")
                    else:
                        await collection.update_one(
                            {"_id": existing_plan["_id"]},
                            {"$set": update_fields},
                        )
                        print("   ✅ Updated existing plan")
                    updated_count += 1
                else:
                    if dry_run:
                        print("   📝 Would create new plan")
                    else:
                        await collection.insert_one(
                            plan_doc.model_dump(by_alias=True, exclude={"id"})
                        )
                        print("   ✅ Created new plan")
                    created_count += 1

                print(
                    f"   💰 Amount: ${int(plan_item['amount']) / 100:.2f} {plan_item['currency']}"
                )
                print(f"   📅 Duration: {plan_duration.capitalize()}")
                print(f"   👥 Max Users: {plan_item['max_users']}")
                print(f"   🏷️  Dodo Product ID: {dodo_product_id or 'Free Plan (No Product ID)'}")
                print(f"   🎯 Features: {len(list(plan_item['features']))} features")
                print()

            except Exception as e:
                print(f"   ❌ Error processing {plan_item['name']}: {e}")

        print("=" * 50)
        print("📈 Setup Summary:")
        print(f"   • {'Would create' if dry_run else 'Created'}: {created_count} plans")
        print(f"   • {'Would update' if dry_run else 'Updated'}: {updated_count} plans")
        print(f"   • Total: {created_count + updated_count} plans processed")
        print()

        # Display final plan list
        plans_cursor = collection.find({"is_active": True}).sort("amount", 1)
        plans = await plans_cursor.to_list(length=None)

        print(
            "📋 Active Plans (current state, before any write):" if dry_run else "📋 Active Plans:"
        )
        for plan in plans:
            print(f"   • {plan['name']} ({plan['duration']}) - ${plan['amount'] / 100:.2f}")
            print(f"     Dodo Product ID: {plan.get('dodo_product_id') or 'N/A'}")

        print()
        if dry_run:
            print("✅ Dry run complete — nothing was written.")
        else:
            # The plan catalogue is cached for an hour, so without this the API
            # keeps serving the old prices long after the write lands.
            for cache_key in PLANS_CACHE_KEYS:
                await redis_cache.delete(cache_key)
            print(f"🧹 Cleared cached plan catalogue: {', '.join(PLANS_CACHE_KEYS)}")
            print("✅ Payment system setup complete!")
            print("🔗 Frontend can now fetch plans via GET /api/v1/payments/plans")
            print("🎯 Users can create subscriptions via POST /api/v1/payments/subscriptions")

        return True

    except Exception as e:
        print(f"❌ Setup failed: {e}")
        return False
    finally:
        if client:
            client.close()
            print("🔌 Database connection closed")


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Setup Payment plans for GAIA")
    parser.add_argument(
        "--monthly-product-id",
        required=True,
        help="Dodo product ID for monthly Pro plan",
    )
    parser.add_argument(
        "--yearly-product-id",
        required=True,
        help="Dodo product ID for yearly Pro plan",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the changes that would be made without writing to the database",
    )

    args = parser.parse_args()

    try:
        await setup_payment_plans(
            args.monthly_product_id, args.yearly_product_id, dry_run=args.dry_run
        )
        print(
            "\n🎉 Dry run finished!"
            if args.dry_run
            else "\n🎉 Payment setup completed successfully!"
        )
    except Exception as e:
        print(f"\n💥 Setup failed with error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
