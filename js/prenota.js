// Zero Gravity — pagina Prenota: 1) scegli il corso, 2) scegli giorno e ora, 3) nome e telefono
(() => {
  'use strict';
  const { $, $$, api, esc, toast, euro, hour, dayLabel, seatsText } = window.ZG;
  const params = new URLSearchParams(location.search);
  const pick = $('[data-course-pick]'), list = $('[data-slot-list]');
  const sheet = $('[data-sheet]'), form = $('[data-book-form]'), msg = $('.form-msg', form);
  let courses = [], slots = [], chosen = params.get('corso') || 'tutti', current = null;

  function renderCourses() {
    const withDates = courses.filter((c) => c.count);
    if (!courses.length) { pick.innerHTML = '<p class="muted">I corsi saranno pubblicati a breve.</p>'; return; }
    if (chosen !== 'tutti' && !courses.some((c) => c.id === chosen)) chosen = 'tutti';
    pick.innerHTML = [`<button class="pick${chosen === 'tutti' ? ' is-on' : ''}" role="radio" aria-checked="${chosen === 'tutti'}" data-course="tutti"><b>Tutti i corsi</b><span>${slots.length} date</span></button>`,
      ...withDates.map((c) => `<button class="pick${chosen === c.id ? ' is-on' : ''}" role="radio" aria-checked="${chosen === c.id}" data-course="${esc(c.id)}">
        <b>${esc(c.name)}</b><span>${c.duration} min · ${euro(c.price)}</span></button>`)].join('');
  }

  function renderSlots() {
    const rows = slots.filter((s) => chosen === 'tutti' || s.courseId === chosen);
    if (!rows.length) {
      list.innerHTML = `<div class="empty-box"><p>${slots.length ? 'Per questo corso non ci sono date in programma.' : 'Le date delle prossime lezioni saranno pubblicate a breve.'}</p>
        <p class="muted">Scrivici su WhatsApp: ti diciamo quando si apre un posto.</p></div>`;
      return;
    }
    const byDay = {};
    rows.forEach((s) => (byDay[s.date] ||= []).push(s));
    list.innerHTML = Object.entries(byDay).map(([date, items]) => `
      <div class="day">
        <p class="day-label">${dayLabel(date)}</p>
        ${items.map((s) => `
        <div class="slot-row${s.seatsLeft === 0 ? ' is-full' : ''}${s.id === params.get('lezione') ? ' is-target' : ''}" id="l-${esc(s.id)}">
          <span class="slot-time">${hour(s.time)}</span>
          <span class="slot-main"><b>${esc(s.title)}</b><span class="muted">${s.duration} minuti · ${euro(s.price)}${s.capacity > 1 ? ` · ${s.taken} iscritti su ${s.capacity}` : ''}</span></span>
          <span class="seats${s.seatsLeft <= 1 ? ' is-low' : ''}">${seatsText(s)}</span>
          ${s.seatsLeft ? `<button class="btn btn--small" data-open="${esc(s.id)}">Prenota</button>` : '<span class="btn btn--small btn--off" aria-hidden="true">Completo</span>'}
        </div>`).join('')}
      </div>`).join('');
  }

  async function load() {
    try {
      [courses, slots] = await Promise.all([api('/api/courses'), api('/api/slots')]);
      renderCourses(); renderSlots();
    } catch {
      list.innerHTML = '<p class="empty">Le date non si sono caricate. Riprova tra poco o scrivici su WhatsApp.</p>';
    }
  }

  pick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-course]'); if (!b) return;
    chosen = b.dataset.course;
    const url = new URL(location.href);
    if (chosen === 'tutti') url.searchParams.delete('corso'); else url.searchParams.set('corso', chosen);
    url.searchParams.delete('lezione');
    history.replaceState(null, '', url);
    renderCourses(); renderSlots();
  });

  /* --- foglio di prenotazione --- */

  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    current = slots.find((s) => s.id === b.dataset.open); if (!current) return;
    $('[data-sheet-title]').textContent = current.title;
    $('[data-sheet-meta]').textContent = `${dayLabel(current.date)} alle ${hour(current.time)} · ${current.duration} minuti · ${euro(current.price)} da pagare in studio`;
    $('[data-sheet-form-wrap]').hidden = false;
    $('[data-sheet-done]').hidden = true;
    msg.className = 'form-msg'; msg.textContent = '';
    sheet.showModal();
    form.name.focus();
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); }); // clic fuori = chiudi

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    Object.assign(data, { privacy: form.privacy.checked, firstTime: form.firstTime.checked, slotId: current.id });
    const btn = $('button[type="submit"]', form); btn.disabled = true;
    try {
      await api('/api/book', data);
      $('[data-done-text]').textContent = `${current.title}, ${dayLabel(current.date).toLowerCase()} alle ${hour(current.time)}. Porta calze antiscivolo; ${euro(current.price)} si pagano in studio.`;
      $('[data-ics]').href = icsUrl(current);
      $('[data-sheet-form-wrap]').hidden = true;
      $('[data-sheet-done]').hidden = false;
      form.reset();
      load();
    } catch (err) {
      msg.className = 'form-msg err'; msg.textContent = err.message;
      if (err.status === 404 || err.status === 409) load();
    } finally { btn.disabled = false; }
  });

  // promemoria per il calendario del telefono
  function icsUrl(s) {
    const start = new Date(s.startsAt), end = new Date(start.getTime() + s.duration * 60e3);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zero Gravity//Prenotazioni//IT', 'BEGIN:VEVENT',
      `UID:${s.id}@zerogravityfeltre.it`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
      `SUMMARY:${s.title} - Zero Gravity`, 'LOCATION:Via Monte Cauriol 3/A\\, 32032 Feltre (BL)',
      'DESCRIPTION:Pagamento in studio. Porta calze antiscivolo.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }

  /* --- aggiungi alla schermata Home --- */
  let deferred = null;
  const installBtn = $('[data-install]');
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e;
    installBtn.hidden = false; $('[data-install-hint]').hidden = true;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    if ((await deferred.userChoice).outcome === 'accepted') toast('Fatto: trovi Zero Gravity nella schermata Home.');
    deferred = null; installBtn.hidden = true;
  });
  if (matchMedia('(display-mode: standalone)').matches) $('[data-install-box]').hidden = true;

  load().then(() => {
    const target = params.get('lezione') && document.getElementById('l-' + params.get('lezione'));
    target?.scrollIntoView({ block: 'center' });
  });
  setInterval(() => { if (!document.hidden && !sheet.open) load(); }, 60e3);
})();
