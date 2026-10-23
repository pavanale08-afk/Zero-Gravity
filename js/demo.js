// Zero Gravity — modalità prova.
// Su GitHub Pages (o aprendo i file dal computer) non c'è il server: le stesse regole di server.js
// girano qui, e lezioni e prenotazioni si salvano nel browser di chi prova (localStorage).
(() => {
  'use strict';
  // ?demo nell'indirizzo la accende anche altrove (resta attiva cambiando pagina)
  let remembered = false;
  try {
    if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('zg-demo-mode', '1');
    remembered = sessionStorage.getItem('zg-demo-mode') === '1';
  } catch { /* archiviazione bloccata */ }
  const active = location.protocol === 'file:' || /\.github\.io$/i.test(location.hostname) || remembered;
  const DEMO_EMAIL = 'prova@zerogravity.it';
  const DEMO_PASSWORD = 'prova';
  const KEY = 'zg-demo-v1';

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { spots: [], bookings: [] }; } catch { return { spots: [], bookings: [] }; } };
  const store = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* spazio pieno o bloccato */ } };
  const logged = () => { try { return sessionStorage.getItem(KEY + '-login') === '1'; } catch { return false; } };

  const uid = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
  const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const isPhone = (v) => /^[+0-9 ()-]{6,20}$/.test(v);
  const digits = (v) => String(v).replace(/\D/g, '').slice(-9);
  const startOf = (s) => new Date(`${s.date}T${s.time}:00`);
  const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };

  function withCounts(db, s) {
    const booked = db.bookings.filter((b) => b.spotId === s.id && b.status === 'prenotato').length;
    return { ...s, startsAt: startOf(s).toISOString(), booked, taken: s.enrolled + booked, seatsLeft: Math.max(0, s.capacity - s.enrolled - booked), individual: s.capacity === 1 };
  }
  const upcoming = (db) => db.spots.filter((s) => startOf(s) > new Date()).sort((a, b) => startOf(a) - startOf(b)).map((s) => withCounts(db, s));
  const people = (db, id) => db.bookings.filter((b) => b.spotId === id && b.status === 'prenotato');

  function readSpot(body) {
    const s = {
      title: clean(body.title, 80), date: clean(body.date, 10), time: clean(body.time, 5),
      duration: Number(body.duration), capacity: Number(body.capacity), enrolled: Number(body.enrolled || 0),
      price: Number(body.price), note: clean(body.note, 140),
    };
    if (s.title.length < 2) fail(400, 'Scrivi il nome della lezione.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !/^\d{2}:\d{2}$/.test(s.time)) fail(400, 'Data o ora non valide.');
    if (startOf(s) <= new Date()) fail(400, 'Questa data è già passata.');
    if (!Number.isInteger(s.duration) || s.duration < 10 || s.duration > 240) fail(400, 'La durata deve essere tra 10 e 240 minuti.');
    if (!Number.isInteger(s.capacity) || s.capacity < 1 || s.capacity > 50) fail(400, 'I posti totali devono essere tra 1 e 50.');
    if (!Number.isInteger(s.enrolled) || s.enrolled < 0 || s.enrolled >= s.capacity) fail(400, 'Gli iscritti devono essere meno dei posti totali, altrimenti non resta niente di libero.');
    if (!Number.isFinite(s.price) || s.price < 0 || s.price > 500) fail(400, 'Il prezzo non è valido.');
    s.price = Math.round(s.price * 100) / 100;
    return s;
  }

  const needLogin = () => { if (!logged()) fail(401, 'Accedi.'); };

  const routes = {
    'GET /api/spots': (db) => upcoming(db).filter((s) => s.seatsLeft > 0),

    'POST /api/book': (db, body) => {
      if (clean(body.website)) return { ok: true };
      const spot = upcoming(db).find((s) => s.id === clean(body.spotId, 40));
      if (!spot) fail(404, 'Questo posto non è più disponibile.');
      if (spot.seatsLeft <= 0) fail(409, 'Qualcuno è stato più veloce: il posto è appena stato preso.');
      const name = clean(body.name, 80), phone = clean(body.phone, 20), email = clean(body.email, 120).toLowerCase();
      if (name.length < 2) fail(400, 'Scrivi nome e cognome.');
      if (!isPhone(phone)) fail(400, 'Serve un numero di telefono o WhatsApp.');
      if (email && !isEmail(email)) fail(400, 'L\'email non sembra corretta.');
      if (!body.privacy) fail(400, 'Serve il consenso privacy per prenotare.');
      if (people(db, spot.id).some((b) => digits(b.phone) === digits(phone))) fail(409, 'Hai già prenotato questo posto.');
      db.bookings.push({ id: uid(), spotId: spot.id, name, phone, email, firstTime: !!body.firstTime, status: 'prenotato', createdAt: new Date().toISOString() });
      return { ok: true };
    },

    'GET /api/me': () => { needLogin(); return { name: 'Anna Argenti', email: DEMO_EMAIL }; },

    'POST /api/login': (db, body) => {
      if (clean(body.email).toLowerCase() !== DEMO_EMAIL || String(body.password) !== DEMO_PASSWORD) {
        fail(401, `Nella versione di prova entra con ${DEMO_EMAIL} e password “${DEMO_PASSWORD}”.`);
      }
      try { sessionStorage.setItem(KEY + '-login', '1'); } catch { /* niente */ }
      return { name: 'Anna Argenti' };
    },

    'POST /api/logout': () => { try { sessionStorage.removeItem(KEY + '-login'); } catch { /* niente */ } return { ok: true }; },

    'GET /api/studio': (db) => { needLogin(); return upcoming(db).map((s) => ({ ...s, people: people(db, s.id) })); },

    'GET /api/studio/names': (db) => {
      needLogin();
      const last = new Map();
      db.spots.forEach((s) => last.set(s.title, { title: s.title, duration: s.duration, capacity: s.capacity, price: s.price }));
      return [...last.values()];
    },

    'POST /api/studio/add': (db, body) => {
      needLogin();
      const spot = { id: uid(), ...readSpot(body), createdAt: new Date().toISOString() };
      db.spots.push(spot);
      return withCounts(db, spot);
    },

    'POST /api/studio/enrolled': (db, body) => {
      needLogin();
      const s = db.spots.find((x) => x.id === body.id);
      if (!s) fail(404, 'Non trovata.');
      const n = Number(body.enrolled), booked = people(db, s.id).length;
      if (!Number.isInteger(n) || n < 0 || n + booked > s.capacity) fail(400, `Con ${booked} prenotati dal sito, gli iscritti possono essere al massimo ${s.capacity - booked}.`);
      s.enrolled = n;
      return withCounts(db, s);
    },

    'POST /api/studio/remove': (db, body) => {
      needLogin();
      const i = db.spots.findIndex((s) => s.id === body.id);
      if (i < 0) fail(404, 'Non trovato.');
      if (people(db, db.spots[i].id).length) fail(409, 'Qualcuno ha già prenotato: annulla prima la prenotazione.');
      db.spots.splice(i, 1);
      return { ok: true };
    },

    'POST /api/studio/cancel': (db, body) => {
      needLogin();
      const b = db.bookings.find((x) => x.id === body.id);
      if (!b) fail(404, 'Non trovata.');
      b.status = 'annullata';
      return { ok: true };
    },

    'POST /api/studio/password': () => { needLogin(); fail(400, 'Nella versione di prova la password non si cambia.'); },
  };

  window.ZGDemo = {
    active,
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    async request(url, body) {
      const route = routes[`${body ? 'POST' : 'GET'} ${url}`];
      if (!route) fail(404, 'Non trovato.');
      const db = load();
      const result = route(db, body || {});
      if (body) store(db);
      return JSON.parse(JSON.stringify(result));
    },
  };

  if (active) {
    document.addEventListener('DOMContentLoaded', () => {
      const bar = document.querySelector('[data-demo-bar]');
      if (bar) bar.hidden = false;
      // nell'area studio mostra con quali dati entrare
      const hint = document.querySelector('[data-demo-login]');
      if (hint) {
        hint.hidden = false;
        hint.querySelector('[data-demo-email]').textContent = DEMO_EMAIL;
        hint.querySelector('[data-demo-password]').textContent = DEMO_PASSWORD;
      }
    });
  }
})();
