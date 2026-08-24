import urllib.request
import urllib.error

urls = [
    'http://localhost:8200/api/v1/environment/weather-map/gfs/temperature?forecast_hour=0',
    'http://localhost:8200/api/v1/environment/weather-map/gfs/wind?forecast_hour=0',
    'http://localhost:8200/api/v1/health',
]

for url in urls:
    try:
        r = urllib.request.urlopen(url, timeout=10)
        print(f'SUCCESS: {url}')
        print(f'  Status: {r.status}')
        print(f'  Content-Type: {r.headers.get("Content-Type", "none")}')
        data = r.read()[:300]
        print(f'  Body: {data.decode("utf-8", errors="replace")}')
    except urllib.error.HTTPError as e:
        print(f'HTTP ERROR: {url}')
        print(f'  Status: {e.code}')
        print(f'  Reason: {e.reason}')
        print(f'  Header: {e.headers.get("Content-Type", "none")}')
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f'  Body: {body}')
    except urllib.error.URLError as e:
        print(f'URL ERROR: {url}')
        print(f'  Reason: {e.reason}')
    except Exception as e:
        print(f'OTHER ERROR: {url}')
        print(f'  {type(e).__name__}: {e}')
    print()