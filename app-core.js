/* OA Practice Desk - core: state, nav, breadcrumbs, MCQ engine, stats */
(function () {
'use strict';

const S = window.OA_BANKS;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= progress store ================= */
const PROG_KEY = 'oa-progress-v1';
let progress = { answers: {}, drafts: {}, scores: {}, done: [], bookmarks: [], notes: {}, evals: {} };
try {
  const p = JSON.parse(localStorage.getItem(PROG_KEY) || 'null');
  if (p) progress = { answers: p.answers || {}, drafts: p.drafts || {}, scores: p.scores || {}, done: p.done || [], bookmarks: p.bookmarks || [], notes: p.notes || {}, evals: p.evals || {} };
} catch (e) { /* fresh */ }
progress.done = new Set(progress.done || []);
progress.bookmarks = new Set(progress.bookmarks || []);
function saveProgress() {
  const copy = Object.assign({}, progress, { done: Array.from(progress.done), bookmarks: Array.from(progress.bookmarks) });
  try { localStorage.setItem(PROG_KEY, JSON.stringify(copy)); } catch (e) {}
  updateStatsBadge();
}
function recordAnswer(qid, selectedIdx, isCorrect) {
  progress.answers[qid] = { selected: selectedIdx, correct: !!isCorrect, at: Date.now() };
  if (isCorrect) progress.done.add(qid);
  saveProgress();
}
function updateStatsBadge() {
  const n = Object.keys(progress.answers).length;
  const el = $('#statsCount');
  if (el) el.textContent = n;
}

/* ================= catalog ================= */
function bankCount(key) { const b = S.banks[key]; return b ? b.length : 0; }
function bankDone(key) {
  const b = S.banks[key];
  if (!b) return 0;
  let n = 0;
  for (const q of b) { if (progress.answers[q.id] && progress.answers[q.id].correct) n++; }
  return n;
}
function bankAttempted(key) {
  const b = S.banks[key];
  if (!b) return 0;
  let n = 0;
  for (const q of b) { if (progress.answers[q.id]) n++; }
  return n;
}

const COMPANIES = {
  accenture: {
    name: 'Accenture',
    kind: 'accenture',
    routes: [
      { id: 'puzzles', title: 'OA Puzzles', meta: 'Three timed logic drills', count: '3 engines', bank: null },
      { id: 'mcq', title: 'MCQ Questions', meta: 'Practice by topic', count: bankCount('accenture/mcq') + ' questions', bank: 'accenture/mcq' },
      { id: 'coding', title: 'Coding Lab', meta: 'DSA, SQL, and frontend', count: bankCount('accenture/coding') + ' tasks', bank: 'accenture/coding' }
    ]
  },
  cognizant: {
    name: 'Cognizant', kind: 'generic',
    tracks: [
      { id: 'technical', number: '01', duration: '180 min', title: 'Technical assessment',
        summary: 'MCQ / prompting / DSA / Angular or React / RAG',
        sections: [
          { id: 'mcq', title: 'AI systems MCQ', desc: 'Cloud, GenAI, agents, search', bank: 'cognizant/technical/mcq', engine: 'mcq' },
          { id: 'prompt-engineering', title: 'Prompt engineering', desc: 'Write prompts, get AI feedback', bank: 'cognizant/technical/prompt-engineering', engine: 'ai-prompt' },
          { id: 'dsa', title: 'DSA coding', desc: 'Maps, stacks, heaps, DP, greedy', bank: 'cognizant/technical/dsa', engine: 'coding-fn' },
          { id: 'frontend', title: 'Angular or React', desc: 'Component implementation checks', bank: 'cognizant/technical/frontend', engine: 'code-check' },
          { id: 'rag', title: 'RAG coding', desc: 'Build a working RAG pipeline', bank: 'cognizant/technical/rag', engine: 'coding-fn' }
        ] },
      { id: 'communication-aptitude', number: '02', duration: '100 min', title: 'Communication + aptitude',
        summary: 'Pronunciation / fluency / grammar / listening / reasoning / data / numerical',
        sections: [
          { id: 'pronunciation', title: 'Pronunciation', desc: 'Speak clearly, get AI feedback', bank: 'cognizant/communication-aptitude/pronunciation', engine: 'ai-speech' },
          { id: 'speaking', title: 'Speaking fluency', desc: 'Timed structured responses', bank: 'cognizant/communication-aptitude/speaking', engine: 'ai-speech' },
          { id: 'reading-grammar', title: 'Reading + grammar', desc: 'Grammar and comprehension MCQs', bank: 'cognizant/communication-aptitude/reading-grammar', engine: 'mcq' },
          { id: 'listening', title: 'Listening', desc: 'Audio plays, then answer', bank: 'cognizant/communication-aptitude/listening', engine: 'listening' },
          { id: 'analytical', title: 'Analytical ability', desc: 'Arrangements, scheduling, directions', bank: 'cognizant/communication-aptitude/analytical', engine: 'mcq' },
          { id: 'critical-thinking', title: 'Critical thinking', desc: 'Assumptions, conclusions, arguments', bank: 'cognizant/communication-aptitude/critical-thinking', engine: 'mcq' },
          { id: 'data-analysis', title: 'Data analysis', desc: 'Charts, tables, interpretation', bank: 'cognizant/communication-aptitude/data-analysis', engine: 'mcq' },
          { id: 'numerical', title: 'Numerical ability', desc: 'Percentages, ratios, arithmetic', bank: 'cognizant/communication-aptitude/numerical', engine: 'mcq' }
        ] }
    ]
  },
  infosys: {
    name: 'Infosys', kind: 'generic',
    tracks: [
      { id: 'system-engineer', number: '01', duration: '100 min', title: 'System Engineer assessment',
        summary: 'Reasoning / math / verbal / pseudocode / puzzle / core CS - section-locked format',
        sections: [
          { id: 'reasoning', title: 'Reasoning ability', desc: 'Syllogisms, seating, blood relations', bank: 'infosys/system-engineer/reasoning', engine: 'mcq' },
          { id: 'mathematical', title: 'Mathematical ability', desc: 'TSD, work, P&C, number theory', bank: 'infosys/system-engineer/mathematical', engine: 'mcq' },
          { id: 'verbal', title: 'Verbal ability', desc: 'RC, sentence correction, grammar', bank: 'infosys/system-engineer/verbal', engine: 'mcq' },
          { id: 'pseudocode', title: 'Pseudocode', desc: 'Trace loops, recursion, bitwise', bank: 'infosys/system-engineer/pseudocode', engine: 'mcq' },
          { id: 'puzzle', title: 'Puzzle solving', desc: 'Lateral logic puzzles', bank: 'infosys/system-engineer/puzzle', engine: 'mcq' },
          { id: 'core-cs', title: 'Core CS', desc: 'OS, DBMS, networks, OOP', bank: 'infosys/system-engineer/core-cs', engine: 'mcq' }
        ] },
      { id: 'dse-sp', number: '02', duration: '180 min', title: 'DSE / Specialist Programmer',
        summary: 'Three-problem coding set: arrays / greedy / DP / graphs / trees',
        sections: [
          { id: 'problem-1', title: 'Problem 1', desc: 'Starter problem', bank: 'infosys/dse-sp/problem-1', engine: 'coding-stdin' },
          { id: 'problem-2', title: 'Problem 2', desc: 'Mid problem', bank: 'infosys/dse-sp/problem-2', engine: 'coding-stdin' },
          { id: 'problem-3', title: 'Problem 3', desc: 'Hard problem', bank: 'infosys/dse-sp/problem-3', engine: 'coding-stdin' }
        ] }
    ]
  },
  infineon: {
    name: 'Infineon', kind: 'generic',
    tracks: [
      { id: 'technical-assessment', number: '01', duration: '90-120 min', title: 'Technical assessment',
        summary: 'Embedded C / C and C++ / microcontrollers / digital electronics / aptitude',
        sections: [
          { id: 'mcq', title: 'Technical MCQs', desc: 'Embedded systems and core ECE', bank: 'infineon/technical-assessment/mcq', engine: 'mcq' }
        ] }
    ]
  },
  visa: {
    name: 'Visa', kind: 'generic',
    tracks: [
      { id: 'coding', number: '01', duration: 'self-paced', title: 'Visa coding bank',
        summary: '90 problems across 33 topic families - stdin/stdout format, Python runs locally',
        sections: [
          { id: 'easy', title: 'Easy bank', desc: '30 problems', bank: 'visa/coding/easy', engine: 'coding-stdin' },
          { id: 'medium', title: 'Medium bank', desc: '49 problems', bank: 'visa/coding/medium', engine: 'coding-stdin' },
          { id: 'hard', title: 'Hard bank', desc: '11 problems', bank: 'visa/coding/hard', engine: 'coding-stdin' }
        ] }
    ]
  }
};

/* ================= breadcrumb navigation ================= */
const nav = [];
function crumbs() {
  const bar = $('#crumbs');
  if (nav.length === 0) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = nav.map((c, i) => {
    const last = i === nav.length - 1;
    return (i ? '<span class="crumb-sep">/</span>' : '') +
      '<button type="button" class="' + (last ? 'crumb-here' : '') + '" data-crumb="' + i + '">' + esc(c.label) + '</button>';
  }).join('');
  $$('#crumbs [data-crumb]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.crumb;
    const target = nav[i];
    nav.length = i + 1;
    target.go();
  }));
}
function push(level) { nav.push(level); crumbs(); }
function resetNav(level) { nav.length = 0; if (level) nav.push(level); crumbs(); }

