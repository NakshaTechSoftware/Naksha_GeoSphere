import asyncio
import traceback
from datetime import date
from app.modules.environment import gfs_weather
from app.services.redis_client import get_redis_client

async def trace_full_path():
    redis = await get_redis_client()
    
    try:
        grid = await gfs_weather.get_latest_complete_cycle(redis)
        print('Latest cycle:', grid)
    except Exception as e:
        print('get_latest_complete_cycle error:', type(e).__name__, str(e))
        traceback.print_exc()

asyncio.run(trace_full_path())