from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from fastapi.responses import HTMLResponse

from app.api.v1.middleware.rate_limiter import limiter
from app.models.platform_models import PlatformAuthStatusResponse
from app.services.platform_link_service import Platform, PlatformLinkService

router = APIRouter()


async def verify_bot_api_key(x_bot_api_key: str = Header(..., alias="X-Bot-API-Key")):
    """Verify bot API key from request header (not query param for security)."""
    from app.config.settings import settings

    bot_api_key = getattr(settings, "GAIA_BOT_API_KEY", None)
    if not bot_api_key or x_bot_api_key != bot_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.get("/link/{platform}")
@limiter.limit("5/minute")
async def link_platform_account(
    request: Request,
    platform: str,
    user_id: str = Query(...),
    platform_user_id: str = Query(...),
    _: None = Depends(verify_bot_api_key),
) -> HTMLResponse:
    if not Platform.is_valid(platform):
        raise HTTPException(status_code=400, detail="Invalid platform")

    try:
        await PlatformLinkService.link_account(user_id, platform, platform_user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return HTMLResponse(
        content=f"""
<!DOCTYPE html>
<html>
<head>
    <title>Account Linked</title>
    <style>
        body {{
            font-family: system-ui, -apple-system, sans-serif;
            text-align: center;
            padding-top: 100px;
            background: #0a0a0a;
            color: #fafafa;
        }}
        h1 {{ color: #22c55e; }}
    </style>
</head>
<body>
    <h1>Account Linked</h1>
    <p>Your {platform.title()} account has been linked to GAIA.</p>
    <p>You can close this window and return to {platform.title()}.</p>
</body>
</html>
    """
    )


@router.get(
    "/status/{platform}/{platform_user_id}",
    response_model=PlatformAuthStatusResponse,
)
@limiter.limit("30/minute")
async def check_auth_status(
    request: Request,
    platform: str,
    platform_user_id: str,
    _: None = Depends(verify_bot_api_key),
) -> PlatformAuthStatusResponse:
    """Check if a platform user is linked to a GAIA account.

    Requires bot API key in X-Bot-API-Key header for authentication.
    """
    is_authenticated = await PlatformLinkService.is_authenticated(
        platform, platform_user_id
    )
    return PlatformAuthStatusResponse(
        authenticated=is_authenticated,
        platform=platform,
        platform_user_id=platform_user_id,
    )
