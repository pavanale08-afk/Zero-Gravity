// Zero Gravity — riempie Home e Corsi con i corsi e le date che Anna inserisce nella sua area
(() => {
  'use strict';
  const { $, api, esc, euro, hour, shortDay, seatsText, reveal } = window.ZG;

  const empty = (text) => `<div class="empty-box"><p>${text}</p><p class="muted">Per informazioni scrivici su WhatsApp.</p></div>`;

  // una data come cartellino: giorno, ora, corso, posti
  const slotCard = (s) => {
    const d = shortDay(s.date);
    return `<a class="slot-card reveal${s.seatsLeft === 0 ? ' is-full' : ''}" href="prenota.html?corso=${encodeURIComponent(s.courseId)}&lezione=${encodeURIComponent(s.id)}">
      <span class="date-badge"><small>${d.wd}</small><b>${d.day}</b><small>${d.month}</small></span>
      <span class="slot-card-body">
        <span class="slot-card-time">${hour(s.time)}</span>
        <span class="slot-card-title">${esc(s.title)}</span>
        <span class="seats${s.seatsLeft <= 1 ? ' is-low' : ''}">${seatsText(s)}</span>
      </span>
    </a>`;
  };

  // home: le prossime 6 lezioni
  const next = $('[data-next-preview]');
  if (next) {
    api('/api/slots').then((slots) => {
      next.innerHTML = slots.length ? slots.slice(0, 6).map(slotCard).join('') : empty('Le date delle prossime lezioni saranno pubblicate a breve.');
      reveal(next);
    }).catch(() => { next.innerHTML = empty('Le lezioni non si sono caricate.'); });
  }

  // home e pagina Corsi: le schede dei corsi
  const list = $('[data-course-list]');
  if (list) {
    const limit = Number(list.dataset.limit) || Infinity;
    api('/api/courses').then((courses) => {
      if (!courses.length) { list.innerHTML = empty('I corsi saranno pubblicati a breve.'); return; }
      list.innerHTML = courses.slice(0, limit).map((c, i) => `
        <article class="course-card tone-${(i % 4) + 1} reveal" style="--d:${(i % 3) * 70}ms">
          <h3>${esc(c.name)}</h3>
          ${c.description ? `<p class="course-desc">${esc(c.description)}</p>` : ''}
          <p class="course-facts"><span>${c.duration} minuti</span><span>${c.capacity === 1 ? 'Individuale' : `Fino a ${c.capacity} persone`}</span><span>${euro(c.price)}</span></p>
          <div class="course-next">
            ${c.next.length
              ? `<p class="small muted">Prossime date</p><ul>${c.next.map((s) => `<li>${shortDay(s.date).wd} ${shortDay(s.date).day} ${shortDay(s.date).month} · ${hour(s.time)}${s.seatsLeft === 0 ? ' · completo' : ''}</li>`).join('')}</ul>`
              : '<p class="small muted">Nuove date in arrivo.</p>'}
          </div>
          <a class="btn btn--block" href="prenota.html?corso=${encodeURIComponent(c.id)}">${c.count ? 'Prenota questo corso' : 'Vedi il corso'}</a>
        </article>`).join('');
      reveal(list);
    }).catch(() => { list.innerHTML = empty('I corsi non si sono caricati.'); });
  }
})();
