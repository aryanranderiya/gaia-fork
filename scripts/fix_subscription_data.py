#!/usr/bin/env python3
"""
Script to fix subscription data inconsistencies.
This script will:
1. Find subscriptions with invalid plan_ids
2. Either clean them up or update them to valid plan_ids
"""

import asyncio
from datetime import datetime
from bson import ObjectId

from app.db.mongodb.database import init_database
from app.db.mongodb.collections import subscriptions_collection, plans_collection
from app.config.loggers import general_logger as logger


async def find_invalid_subscriptions():
    """Find subscriptions with plan_ids that don't exist in plans collection."""
    try:
        # Get all active plan IDs
        plans_cursor = plans_collection.find({}, {"_id": 1})
        valid_plan_ids = set(str(plan["_id"]) async for plan in plans_cursor)
        
        print(f"✅ Found {len(valid_plan_ids)} valid plan IDs:")
        for plan_id in valid_plan_ids:
            print(f"   - {plan_id}")
        
        # Get all subscriptions
        subscriptions_cursor = subscriptions_collection.find({})
        invalid_subscriptions = []
        valid_subscriptions = []
        
        async for subscription in subscriptions_cursor:
            plan_id = subscription.get("plan_id")
            if plan_id not in valid_plan_ids:
                invalid_subscriptions.append(subscription)
                print(f"❌ Invalid subscription: {subscription['_id']} -> plan_id: {plan_id}")
            else:
                valid_subscriptions.append(subscription)
        
        print(f"\n📊 Summary:")
        print(f"   Valid subscriptions: {len(valid_subscriptions)}")
        print(f"   Invalid subscriptions: {len(invalid_subscriptions)}")
        
        return invalid_subscriptions, valid_subscriptions, valid_plan_ids
        
    except Exception as e:
        logger.error(f"Error finding invalid subscriptions: {e}")
        return [], [], set()


async def cleanup_invalid_subscriptions(invalid_subscriptions):
    """Delete subscriptions with invalid plan_ids."""
    try:
        if not invalid_subscriptions:
            print("✅ No invalid subscriptions to clean up!")
            return
        
        print(f"\n🧹 Cleaning up {len(invalid_subscriptions)} invalid subscriptions...")
        
        # Delete invalid subscriptions
        invalid_ids = [sub["_id"] for sub in invalid_subscriptions]
        result = await subscriptions_collection.delete_many({
            "_id": {"$in": invalid_ids}
        })
        
        print(f"✅ Deleted {result.deleted_count} invalid subscriptions")
        
    except Exception as e:
        logger.error(f"Error cleaning up invalid subscriptions: {e}")


async def update_invalid_subscriptions(invalid_subscriptions, target_plan_id):
    """Update invalid subscriptions to point to a valid plan_id."""
    try:
        if not invalid_subscriptions:
            print("✅ No invalid subscriptions to update!")
            return
        
        # Validate target plan exists
        target_plan = await plans_collection.find_one({"_id": ObjectId(target_plan_id)})
        if not target_plan:
            print(f"❌ Target plan {target_plan_id} not found!")
            return
        
        print(f"\n🔄 Updating {len(invalid_subscriptions)} invalid subscriptions to plan: {target_plan['name']} ({target_plan_id})")
        
        # Update invalid subscriptions
        invalid_ids = [sub["_id"] for sub in invalid_subscriptions]
        result = await subscriptions_collection.update_many(
            {"_id": {"$in": invalid_ids}},
            {
                "$set": {
                    "plan_id": target_plan_id,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        print(f"✅ Updated {result.modified_count} subscriptions")
        
    except Exception as e:
        logger.error(f"Error updating invalid subscriptions: {e}")


async def show_plans():
    """Show all available plans."""
    try:
        print("\n📋 Available Plans:")
        print("-" * 80)
        
        plans_cursor = plans_collection.find({}).sort("amount", 1)
        async for plan in plans_cursor:
            print(f"ID: {plan['_id']}")
            print(f"Name: {plan['name']}")
            print(f"Amount: ₹{plan['amount']/100:.2f}")
            print(f"Duration: {plan['duration']}")
            print(f"Active: {plan['is_active']}")
            print("-" * 40)
            
    except Exception as e:
        logger.error(f"Error showing plans: {e}")


async def main():
    """Main function to fix subscription data."""
    print("🔧 Subscription Data Fixer")
    print("=" * 50)
    
    # Initialize database
    await init_database()
    
    # Show available plans
    await show_plans()
    
    # Find invalid subscriptions
    invalid_subs, valid_subs, valid_plan_ids = await find_invalid_subscriptions()
    
    if not invalid_subs:
        print("\n✅ All subscriptions have valid plan_ids! No action needed.")
        return
    
    print(f"\n🤔 What would you like to do with the {len(invalid_subs)} invalid subscriptions?")
    print("1. Delete them (cleanup)")
    print("2. Update them to point to GAIA Pro Monthly")
    print("3. Update them to point to GAIA Pro Yearly")
    print("4. Show details and exit")
    
    choice = input("\nEnter your choice (1-4): ").strip()
    
    if choice == "1":
        confirm = input(f"⚠️  Are you sure you want to DELETE {len(invalid_subs)} subscriptions? (yes/no): ").strip().lower()
        if confirm == "yes":
            await cleanup_invalid_subscriptions(invalid_subs)
        else:
            print("❌ Cancelled cleanup operation")
    
    elif choice == "2":
        # Update to GAIA Pro Monthly (first plan)
        if valid_plan_ids:
            monthly_plan_id = "685ed79d432006b0fe60aa77"  # GAIA Pro Monthly
            if monthly_plan_id in valid_plan_ids:
                await update_invalid_subscriptions(invalid_subs, monthly_plan_id)
            else:
                print("❌ GAIA Pro Monthly plan not found!")
    
    elif choice == "3":
        # Update to GAIA Pro Yearly (second plan)
        yearly_plan_id = "685ed79d432006b0fe60aa78"  # GAIA Pro Yearly  
        if yearly_plan_id in valid_plan_ids:
            await update_invalid_subscriptions(invalid_subs, yearly_plan_id)
        else:
            print("❌ GAIA Pro Yearly plan not found!")
    
    elif choice == "4":
        print("\n📄 Invalid Subscription Details:")
        print("-" * 80)
        for sub in invalid_subs:
            print(f"Subscription ID: {sub['_id']}")
            print(f"User ID: {sub['user_id']}")
            print(f"Invalid Plan ID: {sub['plan_id']}")
            print(f"Status: {sub['status']}")
            print(f"Created: {sub['created_at']}")
            print("-" * 40)
    
    else:
        print("❌ Invalid choice. Exiting without changes.")
    
    print("\n✅ Script completed!")


if __name__ == "__main__":
    asyncio.run(main())
