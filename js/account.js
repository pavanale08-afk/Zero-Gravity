// Zero Gravity — area dei clienti: lezioni, corsi e richieste di chi è entrato
(() => {
  'use strict';
  const { $, api, esc, toast, euro, hour, dayLabel } = window.ZG;
  const guest = $('[data-guest]'), member = $('[data-member]');

  const STATUS = {
    confermata: ['Confermata', 'status--confermata'],
    'in attesa': ['In attesa di conferma', 'status--attesa'],
    rifiutata: ['Non disponibile', 'status--no'],
    annullata: ['Annullata', 'status--no'],
  };
  const badge = (s) => `<span class="status ${STATUS[s][1]}">${STATUS[s][0]}</span>`;
  const paidBadge = (b) => (b.status === 'confermata' ? (b.paid ? '<span class="status status--paid">Pagato</span>' : '<span class="status status--due">Da pagare in studio</span>') : '');
  let showAll = false;
  const isFuture = (b) => b.date && new Date(`${b.date}T${b.start}:00`) > new Date();

  function row(b, cancellable) {
    return `<div class="item">
      <div>
        <div class="item-title">${dayLabel(b.date)} · ${hour(b.start)}–${hour(b.end)}</div>
        <div class="item-meta">${esc(b.title)}${b.enrollmentId ? ' · corso intero' : ''}${b.price != null ? ` · ${euro(b.price)}` : ''}</div>
        ${b.note ? `<div class="item-meta">“${esc(b.note)}”</div>` : ''}
        ${b.reply ? `<div class="item-meta">Risposta di Anna: ${esc(b.reply)}</div>` : ''}
      </div>
      <div class="item-actions">${b.kind === 'servizio' || b.status !== 'confermata' ? badge(b.status) : ''}${paidBadge(b)}
        ${cancellable ? `<button class="textbtn" data-cancel="${esc(b.id)}">Annulla</button>` : ''}</div>
    </div>`;
  }

  async function load() {
    const list = await api('/api/me/bookings');
    const active = list.filter((b) => b.status !== 'annullata' && b.status !== 'rifiutata');
    const lessons = active.filter((b) => b.kind === 'lezione' && isFuture(b));
    const requests = list.filter((b) => b.kind === 'servizio' && isFuture(b) && b.status !== 'annullata');
    const history = list.filter((b) => !isFuture(b) || b.status === 'annullata' || (b.kind === 'lezione' && b.status === 'rifiutata')).reverse();
    const due = active.filter((b) => b.status === 'confermata' && !b.paid && b.price != null && !isFuture(b));

    $('[data-stats]').innerHTML = `
      <div class="stat"><b>${lessons.length}</b><span>lezioni in programma</span></div>
      <div class="stat"><b>${requests.filter((b) => b.status === 'in attesa').length}</b><span>richieste in attesa</span></div>
      <div class="stat"><b>${euro(due.reduce((n, b) => n + b.price, 0))}</b><span>da pagare in studio per lezioni già fatte</span></div>`;

    // le prime 8; le altre con "Mostra tutte" (con un corso intero possono essere decine)
    const limit = showAll ? lessons.length : 8;
    $('[data-next]').innerHTML = lessons.length ? lessons.slice(0, limit).map((b) => row(b, true)).join('')
      + (lessons.length > limit ? `<button class="btn btn--soft btn--small show-more" type="button" data-show-all>Mostra tutte (${lessons.length})</button>` : '')
      : '<div class="empty-box"><p>Non hai lezioni in programma.</p><a class="btn" href="prenota.html">Prenota</a></div>';

    $('[data-requests]').innerHTML = requests.length ? requests.map((b) => row(b, true)).join('')
      : '<p class="muted">Nessuna richiesta. Per un servizio scegli un\'ora libera nel calendario della pagina Prenota.</p>';

    // corsi: le lezioni raggruppate per iscrizione al corso intero
    const groups = {};
    lessons.filter((b) => b.enrollmentId).forEach((b) => { (groups[b.enrollmentId] ||= []).push(b); });
    const courses = Object.values(groups);
    $('[data-courses]').innerHTML = courses.length ? courses.map((g) => `
      <div class="item"><div>
        <div class="item-title">${esc(g[0].title)}</div>
        <div class="item-meta">${g.length === 1 ? '1 lezione rimasta' : `${g.length} lezioni rimaste`} · prossima ${dayLabel(g[0].date).toLowerCase()} alle ${hour(g[0].start)}</div>
      </div></div>`).join('') : '<p class="muted">Non sei iscritto a un corso intero. Puoi farlo dal calendario, scegliendo “Tutto il corso”.</p>';

    $('[data-history]').innerHTML = history.length ? history.slice(0, 40).map((b) => row(b, false)).join('') : '<p class="muted">Ancora niente.</p>';
  }

  member.addEventListener('click', async (e) => {
    if (e.target.closest('[data-show-all]')) { showAll = true; load(); return; }
    const b = e.target.closest('[data-cancel]'); if (!b) return;
    if (!confirm('Vuoi annullare? Il posto tornerà libero per altri.')) return;
    try { await api('/api/me/cancel', { id: b.dataset.cancel }); toast('Annullata.'); load(); }
    catch (err) { toast(err.message); }
  });

  $('[data-logout]').addEventListener('click', async () => {
    await api('/api/client/logout', {}).catch(() => {});
    location.reload();
  });

  function show(c) {
    guest.hidden = true; member.hidden = false;
    $('[data-name]').textContent = c.nome;
    $('[data-contact]').textContent = `${c.nome} ${c.cognome} · ${c.email} · ${c.phone}`;
    load();
  }

  window.ZG.loadClient().then((c) => {
    if (c) return show(c);
    guest.hidden = false;
    window.ZG.authForm($('[data-auth-box]'), show);
  });
})();
