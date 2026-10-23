// Zero Gravity — script comune a tutte le pagine
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  /* --- utilità condivise (usate da spots.js e studio.js) --- */
  const ZG = window.ZG = {
    $, $$, reduce,
    async api(url, opts = {}) {
      if (window.ZGDemo?.active) return window.ZGDemo.request(url, opts.body); // versione di prova (vedi demo.js)
      const res = await fetch(url, {
        method: opts.body ? 'POST' : 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'same-origin',
      });
      let data = null;
      try { data = await res.json(); } catch { /* risposta vuota */ }
      if (!res.ok) throw Object.assign(new Error(data?.error || 'Qualcosa non ha funzionato. Riprova o scrivici su WhatsApp.'), { status: res.status });
      return data;
    },
    toast(msg) {
      const t = $('.toast'); if (!t) return;
      t.textContent = msg; t.classList.add('is-on');
      clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-on'), 3800);
    },
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    dayLabel(iso) {
      const d = new Date(iso + 'T12:00:00');
      const today = new Date(); today.setHours(12, 0, 0, 0);
      const diff = Math.round((d - today) / 864e5);
      const name = diff === 0 ? 'Oggi' : diff === 1 ? 'Domani' : days[d.getDay()];
      return `${name} ${d.getDate()} ${months[d.getMonth()]}`;
    },
  };

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* --- intestazione che si nasconde scendendo --- */
  const header = $('.site-header');
  let lastY = scrollY;
  addEventListener('scroll', () => {
    header?.classList.toggle('is-hidden', scrollY > 240 && scrollY > lastY);
    lastY = scrollY;
  }, { passive: true });

  /* --- entrate morbide --- */
  const els = $$('.reveal');
  if (reduce || !('IntersectionObserver' in window)) els.forEach((el) => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* --- installabile come app (vedi /sw.js) --- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
