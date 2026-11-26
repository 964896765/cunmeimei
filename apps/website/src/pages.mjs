import { services, help } from './content/catalog.mjs';
import { escape, legalArticle } from './legal.mjs';

const routes = [
  ['/', '首页', '连接城乡生活，发现身边好服务。招聘求职、房屋租售、二手闲置、本地商家、便民服务和同城资讯。'],
  ['/about', '功能', '了解青方睐村美美的服务范围与运营方式。'],
  ['/services', '服务', '了解招聘求职、房屋租售、二手闲置、本地商家、便民服务和同城资讯。'],
  ['/help', '帮助中心', '了解如何进入小程序，以及如何浏览、搜索、发布和举报信息。'],
  ['/agreement', '用户协议', '查看官网使用规则与青方睐村美美微信小程序用户服务协议。'],
  ['/privacy', '隐私政策', '了解官网访问与微信小程序功能涉及的个人信息处理方式。'],
  ['/contact', '联系我们', '查看青方睐村美美的运营主体、联系渠道和个人数据请求入口。']
];

export const paths = routes.map(([path]) => path);
const navigation = [routes[0], routes[2], routes[1], ...routes.slice(3)];
const arrow = '<span class="arrow" aria-hidden="true">→</span>';
const iconPaths = {
  mini: '<path d="M9 10c-2-2.4-6-1.2-6 2 0 4 6 5 7.4.5l3.2-6.9C15 1 21 2 21 6c0 3.2-4 4.4-6 2"/>',
  job: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12l9 2 9-2m-9 1v3"/>',
  housing: '<path d="m2 11 10-8 10 8M5 10v11h5v-6h4v6h5V10"/>',
  used: '<path d="M3 11 11 3h8l2 2v8l-8 8a2 2 0 0 1-2.8 0L3 13.8a2 2 0 0 1 0-2.8Z"/><circle cx="16.5" cy="7.5" r="1"/>',
  merchant: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M2 9l3-5h14l3 5v1a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2Z"/>',
  service: '<path d="M20.8 5.8a5.3 5.3 0 0 0-7.5 0L12 7.2l-1.3-1.4a5.3 5.3 0 0 0-7.5 7.5L12 22l8.8-8.7a5.3 5.3 0 0 0 0-7.5Z"/>',
  community: '<rect x="3" y="3" width="16" height="18" rx="2"/><path d="M19 8h2v11a2 2 0 0 1-2 2M7 8h8M7 12h8M7 16h5"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  layers: '<path d="m2 8 10-5 10 5-10 5-10-5Zm0 5 10 5 10-5M2 18l10 5 10-5"/>',
  shield: '<path d="M12 22S4 18 4 11V5l8-3 8 3v6c0 7-8 11-8 11Z"/><path d="m8.5 11.5 2.5 2.5 4.5-4.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  lock: '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  leaf: '<path d="M20.8 3c.5 9-3.6 15-9.8 15a6 6 0 0 1-6-6c0-6 6-8.6 15.8-9ZM4 22l10-10"/>',
  mail: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-.8.3-1 1.1-1 2m0 3h.01"/>',
  scan: '<path d="M3 9V5a2 2 0 0 1 2-2h4m6 0h4a2 2 0 0 1 2 2v4m0 6v4a2 2 0 0 1-2 2h-4m-6 0H5a2 2 0 0 1-2-2v-4M6 12h12"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>'
};
const icon = name => `<svg class="icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
const brand = site => `<a class="brand" href="/" aria-label="${escape(site.name)}首页">
  <span class="brand-mark"><img src="/media/brand.png" width="32" height="32" alt=""></span><span>${escape(site.name)}</span></a>`;

function navLinks(items, current) {
  return items.map(([path, label]) =>
    `<a href="${path}"${current === path ? ' aria-current="page"' : ''}>${label}</a>`).join('');
}

function miniEntryLabel({miniProgram}) {
  if (!miniProgram.codeImage) return '小程序使用说明';
  return miniProgram.releaseStatus === 'published' ? '进入小程序' : '查看小程序码';
}

function layout(site, path, title, summary, body) {
  const miniLabel = miniEntryLabel(site);
  const miniHref = path === '/' ? '#mini-program' : '/#mini-program';
  const canonical = path === '/404' ? '<meta name="robots" content="noindex">' :
    `<link rel="canonical" href="${escape(site.origin + path)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escape(site.origin + path)}">
  <meta property="og:title" content="${escape(path === '/' ? site.name : title + ' · ' + site.name)}">
  <meta property="og:description" content="${escape(summary)}">`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#100e19">
  <title>${escape(path === '/' ? site.name + '官方网站' : title + ' · ' + site.name)}</title>
  <meta name="description" content="${escape(summary)}">
  ${canonical}
  <link rel="icon" type="image/png" href="/media/brand.png">
  <link rel="stylesheet" href="/styles.css">
  <script src="/menu.js" defer></script>
  ${path === '/' ? '<script src="/butterfly-motion.js" defer></script>' : ''}
</head>
<body class="${path === '/' ? 'site-home' : 'site-inner page-' + path.slice(1)}">
  <a href="#main" class="skip">跳至正文</a>
  <header class="site-header">
    <div class="container header-inner">
      <div class="header-brand">${brand(site)}<span class="brand-caption">本地生活服务小程序</span></div>
      <nav class="main-nav" aria-label="主导航">${navLinks(navigation, path)}</nav>
      <a class="header-entry" href="${miniHref}">${icon('mini')}${miniLabel}</a>
      <details class="mobile-nav">
        <summary><span>菜单</span><span class="menu-icon" aria-hidden="true"></span></summary>
        <nav aria-label="移动导航">${navLinks(navigation, path)}<a class="mobile-entry" href="${miniHref}">${icon('mini')}${miniLabel}</a></nav>
      </details>
    </div>
  </header>
  <main id="main" tabindex="-1">${body}</main>
  <footer class="site-footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">${brand(site)}<span class="brand-caption">连接城乡生活 · 发现身边好服务</span></div>
        <nav class="footer-nav" aria-label="页脚导航">${navLinks(navigation, path)}</nav>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getUTCFullYear()} ${escape(site.name)}</span>
        <span>${escape(site.operator)}</span>
        <a href="https://beian.miit.gov.cn/">${escape(site.icp)}</a>
      </div>
    </div>
  </footer>
</body>
</html>\n`;
}

