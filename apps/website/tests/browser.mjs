import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { appRoot } from '../scripts/build.mjs';
import { preview } from '../scripts/preview.mjs';
import { paths } from '../src/pages.mjs';

const server = preview();
const tempRoot = resolve(tmpdir());
const profile = await mkdtemp(join(tempRoot, 'dgqfl-website-edge-'));
const output = process.env.WEBSITE_QA_OUTPUT || join(appRoot, 'release', 'screenshots');
const edge = process.env.WEBSITE_BROWSER ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const pending = new Map();
const events = [];
let sequence = 0;

function send(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Browser timed out: ' + method));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Edge startup timed out')), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stderr.on('data', chunk => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const entry = pending.get(message.id);
    if (!entry) { if (message.method) events.push(message); return; }
    clearTimeout(entry.timer);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  await cdp('Page.enable');
  await cdp('Network.enable');
  await cdp('Runtime.enable');
  await cdp('Log.enable');

  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  }

  async function navigate(path) {
    const url = origin + path;
    await cdp('Page.navigate', { url });
    for (let i = 0; i < 60; i++) {
      if (await evaluate('location.href === ' + JSON.stringify(url) + ' && document.readyState === "complete"').catch(() => false)) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error('Page did not load: ' + path);
  }

  async function waitForPath(path) {
    for (let i = 0; i < 60; i++) {
      const ready = await evaluate('location.pathname + location.hash === ' + JSON.stringify(path) + ' && document.readyState === "complete"').catch(() => false);
      if (ready) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error('The browser did not reach ' + path);
  }

  async function screenshot(name) {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'));
  }

  await mkdir(output, { recursive: true });
  const results = [];
  const mobileUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.59';
  const androidUa = 'Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.59';
  const desktopUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
  for (const width of [1440, 1024, 768, 320, 375, 390, 430]) {
    const mobile = width <= 768;
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 950, deviceScaleFactor: 1, mobile });
    await cdp('Network.setUserAgentOverride', { userAgent: width === 375 ? androidUa : mobile ? mobileUa : desktopUa });
    for (const path of paths) {
      await navigate(path);
      const state = await evaluate(`({
        heading: document.querySelector("h1")?.textContent,
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        unloaded: [...document.images].filter(img => img.loading !== "lazy" && img.naturalWidth === 0).map(img => img.src),
        clipped: [...document.querySelectorAll("main h1, main h2, main h3, .button, .category-copy, .contact-list dd, .footer-brand p")]
          .filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent)
      })`);
      assert.ok(state.heading && state.width === width && state.scroll <= width, JSON.stringify({ path, state }));
      assert.deepEqual(state.unloaded, []);
      assert.deepEqual(state.clipped, [], path + ' at ' + width);
      if (width <= 430 && path === '/privacy') {
        const table = await evaluate(`(() => {
          const el = document.querySelector(".legal-table");
          el.scrollLeft = 60;
          return { wider: el.scrollWidth > el.clientWidth, left: el.scrollLeft, width: document.documentElement.scrollWidth };
        })()`);
        assert.ok(table.wider && table.left > 0 && table.width === width);
      }
      results.push({ width, path });
      if (width === 1440 || width === 768 || width === 390 || path === '/') {
        const suffix = width === 1440 ? '-desktop' : width === 390 ? '-mobile'
          : width >= 768 ? '-tablet-' + width : '-mobile-' + width;
        const name = (path === '/' ? 'home' : path.slice(1)) + suffix;
        const inViewImagesReady = await evaluate(`Promise.all([...document.images].filter(img =>
          img.getClientRects().length && img.getBoundingClientRect().top < innerHeight
        ).map(img => {
          img.loading = 'eager';
          return img.decode();
        })).then(() => true)`);
        assert.equal(inViewImagesReady, true, path);
        await screenshot(name);
      }
    }
  }

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate('/');
  const point = await evaluate('(() => { const box = document.querySelector(".mobile-nav summary").getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()');
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  assert.equal(await evaluate('document.querySelector(".mobile-nav").open'), true);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate('!document.querySelector(".mobile-nav").open && document.activeElement.matches(".mobile-nav summary")'), true);
  await evaluate('document.querySelector(".mobile-nav summary").click(); document.querySelector(".mobile-nav a[href=\\"/help\\"]").click(); void 0');
  for (let i = 0; i < 60; i++) {
    if (await evaluate('location.pathname === "/help" && document.readyState === "complete"').catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.equal(await evaluate('location.pathname'), '/help');
  await navigate('/help#feedback');
  assert.equal(await evaluate('document.querySelector("#feedback").open'), true);
  await evaluate('document.querySelector("#feedback summary").click(); void 0');
  assert.equal(await evaluate('document.querySelector("#feedback").open'), false);
  const search = value => evaluate('(() => { const field = document.querySelector("#help-query"); field.value = ' +
    JSON.stringify(value) + '; field.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await search('举报');
  assert.equal(await evaluate('!document.querySelector("#report").hidden && document.querySelector("#browse").hidden'), true);
  await search('此处没有匹配的特定词');
  assert.equal(await evaluate('document.querySelectorAll(".faq-group:not([hidden])").length'), 0);
  assert.match(await evaluate('document.querySelector(".help-result-note").textContent'), /没有找到/);
  await evaluate('document.querySelector(".help-reset").click(); void 0');
  assert.equal(await evaluate('document.querySelectorAll(".faq:not([hidden])").length'), 9);
  await search('举报');
  await evaluate('document.querySelector(".side-nav a[href=\\"#get-started\\"]").click(); void 0');
  assert.equal(await evaluate('location.hash === "#get-started" && !document.querySelector("#get-started").hidden'), true);
  await navigate('/services#housing');
  assert.equal(await evaluate('document.querySelector(":target")?.id'), 'housing');
  assert.equal(await evaluate('document.querySelector("#housing").getBoundingClientRect().top >= document.querySelector(".site-header").getBoundingClientRect().bottom'), true);
  await navigate('/privacy#clause-8');
  assert.equal(await evaluate('document.querySelector(":target")?.id'), 'clause-8');
  assert.equal(await evaluate('document.querySelector("#clause-8").getBoundingClientRect().top >= document.querySelector(".site-header").getBoundingClientRect().bottom'), true);
  for (const path of ['/agreement', '/privacy']) {
    await navigate(path);
    assert.equal(await evaluate('document.querySelector(".legal-toc").open'), false);
    await evaluate('document.querySelector(".legal-jump a[href=\\"#mini-terms\\"]").click(); void 0');
    assert.equal(await evaluate('location.hash'), '#mini-terms');
    assert.equal(await evaluate('document.querySelector("#mini-terms").getBoundingClientRect().top >= document.querySelector(".site-header").getBoundingClientRect().bottom'), true);
    await evaluate('document.querySelector(".legal-toc summary").click(); void 0');
    assert.equal(await evaluate('document.querySelector(".legal-toc").open'), true);
    await evaluate('document.querySelector(".legal-toc a").click(); void 0');
    assert.equal(await evaluate('location.hash'), '#clause-1');
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await evaluate('document.querySelector(".legal-toc [aria-current=location]")?.hash'), '#clause-1');
    assert.equal(await evaluate('document.querySelector(".legal-jump [aria-current=location]")?.hash'), '#mini-terms');
    assert.ok(await evaluate('document.querySelector(".reading-meter progress").value') > 0);
    await evaluate('window.scrollTo(0, document.documentElement.scrollHeight); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await evaluate('document.querySelector(".reading-meter progress").value'), 100);
    await navigate(path + '#legal-toc');
    assert.equal(await evaluate('document.querySelector(".legal-toc").open'), true);
  }
  await navigate('/privacy#clause-7');
  await evaluate(`(() => {
    const table = document.querySelector(".legal-table");
    const header = document.querySelector(".site-header");
    window.scrollBy(0, table.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 22);
  })()`);
  await screenshot('privacy-retention-mobile');
  await navigate('/');
  await evaluate('document.querySelector(".hero-entry").click(); void 0');
  assert.equal(await evaluate('document.querySelector(":target")?.id'), 'mini-program');
  assert.equal(await evaluate(`(() => {
    const entry = document.querySelector('.mini-panel');
    const canvas = entry.querySelector('canvas');
    const save = entry.querySelector('.mini-save');
    return entry.textContent.includes('小程序待发布') && canvas.width > 0
      && save.hasAttribute('download') && save.pathname === '/media/mini-program-code.jpg';
  })()`), true);
  await evaluate('document.querySelector(".mini-code-link").click(); void 0');
  assert.equal(await evaluate('document.querySelector(".code-dialog").open && document.querySelector(".code-close") === document.activeElement'), true);
  await evaluate('document.querySelector(".code-close").click(); new Promise(resolve => requestAnimationFrame(resolve))');
  assert.equal(await evaluate('!document.querySelector(".code-dialog").open && document.querySelector(".mini-code-link") === document.activeElement'), true);
  await screenshot('mini-program-mobile');
  for (const id of ['job', 'housing', 'used', 'merchant', 'service', 'community']) {
    await navigate('/');
    await evaluate('document.querySelector(' + JSON.stringify('.category-card[href="/services#' + id + '"]') + ').click(); void 0');
    await waitForPath('/services#' + id);
    assert.equal(await evaluate('document.querySelector(":target")?.id'), id);
  }
  await evaluate('history.back(); void 0');
  await waitForPath('/');
  await evaluate('history.forward(); void 0');
  await waitForPath('/services#community');
  const beforeRefresh = await evaluate('performance.timeOrigin');
  await cdp('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 60; i++) {
    if (await evaluate('performance.timeOrigin !== ' + beforeRefresh + ' && document.readyState === "complete"').catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.notEqual(await evaluate('performance.timeOrigin'), beforeRefresh);
  await waitForPath('/services#community');
  await navigate('/');
  await evaluate('window.scrollTo(0, 300); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
  assert.equal(await evaluate('document.querySelector(".site-header").classList.contains("is-scrolled")'), true);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await navigate('/');
  await evaluate('window.scrollTo(0, 0); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
  assert.deepEqual(await evaluate(`(async () => {
    const art = document.querySelector(".hero-art");
    const sweep = art.querySelector(".hero-sweep");
    const flight = art.querySelector(".butterfly-flight");
    const butterfly = art.querySelector(".butterfly");
    const toggle = document.querySelector(".motion-toggle");
    const noExtraDecorations = art.querySelectorAll("canvas").length === 1 && !!art.querySelector(".butterfly-trail")
      && getComputedStyle(document.querySelector(".site-header"), "::before").animationName === "none";
    const position = () => getComputedStyle(sweep).maskPosition;
    const flightPosition = () => getComputedStyle(flight).transform;
    const wings = () => ["::before", "::after"].map(side => getComputedStyle(butterfly, side));
    const timeline = flight.getAnimations()[0];
    const waitForFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const playing = timeline.playState === "running"
      && getComputedStyle(sweep).animationPlayState === "running"
      && wings().every(wing => wing.animationPlayState === "running");
    toggle.click();
    await waitForFrames();
    const pausedFrame = position();
    const pausedFlight = flightPosition();
    const pausedTime = timeline.currentTime;
    await waitForFrames();
    const paused = position() === pausedFrame && flightPosition() === pausedFlight
      && wings().every(wing => wing.animationPlayState === "paused")
      && toggle.getAttribute("aria-pressed") === "true";
    toggle.click();
    await waitForFrames();
    return {
      noExtraDecorations, playing, paused,
      resumed: wings().every(wing => wing.animationPlayState === "running")
        && getComputedStyle(sweep).animationPlayState === "running"
        && timeline.playState === "running" && timeline.currentTime >= pausedTime
    };
  })()`), { noExtraDecorations: true, playing: true, paused: true, resumed: true });
  await evaluate(`(() => {
    document.querySelector(".motion-toggle").click();
    document.querySelector(".hero-sweep").getAnimations()[0].currentTime = 3900;
  })()`);
  for (const width of [1440, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: false });
    const flight = await evaluate(`(async () => {
      const waitForFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await waitForFrames();
      const insect = document.querySelector(".butterfly-flight");
      const art = insect.closest(".hero-art").getBoundingClientRect();
      const timeline = insect.getAnimations()[0];
      const toggle = document.querySelector(".motion-toggle");
      const canvas = document.querySelector(".butterfly-trail");
      const context = canvas.getContext("2d");
      const hasTrail = () => context.getImageData(0, 0, canvas.width, canvas.height).data.some(value => value !== 0);
      const capture = phase => {
        timeline.currentTime = timeline.effect.getComputedTiming().duration * phase;
        const {left, right} = insect.getBoundingClientRect();
        const style = getComputedStyle(insect);
        return { left, right, opacity: Number(style.opacity), transform: new DOMMatrix(style.transform) };
      };
      const fliesForward = phase => {
        const previous = capture(phase - .003).transform;
        const current = capture(phase).transform;
        const next = capture(phase + .003).transform;
        const dx = next.e - previous.e, dy = next.f - previous.f;
        return (-current.c * dx - current.d * dy) / (Math.hypot(dx, dy) * Math.hypot(current.c, current.d)) > .97;
      };
      const home = capture(0);
      const departed = capture(.50);
      const hidden = capture(.56);
      const returned = capture(.78);
      const settled = capture(.999);
      const facing = fliesForward(.39) && fliesForward(.71) && fliesForward(.81);
      toggle.click();
      capture(.08);
      await waitForFrames();
      const clearWhileHovering = !hasTrail();
      capture(.74);
      await waitForFrames();
      const hasFlightTrail = hasTrail();
      const realFlaps = insect.classList.contains("is-flying")
        && getComputedStyle(insect.querySelector(".butterfly"), "::before").animationDuration === "0.64s";
      toggle.click();
      return {
        departed: departed.left > art.right && departed.opacity === 0,
        hidden: hidden.opacity === 0,
        returned: returned.opacity === 1 && returned.transform.e < 0 && returned.right > art.left,
        settled: Math.abs(home.left - settled.left) < 2 && settled.opacity === 1,
        facing, clearWhileHovering, hasFlightTrail, realFlaps
      };
    })()`);
    assert.deepEqual(flight, {
      departed: true, hidden: true, returned: true, settled: true,
      facing: true, clearWhileHovering: true, hasFlightTrail: true, realFlaps: true
    }, `butterfly at ${width}px`);
    await screenshot(width === 1440 ? 'home-butterfly-return-desktop' : 'home-butterfly-return-mobile');
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".button")).transitionDuration'), '0s');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".hero-sweep")).animationName'), 'none');
  assert.equal(await evaluate('document.querySelector(".butterfly-scene").getAnimations({ subtree: true }).length'), 0);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".butterfly-trail")).display'), 'none');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".motion-toggle")).display'), 'none');
  await evaluate(`Promise.all([...document.images].filter(img => !img.closest('dialog')).map(img => {
    img.loading = 'eager';
    return img.decode();
  })).then(() => true)`);
  const { cssContentSize: { width, height } } = await cdp('Page.getLayoutMetrics');
  const { data } = await cdp('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 }
  });
  await writeFile(join(output, 'home-full-desktop.png'), Buffer.from(data, 'base64'));
  const exceptions = events.filter(event => event.method === 'Runtime.exceptionThrown');
  const browserErrors = events.filter(event => event.method === 'Log.entryAdded' && event.params.entry.level === 'error');
  const externalRequests = events.filter(event => event.method === 'Network.requestWillBeSent' &&
    !event.params.request.url.startsWith(origin + '/'));
  assert.deepEqual(exceptions, []);
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(externalRequests, []);
  const report = { browser: 'Edge CDP', mobile: 'tablet and mobile viewport checks with simulated user agents', pages: results, interactions: ['menu opens', 'Escape closes and restores focus', 'menu navigates', 'FAQ deep link expands and toggles', 'help search filters with correct empty state', 'help search resets and directory remains navigable', 'service anchor clears sticky header', 'legal anchor clears sticky header', 'agreement scope and expandable contents', 'privacy scope and expandable contents', 'legal active chapter and reading progress', 'direct link opens legal contents', 'mini program anchor', 'QR dialog opens and restores focus', 'background light and butterfly pause and resume', 'butterfly leaves, disappears and returns on desktop and mobile', 'reduced motion', 'six service cards open their matching descriptions', 'browser back and forward', 'refresh preserves anchor', 'scroll-only navigation treatment', 'privacy table scroll is isolated at all mobile widths'], pageErrors: 0, externalRequests: 0 };
  await writeFile(join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pages: results.length, interactions: report.interactions.length, pageErrors: 0, externalRequests: 0, output }, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => {});
  socket?.close();
  if (child.exitCode === null && child.pid) {
    await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 1200))]);
    if (child.exitCode === null) child.kill();
  }
  await new Promise(resolve => server.close(resolve));
  if (dirname(resolve(profile)) === tempRoot && resolve(profile).startsWith(join(tempRoot, 'dgqfl-website-edge-'))) {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