/* ================= view switching ================= */
const VIEWS = ['companyView', 'homeView', 'lobby', 'gameView', 'mcqView', 'codingView', 'companyHomeView', 'companyTrackView', 'companySectionView'];
function show(viewId) {
  VIEWS.forEach(v => { const n = $('#' + v); if (n) n.hidden = (v !== viewId); });
  window.scrollTo(0, 0);
}

let currentCompany = null;
let currentTrack = null;

function showCompanies() {
  currentCompany = null; currentTrack = null;
  resetNav();
  show('companyView');
}

function openCompany(compId) {
  const comp = COMPANIES[compId];
  if (!comp) return;
  currentCompany = compId;
  if (comp.kind === 'accenture') {
    resetNav({ label: comp.name, go: () => openCompany(compId) });
    push({ label: 'Practice', go: () => show('homeView') });
    show('homeView');
  } else {
    resetNav({ label: comp.name, go: () => openCompany(compId) });
    const secs = [];
    comp.tracks.forEach(t => t.sections.forEach(s => secs.push(s)));
    const totalQ = secs.reduce((a, s) => a + bankCount(s.bank), 0);
    const doneQ = secs.reduce((a, s) => a + bankDone(s.bank), 0);
    $('#companyHomeTag').textContent = comp.name;
    $('#companyHomeTitle').textContent = comp.tracks.length === 1 ? comp.tracks[0].title : comp.tracks.length + ' tracks. One desk.';
    $('#companyHomeSummary').textContent = secs.length + ' sections - ' + totalQ + ' items' + (doneQ ? ' - ' + doneQ + ' solved so far' : '') + '. All offline.';
    $('#companyRoundLedger').innerHTML = comp.tracks.map(t => {
      const tTotal = t.sections.reduce((a, s) => a + bankCount(s.bank), 0);
      const tDone = t.sections.reduce((a, s) => a + bankDone(s.bank), 0);
      return '<button type="button" class="cognizant-round-row" data-track="' + esc(t.id) + '">' +
        '<span class="round-row-number">' + esc(t.number) + '</span>' +
        '<span class="round-row-copy"><strong>' + esc(t.title) + '</strong><small>' + esc(t.summary) + '</small></span>' +
        '<span class="round-row-duration"><b>' + tDone + '/' + tTotal + '</b><span>solved</span></span>' +
        '<span class="round-row-action">&#8599;</span></button>';
    }).join('');
    show('companyHomeView');
  }
}

