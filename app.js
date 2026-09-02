/* OA Open — bootstrap: theme switcher + module check */
(function () {
'use strict';
function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
ready(function () {
  /* ---------- bridge: notify topbar when AI keys change (OAuth connect/disconnect/save) ---------- */
  if (window.OA_KEYS) {
    const _orig = window.OA_KEYS.saveKeys;
    window.OA_KEYS.saveKeys = function () {
      const r = _orig.apply(this, arguments);
      document.dispatchEvent(new CustomEvent('oa-keys-changed'));
      return r;
    };
  }

  /* ---------- theme switcher ---------- */
  const THEMES = ['paper', 'swiss', 'slate', 'terminal'];
  const root = document.documentElement;
  const btn = document.getElementById('themeButton');
  const pop = document.getElementById('themePop');
  function current() {
    let t = root.getAttribute('data-theme');
    if (THEMES.indexOf(t) < 0) { t = 'slate'; root.setAttribute('data-theme', t); }
    return t;
  }
  function markActive() {
    const cur = current();
    Array.from(pop.querySelectorAll('[data-theme-set]')).forEach(b => {
      b.setAttribute('aria-checked', b.dataset.themeSet === cur ? 'true' : 'false');
    });
  }
  function setTheme(t) {
    if (THEMES.indexOf(t) < 0) return;
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('oa-theme', t); } catch (e) {}
    markActive();
  }
  markActive();
  if (btn && pop) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      btn.setAttribute('aria-expanded', String(!pop.hidden));
    });
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-set]');
      if (b) { setTheme(b.dataset.themeSet); pop.hidden = true; }
    });
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !e.target.closest('.theme-menu')) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { pop.hidden = true; } });
  }

  /* ---------- module load check ---------- */
  const ok = window.OA_BANKS && window.OA_UI && window.OA_AI && window.OA_GAMES && window.OA_CODING;
  if (!ok) { console.error('OA Open: module load failure', { core: !!window.OA_UI, ai: !!window.OA_AI, games: !!window.OA_GAMES, coding: !!window.OA_CODING }); }
  let total = 0, answered = 0;
  Object.keys(window.OA_BANKS.banks).forEach(k => {
    total += window.OA_BANKS.banks[k].length;
    window.OA_BANKS.banks[k].forEach(x => { if (window.OA_UI.progress.answers[x.id]) answered++; });
  });
  const foot = document.getElementById('homeFooterStats');
  if (foot) foot.textContent = 'OA Open — ' + total.toLocaleString('en-US') + ' practice items' +
    (answered ? ' — ' + answered + ' attempted in this browser' : '') + ' — free for everyone, forever.';
  console.log('OA Open ready —', total, 'items loaded.');
});
})();