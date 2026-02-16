import json
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from app.agents.core.agent import call_agent, call_agent_silent
from app.config.loggers import chat_logger as logger
from app.config.settings import settings
from app.db.mongodb.collections import (
    bot_sessions_collection,
    conversations_collection,
    users_collection,
)
from app.db.redis import redis_cache
from app.models.chat_models import (
    ConversationModel,
    MessageModel,
    UpdateMessagesRequest,
)
from app.models.message_models import MessageRequestWithHistory
from app.models.todo_models import TodoModel, TodoSearchParams, TodoUpdateRequest
from app.services.conversation_service import (
    create_conversation_service,
    get_conversations,
    update_messages,
)
from app.services.search_service import search_messages
from app.services.todos.todo_service import TodoService
from app.services.workflow.service import WorkflowService
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

router = APIRouter()


class BotChatRequest(BaseModel):
    message: str
    platform: str
    platform_user_id: str
    channel_id: Optional[str] = None


class BotChatResponse(BaseModel):
    response: str
    conversation_id: str
    authenticated: bool


class SessionResponse(BaseModel):
    conversation_id: str
    platform: str
    platform_user_id: str


class ResetSessionRequest(BaseModel):
    platform: str
    platform_user_id: str
    channel_id: Optional[str] = None


BOT_RATE_LIMIT = 20  # requests per minute per user
BOT_RATE_WINDOW = 60  # seconds


async def verify_bot_api_key(x_bot_api_key: str = Header(..., alias="X-Bot-API-Key")):
    bot_api_key = getattr(settings, "GAIA_BOT_API_KEY", None)
    if not bot_api_key or x_bot_api_key != bot_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


async def _enforce_rate_limit(platform: str, platform_user_id: str):
    key = f"bot_ratelimit:{platform}:{platform_user_id}"
    try:
        if redis_cache.redis:
            count = await redis_cache.redis.incr(key)
            if count == 1:
                await redis_cache.redis.expire(key, BOT_RATE_WINDOW)
            if count > BOT_RATE_LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded. Please wait before sending more messages.",
                )
    except HTTPException:
        raise
    except Exception:
        pass  # Fail open if Redis is unavailable


async def get_user_by_platform_id(
    platform: str, platform_user_id: str
) -> Optional[dict]:
    return await users_collection.find_one(
        {f"platform_links.{platform}": platform_user_id}
    )


def _build_session_key(
    platform: str, platform_user_id: str, channel_id: Optional[str]
) -> str:
    suffix = channel_id or "dm"
    return f"{platform}:{platform_user_id}:{suffix}"


