"""Plain, Celery-independent SMTP sending. Never logs a message body or
recipient — verification emails carry a single-use raw OTP code in the
body, which must never reach the logs."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage

from worker.core.config import WorkerSettings


def build_verification_email(
    *, to_email: str, full_name: str, code: str, from_email: str, expiry_minutes: int
) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = "Your Naksha GeoSphere verification code"
    message["From"] = from_email
    message["To"] = to_email
    message.set_content(
        f"Hi {full_name},\n\n"
        "Thanks for creating a Naksha GeoSphere account. Enter this code on "
        "the signup page to verify your email address:\n\n"
        f"    {code}\n\n"
        f"This code expires in {expiry_minutes} minutes and can only be used "
        "once. If you didn't request this account, you can safely ignore "
        "this email.\n\n"
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
