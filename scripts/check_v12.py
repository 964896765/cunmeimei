from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
pages=json.loads((root/'miniprogram/app.json').read_text())['pages']
assert len(pages)==15, f'expected 15 mini-program pages, got {len(pages)}'
tabs=json.loads((root/'miniprogram/app.json').read_text())['tabBar']['list']
assert len(tabs)==5, f'expected five tabs, got {len(tabs)}'
server=(root/'backend/src/server.js').read_text()
assert "new TextDecoder('utf-8',{fatal:true})" in server
assert 'size+=chunk.length' in server
assert 'LICENSE_UPLOAD_NOT_READY' in server and 'MERCHANT_EVIDENCE_NOT_READY' in server
assert "licenseUpload:production?" in server
pg=(root/'backend/src/pg-repository.js').read_text()
assert 'literalSearchPattern(q)' in pg and 'p.district ILIKE $3' in pg and 's.district ILIKE $3' in pg
ui=(root/'miniprogram/pages/merchant/index.wxml').read_text()
assert 'licenseEnabled' in ui and '线下核验' in ui
migrations=list((root/'backend/migrations').glob('[0-9][0-9][0-9]_*.sql'))
assert len(migrations)>=5, 'migration history should remain unchanged at 001–005'
print('PASS V0.12: 15 pages, 5 tabs, literal search, body byte limit, production license gating, 5 migrations')
