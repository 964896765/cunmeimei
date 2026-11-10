"""Extract public administrative display centers; never store boundary polygons.

These approximate centers only set the initial map viewport. They are not GPS
fixes, business locations or evidence of an approved public map point.
"""
import concurrent.futures
import hashlib
import json
import time
from pathlib import Path
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://geo.datav.aliyun.com/areas_v3/bound/'
catalog = json.loads((ROOT / 'miniprogram/data/city-catalog.json').read_text(encoding='utf-8'))
cities = catalog['cities']
sources = {}
points = {}


def read(code, suffix='_full'):
    url = f'{BASE}{code}{suffix}.json'
    with urllib.request.urlopen(url, timeout=25) as response:
        raw = response.read()
    return url, hashlib.sha256(raw).hexdigest(), json.loads(raw)['features']


def collect(result):
    url, digest, features = result
    sources[url] = digest
    for feature in features:
        value = feature['properties']
        center = value.get('center')
        if isinstance(center, list) and len(center) == 2:
            points[str(value['adcode'])] = center


collect(read('100000'))
provinces = sorted({city['provinceCode'] + '0000' for city in cities})
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for result in pool.map(read, provinces):
        collect(result)
missing = [city for city in cities if city['code'] not in points and city['provinceCode'] not in ['11', '12', '31', '50']]
for city in missing:
    try:
        collect(read(city['code'], ''))
    except Exception:
        print('Unavailable center:', city['code'])
centers = {}
for city in cities:
    point = points.get(city['code'])
    if point is None and city['provinceCode'] in ['11', '12', '31', '50']:
        point = points.get(city['provinceCode'] + '0000')
    if point is not None:
        centers[city['code']] = {'longitude': point[0], 'latitude': point[1]}
for city in cities:
    if city['code'] in centers:
        continue
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'q': city['name'] + ' 新疆 中国', 'format': 'jsonv2', 'limit': 1})
    request = urllib.request.Request(url, headers={'User-Agent': 'CityLife-miniapp-development/0.25 (administrative display centers)'})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read()
        rows = json.loads(raw)
        if rows and rows[0].get('name') == city['name'] and rows[0].get('type') == 'administrative' and '中国' in rows[0].get('display_name', ''):
            centers[city['code']] = {'latitude': float(rows[0]['lat']), 'longitude': float(rows[0]['lon'])}
            sources[url] = hashlib.sha256(raw).hexdigest()
    finally:
        time.sleep(1)  # Respect the public Nominatim service's one-request-per-second limit.
output = {'source': {'version': 'datav-display-centers-2026-10-19', 'url': BASE,
                     'purpose': 'Approximate city display centers only, not verified business locations or GPS',
                     'attribution': ['DataV geographic display centers', 'OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright'],
                     'precision': 'Approximate initial viewports only; not for precise geolocation or distance calculations',
                     'scope': 'Only city codes already present in the project catalog', 'inputHashes': sources},
          'centers': centers}
encoded = json.dumps(output, ensure_ascii=False, separators=(',', ':'))
(ROOT / 'miniprogram/data/city-centers.json').write_text(encoded + '\n', encoding='utf-8')
(ROOT / 'miniprogram/data/city-centers.js').write_text('// Generated display centers; provenance: city-centers.json\nmodule.exports=' + encoded + ';\n', encoding='utf-8')
print(f'City center coverage: {len(centers)}/{len(cities)}')
print('Missing codes:', [city['code'] for city in cities if city['code'] not in centers])