function pageHeading(label, title, lead, mark) {
  return `<div class="page-heading"><div class="container page-heading-inner">
    <div class="page-heading-copy">
      <nav class="breadcrumb" aria-label="当前位置"><a href="/">首页</a><span aria-hidden="true">/</span><span aria-current="page">${label}</span></nav>
      <h1>${title}</h1>
      <p>${lead}</p>
    </div>
    <div class="page-mark" aria-hidden="true">${icon(mark)}</div>
  </div></div>`;
}

function serviceArt(id) {
  return `<div class="service-scene" aria-hidden="true">
    <div class="service-glass">
      <svg class="service-neon" viewBox="0 0 24 24" fill="none" stroke="url(#service-${id}-light)" stroke-width="1.18" stroke-linecap="round" stroke-linejoin="round">
        <defs><linearGradient id="service-${id}-light" x1="0" x2="1" y1="0" y2="1">
          <stop class="service-neon-start" offset="7%"/><stop offset="54%" stop-color="#fff1ff"/><stop class="service-neon-end" offset="98%"/>
        </linearGradient></defs>
        ${iconPaths[id]}
      </svg>
    </div>
  </div>`;
}

function neighborhoodScene() {
  return `<figure class="street-photo">
    <img src="/media/neighborhood-morning.webp" width="1320" height="880" alt="晨光照进一条岭南街巷，水果铺门口摆着木箱，路边停着自行车" loading="lazy" decoding="async">
    <figcaption>岭南街巷 · AI 场景示意</figcaption>
  </figure>`;
}

