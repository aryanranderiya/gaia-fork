import asyncio
import json
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from app.agents.core.agent import call_agent
from app.config.loggers import chat_logger as logger
from app.config.settings import settings
from app.constants.cache import PLATFORM_LINK_TOKEN_PREFIX, PLATFORM_LINK_TOKEN_TTL
from app.core.stream_manager import stream_manager
from app.db.redis import redis_cache
from app.models.bot_models import (
    BotAuthStatusResponse,
    BotChatRequest,
    BotSettingsResponse,
    CreateLinkTokenRequest,
    CreateLinkTokenResponse,
    IntegrationInfo,
)
from app.models.message_models import MessageRequestWithHistory
from app.services.bot_service import BotService
from app.services.bot_token_service import create_bot_session_token
from app.services.chat_service import run_chat_stream_background
from app.services.integrations.marketplace import get_integration_details
from app.services.integrations.user_integrations import get_user_connected_integrations
from app.services.model_service import get_user_selected_model
from app.services.platform_link_service import PlatformLinkService
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

_background_tasks: set[asyncio.Task] = set()


async def require_bot_api_key(request: Request) -> None:
    """Verify that the request has a valid bot API key (set by BotAuthMiddleware)."""
    if not getattr(request.state, "bot_api_key_valid", False):
        raise HTTPException(status_code=401, detail="Invalid or missing bot API key")


@router.post(
    "/create-link-token",
    response_model=CreateLinkTokenResponse,
    status_code=200,
    summary="Create Platform Link Token",
    description="Generate a secure, time-limited token for platform account linking.",
)
async def create_link_token(
    request: Request, body: CreateLinkTokenRequest
) -> CreateLinkTokenResponse:
    """Create a secure token that bots include in auth URLs.

    This prevents CSRF attacks where an attacker crafts a link with someone
    else's platform user ID to hijack their account linking.
    """
    await require_bot_api_key(request)

    token = secrets.token_urlsafe(32)
    redis_client = redis_cache.client
    token_key = f"{PLATFORM_LINK_TOKEN_PREFIX}:{token}"

    await redis_client.hset(
        token_key,
        mapping={
            "platform": body.platform,
            "platform_user_id": body.platform_user_id,
        },
    )
    await redis_client.expire(token_key, PLATFORM_LINK_TOKEN_TTL)

    auth_url = f"{settings.FRONTEND_URL}/auth/link-platform?platform={body.platform}&token={token}"

    return CreateLinkTokenResponse(token=token, auth_url=auth_url)


@router.post(
    "/chat-stream",
    status_code=200,
    summary="Streaming Bot Chat",
    description="Stream a chat response as Server-Sent Events.",
)
async def bot_chat_stream(request: Request, body: BotChatRequest) -> StreamingResponse:
    await require_bot_api_key(request)
    await BotService.enforce_rate_limit(body.platform, body.platform_user_id)

    # Use middleware-resolved user if available
    user = getattr(request.state, "user", None)
    if not user or not getattr(request.state, "authenticated", False):
        user = await PlatformLinkService.get_user_by_platform_id(
            body.platform, body.platform_user_id
        )

    if not user:

        async def auth_required():
            yield f"data: {json.dumps({'error': 'not_authenticated'})}\n\n"

        return StreamingResponse(auth_required(), media_type="text/event-stream")

    user_id = user.get("user_id") or str(user.get("_id", ""))

    conversation_id = await BotService.get_or_create_session(
        body.platform, body.platform_user_id, body.channel_id, user
    )

    history = await BotService.load_conversation_history(conversation_id, user_id)
    history.append({"role": "user", "content": body.message})

    message_request = MessageRequestWithHistory(
        message=body.message,
        conversation_id=conversation_id,
        messages=history,
    )

    # Generate session token upfront so it can be sent in the stream
    session_token = create_bot_session_token(
        user_id=user_id,
        platform=body.platform,
        platform_user_id=body.platform_user_id,
        expires_minutes=15,
    )

    # Generate stream ID and start background streaming
    stream_id = str(uuid4())
    await stream_manager.start_stream(stream_id, conversation_id, user_id)

    # Launch background task
    task = asyncio.create_task(
        run_chat_stream_background(
            stream_id=stream_id,
            body=message_request,
            user=user,
            user_time=datetime.now(timezone.utc),
            conversation_id=conversation_id,
        )
    )

    def task_done_callback(t: asyncio.Task):
        _background_tasks.discard(t)
        if t.exception():
            logger.error(f"Background stream task failed: {t.exception()}")

    task.add_done_callback(task_done_callback)
    _background_tasks.add(task)

    async def stream_from_redis():
        """Subscribe to Redis stream and translate chunks for bot clients."""
        # Send session token as first event
        yield f"data: {json.dumps({'session_token': session_token})}\n\n"

        try:
            async for chunk in stream_manager.subscribe_stream(stream_id):
                # Filter out web-only metadata chunks
                if chunk.startswith("data: "):
                    raw = chunk[len("data: ") :].strip()
                    if raw == "[DONE]":
                        yield f"data: {json.dumps({'done': True, 'conversation_id': conversation_id})}\n\n"
                        break

                    try:
                        data = json.loads(raw)

                        # Skip web-only fields
                        if any(
                            key in data
                            for key in [
                                "conversation_description",
                                "user_message_id",
                                "bot_message_id",
                                "stream_id",
                                "tool_data",
                                "tool_output",
                                "follow_up_actions",
                            ]
                        ):
                            continue

                        # Translate {"response": "..."} → {"text": "..."}
                        if "response" in data:
                            yield f"data: {json.dumps({'text': data['response']})}\n\n"
                        elif "error" in data:
                            yield f"data: {json.dumps({'error': data['error']})}\n\n"
                            break
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"Bot stream subscription error: {e}")
            yield f"data: {json.dumps({'error': 'Stream error occurred'})}\n\n"

    return StreamingResponse(stream_from_redis(), media_type="text/event-stream")


