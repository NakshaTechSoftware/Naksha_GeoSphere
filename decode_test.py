import asyncio
import httpx
from eccodes import codes_grib_new_from_file, codes_get, codes_get_values, codes_get_array, codes_release
import tempfile
import os

async def test_decode():
    url = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?file=gfs.t06z.pgrb2.0p25.f000&lev_10_m_above_ground=on&var_TMP=on&lev_surface=on&var_UGRD=on&var_VGRD=on&lev_entire_atmosphere=on&var_PRATE=on&var_TCDC=on&dir=/gfs.20260812/06/atmos'
    
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
        body = r.content
        
        with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as tmp:
            tmp.write(body)
            tmp_path = tmp.name
        
        try:
            with open(tmp_path, 'rb') as handle:
                slots = {}
                while True:
                    gid = codes_grib_new_from_file(handle)
                    if gid is None:
                        break
                    
                    try:
                        short_name = str(codes_get(gid, 'shortName'))
                        slot = short_name
                        
                        width = int(codes_get(gid, 'Ni'))
                        height = int(codes_get(gid, 'Nj'))
                        values = [float(v) for v in codes_get_values(gid)]
                        
                        # Normalize grid values (south->north, west->east)
                        rows = [values[row * width : (row + 1) * width] for row in range(height)]
                        if not bool(int(codes_get(gid, 'jScansPositively'))):
                            rows = list(reversed(rows))
                        i_scans = bool(int(codes_get(gid, 'iScansNegatively')))
                        if i_scans:
                            rows = [list(reversed(row)) for row in rows]
                        normalized = [value for row in rows for value in row]
                        
                        latitudes = sorted(float(v) for v in codes_get_array(gid, 'distinctLatitudes'))
                        longitudes = sorted(float(v) for v in codes_get_array(gid, 'distinctLongitudes'))
                        
                        slots[slot] = {
                            'data_date': int(codes_get(gid, 'dataDate')),
                            'data_time': int(codes_get(gid, 'dataTime')),
                            'validity_date': int(codes_get(gid, 'validityDate')),
                            'validity_time': int(codes_get(gid, 'validityTime')),
                            'forecast_hour': int(codes_get(gid, 'forecastTime')),
                            'width': width,
                            'height': height,
                            'latitudes': latitudes,
                            'longitudes': longitudes,
                            'values': normalized,
                        }
                    finally:
                        codes_release(gid)
                
                print('Slots decoded:', list(slots.keys()))
                for slot, meta in slots.items():
                    print(f'{slot}: width={meta["width"]}, height={meta["height"]}')
                    print(f'  values count: {len(meta["values"])}')
                    print(f'  latitudes count: {len(meta["latitudes"])}')
                    print(f'  longitudes count: {len(meta["longitudes"])}')
                    print(f'  lat range: {meta["latitudes"][0]} to {meta["latitudes"][-1]}')
                    print(f'  lon range: {meta["longitudes"][0]} to {meta["longitudes"][-1]}')
                    print(f'  first 5 values: {meta["values"][:5]}')
                    print(f'  min value: {min(meta["values"]):.2f}')
                    print(f'  max value: {max(meta["values"]):.2f}')
                    
        finally:
            os.remove(tmp_path)

asyncio.run(test_decode())