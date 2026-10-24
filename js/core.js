// Zero Gravity — le regole del sito, in un solo posto.
// Le usa server.js (versione vera, dati in data/db.json) e demo.js (versione di prova, dati nel browser).
// Qui ci sono corsi, servizi, calendario, prenotazioni e pagamenti. Password e accessi li gestiscono loro.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZGCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CALENDAR_DAYS = 21;     // il calendario arriva a 3 settimane
  const MAX_SESSIONS = 400;     // un corso crea al massimo 400 lezioni per volta
  const OTHER_MINUTES = 60;     // "Altro / descrivi il tuo problema" dura un'ora
  const STEP = 30;              // le ore libere si scelgono a mezz'ora

  /* ---------- utilità ---------- */

  const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
  const isPhone = (v) => /^[+0-9 ()-]{6,20}$/.test(v);
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const noon = (iso) => new Date(`${iso}T12:00:00`);
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(noon(v).getTime());
  const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const at = (date, time) => new Date(`${date}T${time}:00`);
  const addDays = (iso, n) => { const d = noon(iso); d.setDate(d.getDate() + n); return dayKey(d); };
  const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };
  let counter = 0;
  const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 7);
  const round2 = (n) => Math.round(n * 100) / 100;

  function defaultSeasonEnd() {
    const now = new Date();
    const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear(); // fine giugno della stagione in corso
    return `${year}-06-30`;
  }

  /* ---------- orari dei corsi ---------- */

  // Una riga di orario: { repeat: 'once'|'daily'|'weekly', weekday (0 = domenica), date, start, end }.
  // Diventa l'elenco delle lezioni dalla data "from" fino a "until".
  function expandRow(row, from, until, closedDays) {
    const start = clean(row.start, 5), end = clean(row.end, 5);
    if (!isTime(start) || !isTime(end)) fail(400, 'Controlla gli orari: devono essere tipo 14:30.');
    if (toMin(end) <= toMin(start)) fail(400, `L'ora di fine (${end}) deve venire dopo quella di inizio (${start}).`);
    const out = [];
    if (row.repeat === 'once') {
      if (!isDate(row.date)) fail(400, 'Scegli il giorno della lezione.');
      out.push({ date: row.date, start, end });
    } else {
      const wd = Number(row.weekday);
      if (row.repeat === 'weekly' && !(wd >= 0 && wd <= 6)) fail(400, 'Scegli il giorno della settimana.');
      for (let d = from; d <= until; d = addDays(d, 1)) {
        const day = noon(d).getDay();
        if (row.repeat === 'weekly' ? day === wd : !closedDays.includes(day)) out.push({ date: d, start, end });
      }
    }
    const now = new Date();
    return out.filter((s) => at(s.date, s.start) > now);
  }

  const overlaps = (a, b) => a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

  /* ---------- l'archivio ---------- */

  // db = { courses, sessions, services, clients, bookings, settings } — chi lo usa decide dove salvarlo.
  function create(db) {
    db.courses ||= []; db.sessions ||= []; db.services ||= []; db.clients ||= []; db.bookings ||= [];
    db.settings = { open: '08:00', close: '21:00', closedDays: [0], seasonEnd: defaultSeasonEnd(), ...(db.settings || {}) };

    const course = (id) => db.courses.find((c) => c.id === id);
    const service = (id) => db.services.find((s) => s.id === id);
    const client = (id) => db.clients.find((c) => c.id === id);
    const live = (b) => b.status === 'confermata' || b.status === 'in attesa';
    const lessonBookings = (sessionId) => db.bookings.filter((b) => b.sessionId === sessionId && live(b));
    const publicClient = (c) => c && { id: c.id, nome: c.nome, cognome: c.cognome, phone: c.phone, email: c.email, createdAt: c.createdAt };
    const today = () => dayKey(new Date());

    function sessionView(s, clientId) {
      const c = course(s.courseId) || {};
      const booked = lessonBookings(s.id);
      return {
        id: s.id, courseId: s.courseId, title: c.name, date: s.date, start: s.start, end: s.end,
        price: c.price, capacity: c.capacity, enrolled: s.enrolled || 0, booked: booked.length,
        seatsLeft: Math.max(0, c.capacity - (s.enrolled || 0) - booked.length),
        mine: clientId ? booked.some((b) => b.clientId === clientId) : false,
      };
    }
    const futureSessions = () => db.sessions.filter((s) => at(s.date, s.start) > new Date() && course(s.courseId))
      .sort((a, b) => at(a.date, a.start) - at(b.date, b.start));

    // ore occupate in un giorno: lezioni dei corsi e servizi già chiesti o confermati
    function busy(date) {
      const lessons = db.sessions.filter((s) => s.date === date && course(s.courseId)).map((s) => ({ date, start: s.start, end: s.end }));
      const services = db.bookings.filter((b) => b.kind === 'servizio' && b.date === date && live(b)).map((b) => ({ date, start: b.start, end: b.end }));
      return [...lessons, ...services].sort((a, b) => toMin(a.start) - toMin(b.start));
    }

    function freeGaps(date) {
      const st = db.settings;
      if (st.closedDays.includes(noon(date).getDay())) return [];
      let cursor = toMin(st.open);
      const close = toMin(st.close);
      const nowMin = date === today() ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
      const gaps = [];
      for (const b of busy(date)) {
        if (toMin(b.start) > cursor) gaps.push([cursor, toMin(b.start)]);
        cursor = Math.max(cursor, toMin(b.end));
      }
      if (close > cursor) gaps.push([cursor, close]);
      return gaps
        .map(([a, b]) => [Math.max(a, nowMin > a ? Math.ceil((nowMin + 1) / STEP) * STEP : a), b]) // niente ore già passate
        .filter(([a, b]) => b - a >= STEP)
        .map(([a, b]) => ({ start: toTime(a), end: toTime(b) }));
    }

    function readCourse(body) {
      const c = { name: clean(body.name, 80), description: clean(body.description, 400), capacity: Number(body.capacity), price: Number(body.price) };
      if (c.name.length < 2) fail(400, 'Scrivi il nome del corso.');
      if (!Number.isInteger(c.capacity) || c.capacity < 1 || c.capacity > 50) fail(400, 'I posti devono essere tra 1 e 50.');
      if (!Number.isFinite(c.price) || c.price < 0 || c.price > 500) fail(400, 'Il prezzo non è valido.');
      c.price = round2(c.price);
      return c;
    }

    // crea le lezioni di un corso dalle righe di orario; salta quelle che si sovrappongono a lezioni già presenti
    function addSchedule(c, rows, until) {
      if (!Array.isArray(rows) || !rows.length) fail(400, 'Aggiungi almeno un orario.');
      const last = isDate(until) ? until : db.settings.seasonEnd;
      if (last < today()) fail(400, 'La data di fine è già passata.');
      const list = rows.flatMap((r) => expandRow(r, today(), last, db.settings.closedDays));
      if (!list.length) fail(400, 'Con questi orari non c\'è nessuna lezione futura.');
      if (list.length > MAX_SESSIONS) fail(400, `Sarebbero ${list.length} lezioni: il massimo è ${MAX_SESSIONS}. Scegli una data di fine più vicina.`);
      // lo studio è una sala sola: le lezioni che si accavallano con un altro corso non vengono create
      const fresh = list.filter((s) => !db.sessions.some((x) => course(x.courseId) && overlaps(x, s)));
      if (!fresh.length) {
        const other = db.sessions.find((x) => course(x.courseId) && overlaps(x, list[0]));
        fail(409, `In questi orari c'è già ${other ? `“${course(other.courseId).name}”` : 'un altro corso'}: scegli un altro orario.`);
      }
      fresh.forEach((s) => db.sessions.push({ id: uid(), courseId: c.id, date: s.date, start: s.start, end: s.end, enrolled: 0 }));
      return { created: fresh.length, skipped: list.length - fresh.length };
    }

    function bookingView(b) {
      const c = client(b.clientId);
      const base = { ...b, client: publicClient(c) };
      if (b.kind === 'lezione') {
        const s = db.sessions.find((x) => x.id === b.sessionId);
        return { ...base, courseId: s?.courseId || null, title: course(s?.courseId)?.name || 'Lezione', date: s?.date, start: s?.start, end: s?.end };
      }
      return { ...base, title: service(b.serviceId)?.name || 'Richiesta personale' };
    }

    function needClient(ctx) { const c = ctx.clientId && client(ctx.clientId); if (!c) fail(401, 'Accedi alla tua area per prenotare.'); return c; }

    function bookLesson(c, s, enrollmentId) {
      if (lessonBookings(s.id).some((b) => b.clientId === c.id)) return null;
      if (sessionView(s).seatsLeft <= 0) return null;
      const b = { id: uid(), kind: 'lezione', clientId: c.id, sessionId: s.id, enrollmentId: enrollmentId || null, price: course(s.courseId).price, status: 'confermata', paid: false, createdAt: new Date().toISOString() };
      db.bookings.push(b);
      return b;
    }

    const api = {
      /* --- pubblico --- */

      catalog() {
        const next = futureSessions();
        return {
          settings: { open: db.settings.open, close: db.settings.close, closedDays: db.settings.closedDays, calendarDays: CALENDAR_DAYS },
          courses: db.courses.map((c) => ({
            ...c, schedule: c.schedule || [],
            next: next.filter((s) => s.courseId === c.id).slice(0, 3).map((s) => sessionView(s)),
            count: next.filter((s) => s.courseId === c.id).length,
          })),
          services: db.services,
        };
      },

      // i giorni del calendario: lezioni dei corsi e ore libere
      calendar(from, days, clientId) {
        const first = isDate(from) && from >= today() ? from : today();
        const limit = addDays(today(), CALENDAR_DAYS - 1);
        const out = [];
        for (let i = 0; i < Math.min(Number(days) || 7, CALENDAR_DAYS); i++) {
          const date = addDays(first, i);
          if (date > limit) break;
          const lessons = db.sessions.filter((s) => s.date === date && course(s.courseId)).sort((a, b) => toMin(a.start) - toMin(b.start)).map((s) => sessionView(s, clientId));
          const mine = clientId ? db.bookings.filter((b) => b.kind === 'servizio' && b.clientId === clientId && b.date === date && live(b)).map(bookingView) : [];
          out.push({ date, closed: db.settings.closedDays.includes(noon(date).getDay()), lessons, free: freeGaps(date), mine });
        }
        return { from: first, limit, days: out };
      },

      /* --- clienti (gli accessi li controlla chi usa queste regole) --- */

      readClient(body) {
        const c = { nome: clean(body.nome, 60), cognome: clean(body.cognome, 60), phone: clean(body.phone, 20), email: clean(body.email, 120).toLowerCase() };
        if (c.nome.length < 2 || c.cognome.length < 2) fail(400, 'Scrivi nome e cognome.');
        if (!isPhone(c.phone)) fail(400, 'Il numero di telefono non sembra corretto.');
        if (!isEmail(c.email)) fail(400, 'L\'email non sembra corretta.');
        return c;
      },
      addClient(data, secret) {
        if (db.clients.some((c) => c.email === data.email)) fail(409, 'Esiste già un account con questa email: accedi.');
        const c = { id: uid(), ...data, secret, createdAt: new Date().toISOString() };
        db.clients.push(c);
        return publicClient(c);
      },
      clientByEmail: (email) => db.clients.find((c) => c.email === clean(email, 120).toLowerCase()),
      publicClient: (id) => publicClient(client(id)),

      myBookings(ctx) {
        const c = needClient(ctx);
        return db.bookings.filter((b) => b.clientId === c.id).map(bookingView)
          .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
      },

      bookLesson(body, ctx) {
        const c = needClient(ctx);
        const s = db.sessions.find((x) => x.id === clean(body.sessionId, 40));
        if (!s || at(s.date, s.start) <= new Date() || !course(s.courseId)) fail(404, 'Questa lezione non è più disponibile.');
        if (lessonBookings(s.id).some((b) => b.clientId === c.id)) fail(409, 'Sei già iscritto a questa lezione.');
        if (sessionView(s).seatsLeft <= 0) fail(409, 'La lezione è piena.');
        return { booked: 1, booking: bookLesson(c, s) };
      },

      // iscrizione al corso intero: tutte le lezioni future con posto, dalla lezione scelta in poi
      bookCourse(body, ctx) {
        const c = needClient(ctx);
        const cr = course(clean(body.courseId, 40));
        if (!cr) fail(404, 'Corso non trovato.');
        const fromSession = db.sessions.find((x) => x.id === clean(body.fromSessionId, 40));
        const from = fromSession ? at(fromSession.date, fromSession.start) : new Date();
        const list = futureSessions().filter((s) => s.courseId === cr.id && at(s.date, s.start) >= from);
        if (!list.length) fail(404, 'Questo corso non ha lezioni in programma.');
        const enrollmentId = uid();
        let booked = 0, full = 0, already = 0;
        for (const s of list) {
          if (lessonBookings(s.id).some((b) => b.clientId === c.id)) { already++; continue; }
          if (bookLesson(c, s, enrollmentId)) booked++; else full++;
        }
        if (!booked) fail(409, already ? 'Sei già iscritto a tutte le lezioni di questo corso.' : 'Le lezioni di questo corso sono tutte piene.');
        return { booked, full, already, total: list.length };
      },

      // richiesta di un servizio (o di un aiuto descritto dal cliente) in un'ora libera: la conferma Anna
      requestService(body, ctx) {
        const c = needClient(ctx);
        const date = clean(body.date, 10), start = clean(body.start, 5);
        if (!isDate(date) || !isTime(start)) fail(400, 'Scegli giorno e ora.');
        if (date > addDays(today(), CALENDAR_DAYS - 1)) fail(400, 'Si può prenotare al massimo tre settimane avanti.');
        if (at(date, start) <= new Date()) fail(400, 'Questo orario è già passato.');
        const sv = body.serviceId ? service(clean(body.serviceId, 40)) : null;
        if (body.serviceId && !sv) fail(400, 'Scegli il servizio.');
        const note = clean(body.note, 800);
        if (!sv && note.length < 5) fail(400, 'Scrivi di cosa hai bisogno, così Anna può prepararsi.');
        const end = toTime(toMin(start) + (sv ? sv.duration : OTHER_MINUTES));
        const slot = { date, start, end };
        const fits = freeGaps(date).some((g) => toMin(g.start) <= toMin(start) && toMin(end) <= toMin(g.end));
        if (!fits) fail(409, 'In questo orario non c\'è abbastanza tempo libero. Scegli un altro orario.');
        const b = { id: uid(), kind: 'servizio', clientId: c.id, serviceId: sv ? sv.id : null, ...slot, note, price: sv ? sv.price : null, status: 'in attesa', paid: false, createdAt: new Date().toISOString() };
        db.bookings.push(b);
        return bookingView(b);
      },

      cancelMine(body, ctx) {
        const c = needClient(ctx);
        const b = db.bookings.find((x) => x.id === clean(body.id, 40) && x.clientId === c.id);
        if (!b) fail(404, 'Prenotazione non trovata.');
        const v = bookingView(b);
        if (v.date && at(v.date, v.start) <= new Date()) fail(400, 'Questa lezione è già passata.');
        b.status = 'annullata';
        return { ok: true };
      },

      /* --- area di Anna --- */

      overview() {
        const from = addDays(today(), -14);
        const sessions = db.sessions.filter((s) => s.date >= from && course(s.courseId))
          .sort((a, b) => at(a.date, a.start) - at(b.date, b.start))
          .map((s) => ({ ...sessionView(s), past: at(s.date, s.start) <= new Date(), people: lessonBookings(s.id).map(bookingView) }));
        return {
          settings: db.settings, courses: db.courses, services: db.services,
          clients: db.clients.map(publicClient),
          sessions,
          bookings: db.bookings.map(bookingView).sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`)),
        };
      },

      saveCourse(body) {
        const data = readCourse(body);
        if (body.id) {
          const c = course(clean(body.id, 40));
          if (!c) fail(404, 'Corso non trovato.');
          Object.assign(c, data);
          let added = { created: 0, skipped: 0 };
          if (Array.isArray(body.schedule) && body.schedule.length) {
            added = addSchedule(c, body.schedule, body.until);
            c.schedule = [...(c.schedule || []), ...body.schedule.map(normRow)];
          }
          return { course: c, ...added };
        }
        const c = { id: uid(), ...data, schedule: [], createdAt: new Date().toISOString() };
        const added = addSchedule(c, body.schedule, body.until);
        c.schedule = body.schedule.map(normRow);
        db.courses.push(c);
        return { course: c, ...added };
      },

      deleteCourse(body) {
        const c = course(clean(body.id, 40));
        if (!c) fail(404, 'Corso non trovato.');
        const future = futureSessions().filter((s) => s.courseId === c.id);
        if (future.some((s) => lessonBookings(s.id).length)) fail(409, 'Ci sono iscritti alle prossime lezioni di questo corso: annulla prima le iscrizioni.');
        db.sessions = db.sessions.filter((s) => s.courseId !== c.id || at(s.date, s.start) <= new Date());
        db.courses = db.courses.filter((x) => x.id !== c.id);
        return { ok: true };
      },

      saveService(body) {
        const s = { name: clean(body.name, 80), description: clean(body.description, 400), duration: Number(body.duration), price: Number(body.price) };
        if (s.name.length < 2) fail(400, 'Scrivi il nome del servizio.');
        if (!Number.isInteger(s.duration) || s.duration < 15 || s.duration > 240) fail(400, 'La durata deve essere tra 15 e 240 minuti.');
        if (!Number.isFinite(s.price) || s.price < 0 || s.price > 1000) fail(400, 'Il prezzo non è valido.');
        s.price = round2(s.price);
        if (body.id) { const x = service(clean(body.id, 40)); if (!x) fail(404, 'Servizio non trovato.'); return Object.assign(x, s); }
        const x = { id: uid(), ...s };
        db.services.push(x);
        return x;
      },

      deleteService(body) {
        const id = clean(body.id, 40);
        if (!service(id)) fail(404, 'Servizio non trovato.');
        db.services = db.services.filter((x) => x.id !== id); // le richieste già fatte restano nello storico
        return { ok: true };
      },

      setStatus(body) {
        const b = db.bookings.find((x) => x.id === clean(body.id, 40));
        if (!b) fail(404, 'Prenotazione non trovata.');
        const status = clean(body.status, 20);
        if (!['confermata', 'rifiutata', 'annullata', 'in attesa'].includes(status)) fail(400, 'Stato non valido.');
        if (status === 'confermata' && b.kind === 'servizio' && b.status !== 'confermata') {
          const clash = db.bookings.some((x) => x.id !== b.id && x.kind === 'servizio' && x.status === 'confermata' && overlaps(x, b));
          if (clash) fail(409, 'In quell\'orario hai già confermato un altro servizio.');
        }
        b.status = status;
        if (body.reply !== undefined) b.reply = clean(body.reply, 300);
        return bookingView(b);
      },

      setPaid(body) {
        const ids = Array.isArray(body.ids) ? body.ids.map((x) => clean(x, 40)) : [clean(body.id, 40)];
        const list = db.bookings.filter((b) => ids.includes(b.id));
        if (!list.length) fail(404, 'Prenotazione non trovata.');
        list.forEach((b) => { b.paid = !!body.paid; b.paidAt = body.paid ? new Date().toISOString() : null; });
        return { updated: list.length };
      },

      setPrice(body) {
        const b = db.bookings.find((x) => x.id === clean(body.id, 40));
        if (!b) fail(404, 'Prenotazione non trovata.');
        const p = Number(body.price);
        if (!Number.isFinite(p) || p < 0 || p > 1000) fail(400, 'Il prezzo non è valido.');
        b.price = round2(p);
        return bookingView(b);
      },

      setEnrolled(body) {
        const s = db.sessions.find((x) => x.id === clean(body.id, 40));
        if (!s) fail(404, 'Lezione non trovata.');
        const n = Number(body.enrolled), booked = lessonBookings(s.id).length, cap = course(s.courseId).capacity;
        if (!Number.isInteger(n) || n < 0) fail(400, 'Numero non valido.');
        if (n + booked > cap) fail(400, `Con ${booked} iscritti dal sito, quelli in studio possono essere al massimo ${cap - booked}.`);
        s.enrolled = n;
        return sessionView(s);
      },

      deleteSession(body) {
        const s = db.sessions.find((x) => x.id === clean(body.id, 40));
        if (!s) fail(404, 'Lezione non trovata.');
        if (lessonBookings(s.id).length) fail(409, 'Ci sono iscritti a questa lezione: annulla prima le loro iscrizioni.');
        db.sessions = db.sessions.filter((x) => x.id !== s.id);
        return { ok: true };
      },

      saveSettings(body) {
        const open = clean(body.open, 5), close = clean(body.close, 5);
        if (!isTime(open) || !isTime(close) || toMin(close) <= toMin(open)) fail(400, 'Controlla l\'orario di apertura e chiusura.');
        const closedDays = (Array.isArray(body.closedDays) ? body.closedDays : []).map(Number).filter((d) => d >= 0 && d <= 6);
        const seasonEnd = clean(body.seasonEnd, 10);
        if (!isDate(seasonEnd)) fail(400, 'Scegli la data di fine stagione.');
        Object.assign(db.settings, { open, close, closedDays, seasonEnd });
        return db.settings;
      },
    };

    function normRow(r) { return { repeat: r.repeat, weekday: r.repeat === 'weekly' ? Number(r.weekday) : null, date: r.repeat === 'once' ? r.date : null, start: r.start, end: r.end }; }

    // Le operazioni come indirizzi /api/... — access: 'public' | 'client' | 'admin'
    const routes = {
      'GET /api/catalog': ['public', () => api.catalog()],
      'GET /api/calendar': ['public', (b, q, ctx) => api.calendar(q.get('from'), q.get('days'), ctx.clientId)],
      'GET /api/me/bookings': ['client', (b, q, ctx) => api.myBookings(ctx)],
      'POST /api/book/lesson': ['client', (b, q, ctx) => api.bookLesson(b, ctx)],
      'POST /api/book/course': ['client', (b, q, ctx) => api.bookCourse(b, ctx)],
      'POST /api/book/service': ['client', (b, q, ctx) => api.requestService(b, ctx)],
      'POST /api/me/cancel': ['client', (b, q, ctx) => api.cancelMine(b, ctx)],
      'GET /api/admin/overview': ['admin', () => api.overview()],
      'POST /api/admin/course': ['admin', (b) => api.saveCourse(b)],
      'POST /api/admin/course/delete': ['admin', (b) => api.deleteCourse(b)],
      'POST /api/admin/service': ['admin', (b) => api.saveService(b)],
      'POST /api/admin/service/delete': ['admin', (b) => api.deleteService(b)],
      'POST /api/admin/booking/status': ['admin', (b) => api.setStatus(b)],
      'POST /api/admin/booking/paid': ['admin', (b) => api.setPaid(b)],
      'POST /api/admin/booking/price': ['admin', (b) => api.setPrice(b)],
      'POST /api/admin/session/enrolled': ['admin', (b) => api.setEnrolled(b)],
      'POST /api/admin/session/delete': ['admin', (b) => api.deleteSession(b)],
      'POST /api/admin/settings': ['admin', (b) => api.saveSettings(b)],
    };

    // ctx = { isAdmin, clientId } deciso da chi controlla gli accessi
    function handle(method, url, body, ctx = {}) {
      const u = new URL(url, 'http://x');
      const route = routes[`${method} ${u.pathname}`];
      if (!route) return null;
      const [access, fn] = route;
      if (access === 'admin' && !ctx.isAdmin) fail(401, 'Accedi di nuovo.');
      if (access === 'client' && !ctx.clientId) fail(401, 'Accedi alla tua area per prenotare.');
      return { result: fn(body || {}, u.searchParams, ctx), changed: method === 'POST' };
    }

    return { api, handle };
  }

  return { create, expandRow, toMin, toTime };
});
