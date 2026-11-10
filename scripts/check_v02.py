#!/usr/bin/env python3
"""Static V0.2 integration check; does not replace WeChat DevTools compilation."""
from pathlib import Path
import re, json
root=Path(__file__).resolve().parents[1]
cfg=json.loads((root/'miniprogram/app.json').read_text())
assert len(cfg['tabBar']['list'])==5
for page in cfg['pages']:
 for ext in ['js','wxml','wxss','json']:
  assert (root/'miniprogram'/f'{page}.{ext}').exists(),f'missing: {page}.{ext}'
for page in ['home','discover','publish','detail','booking','my-bookings','my-posts','merchant','messages','me']:
 src=(root/'miniprogram/pages'/page/'index.js').read_text()
 assert "utils/api" in src or "('../../utils/api')" in src,f'missing API integration: {page}'
settings=(root/'miniprogram/utils/runtime.js').read_text()
assert "mode: 'demo'" in settings and "devLogin: false" in settings
assert (root/'backend/migrations/001_init.sql').exists()
for pattern in ['backend/.env','backend/node_modules/']:
 assert pattern in (root/'.gitignore').read_text()
print('PASS: V0.2 switch, 10 integrated pages, 5 navigation entries, server schema, ignored secrets')