function miniProgram(site) {
  const { codeImage, entryInstructions, releaseStatus } = site.miniProgram;
  const published = releaseStatus === 'published';
  const heading = codeImage ? '微信小程序' : '小程序使用说明';
  const instructions = codeImage
    ? published
      ? entryInstructions || '打开微信扫一扫，进入青方睐村美美。'
      : '小程序待发布，正式开放后可在微信扫码进入。'
    : '本站目前未提供官方小程序码。你可以先查看浏览、搜索和发布信息的说明。';
  const escapedCode = escape(codeImage);
  return `<section id="mini-program" class="container mini-section" aria-labelledby="mini-title">
    <div class="mini-panel${codeImage ? ' has-code' : ''}">
      <div class="mini-copy">
        <span class="mini-mark">${icon('mini')}</span>
        <h2 id="mini-title">${heading}</h2>
        <p>${escape(instructions)}</p>
        <a class="text-link" href="/help#enter">查看使用帮助</a>
      </div>
      ${codeImage ? `<div class="mini-code-stage">
        <canvas class="mini-particles" aria-hidden="true"></canvas>
        <div class="mini-code-card">
          <a class="mini-code-link" href="${escapedCode}" aria-label="放大青方睐村美美小程序码" data-code-trigger>
            <img class="mini-code" src="${escapedCode}" width="184" height="184" alt="青方睐村美美微信小程序码" loading="lazy">
          </a>
          <a class="mini-save" href="${escapedCode}" download="青方睐村美美小程序码.jpg">保存小程序码</a>
        </div>
      </div>` : ''}
    </div>
    ${codeImage ? `<dialog class="code-dialog" aria-labelledby="code-dialog-title">
      <form method="dialog"><button class="code-close" aria-label="关闭小程序码" autofocus>×</button></form>
      <h2 id="code-dialog-title">青方睐村美美</h2>
      <p>${published ? '打开微信扫一扫，或长按识别小程序码。' : '小程序待发布。你可以先保存原图，正式开放后再扫码。'}</p>
      <img src="${escapedCode}" width="320" height="320" alt="青方睐村美美微信小程序码" loading="lazy">
      <a class="mini-save" href="${escapedCode}" download="青方睐村美美小程序码.jpg">保存小程序码</a>
    </dialog>` : ''}
  </section>`;
}

const features = [
  ['bolt', '本地更高效', '聚焦身边，按地区查找'],
  ['layers', '服务更全面', '工作、住房、闲置一处浏览'],
  ['shield', '信息更可靠', '提交审核，按规则展示'],
  ['service', '生活更便捷', '发现附近商家与便民服务']
];

const safety = [
  ['shield', '身份核验', '部分场景按需核验'],
  ['database', '内容审核', '信息按规则发布'],
  ['lock', '隐私保护', '提供个人数据入口'],
  ['leaf', '社区规范', '支持举报和反馈']
];

