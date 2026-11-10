#!/usr/bin/env python3
"""V0.13 structural contracts. Does not replace real PostgreSQL / WeChat tests."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
app=json.loads((root/'miniprogram/app.json').read_text(encoding='utf-8'))
assert len(app['pages'])==15
assert [t['text'] for t in app['tabBar']['list']]==['首页','发现','发布','消息','我的']
server=(root/'backend/src/server.js').read_text(encoding='utf-8')
mapper=(root/'backend/src/public-item.js').read_text(encoding='utf-8')
pg=(root/'backend/src/pg-repository.js').read_text(encoding='utf-8')
mem=(root/'backend/src/memory-repository.js').read_text(encoding='utf-8')
assert "(visible.kind==='service')" in server, 'report type must follow origin, not content type'
assert "isCatalog?'service'" in mapper and "'post':'listing'" in mapper
assert "'publication'::text AS origin" in pg and "'catalog'::text AS origin" in pg
assert 'toPublicItem(x,x.origin)' in pg and 'toPublicItem(row,row.origin)' in pg
assert "toPublicItem(p,'publication')" in mem and "'catalog'" in mem
assert (root/'backend/tests/v13-client.test.js').is_file()
assert len(list((root/'backend/migrations').glob('[0-9][0-9][0-9]_*.sql')))>=5
print('PASS V0.13: 15 pages, five tabs, service source separation, report contract, 5 preserved migrations')
