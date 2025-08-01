import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from app.config.loggers import mail_webhook_logger as logger
from app.models.mail_models import EmailWebhookRequest
from app.services.mail_webhook_service import queue_email_processing

router = APIRouter()


@router.post(
    "/mail-webhook/receive",
    summary="Process Email Webhook",
)
async def receive_email(request: Request):
    """
    Process incoming email webhook notifications from Gmail.
    The webhook payload contains information about new emails.

    This endpoint receives the webhook, validates the payload,
    and queues a background task for processing.
    """
    try:
        # Log raw request body
        body_bytes = await request.body()
        raw_body = body_bytes.decode("utf-8")

        # Validate request against model
        parsed_body = json.loads(raw_body)
        webhook_request = EmailWebhookRequest(**parsed_body)

        # Extract values already decoded by the model
        email_address = webhook_request.message.emailAddress
        history_id = webhook_request.message.historyId

        if not email_address or not history_id:
            logger.error("Email address or history ID is missing in the request")
            raise HTTPException(
                status_code=422,
                detail="Email address and history ID must be provided.",
            )

        logger.info(f"Parsed: email={email_address}, historyId={history_id}")

        # Use service to queue email processing
        return await queue_email_processing(email_address, history_id)

    except (ValidationError, RequestValidationError) as ve:
        logger.error(f"Validation error: {ve}")
        raise HTTPException(status_code=422, detail=jsonable_encoder(ve.errors()))
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
