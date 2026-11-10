#!/usr/bin/env python3
"""V0.3 basic static route/schema contract checks; not a WeChat compiler."""
import json
from pathlib import Path
r=Path(__file__).resolve().parents[1]
app=json.loads((r/'miniprogram/app.json').read_text())
assert len(app['tabBar']['list'])==5
assert len(app['pages'])>=14
for page in app['pages']:
 for ext in ['js','wxml','wxss','json']:
  p=r/'miniprogram'/f'{page}.{ext}'
  assert p.exists(), str(p)
for p in ['merchant-services','merchant-bookings','merchant-team']:
 assert (r/'miniprogram/pages'/p/'index.wxml').is_file()
assert (r/'backend/migrations/002_merchant_ops.sql').exists()
for name in ['operations-memory.js','operations-pg.js']:
 assert (r/'backend/src'/name).exists()
server=(r/'backend/src/server.js').read_text()
for route in ['/api/v1/reports','/api/v1/me/merchants','/admin/api/review-report','/admin/api/approve-merchant','/admin/api/review-service']:
 assert route in server,route
settings=(r/'miniprogram/utils/runtime.js').read_text()
assert "mode: 'demo'" in settings and 'devLogin: false' in settings
print('PASS: V0.3 at least 14 pages, 5 tabs, two repository drivers, review API routes, demo default')
