import json
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from app.agents.core.agent import call_agent, call_agent_silent
from app.config.loggers import chat_logger as logger
from app.config.settings import settings
from app.models.bot_models import (
    BotAuthStatusResponse,
    BotChatRequest,
    BotChatResponse,
    ResetSessionRequest,
    SessionResponse,
)
from app.models.chat_models import MessageModel, UpdateMessagesRequest
from app.models.message_models import MessageRequestWithHistory
from app.services.bot_service import BotService
from app.services.bot_token_service import create_bot_session_token
from app.services.conversation_service import update_messages
from app.services.platform_link_service import PlatformLinkService
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()


async def verify_bot_api_key(x_bot_api_key: str = Header(..., alias="X-Bot-API-Key")):
    bot_api_key = getattr(settings, "GAIA_BOT_API_KEY", None)
    if not bot_api_key or x_bot_api_key != bot_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.post(
    "/chat",
    response_model=BotChatResponse,
    status_code=200,
    summary="Authenticated Bot Chat",
    description="Process a chat message from an authenticated bot user.",
)
async def bot_chat(
    request: BotChatRequest, _: None = Depends(verify_bot_api_key)
) -> BotChatResponse:
    await BotService.enforce_rate_limit(request.platform, request.platform_user_id)
    user = await PlatformLinkService.get_user_by_platform_id(
        request.platform, request.platform_user_id
    )

    if not user:
        return BotChatResponse(
            response="Please authenticate first using /auth",
            conversation_id="",
            authenticated=False,
        )

    conversation_id = await BotService.get_or_create_session(
        request.platform, request.platform_user_id, request.channel_id, user
    )

    history = await BotService.load_conversation_history(
        conversation_id, user.get("user_id", "")
    )
    history.append({"role": "user", "content": request.message})

    message_request = MessageRequestWithHistory(
        message=request.message,
        conversation_id=conversation_id,
        messages=history,
    )

    try:
        response_text, _meta = await call_agent_silent(
            request=message_request,
            conversation_id=conversation_id,
            user=user,
            user_time=datetime.now(timezone.utc),
        )
    except Exception as e:
        logger.error(f"Bot chat error: {e}")
        response_text = "An error occurred while processing your request."

    now = datetime.now(timezone.utc).isoformat()
    try:
        update_req = UpdateMessagesRequest(
            conversation_id=conversation_id,
            messages=[
                MessageModel(type="user", response=request.message, date=now),
                MessageModel(type="bot", response=response_text, date=now),
            ],
        )
        await update_messages(update_req, user)
    except Exception as e:
        logger.error(f"Failed to save bot messages: {e}")

    # Generate JWT session token for subsequent requests
    session_token = create_bot_session_token(
        user_id=user["user_id"],
        platform=request.platform,
        platform_user_id=request.platform_user_id,
        expires_minutes=15,
    )

    return BotChatResponse(
        response=response_text,
        conversation_id=conversation_id,
        authenticated=True,
        session_token=session_token,
    )


@router.post(
    "/chat/public",
    response_model=BotChatResponse,
    status_code=200,
    summary="Public Bot Chat",
    description="Process a public (unauthenticated) chat message.",
)
async def bot_chat_public(
    request: BotChatRequest, _: None = Depends(verify_bot_api_key)
) -> BotChatResponse:
    conversation_id = str(uuid4())

    bot_user = {
        "user_id": f"bot_{request.platform}",
        "email": f"bot@{request.platform}.gaia",
        "name": "GAIA Bot",
    }

    message_request = MessageRequestWithHistory(
        message=request.message,
        conversation_id=conversation_id,
        messages=[{"role": "user", "content": request.message}],
    )

    try:
        response_text, _meta = await call_agent_silent(
            request=message_request,
            conversation_id=conversation_id,
            user=bot_user,
            user_time=datetime.now(timezone.utc),
        )
    except Exception as e:
        logger.error(f"Bot public chat error: {e}")
        response_text = "An error occurred while processing your request."

    return BotChatResponse(
        response=response_text, conversation_id=conversation_id, authenticated=False
    )


