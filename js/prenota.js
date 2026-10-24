// Zero Gravity — pagina Prenota: corsi e servizi, poi il calendario della settimana.
// Un corso nel calendario: lezione singola o tutto il corso. Un'ora libera: un servizio o una richiesta personale.
(() => {
  'use strict';
  const { $, $$, api, esc, toast, euro, hour, dayLabel } = window.ZG;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const WD = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const WD_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const pad = (n) => String(n).padStart(2, '0');
  const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localDay(d); };

  const sheet = $('[data-sheet]'), body = $('[data-sheet-body]');
  let catalog = { courses: [], services: [], settings: { open: '08:00', close: '21:00' } };
  let cal = null, week = 0, focus = new URLSearchParams(location.search).get('corso') || null, shownDay = 0;

  /* ---------- corsi e servizi ---------- */

  const scheduleText = (c) => (c.schedule || []).map((r) => {
    const when = r.repeat === 'weekly' ? `ogni ${WD_LONG[r.weekday]}` : r.repeat === 'daily' ? 'ogni giorno' : dayLabel(r.date).toLowerCase();
    return `${when} ${hour(r.start)}–${hour(r.end)}`;
  }).join(' · ');

  function renderOffer() {
    $('[data-courses]').innerHTML = catalog.courses.length ? catalog.courses.map((c) => `
      <button class="offer-card${focus === c.id ? ' is-on' : ''}" type="button" data-focus="${esc(c.id)}" aria-pressed="${focus === c.id}">
        <b>${esc(c.name)}</b>
        <span class="offer-when">${esc(scheduleText(c)) || 'Date in arrivo'}</span>
        <span class="offer-meta">${euro(c.price)} a lezione · ${c.capacity === 1 ? 'individuale' : `fino a ${c.capacity} persone`}</span>
      </button>`).join('') : '<p class="muted">I corsi saranno pubblicati a breve.</p>';
    $('[data-services]').innerHTML = (catalog.services.length ? catalog.services.map((s) => `
      <button class="offer-card offer-card--service" type="button" data-service-hint="${esc(s.id)}">
        <b>${esc(s.name)}</b>
        ${s.description ? `<span class="offer-when">${esc(s.description)}</span>` : ''}
        <span class="offer-meta">${s.duration} minuti · ${euro(s.price)}</span>
      </button>`).join('') : '') + `
      <button class="offer-card offer-card--service" type="button" data-service-hint="">
        <b>Hai un'esigenza tua?</b>
        <span class="offer-when">Scegli un'ora libera e descrivi il tuo problema: Anna ti propone come aiutarti.</span>
      </button>`;
  }

  $('[data-courses]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-focus]'); if (!b) return;
    focus = focus === b.dataset.focus ? null : b.dataset.focus;
    renderOffer(); renderCalendar();
    if (focus) $('[data-calendar]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('[data-services]').addEventListener('click', (e) => {
    if (!e.target.closest('[data-service-hint]')) return;
    $('[data-calendar]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Tocca un\'ora libera nel calendario per prenotare.');
  });

  /* ---------- calendario ---------- */

  async function loadCalendar() {
    const from = addDays(localDay(new Date()), week * 7);
    cal = await api(`/api/calendar?from=${from}&days=7`);
    renderCalendar();
  }

  function renderCalendar() {
    if (!cal) return;
    const { open, close } = catalog.settings;
    const o = toMin(open), span = toMin(close) - o;
    const days = cal.days;
    const pos = (start, end) => `top:${((toMin(start) - o) / span) * 100}%;height:${((toMin(end) - toMin(start)) / span) * 100}%`;
    const first = days[0], last = days[days.length - 1];
    $('[data-range]').textContent = first ? `${dayLabel(first.date)} – ${dayLabel(last.date).toLowerCase()}` : '';
    $('[data-week="-1"]').disabled = week === 0;
    $('[data-week="1"]').disabled = week >= 2;
    if (shownDay >= days.length) shownDay = 0;

    // linguette dei giorni (su telefono si vede un giorno alla volta)
    $('[data-day-tabs]').innerHTML = days.map((d, i) => {
      const dt = new Date(d.date + 'T12:00:00');
      return `<button role="tab" aria-selected="${i === shownDay}" data-day="${i}"><span>${WD[dt.getDay()]}</span><b>${dt.getDate()}</b></button>`;
    }).join('');

    const hours = [];
    for (let m = Math.ceil(o / 60) * 60; m < o + span; m += 60) hours.push(m);
    const rows = span / 60;

    $('[data-calendar]').innerHTML = `
      <div class="cal-grid" style="--hours:${rows}">
        <div class="cal-times" aria-hidden="true"><div class="cal-head"></div><div class="cal-body">
          ${hours.map((m) => `<span style="top:${((m - o) / span) * 100}%">${hour(toTime(m))}</span>`).join('')}
        </div></div>
        ${days.map((d, i) => {
          const dt = new Date(d.date + 'T12:00:00');
          return `<div class="cal-col${i === shownDay ? ' is-shown' : ''}">
            <div class="cal-head"><span>${WD[dt.getDay()]}</span><b>${dt.getDate()}</b></div>
            <div class="cal-body">
              ${hours.map((m) => `<i class="cal-line" style="top:${((m - o) / span) * 100}%"></i>`).join('')}
              ${d.closed ? '<p class="cal-closed">Chiuso</p>' : ''}
              ${d.free.map((g) => `<button class="blk blk-free" style="${pos(g.start, g.end)}" data-free="${d.date}|${g.start}|${g.end}"
                  aria-label="Ora libera ${dayLabel(d.date)} dalle ${hour(g.start)} alle ${hour(g.end)}"><span>Libero</span><small>${hour(g.start)}–${hour(g.end)}</small></button>`).join('')}
              ${d.lessons.map((l) => `<button class="blk blk-course${l.mine ? ' is-mine' : ''}${l.seatsLeft === 0 && !l.mine ? ' is-full' : ''}${focus && focus !== l.courseId ? ' is-dim' : ''}"
                  style="${pos(l.start, l.end)}" data-lesson="${esc(l.id)}"
                  aria-label="${esc(l.title)}, ${dayLabel(d.date)} dalle ${hour(l.start)} alle ${hour(l.end)}">
                  <b>${esc(l.title)}</b><small>${hour(l.start)}–${hour(l.end)}</small>
                  <small class="blk-seats">${l.mine ? 'Sei iscritto' : l.seatsLeft === 0 ? 'Completo' : l.seatsLeft === 1 ? '1 posto' : `${l.seatsLeft} posti`}</small></button>`).join('')}
              ${d.mine.map((b) => `<div class="blk blk-mine" style="${pos(b.start, b.end)}"><b>${esc(b.title)}</b><small>${b.status === 'in attesa' ? 'In attesa di conferma' : 'Confermato'}</small></div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  $('[data-day-tabs]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]'); if (!b) return;
    shownDay = Number(b.dataset.day); renderCalendar();
  });
  $$('[data-week]').forEach((b) => b.addEventListener('click', async () => {
    week = Math.max(0, Math.min(2, week + Number(b.dataset.week)));
    shownDay = 0;
    await loadCalendar();
  }));

  $('[data-calendar]').addEventListener('click', (e) => {
    const lesson = e.target.closest('[data-lesson]'), free = e.target.closest('[data-free]');
    if (lesson) openLesson(lesson.dataset.lesson);
    if (free) { const [date, start, end] = free.dataset.free.split('|'); openFree(date, start, end); }
  });

  /* ---------- fogli di prenotazione ---------- */

  function openSheet(title, meta) {
    $('[data-sheet-title]').textContent = title;
    $('[data-sheet-meta]').textContent = meta;
    sheet.showModal();
  }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  // se il cliente non è entrato, prima il modulo di accesso, poi si torna dove era
  function withLogin(next) {
    if (window.ZG.client) return next();
    window.ZG.authForm(body, () => { toast(`Ciao ${window.ZG.client.nome}!`); next(); }, 'Per prenotare entra nella tua area, oppure crea il tuo account: ci vuole un minuto.');
  }
  const who = () => `<p class="who">Prenoti come <b>${esc(window.ZG.client.nome)} ${esc(window.ZG.client.cognome)}</b> · <button class="textbtn" type="button" data-switch>Non sei tu?</button></p>`;
  body.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-switch]')) return;
    await api('/api/client/logout', {}).catch(() => {});
    window.ZG.client = null; sheet.close(); toast('Sei uscito dal tuo account.'); loadCalendar();
  });

  function done(text) {
    body.innerHTML = `<p class="lead" style="margin-bottom:24px">${text}</p>
      <div style="display:grid;gap:10px"><a class="btn btn--block" href="area-clienti.html">Vai alla tua area</a>
      <form method="dialog"><button class="btn btn--soft btn--block">Torna al calendario</button></form></div>`;
    loadCalendar();
  }

  function openLesson(id) {
    const l = cal.days.flatMap((d) => d.lessons).find((x) => x.id === id); if (!l) return;
    const c = catalog.courses.find((x) => x.id === l.courseId) || {};
    openSheet(l.title, `${dayLabel(l.date)} dalle ${hour(l.start)} alle ${hour(l.end)} · ${euro(l.price)} a lezione`);
    if (l.mine) { body.innerHTML = '<p class="lead">Sei già iscritto a questa lezione.</p><p style="margin-top:18px"><a class="btn" href="area-clienti.html">Le mie lezioni</a></p>'; return; }
    if (l.seatsLeft === 0) { body.innerHTML = '<p class="lead">Questa lezione è al completo.</p><p class="muted" style="margin-top:8px">Scrivici su WhatsApp: se si libera un posto ti avvisiamo.</p>'; return; }
    const show = () => {
      body.innerHTML = `${who()}
        ${c.description ? `<p class="muted" style="margin-bottom:16px">${esc(c.description)}</p>` : ''}
        <form class="form one" data-lesson-form novalidate>
          <fieldset class="field full"><legend>Come vuoi iscriverti?</legend>
            <div class="choice">
              <label><input type="radio" name="mode" value="single" checked><span><b>Solo questa lezione</b><small>${dayLabel(l.date)} alle ${hour(l.start)} · ${euro(l.price)}</small></span></label>
              <label><input type="radio" name="mode" value="course"><span><b>Tutto il corso</b><small>Tutte le lezioni da questa fino a fine corso${c.schedule?.length ? ` (${esc(scheduleText(c))})` : ''} · ${euro(l.price)} a lezione</small></span></label>
            </div>
          </fieldset>
          <p class="small muted full">Si paga in studio. Se non puoi venire, annulli dalla tua area.</p>
          <button class="btn btn--block btn--big full" type="submit">Conferma l'iscrizione</button>
          <p class="form-msg" role="alert"></p>
        </form>`;
      $('[data-lesson-form]', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = $('.form-msg', e.target);
        try {
          if (e.target.mode.value === 'course') {
            const r = await api('/api/book/course', { courseId: l.courseId, fromSessionId: l.id });
            done(`Sei iscritto a <b>${r.booked} lezioni</b> di ${esc(l.title)}${r.full ? ` (${r.full} erano già piene)` : ''}. Le trovi tutte nella tua area.`);
          } else {
            await api('/api/book/lesson', { sessionId: l.id });
            done(`Sei iscritto a <b>${esc(l.title)}</b>, ${dayLabel(l.date).toLowerCase()} alle ${hour(l.start)}. Porta calze antiscivolo; si paga in studio.`);
          }
        } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
      });
    };
    body.innerHTML = '';
    withLogin(show);
  }

  function openFree(date, gStart, gEnd) {
    openSheet('Ora libera', `${dayLabel(date)}, libero dalle ${hour(gStart)} alle ${hour(gEnd)}`);
    const starts = [];
    for (let m = toMin(gStart); m + 30 <= toMin(gEnd); m += 30) starts.push(toTime(m));
    const fits = (start, minutes) => toMin(start) + minutes <= toMin(gEnd);
    const show = () => {
      body.innerHTML = `${who()}
        <form class="form one" data-free-form novalidate>
          <div class="field full"><label for="f-start">A che ora vuoi iniziare?</label>
            <select id="f-start" name="start">${starts.map((s) => `<option value="${s}">${hour(s)}</option>`).join('')}</select></div>
          <fieldset class="field full"><legend>Di cosa hai bisogno?</legend>
            <div class="choice" data-choice>
              ${catalog.services.map((s, i) => `<label><input type="radio" name="service" value="${esc(s.id)}" data-min="${s.duration}" ${i === 0 ? 'checked' : ''}>
                <span><b>${esc(s.name)}</b><small>${s.duration} minuti · ${euro(s.price)}</small></span></label>`).join('')}
              <label><input type="radio" name="service" value="" data-min="60" ${catalog.services.length ? '' : 'checked'}>
                <span><b>Altro: descrivo io</b><small>Raccontaci il tuo problema o cosa vorresti fare (circa un'ora)</small></span></label>
            </div>
          </fieldset>
          <div class="field full" data-note-field><label for="f-note" data-note-label>Note per Anna <span class="muted">(facoltative)</span></label>
            <textarea id="f-note" name="note" maxlength="800" placeholder="Es. ho mal di schiena da qualche settimana, vorrei capire che esercizi posso fare"></textarea>
            <span class="hint">Niente dati medici dettagliati: ne parlerete di persona.</span></div>
          <p class="full when" data-when></p>
          <button class="btn btn--block btn--big full" type="submit">Invia la richiesta</button>
          <p class="small muted full">Anna conferma la richiesta: vedi la risposta nella tua area.</p>
          <p class="form-msg" role="alert"></p>
        </form>`;
      const form = $('[data-free-form]', body);
      const sync = () => {
        const chosen = $('input[name="service"]:checked', form);
        const minutes = Number(chosen?.dataset.min || 60);
        $$('input[name="service"]', form).forEach((r) => { r.disabled = !fits(form.start.value, Number(r.dataset.min)); r.closest('label').classList.toggle('is-off', r.disabled); });
        if (chosen?.disabled) { const ok = $$('input[name="service"]', form).find((r) => !r.disabled); if (ok) ok.checked = true; }
        const now = $('input[name="service"]:checked', form);
        const other = now && now.value === '';
        $('[data-note-label]', form).innerHTML = other ? 'Descrivi di cosa hai bisogno' : 'Note per Anna <span class="muted">(facoltative)</span>';
        const m = Number(now?.dataset.min || minutes);
        $('[data-when]', form).textContent = now ? `${dayLabel(date)} dalle ${hour(form.start.value)} alle ${hour(toTime(toMin(form.start.value) + m))}` : 'In questo orario non c\'è abbastanza tempo: scegli un\'ora prima.';
      };
      form.addEventListener('change', sync); sync();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = $('.form-msg', form);
        const chosen = $('input[name="service"]:checked', form);
        try {
          const r = await api('/api/book/service', { date, start: form.start.value, serviceId: chosen?.value || '', note: form.note.value });
          done(`Richiesta inviata: <b>${esc(r.title)}</b>, ${dayLabel(r.date).toLowerCase()} alle ${hour(r.start)}. Anna ti conferma: trovi la risposta nella tua area.`);
        } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
      });
    };
    body.innerHTML = '';
    withLogin(show);
  }

  /* ---------- avvio ---------- */

  (async () => {
    try {
      [catalog] = await Promise.all([api('/api/catalog'), window.ZG.loadClient()]);
      renderOffer();
      await loadCalendar();
    } catch {
      $('[data-calendar]').innerHTML = '<p class="empty">Il calendario non si è caricato. Riprova tra poco o scrivici su WhatsApp.</p>';
    }
  })();
})();
