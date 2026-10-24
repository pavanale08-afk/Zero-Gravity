// Zero Gravity — script comune a tutte le pagine
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  /* --- utilità condivise (usate da pages.js, prenota.js e studio.js) --- */
  const ZG = window.ZG = {
    $, $$, reduce,
    async api(url, body) {
      if (window.ZGDemo?.active) return window.ZGDemo.request(url, body); // versione di prova (vedi demo.js)
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
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
    euro: (n) => (Number.isInteger(n) ? n : Number(n).toFixed(2).replace('.', ',')) + ' €',
    hour: (t) => t.replace(':', '.'),
    // "Oggi", "Domani" o "Lunedì 26 ottobre"
    dayLabel(iso) {
      const d = new Date(iso + 'T12:00:00');
      const today = new Date(); today.setHours(12, 0, 0, 0);
      const diff = Math.round((d - today) / 864e5);
      if (diff === 0) return 'Oggi';
      if (diff === 1) return 'Domani';
      return `${cap(days[d.getDay()])} ${d.getDate()} ${months[d.getMonth()]}`;
    },
    shortDay(iso) {
      const d = new Date(iso + 'T12:00:00');
      return { wd: days[d.getDay()].slice(0, 3), day: d.getDate(), month: months[d.getMonth()].slice(0, 3) };
    },
    seatsText(s) {
      if (s.seatsLeft === 0) return 'Completo';
      return s.seatsLeft === 1 ? 'Ultimo posto' : `${s.seatsLeft} posti liberi`;
    },
  };

  /* --- account dei clienti: chi è entrato, e il modulo Accedi / Crea account --- */
  ZG.client = null;
  ZG.loadClient = async () => { try { ZG.client = await ZG.api('/api/client/me'); } catch { ZG.client = null; } return ZG.client; };

  // Mette nel contenitore il modulo di accesso; chiama onDone(cliente) quando è entrato.
  ZG.authForm = (box, onDone, intro = '') => {
    box.innerHTML = `
      ${intro ? `<p class="auth-intro">${intro}</p>` : ''}
      <div class="seg" role="tablist" aria-label="Accesso">
        <button type="button" role="tab" aria-selected="true" data-mode="login">Ho già un account</button>
        <button type="button" role="tab" aria-selected="false" data-mode="register">Sono nuovo</button>
      </div>
      <form class="form auth-form" novalidate data-auth-form>
        <div class="field full" data-reg hidden><label>Nome</label><input name="nome" type="text" autocomplete="given-name"></div>
        <div class="field full" data-reg hidden><label>Cognome</label><input name="cognome" type="text" autocomplete="family-name"></div>
        <div class="field full" data-reg hidden><label>Telefono</label><input name="phone" type="tel" autocomplete="tel" inputmode="tel"></div>
        <div class="field full"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
        <div class="field full"><label>Password</label><input name="password" type="password" autocomplete="current-password" required><span class="hint" data-reg hidden>Almeno 6 caratteri: ti servirà per rientrare.</span></div>
        <label class="check full" data-reg hidden><input type="checkbox" name="privacy"><span>Acconsento al trattamento dei miei dati per gestire le prenotazioni (<a class="link" href="privacy.html">informativa</a>).</span></label>
        <button class="btn btn--block btn--big full" type="submit" data-auth-submit>Entra</button>
        <p class="form-msg" role="alert"></p>
      </form>`;
    let mode = 'login';
    const form = $('[data-auth-form]', box);
    // ogni campo con la sua etichetta collegata
    $$('.field', form).forEach((f, i) => { const input = $('input', f); input.id = `auth-${i}-${Math.random().toString(36).slice(2, 6)}`; $('label', f).htmlFor = input.id; });
    $$('[data-mode]', box).forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      $$('[data-mode]', box).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('[data-reg]', box).forEach((el) => { el.hidden = mode !== 'register'; });
      form.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      $('[data-auth-submit]', box).textContent = mode === 'register' ? 'Crea il mio account' : 'Entra';
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('.form-msg', form);
      msg.className = 'form-msg'; msg.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      data.privacy = form.privacy.checked;
      try {
        ZG.client = await ZG.api(mode === 'register' ? '/api/client/register' : '/api/client/login', data);
        onDone(ZG.client);
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    });
  };

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* --- menu a tre linee su telefono --- */
  const burger = $('.burger'), menu = $('#menu');
  const setMenu = (open) => {
    // il menu parte da dove finisce la barra (che scende se c'è l'avviso della versione di prova)
    if (open) document.documentElement.style.setProperty('--menu-top', `${Math.round($('.topbar').getBoundingClientRect().bottom)}px`);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
    document.body.classList.toggle('menu-open', open);
  };
  burger?.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); burger.focus(); } });
  matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  /* --- intestazione con un filo d'ombra quando si scorre --- */
  const topbar = $('.topbar');
  const onScroll = () => topbar?.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* --- entrate morbide --- */
  ZG.reveal = (root = document) => {
    const els = $$('.reveal:not(.is-in)', root);
    if (reduce || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
  };
  ZG.reveal();

  /* --- installabile come app (vedi sw.js) --- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
