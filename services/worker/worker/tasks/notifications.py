"""Notification-delivery tasks. Runs on the `notifications` queue."""

from __future__ import annotations

import logging

from worker.core.config import get_worker_settings
from worker.main import app
from worker.notifications.email import build_verification_email, send_email

logger = logging.getLogger(__name__)


@app.task(
    name="notifications.send_verification_email",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_verification_email(
    self: object, *, to_email: str, full_name: str, code: str
) -> None:
    """Never logs `to_email`, `full_name`, or `code` — the latter is the
    single-use raw OTP."""
    settings = get_worker_settings()
    message = build_verification_email(
        to_email=to_email,
        full_name=full_name,
        code=code,
        from_email=settings.smtp_from_email,
        expiry_minutes=settings.email_verification_expiry_minutes,
    )
    try:
        send_email(message, settings)
        logger.info("Verification email queued for delivery")
    except Exception as exc:  # noqa: BLE001 — retry on any SMTP failure
        logger.error("Verification email delivery failed: %s", type(exc).__name__)
        raise self.retry(exc=exc)  # type: ignore[attr-defined]
