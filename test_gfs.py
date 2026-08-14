import httpx
import tempfile
from eccodes import codes_grib_new_from_file, codes_get, codes_get_values, codes_get_array, codes_release

async def test():
    url = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?file=gfs.t00z.pgrb2.0p25.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&lev_2_m_above_ground=on&var_TMP=on&lev_surface=on&var_PRATE=on&lev_entire_atmosphere=on&var_TCDC=on&dir=/gfs.20260813/00/atmos"
    
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
        r.raise_for_status()
        body = r.content
    
    print(f"Downloaded {len(body)} bytes, starts with: {body[:4]}")
    
    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as tmp:
        tmp.write(body)
        tmp_path = tmp.name
    
    with open(tmp_path, "rb") as handle:
        while True:
            gid = codes_grib_new_from_file(handle)
            if gid is None:
                break
            
            try:
                short_name = str(codes_get(gid, "shortName"))
                print(f"shortName: {short_name}")
                width = int(codes_get(gid, "Ni"))
                height = int(codes_get(gid, "Nj"))
                print(f"Ni: {width}, Nj: {height}")
                values = [float(v) for v in codes_get_values(gid)]
                print(f"values count: {len(values)}")
                latitudes = sorted(float(v) for v in codes_get_array(gid, "distinctLatitudes"))
                longitudes = sorted(float(v) for v in codes_get_array(gid, "distinctLongitudes"))
                print(f"latitudes count: {len(latitudes)}, longitudes count: {len(longitudes)}")
                print(f"lat range: {latitudes[0]} to {latitudes[-1]}")
                print(f"lon range: {longitudes[0]} to {longitudes[-1]}")
            except Exception as e:
                print(f"Error: {e}")
            finally:
                codes_release(gid)
    
    import os
    os.remove(tmp_path)

import asyncio
asyncio.run(test())