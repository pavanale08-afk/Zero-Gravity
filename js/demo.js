// Zero Gravity — versione di prova.
// Su GitHub Pages (o aprendo i file dal computer) non c'è il server: le stesse regole
// (core.js) girano qui, e corsi, date e prenotazioni si salvano nel browser di chi prova.
(() => {
  'use strict';
  // ?demo nell'indirizzo la accende anche altrove (e resta attiva cambiando pagina)
  let remembered = false;
  try {
    if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('zg-demo-mode', '1');
    remembered = sessionStorage.getItem('zg-demo-mode') === '1';
  } catch { /* archiviazione bloccata */ }
  const active = location.protocol === 'file:' || /\.github\.io$/i.test(location.hostname) || remembered;

  const DEMO_EMAIL = 'prova@zerogravity.it';
  const DEMO_PASSWORD = 'prova';
  const KEY = 'zg-demo-v2';

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const store = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* spazio pieno o bloccato */ } };
  const logged = () => { try { return sessionStorage.getItem(KEY + '-login') === '1'; } catch { return false; } };
  const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };

  // accesso di prova (nella versione vera lo gestisce server.js)
  const auth = {
    'GET /api/me': () => (logged() ? { name: 'Anna Argenti', email: DEMO_EMAIL } : fail(401, 'Accedi.')),
    'POST /api/login': (body) => {
      if (String(body.email || '').trim().toLowerCase() !== DEMO_EMAIL || String(body.password) !== DEMO_PASSWORD) {
        fail(401, `Nella versione di prova entra con ${DEMO_EMAIL} e password “${DEMO_PASSWORD}”.`);
      }
      try { sessionStorage.setItem(KEY + '-login', '1'); } catch { /* niente */ }
      return { name: 'Anna Argenti' };
    },
    'POST /api/logout': () => { try { sessionStorage.removeItem(KEY + '-login'); } catch { /* niente */ } return { ok: true }; },
    'POST /api/admin/password': () => fail(400, 'Nella versione di prova la password non si cambia.'),
  };

  window.ZGDemo = {
    active, email: DEMO_EMAIL, password: DEMO_PASSWORD,
    async request(url, body) {
      const method = body ? 'POST' : 'GET';
      const own = auth[`${method} ${new URL(url, location.href).pathname.replace(/^.*(\/api\/)/, '$1')}`];
      if (own) return own(body || {});
      const db = load();
      const out = window.ZGCore.create(db).handle(method, url.replace(/^.*(\/api\/)/, '$1'), body, logged());
      if (!out) fail(404, 'Non trovato.');
      if (out.changed) store(db);
      return JSON.parse(JSON.stringify(out.result));
    },
  };

  if (active) {
    document.addEventListener('DOMContentLoaded', () => {
      const bar = document.querySelector('[data-demo-bar]');
      if (bar) bar.hidden = false;
      const hint = document.querySelector('[data-demo-login]');
      if (hint) {
        hint.hidden = false;
        hint.querySelector('[data-demo-email]').textContent = DEMO_EMAIL;
        hint.querySelector('[data-demo-password]').textContent = DEMO_PASSWORD;
      }
    });
  }
})();
