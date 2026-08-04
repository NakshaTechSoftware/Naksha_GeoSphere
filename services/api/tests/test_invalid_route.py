from httpx import AsyncClient


async def test_unknown_route_returns_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/this-route-does-not-exist")
    assert response.status_code == 404


async def test_unknown_root_level_route_returns_404(client: AsyncClient) -> None:
    response = await client.get("/nonexistent-page")
    assert response.status_code == 404