function home(site) {
  const hasCode = Boolean(site.miniProgram.codeImage);
  const published = site.miniProgram.releaseStatus === 'published';
  const steps = [
    hasCode
      ? ['mini', published ? '扫码进入小程序' : '查看小程序码', published ? '打开微信扫一扫' : '正式发布后扫码进入', '#mini-program']
      : ['mini', '查看小程序入口', '了解进入方式', '/help#enter'],
    ['search', '选择所需服务', '招聘、住房、闲置、商家等', '/services'],
    ['check', '发布或查询信息', '浏览详情或按指引提交', '/help#publish']
  ];
  const miniLabel = miniEntryLabel(site);
  return `<div class="home">
  <div class="hero-band"><section class="container hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="hero-kicker">${escape(site.name)}</p>
      <h1 id="hero-title">连接城乡生活，<br>发现身边<em>好服务</em></h1>
      <p class="hero-lead">${services.map(({ title }) => title).join(' · ')}</p>
      <a class="button button-primary hero-entry" href="#mini-program">${icon('mini')}${miniLabel}${arrow}</a>
    </div>
    <div class="hero-art" aria-hidden="true">
      <img class="hero-silk" src="/media/aurora-silk.webp" width="1920" height="698" fetchpriority="high" alt="">
      <div class="hero-sweep"></div>
      <canvas class="butterfly-trail"></canvas>
      <div class="butterfly-scene">
        <div class="butterfly-reflection"></div>
        <div class="butterfly-flight">
          <div class="butterfly">
            <img class="butterfly-body" src="/media/butterfly-crystal.webp" width="960" height="640" alt="">
          </div>
        </div>
      </div>
    </div>
    <button class="motion-toggle" type="button" aria-label="暂停首屏动效" aria-pressed="false" title="暂停或播放首屏动效" hidden><span></span></button>
  </section></div>
  <nav class="container categories-section" aria-label="本地服务入口">
    <div class="category-grid">
      ${services.map(({ id, title, short }) => `<a class="category-card art-${id}" href="/services#${id}">
        <span class="category-icon">${icon(id)}</span>
        <div class="category-copy"><h2>${title}</h2><p>${short}</p></div>
        <span class="round-chevron">${icon('chevron')}</span>
      </a>`).join('')}
    </div>
  </nav>
  <section class="container home-section" aria-labelledby="feature-title">
    <div class="feature-panel">
      <div class="feature-intro">
        <p class="eyebrow">平台优势</p>
        <h2 id="feature-title">为什么选择<br><span>${escape(site.name)}</span></h2>
        <p>汇集城乡本地信息，让工作、居住和日常所需更好找。</p>
      </div>
      <ul class="feature-list">
        ${features.map(([name, title, detail]) => `<li><span class="feature-icon">${icon(name)}</span><h3>${title}</h3><p>${detail}</p></li>`).join('')}
      </ul>
    </div>
  </section>
  <section class="container home-section" aria-labelledby="flow-title">
    <h2 class="center-heading" id="flow-title">如何使用 <span>·</span> 三步开启本地生活</h2>
    <ol class="flow">
      ${steps.map(([name, title, detail, href], i) => `<li>
        <a class="flow-card" href="${href}"><span class="flow-number" aria-hidden="true">0${i + 1}</span><span class="flow-icon">${icon(name)}</span>
          <span class="flow-copy"><strong>${title}</strong><span>${detail}</span></span>
        </a>
      </li>`).join('')}
    </ol>
  </section>
  <section class="container home-section" aria-labelledby="category-title">
    <h2 class="center-heading" id="category-title">热门服务分类 <span>·</span> 覆盖日常生活所需</h2>
    <div class="photo-grid">
      ${services.map(({ id, title, topics }) => `<a class="photo-card art-${id}" href="/services#${id}">
        <img src="/media/local-${id}.webp" width="480" height="480" alt="" loading="lazy" decoding="async">
        <span class="photo-icon">${icon(id)}</span>
        <div class="photo-copy"><h3>${title}</h3><p>${topics}</p></div>
        <span class="round-chevron">${icon('chevron')}</span>
      </a>`).join('')}
    </div>
  </section>
  <section class="container home-section" aria-labelledby="safety-title">
    <div class="safety-panel">
      <img class="safety-art" src="/media/neon-shield.webp" width="520" height="347" alt="" loading="lazy" decoding="async">
      <div class="safety-copy">
        <h2 id="safety-title">安全可靠 <span>·</span> 本地生活信息平台</h2>
        <ul class="safety-list">
          ${safety.map(([name, title, detail]) => `<li>${icon(name)}<div><h3>${title}</h3><p>${detail}</p></div></li>`).join('')}
        </ul>
      </div>
    </div>
  </section>
  ${miniProgram(site)}
  </div>`;
}

function about(site) {
  const tools = [
    ['search', '分类浏览与筛选', '按地区、分类和关键词查找岗位、房源、闲置与附近服务。', '/services', '浏览服务'],
    ['layers', '提交与查看进度', '在已开放的类目提交信息，在小程序查看审核结果与补充要求。', '/help#publish', '查看发布指引'],
    ['help', '联系与反馈', '从信息详情使用联系入口，遇到失实或违规信息可提交举报。', '/help#connect', '查看联系指引']
  ];
  return `${pageHeading('功能', '让本地生活信息更好找', '围绕工作、居住、闲置和日常服务，为本地用户提供分类浏览、查询及联系渠道。', 'layers')}
  <section class="container section about-content" aria-labelledby="about-functions">
    <div class="section-heading"><h2 id="about-functions">小程序功能</h2></div>
    <div class="short-card-grid">
      ${tools.map(([name, title, description, href, link]) => `<article class="info-card short-card">
        <span class="inner-icon">${icon(name)}</span><h3>${title}</h3><p>${description}</p>
        <a class="text-link" href="${href}">${link}</a>
      </article>`).join('')}
    </div>
  </section>
  <section class="container section about-story-section" aria-labelledby="about-position">
    <div class="street-story about-story">
      ${neighborhoodScene()}
      <div class="street-copy">
        <h2 id="about-position">平台定位</h2>
        <p>${escape(site.name)}是面向本地用户的生活信息展示与查询平台，由${escape(site.operator)}运营。</p>
        <a class="text-link" href="/services">查看服务范围 ${arrow}</a>
      </div>
    </div>
  </section>
  <section class="review-section section" aria-labelledby="review-title">
    <div class="container">
      <div class="section-heading"><div><h2 id="review-title">一条信息如何上线</h2><p>从提交、审核到展示与反馈。</p></div></div>
      <ol class="review-flow">
        <li><span class="step-number" aria-hidden="true">1</span><h3>提交资料</h3><p>用户可在小程序已开放的分类填写信息并提交审核。</p></li>
        <li><span class="step-number" aria-hidden="true">2</span><h3>平台审核</h3><p>平台按规则审核。通过后才能展示，用户可在小程序查看处理进度。</p></li>
        <li><span class="step-number" aria-hidden="true">3</span><h3>展示与反馈</h3><p>详情页提供联系方式。发现失实或违规信息，可在小程序提交举报。</p></li>
      </ol>
    </div>
  </section>
  <section class="container section" aria-labelledby="boundary-title">
    <div class="boundary-panel">
      <h2 id="boundary-title">服务边界</h2>
      <p>平台提供信息展示、查询和沟通渠道。双方自行核实信息、线下协商。平台不提供在线交易、支付或资金担保。</p>
      <a class="text-link" href="/help#report">查看举报指引 ${arrow}</a>
    </div>
  </section>`;
}

