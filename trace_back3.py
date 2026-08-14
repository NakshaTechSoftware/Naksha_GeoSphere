import asyncio
import traceback
from app.services.redis_client import get_redis_client
from app.modules.environment import gfs_weather

async def trace():
    redis = await get_redis_client()
    try:
        # This is what the API endpoint does
        grid = await gfs_weather._get_combined_grid(redis, 0)
        print('Grid:', grid)
    except Exception as e:
        print('Error:', type(e).__name__, str(e))
        traceback.print_exc()

asyncio.run(trace())