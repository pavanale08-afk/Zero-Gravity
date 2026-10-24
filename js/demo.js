// Zero Gravity — versione di prova.
// Su GitHub Pages (o aprendo i file dal computer) non c'è il server: le stesse regole
// (core.js) girano qui, e corsi, account e prenotazioni si salvano nel browser di chi prova.
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
  const KEY = 'zg-demo-v3';

  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* bloccato */ } };
  const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };
  // nella prova basta un'impronta semplice della password (i dati restano comunque solo in questo browser)
  const fingerprint = (pw) => { let h = 5381; for (const ch of String(pw)) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return 'demo$' + (h >>> 0).toString(36); };

  const isAdmin = () => read(KEY + '-admin', false) === true;
  const clientId = () => read(KEY + '-client', null);

  // accessi di prova (nella versione vera li gestisce server.js)
  const auth = {
    'GET /api/me': () => (isAdmin() ? { name: 'Anna Argenti', email: DEMO_EMAIL } : fail(401, 'Accedi.')),
    'POST /api/login': (body) => {
      if (String(body.email || '').trim().toLowerCase() !== DEMO_EMAIL || String(body.password) !== DEMO_PASSWORD) {
        fail(401, `Nella versione di prova entra con ${DEMO_EMAIL} e password “${DEMO_PASSWORD}”.`);
      }
      write(KEY + '-admin', true);
      return { name: 'Anna Argenti' };
    },
    'POST /api/logout': () => { write(KEY + '-admin', null); return { ok: true }; },
    'POST /api/admin/password': () => fail(400, 'Nella versione di prova la password non si cambia.'),

    'GET /api/client/me': (body, core) => { const c = clientId() && core.api.publicClient(clientId()); return c || fail(401, 'Accedi.'); },
    'POST /api/client/register': (body, core) => {
      const data = core.api.readClient(body);
      if (String(body.password || '').length < 6) fail(400, 'La password deve avere almeno 6 caratteri.');
      if (!body.privacy) fail(400, 'Serve il consenso privacy per creare l\'account.');
      const c = core.api.addClient(data, fingerprint(body.password));
      write(KEY + '-client', c.id);
      return c;
    },
    'POST /api/client/login': (body, core) => {
      const c = core.api.clientByEmail(body.email);
      if (!c || c.secret !== fingerprint(body.password)) fail(401, 'Email o password non corrette.');
      write(KEY + '-client', c.id);
      return core.api.publicClient(c.id);
    },
    'POST /api/client/logout': () => { write(KEY + '-client', null); return { ok: true }; },
  };

  window.ZGDemo = {
    active, email: DEMO_EMAIL, password: DEMO_PASSWORD,
    async request(url, body) {
      const method = body ? 'POST' : 'GET';
      const path = url.replace(/^.*?(\/api\/)/, '$1');
      const db = read(KEY, {});
      const core = window.ZGCore.create(db);
      const own = auth[`${method} ${path.split('?')[0]}`];
      let result, changed = method === 'POST';
      if (own) result = own(body || {}, core);
      else {
        const out = core.handle(method, path, body, { isAdmin: isAdmin(), clientId: clientId() });
        if (!out) fail(404, 'Non trovato.');
        result = out.result;
      }
      if (changed) write(KEY, db);
      return JSON.parse(JSON.stringify(result));
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
