// Zero Gravity — le regole del sito, in un solo posto.
// Le usa server.js (versione vera, dati in data/db.json) e demo.js (versione di prova, dati nel browser).
// Qui niente pagine e niente accessi: solo corsi, date, posti e prenotazioni.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZGCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_DAYS_AHEAD = 366;   // le ripetizioni arrivano al massimo a un anno
  const MAX_NEW_DATES = 300;    // e creano al massimo 300 date per volta

  /* ---------- utilità ---------- */

  const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
  const isPhone = (v) => /^[+0-9 ()-]{6,20}$/.test(v);
  const digits = (v) => String(v).replace(/\D/g, '').slice(-9);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const noon = (iso) => new Date(`${iso}T12:00:00`);            // mezzogiorno: niente sorprese con l'ora legale
  const startOf = (s) => new Date(`${s.date}T${s.time}:00`);
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(noon(v).getTime());
  const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };
  let counter = 0;
  const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- date ripetute ---------- */

  // Trasforma "dal giorno X, questi orari, ripeti così, fino al giorno Y" in un elenco di date e ore.
  // repeat: 'none' | 'daily' | 'every2' | 'weekly' (nei giorni weekdays, 0 = domenica) | 'monthly'
  function expand({ start, until, times, repeat, weekdays }) {
    if (!isDate(start)) fail(400, 'Scegli il giorno di inizio.');
    const hours = [...new Set((times || []).map((t) => clean(t, 5)).filter(Boolean))].sort();
    if (!hours.length) fail(400, 'Aggiungi almeno un orario.');
    if (!hours.every(isTime)) fail(400, 'Controlla gli orari: devono essere tipo 18:30.');

    const first = noon(start);
    let days = [];
    if (repeat === 'none' || !repeat) {
      days = [first];
    } else {
      if (!isDate(until)) fail(400, 'Scegli fino a quando ripetere.');
      const last = noon(until);
      if (last < first) fail(400, 'La data di fine viene prima di quella di inizio.');
      if ((last - first) / 864e5 > MAX_DAYS_AHEAD) fail(400, 'Si può ripetere al massimo per un anno.');
      if (repeat === 'monthly') {
        const dom = first.getDate();
        for (let m = 0; ; m++) {
          const d = new Date(first.getFullYear(), first.getMonth() + m, dom, 12);
          if (d > last) break;
          if (d.getDate() === dom) days.push(d); // salta i mesi che non hanno quel giorno (es. 31)
        }
      } else {
        const step = repeat === 'every2' ? 2 : 1;
        const wd = repeat === 'weekly' ? new Set((weekdays && weekdays.length ? weekdays : [first.getDay()]).map(Number)) : null;
        for (let d = new Date(first); d <= last; d.setDate(d.getDate() + step)) {
          if (!wd || wd.has(d.getDay())) days.push(new Date(d));
        }
      }
    }
    const now = new Date();
    const out = [];
    for (const d of days) {
      for (const time of hours) {
        const slot = { date: dayKey(d), time };
        if (startOf(slot) > now) out.push(slot);
      }
    }
    if (!out.length) fail(400, 'Con queste scelte non c\'è nessuna data futura.');
    if (out.length > MAX_NEW_DATES) fail(400, `Sono ${out.length} date: il massimo è ${MAX_NEW_DATES} per volta. Accorcia il periodo.`);
    return out;
  }

  /* ---------- l'archivio ---------- */

  // db = { courses: [], slots: [], bookings: [] } — chi lo usa decide dove salvarlo.
  function create(db) {
    db.courses ||= []; db.slots ||= []; db.bookings ||= [];

    const course = (id) => db.courses.find((c) => c.id === id);
    const active = (slotId) => db.bookings.filter((b) => b.slotId === slotId && b.status === 'prenotato');

    function withCounts(s) {
      const c = course(s.courseId) || {};
      const people = active(s.id);
      const capacity = s.capacity ?? c.capacity;
      return {
        id: s.id, courseId: s.courseId, title: c.name, date: s.date, time: s.time,
        startsAt: startOf(s).toISOString(), duration: c.duration, price: c.price, capacity,
        enrolled: s.enrolled, booked: people.length, taken: s.enrolled + people.length,
        seatsLeft: Math.max(0, capacity - s.enrolled - people.length),
      };
    }
    const upcoming = () => db.slots.filter((s) => startOf(s) > new Date() && course(s.courseId))
      .sort((a, b) => startOf(a) - startOf(b));

    function readCourse(body) {
      const c = {
        name: clean(body.name, 80), description: clean(body.description, 400),
        duration: Number(body.duration), capacity: Number(body.capacity), price: Number(body.price),
      };
      if (c.name.length < 2) fail(400, 'Scrivi il nome del corso.');
      if (!Number.isInteger(c.duration) || c.duration < 10 || c.duration > 240) fail(400, 'La durata deve essere tra 10 e 240 minuti.');
      if (!Number.isInteger(c.capacity) || c.capacity < 1 || c.capacity > 50) fail(400, 'I posti devono essere tra 1 e 50.');
      if (!Number.isFinite(c.price) || c.price < 0 || c.price > 500) fail(400, 'Il prezzo non è valido.');
      c.price = Math.round(c.price * 100) / 100;
      return c;
    }

    const api = {
      /* --- pubblico --- */

      // i corsi, ognuno con le prossime date
      courses() {
        const next = upcoming();
        return db.courses.map((c) => ({
          id: c.id, name: c.name, description: c.description, duration: c.duration, capacity: c.capacity, price: c.price,
          next: next.filter((s) => s.courseId === c.id).slice(0, 4).map(withCounts),
          count: next.filter((s) => s.courseId === c.id).length,
        }));
      },

      // tutte le prossime date (anche quelle piene, che il sito mostra come "Completo")
      slots(courseId) {
        return upcoming().filter((s) => !courseId || s.courseId === courseId).map(withCounts);
      },

      book(body) {
        if (clean(body.website)) return { ok: true }; // campo trappola contro lo spam
        const s = db.slots.find((x) => x.id === clean(body.slotId, 40));
        if (!s || startOf(s) <= new Date() || !course(s.courseId)) fail(404, 'Questa lezione non è più disponibile.');
        if (withCounts(s).seatsLeft <= 0) fail(409, 'Qualcuno è stato più veloce: la lezione è appena diventata piena.');
        const name = clean(body.name, 80), phone = clean(body.phone, 20);
        if (name.length < 2) fail(400, 'Scrivi nome e cognome.');
        if (!isPhone(phone)) fail(400, 'Serve un numero di telefono o WhatsApp.');
        if (!body.privacy) fail(400, 'Serve il consenso privacy per prenotare.');
        if (active(s.id).some((b) => digits(b.phone) === digits(phone))) fail(409, 'Con questo numero hai già prenotato questa lezione.');
        const b = { id: uid(), slotId: s.id, name, phone, firstTime: !!body.firstTime, status: 'prenotato', createdAt: new Date().toISOString() };
        db.bookings.push(b);
        return { ok: true, slot: withCounts(s) };
      },

      /* --- area di Anna --- */

      overview() {
        const recent = new Date(Date.now() - 7 * 864e5); // si vedono anche le lezioni dell'ultima settimana
        const slots = db.slots.filter((s) => startOf(s) > recent && course(s.courseId))
          .sort((a, b) => startOf(a) - startOf(b))
          .map((s) => ({ ...withCounts(s), past: startOf(s) <= new Date(), people: active(s.id) }));
        return { courses: db.courses, slots };
      },

      saveCourse(body) {
        const data = readCourse(body);
        if (body.id) {
          const c = course(clean(body.id, 40));
          if (!c) fail(404, 'Corso non trovato.');
          Object.assign(c, data);
          return c;
        }
        const c = { id: uid(), ...data, createdAt: new Date().toISOString() };
        db.courses.push(c);
        return c;
      },

      deleteCourse(body) {
        const c = course(clean(body.id, 40));
        if (!c) fail(404, 'Corso non trovato.');
        const future = upcoming().filter((s) => s.courseId === c.id);
        if (future.some((s) => active(s.id).length)) fail(409, 'Ci sono prenotazioni future per questo corso: annullale prima di eliminarlo.');
        db.slots = db.slots.filter((s) => s.courseId !== c.id || startOf(s) <= new Date());
        db.courses = db.courses.filter((x) => x.id !== c.id);
        return { ok: true };
      },

      previewSlots(body) {
        const c = course(clean(body.courseId, 40));
        if (!c) fail(400, 'Scegli il corso.');
        const list = expand(body);
        const taken = new Set(db.slots.filter((s) => s.courseId === c.id).map((s) => `${s.date} ${s.time}`));
        return { total: list.length, existing: list.filter((s) => taken.has(`${s.date} ${s.time}`)).length, first: list.slice(0, 8), last: list[list.length - 1] };
      },

      createSlots(body) {
        const c = course(clean(body.courseId, 40));
        if (!c) fail(400, 'Scegli il corso.');
        const enrolled = Number(body.enrolled || 0);
        if (!Number.isInteger(enrolled) || enrolled < 0 || enrolled >= c.capacity) fail(400, `Gli iscritti devono essere meno dei posti del corso (${c.capacity}).`);
        const taken = new Set(db.slots.filter((s) => s.courseId === c.id).map((s) => `${s.date} ${s.time}`));
        const fresh = expand(body).filter((s) => !taken.has(`${s.date} ${s.time}`));
        if (!fresh.length) fail(409, 'Queste date ci sono già tutte.');
        fresh.forEach((s) => db.slots.push({ id: uid(), courseId: c.id, date: s.date, time: s.time, enrolled, createdAt: new Date().toISOString() }));
        return { created: fresh.length };
      },

      setEnrolled(body) {
        const s = db.slots.find((x) => x.id === clean(body.id, 40));
        if (!s) fail(404, 'Lezione non trovata.');
        const n = Number(body.enrolled), booked = active(s.id).length, cap = withCounts(s).capacity;
        if (!Number.isInteger(n) || n < 0) fail(400, 'Numero non valido.');
        if (n + booked > cap) fail(400, `Con ${booked} prenotati dal sito, gli iscritti in studio possono essere al massimo ${cap - booked}.`);
        s.enrolled = n;
        return withCounts(s);
      },

      deleteSlot(body) {
        const s = db.slots.find((x) => x.id === clean(body.id, 40));
        if (!s) fail(404, 'Lezione non trovata.');
        if (active(s.id).length) fail(409, 'Qualcuno ha prenotato questa lezione: annulla prima la prenotazione.');
        db.slots = db.slots.filter((x) => x.id !== s.id);
        return { ok: true };
      },

      cancelBooking(body) {
        const b = db.bookings.find((x) => x.id === clean(body.id, 40));
        if (!b) fail(404, 'Prenotazione non trovata.');
        b.status = 'annullata';
        return { ok: true };
      },
    };

    // Le stesse operazioni come indirizzi /api/... (così il sito parla uguale al server e alla prova).
    // admin: true per le operazioni riservate ad Anna.
    const routes = {
      'GET /api/courses': [false, () => api.courses()],
      'GET /api/slots': [false, (b, q) => api.slots(q.get('corso'))],
      'POST /api/book': [false, (b) => api.book(b)],
      'GET /api/admin/overview': [true, () => api.overview()],
      'POST /api/admin/course': [true, (b) => api.saveCourse(b)],
      'POST /api/admin/course/delete': [true, (b) => api.deleteCourse(b)],
      'POST /api/admin/slots/preview': [true, (b) => api.previewSlots(b)],
      'POST /api/admin/slots': [true, (b) => api.createSlots(b)],
      'POST /api/admin/slot/enrolled': [true, (b) => api.setEnrolled(b)],
      'POST /api/admin/slot/delete': [true, (b) => api.deleteSlot(b)],
      'POST /api/admin/booking/cancel': [true, (b) => api.cancelBooking(b)],
    };

    // Risponde a una richiesta; changed = true se l'archivio va salvato.
    function handle(method, url, body, isAdmin) {
      const u = new URL(url, 'http://x');
      const route = routes[`${method} ${u.pathname}`];
      if (!route) return null;
      const [adminOnly, fn] = route;
      if (adminOnly && !isAdmin) fail(401, 'Accedi di nuovo.');
      return { result: fn(body || {}, u.searchParams), changed: method === 'POST' };
    }

    return { api, handle };
  }

  return { create, expand };
});
