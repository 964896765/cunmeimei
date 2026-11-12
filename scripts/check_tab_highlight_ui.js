'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('../backend/node_modules/sharp');
const connect = require('./devtools_connection');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const output = path.resolve(__dirname, '../docs/remediation/tab-highlight-2026-11-13');
  fs.mkdirSync(output, {recursive:true});
  const names = ['home','discover','publish','messages','me'];
  const results = [];
  const errors = [];
  const mini = await connect();
  const original = (await mini.currentPage()).path;
  mini.on('exception', event => errors.push(event));
  try {
    for (const name of names) {
      const route = 'pages/' + name + '/index';
      await mini.switchTab('/' + route);
      await pause(1000);
      assert.equal((await mini.currentPage()).path, route);
      const metrics = await mini.evaluate(() => new Promise(resolve => {
        const bar = getCurrentPages().slice(-1)[0].getTabBar();
        bar.createSelectorQuery()
          .selectAll('.tab-icon').boundingClientRect()
          .select('.curved-tabs').boundingClientRect()
          .exec(rows => {
            const window=wx.getWindowInfo();
            resolve(JSON.parse(JSON.stringify({icons:rows[0],navigation:rows[1],window:{windowWidth:window.windowWidth,windowHeight:window.windowHeight},route:bar.data.route})));
          });
      }));
      assert.equal(metrics.route, route);
      assert.equal(metrics.icons.length, 5);
      const selected = names.indexOf(name);
      for (let index=0;index<5;index++) {
        const icon = metrics.icons[index];
        assert.ok(icon.top >= metrics.navigation.top && icon.bottom <= metrics.navigation.top + 56);
        if (results.length) {
          assert.equal(icon.width, results[0].metrics.icons[index].width, 'selection keeps the frame width');
          assert.equal(icon.height, results[0].metrics.icons[index].height, 'selection keeps the frame height');
        }
      }
      const screenshot = await mini.screenshot();
      const buffer = Buffer.from(screenshot, 'base64');
      const metadata = await sharp(buffer).metadata();
      const top = Math.max(0, Math.floor(metrics.navigation.top * metadata.height / metrics.window.windowHeight));
      const file = 'navigation-' + name + '.png';
      await sharp(buffer).extract({left:0,top,width:metadata.width,height:metadata.height-top}).toFile(path.join(output,file));
      results.push({name,selected,file,metrics});
      console.log('PASS ' + name + ' selection stays within its normal frame');
    }
    assert.equal(errors.length, 0);
    fs.writeFileSync(path.join(output, 'RESULTS.json'), JSON.stringify({ok:true,checkedAt:new Date().toISOString(),physicalDevice:false,results,exceptions:errors},null,2)+'\n');
  } finally {
    if (names.some(name => original === 'pages/' + name + '/index')) {
      await mini.evaluate(url => { setTimeout(() => wx.switchTab({url}),100); return true; }, '/' + original);
      await pause(300);
    }
    await mini.disconnect();
  }
}

main().catch(error => { console.error(error.stack); process.exitCode=1; });
