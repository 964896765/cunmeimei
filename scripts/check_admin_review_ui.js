'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const createBrowser = require('./headless_browser');

async function main() {
  const output = path.resolve(__dirname, '../docs/remediation/pearl-reference-2026-11-12/admin');
  fs.mkdirSync(output, {recursive:true});
  const browser = await createBrowser();
  const checks = [];
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await browser.evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Admin review UI state timed out');
  }
  try {
    await browser.navigate(require('../miniprogram/utils/runtime').apiBaseUrl + '/admin');
    await waitFor('typeof adminPrompt === "function" && typeof csrf === "string"');
    await browser.evaluate('window.reviewResult="pending";adminPrompt("界面验收，请填写实际核查范围和处理依据。","已核对文字与原图").then(value=>window.reviewResult=value);true');
    await waitFor('!!document.querySelector("dialog[open] textarea")');
    assert.equal(await browser.evaluate('document.activeElement.id'), 'review-dialog-value');
    const record = '界面验收记录\n已核对实际处理范围';
    await browser.evaluate('document.querySelector("dialog textarea").value=' + JSON.stringify(record) + ';true');
    await browser.screenshot(path.join(output, 'review-form.png'));
    await browser.evaluate('document.querySelector("dialog form").requestSubmit(document.querySelector("dialog button[type=submit]"));true');
    await waitFor('window.reviewResult !== "pending"');
    assert.equal(await browser.evaluate('window.reviewResult'), '界面验收记录\n已核对实际处理范围');
    checks.push('Multiline review form preserves submitted evidence and focuses the input.');
    await browser.evaluate('window.confirmResult="pending";adminConfirm("界面验收，确认记录本次处理结果？").then(value=>window.confirmResult=value);true');
    await waitFor('!!document.querySelector("dialog[open]")');
    await browser.screenshot(path.join(output, 'review-confirm.png'));
    await browser.evaluate('document.querySelector("dialog button[type=button]").click();true');
    await waitFor('window.confirmResult !== "pending"');
    assert.equal(await browser.evaluate('window.confirmResult'), false);
    assert.equal(await browser.evaluate('document.querySelectorAll("dialog").length'), 0);
    checks.push('Cancel dismisses the confirmation and returns false.');
    fs.writeFileSync(path.join(output, 'RESULTS.json'), JSON.stringify({
      checkedAt:new Date().toISOString(), ok:true, browser:'local Microsoft Edge',
      authenticated:false, businessMutations:false,
      scope:'Actual dialog rendering and form feedback. Individual administrator accounts require separate implementation.',
      checks, screenshots:['review-form.png','review-confirm.png']
    }, null, 2) + '\n');
    console.log('PASS ' + checks.length + ' browser review-dialog checks');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