function openTrack(trackId) {
  const comp = COMPANIES[currentCompany];
  const track = comp.tracks.find(t => t.id === trackId);
  if (!track) return;
  currentTrack = trackId;
  if (nav.length < 2) push({ label: track.title, go: () => openTrack(trackId) });
  else { nav[1] = { label: track.title, go: () => openTrack(trackId) }; nav.length = 2; crumbs(); }
  const mount = $('#companyTrackMount');
  mount.innerHTML =
    '<div class="section-head"><h2>' + esc(track.title) + '</h2><p>' + esc(track.summary) + ' - ' + esc(track.duration) + '</p></div>' +
    '<div class="secnav">' + track.sections.map((s, i) => {
      const tot = bankCount(s.bank), dn = bankDone(s.bank);
      return '<button type="button" class="secnav-card" data-sec="' + i + '">' +
        (dn ? '<span class="secn-done">' + dn + '/' + tot + '</span>' : '') +
        '<span class="secn-name">' + esc(s.title) + '</span>' +
        '<span class="secn-meta">' + esc(s.desc) + ' - ' + tot + ' items</span>' +
        '</button>';
    }).join('') + '</div>';
  show('companyTrackView');
}

function openSection(trackId, secId) {
  const comp = COMPANIES[currentCompany];
  const track = comp.tracks.find(t => t.id === trackId);
  const sec = track && track.sections[secId];
  if (!sec) return;
  if (nav.length > 2) nav.length = 2;
  push({ label: sec.title, go: () => openSection(trackId, secId) });
  const questions = S.banks[sec.bank] || [];
  const mount = $('#companySectionMount');
  const done = bankDone(sec.bank);
  const isCoding = sec.engine !== 'mcq' && sec.engine !== 'listening' && sec.engine !== 'ai-prompt' && sec.engine !== 'ai-speech';
  
  if (isCoding) {
    mount.innerHTML =
      '<div class="coding-appbar">' +
      '<div class="coding-appbar-start">' +
      '<button class="coding-back" type="button" data-back-track><span>&#8592;</span> ' + esc(track.title) + '</button>' +
      '<div class="coding-app-title"><strong>Code Studio</strong><span class="coding-subtitle">' + esc(sec.title) + '</span></div>' +
      '</div>' +
      '<div class="judge-status-badge"><span class="judge-dot">●</span> ' + (sec.engine === 'code-check' ? 'Preview ready' : 'Judge ready') + '</div>' +
      '</div>' +
      '<div id="sectionEngine"></div>';
    const backBtn = mount.querySelector('[data-back-track]');
    if (backBtn) backBtn.addEventListener('click', () => openTrack(trackId));
  } else {
    mount.innerHTML =
      '<div class="section-head"><h2>' + esc(sec.title) + '</h2><p>' + questions.length + ' items' +
      (done ? ' - ' + done + ' solved' : '') + ' - ' + esc(track.title) + '</p></div>' +
      '<div id="sectionEngine"></div>';
  }
  show('companySectionView');
  const engine = $('#sectionEngine');
  if (sec.engine === 'mcq') MCQ.mount(engine, questions, sec.title);
  else if (sec.engine === 'listening') window.OA_AI.AI.mountListening(engine, questions, sec.title);
  else if (sec.engine === 'ai-prompt') window.OA_AI.AI.mountPrompt(engine, questions, sec.title);
  else if (sec.engine === 'ai-speech') window.OA_AI.AI.mountSpeech(engine, questions, sec.title);
  else window.OA_CODING.Coding.mount(engine, sec.engine, questions, sec.title);
}

