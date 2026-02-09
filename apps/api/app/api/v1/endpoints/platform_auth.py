"""
Platform Authentication Endpoints

Simple endpoints for managing user platform account links (Discord, Slack, Telegram, WhatsApp).
"""

from typing import Optional

from app.api.v1.middleware.auth import get_current_user
from app.config.settings import settings
from app.db.mongodb.collections import users_collection
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter()


@router.get("/user/platform-links")
async def get_platform_links(
    current_user: Optional[dict] = Depends(get_current_user),
):
    """Get user's connected platform accounts."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = current_user.get("user_id")
    user = await users_collection.find_one({"user_id": user_id})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    platform_links = user.get("platform_links", {})

    return {
        "platform_links": {
            "discord": {
                "platform": "discord",
                "platformUserId": platform_links.get("discord"),
                "connectedAt": user.get("platform_links_connected_at", {}).get(
                    "discord"
                ),
            }
            if platform_links.get("discord")
            else None,
            "slack": {
                "platform": "slack",
                "platformUserId": platform_links.get("slack"),
                "connectedAt": user.get("platform_links_connected_at", {}).get("slack"),
            }
            if platform_links.get("slack")
            else None,
            "telegram": {
                "platform": "telegram",
                "platformUserId": platform_links.get("telegram"),
                "connectedAt": user.get("platform_links_connected_at", {}).get(
                    "telegram"
                ),
            }
            if platform_links.get("telegram")
            else None,
            "whatsapp": {
                "platform": "whatsapp",
                "platformUserId": platform_links.get("whatsapp"),
                "connectedAt": user.get("platform_links_connected_at", {}).get(
                    "whatsapp"
                ),
            }
            if platform_links.get("whatsapp")
            else None,
        }
    }


@router.post("/{platform}/connect")
async def initiate_platform_connect(
    platform: str,
    current_user: Optional[dict] = Depends(get_current_user),
):
    """Initiate connection for a platform."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if platform not in ["discord", "slack", "telegram", "whatsapp"]:
        raise HTTPException(status_code=400, detail="Invalid platform")

    # For now, return instructions for manual setup
    # TODO: Implement proper OAuth flows when bot credentials are configured
    if platform == "telegram":
        return {
            "auth_url": None,
            "auth_type": "manual",
            "instructions": f"Open Telegram and message @{getattr(settings, 'TELEGRAM_BOT_USERNAME', 'gaia_bot')} with /start to link your account.",
        }

    if platform == "discord":
        return {
            "auth_url": None,
            "auth_type": "manual",
            "instructions": "Add the GAIA bot to your Discord server and use /gaia to link your account.",
        }

    if platform == "slack":
        return {
            "auth_url": None,
            "auth_type": "manual",
            "instructions": "Add the GAIA app to your Slack workspace and use /gaia to link your account.",
        }

    if platform == "whatsapp":
        return {
            "auth_url": None,
            "auth_type": "manual",
            "instructions": "WhatsApp integration coming soon.",
        }

    raise HTTPException(status_code=501, detail=f"{platform} not yet implemented")


@router.delete("/{platform}/disconnect")
async def disconnect_platform(
    platform: str,
    current_user: Optional[dict] = Depends(get_current_user),
):
    """Disconnect a platform from user account."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if platform not in ["discord", "slack", "telegram", "whatsapp"]:
        raise HTTPException(status_code=400, detail="Invalid platform")

    user_id = current_user.get("user_id")

    result = await users_collection.update_one(
        {"user_id": user_id},
        {
            "$unset": {
                f"platform_links.{platform}": "",
                f"platform_links_connected_at.{platform}": "",
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"status": "disconnected", "platform": platform}
