"""
Bot Authentication Middleware

Handles JWT-based authentication for bot platforms (Discord, Slack, Telegram).
JWT tokens are issued by the /bot/chat endpoint after successful API key verification.
"""

from typing import Any, Awaitable, Callable, Dict, Optional

from app.config.loggers import auth_logger as logger
from app.constants.cache import TEN_MINUTES_TTL
from app.db.redis import get_cache, set_cache
from app.services.bot_token_service import verify_bot_session_token
from app.services.platform_link_service import PlatformLinkService
from fastapi import Request, Response
from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class BotAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware for handling bot platform JWT authentication.

    This middleware validates JWT Bearer tokens in the Authorization header.
    If authentication succeeds, it sets request.state.user and request.state.authenticated.
    """

    def __init__(
        self,
        app: ASGIApp,
        exclude_paths: Optional[list[str]] = None,
    ):
        super().__init__(app)
        # Paths that don't need authentication
        self.exclude_paths = exclude_paths or [
            "/docs",
            "/redoc",
            "/openapi.json",
            "/health",
        ]

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """
        Process the request through the bot authentication middleware.

        Authentication flow:
        - Validates JWT token from Authorization: Bearer <token> header
        - Sets request.state.user and request.state.authenticated on success

        Args:
            request: The incoming request
            call_next: Callable to process the request through the next middleware/route

        Returns:
            Response: The response from the route handler
        """
        # Skip authentication for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)

        # Authenticate using JWT Bearer token
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]  # Remove "Bearer " prefix
            try:
                user_info = await self._authenticate_jwt(token)
                if user_info:
                    request.state.user = user_info
                    request.state.authenticated = True
                    logger.info(
                        f"JWT authentication successful for user {user_info.get('user_id')}"
                    )
            except Exception as e:
                logger.error(f"JWT authentication error: {e}")

        # Process the request through the next middleware/route
        response = await call_next(request)
        return response

    async def _authenticate_jwt(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Authenticate a bot request using JWT session token with user lookup caching (10 min TTL).

        Args:
            token: JWT token from Authorization header

        Returns:
            User info dict if authentication succeeds, None otherwise

        Raises:
            JWTError: If token is invalid or expired
        """
        try:
            # Verify and decode the JWT token
            payload = verify_bot_session_token(token)

            user_id = payload.get("user_id")
            platform = payload.get("platform")
            platform_user_id = payload.get("platform_user_id")

            if not user_id or not platform or not platform_user_id:
                logger.warning("Invalid JWT payload: missing required fields")
                return None

            # Try cache first
            cache_key = f"bot_user:{platform}:{platform_user_id}"
            cached_user_info = await get_cache(cache_key)

            if cached_user_info and cached_user_info.get("user_id") == user_id:
                logger.debug(f"Cache hit for {cache_key}")
                return cached_user_info

            # Cache miss - lookup from DB
            logger.debug(f"Cache miss for {cache_key}, looking up from database")
            user_data = await PlatformLinkService.get_user_by_platform_id(
                platform, platform_user_id
            )

            if not user_data:
                logger.warning(
                    f"No user found for JWT token: {platform} user {platform_user_id}"
                )
                return None

            # Verify the user_id matches
            if str(user_data.get("_id")) != user_id:
                logger.warning(
                    f"User ID mismatch in JWT token: expected {user_id}, "
                    f"got {user_data.get('_id')}"
                )
                return None

            # Construct user info in the same format as WorkOS auth
            user_info = {
                "user_id": str(user_data.get("_id")),
                "email": user_data.get("email"),
                "name": user_data.get("name"),
                "picture": user_data.get("picture"),
                "auth_provider": f"bot:{platform}",
                "bot_authenticated": True,
            }

            # Cache for 10 minutes
            await set_cache(cache_key, user_info, ttl=TEN_MINUTES_TTL)
            logger.debug(f"Cached user info for {cache_key}")

            return user_info

        except JWTError as e:
            logger.warning(f"JWT authentication failed: {e}")
            raise