@router.post(
    "/chat-mention",
    status_code=200,
    summary="Unauthenticated Bot Mention Chat",
    description="Stream a chat response for @mentions. Does not require user auth. Rate limited by guild.",
)
async def bot_chat_mention(request: Request, body: BotChatRequest) -> StreamingResponse:
    """Unauthenticated mention chat with guild-based rate limiting."""
    await require_bot_api_key(request)

    # Use guild_id (channel_id) for rate limiting, much stricter
    guild_id = body.channel_id or "unknown"
    await BotService.enforce_guild_rate_limit(guild_id)

    # Try to resolve user - if linked, use their context; if not, use anonymous
    user = await PlatformLinkService.get_user_by_platform_id(
        body.platform, body.platform_user_id
    )

    if user:
        user_id = user.get("user_id") or str(user.get("_id", ""))
        conversation_id = await BotService.get_or_create_session(
            body.platform, body.platform_user_id, body.channel_id, user
        )
        history = await BotService.load_conversation_history(conversation_id, user_id)
    else:
        # Anonymous session - no history, fresh conversation each time
        conversation_id = await BotService.get_or_create_anonymous_session(
            body.platform, body.platform_user_id, body.channel_id
        )
        history = []
        user = {
            "user_id": f"anon:{body.platform}:{body.platform_user_id}",
            "name": "Anonymous",
            "auth_provider": f"bot:{body.platform}:anonymous",
        }

    history.append({"role": "user", "content": body.message})

    message_request = MessageRequestWithHistory(
        message=body.message,
        conversation_id=conversation_id,
        messages=history,
    )

    async def event_generator():
        complete_message = ""
        try:
            stream = await call_agent(
                request=message_request,
                conversation_id=conversation_id,
                user=user,
                user_time=datetime.now(timezone.utc),
            )

            async for chunk in stream:
                if chunk.startswith("nostream:"):
                    payload = json.loads(chunk[len("nostream: ") :])
                    complete_message = payload.get("complete_message", complete_message)
                    continue

                if chunk.startswith("data: "):
                    raw = chunk[len("data: ") :].strip()
                    if raw == "[DONE]":
                        break

                    try:
                        data = json.loads(raw)
                        if "response" in data:
                            complete_message += data["response"]
                            yield f"data: {json.dumps({'text': data['response']})}\n\n"
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"Bot mention stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        yield f"data: {json.dumps({'done': True, 'conversation_id': conversation_id})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get(
    "/auth-status/{platform}/{platform_user_id}",
    response_model=BotAuthStatusResponse,
    status_code=200,
    summary="Check Auth Status",
    description="Check if a platform user is linked to a GAIA account.",
)
async def check_auth_status(
    request: Request,
    platform: str,
    platform_user_id: str,
) -> BotAuthStatusResponse:
    await require_bot_api_key(request)
    user = await PlatformLinkService.get_user_by_platform_id(platform, platform_user_id)
    return BotAuthStatusResponse(
        authenticated=user is not None,
        platform=platform,
        platform_user_id=platform_user_id,
    )


@router.get(
    "/settings/{platform}/{platform_user_id}",
    response_model=BotSettingsResponse,
    status_code=200,
    summary="Get User Settings",
    description="Get user account settings, connected integrations, and selected model.",
)
async def get_settings(
    request: Request,
    platform: str,
    platform_user_id: str,
) -> BotSettingsResponse:
    await require_bot_api_key(request)
    user = await PlatformLinkService.get_user_by_platform_id(platform, platform_user_id)

    if not user:
        return BotSettingsResponse(
            authenticated=False,
            user_name=None,
            account_created_at=None,
            profile_image_url=None,
            selected_model_name=None,
            selected_model_icon_url=None,
            connected_integrations=[],
        )

    user_id = user.get("user_id") or str(user.get("_id", ""))

    connected_integrations_list = []
    try:
        integrations = await get_user_connected_integrations(user_id)
        for integration_doc in integrations:
            integration_id = integration_doc.get("integration_id")
            status = integration_doc.get("status", "created")
            if integration_id:
                integration_details = await get_integration_details(integration_id)
                if integration_details:
                    connected_integrations_list.append(
                        IntegrationInfo(
                            name=integration_details.name,
                            logo_url=integration_details.icon_url,
                            status=status,
                        )
                    )
    except Exception as e:
        logger.error(f"Error fetching integrations for settings: {e}")

    selected_model_name = None
    selected_model_icon_url = None
    try:
        model = await get_user_selected_model(user_id)
        if model:
            selected_model_name = model.name
            selected_model_icon_url = model.logo_url
    except Exception as e:
        logger.error(f"Error fetching model for settings: {e}")

    user_name = user.get("name") or user.get("username")
    profile_image_url = user.get("profile_image_url") or user.get("avatar_url")
    account_created_at = None
    if user.get("created_at"):
        account_created_at = user["created_at"].isoformat()

    return BotSettingsResponse(
        authenticated=True,
        user_name=user_name,
        account_created_at=account_created_at,
        profile_image_url=profile_image_url,
        selected_model_name=selected_model_name,
        selected_model_icon_url=selected_model_icon_url,
        connected_integrations=connected_integrations_list,
    )
