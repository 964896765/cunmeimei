'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const {palettes,resolvePalette,pageProfiles,iconPalettes} = require('../../miniprogram/utils/palettes');
const root = path.join(__dirname, '../../miniprogram');
function luminance(hex) {
 const linear = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
 return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(first, second) {
 const a = luminance(first), b = luminance(second);
 return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
test('six stable palettes keep readable text, buttons and control boundaries', () => {
 assert.deepEqual(Object.keys(palettes), ['prism', 'dark', 'clear', 'quiet', 'warm', 'gentle']);
 assert.equal(palettes.prism.brand, '#A44970');
 assert.equal(palettes.prism.action, '#A13E65');
 assert.equal(palettes.prism.background, '#FBF8FA');
 for(const value of ['#FBF8FA','#FFFFFF','#19171C','#6D6671','#A44970','#F9EDF2','#F0EAF4','#F0E7ED'])
  assert.ok(Object.values(palettes.prism).includes(value), 'VM Design System reference color '+value);
 assert.equal(palettes.prism.surface, '#FFFFFF');
 const candidates = {...palettes};
 for(const name of Object.keys(pageProfiles)) candidates['page/'+name]=resolvePalette('prism','pages/'+name+'/index');
 for (const [name, c] of Object.entries(candidates)) {
  for (const value of Object.values(c)) assert.match(value, /^#[0-9A-F]{6}$/);
  for (const foreground of ['ink', 'text', 'muted', 'link', 'price', 'danger']) {
   for (const background of ['background', 'surface', 'soft', 'soft-alt', 'glow-start', 'glow', 'glow-rose', 'wash-rose', 'wash-blue', 'wash-lilac']) {
    assert.ok(contrast(c[foreground], c[background]) >= 4.5, name + ': ' + foreground + ' on ' + background + ' needs readable small text');
   }
  }
  assert.ok(contrast(c['on-action'], c.action) >= 4.5, name + ': solid button text');
  assert.ok(contrast(c['on-action'], c['action-end']) >= 4.5, name + ': gradient button end');
  assert.ok(contrast(c['control-border'], c.surface) >= 3, name + ': input boundary');
  assert.ok(contrast(c.brand, c.surface) >= 3, name + ': native selected icon');
 }
});

test('generated cold-start colors and PNGs match runtime palettes', async () => {
 const c = palettes.prism;
 const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
 assert.equal(app.window.backgroundColor, c.background);
 assert.equal(app.window.navigationBarBackgroundColor, c.background);
 assert.equal(app.tabBar.color, c.muted);
 assert.equal(app.tabBar.selectedColor, c.link);
 const css = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8');
 const fallback = css.match(/^page\s*\{([^}]*)\}/m)[1];
 for (const [key, value] of Object.entries(c)) assert.ok(fallback.includes('--' + key + ':' + value + ';'), 'CSS fallback for ' + key);
 async function containsColor(file, color) {
  const {data} = await sharp(path.join(root, 'assets/icons', file)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const rgb = color.slice(1).match(/../g).map(x => parseInt(x, 16));
  for (let n = 0; n < data.length; n += 4) if (data[n + 3] === 255 && rgb.every((value, i) => value === data[n + i])) return true;
  return false;
 }
 for (const name of ['home', 'discover', 'publish', 'messages', 'me']) {
  for (const [theme, palette] of Object.entries(iconPalettes)) {
   const expected=theme==='prism'?resolvePalette('prism','pages/'+name+'/index'):palette;
   assert.ok(await containsColor(name + '-' + theme + '.png', expected.brand), 'theme icon ' + name + '/' + theme);
  }
  assert.ok(await containsColor(name + '.png', c.muted), 'neutral native icon ' + name);
  assert.ok(await containsColor(name + '-active.png', resolvePalette('prism','pages/'+name+'/index').brand), 'cold-start selected icon ' + name);
 }
 for (const name of ['merchant', 'job', 'housing', 'used', 'service', 'community']) {
  assert.ok(await containsColor('type-' + name + '.png', c.brand), 'category icon ' + name);
  for (const [theme, colors] of Object.entries(iconPalettes)) assert.ok(await containsColor('type-' + name + '-' + theme + '.png', colors.brand), 'category theme ' + name + '/' + theme);
 }
});

test('all routes share the VM flat canvas and the publish icon stays legible', async () => {
 const frozen=JSON.parse(fs.readFileSync(path.join(__dirname,'../../scripts/prism-color-baseline.json'),'utf8'));
 assert.deepEqual(palettes,frozen.palettes,'six themes match the Pearl reference engineering color contract');
 assert.deepEqual(pageProfiles,frozen.pageProfiles,'route mixes match the frozen contract');
 for(const [name,accent] of Object.entries(frozen.pageAccents)){
  const actual=resolvePalette('prism','pages/'+name+'/index');
  for(const [key,color] of Object.entries(accent)) assert.equal(actual[key],color,'frozen page accent '+name+'/'+key);
 }
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
 const {aliases,accentRoute}=require('../../miniprogram/utils/page-accent-route');
 assert.deepEqual([...Object.keys(pageProfiles),...Object.keys(aliases)].sort(),app.pages.map(x=>x.split('/')[1]).sort());
 for(const route of app.pages) assert.ok(pageProfiles[accentRoute(route).split('/')[1]],'all new pages reuse a frozen palette');
 for(const profile of Object.values(pageProfiles)) assert.deepEqual(profile.mix,['#FBF8FA','#FBF8FA','#FBF8FA']);
 const {data}=await sharp(path.join(root,'assets/icons/publish-prism.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let opaque=0,light=0;
 for(let n=0;n<data.length;n+=4) if(data[n+3]===255){opaque++;if(data[n]+data[n+1]+data[n+2]>650)light++;}
 assert.ok(light/opaque>0.6,'publish tab must have a pale glass interior rather than a heavy solid disk');
 for(const theme of Object.keys(palettes).filter(x=>x!=='prism')) for(const route of app.pages) assert.deepEqual(resolvePalette(theme,route),palettes[theme],'manual theme overrides page decoration');
});
