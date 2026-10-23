// Zero Gravity — area studio: la titolare scrive le lezioni con posti liberi e vede chi le ha prenotate
(() => {
  'use strict';
  const { $, api, esc, toast, dayLabel } = window.ZG;
  const loginBox = $('[data-login-box]'), panel = $('[data-panel]');
  const euro = (n) => (Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')) + ' €';
  const hour = (t) => t.replace(':', '.');
  const wa = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '').replace(/^(?!39)/, '39')}?text=${encodeURIComponent(text)}`;
  const say = (el, text, ok) => { el.className = 'form-msg ' + (ok ? 'ok' : 'err'); el.textContent = text; };
  const freeText = (n) => (n === 1 ? '1 posto libero' : `${n} posti liberi`);
  let names = [], shareText = '';

  /* --- accesso --- */
  $('[data-login-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/login', { body: Object.fromEntries(new FormData(e.target)) }); open(); }
    catch (err) { say($('.form-msg', e.target), err.message); }
  });
  $('[data-logout]').addEventListener('click', async () => { await api('/api/logout', { body: {} }).catch(() => {}); location.reload(); });

  /* --- elenco delle lezioni in vetrina --- */
  async function load() {
    const spots = await api('/api/studio');
    $('[data-list]').innerHTML = spots.length ? spots.map((s) => `
      <div class="item">
        <div>
          <div class="item-title">${dayLabel(s.date)} · ${hour(s.time)} · ${esc(s.title)} · ${euro(s.price)}</div>
          <div class="item-meta">${s.taken} iscritti su ${s.capacity} (${s.enrolled} in studio${s.booked ? `, ${s.booked} dal sito` : ''}) · ${s.duration} minuti${s.note ? ' · ' + esc(s.note) : ''}</div>
          <div class="counter" aria-label="Iscritti in studio">
            <span class="item-meta">Iscritti in studio</span>
            <button class="counter-btn" data-enrolled="${s.id}" data-to="${s.enrolled - 1}" ${s.enrolled === 0 ? 'disabled' : ''} aria-label="Uno in meno">−</button>
            <b>${s.enrolled}</b>
            <button class="counter-btn" data-enrolled="${s.id}" data-to="${s.enrolled + 1}" ${s.seatsLeft === 0 ? 'disabled' : ''} aria-label="Uno in più">+</button>
          </div>
          ${s.people.map((p) => `<div class="item-meta person">${esc(p.name)}${p.firstTime ? ' <span class="status status--attesa">prima volta</span>' : ''}
            · <a class="link" href="tel:${esc(p.phone)}">${esc(p.phone)}</a>
            · <a class="link" href="${wa(p.phone, `Ciao ${p.name.split(' ')[0]}, ti aspetto ${dayLabel(s.date).toLowerCase()} alle ${hour(s.time)} per ${s.title}. A presto! Anna`)}" rel="noopener">WhatsApp</a>
            · <button class="textbtn" data-cancel="${p.id}">annulla</button></div>`).join('')}
        </div>
        <div class="item-actions">
          <span class="status ${s.seatsLeft ? 'status--attesa' : 'status--confermata'}">${s.seatsLeft ? freeText(s.seatsLeft) : 'Completo'}</span>
          ${s.people.length ? '' : `<button class="textbtn" data-remove="${s.id}">Togli</button>`}
        </div>
      </div>`).join('') : '<p class="empty">Nessuna lezione in vetrina. Aggiungine una qui sopra.</p>';

    const free = spots.filter((s) => s.seatsLeft > 0).map((s) =>
      `• ${dayLabel(s.date)} ore ${hour(s.time)} – ${s.title} – ${freeText(s.seatsLeft)} – ${euro(s.price)}`);
    shareText = `Posti liberi da Zero Gravity:\n${free.join('\n') || '(nessuno al momento)'}\n\nPrenoti in un minuto qui: ${new URL('posti-liberi.html', location.href).href}\nSi paga in studio.`;
    $('[data-share-wa]').href = 'https://wa.me/?text=' + encodeURIComponent(shareText);
  }

  $('[data-list]').addEventListener('click', async (e) => {
    const remove = e.target.closest('[data-remove]'), cancel = e.target.closest('[data-cancel]'), count = e.target.closest('[data-enrolled]');
    if (!remove && !cancel && !count) return;
    if (cancel && !confirm('Annullare questa prenotazione? Il posto torna libero.')) return;
    try {
      if (remove) await api('/api/studio/remove', { body: { id: remove.dataset.remove } });
      else if (cancel) await api('/api/studio/cancel', { body: { id: cancel.dataset.cancel } });
      else await api('/api/studio/enrolled', { body: { id: count.dataset.enrolled, enrolled: Number(count.dataset.to) } });
      load();
    } catch (err) { toast(err.message); }
  });

  $('[data-share-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareText); toast('Messaggio copiato: incollalo nel gruppo.'); }
    catch { toast('Copia non riuscita: usa il pulsante WhatsApp.'); }
  });

  /* --- nuova lezione --- */
  const add = $('[data-add-form]');
  const preview = () => {
    const left = Number(add.capacity.value) - Number(add.enrolled.value);
    $('[data-free-preview]').textContent = left > 0 ? `Sul sito comparirà con ${freeText(left)}.` : 'Gli iscritti devono essere meno dei posti totali.';
  };
  add.addEventListener('input', preview);
  // se il nome è già stato usato, riprende durata, posti e prezzo dell'ultima volta
  add.title.addEventListener('change', () => {
    const used = names.find((n) => n.title.toLowerCase() === add.title.value.trim().toLowerCase());
    if (used) { add.duration.value = used.duration; add.capacity.value = used.capacity; add.price.value = used.price; preview(); }
  });
  add.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', add);
    try {
      await api('/api/studio/add', { body: Object.fromEntries(new FormData(add)) });
      say(msg, 'Pubblicata: la lezione è già visibile sul sito.', true);
      add.note.value = ''; add.enrolled.value = 0; preview();
      loadNames(); load();
    } catch (err) { say(msg, err.message); }
  });

  async function loadNames() {
    names = await api('/api/studio/names');
    $('#s-names').innerHTML = names.map((n) => `<option value="${esc(n.title)}">`).join('');
  }

  /* --- password --- */
  $('[data-pw-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', e.target);
    try { await api('/api/studio/password', { body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); say(msg, 'Password cambiata.', true); }
    catch (err) { say(msg, err.message); }
  });

  /* --- avvio --- */
  async function open() {
    loginBox.hidden = true; panel.hidden = false;
    add.date.min = new Date().toISOString().slice(0, 10);
    add.date.value = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    add.time.value = '18:30';
    preview();
    loadNames(); load();
  }

  api('/api/me').then(open).catch(() => { loginBox.hidden = false; });
})();
