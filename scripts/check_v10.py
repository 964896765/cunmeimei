#!/usr/bin/env python3
"""V0.10 static project contract checks. Does not replace WeChat compiler or PostgreSQL."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent.parent
app=json.loads((ROOT/'miniprogram/app.json').read_text(encoding='utf-8'))
assert len(app['pages'])==15, 'Unexpected pages change'
assert len(app['tabBar']['list'])==5, 'Bottom navigation changed'
api=(ROOT/'backend/src/server.js').read_text(encoding='utf-8')
pg=(ROOT/'backend/src/pg-repository.js').read_text(encoding='utf-8')
mem=(ROOT/'backend/src/memory-repository.js').read_text(encoding='utf-8')
client=(ROOT/'miniprogram/pages/discover/index.js').read_text(encoding='utf-8')
wxml=(ROOT/'miniprogram/pages/discover/index.wxml').read_text(encoding='utf-8')
pgtest=(ROOT/'backend/tests/postgres.test.js').read_text(encoding='utf-8')
assert 'pagination:{page,pageSize,hasMore:' in api
assert 'limit:pageSize+1,offset' in api
assert 'LIMIT $4 OFFSET $5' in pg and 'ORDER BY created_at DESC, id DESC' in pg
assert 'async getItem(itemId)' in mem and 'const p=pubs.find(x=>x.id===itemId)' in mem
assert 'loadMore(){' in client and '&pageSize=20' in client
assert 'bindtap="loadMore"' in wxml
assert pgtest.index('const hiddenAuthor=')<pgtest.index('repo.createBooking(hiddenAuthor')
print('PASS V0.10: pagination/server/frontend/DB-test bug fixed; 15 pages and 5 tabs retained')
