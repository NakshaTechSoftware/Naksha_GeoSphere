import asyncio
import httpx
from eccodes import codes_grib_new_from_file, codes_get, codes_get_values, codes_get_array, codes_release
import tempfile
import os

async def debug_gfs():
    url = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?file=gfs.t00z.pgrb2.0p25.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&lev_2_m_above_ground=on&var_TMP=on&lev_surface=on&var_PRATE=on&lev_entire_atmosphere=on&var_TCDC=on&dir=/gfs.20260813/00/atmos'
    
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
        print('Status:', r.status_code)
        print('Content-Type:', r.headers.get('content-type'))
        print('Content-Length:', len(r.content))
        body = r.content
        
        if not body.startswith(b'GRIB'):
            print('First 20 bytes:', body[:20])
            return
        
        print('Valid GRIB file, proceeding to decode...')
        
        with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as tmp:
            tmp.write(body)
            tmp_path = tmp.name
        
        try:
            with open(tmp_path, 'rb') as handle:
                messages = 0
                while True:
                    gid = codes_grib_new_from_file(handle)
                    if gid is None:
                        break
                    messages += 1
                    try:
                        short_name = str(codes_get(gid, 'shortName'))
                        Ni = int(codes_get(gid, 'Ni'))
                        Nj = int(codes_get(gid, 'Nj'))
                        values = [float(v) for v in codes_get_values(gid)]
                        lat_arr = sorted(float(v) for v in codes_get_array(gid, 'distinctLatitudes'))
                        lon_arr = sorted(float(v) for v in codes_get_array(gid, 'distinctLongitudes'))
                        print(f'Message {messages}: {short_name}, Ni={Ni}, Nj={Nj}, values={len(values)}, lats={len(lat_arr)}, lons={len(lon_arr)}')
                    except Exception as e:
                        print(f'Message {messages}: Error: {type(e).__name__}: {e}')
                    finally:
                        codes_release(gid)
            print(f'Total messages decoded: {messages}')
        finally:
            os.remove(tmp_path)

asyncio.run(debug_gfs())