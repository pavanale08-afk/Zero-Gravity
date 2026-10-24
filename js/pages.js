// Zero Gravity — riempie Home e Corsi con i corsi, gli orari e i servizi inseriti da Anna
(() => {
  'use strict';
  const { $, api, esc, euro, hour, shortDay, dayLabel, reveal } = window.ZG;
  const WD_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const empty = (text) => `<div class="empty-box"><p>${text}</p><p class="muted">Per informazioni scrivici su WhatsApp.</p></div>`;
  const scheduleList = (c) => (c.schedule || []).map((r) =>
    `${r.repeat === 'weekly' ? `Ogni ${WD_LONG[r.weekday]}` : r.repeat === 'daily' ? 'Ogni giorno' : dayLabel(r.date)} · ${hour(r.start)}–${hour(r.end)}`);

  const lists = {
    next: $('[data-next-preview]'),
    courses: $('[data-course-list]'),
    services: $('[data-service-list]'),
  };
  if (!lists.next && !lists.courses && !lists.services) return;

  api('/api/catalog').then((cat) => {
    // home: le prossime lezioni di tutti i corsi
    if (lists.next) {
      const next = cat.courses.flatMap((c) => c.next).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)).slice(0, 6);
      lists.next.innerHTML = next.length ? next.map((s) => {
        const d = shortDay(s.date);
        return `<a class="slot-card reveal${s.seatsLeft === 0 ? ' is-full' : ''}" href="prenota.html?corso=${encodeURIComponent(s.courseId)}">
          <span class="date-badge"><small>${d.wd}</small><b>${d.day}</b><small>${d.month}</small></span>
          <span class="slot-card-body">
            <span class="slot-card-time">${hour(s.start)}–${hour(s.end)}</span>
            <span class="slot-card-title">${esc(s.title)}</span>
            <span class="seats${s.seatsLeft <= 1 ? ' is-low' : ''}">${s.seatsLeft === 0 ? 'Completo' : s.seatsLeft === 1 ? 'Ultimo posto' : `${s.seatsLeft} posti liberi`}</span>
          </span></a>`;
      }).join('') : empty('Le date delle prossime lezioni saranno pubblicate a breve.');
      reveal(lists.next);
    }

    // schede dei corsi con i loro orari
    if (lists.courses) {
      const limit = Number(lists.courses.dataset.limit) || Infinity;
      lists.courses.innerHTML = cat.courses.length ? cat.courses.slice(0, limit).map((c, i) => `
        <article class="course-card tone-${(i % 4) + 1} reveal" style="--d:${(i % 3) * 70}ms">
          <h3>${esc(c.name)}</h3>
          ${c.description ? `<p class="course-desc">${esc(c.description)}</p>` : ''}
          <p class="course-facts"><span>${c.capacity === 1 ? 'Individuale' : `Fino a ${c.capacity} persone`}</span><span>${euro(c.price)} a lezione</span></p>
          <div class="course-next">
            <p class="small muted">Quando</p>
            <ul>${scheduleList(c).map((t) => `<li>${esc(t)}</li>`).join('') || '<li>Date in arrivo</li>'}</ul>
          </div>
          <a class="btn btn--block" href="prenota.html?corso=${encodeURIComponent(c.id)}">${c.count ? 'Iscriviti' : 'Vedi il calendario'}</a>
        </article>`).join('') : empty('I corsi saranno pubblicati a breve.');
      reveal(lists.courses);
    }

    // servizi e terapie su richiesta
    if (lists.services) {
      lists.services.innerHTML = (cat.services.length ? cat.services.map((s) => `
        <article class="service-card reveal">
          <h3>${esc(s.name)}</h3>
          ${s.description ? `<p>${esc(s.description)}</p>` : ''}
          <p class="course-facts"><span>${s.duration} minuti</span><span>${euro(s.price)}</span></p>
        </article>`).join('') : '') + `
        <article class="service-card service-card--other reveal">
          <h3>Un'esigenza tua</h3>
          <p>Scegli un'ora libera nel calendario e descrivi di cosa hai bisogno: Anna ti propone come aiutarti.</p>
        </article>`;
      reveal(lists.services);
    }
  }).catch(() => {
    Object.values(lists).forEach((el) => { if (el) el.innerHTML = empty('Non siamo riusciti a caricare i dati.'); });
  });
})();