/* ================= MCQ engine (with desktop question palette & action bar) ================= */
const MCQ = {
  state: { list: [], i: 0, topic: 'all', filter: 'all', search: '', showNotes: false },
  mount(root, questions, title) {
    const st = this.state;
    st.list = questions; st.i = 0; st.topic = 'all'; st.filter = 'all'; st.search = ''; st.difficulty = 'all';
    st.pick = null;
    st.showNotes = false;
    const topics = ['all'].concat(Array.from(new Set(questions.map(q => q.topic || q.subtopic || 'General'))).sort());
    const diffs = ['all', 'easy', 'medium', 'hard'].filter(d => d === 'all' || questions.some(q => (q.difficulty || '').toLowerCase() === d));
    
    root.innerHTML =
      '<div class="mcq-workbench">' +
      '<aside class="mcq-palette" id="mPalette">' +
      '  <div class="palette-head">' +
      '    <div class="palette-title-row">' +
      '      <h3>Questions</h3>' +
      '      <span class="palette-sub" id="mPaletteSub">0 attempted · 0 bookmarked</span>' +
      '    </div>' +
      '    <div class="palette-filters" role="tablist" aria-label="Question filters">' +
      '      <button type="button" class="palette-tab active" data-mcq-filter="all">All</button>' +
      '      <button type="button" class="palette-tab" data-mcq-filter="attempted">Attempted</button>' +
      '      <button type="button" class="palette-tab" data-mcq-filter="bookmarked">Bookmarked</button>' +
      '    </div>' +
      '    <div class="palette-search-row">' +
      '      <input class="palette-search" id="mSearch" type="search" placeholder="Search questions..." aria-label="Search questions">' +
      '    </div>' +
      (topics.length > 2 ? 
      '    <div class="palette-topic-row">' +
      '      <select id="mTopic" class="palette-select" aria-label="Filter by topic">' + topics.map(t => '<option value="' + esc(t) + '">' + (t === 'all' ? 'All topics (' + questions.length + ')' : esc(t)) + '</option>').join('') + '</select>' +
      '    </div>' : '') +
      '  </div>' +
      '  <div class="palette-grid-container">' +
      '    <div class="palette-grid" id="mNav" role="tablist" aria-label="Question selector"></div>' +
      '  </div>' +
      '  <div class="palette-legend">' +
      '    <div class="legend-item"><span class="legend-box not-attempted"></span><span>Not attempted</span></div>' +
      '    <div class="legend-item"><span class="legend-box attempted"></span><span>Attempted</span></div>' +
      '    <div class="legend-item"><span class="legend-box current"></span><span>Current</span></div>' +
      '    <div class="legend-item"><span class="legend-box bookmarked">🔖</span><span>Bookmarked</span></div>' +
      '  </div>' +
      '</aside>' +
      '<article class="mcq-question-sheet" id="mSheet" tabindex="-1"></article>' +
      '</div>';

    const self = this;
    let searchTimer = null;
    const sInput = $('#mSearch', root);
    if (sInput) {
      sInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { st.search = this.value.trim().toLowerCase(); st.i = 0; st.pick = null; self.render(); }, 180);
      });
    }
    const tSelect = $('#mTopic', root);
    if (tSelect) {
      tSelect.addEventListener('change', function () { st.topic = this.value; st.i = 0; st.pick = null; self.render(); });
    }
    $$('[data-mcq-filter]', root).forEach(b => b.addEventListener('click', () => {
      st.filter = b.dataset.mcqFilter; st.i = 0; st.pick = null;
      $$('[data-mcq-filter]', root).forEach(x => x.classList.toggle('active', x === b));
      self.render();
    }));

    // keyboard navigation
    root.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const list = self.visible();
        const d = e.key === 'ArrowRight' ? 1 : -1;
        st.i = Math.max(0, Math.min(list.length - 1, st.i + d));
        st.pick = null;
        self.render();
        e.preventDefault();
      }
    });
    this.render();
  },
  visible() {
    const st = this.state;
    let list = st.list;
    if (st.topic !== 'all') list = list.filter(q => (q.topic || q.subtopic || 'General') === st.topic);
    if (st.difficulty && st.difficulty !== 'all') list = list.filter(q => (q.difficulty || '').toLowerCase() === st.difficulty);
    if (st.filter === 'attempted' || st.filter === 'solved') list = list.filter(q => !!progress.answers[q.id]);
    else if (st.filter === 'bookmarked') list = list.filter(q => progress.bookmarks && progress.bookmarks.has(q.id));
    else if (st.filter === 'unsolved') list = list.filter(q => !progress.answers[q.id]);
    else if (st.filter === 'wrong') list = list.filter(q => progress.answers[q.id] && !progress.answers[q.id].correct);
    if (st.search) list = list.filter(q =>
      (q.prompt || '').toLowerCase().includes(st.search) ||
      (q.title || '').toLowerCase().includes(st.search) ||
      (q.topic || '').toLowerCase().includes(st.search) ||
      (q.subtopic || '').toLowerCase().includes(st.search) ||
      (q.options || []).some(o => String(o).toLowerCase().includes(st.search)));
    return list;
  },
  render() {
    const st = this.state, list = this.visible();
    const navEl = $('#mNav'), sheet = $('#mSheet');
    if (!navEl || !sheet) return;

    // update counts
    const attemptedTotal = st.list.filter(q => progress.answers[q.id]).length;
    const bookmarkedTotal = st.list.filter(q => progress.bookmarks && progress.bookmarks.has(q.id)).length;
    const subEl = $('#mPaletteSub');
    if (subEl) subEl.textContent = attemptedTotal + ' attempted · ' + bookmarkedTotal + ' bookmarked';

    if (!list.length) {
      navEl.innerHTML = '';
      sheet.innerHTML = '<div class="no-results"><strong>No questions found.</strong><p>Try switching the filter to "All" or clearing the search.</p></div>';
      return;
    }
    if (st.i >= list.length) st.i = 0;
    const q = list[st.i];
    const rec = progress.answers[q.id];
    const bookmarked = progress.bookmarks && progress.bookmarks.has(q.id);
    const userNote = (progress.notes && progress.notes[q.id]) || '';

    // Render Grid Buttons
    navEl.innerHTML = list.map((x, idx) => {
      const r = progress.answers[x.id];
      const isBm = progress.bookmarks && progress.bookmarks.has(x.id);
      let cls = 'q-palette-btn';
      if (r) cls += r.correct ? ' is-attempted' : ' is-wrong';
      if (idx === st.i) cls += ' is-current';
      if (isBm) cls += ' is-bookmarked';
      return '<button type="button" class="' + cls + '" data-jump="' + idx + '" title="' + esc((x.title || x.prompt || '').slice(0, 60)) + '" aria-label="Question ' + (idx + 1) + '">' + (idx + 1) + '</button>';
    }).join('');

    $$('#mNav .q-palette-btn').forEach(b => b.addEventListener('click', () => {
      st.i = +b.dataset.jump;
      st.pick = null;
      MCQ.render();
      sheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    const activeBtn = navEl.querySelector('.is-current');
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }

    // --- Question Card Header (Meta & Action Links) ---
    const picked = rec ? rec.selected : (st.pick != null ? st.pick : null);
    const opts = (q.options || []).map((o, i) => {
      let cls = 'answer-option';
      if (rec) {
        if (i === q.correct_index) cls += ' is-correct';
        if (rec.selected === i && i !== q.correct_index) cls += ' is-wrong';
      } else if (picked === i) cls += ' is-picked';
      return '<label class="' + cls + '">' +
        '<input type="radio" name="answer-' + esc(q.id) + '" value="' + i + '"' + (picked === i ? ' checked' : '') + (rec ? ' disabled' : '') + '>' +
        '<span class="oletter">' + String.fromCharCode(65 + i) + '</span>' +
        '<span class="otext">' + esc(o) + '</span></label>';
    }).join('');

    let status = '';
    if (rec && rec.correct) status = '<span class="answer-status ok">Correct. Option ' + String.fromCharCode(65 + q.correct_index) + ' is the answer.</span>';
    else if (rec && !rec.correct) status = '<span class="answer-status bad">Incorrect. Review the correct answer below.</span>';
    else if (picked == null) status = '<span class="answer-status">Choose one option.</span>';
    else status = '<span class="answer-status">Ready to check.</span>';

    let expl = '';
    if (rec) {
      const ansLetter = q.correct_index != null ? String.fromCharCode(65 + q.correct_index) : null;
      expl = '<div class="answer-explanation">' +
        '<strong>Answer: ' + (ansLetter != null ? ansLetter + '. ' + esc(q.options[q.correct_index]) : 'no key') + '</strong>' +
        '<p>' + esc(q.explanation || 'Explanation not captured for this question - verify against your own reasoning.') + '</p></div>';
    }

    sheet.innerHTML =
      '<article class="question-card" data-question="' + esc(q.id) + '">' +
      '<div class="q-card-head">' +
      '  <div class="q-tags">' +
      '    <span class="q-topic-tag">' + esc(q.topic || 'Pseudocode') + '</span>' +
      (q.subtopic ? '    <span class="q-subtopic-tag">' + esc(q.subtopic) + '</span>' : '') +
      (q.difficulty ? '    <span class="q-diff-tag">' + esc(q.difficulty) + '</span>' : '') +
      '  </div>' +
      '  <div class="q-actions-bar">' +
      '    <button type="button" class="q-action-link' + (bookmarked ? ' active' : '') + '" data-bookmark="' + esc(q.id) + '" aria-pressed="' + !!bookmarked + '">' +
      '      <span class="q-action-icon">' + (bookmarked ? '★' : '☆') + '</span> <span>' + (bookmarked ? 'Bookmarked' : 'Bookmark') + '</span>' +
      '    </button>' +
      '    <button type="button" class="q-action-link' + (userNote ? ' active' : '') + '" data-toggle-notes>' +
      '      <span class="q-action-icon">📝</span> <span>Notes' + (userNote ? ' (1)' : '') + '</span>' +
      '    </button>' +
      '    <button type="button" class="q-action-link danger" data-clear title="Clear and reset your answer">' +
      '      <span>Clear answer</span>' +
      '    </button>' +
      '  </div>' +
      '</div>' +
      '<div class="q-notes-box" id="qNotesBox"' + (st.showNotes ? '' : ' hidden') + '>' +
      '  <label><strong>Notes for this question:</strong>' +
      '    <textarea id="qNotesText" placeholder="Write quick scratchpad notes for this question...">' + esc(userNote) + '</textarea>' +
      '  </label>' +
      '</div>' +
      (q.title ? '<h2 class="question-title">' + esc(q.title) + '</h2>' : '') +
      '<div class="question-prompt-wrap">' +
      '  <p class="question-prompt">' + esc(q.prompt) + '</p>' +
      '</div>' +
      '<fieldset class="answer-set"><legend class="sr-only">Choose one answer</legend>' + opts + '</fieldset>' +
      '<div class="answer-actions">' +
      '  <button type="button" class="btn primary" data-check' + (rec || st.pick == null ? ' disabled' : '') + '>Check answer</button>' +
      (rec ? '  <button type="button" class="btn" data-retry>Retry</button>' : '') +
      status +
      '</div>' + expl +
      '<nav class="question-pagination" aria-label="Question navigation">' +
      '  <button type="button" data-nav="-1"' + (st.i === 0 ? ' disabled' : '') + '>Previous</button>' +
      '  <span>' + (st.i + 1) + ' / ' + list.length + ' available</span>' +
      '  <button type="button" data-nav="1"' + (st.i === list.length - 1 ? ' disabled' : '') + '>Next</button>' +
      '</nav></article>';

    // radio pick
    $$('input[type="radio"]', sheet).forEach(r => r.addEventListener('change', function () {
      if (rec) return;
      st.pick = +this.value;
      MCQ.render();
    }));

    // check answer
    const checkBtn = $('[data-check]', sheet);
    if (checkBtn) checkBtn.addEventListener('click', () => {
      if (rec || st.pick == null) return;
      const ok = q.correct_index != null && st.pick === q.correct_index;
      recordAnswer(q.id, st.pick, ok);
      st.pick = null;
      MCQ.render();
    });

    // retry
    const retryBtn = $('[data-retry]', sheet);
    if (retryBtn) retryBtn.addEventListener('click', () => {
      delete progress.answers[q.id];
      progress.done.delete(q.id);
      saveProgress();
      st.pick = null;
      MCQ.render();
    });

    // clear answer action link
    const clearBtn = $('[data-clear]', sheet);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (progress.answers[q.id] || st.pick != null) {
        delete progress.answers[q.id];
        progress.done.delete(q.id);
        saveProgress();
        st.pick = null;
        MCQ.render();
        toast('Answer cleared.');
      } else {
        toast('No answer to clear.');
      }
    });

    // toggle notes
    const notesBtn = $('[data-toggle-notes]', sheet);
    if (notesBtn) notesBtn.addEventListener('click', () => {
      st.showNotes = !st.showNotes;
      const box = $('#qNotesBox', sheet);
      if (box) {
        box.hidden = !st.showNotes;
        if (!box.hidden) {
          const ta = $('#qNotesText', box);
          if (ta) ta.focus();
        }
      }
    });

    // save notes
    const notesText = $('#qNotesText', sheet);
    if (notesText) {
      notesText.addEventListener('input', function () {
        if (!progress.notes) progress.notes = {};
        progress.notes[q.id] = this.value;
        saveProgress();
      });
    }

    // bookmark
    const bmBtn = $('[data-bookmark]', sheet);
    if (bmBtn) bmBtn.addEventListener('click', () => {
      if (!progress.bookmarks) progress.bookmarks = new Set();
      if (progress.bookmarks.has(q.id)) {
        progress.bookmarks.delete(q.id);
        toast('Bookmark removed.');
      } else {
        progress.bookmarks.add(q.id);
        toast('Question bookmarked.');
      }
      saveProgress();
      MCQ.render();
    });

    // prev/next
    $$('[data-nav]', sheet).forEach(b => b.addEventListener('click', () => {
      const d = +b.dataset.nav;
      st.i = Math.max(0, Math.min(list.length - 1, st.i + d));
      st.pick = null;
      MCQ.render();
      sheet.focus({ preventScroll: true });
    }));
  }
};

