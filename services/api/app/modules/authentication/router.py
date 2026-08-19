"""Authentication routes: registration and email verification."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import RedirectResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.database.session import get_session
from app.modules.authentication.exceptions import InvalidGoogleSessionError
from app.modules.authentication.rate_limit import enforce_rate_limit
from app.modules.authentication.schemas import (
    GoogleSessionRequest,
    LoginRequest,
    LoginResponse,
    PendingSignup,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResendVerificationResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.modules.authentication.github_oauth import exchange_github_code, parse_github_state
from app.modules.authentication.google_oauth import exchange_google_code, parse_google_state
from app.modules.authentication.oauth_tickets import consume_oauth_ticket, save_oauth_ticket
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

    queue_verification_email(
        to_email=issued.email,
        full_name=issued.full_name,
        code=issued.raw_code,
    )

    return RegisterResponse(
        user=PendingSignup(full_name=issued.full_name, email=issued.email),
        next_step="verify_email",
        message="Please check your email to verify your account.",
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
    redis: Redis = Depends(get_redis_client),
) -> LoginResponse:
    # Per-IP abuse control on the password check (fails open if Redis is
    # unreachable) — without this the endpoint is brute-forceable.
    await enforce_rate_limit(
        redis,
        scope="login",
        identifier=_client_ip(request),
        limit=settings.login_rate_limit_per_ip,
        window_seconds=settings.login_rate_limit_per_ip_window_seconds,
    )
    user = await service.login(payload.email, payload.password)
    return LoginResponse(
        user=UserPublic.model_validate(user),
        message="Signed in successfully.",
    )


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str | None = Query(None),
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
    redis: Redis = Depends(get_redis_client),
) -> RedirectResponse:
    """Google redirects the browser here after consent. The `state` echo
    carries the PKCE verifier and the return route
    (`<csrf>.<verifier>.<route>`), which the frontend generated and which
    is required to exchange the one-time `code`.

    On success the user is created or signed in, a single-use ticket is
    issued, and the browser is redirected back to the SPA (the route it
    came from — signin or signup) which swaps the ticket for the user via
    `/auth/oauth/session`.
    """
    code_verifier, route = parse_google_state(state)
    google_user = await exchange_google_code(
        code=code, code_verifier=code_verifier, settings=settings
    )
    user = await service.social_signup_or_login(
        email=google_user.email, name=google_user.name
    )
    ticket = await save_oauth_ticket(
        redis, email=user.email, ttl_seconds=settings.oauth_ticket_ttl_seconds
    )
    return_path = "/signin" if route == "signin" else "/signup"
    return RedirectResponse(
        status_code=status.HTTP_303_SEE_OTHER,
        url=f"{settings.frontend_url}{return_path}?oauth_session={ticket}",
    )


@router.get("/github/callback")
async def github_callback(
    code: str = Query(...),
    state: str | None = Query(None),
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
    redis: Redis = Depends(get_redis_client),
) -> RedirectResponse:
    """GitHub redirects the browser here after authorization. The `state`
    echo carries the return route (`<csrf>.<route>`); the one-time `code`
    is exchanged with the client secret (GitHub OAuth Apps don't use
    PKCE).

    On success the user is created or signed in, a single-use ticket is
    issued, and the browser is redirected back to the SPA (the route it
    came from — signin or signup) which swaps the ticket for the user via
    `/auth/oauth/session`.
    """
    route = parse_github_state(state)
    github_user = await exchange_github_code(code=code, settings=settings)
    user = await service.social_signup_or_login(
        email=github_user.email, name=github_user.name
    )
    ticket = await save_oauth_ticket(
        redis, email=user.email, ttl_seconds=settings.oauth_ticket_ttl_seconds
    )
    return_path = "/signin" if route == "signin" else "/signup"
    return RedirectResponse(
        status_code=status.HTTP_303_SEE_OTHER,
        url=f"{settings.frontend_url}{return_path}?oauth_session={ticket}",
    )


@router.post("/oauth/session", response_model=LoginResponse)
async def oauth_session(
    payload: GoogleSessionRequest,
    service: AuthService = Depends(get_auth_service),
    redis: Redis = Depends(get_redis_client),
) -> LoginResponse:
    """Swaps the single-use ticket from an OAuth callback (Google, GitHub,
    …) for the signed-in user — the SPA calls this after the browser lands
    back on /signin or /signup."""
    email = await consume_oauth_ticket(redis, payload.ticket)
    if email is None:
        raise InvalidGoogleSessionError()
    user = await service.get_user_by_email(email)
    if user is None:
        raise InvalidGoogleSessionError()
    return LoginResponse(
        user=UserPublic.model_validate(user),
        message="Signed in.",
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    payload: VerifyEmailRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
    redis: Redis = Depends(get_redis_client),
) -> VerifyEmailResponse:
    # Application-side abuse control (fails open if Redis is unreachable) —
    # a 6-digit code is brute-forceable without this.
    await enforce_rate_limit(
        redis,
        scope="email_otp_verify",
        identifier=_client_ip(request),
        limit=settings.email_otp_verify_rate_limit_per_ip,
        window_seconds=settings.email_otp_verify_rate_limit_per_ip_window_seconds,
    )
    user = await service.verify_email(payload.email, payload.code)
    return VerifyEmailResponse(
        status="active",
        message="Email verified successfully.",
        user=UserPublic.model_validate(user),
    )


@router.post("/resend-verification", response_model=ResendVerificationResponse)
async def resend_verification(
    payload: ResendVerificationRequest,
    service: AuthService = Depends(get_auth_service),
) -> ResendVerificationResponse:
    issued = await service.resend_verification(payload.email)
    if issued is not None:
        queue_verification_email(
            to_email=issued.email,
            full_name=issued.full_name,
            code=issued.raw_code,
        )
    return ResendVerificationResponse(
        message=(
            "If an account exists for this email and is pending verification, "
            "a new code has been sent."
        )
    )
