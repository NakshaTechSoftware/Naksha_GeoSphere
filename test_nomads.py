import httpx
from eccodes import codes_grib_new_from_file, codes_get, codes_get_values, codes_get_array, codes_release
import tempfile
import os

async def test_nomads():
    url = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?file=gfs.t00z.pgrb2.0p25.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&lev_2_m_above_ground=on&var_TMP=on&lev_surface=on&var_PRATE=on&lev_entire_atmosphere=on&var_TCDC=on&dir=/gfs.20260813/00/atmos'
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=30)
        print('Status:', r.status_code)
        print('Content-Type:', r.headers.get('content-type'))
        print('Content-Length:', len(r.content))
        print('First 4 bytes:', r.content[:4])
        
        if r.content.startswith(b'GRIB'):
            print('Valid GRIB file')
        else:
            print('NOT a valid GRIB file')
        
        # Now try to decode
        with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as tmp:
            tmp.write(r.content)
            tmp_path = tmp.name
    
    try:
        with open(tmp_path, 'rb') as handle:
            while True:
                gid = codes_grib_new_from_file(handle)
                if gid is None:
                    break
                try:
                    short_name = str(codes_get(gid, 'shortName'))
                    Ni = int(codes_get(gid, 'Ni'))
                    Nj = int(codes_get(gid, 'Nj'))
                    values = [float(v) for v in codes_get_values(gid)]
                    lat_arr = sorted(float(v) for v in codes_get_array(gid, 'distinctLatitudes'))
                    lon_arr = sorted(float(v) for v in codes_get_array(gid, 'distinctLongitudes'))
                    print(f'shortName: {short_name}')
                    print(f'Ni: {Ni}, Nj: {Nj}')
                    print(f'values count: {len(values)}')
                    print(f'latitudes count: {len(lat_arr)}, range: {lat_arr[0]} to {lat_arr[-1]}')
                    print(f'longitudes count: {len(lon_arr)}, range: {lon_arr[0]} to {lon_arr[-1]}')
                except Exception as e:
                    print(f'Error decoding message: {type(e).__name__}: {e}')
                finally:
                    codes_release(gid)
    finally:
        os.remove(tmp_path)

import asyncio
asyncio.run(test_nomads())