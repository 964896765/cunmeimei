#!/usr/bin/env python3
"""V0.11 static contracts; does not replace WeChat tool or a PostgreSQL instance."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
app=json.loads((ROOT/'miniprogram/app.json').read_text('utf-8'))
assert len(app['pages'])==15 and len(app['tabBar']['list'])==5
server=(ROOT/'backend/src/server.js').read_text('utf-8')
mem=(ROOT/'backend/src/memory-repository.js').read_text('utf-8')
pg=(ROOT/'backend/src/pg-repository.js').read_text('utf-8')
client=(ROOT/'miniprogram/pages/my-posts/index.js').read_text('utf-8')
markup=(ROOT/'miniprogram/pages/my-posts/index.wxml').read_text('utf-8')
sql=(ROOT/'backend/migrations/005_publication_revision.sql').read_text('utf-8')
assert "m==='PUT'" in server and 'PUBLICATION_CHANGED' in server
assert 'updatePublication(uid,pid,v,expectedRevision)' in mem
assert 'updatePublication(uid,id,v,expectedRevision)' in pg and 'FOR UPDATE' in pg
assert "status='pending'" in pg and 'revision=revision+1' in pg
assert 'revision integer' in sql and 'updated_at timestamptz' in sql
assert 'saveEdit(){' in client and "request('PUT'" in client
assert 'catchtap="startEdit"' in markup and 'bindtap="saveEdit"' in markup
print('PASS V0.11: edit/review/revision safeguards, SQL migration, 15 pages and five tabs')
