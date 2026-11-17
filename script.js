// ---------- Mobile nav ----------
const toggle = document.querySelector('.menu-toggle');
const nav = document.getElementById('primary-nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// ---------- Pages (views) inside one HTML file ----------
// Each <div class="view" data-view="..."> is a page; the URL hash (#home, #products, #about, #safety) picks it.
const views = Array.from(document.querySelectorAll('.view'));
const viewNames = views.map(v => v.dataset.view);
const mainEl = document.getElementById('main');
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const LEAVE_MS = 160;
const ENTER_MS = 750;
let switchToken = 0;

function currentViewName() {
  const name = window.location.hash.replace('#', '');
  return viewNames.includes(name) ? name : viewNames[0];
}

function updateChrome(name, scrollToTop) {
  if (nav) {
    nav.querySelectorAll('a[href^="#"]').forEach(link => {
      if (link.getAttribute('href') === '#' + name) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  const active = views.find(view => view.dataset.view === name);
  if (active && active.dataset.title) {
    const t = document.createElement('textarea');
    t.innerHTML = active.dataset.title;
    document.title = t.value;
  }

  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (mainEl) mainEl.focus({ preventScroll: true });
  }
}

function enterView(view, animate) {
  views.forEach(v => {
    v.classList.remove('is-leaving', 'is-entering');
    v.hidden = v !== view;
  });
  if (animate && !motionQuery.matches) {
    void view.offsetWidth;
    view.classList.add('is-entering');
    const token = switchToken;
    setTimeout(() => {
      if (token === switchToken) view.classList.remove('is-entering');
    }, ENTER_MS);
  }
}

function showView(scrollToTop) {
  const name = currentViewName();
  const target = views.find(v => v.dataset.view === name);
  const current = views.find(v => !v.hidden && !v.classList.contains('is-leaving'));
  const token = ++switchToken;

  updateChrome(name, false);

  if (!current) {
    enterView(target, true);
    if (scrollToTop) updateChrome(name, true);
    return;
  }
  if (current === target) {
    enterView(target, false);
    if (scrollToTop) updateChrome(name, true);
    return;
  }
  if (motionQuery.matches) {
    enterView(target, false);
    if (scrollToTop) updateChrome(name, true);
    return;
  }

  current.classList.add('is-leaving');
  setTimeout(() => {
    if (token !== switchToken) return;
    enterView(target, true);
    if (scrollToTop) updateChrome(name, true);
  }, LEAVE_MS);
}

window.addEventListener('hashchange', () => showView(true));
showView(false);

// ---------- Scroll reveals ----------
const REVEAL_SELECTOR = '.product-card, .testi-card, .use-item, .ph-tile, .portrait-frame, .safety-section, .ingredient-table tbody tr';

if ('IntersectionObserver' in window && !motionQuery.matches) {
  document.documentElement.classList.add('js-anim');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

  views.forEach(view => {
    view.querySelectorAll(REVEAL_SELECTOR).forEach((el, i) => {
      el.classList.add('reveal');
      el.style.setProperty('--d', (i % 4) * 90 + 'ms');
      observer.observe(el);
    });
  });
}