/* ================= stats dialog ================= */
function openStats() {
  const body = $('#statsBody');
  const lines = [];
  let totalDone = 0, totalCorrect = 0;
  Object.keys(S.banks).forEach(k => {
    const dn = bankDone(k), att = bankAttempted(k), tot = bankCount(k);
    totalDone += att; totalCorrect += dn;
    if (att) lines.push('<div class="stat-line"><span>' + esc(k) + '</span><span><b>' + dn + '</b> solved / ' + att + ' attempted / ' + tot + '</span></div>');
  });
  const scores = progress.scores || {};
  const scoreKeys = Object.keys(scores);
  const scoreLines = scoreKeys.length
    ? '<div class="stat-line"><span>Puzzle bests</span><span>' + scoreKeys.map(k => esc(k) + ': <b>' + scores[k] + '</b>').join(' &middot; ') + '</span></div>'
    : '';
  body.innerHTML =
    '<div class="stat-line"><span>Total attempted</span><b>' + totalDone + '</b></div>' +
    '<div class="stat-line"><span>Total solved correctly</span><b>' + totalCorrect + '</b></div>' +
    scoreLines +
    (lines.length ? '<div style="margin-top:10px;font-size:12px;color:var(--ink-dim)">By section:</div>' + lines.join('') : '<p class="status-line">No practice history yet - attempt some questions!</p>');
  $('#statsDialog').showModal();
}

