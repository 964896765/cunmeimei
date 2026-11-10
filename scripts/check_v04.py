"""V0.4 static contract checks; not a WeChat compiler or real PostgreSQL test."""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
read=lambda x: (root/x).read_text(encoding='utf-8')
app=json.loads(read('miniprogram/app.json'))
assert len(app['tabBar']['list'])==5
assert len(app['pages'])>=14
server=read('backend/src/server.js')
for route in ['/api/v1/merchant-applications','/api/v1/bookings']:
    assert route in server
assert 'admin\\/api\\/licenses' in server or '/admin/api/licenses' in server
assert 'services\\/' in server or '/api/v1/services' in server
assert 'readUpload(req)' in server and 'admin(req)' in server
assert 'availableSlots(serviceId,date)' in read('backend/src/memory-repository.js')
assert 'availableSlots(serviceId,date)' in read('backend/src/pg-repository.js')
assert 'uq_booking_active_slot' in read('backend/migrations/003_private_licenses_slots.sql')
assert 'merchant_license_files' in read('backend/migrations/003_private_licenses_slots.sql')
assert 'chooseLicense' in read('miniprogram/pages/merchant/index.js')
assert 'loadSlots' in read('miniprogram/pages/booking/index.js')
assert "mode: 'demo'" in read('miniprogram/utils/runtime.js')
print('PASS: V0.4 static API, privacy, slot, navigation and migration contracts')
