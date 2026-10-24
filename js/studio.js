// Zero Gravity — area di Anna: Prenotazioni, Gestionale, Corsi, Servizi, Impostazioni
(() => {
  'use strict';
  const { $, $$, api, esc, toast, euro, hour, dayLabel } = window.ZG;
  const Core = window.ZGCore;
  const loginBox = $('[data-login-box]'), panel = $('[data-panel]');
  const say = (el, text, ok) => { el.className = 'form-msg ' + (ok ? 'ok' : 'err'); el.textContent = text; };
  const wa = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '').replace(/^(?!39)/, '39')}?text=${encodeURIComponent(text)}`;
  const pad = (n) => String(n).padStart(2, '0');
  const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => localDay(new Date());
  const WD_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const fullName = (c) => (c ? `${c.nome} ${c.cognome}` : 'Cliente');
  const shortDate = (iso) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`; };
  let data = { courses: [], services: [], sessions: [], bookings: [], clients: [], settings: {} };

  /* ---------- accesso ---------- */

  $('[data-login-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/login', Object.fromEntries(new FormData(e.target))); open(); }
    catch (err) { say($('.form-msg', e.target), err.message); }
  });
  $('[data-logout]').addEventListener('click', async () => { await api('/api/logout', {}).catch(() => {}); location.reload(); });

  /* ---------- schede ---------- */

  const TABS = ['prenotazioni', 'gestionale', 'corsi', 'servizi', 'impostazioni'];
  function showTab(name) {
    $$('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel-tab]').forEach((p) => { p.hidden = p.dataset.panelTab !== name; });
    history.replaceState(null, '', '#' + name);
  }
  $$('[data-tab]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  panel.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) showTab(g.dataset.goto); });
  $('[data-alert]').addEventListener('click', () => {
    showTab('prenotazioni');
    $('#richieste').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  async function refresh() {
    data = await api('/api/admin/overview');
    renderRequests(); renderAgenda(); renderLedger(); renderClients(); renderCourses(); renderServices(); renderShare(); fillSelects();
  }

  /* ---------- PRENOTAZIONI ---------- */

  function renderRequests() {
    const list = data.bookings.filter((b) => b.kind === 'servizio' && b.status === 'in attesa' && new Date(`${b.date}T${b.start}:00`) > new Date())
      .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
    // avviso in alto (in ogni scheda) e numero sulla scheda Prenotazioni
    const n = list.length;
    $('[data-alert]').hidden = !n;
    $('[data-alert-n]').textContent = n;
    $('[data-alert-text]').textContent = n === 1 ? 'Hai 1 richiesta da confermare' : `Hai ${n} richieste da confermare`;
    $('[data-badge]').hidden = !n;
    $('[data-badge]').textContent = n;
    $('[data-requests-box]').classList.toggle('is-empty', !n);
    $('[data-requests]').innerHTML = !n ? '<p class="muted">Nessuna richiesta in attesa. Quando un cliente sceglie un’ora libera per un servizio o per un’esigenza sua, la trovi qui da confermare.</p>' : list.map((b) => `
      <div class="item">
        <div>
          <div class="item-title">${dayLabel(b.date)} · ${hour(b.start)}–${hour(b.end)} · ${esc(b.title)}</div>
          <div class="item-meta">${esc(fullName(b.client))} · <a class="link" href="tel:${esc(b.client?.phone)}">${esc(b.client?.phone)}</a> · ${esc(b.client?.email)}</div>
          ${b.note ? `<div class="item-note">“${esc(b.note)}”</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="btn btn--small" data-status="confermata" data-id="${esc(b.id)}">Conferma</button>
          <button class="textbtn" data-status="rifiutata" data-id="${esc(b.id)}">Rifiuta</button>
          <a class="textbtn" href="${wa(b.client?.phone, `Ciao ${b.client?.nome}, sono Anna di Zero Gravity: ho visto la tua richiesta per ${dayLabel(b.date).toLowerCase()} alle ${hour(b.start)}.`)}" rel="noopener">WhatsApp</a>
        </div>
      </div>`).join('');
  }

  $('[data-requests]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-status]'); if (!b) return;
    let reply;
    if (b.dataset.status === 'rifiutata') { reply = prompt('Vuoi scrivere un messaggio al cliente? (facoltativo)', 'Mi dispiace, a quell\'ora non sono disponibile: scrivimi su WhatsApp per un altro orario.'); if (reply === null) return; }
    try { await api('/api/admin/booking/status', { id: b.dataset.id, status: b.dataset.status, reply }); await refresh(); toast(b.dataset.status === 'confermata' ? 'Confermata: il cliente la vede nella sua area.' : 'Rifiutata.'); }
    catch (err) { toast(err.message); }
  });

  const filterCourse = $('[data-filter-course]'), showPast = $('[data-show-past]');
  filterCourse.addEventListener('change', renderAgenda);
  showPast.addEventListener('change', renderAgenda);

  function renderAgenda() {
    const box = $('[data-agenda]');
    if (!data.courses.length && !data.services.length) {
      box.innerHTML = '<div class="empty-box"><p>Per iniziare crea un corso con i suoi orari.</p><button class="btn" type="button" data-goto="corsi">Crea il primo corso</button></div>';
      return;
    }
    const now = new Date();
    const lessons = data.sessions.filter((s) => (!filterCourse.value || s.courseId === filterCourse.value) && (showPast.checked || !s.past))
      .map((s) => ({ type: 'lezione', date: s.date, start: s.start, s }));
    const services = filterCourse.value ? [] : data.bookings.filter((b) => b.kind === 'servizio' && b.status === 'confermata' && (showPast.checked || new Date(`${b.date}T${b.start}:00`) > now))
      .map((b) => ({ type: 'servizio', date: b.date, start: b.start, b }));
    const items = [...lessons, ...services].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)).slice(0, 120);
    if (!items.length) { box.innerHTML = '<p class="muted">Niente in programma.</p>'; return; }
    const byDay = {};
    items.forEach((it) => (byDay[it.date] ||= []).push(it));
    box.innerHTML = Object.entries(byDay).map(([date, list]) => `
      <div class="day"><p class="day-label">${dayLabel(date)}</p>
      ${list.map((it) => (it.type === 'lezione' ? lessonCard(it.s) : serviceCard(it.b))).join('')}</div>`).join('');
  }

  function lessonCard(s) {
    return `<article class="lesson-card${s.past ? ' is-past' : ''}${s.people.length ? '' : ' is-quiet'}">
      <header class="lesson-head">
        <span class="slot-time">${hour(s.start)}</span>
        <span class="lesson-title"><b>${esc(s.title)}</b><span class="muted">${hour(s.start)}–${hour(s.end)} · ${s.enrolled + s.booked} su ${s.capacity} (${s.booked} dal sito, ${s.enrolled} in studio)</span></span>
        <span class="status ${s.seatsLeft ? 'status--attesa' : 'status--confermata'}">${s.seatsLeft ? (s.seatsLeft === 1 ? '1 posto libero' : `${s.seatsLeft} posti liberi`) : 'Completo'}</span>
      </header>
      ${s.people.length ? `<ul class="people">${s.people.map((p) => `
        <li><b>${esc(fullName(p.client))}</b>${p.enrollmentId ? ' <span class="status status--soft">corso intero</span>' : ''}
          ${p.paid ? '<span class="status status--paid">pagato</span>' : ''}
          <span class="people-actions">
            <a class="link" href="tel:${esc(p.client?.phone)}">${esc(p.client?.phone)}</a>
            <a class="link" href="${wa(p.client?.phone, `Ciao ${p.client?.nome}, ti aspetto ${dayLabel(s.date).toLowerCase()} alle ${hour(s.start)} per ${s.title}. A presto! Anna`)}" rel="noopener">WhatsApp</a>
            ${s.past ? '' : `<button class="textbtn" data-cancel="${esc(p.id)}">Annulla</button>`}
          </span></li>`).join('')}</ul>` : ''}
      ${s.past ? '' : `<footer class="lesson-foot">
        <span class="counter"><span class="small">In studio</span>
          <button class="counter-btn" data-enrolled="${esc(s.id)}" data-to="${s.enrolled - 1}" ${s.enrolled === 0 ? 'disabled' : ''} aria-label="Uno in meno">−</button>
          <b>${s.enrolled}</b>
          <button class="counter-btn" data-enrolled="${esc(s.id)}" data-to="${s.enrolled + 1}" ${s.seatsLeft === 0 ? 'disabled' : ''} aria-label="Uno in più">+</button></span>
        ${s.people.length ? '' : `<button class="textbtn" data-del-session="${esc(s.id)}">Togli questa lezione</button>`}
      </footer>`}
    </article>`;
  }

  function serviceCard(b) {
    return `<article class="lesson-card lesson-card--service">
      <header class="lesson-head">
        <span class="slot-time">${hour(b.start)}</span>
        <span class="lesson-title"><b>${esc(b.title)}</b><span class="muted">${hour(b.start)}–${hour(b.end)} · ${esc(fullName(b.client))} · ${esc(b.client?.phone)}</span></span>
        <span class="status status--soft">servizio</span>
      </header>
      ${b.note ? `<p class="item-note">“${esc(b.note)}”</p>` : ''}
      <footer class="lesson-foot"><span>${b.paid ? '<span class="status status--paid">pagato</span>' : ''}</span><button class="textbtn" data-cancel="${esc(b.id)}">Annulla</button></footer>
    </article>`;
  }

  $('[data-agenda]').addEventListener('click', async (e) => {
    const cancel = e.target.closest('[data-cancel]'), count = e.target.closest('[data-enrolled]'), del = e.target.closest('[data-del-session]');
    if (!cancel && !count && !del) return;
    if (cancel && !confirm('Annullare questa prenotazione? Il posto torna libero.')) return;
    if (del && !confirm('Togliere questa lezione dal calendario?')) return;
    try {
      if (cancel) await api('/api/admin/booking/status', { id: cancel.dataset.cancel, status: 'annullata' });
      else if (count) await api('/api/admin/session/enrolled', { id: count.dataset.enrolled, enrolled: Number(count.dataset.to) });
      else await api('/api/admin/session/delete', { id: del.dataset.delSession });
      await refresh();
    } catch (err) { toast(err.message); }
  });

  /* ---------- GESTIONALE ---------- */

  let payFilter = 'due';
  $('[data-pay-filter]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pay]'); if (!b) return;
    payFilter = b.dataset.pay;
    $$('[data-pay]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderLedger();
  });
  $('[data-search]').addEventListener('input', renderLedger);

  // una riga per lezione (o servizio): anche chi è iscritto al corso intero paga lezione per lezione
  function ledgerRows() {
    return data.bookings.filter((b) => b.status === 'confermata' && b.price != null).map((b) => ({
      ids: [b.id], client: b.client, title: b.title, date: b.date,
      kind: b.kind === 'servizio' ? 'Servizio' : b.enrollmentId ? 'Lezione · corso intero' : 'Lezione singola',
      when: `${dayLabel(b.date)} · ${hour(b.start)}`, createdAt: b.createdAt, amount: b.price, paid: !!b.paid,
      due: !b.paid && b.date <= today(), future: b.date > today(), sortKey: `${b.date}${b.start}`,
    }));
  }

  function renderLedger() {
    const rows = ledgerRows();
    const sum = (list) => list.reduce((n, r) => n + r.amount, 0);
    $('[data-money]').innerHTML = `
      <div class="stat"><b>${euro(sum(rows.filter((r) => r.due)))}</b><span>da incassare (lezioni già fatte)</span></div>
      <div class="stat"><b>${euro(sum(rows.filter((r) => r.paid)))}</b><span>già pagato</span></div>
      <div class="stat"><b>${euro(sum(rows.filter((r) => r.future && !r.paid)))}</b><span>in programma</span></div>`;
    const q = $('[data-search]').value.trim().toLowerCase();
    const shown = rows.filter((r) => (payFilter === 'due' ? r.due : payFilter === 'paid' ? r.paid : r.future && !r.paid)
      && (!q || `${fullName(r.client)} ${r.client?.phone} ${r.client?.email} ${r.title}`.toLowerCase().includes(q)))
      .sort((a, b) => (payFilter === 'future' ? a.sortKey.localeCompare(b.sortKey) : b.sortKey.localeCompare(a.sortKey)));
    const LIMIT = 200;
    $('[data-ledger]').innerHTML = shown.length ? shown.slice(0, LIMIT).map((r) => `
      <tr class="${r.paid ? 'is-paid' : ''}">
        <td data-label="Cliente"><b>${esc(fullName(r.client))}</b><small>${esc(r.client?.phone || '')} · ${esc(r.client?.email || '')}</small></td>
        <td data-label="Cosa"><b>${esc(r.title)}</b><small>${esc(r.kind)}</small></td>
        <td data-label="Quando">${esc(r.when)}</td>
        <td data-label="Iscritto il">${shortDate(r.createdAt)}</td>
        <td data-label="Importo" class="num">${euro(r.amount)}</td>
        <td data-label="Pagato"><label class="switch"><input type="checkbox" data-paid="${esc(r.ids.join(','))}" ${r.paid ? 'checked' : ''}><span></span><em>${r.paid ? 'Pagato' : r.future ? 'Non ancora' : 'Da pagare'}</em></label></td>
      </tr>`).join('') + (shown.length > LIMIT ? `<tr><td colspan="6" class="muted">… e altre ${shown.length - LIMIT} righe: usa “Cerca” per trovare un cliente.</td></tr>` : '')
      : `<tr><td colspan="6" class="muted">${payFilter === 'due' ? 'Nessun pagamento in sospeso per le lezioni già fatte.' : 'Niente da mostrare.'}</td></tr>`;
  }

  $('[data-ledger]').addEventListener('change', async (e) => {
    const box = e.target.closest('[data-paid]'); if (!box) return;
    try { await api('/api/admin/booking/paid', { ids: box.dataset.paid.split(','), paid: box.checked }); await refresh(); toast(box.checked ? 'Segnato come pagato.' : 'Segnato come da pagare.'); }
    catch (err) { toast(err.message); box.checked = !box.checked; }
  });

  function renderClients() {
    const rows = data.clients.map((c) => {
      const mine = data.bookings.filter((b) => b.clientId === c.id && b.status === 'confermata');
      const due = mine.filter((b) => !b.paid && b.price != null).reduce((n, b) => n + b.price, 0);
      return { c, count: mine.length, due };
    }).sort((a, b) => fullName(a.c).localeCompare(fullName(b.c)));
    $('[data-clients]').innerHTML = rows.length ? rows.map(({ c, count, due }) => `
      <tr><td data-label="Nome"><b>${esc(fullName(c))}</b></td>
        <td data-label="Telefono"><a class="link" href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td>
        <td data-label="Email"><a class="link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
        <td data-label="Registrato il">${shortDate(c.createdAt)}</td>
        <td data-label="Iscrizioni" class="num">${count}</td>
        <td data-label="Da pagare" class="num">${due ? euro(due) : '—'}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Ancora nessun cliente registrato.</td></tr>';
  }

  /* ---------- CORSI ---------- */

  const cform = $('[data-course-form]'), rowsBox = $('[data-rows]');
  function addRow(r = { repeat: 'weekly', weekday: 2, start: '18:00', end: '19:00' }) {
    const el = document.createElement('div');
    el.className = 'sched-row';
    el.innerHTML = `
      <select data-r="repeat" aria-label="Ripeti">
        <option value="weekly">Ogni settimana</option><option value="daily">Ogni giorno</option><option value="once">Una volta</option>
      </select>
      <select data-r="weekday" aria-label="Giorno della settimana">${WD_LONG.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
      <input data-r="date" type="date" aria-label="Giorno" min="${today()}">
      <span class="sched-time"><span class="small">dalle</span><input data-r="start" type="time" step="300" aria-label="Dalle"></span>
      <span class="sched-time"><span class="small">alle</span><input data-r="end" type="time" step="300" aria-label="Alle"></span>
      <button class="textbtn" type="button" data-del-row aria-label="Togli questo orario">Togli</button>`;
    $('[data-r="repeat"]', el).value = r.repeat;
    $('[data-r="weekday"]', el).value = r.weekday ?? 2;
    $('[data-r="date"]', el).value = r.date || today();
    $('[data-r="start"]', el).value = r.start;
    $('[data-r="end"]', el).value = r.end;
    rowsBox.append(el);
    syncRows();
  }
  function syncRows() {
    $$('.sched-row', rowsBox).forEach((el) => {
      const rep = $('[data-r="repeat"]', el).value;
      $('[data-r="weekday"]', el).hidden = rep !== 'weekly';
      $('[data-r="date"]', el).hidden = rep !== 'once';
      $('[data-del-row]', el).hidden = rowsBox.children.length === 1 && !cform.id.value;
    });
    $('[data-until-field]').hidden = !readRows().some((r) => r.repeat !== 'once');
    coursePreview();
  }
  const readRows = () => $$('.sched-row', rowsBox).map((el) => ({
    repeat: $('[data-r="repeat"]', el).value, weekday: Number($('[data-r="weekday"]', el).value),
    date: $('[data-r="date"]', el).value, start: $('[data-r="start"]', el).value, end: $('[data-r="end"]', el).value,
  }));
  $('[data-add-row]').addEventListener('click', () => {
    const last = readRows().pop();
    addRow(last ? { ...last, weekday: (last.weekday + 2) % 7 } : undefined);
  });
  rowsBox.addEventListener('click', (e) => { if (e.target.closest('[data-del-row]')) { e.target.closest('.sched-row').remove(); syncRows(); } });
  rowsBox.addEventListener('change', syncRows);
  cform.addEventListener('input', coursePreview);

  // anteprima: "ogni martedì 14:30–16:00 … fino al 30 giugno → 36 lezioni"
  function coursePreview() {
    const box = $('[data-course-preview]');
    const rows = readRows();
    if (!rows.length) { box.textContent = cform.id.value ? 'Non aggiungi nuovi orari: salvi solo nome, descrizione, posti e prezzo.' : ''; box.className = 'preview full'; return; }
    try {
      const until = cform.until.value || data.settings.seasonEnd;
      const n = rows.reduce((sum, r) => sum + Core.expandRow(r, today(), until, data.settings.closedDays || []).length, 0);
      const parts = rows.map((r) => `${r.repeat === 'weekly' ? `ogni ${WD_LONG[r.weekday]}` : r.repeat === 'daily' ? 'ogni giorno di apertura' : dayLabel(r.date).toLowerCase()} ${hour(r.start)}–${hour(r.end)}`);
      box.className = 'preview full is-ok';
      box.innerHTML = `<b>${esc(cform.name.value || 'Il corso')}</b>: ${parts.join(', ')}${rows.some((r) => r.repeat !== 'once') ? `, fino al ${dayLabel(until).toLowerCase()}` : ''}. <b>${n === 1 ? '1 lezione' : `${n} lezioni`}</b> in calendario.`;
    } catch (err) { box.className = 'preview full is-err'; box.textContent = err.message; }
  }

  const formBox = $('[data-course-form-box]');
  function resetCourse() {
    cform.reset(); cform.id.value = ''; rowsBox.innerHTML = '';
    cform.until.value = data.settings.seasonEnd || '';
    $('[data-course-title]').textContent = 'Nuovo corso';
    $('[data-course-submit]').textContent = 'Crea il corso';
    $('[data-rows-legend]').textContent = 'Quando si fa';
    addRow();
  }
  function showCourseForm() {
    formBox.hidden = false;
    $('.form-msg', cform).className = 'form-msg';
    formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    cform.name.focus({ preventScroll: true });
  }
  $('[data-new-course]').addEventListener('click', () => { resetCourse(); showCourseForm(); });
  $('[data-course-reset]').addEventListener('click', () => { resetCourse(); formBox.hidden = true; });

  cform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', cform);
    const editing = !!cform.id.value;
    const body = { ...Object.fromEntries(new FormData(cform)), schedule: readRows() };
    try {
      const r = await api('/api/admin/course', body);
      await refresh();
      resetCourse();
      formBox.hidden = true;
      const extra = r.skipped ? ` ${r.skipped} non create perché a quell’ora c’era già un altro corso.` : '';
      toast(editing ? `Corso aggiornato${r.created ? `: ${r.created} lezioni aggiunte` : ''}.${extra}` : `“${r.course.name}” creato: ${r.created} lezioni nel calendario.${extra}`);
      $('[data-courses]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { say(msg, err.message); }
  });

  const scheduleText = (c) => (c.schedule || []).map((r) => `${r.repeat === 'weekly' ? `ogni ${WD_LONG[r.weekday]}` : r.repeat === 'daily' ? 'ogni giorno' : dayLabel(r.date).toLowerCase()} ${hour(r.start)}–${hour(r.end)}`).join(' · ');
  const courseBookings = (id) => data.bookings.filter((b) => b.kind === 'lezione' && b.courseId === id && b.status === 'confermata');
  const isFuture = (x) => new Date(`${x.date}T${x.start}:00`) > new Date();

  // le schede grandi dei corsi: si toccano per aprirle
  function renderCourses() {
    $('[data-courses]').innerHTML = data.courses.length ? data.courses.map((c, i) => {
      const next = data.sessions.filter((s) => s.courseId === c.id && !s.past);
      const people = new Set(courseBookings(c.id).filter(isFuture).map((b) => b.clientId)).size;
      const first = next[0];
      return `<button class="course-tile tone-${(i % 4) + 1}" type="button" data-open-course="${esc(c.id)}">
        <b class="ct-name">${esc(c.name)}</b>
        <span class="ct-when">${esc(scheduleText(c)) || 'Nessun orario'}</span>
        <span class="ct-facts">
          <span><b>${people}</b> ${people === 1 ? 'partecipante' : 'partecipanti'}</span>
          <span><b>${next.length}</b> ${next.length === 1 ? 'lezione' : 'lezioni'} in programma</span>
        </span>
        <span class="ct-next">${first ? `Prossima: ${dayLabel(first.date).toLowerCase()} alle ${hour(first.start)} · ${first.enrolled + first.booked}/${first.capacity}` : 'Nessuna lezione in programma'}</span>
        <span class="ct-open">Apri ›</span>
      </button>`;
    }).join('') : '<div class="empty-box"><p>Non hai ancora creato corsi.</p><p class="muted">Premi “+ Nuovo corso” e scrivi nome, prezzo e orari.</p></div>';
    if (view.open && openId) renderCourseView();
  }
  $('[data-courses]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open-course]'); if (b) openCourse(b.dataset.openCourse);
  });

  /* ---------- un corso aperto in grande ---------- */

  const view = $('[data-course-view]');
  let openId = null, selId = null;
  const lessonDone = (s) => new Date(`${s.date}T${s.start}:00`) <= new Date(); // si paga quando la lezione c'è stata (o è oggi)
  const dueNow = (b) => !b.paid && b.date <= today();

  function openCourse(id) {
    openId = id; selId = null; $('[data-cv-search]').value = '';
    renderCourseView(); view.showModal();
  }
  view.addEventListener('click', (e) => { if (e.target === view) view.close(); });
  $('[data-cv-search]').addEventListener('input', renderCourseView);

  function renderCourseView() {
    const c = data.courses.find((x) => x.id === openId);
    if (!c) { view.close(); return; }
    // le lezioni delle ultime due settimane (per segnare i pagamenti) e le prossime
    const lessons = data.sessions.filter((s) => s.courseId === c.id);
    const upcoming = lessons.filter((s) => !s.past);
    const bookings = courseBookings(c.id);
    $('[data-cv-title]').textContent = c.name;
    $('[data-cv-when]').textContent = `${scheduleText(c)} · ${c.capacity === 1 ? 'individuale' : `${c.capacity} posti`} · ${euro(c.price)} a lezione`;

    // lezione scelta: quella di oggi o la prossima; se non ce ne sono, l'ultima fatta
    if (!lessons.some((s) => s.id === selId)) {
      const todayOrNext = lessons.find((s) => s.date >= today());
      selId = (todayOrNext || lessons[lessons.length - 1] || {}).id || null;
    }

    const peopleCount = new Set(bookings.filter(isFuture).map((b) => b.clientId)).size;
    const wholeCount = new Set(bookings.filter((b) => isFuture(b) && b.enrollmentId).map((b) => b.clientId)).size;
    const due = bookings.filter(dueNow).reduce((n, b) => n + (b.price || 0), 0);
    $('[data-cv-stats]').innerHTML = `
      <div class="stat"><b>${peopleCount}</b><span>partecipanti</span></div>
      <div class="stat"><b>${wholeCount}</b><span>iscritti al corso intero</span></div>
      <div class="stat"><b>${upcoming.length}</b><span>lezioni in programma</span></div>
      <div class="stat"><b>${euro(due)}</b><span>da incassare (lezioni già fatte)</span></div>`;

    // elenco delle lezioni: si tocca per aprirla
    const list = lessons.slice(0, 60);
    $('[data-cv-lessons]').innerHTML = list.length ? list.map((s) => {
      const unpaid = s.people.filter((p) => !p.paid).length;
      const note = lessonDone(s) ? (s.people.length ? (unpaid ? `${unpaid} da pagare` : 'tutti pagato') : '') : '';
      return `<button class="cv-lesson${s.id === selId ? ' is-on' : ''}${s.past ? ' is-past' : ''}" type="button" data-sel="${esc(s.id)}">
        <span class="cv-lesson-head"><b>${dayLabel(s.date)} · ${hour(s.start)}</b><span class="cv-count">${s.enrolled + s.booked}/${s.capacity}</span></span>
        ${note ? `<span class="cv-pay-note${unpaid ? ' is-due' : ''}">${note}</span>` : ''}
      </button>`;
    }).join('') + (lessons.length > 60 ? `<p class="small muted">… e altre ${lessons.length - 60} lezioni.</p>` : '')
      : '<p class="muted">Nessuna lezione. Aggiungi orari con “Modifica o aggiungi orari”.</p>';

    // partecipanti della lezione scelta, con il pagamento di quella lezione
    const sel = lessons.find((s) => s.id === selId);
    if (!sel) {
      $('[data-cv-sel-title]').textContent = 'Lezione';
      $('[data-cv-sel-meta]').textContent = '';
      $('[data-cv-sel-people]').innerHTML = '';
    } else {
      $('[data-cv-sel-title]').textContent = `${dayLabel(sel.date)}, ${hour(sel.start)}–${hour(sel.end)}`;
      $('[data-cv-sel-meta]').textContent = `${sel.enrolled + sel.booked} su ${sel.capacity} · ${sel.booked} dal sito${sel.enrolled ? `, ${sel.enrolled} in studio` : ''}${sel.past ? ' · lezione già fatta' : ''}`;
      $('[data-cv-sel-people]').innerHTML = sel.people.length ? `<ul class="pay-list">${sel.people.map((p) => `
        <li>
          <span class="pay-who"><b>${esc(fullName(p.client))}</b><small>${p.enrollmentId ? 'Corso intero' : 'Lezione singola'} · <a class="link" href="tel:${esc(p.client?.phone)}">${esc(p.client?.phone)}</a></small></span>
          <span class="pay-price">${euro(p.price || 0)}</span>
          <label class="switch"><input type="checkbox" data-paid-one="${esc(p.id)}" ${p.paid ? 'checked' : ''}><span></span><em>${p.paid ? 'Pagato' : 'Da pagare'}</em></label>
        </li>`).join('')}</ul>`
        : `<p class="muted">Nessuno si è iscritto dal sito a questa lezione${sel.enrolled ? ` (${sel.enrolled} iscritti in studio)` : ''}.</p>`;
    }

    // tutti i partecipanti del corso (solo da consultare: i pagamenti si segnano lezione per lezione)
    const byClient = new Map();
    bookings.forEach((b) => { if (!byClient.has(b.clientId)) byClient.set(b.clientId, []); byClient.get(b.clientId).push(b); });
    const people = [...byClient.values()].map((items) => {
      items.sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
      const future = items.filter(isFuture), done = items.filter((b) => b.date <= today());
      return {
        client: items[0].client, future, next: future[0], whole: items.some((b) => b.enrollmentId),
        done: done.length, paidDone: done.filter((b) => b.paid).length, due: items.filter(dueNow).reduce((n, b) => n + (b.price || 0), 0),
      };
    }).filter((p) => p.future.length || p.due).sort((a, b) => fullName(a.client).localeCompare(fullName(b.client)));
    const q = $('[data-cv-search]').value.trim().toLowerCase();
    const shown = people.filter((p) => !q || `${fullName(p.client)} ${p.client?.phone}`.toLowerCase().includes(q));
    $('[data-cv-people]').innerHTML = shown.length ? shown.map((p) => `
      <tr>
        <td data-label="Nome"><b>${esc(fullName(p.client))}</b></td>
        <td data-label="Contatti"><a class="link" href="tel:${esc(p.client?.phone)}">${esc(p.client?.phone)}</a><small>${esc(p.client?.email || '')}</small></td>
        <td data-label="Iscrizione">${p.whole ? '<span class="status status--soft">Corso intero</span>' : 'Lezioni singole'}<small>${p.future.length === 1 ? '1 lezione in programma' : `${p.future.length} lezioni in programma`}</small></td>
        <td data-label="Prossima lezione">${p.next ? `${dayLabel(p.next.date)} · ${hour(p.next.start)}` : '—'}</td>
        <td data-label="Pagamenti" class="num">${p.due ? `<span class="status status--due">${euro(p.due)} da pagare</span>` : '<span class="status status--paid">In regola</span>'}<small>${p.done ? `${p.paidDone} di ${p.done} lezioni fatte pagate` : 'nessuna lezione ancora fatta'}</small></td>
        <td data-label="" class="cv-row-actions"><a class="textbtn" href="${wa(p.client?.phone, `Ciao ${p.client?.nome}, sono Anna di Zero Gravity.`)}" rel="noopener">WhatsApp</a></td>
      </tr>`).join('') : `<tr><td colspan="6" class="muted">${people.length ? 'Nessun partecipante con questo nome.' : 'Nessun iscritto per ora. Quando qualcuno prenota, lo vedi qui.'}</td></tr>`;
  }

  $('[data-cv-lessons]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sel]'); if (!b) return;
    selId = b.dataset.sel; renderCourseView();
    if (matchMedia('(max-width: 960px)').matches) $('.cv-selected').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // pagato / da pagare di una singola lezione
  $('[data-cv-sel-people]').addEventListener('change', async (e) => {
    const box = e.target.closest('[data-paid-one]'); if (!box) return;
    try { await api('/api/admin/booking/paid', { id: box.dataset.paidOne, paid: box.checked }); await refresh(); toast(box.checked ? 'Lezione segnata come pagata.' : 'Lezione segnata come da pagare.'); }
    catch (err) { toast(err.message); box.checked = !box.checked; }
  });

  $('[data-cv-edit]').addEventListener('click', () => {
    const c = data.courses.find((x) => x.id === openId); if (!c) return;
    view.close();
    cform.id.value = c.id; cform.name.value = c.name; cform.description.value = c.description || ''; cform.capacity.value = c.capacity; cform.price.value = c.price;
    rowsBox.innerHTML = '';
    $('[data-course-title]').textContent = `Modifica “${c.name}”`;
    $('[data-course-submit]').textContent = 'Salva';
    $('[data-rows-legend]').textContent = 'Nuovi orari da aggiungere (facoltativo)';
    syncRows();
    showCourseForm();
  });

  $('[data-cv-delete]').addEventListener('click', async () => {
    const c = data.courses.find((x) => x.id === openId); if (!c) return;
    if (!confirm(`Eliminare “${c.name}” e tutte le sue prossime lezioni?`)) return;
    try { await api('/api/admin/course/delete', { id: c.id }); view.close(); await refresh(); toast('Corso eliminato.'); }
    catch (err) { toast(err.message); }
  });


  /* ---------- SERVIZI ---------- */

  const sform = $('[data-service-form]');
  function resetService() {
    sform.reset(); sform.id.value = '';
    $('[data-service-title]').textContent = 'Nuovo servizio';
    $('[data-service-submit]').textContent = 'Aggiungi il servizio';
    $('[data-service-reset]').hidden = true;
  }
  $('[data-service-reset]').addEventListener('click', resetService);
  sform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', sform);
    try { const s = await api('/api/admin/service', Object.fromEntries(new FormData(sform))); resetService(); await refresh(); say(msg, `“${s.name}” salvato: i clienti lo vedono nelle ore libere.`, true); }
    catch (err) { say(msg, err.message); }
  });
  function renderServices() {
    $('[data-services]').innerHTML = data.services.length ? data.services.map((s) => `
      <div class="item"><div><div class="item-title">${esc(s.name)}</div><div class="item-meta">${s.duration} minuti · ${euro(s.price)}</div></div>
        <div class="item-actions"><button class="textbtn" data-edit-service="${esc(s.id)}">Modifica</button><button class="textbtn" data-del-service="${esc(s.id)}">Elimina</button></div></div>`).join('')
      : '<p class="muted">Nessun servizio. I clienti possono comunque descrivere di cosa hanno bisogno.</p>';
  }
  $('[data-services]').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit-service]'), del = e.target.closest('[data-del-service]');
    if (edit) {
      const s = data.services.find((x) => x.id === edit.dataset.editService);
      Object.entries({ id: s.id, name: s.name, description: s.description || '', duration: s.duration, price: s.price }).forEach(([k, v]) => { sform[k].value = v; });
      $('[data-service-title]').textContent = `Modifica “${s.name}”`;
      $('[data-service-submit]').textContent = 'Salva';
      $('[data-service-reset]').hidden = false;
    }
    if (del) {
      const s = data.services.find((x) => x.id === del.dataset.delService);
      if (!confirm(`Eliminare il servizio “${s.name}”? Le richieste già fatte restano.`)) return;
      try { await api('/api/admin/service/delete', { id: s.id }); await refresh(); } catch (err) { toast(err.message); }
    }
  });

  /* ---------- IMPOSTAZIONI ---------- */

  const stform = $('[data-settings-form]');
  function fillSettings() {
    const st = data.settings;
    stform.open.value = st.open; stform.close.value = st.close; stform.seasonEnd.value = st.seasonEnd;
    $('[data-closed]').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" name="closed" value="${d}" ${st.closedDays.includes(d) ? 'checked' : ''}><span>${WD_LONG[d]}</span></label>`).join('');
  }
  stform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', stform);
    try {
      await api('/api/admin/settings', { open: stform.open.value, close: stform.close.value, seasonEnd: stform.seasonEnd.value, closedDays: $$('input[name="closed"]:checked', stform).map((i) => Number(i.value)) });
      await refresh(); say(msg, 'Salvato.', true);
    } catch (err) { say(msg, err.message); }
  });
  $('[data-pw-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', e.target);
    try { await api('/api/admin/password', Object.fromEntries(new FormData(e.target))); e.target.reset(); say(msg, 'Password cambiata.', true); }
    catch (err) { say(msg, err.message); }
  });

  /* ---------- varie ---------- */

  function fillSelects() {
    const keep = filterCourse.value;
    filterCourse.innerHTML = '<option value="">Tutti</option>' + data.courses.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if (data.courses.some((c) => c.id === keep)) filterCourse.value = keep;
  }

  function renderShare() {
    const free = data.sessions.filter((s) => !s.past && s.seatsLeft > 0 && new Date(`${s.date}T${s.start}:00`) - Date.now() < 7 * 864e5)
      .map((s) => `• ${dayLabel(s.date)} ${hour(s.start)}–${hour(s.end)} – ${s.title} – ${s.seatsLeft === 1 ? '1 posto' : s.seatsLeft + ' posti'}`);
    const link = new URL('prenota.html', location.href).href;
    const text = free.length ? `Posti liberi da Zero Gravity nei prossimi giorni:\n${free.join('\n')}\n\nPrenoti qui: ${link}\nSi paga in studio.` : `Prenota le lezioni di Zero Gravity qui: ${link}`;
    $('[data-share-wa]').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  async function open() {
    loginBox.hidden = true; panel.hidden = false;
    await refresh();
    fillSettings(); resetCourse();
    const tab = location.hash.slice(1);
    const pending = !$('[data-alert]').hidden;
    // con richieste in attesa si parte sempre da Prenotazioni
    showTab(pending ? 'prenotazioni' : TABS.includes(tab) ? tab : (data.courses.length ? 'prenotazioni' : 'corsi'));
  }

  api('/api/me').then(open).catch(() => { loginBox.hidden = false; });
})();
