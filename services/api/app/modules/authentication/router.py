"""Authentication routes: registration and email verification."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.database.session import get_session
from app.modules.authentication.schemas import (
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResendVerificationResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.modules.authentication.service import AuthService
from app.modules.authentication.tasks import queue_verification_email
from app.modules.users.schemas import UserPublic
from app.services.redis_client import get_redis_client

router = APIRouter(prefix="/auth", tags=["authentication"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def get_auth_service(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(session=session, settings=settings, redis=get_redis_client())


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> RegisterResponse:
    issued = await service.register(payload, client_ip=_client_ip(request))

    verification_url = f"{settings.frontend_url}/verify-email?token={issued.raw_token}"
    queue_verification_email(
        to_email=issued.user.email,
        full_name=issued.user.full_name,
        verification_url=verification_url,
    )

    return RegisterResponse(
        user=UserPublic.model_validate(issued.user),
        next_step="verify_email",
        message="Account created. Please verify your email address.",
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    payload: VerifyEmailRequest,
    service: AuthService = Depends(get_auth_service),
) -> VerifyEmailResponse:
    await service.verify_email(payload.token)
    return VerifyEmailResponse(status="active", message="Email verified successfully.")


@router.post("/resend-verification", response_model=ResendVerificationResponse)
async def resend_verification(
    payload: ResendVerificationRequest,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> ResendVerificationResponse:
    issued = await service.resend_verification(payload.email)
    if issued is not None:
        verification_url = f"{settings.frontend_url}/verify-email?token={issued.raw_token}"
        queue_verification_email(
            to_email=issued.user.email,
            full_name=issued.user.full_name,
            verification_url=verification_url,
        )
    return ResendVerificationResponse(
        message=(
            "If an account exists for this email and is pending verification, "
            "a new link has been sent."
        )
    )
