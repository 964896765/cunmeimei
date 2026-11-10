"""V0.7 source structure check (not WeChat compiler or live PostgreSQL)."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
app=json.loads((root/'miniprogram/app.json').read_text(encoding='utf8'))
config=json.loads((root/'project.config.json').read_text(encoding='utf8'))
assert len(app['pages'])==15 and len(app['tabBar']['list'])==5
for route in app['pages']:
    for ext in ('.js','.json','.wxml','.wxss'):
        assert (root/'miniprogram'/f'{route}{ext}').is_file(), f'not found: {route}{ext}'
for tab in app['tabBar']['list']:
    assert tab['pagePath'] in app['pages']
    for asset in ('iconPath','selectedIconPath'):
        assert (root/'miniprogram'/tab[asset]).is_file()
assert config['miniprogramRoot']=='miniprogram/'
assert config['appid']=='touristappid', 'real appid should be set locally by operator, not in source snapshot'
assert "mode: 'demo'" in (root/'miniprogram/utils/runtime.js').read_text()
server=(root/'backend/src/server.js').read_text()
for endpoint in ('/api/v1/ready','/api/v1/auth/logout','/admin/api/logout'):
    assert endpoint in server
repo=(root/'backend/src/pg-repository.js').read_text()
assert 'pg_advisory_xact_lock' in repo and 'revokeSession' in repo
assert 'validateDeployment(process.env)' in server
assert (root/'backend/tests/v07.test.js').is_file()
print('PASS: V0.7 structure, auth revocation routes, deployment guards, five tabs, 15 pages')