function servicePage() {
  return `${pageHeading('服务', '按生活场景找信息', '找工作、看房源、逛附近。选择你关心的生活场景。', 'layers')}
  <section class="container section service-directory" aria-label="六类服务详情">
    <nav class="category-links" aria-label="跳到服务分类">
      ${services.map(({ id, title }) => `<a href="#${id}">${title}</a>`).join('')}
    </nav>
    <div class="service-details">
      ${services.map(({ id, title, scenario, channel }) => `<article class="service-detail art-${id}" id="${id}">
        ${serviceArt(id)}
        <div class="service-copy"><h2>${title}</h2><p>${scenario}</p>
          <p class="channel-path">小程序 <span aria-hidden="true">›</span> 发现 <span aria-hidden="true">›</span> ${channel}</p>
        </div>
      </article>`).join('')}
    </div>
    <div class="service-footer"><p>信息和功能以微信小程序实际开放范围为准。</p><a class="text-link" href="/help#browse">查看浏览方法 ${arrow}</a></div>
  </section>`;
}

const helpGroups = [
  ['get-started', '开始使用', help.slice(0, 3)],
  ['publish-and-contact', '发布与联系', help.slice(3, 7)],
  ['safety-and-feedback', '安全与反馈', help.slice(7)]
];

function helpPage(site) {
  return `${pageHeading('帮助中心', '小程序使用帮助', '查找如何进入小程序、浏览、发布、联系或举报。', 'help')}
  <section class="container section help-layout" aria-label="常见问题">
    <nav class="side-nav" aria-label="帮助目录"><p>问题目录</p>${helpGroups.map(([id, title]) => `<a href="#${id}">${title}</a>`).join('')}<a class="help-contact" href="/contact">联系与反馈</a></nav>
    <div class="help-content">
      <div class="help-search" hidden>
        <label for="help-query">搜索使用帮助</label>
        <div class="help-search-field">${icon('search')}<input id="help-query" type="search" placeholder="例如：发布、联系、举报" autocomplete="off" aria-controls="help-results"><button type="button" class="help-reset" hidden>清空</button></div>
        <p class="help-result-note" role="status" hidden></p>
      </div>
    <div class="faq-groups" id="help-results">${helpGroups.map(([group, title, questions]) => `
      <section class="faq-group" id="${group}" aria-labelledby="${group}-title">
        <h2 id="${group}-title">${title}</h2>
        <div class="faq-list">${questions.map(([id, question, answer]) =>
          `<details id="${id}" class="faq"${id === 'enter' ? ' open' : ''}><summary>${question}<span aria-hidden="true"></span></summary>
          <p>${id === 'enter' && site.miniProgram.codeImage
            ? (site.miniProgram.releaseStatus === 'published'
              ? '用微信扫一扫识别<a href="/#mini-program">首页小程序码</a>。'
              : '小程序待发布，可先查看和保存<a href="/#mini-program">首页小程序码</a>。') : answer}
          ${id === 'feedback' ? ' <a class="text-link" href="/contact">联系我们 →</a>' : ''}</p></details>`).join('')}</div>
      </section>`).join('')}</div>
    </div>
  </section>`;
}

