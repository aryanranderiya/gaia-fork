"""Platform Link Service

Centralized service for managing platform account linking (Discord, Slack, Telegram, WhatsApp).
Consolidates duplicate logic from bot.py, bot_auth.py, and platform_auth.py.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from app.db.mongodb.collections import users_collection
from bson import ObjectId


class Platform(str, Enum):
    """Supported platforms for account linking."""

    DISCORD = "discord"
    SLACK = "slack"
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"

    @classmethod
    def is_valid(cls, platform: str) -> bool:
        """Check if platform is supported."""
        try:
            cls(platform)
            return True
        except ValueError:
            return False

    @classmethod
    def values(cls) -> list[str]:
        """Get list of all platform values."""
        return [p.value for p in cls]


class PlatformLinkService:
    """Service for platform account linking operations."""

    @staticmethod
    async def get_user_by_platform_id(
        platform: str, platform_user_id: str
    ) -> Optional[dict]:
        """
        Find GAIA user by platform account ID.

        Args:
            platform: Platform name (discord, slack, etc.)
            platform_user_id: User's ID on the platform

        Returns:
            User document if found, None otherwise
        """
        return await users_collection.find_one(
            {f"platform_links.{platform}": platform_user_id}
        )

    @staticmethod
    async def is_authenticated(platform: str, platform_user_id: str) -> bool:
        """
        Check if platform user is linked to a GAIA account.

        Args:
            platform: Platform name
            platform_user_id: User's ID on the platform

        Returns:
            True if linked, False otherwise
        """
        user = await PlatformLinkService.get_user_by_platform_id(
            platform, platform_user_id
        )
        return user is not None

    @staticmethod
    async def link_account(
        user_id: str,
        platform: str,
        platform_user_id: str,
        use_object_id: bool = False,
    ) -> dict:
        """
        Link a platform account to a GAIA user.

        Args:
            user_id: GAIA user ID (string or ObjectId format)
            platform: Platform name
            platform_user_id: User's ID on the platform
            use_object_id: If True, user_id is treated as ObjectId

        Returns:
            Result dict with status and details

        Raises:
            ValueError: If platform account already linked to different user
            ValueError: If user already has different platform account linked
        """
        # Check if this platform ID is already linked to another user
        existing = await users_collection.find_one(
            {f"platform_links.{platform}": platform_user_id}
        )

        query_field = "_id" if use_object_id else "user_id"
        query_value = ObjectId(user_id) if use_object_id else user_id

        if existing:
            existing_id = (
                str(existing.get("_id"))
                if use_object_id
                else existing.get("user_id")
            )
            if existing_id != user_id:
                raise ValueError(
                    f"This {platform} account is already linked to another GAIA user"
                )

        # Check if user already has a different platform ID linked
        user = await users_collection.find_one({query_field: query_value})
        if user:
            current_link = user.get("platform_links", {}).get(platform)
            if current_link and current_link != platform_user_id:
                raise ValueError(
                    f"Your account already has a different {platform} account linked"
                )

        # Link the account
        now = datetime.now(timezone.utc).isoformat()
        result = await users_collection.update_one(
            {query_field: query_value},
            {
                "$set": {
                    f"platform_links.{platform}": platform_user_id,
                    f"platform_links_connected_at.{platform}": now,
                }
            },
        )

        if result.matched_count == 0:
            raise ValueError("User not found")

        return {
            "status": "linked",
            "platform": platform,
            "platform_user_id": platform_user_id,
            "connected_at": now,
        }

    @staticmethod
    async def unlink_account(
        user_id: str, platform: str, use_object_id: bool = False
    ) -> dict:
        """
        Unlink a platform account from a GAIA user.

        Args:
            user_id: GAIA user ID
            platform: Platform name
            use_object_id: If True, user_id is treated as ObjectId

        Returns:
            Result dict with status

        Raises:
            ValueError: If user not found
        """
        query_field = "_id" if use_object_id else "user_id"
        query_value = ObjectId(user_id) if use_object_id else user_id

        result = await users_collection.update_one(
            {query_field: query_value},
            {
                "$unset": {
                    f"platform_links.{platform}": "",
                    f"platform_links_connected_at.{platform}": "",
                }
            },
        )

        if result.matched_count == 0:
            raise ValueError("User not found")

        return {"status": "disconnected", "platform": platform}

    @staticmethod
    async def get_linked_platforms(user_id: str) -> dict:
        """
        Get all linked platforms for a user.

        Args:
            user_id: GAIA user ID

        Returns:
            Dict mapping platform names to connection details
        """
        user = await users_collection.find_one({"user_id": user_id})

        if not user:
            return {}

        platform_links = user.get("platform_links", {})
        connected_at = user.get("platform_links_connected_at", {})

        result = {}
        for platform in Platform.values():
            if platform_links.get(platform):
                result[platform] = {
                    "platform": platform,
                    "platformUserId": platform_links.get(platform),
                    "connectedAt": connected_at.get(platform),
                }

        return result