/* ================= global click router ================= */
document.addEventListener('click', (e) => {
  const cr = e.target.closest('[data-company-route]');
  if (cr) { openCompany(cr.dataset.companyRoute); return; }
  if (e.target.closest('[data-company-switch]')) { showCompanies(); return; }
  if (e.target.closest('#brandButton')) { showCompanies(); return; }
  const tr = e.target.closest('[data-track]');
  if (tr) { openTrack(tr.dataset.track); return; }
  const sr = e.target.closest('[data-sec]');
  if (sr) { openSection(currentTrack, +sr.dataset.sec); return; }
  if (e.target.closest('[data-back-track]')) { openTrack(currentTrack); return; }
  if (e.target.closest('[data-back-home]')) {
    if (currentCompany === 'accenture') show('homeView'); else openCompany(currentCompany);
    return;
  }
  if (e.target.closest('#backButton')) { show('lobby'); return; }
  const os = e.target.closest('[data-open-section]');
  if (os) {
    const id = os.dataset.openSection;
    if (id === 'puzzles') show('lobby');
    else if (id === 'mcq') openAccentureMcq();
    else if (id === 'coding') window.OA_CODING.Coding.openAccenture();
    return;
  }
  const game = e.target.closest('[data-game]');
  if (game) { window.OA_GAMES.open(game.dataset.game); return; }
});

