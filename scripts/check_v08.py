"""V0.8 static contract checks; does not substitute for WeChat IDE / PostgreSQL execution."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1]
app=json.loads((p/'miniprogram/app.json').read_text())
assert len(app['pages'])==15
assert [t['text'] for t in app['tabBar']['list']]==['首页','发现','发布','消息','我的']
for filename in ('backend/tests/v08.test.js','backend/tests/release-config.test.js','scripts/check_wx_release.js','infrastructure/compose.postgres-test.yml','scripts/test_pg_local.ps1'):
    assert (p/filename).is_file(),filename
server=(p/'backend/src/server.js').read_text()
assert '/withdraw' in server and 'withdrawPublication' in server
for file in ('backend/src/memory-repository.js','backend/src/pg-repository.js','miniprogram/utils/storage.js'):
    assert 'withdrawPublication' in (p/file).read_text()
assert 'validCalendarDate(date)' in server
assert '撤回信息' in (p/'miniprogram/pages/my-posts/index.wxml').read_text()
assert 'PG_LOCAL_PASSWORD' in (p/'infrastructure/compose.postgres-test.yml').read_text()
print('PASS: V0.8 contracts; 15 pages, 5 tabs, withdraw, release checker, test DB helper')
