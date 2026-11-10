#!/usr/bin/env python3
"""Zero-dependency structural checks for the miniapp package."""
from pathlib import Path
import json, re, sys
root=Path(__file__).resolve().parents[1]
p=root/'miniprogram'
errors=[]
project=json.loads((root/'project.config.json').read_text(encoding='utf-8'))
app=json.loads((p/'app.json').read_text(encoding='utf-8'))
if app.get('tabBar',{}).get('custom'):
 for ext in ['.wxml','.js','.wxss','.json']:
  if not (p/('custom-tab-bar/index'+ext)).is_file(): errors.append('Missing curved TabBar component: '+ext)
if project['miniprogramRoot']!='miniprogram/':errors.append('miniprogramRoot mismatch')
for pg in app['pages']:
 for ext in ['.wxml','.js','.wxss','.json']:
  if not (p/(pg+ext)).exists():errors.append('Missing page file: '+pg+ext)
for tab in app['tabBar']['list']:
 if tab['pagePath'] not in app['pages']:errors.append('Missing tab route: '+tab['pagePath'])
 for k in ['iconPath','selectedIconPath']:
  if not (p/tab[k]).is_file():errors.append('Missing icon '+tab[k])
for js in p.rglob('*.js'):
 if js.stat().st_size==0:errors.append('Empty script: '+str(js))
for template in p.rglob('*.wxml'):
 script=template.with_suffix('.js')
 if not script.is_file(): continue  # Fragments are checked with their including page.
 wxml=template.read_text(encoding='utf-8')
 for include in re.findall(r'<include\b[^>]*\bsrc="([^"]+)"',wxml):
  fragment=template.parent/include
  if fragment.is_file(): wxml+='\n'+fragment.read_text(encoding='utf-8')
  else: errors.append(f'{template}: missing include {include}')
 js=script.read_text(encoding='utf-8')
 for handler in set(re.findall(r'\b(?:bind|catch):?[A-Za-z][\w-]*="([A-Za-z_]\w*)"',wxml)):
  if not re.search(r'\b'+re.escape(handler)+r'\s*\(',js):errors.append(f'{template}: no handler {handler}')
# Every page JSON must parse, and every literal navigation target must exist.
expected=['home','discover','publish','messages','me','regions','detail','booking','my-posts','my-bookings','merchant','chat','merchant-services','merchant-bookings','merchant-team','search','categories','map','publish-form','drafts','verification','information','commerce','industry','login','legal','business']
if app['pages'] != ['pages/'+name+'/index' for name in expected]: errors.append('Registered routes including the independent publishing form must match')
if [t['text'] for t in app['tabBar']['list']] != ['首页','发现','发布','消息','我的']:
 errors.append('Unexpected five-tab navigation')
for config in p.rglob('*.json'):
 try: json.loads(config.read_text(encoding='utf-8'))
 except (ValueError, UnicodeError) as exc: errors.append(f'{config}: invalid JSON: {exc}')
for source in p.rglob('*.js'):
 text=source.read_text(encoding='utf-8')
 for target in re.findall(r"url:\s*['\"](/pages/[^'\"?]+)", text):
  # Dynamic merchant panel URLs are checked against the actual WXML choices below.
  if target.endswith('-'): continue
  if target.lstrip('/') not in app['pages']: errors.append(f'{source}: unknown route {target}')
merchant_template=(p/'pages/merchant/index.wxml').read_text(encoding='utf-8')
for kind in re.findall(r'data-kind="([a-z]+)"', merchant_template):
 if f'pages/merchant-{kind}/index' not in app['pages']:
  errors.append(f'Unknown merchant panel: {kind}')
if errors:
 print('FAILED:\n'+ '\n'.join(errors));sys.exit(1)
print(f'PASS: {len(app["pages"])} pages, {len(app["tabBar"]["list"])} tab routes, icons, handlers, valid project config')

# Verify nesting too: file/handler checks alone cannot catch extra closing tags.
import runpy
runpy.run_path(str(root/"scripts/check_wxml.py"), run_name="__main__")