function contactFields(site) {
  return [
    ['联系电话', site.contact.phone, 'tel'],
    ['运营地址', site.contact.address],
    ['隐私联系邮箱', site.contact.privacyEmail === site.contact.email ? '' : site.contact.privacyEmail, 'mailto']
  ].map(([label, value, protocol]) => {
    if (!value) return '';
    const display = escape(value);
    const href = protocol === 'tel' ? value.replace(/[\s()-]/g, '') : value;
    return `<div><dt>${label}</dt><dd>${protocol ? `<a href="${protocol}:${escape(href)}">${display}</a>` : display}</dd></div>`;
  }).join('');
}

function contactPage(site) {
  const fields = contactFields(site);
  return `${pageHeading('联系我们', '联系与反馈', '运营主体、公开联系方式与个人数据请求入口。', 'mail')}
  <section class="container section contact-layout">
    <article class="info-card contact-info">
      <h2>${icon('layers')}运营信息</h2>
      <dl class="contact-list">
        <div><dt>网站及产品名称</dt><dd>${escape(site.name)}</dd></div>
        <div><dt>运营主体</dt><dd>${escape(site.operator)}</dd></div>
        <div><dt>服务范围</dt><dd>${escape(site.scope)}</dd></div>
        ${fields}
      </dl>
      <section id="official-email" class="contact-topic">
        <h3>${icon('mail')}官方邮箱</h3>
        ${site.contact.email
          ? `<a class="official-address" href="mailto:${escape(site.contact.email)}">${escape(site.contact.email)}</a>`
          : '<p class="muted-note">本站目前未列出公开邮箱。</p>'}
      </section>
    </article>
    <article class="info-card prose contact-support"><h2>${icon('help')}投诉、反馈与隐私</h2>
      <section id="general-feedback" class="contact-topic">
        <h3>投诉与反馈</h3>
        ${site.contact.email ? '<p>官网使用问题可通过<a href="#official-email">官方邮箱</a>反馈。</p>' : ''}
        <p>已使用小程序的用户可在「我的」→「帮助与反馈」查看处理指引。发现失实或违规信息，可使用详情页里的举报入口。</p>
        <a class="text-link" href="/help#feedback">查看反馈指引 ${arrow}</a>
      </section>
      <section id="website-privacy-requests" class="contact-topic">
        <h3>官网个人信息请求</h3>
        ${site.contact.privacyEmail
          ? `<p>如需查阅、复制、更正或删除与官网访问有关的个人信息，请发邮件至<a href="mailto:${escape(site.contact.privacyEmail)}">${escape(site.contact.privacyEmail)}</a>。来信请注明请求类型、涉及的访问日期或时段以及回复地址。初次来信请勿附上证件号码、密码或验证码。</p>`
          : '<p>本站尚未提供面向官网访客的隐私请求受理渠道。</p>'}
        <a class="text-link" href="/privacy#website-terms">查看官网隐私政策 ${arrow}</a>
      </section>
      <section id="miniprogram-privacy-requests" class="contact-topic">
        <h3>小程序个人数据</h3>
        <p>已登录的用户可从「我的」进入「个人数据」，申请查询、更正、删除个人信息或注销账号，并查看处理状态及答复。</p>
        ${site.contact.privacyEmail ? `<p>个人信息请求及微信授权、短信验证相关问题也可发往<a href="mailto:${escape(site.contact.privacyEmail)}">${escape(site.contact.privacyEmail)}</a>。初次来信请勿附上密码、验证码或证件号码。</p>` : ''}
        <a class="text-link" href="/#mini-program">${site.miniProgram.codeImage ? '查看小程序码' : '查看小程序使用说明'} ${arrow}</a>
      </section>
    </article>
  </section>`;
}

