"""V0.6 static checks; NOT equivalent to WeChat compilation or PostgreSQL integration."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
r=lambda x:(root/x).read_text(encoding='utf8')
app=json.loads(r('miniprogram/app.json'))
assert len(app['tabBar']['list'])==5
assert len(app['pages'])==15
assert 'pages/regions/index' in app['pages']
assert '004_region_taxonomy.sql' in [x.name for x in (root/'backend/migrations').glob('*.sql')]
assert 'seedRegions' in r('backend/src/pg-repository.js')
assert 'setCategoryEnabled' in r('backend/src/pg-repository.js')
assert '/admin/api/categories/status' in r('backend/src/server.js')
assert '/admin/api/regions/status' in r('backend/src/server.js')
assert "['merchant','housing','used','service','community']" in r('backend/src/server.js')
assert "regionPref.selected" in r('miniprogram/pages/home/index.js')
assert "regionPref.save" in r('miniprogram/pages/regions/index.js')
assert "mode: 'demo'" in r('miniprogram/utils/runtime.js')
print('PASS: V0.6 five tabs, 15 pages, region selector, taxonomy gates, migration and demo default')
