import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


def test_settings_load_from_environment() -> None:
    settings = get_settings()
    assert settings.app_name == "Naksha GeoSphere"
    assert settings.app_env == "testing"


def test_cors_origins_parsed_from_comma_separated_string(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example.com, https://b.example.com")
    settings = Settings()  # type: ignore[call-arg]
    assert settings.cors_origins == ["https://a.example.com", "https://b.example.com"]


def test_docs_disabled_in_production_even_if_flag_is_true(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("API_DOCS_ENABLED", "true")
    settings = Settings()  # type: ignore[call-arg]
    assert settings.docs_enabled is False


def test_missing_required_secret_raises_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]
