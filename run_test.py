import sys
sys.path.insert(0, r'H:\Naksha_GeoSphere\services\api')

from datetime import date
from urllib.parse import urlparse, parse_qs
from app.modules.environment import gfs_weather

url = gfs_weather.build_gfs_filter_url(date(2026, 8, 12), 6, 3)
parsed = urlparse(url)
query = parse_qs(parsed.query)

print("Scheme:", parsed.scheme)
print("Netloc:", parsed.netloc)
print("Path:", parsed.path)
print("file:", query.get("file"))
print("dir:", query.get("dir"))
print("leftlon:", query.get("leftlon"))
print("rightlon:", query.get("rightlon"))
print("bottomlat:", query.get("bottomlat"))
print("toplat:", query.get("toplat"))
print("var_UGRD:", query.get("var_UGRD"))
print("var_VGRD:", query.get("var_VGRD"))
print("var_TMP:", query.get("var_TMP"))
print("var_PRATE:", query.get("var_PRATE"))
print("var_TCDC:", query.get("var_TCDC"))
print("lev_10_m_above_ground:", query.get("lev_10_m_above_ground"))
print("lev_2_m_above_ground:", query.get("lev_2_m_above_ground"))
print("lev_surface:", query.get("lev_surface"))
print("lev_entire_atmosphere:", query.get("lev_entire_atmosphere"))
print()
print("No subregion filters = global data requested")