async def get_or_create_session(
    platform: str,
    platform_user_id: str,
    channel_id: Optional[str],
    user: dict,
) -> str:
    session_key = _build_session_key(platform, platform_user_id, channel_id)

    existing = await bot_sessions_collection.find_one({"session_key": session_key})
    if existing:
        conv_id = existing["conversation_id"]
        conv = await conversations_collection.find_one(
            {
                "conversation_id": conv_id,
                "user_id": user.get("user_id"),
            },
            {"_id": 1},
        )
        if conv:
            return conv_id

    conversation_id = str(uuid4())
    conversation = ConversationModel(
        conversation_id=conversation_id,
        description=f"{platform.capitalize()} Chat",
    )
    await create_conversation_service(conversation, user)

    await bot_sessions_collection.update_one(
        {"session_key": session_key},
        {
            "$set": {
                "session_key": session_key,
                "conversation_id": conversation_id,
                "platform": platform,
                "platform_user_id": platform_user_id,
                "channel_id": channel_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$setOnInsert": {
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        },
        upsert=True,
    )

    return conversation_id


async def load_conversation_history(
    conversation_id: str, user_id: str
) -> list[dict]:
    conv = await conversations_collection.find_one(
        {"conversation_id": conversation_id, "user_id": user_id},
        {"messages": 1},
    )
    if not conv or not conv.get("messages"):
        return []

    messages = conv["messages"][-20:]
    history = []
    for msg in messages:
        msg_type = msg.get("type", "")
        if msg_type == "user":
            history.append({"role": "user", "content": msg.get("response", "")})
        elif msg_type == "bot":
            history.append({"role": "assistant", "content": msg.get("response", "")})
    return history


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
    await _enforce_rate_limit(request.platform, request.platform_user_id)
    user = await get_user_by_platform_id(request.platform, request.platform_user_id)

    if not user:
        return BotChatResponse(
            response="Please authenticate first using /auth",
            conversation_id="",
            authenticated=False,
        )

    conversation_id = await get_or_create_session(
        request.platform, request.platform_user_id, request.channel_id, user
    )

    history = await load_conversation_history(conversation_id, user.get("user_id", ""))
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

    return BotChatResponse(
        response=response_text, conversation_id=conversation_id, authenticated=True
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
    user = await get_user_by_platform_id(platform, platform_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not linked")

    conversation_id = await get_or_create_session(
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
    user = await get_user_by_platform_id(request.platform, request.platform_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not linked")

    session_key = _build_session_key(
        request.platform, request.platform_user_id, request.channel_id
    )
    await bot_sessions_collection.delete_one({"session_key": session_key})

    conversation_id = await get_or_create_session(
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
    await _enforce_rate_limit(request.platform, request.platform_user_id)
    user = await get_user_by_platform_id(request.platform, request.platform_user_id)

    if not user:
        async def auth_required():
            yield f"data: {json.dumps({'error': 'not_authenticated'})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            auth_required(), media_type="text/event-stream"
        )

    conversation_id = await get_or_create_session(
        request.platform, request.platform_user_id, request.channel_id, user
    )

    history = await load_conversation_history(conversation_id, user.get("user_id", ""))
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
    status_code=200,
    summary="Check Auth Status",
    description="Check if a platform user is linked to a GAIA account.",
)
async def check_auth_status(
    platform: str,
    platform_user_id: str,
    _: None = Depends(verify_bot_api_key),
) -> dict:
    user = await get_user_by_platform_id(platform, platform_user_id)
    return {
        "authenticated": user is not None,
        "platform": platform,
        "platform_user_id": platform_user_id,
    }


# ---------------------------------------------------------------------------
# Bot proxy dependency: resolve user from X-Bot-Platform headers
# ---------------------------------------------------------------------------


async def _resolve_bot_user(
    x_bot_platform: str = Header(..., alias="X-Bot-Platform"),
    x_bot_platform_user_id: str = Header(..., alias="X-Bot-Platform-User-Id"),
    _: None = Depends(verify_bot_api_key),
) -> dict:
    user = await get_user_by_platform_id(x_bot_platform, x_bot_platform_user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not linked. Use /auth first.")
    return user


# ---------------------------------------------------------------------------
# Bot proxy: Todos
# ---------------------------------------------------------------------------


@router.get("/todos", summary="Bot: List Todos")
async def bot_list_todos(
    user: dict = Depends(_resolve_bot_user),
    completed: Optional[bool] = Query(None),
    project_id: Optional[str] = Query(None),
):
    params = TodoSearchParams(completed=completed, project_id=project_id)
    return await TodoService.list_todos(user["user_id"], params)


@router.post("/todos", summary="Bot: Create Todo", status_code=201)
async def bot_create_todo(
    todo: TodoModel,
    user: dict = Depends(_resolve_bot_user),
):
    return await TodoService.create_todo(todo, user["user_id"])


@router.get("/todos/{todo_id}", summary="Bot: Get Todo")
async def bot_get_todo(
    todo_id: str,
    user: dict = Depends(_resolve_bot_user),
):
    return await TodoService.get_todo(todo_id, user["user_id"])


@router.patch("/todos/{todo_id}", summary="Bot: Update Todo")
async def bot_update_todo(
    todo_id: str,
    updates: TodoUpdateRequest,
    user: dict = Depends(_resolve_bot_user),
):
    return await TodoService.update_todo(todo_id, updates, user["user_id"])


@router.delete("/todos/{todo_id}", summary="Bot: Delete Todo", status_code=204)
async def bot_delete_todo(
    todo_id: str,
    user: dict = Depends(_resolve_bot_user),
):
    await TodoService.delete_todo(todo_id, user["user_id"])


# ---------------------------------------------------------------------------
# Bot proxy: Workflows
# ---------------------------------------------------------------------------


@router.get("/workflows", summary="Bot: List Workflows")
async def bot_list_workflows(user: dict = Depends(_resolve_bot_user)):
    workflows = await WorkflowService.list_workflows(user["user_id"])
    return {"workflows": workflows}


@router.post("/workflows", summary="Bot: Create Workflow")
async def bot_create_workflow(
    request: dict,
    user: dict = Depends(_resolve_bot_user),
):
    from app.models.workflow_models import CreateWorkflowRequest

    workflow_req = CreateWorkflowRequest(**request)
    workflow = await WorkflowService.create_workflow(workflow_req, user["user_id"])
    return {"workflow": workflow}


@router.get("/workflows/{workflow_id}", summary="Bot: Get Workflow")
async def bot_get_workflow(
    workflow_id: str,
    user: dict = Depends(_resolve_bot_user),
):
    workflow = await WorkflowService.get_workflow(workflow_id, user["user_id"])
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"workflow": workflow}


@router.post("/workflows/{workflow_id}/execute", summary="Bot: Execute Workflow")
async def bot_execute_workflow(
    workflow_id: str,
    request: dict,
    user: dict = Depends(_resolve_bot_user),
):
    from app.models.workflow_models import WorkflowExecutionRequest

    exec_req = WorkflowExecutionRequest(**(request or {}))
    return await WorkflowService.execute_workflow(workflow_id, exec_req, user["user_id"])


@router.delete("/workflows/{workflow_id}", summary="Bot: Delete Workflow", status_code=204)
async def bot_delete_workflow(
    workflow_id: str,
    user: dict = Depends(_resolve_bot_user),
):
    deleted = await WorkflowService.delete_workflow(workflow_id, user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")


# ---------------------------------------------------------------------------
# Bot proxy: Conversations
# ---------------------------------------------------------------------------


@router.get("/conversations", summary="Bot: List Conversations")
async def bot_list_conversations(
    user: dict = Depends(_resolve_bot_user),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
) -> JSONResponse:
    response = await get_conversations(user, page=page, limit=limit)
    return JSONResponse(content=response)


@router.get("/conversations/{conversation_id}", summary="Bot: Get Conversation")
async def bot_get_conversation(
    conversation_id: str,
    user: dict = Depends(_resolve_bot_user),
):
    conv = await conversations_collection.find_one(
        {"conversation_id": conversation_id, "user_id": user.get("user_id")}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.pop("_id", None)
    return conv


# ---------------------------------------------------------------------------
# Bot proxy: Search
# ---------------------------------------------------------------------------


@router.get("/search", summary="Bot: Search")
async def bot_search(
    query: str = Query(...),
    user: dict = Depends(_resolve_bot_user),
):
    return await search_messages(query, user["user_id"])
