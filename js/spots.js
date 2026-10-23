// Zero Gravity — elenco dei posti liberi e prenotazione veloce
(() => {
  'use strict';
  const { $, $$, api, esc, toast, dayLabel } = window.ZG;

  // anteprima in home: le prossime tre lezioni con posti, con il link alla pagina completa
  const preview = $('[data-spots-preview]');
  if (preview) {
    api('/api/spots').then((spots) => {
      preview.innerHTML = spots.length ? spots.slice(0, 3).map((s) => `
        <a class="spot spot--link" href="posti-liberi.html">
          <time class="spot-time" datetime="${s.startsAt}">${s.time.replace(':', '.')}</time>
          <div><h3 class="spot-title">${esc(s.title)}</h3><p class="spot-meta">${dayLabel(s.date)}</p></div>
          <div class="spot-side"><span class="spot-price">${(Number.isInteger(s.price) ? s.price : s.price.toFixed(2).replace('.', ','))} €</span>
            <span class="seats${s.seatsLeft <= 1 ? ' is-low' : ''}">${s.seatsLeft === 1 ? 'Ultimo posto' : s.seatsLeft + ' posti liberi'}</span></div>
        </a>`).join('')
        : '<div class="panel-box"><p class="lesson-name">In questo momento non ci sono posti liberi.</p><p class="muted" style="margin-top:8px">Si liberano spesso all\'ultimo momento: torna a dare un\'occhiata.</p></div>';
    }).catch(() => { preview.innerHTML = '<p class="empty">Posti non disponibili in questo momento.</p>'; });
  }

  if (!$('[data-spots]')) return;

  const list = $('[data-spot-list]');
  const sheet = $('[data-sheet]');
  const form = $('[data-book-form]');
  const msg = $('.form-msg', form);
  let spots = [], filter = 'tutti', current = null;

  const euro = (n) => (Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')) + ' €';
  const hour = (t) => t.replace(':', '.');

  function render() {
    const rows = spots.filter((s) => filter === 'tutti' || (filter === 'individuale') === s.individual);
    if (!rows.length) {
      list.innerHTML = `<div class="panel-box"><p class="lesson-name">Al momento non ci sono posti liberi${filter === 'tutti' ? '' : ' di questo tipo'}.</p>
        <p class="muted" style="margin-top:8px">I posti si liberano spesso all'ultimo momento: torna a dare un'occhiata.</p></div>`;
      return;
    }
    const byDay = {};
    rows.forEach((s) => (byDay[s.date] ||= []).push(s));
    list.innerHTML = Object.entries(byDay).map(([date, items]) => `
      <div class="spot-day">
        <p class="day-label">${dayLabel(date)}</p>
        ${items.map((s) => `
        <article class="spot">
          <time class="spot-time" datetime="${s.startsAt}">${hour(s.time)}</time>
          <div><h3 class="spot-title">${esc(s.title)}</h3><p class="spot-meta">${s.duration} minuti${s.note ? ' · ' + esc(s.note) : ''}</p></div>
          <div class="spot-side"><span class="spot-price">${euro(s.price)}</span>
            <span class="seats${s.seatsLeft <= 1 ? ' is-low' : ''}">${s.seatsLeft === 1 ? 'Ultimo posto' : s.seatsLeft + ' posti liberi'}</span>
            ${s.capacity > 1 ? `<span class="spot-taken">${s.taken} iscritti su ${s.capacity}</span>` : ''}</div>
          <button class="btn btn--small spot-btn" data-open="${s.id}">Prenota</button>
        </article>`).join('')}
      </div>`).join('');
  }

  async function load() {
    try { spots = await api('/api/spots'); render(); }
    catch { list.innerHTML = '<p class="empty">Non riesco a caricare i posti. Riprova tra poco o scrivici su WhatsApp.</p>'; }
  }

  $('[data-spot-filter]').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]'); if (!chip) return;
    filter = chip.dataset.filter;
    $$('[data-filter]', e.currentTarget).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    render();
  });

  /* --- prenotazione --- */

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]'); if (!btn) return;
    current = spots.find((s) => s.id === btn.dataset.open); if (!current) return;
    $('[data-sheet-title]').textContent = current.title;
    $('[data-sheet-meta]').textContent = `${dayLabel(current.date)} · ore ${hour(current.time)} · ${euro(current.price)} da pagare in studio`;
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
    Object.assign(data, { privacy: form.privacy.checked, firstTime: form.firstTime.checked, spotId: current.id });
    const btn = $('button[type="submit"]', form); btn.disabled = true;
    try {
      await api('/api/book', { body: data });
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
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zero Gravity//Posti liberi//IT', 'BEGIN:VEVENT',
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

  load();
  setInterval(() => { if (!document.hidden && !sheet.open) load(); }, 60e3);
})();
