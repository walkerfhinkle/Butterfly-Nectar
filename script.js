// Mobile nav toggle
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

// "Pages" inside one HTML file.
// Each <div class="view" data-view="..."> is its own page. The URL hash picks which one is
// showing (#home, #products, #about, #safety), so the back button, refreshes, and shared
// links all land on the right page.
const views = Array.from(document.querySelectorAll('.view'));
const viewNames = views.map(v => v.dataset.view);
const mainEl = document.getElementById('main');

function currentViewName() {
  const name = window.location.hash.replace('#', '');
  return viewNames.includes(name) ? name : viewNames[0];
}

function showView(scrollToTop) {
  const name = currentViewName();

  views.forEach(view => {
    view.hidden = view.dataset.view !== name;
  });

  // Nav + footer links: highlight the page you're on
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
    t.innerHTML = active.dataset.title; // decode &amp; etc.
    document.title = t.value;
  }

  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (mainEl) mainEl.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', () => showView(true));
showView(false);
