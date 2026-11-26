const mobileNav = document.querySelector('.mobile-nav');
const mobileToggle = mobileNav.querySelector('summary');
const siteHeader = document.querySelector('.site-header');

function updateHeader() {
  siteHeader.classList.toggle('is-scrolled', window.scrollY > 8);
}

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });
window.addEventListener('pageshow', updateHeader);

document.addEventListener('click', event => {
  if (!mobileNav.open) return;
  if (!mobileNav.contains(event.target) || event.target.closest('a')) {
    mobileNav.open = false;
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileNav.open) {
    mobileNav.open = false;
    mobileToggle.focus();
  }
});

function revealQuestion() {
  const element = document.getElementById(location.hash.slice(1));
  if (element?.matches('details.faq')) element.open = true;
}

revealQuestion();
window.addEventListener('hashchange', revealQuestion);

const codeDialog = document.querySelector('.code-dialog');

if (typeof codeDialog?.showModal === 'function') {
  const trigger = document.querySelector('[data-code-trigger]');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.addEventListener('click', event => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    codeDialog.showModal();
  });
  codeDialog.addEventListener('close', () => trigger.focus());
}

const motionToggle = document.querySelector('.motion-toggle');
if (motionToggle) {
  const hero = motionToggle.closest('.hero');
  motionToggle.hidden = false;
  motionToggle.addEventListener('click', () => {
    const paused = hero.classList.toggle('is-paused');
    motionToggle.setAttribute('aria-pressed', String(paused));
  });
}

const miniParticles = document.querySelector('.mini-particles');
if (miniParticles) {
  function drawParticles() {
    const context = miniParticles.getContext('2d');
    if (!context) return;
    const {width, height} = miniParticles.getBoundingClientRect();
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    miniParticles.width = Math.round(width * scale);
    miniParticles.height = Math.round(height * scale);
    context.scale(scale, scale);
    const cx = width * .5, cy = height * .53;
    let seed = 439;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const colors = ['#f89662', '#f078bc', '#ba7ef7', '#82aff9'];
    for (let index = 0; index < 560; index++) {
      const theta = random() * Math.PI * 2;
      const radius = .7 + (random() + random() + random()) * .19;
      const x = cx + Math.cos(theta) * cx * .85 * radius;
      const y = cy + Math.sin(theta) * height * .36 * radius - (x - cx) * .12;
      const size = .32 + random() ** 3 * 1.7;
      context.globalAlpha = .16 + random() * .62;
      context.fillStyle = colors[Math.floor(random() * colors.length)];
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }
  drawParticles();
  if ('ResizeObserver' in window) new ResizeObserver(drawParticles).observe(miniParticles);
  else window.addEventListener('resize', drawParticles, {passive: true});
}

const helpSearch = document.querySelector('.help-search');

if (helpSearch) {
  const query = helpSearch.querySelector('input');
  const reset = helpSearch.querySelector('button');
  const note = helpSearch.querySelector('[role="status"]');
  const groups = Array.from(document.querySelectorAll('.faq-group'), group => ({
    group, questions: Array.from(group.querySelectorAll('.faq'), element => ({
      element, text: element.textContent.replace(/\s+/g, ' ').toLowerCase()
    }))
  }));

  function filterHelp() {
    const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let matches = 0;
    for (const { group, questions } of groups) {
      let visible = 0;
      for (const { element, text } of questions) {
        element.hidden = !words.every(word => text.includes(word));
        if (!element.hidden) visible++;
      }
      group.hidden = visible === 0;
      matches += visible;
    }
    reset.hidden = query.value === '';
    note.hidden = words.length === 0;
    note.textContent = matches ? `找到 ${matches} 个相关问题` : '没有找到相关问题，可以换个关键词。';
  }

  function clearHelp() {
    query.value = '';
    filterHelp();
  }

  helpSearch.hidden = false;
  query.addEventListener('input', filterHelp);
  reset.addEventListener('click', () => { clearHelp(); query.focus(); });
  document.querySelector('.side-nav').addEventListener('click', event => {
    if (event.target.closest('a')) clearHelp();
  });
}

const legalBody = document.querySelector('.legal-body');
if (legalBody) {
  const meter = document.querySelector('.reading-meter');
  const progress = meter.querySelector('progress');
  const percentage = document.querySelector('.reading-percent');
  const percentValue = percentage.querySelector('span');
  const toc = document.getElementById('legal-toc');
  const scopes = [
    {section: document.getElementById('website-terms'), link: document.querySelector('.legal-jump [href="#website-terms"]')},
    {section: document.getElementById('mini-terms'), link: document.querySelector('.legal-jump [href="#mini-terms"]')}
  ];
  const clauses = [...toc.querySelectorAll('a')].reverse().map(link => ({
    section: document.getElementById(link.hash.slice(1)), link
  }));
  let frame = 0;
  let currentScope, currentClause;

  function markCurrent(previous, next) {
    if (previous !== next) {
      previous?.link.removeAttribute('aria-current');
      next?.link.setAttribute('aria-current', 'location');
    }
    return next;
  }

  function updateReading() {
    frame = 0;
    const top = siteHeader.getBoundingClientRect().bottom;
    const bounds = legalBody.getBoundingClientRect();
    const distance = Math.max(1, bounds.height - (innerHeight - top));
    const percent = Math.min(100, Math.max(0, Math.round((top - bounds.top) / distance * 100)));
    if (progress.value !== percent) {
      progress.value = percent;
      percentValue.textContent = percent + '%';
    }
    const threshold = top + 56;
    currentScope = markCurrent(currentScope, scopes[1].section.getBoundingClientRect().top <= threshold ? scopes[1] : scopes[0]);
    const clause = clauses.find(({section}) => section.getBoundingClientRect().top <= threshold);
    currentClause = markCurrent(currentClause, clause);
  }

  function queueReadingUpdate() {
    if (!frame) frame = requestAnimationFrame(updateReading);
  }

  function syncLegalTarget() {
    if (location.hash === '#legal-toc') toc.open = true;
    queueReadingUpdate();
  }

  meter.hidden = false;
  percentage.hidden = false;
  syncLegalTarget();
  window.addEventListener('scroll', queueReadingUpdate, {passive: true});
  window.addEventListener('resize', queueReadingUpdate, {passive: true});
  window.addEventListener('pageshow', queueReadingUpdate);
  window.addEventListener('hashchange', syncLegalTarget);
  toc.addEventListener('toggle', queueReadingUpdate);
}
