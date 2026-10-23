// Zero Gravity — area di Anna: Prenotazioni, Aggiungi date, Corsi
(() => {
  'use strict';
  const { $, $$, api, esc, toast, euro, hour, dayLabel } = window.ZG;
  const loginBox = $('[data-login-box]'), panel = $('[data-panel]');
  const say = (el, text, ok) => { el.className = 'form-msg ' + (ok ? 'ok' : 'err'); el.textContent = text; };
  const wa = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '').replace(/^(?!39)/, '39')}?text=${encodeURIComponent(text)}`;
  const pad = (n) => String(n).padStart(2, '0');
  const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => localDay(new Date());
  let data = { courses: [], slots: [] };

  /* ---------- accesso ---------- */

  $('[data-login-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/login', Object.fromEntries(new FormData(e.target))); open(); }
    catch (err) { say($('.form-msg', e.target), err.message); }
  });
  $('[data-logout]').addEventListener('click', async () => { await api('/api/logout', {}).catch(() => {}); location.reload(); });

  /* ---------- schede ---------- */

  function showTab(name) {
    $$('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel-tab]').forEach((p) => { p.hidden = p.dataset.panelTab !== name; });
    history.replaceState(null, '', '#' + name);
  }
  $$('[data-tab]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  panel.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) showTab(g.dataset.goto); });

  async function refresh() {
    data = await api('/api/admin/overview');
    renderBookings(); renderCourses(); fillCourseSelects(); renderShare();
  }

  /* ---------- PRENOTAZIONI ---------- */

  const filterCourse = $('[data-filter-course]'), showPast = $('[data-show-past]');
  filterCourse.addEventListener('change', renderBookings);
  showPast.addEventListener('change', renderBookings);

  function renderBookings() {
    const rows = data.slots.filter((s) => (!filterCourse.value || s.courseId === filterCourse.value) && (showPast.checked || !s.past));
    const future = data.slots.filter((s) => !s.past);
    const week = future.filter((s) => new Date(s.startsAt) - Date.now() < 7 * 864e5);
    $('[data-stats]').innerHTML = `
      <div class="stat"><b>${week.reduce((n, s) => n + s.booked, 0)}</b><span>prenotazioni dal sito nei prossimi 7 giorni</span></div>
      <div class="stat"><b>${week.length}</b><span>lezioni nei prossimi 7 giorni</span></div>
      <div class="stat"><b>${future.reduce((n, s) => n + s.seatsLeft, 0)}</b><span>posti ancora liberi</span></div>`;

    const box = $('[data-bookings]');
    if (!data.courses.length) { box.innerHTML = '<div class="empty-box"><p>Non hai ancora creato corsi.</p><button class="btn" type="button" data-goto="corsi">Crea il primo corso</button></div>'; return; }
    if (!rows.length) { box.innerHTML = '<div class="empty-box"><p>Nessuna lezione in programma.</p><button class="btn" type="button" data-goto="date">Aggiungi date</button></div>'; return; }

    const byDay = {};
    rows.forEach((s) => (byDay[s.date] ||= []).push(s));
    box.innerHTML = Object.entries(byDay).map(([date, items]) => `
      <div class="day">
        <p class="day-label">${dayLabel(date)}</p>
        ${items.map((s) => `
        <article class="lesson-card${s.past ? ' is-past' : ''}${s.people.length ? '' : ' is-quiet'}">
          <header class="lesson-head">
            <span class="slot-time">${hour(s.time)}</span>
            <span class="lesson-title"><b>${esc(s.title)}</b><span class="muted">${s.taken} su ${s.capacity} · ${s.enrolled} in studio, ${s.booked} dal sito</span></span>
            <span class="status ${s.seatsLeft ? 'status--attesa' : 'status--confermata'}">${s.seatsLeft ? (s.seatsLeft === 1 ? '1 posto libero' : `${s.seatsLeft} posti liberi`) : 'Completo'}</span>
          </header>
          ${s.people.length ? `<ul class="people">${s.people.map((p) => `
            <li><b>${esc(p.name)}</b>${p.firstTime ? ' <span class="status status--attesa">prima volta</span>' : ''}
              <span class="people-actions">
                <a class="link" href="tel:${esc(p.phone)}">${esc(p.phone)}</a>
                <a class="link" href="${wa(p.phone, `Ciao ${p.name.split(' ')[0]}, ti aspetto ${dayLabel(s.date).toLowerCase()} alle ${hour(s.time)} per ${s.title}. A presto! Anna`)}" rel="noopener">WhatsApp</a>
                ${s.past ? '' : `<button class="textbtn" data-cancel="${esc(p.id)}">Annulla</button>`}
              </span></li>`).join('')}</ul>` : ''}
          ${s.past ? '' : `<footer class="lesson-foot">
            <span class="counter"><span class="small">Iscritti in studio</span>
              <button class="counter-btn" data-enrolled="${esc(s.id)}" data-to="${s.enrolled - 1}" ${s.enrolled === 0 ? 'disabled' : ''} aria-label="Uno in meno">−</button>
              <b>${s.enrolled}</b>
              <button class="counter-btn" data-enrolled="${esc(s.id)}" data-to="${s.enrolled + 1}" ${s.seatsLeft === 0 ? 'disabled' : ''} aria-label="Uno in più">+</button></span>
            ${s.people.length ? '' : `<button class="textbtn" data-del-slot="${esc(s.id)}">Togli questa data</button>`}
          </footer>`}
        </article>`).join('')}
      </div>`).join('');
  }

  $('[data-bookings]').addEventListener('click', async (e) => {
    const cancel = e.target.closest('[data-cancel]'), count = e.target.closest('[data-enrolled]'), del = e.target.closest('[data-del-slot]');
    if (!cancel && !count && !del) return;
    if (cancel && !confirm('Annullare questa prenotazione? Il posto torna libero.')) return;
    if (del && !confirm('Togliere questa data dal sito?')) return;
    try {
      if (cancel) await api('/api/admin/booking/cancel', { id: cancel.dataset.cancel });
      else if (count) await api('/api/admin/slot/enrolled', { id: count.dataset.enrolled, enrolled: Number(count.dataset.to) });
      else await api('/api/admin/slot/delete', { id: del.dataset.delSlot });
      await refresh();
    } catch (err) { toast(err.message); }
  });

  /* ---------- AGGIUNGI DATE ---------- */

  const wiz = $('[data-slots-form]');
  const timesBox = $('[data-times]');
  const addTime = (value = '') => {
    const row = document.createElement('div');
    row.className = 'time-row';
    row.innerHTML = `<input type="time" name="time" step="300" value="${value}" aria-label="Orario" required><button class="textbtn" type="button" data-remove-time aria-label="Togli questo orario">Togli</button>`;
    timesBox.append(row);
    syncTimeButtons();
  };
  const syncTimeButtons = () => $$('[data-remove-time]', timesBox).forEach((b) => { b.hidden = timesBox.children.length === 1; });
  $('[data-add-time]').addEventListener('click', () => { addTime(); preview(); });
  timesBox.addEventListener('click', (e) => { if (e.target.closest('[data-remove-time]')) { e.target.closest('.time-row').remove(); syncTimeButtons(); preview(); } });

  function wizardValues() {
    const repeat = wiz.repeat.value;
    return {
      courseId: wiz.courseId.value, start: wiz.start.value, repeat,
      until: repeat === 'none' ? '' : wiz.until.value,
      times: $$('input[name="time"]', wiz).map((i) => i.value).filter(Boolean),
      weekdays: $$('input[name="wd"]:checked', wiz).map((i) => Number(i.value)),
      enrolled: Number(wiz.enrolled.value || 0),
    };
  }

  function syncRepeat() {
    const r = wiz.repeat.value;
    $('[data-weekdays]').hidden = r !== 'weekly';
    $('[data-until]').hidden = r === 'none';
    if (r === 'weekly' && !$$('input[name="wd"]:checked', wiz).length && wiz.start.value) {
      const wd = new Date(wiz.start.value + 'T12:00:00').getDay();
      $(`input[name="wd"][value="${wd}"]`, wiz).checked = true;
    }
    if (r !== 'none' && !wiz.until.value && wiz.start.value) {
      const d = new Date(wiz.start.value + 'T12:00:00'); d.setMonth(d.getMonth() + 1);
      wiz.until.value = localDay(d);
    }
  }
  $('[data-repeat]').addEventListener('change', () => { syncRepeat(); preview(); });

  let previewTimer = null;
  function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const box = $('[data-preview]');
      const v = wizardValues();
      if (!v.courseId) { box.innerHTML = ''; return; }
      try {
        const p = await api('/api/admin/slots/preview', v);
        const fresh = p.total - p.existing;
        box.className = 'preview is-ok';
        box.innerHTML = `<b>${fresh === 1 ? 'Verrà creata 1 lezione' : `Verranno create ${fresh} lezioni`}</b>${p.existing ? ` <span class="muted">(${p.existing} c'erano già e non vengono duplicate)</span>` : ''}
          <ul>${p.first.map((s) => `<li>${dayLabel(s.date)} · ${hour(s.time)}</li>`).join('')}</ul>
          ${p.total > p.first.length ? `<p class="muted">… e altre ${p.total - p.first.length}, fino a ${dayLabel(p.last.date).toLowerCase()}.</p>` : ''}`;
      } catch (err) {
        box.className = 'preview is-err';
        box.textContent = err.message;
      }
    }, 200);
  }
  wiz.addEventListener('input', preview);

  wiz.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', wiz);
    try {
      const r = await api('/api/admin/slots', wizardValues());
      say(msg, `Fatto: ${r.created === 1 ? '1 lezione aggiunta' : `${r.created} lezioni aggiunte`}. Le trovi già sul sito e nella scheda Prenotazioni.`, true);
      await refresh();
      preview();
    } catch (err) { say(msg, err.message); }
  });

  function fillCourseSelects() {
    const opts = data.courses.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const keepW = wiz.courseId.value, keepF = filterCourse.value;
    wiz.courseId.innerHTML = opts;
    filterCourse.innerHTML = '<option value="">Tutti</option>' + opts;
    if (data.courses.some((c) => c.id === keepW)) wiz.courseId.value = keepW;
    if (data.courses.some((c) => c.id === keepF)) filterCourse.value = keepF;
    $('[data-no-course]').hidden = !!data.courses.length;
    wiz.hidden = !data.courses.length;
  }

  /* ---------- CORSI ---------- */

  const cform = $('[data-course-form]');
  function resetCourseForm() {
    cform.reset(); cform.id.value = '';
    $('[data-course-form-title]').textContent = 'Nuovo corso';
    $('[data-course-submit]').textContent = 'Crea il corso';
    $('[data-course-reset]').hidden = true;
  }
  $('[data-course-reset]').addEventListener('click', resetCourseForm);

  cform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', cform);
    const editing = !!cform.id.value;
    try {
      const c = await api('/api/admin/course', Object.fromEntries(new FormData(cform)));
      resetCourseForm();
      await refresh();
      say(msg, editing ? 'Corso aggiornato.' : `Corso “${c.name}” creato. Ora aggiungi le date nella scheda “Aggiungi date”.`, true);
      if (!editing) wiz.courseId.value = c.id;
    } catch (err) { say(msg, err.message); }
  });

  function renderCourses() {
    $('[data-courses]').innerHTML = data.courses.length ? data.courses.map((c) => {
      const n = data.slots.filter((s) => s.courseId === c.id && !s.past).length;
      return `<div class="item">
        <div><div class="item-title">${esc(c.name)}</div>
          <div class="item-meta">${c.duration} min · ${c.capacity === 1 ? 'individuale' : `${c.capacity} posti`} · ${euro(c.price)} · ${n === 1 ? '1 data in programma' : `${n} date in programma`}</div></div>
        <div class="item-actions">
          <button class="textbtn" data-add-dates="${esc(c.id)}">Aggiungi date</button>
          <button class="textbtn" data-edit="${esc(c.id)}">Modifica</button>
          <button class="textbtn" data-delete="${esc(c.id)}">Elimina</button>
        </div>
      </div>`;
    }).join('') : '<p class="empty">Nessun corso. Crealo con il modulo qui accanto.</p>';
  }

  $('[data-courses]').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-delete]'), add = e.target.closest('[data-add-dates]');
    if (add) { wiz.courseId.value = add.dataset.addDates; showTab('date'); preview(); return; }
    if (edit) {
      const c = data.courses.find((x) => x.id === edit.dataset.edit);
      Object.entries({ id: c.id, name: c.name, description: c.description || '', duration: c.duration, capacity: c.capacity, price: c.price })
        .forEach(([k, v]) => { cform[k].value = v; });
      $('[data-course-form-title]').textContent = 'Modifica corso';
      $('[data-course-submit]').textContent = 'Salva le modifiche';
      $('[data-course-reset]').hidden = false;
      cform.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (del) {
      const c = data.courses.find((x) => x.id === del.dataset.delete);
      if (!confirm(`Eliminare il corso “${c.name}” e tutte le sue date future?`)) return;
      try { await api('/api/admin/course/delete', { id: c.id }); await refresh(); toast('Corso eliminato.'); }
      catch (err) { toast(err.message); }
    }
  });

  $('[data-pw-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', e.target);
    try { await api('/api/admin/password', Object.fromEntries(new FormData(e.target))); e.target.reset(); say(msg, 'Password cambiata.', true); }
    catch (err) { say(msg, err.message); }
  });

  /* ---------- condividi su WhatsApp ---------- */

  function renderShare() {
    const free = data.slots.filter((s) => !s.past && s.seatsLeft > 0 && new Date(s.startsAt) - Date.now() < 7 * 864e5)
      .map((s) => `• ${dayLabel(s.date)} ore ${hour(s.time)} – ${s.title} – ${s.seatsLeft === 1 ? '1 posto' : s.seatsLeft + ' posti'}`);
    const link = new URL('prenota.html', location.href).href;
    const text = free.length
      ? `Posti liberi da Zero Gravity nei prossimi giorni:\n${free.join('\n')}\n\nPrenoti in un minuto qui: ${link}\nSi paga in studio.`
      : `Prenota le lezioni di Zero Gravity qui: ${link}`;
    $('[data-share-wa]').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  /* ---------- avvio ---------- */

  async function open() {
    loginBox.hidden = true; panel.hidden = false;
    wiz.start.value = localDay(new Date(Date.now() + 864e5));
    wiz.start.min = today(); wiz.until.min = today();
    addTime('18:30');
    await refresh();
    const tab = location.hash.slice(1);
    showTab(['prenotazioni', 'date', 'corsi'].includes(tab) ? tab : (data.courses.length ? 'prenotazioni' : 'corsi'));
    preview();
  }

  api('/api/me').then(open).catch(() => { loginBox.hidden = false; });
})();