@router.get(
    "/session/{platform}/{platform_user_id}",
    response_model=SessionResponse,
    status_code=200,
    summary="Get Session",
    description="Retrieve or create a session for a platform user.",
)
async def get_session(
    platform: str,
    platform_user_id: str,
    channel_id: Optional[str] = None,
    _: None = Depends(verify_bot_api_key),
) -> SessionResponse:
    user = await PlatformLinkService.get_user_by_platform_id(
        platform, platform_user_id
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not linked")

    conversation_id = await BotService.get_or_create_session(
        platform, platform_user_id, channel_id, user
    )
    return SessionResponse(
        conversation_id=conversation_id,
        platform=platform,
        platform_user_id=platform_user_id,
    )


@router.post(
    "/session/new",
    response_model=SessionResponse,
    status_code=200,
    summary="Reset Session",
    description="Delete the existing session and create a fresh conversation.",
)
async def reset_session(
    request: ResetSessionRequest, _: None = Depends(verify_bot_api_key)
) -> SessionResponse:
    user = await PlatformLinkService.get_user_by_platform_id(
        request.platform, request.platform_user_id
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not linked")

    conversation_id = await BotService.reset_session(
        request.platform, request.platform_user_id, request.channel_id, user
    )
    return SessionResponse(
        conversation_id=conversation_id,
        platform=request.platform,
        platform_user_id=request.platform_user_id,
    )


@router.post(
    "/chat-stream",
    status_code=200,
    summary="Streaming Bot Chat",
    description="Stream a chat response as Server-Sent Events.",
)
async def bot_chat_stream(
    request: BotChatRequest, _: None = Depends(verify_bot_api_key)
) -> StreamingResponse:
    await BotService.enforce_rate_limit(request.platform, request.platform_user_id)
    user = await PlatformLinkService.get_user_by_platform_id(
        request.platform, request.platform_user_id
    )

    if not user:
        async def auth_required():
            yield f"data: {json.dumps({'error': 'not_authenticated'})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            auth_required(), media_type="text/event-stream"
        )

    conversation_id = await BotService.get_or_create_session(
        request.platform, request.platform_user_id, request.channel_id, user
    )

    history = await BotService.load_conversation_history(
        conversation_id, user.get("user_id", "")
    )
    history.append({"role": "user", "content": request.message})

    message_request = MessageRequestWithHistory(
        message=request.message,
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
                    payload = json.loads(chunk[len("nostream: "):])
                    complete_message = payload.get(
                        "complete_message", complete_message
                    )
                    continue

                if chunk.startswith("data: "):
                    raw = chunk[len("data: "):].strip()
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
            logger.error(f"Bot stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        yield f"data: {json.dumps({'done': True, 'conversation_id': conversation_id})}\n\n"

        now = datetime.now(timezone.utc).isoformat()
        if complete_message:
            try:
                update_req = UpdateMessagesRequest(
                    conversation_id=conversation_id,
                    messages=[
                        MessageModel(
                            type="user", response=request.message, date=now
                        ),
                        MessageModel(
                            type="bot", response=complete_message, date=now
                        ),
                    ],
                )
                await update_messages(update_req, user)
            except Exception as e:
                logger.error(f"Failed to save bot stream messages: {e}")

    return StreamingResponse(
        event_generator(), media_type="text/event-stream"
    )


@router.get(
    "/auth-status/{platform}/{platform_user_id}",
    response_model=BotAuthStatusResponse,
    status_code=200,
    summary="Check Auth Status",
    description="Check if a platform user is linked to a GAIA account.",
)
async def check_auth_status(
    platform: str,
    platform_user_id: str,
    _: None = Depends(verify_bot_api_key),
) -> BotAuthStatusResponse:
    user = await PlatformLinkService.get_user_by_platform_id(
        platform, platform_user_id
    )
    return BotAuthStatusResponse(
        authenticated=user is not None,
        platform=platform,
        platform_user_id=platform_user_id,
    )
