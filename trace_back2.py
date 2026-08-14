import asyncio
import traceback
from app.services.redis_client import get_redis_client
from app.modules.environment import gfs_weather

async def trace():
    redis = await get_redis_client()
    try:
        grid = await gfs_weather.get_latest_complete_cycle(redis)
        print('Cycle:', grid)
    except Exception as e:
        print('Error:', type(e).__name__, str(e))
        traceback.print_exc()

asyncio.run(trace())