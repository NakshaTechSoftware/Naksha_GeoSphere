import os
import sys

env_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ[k.strip()] = v.strip().strip('"')

sys.path.insert(0, os.getcwd())
from app.main import app
for route in app.routes:
    if hasattr(route, 'path') and 'weather' in route.path:
        methods = ','.join(sorted(route.methods)) if hasattr(route, 'methods') else ''
        print(f'{methods} {route.path}')