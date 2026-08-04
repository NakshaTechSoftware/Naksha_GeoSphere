"""Plain, Celery-independent SMTP sending. Never logs a message body or
recipient — verification emails carry a single-use raw token in the
body, which must never reach the logs."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage

from worker.core.config import WorkerSettings


def build_verification_email(
    *, to_email: str, full_name: str, verification_url: str, from_email: str
) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = "Verify your Naksha GeoSphere account"
    message["From"] = from_email
    message["To"] = to_email
    message.set_content(
        f"Hi {full_name},\n\n"
        "Thanks for creating a Naksha GeoSphere account. Confirm your email "
        "address to finish setting up your account:\n\n"
        f"{verification_url}\n\n"
        "This link expires soon and can only be used once. If you didn't "
        "request this account, you can safely ignore this email.\n\n"
        "— Naksha GeoSphere"
    )
    return message


def send_email(message: EmailMessage, settings: WorkerSettings) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as client:
        if settings.smtp_use_tls:
            client.starttls()
        if settings.smtp_username and settings.smtp_password:
            client.login(settings.smtp_username, settings.smtp_password)
        client.send_message(message)
