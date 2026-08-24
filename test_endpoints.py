import urllib.request
import urllib.error
import json

endpoints = [
    'http://127.0.0.1:8000/api/v1/environment/weather-map/gfs/wind?forecast_hour=0',
    'http://127.0.0.1:8000/api/v1/environment/weather-map/gfs/clouds?forecast_hour=0',
    'http://127.0.0.1:8000/api/v1/environment/weather-map/gfs/precipitation?forecast_hour=0',
]

for url in endpoints:
    try:
        r = urllib.request.urlopen(url, timeout=30)
        print(f'=== {url.split("/")[-1]} ===')
        print(f'Status: {r.status}')
        body = r.read().decode()[:300]
        print(f'Body: {body}')
        print()
    except urllib.error.HTTPError as e:
        print(f'=== {url.split("/")[-1]} ===')
        print(f'HTTP Error: {e.code}')
        body = e.read().decode()[:200]
        print(f'Body: {body}')
        print()
    except Exception as e:
        print(f'=== {url.split("/")[-1]} ===')
        print(f'Error: {type(e).__name__}: {e}')
        print()