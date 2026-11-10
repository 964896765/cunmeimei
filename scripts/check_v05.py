"""Static V0.5 checks. Does not replace PostgreSQL/WeChat integration."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
read=lambda p:(root/p).read_text(encoding='utf-8')
app=json.loads(read('miniprogram/app.json'))
assert len(app['tabBar']['list'])==5
assert len(app['pages'])>=14
assert [x['text'] for x in app['tabBar']['list']]==['首页','发现','发布','消息','我的']
manifest=read('backend/src/schema-migrations.js')
assert 'pg_advisory_lock' in manifest and 'ROLLBACK' in manifest and 'checksum' in manifest
assert 'verifySchema' in read('backend/src/pg-repository.js')
assert 'await repo.verifySchema()' in read('backend/src/server.js')
assert "b.hold_expires_at>clock_timestamp()" in read('backend/src/operations-pg.js')
assert 'PG_TEST_DATABASE_URL' in read('backend/tests/postgres.test.js')
assert "Date.now()+8*3600000" in read('miniprogram/pages/booking/index.js')
assert 'wx.request' in read('miniprogram/utils/api.js')
print('PASS: V0.5 migrations, PostgreSQL gate, booking deadline, CST date, five tabs')
