"""V0.25 source integrity checks; runtime and WeChat acceptance are separate."""
from pathlib import Path
import json, hashlib, copy
root=Path(__file__).resolve().parents[1]
baseline=json.loads((root/'scripts/v24-baseline.json').read_text(encoding='utf-8'))
for name,digest in baseline.items():
    data=(root/name).read_bytes()
    if name=='miniprogram/app.json':
        # PRISM4 intentionally updates five display colors, not routes or behavior.
        # Restore exactly these authorized fields before checking the original hash.
        current=json.loads(data)
        expected={('window','navigationBarBackgroundColor'):'#FAF8FB',('window','backgroundColor'):'#FAF8FB',('tabBar','color'):'#62545F',('tabBar','selectedColor'):'#744E68',('tabBar','backgroundColor'):'#FFFFFF'}
        original={('window','navigationBarBackgroundColor'):'#F7F9F8',('window','backgroundColor'):'#F7F9F8',('tabBar','color'):'#8A9691',('tabBar','selectedColor'):'#176B5B',('tabBar','backgroundColor'):'#FFFFFF'}
        normalized=copy.deepcopy(current)
        # V1 login explicitly adds privacy checking and the confirmed product name.
        assert current['__usePrivacyCheck__'] is True
        del normalized['__usePrivacyCheck__']
        assert current['window']['navigationBarTitleText']=='青方睐村美美'
        normalized['window']['navigationBarTitleText']='同城生活'
        # Only the explicitly requested curved bottom border requires custom rendering.
        assert current['tabBar']['custom'] is True
        del normalized['tabBar']['custom']
        # Explicitly requested, user-triggered city/map GPS; no other permission is added.
        assert current['permission']=={'scope.userLocation':{'desc':'用于定位当前城市及地图位置'}}
        assert current['requiredPrivateInfos']==['getLocation']
        del normalized['permission']
        del normalized['requiredPrivateInfos']
        added=['pages/search/index','pages/categories/index','pages/map/index',
               'pages/publish-form/index','pages/drafts/index','pages/verification/index','pages/information/index','pages/commerce/index','pages/industry/index','pages/login/index','pages/legal/index','pages/business/index']
        assert current['pages'][-len(added):]==added,'Unexpected added page routes'
        normalized['pages']=current['pages'][:-len(added)]
        for (section,key),value in expected.items():
            assert current[section][key]==value,f'{section}.{key}: unexpected palette color'
            normalized[section][key]=original[(section,key)]
        data=(json.dumps(normalized,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    assert hashlib.sha256(data).hexdigest()==digest,name
assert len(list((root/'backend/migrations').glob('*.sql')))>=5
app=json.loads((root/'miniprogram/app.json').read_text(encoding='utf-8'))
assert len(app['pages'])==27
assert [t['text'] for t in app['tabBar']['list']]==['首页','发现','发布','消息','我的']
assert json.loads((root/'backend/package.json').read_text(encoding='utf-8'))['version']=='0.25.0'
print('PASS: original 15 pages/five tabs retained; 12 approved routes, brand and privacy check added; PRISM4 colors checked; migrations 001-005 unchanged')