/* accenture MCQ view */
function openAccentureMcq() {
  const qs = S.banks['accenture/mcq'] || [];
  if (nav.length > 1) nav.length = 1;
  push({ label: 'MCQ', go: openAccentureMcq });
  $('#mcqTitle').textContent = 'Accenture MCQ';
  $('#mcqProgress').textContent = qs.length + ' available / answer keys included';
  MCQ.mount($('#mcqEngineRoot'), qs, 'Accenture MCQ');
  show('mcqView');
}

/* stats + dialogs wiring */
document.addEventListener('DOMContentLoaded', () => {
  const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };
  updateStatsBadge();
  on('#statsButton', 'click', openStats);
  on('#statsClose', 'click', () => { const d = document.querySelector('#statsDialog'); if (d) d.close(); });
  on('#statsClose2', 'click', () => { const d = document.querySelector('#statsDialog'); if (d) d.close(); });
  on('#statsReset', 'click', () => {
    if (!confirm('Erase all practice progress, drafts and scores in this browser?')) return;
    // mutate in place so the OA_UI.progress reference stays valid for other modules
    progress.answers = {}; progress.drafts = {}; progress.scores = {}; progress.notes = {}; progress.evals = {};
    progress.done = new Set(); progress.bookmarks = new Set();
    saveProgress();
    const d = document.querySelector('#statsDialog'); if (d) d.close();
    toast('Progress reset.');
    showCompanies();
  });

  /* ---- save / load progress to a file ---- */
  on('#statsSaveFile', 'click', () => {
    const data = Object.assign({}, progress, { done: Array.from(progress.done), bookmarks: Array.from(progress.bookmarks) });
    const blob = new Blob([JSON.stringify({ app: 'oa.bigdas.com', version: 1, exportedAt: new Date().toISOString(), progress: data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = 'oa-progress-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Progress saved to file.');
  });
  const loadInput = document.querySelector('#statsLoadFile');
  if (loadInput) loadInput.addEventListener('change', function () {
    const f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const j = JSON.parse(fr.result);
        const p = j.progress || j;
        if (!p || typeof p !== 'object' || (!p.answers && !p.scores)) throw new Error('not a progress file');
        // merge in place so the shared reference stays valid
        progress.answers = Object.assign({}, p.answers || {});
        progress.drafts = Object.assign({}, p.drafts || {});
        progress.scores = Object.assign({}, p.scores || {});
        progress.notes = Object.assign({}, p.notes || {});
        progress.evals = Object.assign({}, p.evals || {});
        progress.done = new Set(p.done || []);
        progress.bookmarks = new Set(p.bookmarks || []);
        saveProgress();
        toast('Progress restored - ' + Object.keys(progress.answers).length + ' attempts loaded.');
        openStats();
      } catch (e) {
        toast('Could not load: ' + e.message);
      }
    };
    fr.readAsText(f);
  });

  /* ---- topbar OpenRouter sign-in state ---- */
  const orTop = $('#orTopButton');
  function refreshOrTop() {
    const k = (window.OA_KEYS && window.OA_KEYS.keys) || {};
    const connected = !!(k.llm && k.llm.key && k.llm.provider === 'openrouter');
    if (!orTop) return;
    orTop.textContent = connected ? 'AI connected \u2713' : 'Sign in with OpenRouter';
    orTop.classList.toggle('connected', connected);
    orTop.title = connected ? 'AI feedback active - manage keys via AI keys' : 'One-click sign-in to enable AI feedback for prompts and speech';
  }
  refreshOrTop();
  if (orTop) orTop.addEventListener('click', () => {
    const k = (window.OA_KEYS && window.OA_KEYS.keys) || {};
    if (k.llm && k.llm.key && k.llm.provider === 'openrouter') { openSettings(); }
    else if (window.OA_AI && window.OA_AI.orStartLogin) { window.OA_AI.orStartLogin(); }
  });
  // refresh state after OAuth callback completes (delayed) and on dialog saves
  setTimeout(refreshOrTop, 1200);
  document.addEventListener('oa-keys-changed', refreshOrTop);
});

window.OA_UI = { toast, esc, show, showCompanies, openCompany, openTrack, openSection, progress, saveProgress, recordAnswer, MCQ, COMPANIES, $, $$, _nav: nav, _crumbs: crumbs };
})();