"""V0.9 static checks: useful without claiming real WeChat compilation."""
from pathlib import Path
import json, subprocess
root=Path(__file__).resolve().parents[1]
mini=root/'miniprogram'
app=json.loads((mini/'app.json').read_text(encoding='utf-8'))
config=json.loads((root/'project.config.json').read_text(encoding='utf-8'))
assert len(app['pages'])==15, 'page count changed unexpectedly'
assert [t['text'] for t in app['tabBar']['list']]==['首页','发现','发布','消息','我的']
assert config.get('miniprogramRoot')=='miniprogram/'
for item in app['pages']:
    for ext in ('js','json','wxml','wxss'):
        file=mini/f'{item}.{ext}'
        assert file.is_file(),f'missing page file: {file}'
    json.loads((mini/f'{item}.json').read_text(encoding='utf-8'))
for tab in app['tabBar']['list']:
    assert tab['pagePath'] in app['pages']
    assert (mini/tab['iconPath']).is_file()
    assert (mini/tab['selectedIconPath']).is_file()
for item in ['backend/src/test-database-guard.js','backend/tests/v09.test.js','backend/tests/test-database-guard.test.js','docs/V09_HANDOFF.md']:
    assert (root/item).is_file(),item
repo=(root/'backend/src/pg-repository.js').read_text(encoding='utf-8')
assert 'JOIN service_regions r ON r.name=p.district AND r.enabled=true' in repo
assert 'JOIN service_regions r ON r.name=s.district AND r.enabled=true' in repo
assert 'await repo.verifySchema()' in (root/'backend/src/server.js').read_text(encoding='utf-8')
print('PASS V0.9: 15 pages, 5 tabs, asset paths, region visibility, DB readiness contract')
