"""Bot Models

Pydantic models for bot chat, sessions, and related operations.
"""

from typing import Optional

from pydantic import BaseModel, Field


class BotChatRequest(BaseModel):
    """Request model for bot chat messages."""

    message: str = Field(..., description="User's message text")
    platform: str = Field(..., description="Platform name (discord, slack, etc.)")
    platform_user_id: str = Field(..., description="User's ID on the platform")
    channel_id: Optional[str] = Field(
        None, description="Channel/group ID (None for DM)"
    )


class BotChatResponse(BaseModel):
    """Response model for bot chat messages."""

    response: str = Field(..., description="Bot's response text")
    conversation_id: str = Field(..., description="Conversation ID")
    authenticated: bool = Field(
        ..., description="Whether user is authenticated with GAIA"
    )
    session_token: Optional[str] = Field(
        None, description="JWT session token for subsequent API requests"
    )


class SessionResponse(BaseModel):
    """Response model for bot session operations."""

    conversation_id: str = Field(..., description="Active conversation ID")
    platform: str = Field(..., description="Platform name")
    platform_user_id: str = Field(..., description="User's platform ID")


class ResetSessionRequest(BaseModel):
    """Request model for resetting bot session."""

    platform: str = Field(..., description="Platform name")
    platform_user_id: str = Field(..., description="User's platform ID")
    channel_id: Optional[str] = Field(None, description="Channel/group ID")


class BotAuthStatusResponse(BaseModel):
    """Response model for bot authentication status check."""

    authenticated: bool = Field(..., description="Whether user is linked to GAIA")
    platform: str = Field(..., description="Platform name")
    platform_user_id: str = Field(..., description="User's platform ID")


class BotWorkflowsListResponse(BaseModel):
    """Response model for listing bot workflows."""

    workflows: list = Field(..., description="List of workflow objects")


class BotWorkflowResponse(BaseModel):
    """Response model for single workflow operations."""

    workflow: dict = Field(..., description="Workflow object")


class BotConversationResponse(BaseModel):
    """Response model for single conversation."""

    conversation_id: str = Field(..., description="Conversation ID")
    user_id: str = Field(..., description="User ID")
    description: Optional[str] = Field(None, description="Conversation description")
    messages: list = Field(default_factory=list, description="List of messages")
    created_at: Optional[str] = Field(None, description="Creation timestamp")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")

    class Config:
        extra = "allow"  # Allow additional fields from MongoDB
