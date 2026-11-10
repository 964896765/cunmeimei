#!/usr/bin/env python3
"""V0.24 deliverable guard: do not count static checks as runtime acceptance."""
import json, pathlib, hashlib
root=pathlib.Path(__file__).resolve().parents[1]
base=root.parent/'city-life-miniapp-v0.23'
app=json.loads((root/'miniprogram/app.json').read_text())
old=json.loads((base/'miniprogram/app.json').read_text())
assert app==old, 'unexpected WeChat page or tabBar changes'
assert len(app['pages'])==15
assert [x['text'] for x in app['tabBar']['list']]==['首页','发现','发布','消息','我的']
assert len(list((root/'backend/migrations').glob('*.sql')))==5
for prior in (base/'backend/migrations').glob('*.sql'):
    current=root/'backend/migrations'/prior.name
    assert current.exists() and hashlib.sha256(current.read_bytes()).digest()==hashlib.sha256(prior.read_bytes()).digest(),prior.name
assert '0.24.0' in (root/'backend/package.json').read_text()
assert 'trustedProxyIps' in (root/'backend/src/server.js').read_text()
assert (root/'backend/tests/v24-proxy-rate-limit.test.js').exists()
print('V0.24 static package check: 15 pages, 5 tabs, 5 unchanged migrations, trusted-proxy tests present')
print('PostgreSQL/WeChat real-environment acceptance: NOT COVERED by this check')
