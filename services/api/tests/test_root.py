from httpx import AsyncClient


async def test_root_returns_platform_metadata(client: AsyncClient) -> None:
    response = await client.get("/")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Naksha GeoSphere"
    assert body["health_url"] == "/api/v1/health"
    assert "docs_url" in body


async def test_root_does_not_leak_stack_traces(client: AsyncClient) -> None:
    response = await client.get("/")
    assert "Traceback" not in response.text