function legalPage(site, kind, source) {
  const privacy = kind === 'privacy';
  const label = privacy ? '隐私政策' : '用户协议';
  const title = privacy ? '隐私政策' : '用户服务协议';
  const websiteBody = privacy ? `<p>本网站由${escape(site.operator)}运营。公开页面可直接阅读。官网页面不设置 Cookie，不接入访问分析脚本，也不提供注册、登录、上传或定位功能。</p>
    <h3>访问及运行日志</h3>
    <p>为维护运行、排查故障和调查安全事件，官网访问日志记录 IP 地址、访问时间、请求方法、请求路径、响应状态和浏览器标识，排除 URL 查询参数。日志仅供有权限的运营维护人员按上述用途查阅。</p>
    <p>${Number.isInteger(site.accessLogRetentionDays) ? `官网访问日志按日轮转，常规保存 ${site.accessLogRetentionDays} 天，到期后清理。法律法规另有要求时，按规定的期限留存，并限制后续处理。` : '保存期限由安全和排障需要、适用法律及实际部署配置确定。'}</p>
    <h3>查阅、复制、更正与删除</h3>
    <p>${site.contact.privacyEmail
      ? `请发送邮件至 <a href="mailto:${escape(site.contact.privacyEmail)}">${escape(site.contact.privacyEmail)}</a>，注明请求类型和涉及的访问时间。我们按处理请求所需的最少信息核验，在适用法律规定的期限内答复，并在受理材料已无保留必要时清理。<a href="/contact#website-privacy-requests">查看提交说明</a>。`
      : '本站目前没有已公开的官网隐私请求受理渠道。<a href="/contact#miniprogram-privacy-requests">小程序个人数据入口</a>受理小程序账号相关请求。'}</p>`
  : `<p>本网站由${escape(site.operator)}运营，提供品牌介绍、服务说明和帮助文档。</p>
    <p>请依法使用公开网页，尊重相关权利人的知识产权，不得干扰网站运行或冒用本平台名义。进入微信小程序后，请阅读并遵守应用内现行协议。下方提供小程序协议的网页版本，实际功能以小程序开放情况为准。</p>`;
  const fields = {
    OPERATOR: site.operator,
    ADDRESS: site.contact.address,
    PHONE: site.contact.phone,
    CONTACT_EMAIL: site.contact.email,
    PRIVACY_EMAIL: site.contact.privacyEmail
  };
  return `<div class="reading-meter" hidden><progress max="100" value="0" aria-label="条款阅读进度"></progress></div>
    ${pageHeading(label, title, '请选择与您使用的服务对应的内容。', privacy ? 'lock' : 'community')}
    <section class="container section legal-layout">
      <nav class="legal-jump" aria-label="按适用范围阅读">
          <p>按适用范围阅读</p>
          <a href="#website-terms">官方网站</a>
          <a href="#mini-terms">微信小程序</a>
          <a href="#legal-toc">小程序条款目录</a>
          <p class="reading-percent" hidden>阅读进度 <span>0%</span></p>
      </nav>
      <article class="info-card legal-body">
        <section id="website-terms" class="prose website-terms" aria-labelledby="website-legal-title">
          <h2 id="website-legal-title">官方网站</h2>
          <p class="legal-scope">适用于访问 dgqfl.xyz 公开页面。</p>${websiteBody}
        </section>
        <section id="mini-terms" aria-labelledby="mini-legal-title">
          <h2 id="mini-legal-title">微信小程序${title}</h2>
          <p class="legal-scope">适用于微信内「青方睐村美美」小程序。此处为官网查阅稿，登录时以小程序展示并要求确认的现行版本为准。</p>
          ${privacy ? '<nav class="legal-related" aria-label="登录与验证"><a class="text-link" href="#clause-2">微信登录</a><a class="text-link" href="#clause-3">微信手机号授权与短信验证</a><a class="text-link" href="/contact#miniprogram-privacy-requests">个人信息请求</a></nav>' : ''}
          ${legalArticle(source, fields)}
        </section>
        <nav class="legal-related" aria-label="相关页面">
          <a class="text-link" href="${privacy ? '/agreement' : '/privacy'}">${privacy ? '用户协议' : '隐私政策'} ${arrow}</a>
          <a class="text-link" href="/contact">联系我们 ${arrow}</a>
        </nav>
      </article>
    </section>`;
}

export function renderPages(site, legal) {
  const bodies = [
    home(site), about(site), servicePage(), helpPage(site),
    legalPage(site, 'agreement', legal.agreement), legalPage(site, 'privacy', legal.privacy),
    contactPage(site)
  ];
  const pages = routes.map(([path, title, summary], index) => ({
    path, html: layout(site, path, title, summary, bodies[index])
  }));
  pages.push({
    path: '/404',
    html: layout(site, '/404', '页面未找到', '请返回青方睐村美美官网首页。',
      `<div class="container missing"><span class="eyebrow">404</span><h1>页面未找到</h1>
      <p>此页面可能已移动，请返回首页继续浏览。</p>
      <a class="button button-primary" href="/">返回首页 ${arrow}</a></div>`)
  });
  return pages;
}
