/* OA Practice Desk - AI-graded sections with bring-your-own API keys */
(function () {
'use strict';
const { toast, esc, $, $$ } = window.OA_UI;
const pGet = (k) => ((window.OA_UI.progress || {})[k]) || {};
const progressStore = () => window.OA_UI.progress;

/* ---------- key store ---------- */
const KEY_STORE = 'oa-ai-keys-v1';
let keys = { llm: { provider: 'openai', model: 'gpt-4o-mini', key: '', baseUrl: '' }, tts: { provider: 'browser', key: '', voice: 'alloy' }, stt: { provider: 'browser', key: '' } };
try {
  const k = JSON.parse(localStorage.getItem(KEY_STORE) || 'null');
  if (k) keys = Object.assign(keys, k);
} catch (e) {}
function saveKeys() { try { localStorage.setItem(KEY_STORE, JSON.stringify(keys)); } catch (e) {} }
window.OA_KEYS = { keys, saveKeys };

/* ---------- OpenRouter OAuth PKCE (no secret, no backend) ---------- */
const OR_PKCE_KEY = 'oa-or-pkce-verifier';
const OR_KEY_FLAG = 'oa-or-oauth'; // marks keys obtained via OAuth

function b64url(bytes) {
  return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function orStartLogin() {
  // OAuth requires a real http(s) origin - file:// pages can't receive the redirect back
  if (location.protocol === 'file:') {
    alert('OpenRouter sign-in needs the site to be served over http(s).\n\n' +
      'You are currently opening index.html directly from disk (file://).\n\n' +
      'To use AI sign-in, run a tiny local server and open the site through it:\n\n' +
      '  cd offline_site\n  npx serve .\n\nthen visit http://localhost:3000 and try again.\n' +
      '(Everything else in the app already works from file:// - only the sign-in redirect needs a server.)');
    return;
  }
  // 1. generate code_verifier (43-128 chars, unreserved chars)
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(raw);
  // 2. S256 code_challenge = base64url(sha256(verifier))
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(hash));
  sessionStorage.setItem(OR_PKCE_KEY, verifier);
  const callback = location.origin + location.pathname;
  const url = 'https://openrouter.ai/auth?callback_url=' + encodeURIComponent(callback) +
    '&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=S256';
  location.href = url;
}

async function orHandleCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return false;
  const verifier = sessionStorage.getItem(OR_PKCE_KEY);
  if (!verifier) { toast('Login expired - try again.'); return true; }
  sessionStorage.removeItem(OR_PKCE_KEY);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 150));
    const { key } = await r.json();
    if (!key) throw new Error('no key in response');
    keys.llm = { provider: 'openrouter', model: keys.llm.model || 'openai/gpt-4o-mini', key, baseUrl: '' };
    keys.tts = { provider: 'openrouter-tts', key, voice: keys.tts.voice || '' };
    keys.stt = { provider: 'openrouter-stt', key };
    saveKeys();
    history.replaceState(null, '', location.pathname);
    // make the success obvious: open settings + persist a status message (toast alone is easy to miss)
    sessionStorage.setItem('oa-or-just-connected', '1');
    toast('OpenRouter connected - all AI features unlocked.');
    window.OA_AI.openSettings && window.OA_AI.openSettings();
    return true;
  } catch (e) {
    toast('OpenRouter login failed: ' + e.message);
    history.replaceState(null, '', location.pathname);
    return true;
  }
}

function orDisconnect() {
  keys.llm.key = ''; keys.tts.key = ''; keys.stt.key = '';
  saveKeys();
  toast('Disconnected from OpenRouter.');
}

const PROVIDERS = {
  llm: {
    openai:    { url: (m) => 'https://api.openai.com/v1/chat/completions', auth: 'bearer', model: true },
    groq:      { url: () => 'https://api.groq.com/openai/v1/chat/completions', auth: 'bearer', model: true },
    openrouter:{ url: () => 'https://openrouter.ai/api/v1/chat/completions', auth: 'bearer', model: true },
    gemini:    { url: (m) => 'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=KEY', auth: 'query', model: true },
    sarvam:    { url: () => 'https://api.sarvam.ai/v1/chat/completions', auth: 'bearer', model: true },
    anthropic: { url: () => 'https://api.anthropic.com/v1/messages', auth: 'x-api-key', model: true },
    custom:    { url: (m, base) => (base || 'https://api.example.com/v1') + '/chat/completions', auth: 'bearer', model: true }
  },
  tts: {
    openai:  { url: () => 'https://api.openai.com/v1/audio/speech', auth: 'bearer' },
    sarvam:  { url: () => 'https://api.sarvam.ai/v1/text-to-speech', auth: 'bearer' },
    'openrouter-tts': { url: () => 'https://openrouter.ai/api/v1/audio/speech', auth: 'bearer' },
    custom:  { url: (m, base) => (base || '') + '/audio/speech', auth: 'bearer' }
  },
  stt: {
    openai:  { url: () => 'https://api.openai.com/v1/audio/transcriptions', auth: 'bearer' },
    sarvam:  { url: () => 'https://api.sarvam.ai/v1/speech-to-text', auth: 'bearer' },
    'openrouter-stt': { url: () => 'https://openrouter.ai/api/v1/audio/transcriptions', auth: 'bearer' },
    custom:  { url: (m, base) => (base || '') + '/audio/transcriptions', auth: 'bearer' }
  }
};

async function llmChat(system, user) {
  const cfg = keys.llm;
  if (!cfg.key) throw new Error('No LLM key set - open "AI keys" (top right) and add one, or use self-grade mode.');
  const p = PROVIDERS.llm[cfg.provider] || PROVIDERS.llm.custom;
  let url = p.url(cfg.model, cfg.baseUrl).replace('KEY', encodeURIComponent(cfg.key));
  const headers = { 'Content-Type': 'application/json' };
  if (p.auth === 'bearer') headers['Authorization'] = 'Bearer ' + cfg.key;
  if (p.auth === 'x-api-key') { headers['x-api-key'] = cfg.key; headers['anthropic-version'] = '2023-06-01'; }
  let body;
  if (cfg.provider === 'gemini') {
    body = JSON.stringify({ contents: [{ parts: [{ text: user }] }], systemInstruction: { parts: [{ text: system }] } });
  } else if (cfg.provider === 'anthropic') {
    body = JSON.stringify({ model: cfg.model, max_tokens: 1024, system: system, messages: [{ role: 'user', content: user }] });
  } else {
    body = JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2 });
  }
  const r = await fetch(url, { method: 'POST', headers, body });
  if (!r.ok) throw new Error('LLM HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  if (cfg.provider === 'gemini') return (j.candidates && j.candidates[0].content.parts[0].text) || '(empty)';
  if (cfg.provider === 'anthropic') return (j.content && j.content[0].text) || '(empty)';
  return (j.choices && j.choices[0].message.content) || '(empty)';
}

async function ttsSpeak(text, onPlay) {
  const cfg = keys.tts;
  if (cfg.provider === 'browser' || !cfg.key) {
    try { const u = new SpeechSynthesisUtterance(text); speechSynthesis.speak(u); return 'browser'; }
    catch (e) { throw new Error('Browser speech synthesis unavailable'); }
  }
  const p = PROVIDERS.tts[cfg.provider] || PROVIDERS.tts.custom;
  const url = p.url(cfg.voice, cfg.baseUrl);
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key };
  let body;
  if (cfg.provider === 'sarvam') {
    body = JSON.stringify({ inputs: [text], target_language_code: 'en-IN', speaker: cfg.voice || 'meera' });
  } else if (cfg.provider === 'openrouter-tts') {
    body = JSON.stringify({ model: cfg.model || 'mistralai/voxtral-mini-tts-2603', input: text, voice: cfg.voice || 'en_paul_neutral', response_format: 'mp3' });
  } else {
    body = JSON.stringify({ model: 'tts-1', voice: cfg.voice || 'alloy', input: text, response_format: 'mp3' });
  }
  const r = await fetch(url, { method: 'POST', headers, body });
  if (!r.ok) throw new Error('TTS HTTP ' + r.status);
  const blob = await r.blob();
  const uObj = URL.createObjectURL(blob);
  onPlay && onPlay(uObj);
  return 'api';
}

async function sttTranscribe(blob) {
  const cfg = keys.stt;
  if (cfg.provider === 'browser' || !cfg.key) {
    throw new Error('Browser mode cannot transcribe - pick a provider in AI keys, or self-grade.');
  }
  // OpenRouter STT accepts JSON base64 (avoids multipart quirks cross-origin)
  if (cfg.provider === 'openrouter-stt') {
    const b64 = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    const r = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({ model: cfg.model || 'openai/whisper-large-v3', input_audio: { data: b64, format: 'webm' }, language: 'en' })
    });
    if (!r.ok) throw new Error('STT HTTP ' + r.status + ': ' + (await r.text()).slice(0, 120));
    const j = await r.json();
    return j.text || '';
  }
  const p = PROVIDERS.stt[cfg.provider] || PROVIDERS.stt.custom;
  const url = p.url(cfg.voice, cfg.baseUrl);
  const fd = new FormData();
  fd.append('file', blob, 'recording.webm');
  fd.append('model', cfg.provider === 'sarvam' ? 'saarika:v2' : 'whisper-1');
  const r = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + cfg.key }, body: fd });
  if (!r.ok) throw new Error('STT HTTP ' + r.status);
  const j = await r.json();
  return j.text || j.transcript || '';
}

/* ---------- media recorder ---------- */
let mediaRec = null, chunks = [];
function startRecording(onDone) {
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    chunks = [];
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = e => chunks.push(e.data);
    mediaRec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      onDone(new Blob(chunks, { type: mediaRec.mimeType }));
    };
    mediaRec.start();
    return mediaRec;
  });
}

/* ---------- AI engine mount points ---------- */
const AI = {
  speechState: { rec: null, timer: null },

  mountListening(root, questions, title) {
    const self = this;
    const st = this._lst = this._lst || {};
    st.picks = st.picks || {};
    root.innerHTML = '<p class="status-line">Play each clip once (as in the real assessment), then check your answer. All 30 original audio clips are bundled offline.</p>' +
      questions.map((q, i) => {
        const rec = pGet('answers')[q.id];
        const picked = rec ? rec.selected : st.picks[q.id];
        const opts = (q.options || []).map((o, oi) => {
          let cls = 'answer-option';
          if (rec) {
            if (oi === q.correct_index) cls += ' is-correct';
            if (rec.selected === oi && oi !== q.correct_index) cls += ' is-wrong';
          } else if (picked === oi) cls += ' is-picked';
          return '<label class="' + cls + '">' +
            '<input type="radio" name="ls-' + esc(q.id) + '" value="' + oi + '"' + (picked === oi ? ' checked' : '') + (rec ? ' disabled' : '') + '>' +
            '<span class="oletter">' + String.fromCharCode(65 + oi) + '</span><strong>' + esc(o) + '</strong></label>';
        }).join('');
        let status = '';
        if (rec && rec.correct) status = '<span class="answer-status ok">Correct.</span>';
        else if (rec) status = '<span class="answer-status bad">Incorrect. Review the checked answer.</span>';
        else if (picked == null) status = '<span class="answer-status">Listen, then choose.</span>';
        else status = '<span class="answer-status">Ready to check.</span>';
        return '<div class="ai-task" data-lq="' + i + '">' +
          '<div class="question-heading-row"><div class="question-meta"><span>' + esc(q.topic) + '</span><span>' + esc(q.difficulty || '') + '</span><span>' + (i + 1) + '/' + questions.length + '</span></div></div>' +
          '<h3 class="question-title">' + esc(q.title) + '</h3>' +
          '<div class="recorder"><audio controls preload="none" src="audio/' + esc(q.id) + '.mp3" style="max-width:340px"></audio></div>' +
          '<p class="question-prompt" style="font-size:13.5px;margin:12px 0 14px">' + esc(q.prompt) + '</p>' +
          '<fieldset class="answer-set"><legend class="sr-only">Choose one answer</legend>' + opts + '</fieldset>' +
          '<div class="answer-actions">' +
          '<button type="button" class="btn primary" data-check="' + i + '"' + (rec || picked == null ? ' disabled' : '') + '>Check answer</button>' + status + '</div>' +
          (rec ? '<div class="answer-explanation"><strong>Answer: ' + String.fromCharCode(65 + q.correct_index) + '. ' + esc(q.options[q.correct_index]) + '</strong><p>' + esc(q.explanation || '') + '</p></div>' : '') +
          '</div>';
      }).join('');

    $$('input[type="radio"]', root).forEach(r => r.addEventListener('change', function () {
      const wrap = this.closest('[data-lq]');
      const qi = +wrap.dataset.lq;
      st.picks[questions[qi].id] = +this.value;
      self.mountListening(root, questions, title);
    }));
    $$('[data-check]', root).forEach(b => b.addEventListener('click', () => {
      const qi = +b.dataset.check;
      const q = questions[qi];
      const pick = st.picks[q.id];
      if (pick == null || pGet('answers')[q.id]) return;
      const ok = q.correct_index === pick;
      window.OA_UI.recordAnswer(q.id, pick, ok);
      delete st.picks[q.id];
      toast(ok ? 'Correct!' : 'Answer: ' + String.fromCharCode(65 + q.correct_index));
      AI.mountListening(root, questions, title);
    }));
  },

  mountPrompt(root, questions, title) {
    // mirrors the original's prompt-evaluator section: one task per screen,
    // task list in the rail, char counter, evaluate button, feedback panel
    const st = this._pr = this._pr || { i: 0 };
    st.i = Math.min(st.i, questions.length - 1);
    const pGetD = pGet('drafts');
    const list = questions;
    const i = st.i, q = list[i];
    const draft = String(pGetD[q.id] || '');
    const rec = pGet('answers')[q.id];
    const prevEvals = pGet('evals') || {};
    const evaluation = prevEvals[q.id];

    root.innerHTML =
      '<div class="mcq-workbench">' +
      '<div class="mcq-top-nav">' +
      '<div class="mcq-strip-toolbar">' +
      '<span>Task set: <strong>' + esc(title) + '</strong></span>' +
      '<span class="mcq-nav-summary">' + (i + 1) + ' / ' + list.length + ' (' + Object.keys(pGet('answers')).filter(id => list.some(x => x.id === id)).length + ' evaluated)</span>' +
      '</div>' +
      '<div class="mcq-question-strip-container">' +
      '<div class="mcq-question-strip" id="pTaskList" role="tablist">' + list.map((x, k) => {
        const done = !!pGet('answers')[x.id];
        return '<button type="button" class="q-strip-btn' + (k === i ? ' is-current' : '') + (done ? ' is-attempted' : '') + '" data-pjump="' + k + '" title="' + esc(x.title) + '">' +
          (k + 1) + '</button>';
      }).join('') + '</div>' +
      '</div>' +
      '</div>' +
      '<article class="mcq-question-sheet" tabindex="-1">' +
      '<article class="question-card" data-question="' + esc(q.id) + '">' +
      '<div class="question-heading-row"><div class="question-meta"><span>' + esc(q.topic) + '</span><span>' + esc(q.difficulty || '') + '</span><span>' + (i + 1) + '/' + list.length + '</span></div></div>' +
      '<h2 class="question-title">' + esc(q.title) + '</h2>' +
      '<p class="question-prompt" style="font-size:13.5px">' + esc(q.prompt) + '</p>' +
      (q.acceptance ? '<section class="task-rubric"><h4>Rubric</h4><ul>' + q.acceptance.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></section>' : '') +
      (q.guidance ? '<details class="task-hint"><summary>Guidance</summary><p>' + esc(q.guidance) + '</p></details>' : '') +
      '<section class="prompt-evaluator">' +
      '<header class="prompt-evaluator-heading"><div><h3>Write your prompt</h3><p>Score, pros, cons, and a stronger version.</p></div><dl><dt>Scorer</dt><dd>' + esc(keys.llm.provider) + '</dd></dl></header>' +
      '<label class="prompt-submission"><span>Your answer</span>' +
      '<textarea rows="10" spellcheck="true" data-pi="' + i + '" placeholder="Write the complete prompt you would give the model.">' + esc(draft) + '</textarea></label>' +
      '<div class="prompt-evaluator-actions">' +
      '<div><span data-prompt-count>' + draft.length.toLocaleString('en-US') + '</span><p data-prompt-status aria-live="polite">' + (evaluation ? 'Evaluated.' : (draft ? 'Draft saved.' : 'Awaiting your prompt.')) + '</p></div>' +
      '<button type="button" class="btn primary" data-eval="' + i + '">Evaluate prompt</button>' +
      '</div>' +
      (evaluation ? '<section class="prompt-feedback" data-ai-review><header class="prompt-feedback-summary"><strong>Evaluator feedback</strong></header><div class="grading-result">' + esc(evaluation) + '</div></section>' : '') +
      '</section>' +
      '<nav class="question-pagination"><button type="button" data-pnav="-1"' + (i === 0 ? ' disabled' : '') + '>Previous</button><span>' + (i + 1) + ' / ' + list.length + ' tasks</span><button type="button" data-pnav="1"' + (i === list.length - 1 ? ' disabled' : '') + '>Next</button></nav>' +
      '</article></article></div>';

    const self = this;
    const activeBtnP = root.querySelector('#pTaskList .is-current');
    if (activeBtnP) activeBtnP.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    const ta = root.querySelector('[data-pi]');
    const counter = root.querySelector('[data-prompt-count]');
    ta.addEventListener('input', () => {
      pGetD[q.id] = ta.value;
      counter.textContent = ta.value.length.toLocaleString('en-US');
    });
    ta.addEventListener('change', () => { window.OA_UI.saveProgress(); });

    root.querySelectorAll('[data-pnav]').forEach(b => b.addEventListener('click', () => {
      st.i = Math.max(0, Math.min(list.length - 1, st.i + (+b.dataset.pnav)));
      self.mountPrompt(root, questions, title);
    }));
    root.querySelectorAll('[data-pjump]').forEach(b => b.addEventListener('click', () => {
      st.i = +b.dataset.pjump;
      self.mountPrompt(root, questions, title);
    }));

    root.querySelector('[data-eval]').addEventListener('click', async () => {
      const btn = root.querySelector('[data-eval]');
      const stat = root.querySelector('[data-prompt-status]');
      btn.disabled = true;
      stat.textContent = 'Evaluating with ' + keys.llm.provider + ' / ' + (keys.llm.model || 'default') + '...';
      const draftV = ta.value;
      pGetD[q.id] = draftV; window.OA_UI.saveProgress();
      try {
        const sys = 'You are a strict technical interviewer grading a prompt-engineering task. Grade 0-10 against the rubric. Rubric: ' + (q.acceptance || []).join(' | ') + '. Reply with: VERDICT: PASS or NEEDS_WORK, SCORE: n/10, then 3-6 bullet lines of specific feedback, then one line "For a stronger attempt: ..."';
        const fb = await llmChat(sys, 'Task: ' + q.prompt + '\n\nCandidate prompt:\n' + draftV);
        prevEvals[q.id] = fb;
        progressStore().evals = prevEvals;
        window.OA_UI.saveProgress();
        window.OA_UI.recordAnswer(q.id, 0, /PASS/i.test(fb));
        self.mountPrompt(root, questions, title);
        toast('Evaluation complete.');
      } catch (e) {
        stat.textContent = 'AI eval failed: ' + e.message;
        stat.classList.add('is-error');
        btn.disabled = false;
      }
    });
  },

  mountSpeech(root, questions, title) {
    // mirrors the original's cognizant-speech-practice: one task per screen,
    // mic stage with record state + countdown, playback, transcript, feedback
    const self = this;
    const st = this._sp = this._sp || { i: 0 };
    st.i = Math.min(st.i, questions.length - 1);
    const list = questions;
    const i = st.i, q = list[i];
    const limit = q.responseSeconds || 60;
    const evals = pGet('evals') || {};
    const evaluation = evals[q.id];
    const done = !!pGet('answers')[q.id];

    root.innerHTML =
      '<div class="mcq-workbench">' +
      '<div class="mcq-top-nav">' +
      '<div class="mcq-strip-toolbar">' +
      '<span>Task set: <strong>' + esc(title) + '</strong></span>' +
      '<span class="mcq-nav-summary">' + (i + 1) + ' / ' + list.length + ' (' + Object.keys(pGet('answers')).filter(id => list.some(x => x.id === id)).length + ' done)</span>' +
      '</div>' +
      '<div class="mcq-question-strip-container">' +
      '<div class="mcq-question-strip" id="sTaskList" role="tablist">' + list.map((x, k) => {
        const d = !!pGet('answers')[x.id];
        return '<button type="button" class="q-strip-btn' + (k === i ? ' is-current' : '') + (d ? ' is-attempted' : '') + '" data-sjump="' + k + '" title="' + esc(x.title) + '">' +
          (k + 1) + '</button>';
      }).join('') + '</div>' +
      '</div>' +
      '</div>' +
      '<article class="mcq-question-sheet" tabindex="-1">' +
      '<article class="question-card" data-question="' + esc(q.id) + '">' +
      '<div class="question-heading-row"><div class="question-meta"><span>' + esc(q.topic) + '</span><span>' + esc(q.difficulty || '') + '</span><span>' + (i + 1) + '/' + list.length + '</span></div></div>' +
      '<h2 class="question-title">' + esc(q.title) + '</h2>' +
      '<p class="question-prompt" style="font-size:13.5px">' + esc(q.prompt) + '</p>' +
      (q.acceptance ? '<section class="task-rubric"><h4>Rubric</h4><ul>' + q.acceptance.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></section>' : '') +
      (q.guidance ? '<details class="task-hint"><summary>Coaching hint</summary><p>' + esc(q.guidance) + '</p></details>' : '') +
      '<section class="speech-practice" data-speech-practice="' + i + '" data-record-limit="' + limit + '">' +
      '<div class="speech-practice-stage">' +
      '<button class="speech-mic-button" type="button" data-start-speech aria-label="Record response">' +
      '<span class="speech-mic-mark" aria-hidden="true"></span></button>' +
      '<div class="speech-practice-readout"><strong data-speech-action-label>Record response</strong><time data-speech-timer>' + limit + 's max</time></div>' +
      '</div>' +
      '<p class="speech-practice-status" data-speech-status aria-live="polite">' + (evaluation ? 'Evaluated.' : 'Mic is optional - self-grade with the rubric anytime.') + '</p>' +
      '<audio class="speech-practice-playback" data-speech-playback controls hidden></audio>' +
      '<div class="speech-transcript" data-speech-result aria-live="polite">' +
      (evaluation ? '<div class="grading-result">' + esc(evaluation) + '</div>' : '') +
      '</div>' +
      '<div class="answer-actions" style="margin-top:14px">' +
      '<button type="button" class="btn" data-selfgrade>Self-grade: mark done</button>' +
      (evaluation ? '' : '<button type="button" class="btn primary" data-ai-regrade disabled>Get AI feedback</button>') +
      '</div>' +
      '</section>' +
      '<nav class="question-pagination"><button type="button" data-snav="-1"' + (i === 0 ? ' disabled' : '') + '>Previous</button><span>' + (i + 1) + ' / ' + list.length + ' tasks</span><button type="button" data-snav="1"' + (i === list.length - 1 ? ' disabled' : '') + '>Next</button></nav>' +
      '</article></article></div>';

    const activeBtnS = root.querySelector('#sTaskList .is-current');
    if (activeBtnS) activeBtnS.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });

    const statusEl = root.querySelector('[data-speech-status]');
    const micBtn = root.querySelector('[data-start-speech]');
    const playEl = root.querySelector('[data-speech-playback]');
    const timerEl = root.querySelector('[data-speech-timer]');
    const labelEl = root.querySelector('[data-speech-action-label]');
    const resultEl = root.querySelector('[data-speech-result]');
    let countdown = null;

    function stopTimer() { clearInterval(countdown); countdown = null; timerEl.textContent = limit + 's max'; labelEl.textContent = 'Record response'; }

    micBtn.addEventListener('click', async () => {
      if (mediaRec && mediaRec.state === 'recording') { mediaRec.stop(); stopTimer(); return; }
      let sec = limit;
      labelEl.textContent = 'Stop recording';
      timerEl.textContent = sec + 's';
      countdown = setInterval(() => {
        sec--;
        timerEl.textContent = sec + 's';
        if (sec <= 0) { if (mediaRec && mediaRec.state === 'recording') mediaRec.stop(); stopTimer(); }
      }, 1000);
      try {
        statusEl.textContent = 'Recording...';
        startRecording(blob => {
          stopTimer();
          statusEl.textContent = 'Recorded (' + Math.round(blob.size / 1024) + ' KB). Playback below.';
          const u = URL.createObjectURL(blob);
          playEl.src = u; playEl.hidden = false;
          (async () => {
            try {
              const text = await sttTranscribe(blob);
              statusEl.textContent = 'Transcribed - grading...';
              await self.gradeSpeech(questions, i, text, resultEl, statusEl);
            } catch (e) {
              statusEl.textContent = 'Transcription unavailable (' + e.message.slice(0, 60) + '). Type what you said for AI feedback, or self-grade.';
              resultEl.innerHTML = '<label class="prompt-submission" style="margin:8px 0"><span>Your words (type what you said)</span>' +
                '<textarea rows="4" data-selftext placeholder="Type your spoken response..."></textarea></label>' +
                '<button type="button" class="btn primary" data-selfai>Get AI feedback</button>';
              resultEl.querySelector('[data-selfai]').addEventListener('click', async () => {
                await self.gradeSpeech(questions, i, resultEl.querySelector('[data-selftext]').value, resultEl, statusEl);
              });
            }
          })();
        });
      } catch (e) { stopTimer(); statusEl.textContent = 'Mic error: ' + e.message; }
    });

    const sg = root.querySelector('[data-selfgrade]');
    if (sg) sg.addEventListener('click', () => {
      window.OA_UI.recordAnswer(q.id, 0, true);
      toast('Marked as self-graded.');
      self.mountSpeech(root, questions, title);
    });

    root.querySelectorAll('[data-snav]').forEach(b => b.addEventListener('click', () => {
      st.i = Math.max(0, Math.min(list.length - 1, st.i + (+b.dataset.snav)));
      self.mountSpeech(root, questions, title);
    }));
    root.querySelectorAll('[data-sjump]').forEach(b => b.addEventListener('click', () => {
      st.i = +b.dataset.sjump;
      self.mountSpeech(root, questions, title);
    }));
  },

  async gradeSpeech(questions, i, said, resultEl, statusEl) {
    const q = questions[i];
    statusEl.textContent = 'Getting AI feedback with ' + keys.llm.provider + '...';
    try {
      const sys = 'You are a communication coach grading ' + (q.kind === 'brief' && /pronunciation/i.test(q.title || '') ? 'pronunciation clarity' : 'spoken response quality') + '. Rubric: ' + (q.acceptance || []).join(' | ') + '. Reply: VERDICT: PASS or NEEDS_WORK, SCORE: n/10, then bullet feedback on structure, clarity and rubric fit.';
      const fb = await llmChat(sys, 'Task: ' + q.prompt + '\n\nTranscript of the candidate:\n' + said);
      resultEl.innerHTML = '<div class="grading-result">' + esc(fb) + '</div>';
      statusEl.textContent = 'Evaluated.';
      pGet('evals')[q.id] = fb;
      window.OA_UI.recordAnswer(q.id, 0, /PASS/i.test(fb));
      window.OA_UI.saveProgress();
    } catch (e) {
      statusEl.textContent = 'AI failed: ' + e.message;
      resultEl.innerHTML = '<div class="grading-result">Self-grade mode: check each rubric point honestly.</div>';
    }
  }
};

/* ---------- settings dialog ---------- */
function refreshOAuthBox() {
  const connected = !!(keys.llm.key && keys.llm.provider === 'openrouter');
  const box = document.getElementById('orOAuthBox');
  if (!box) return;
  box.classList.toggle('or-connected', connected);
  const loginBtn = document.getElementById('orLoginButton');
  const logoutBtn = document.getElementById('orLogoutButton');
  if (loginBtn) {
    loginBtn.textContent = connected ? 'Connected via OpenRouter \u2713' : 'Sign in with OpenRouter';
    loginBtn.disabled = connected;
  }
  if (logoutBtn) logoutBtn.hidden = !connected;
  const copy = box.querySelector('.or-oauth-copy span');
  if (copy && connected) copy.textContent = 'Connected. Your OAuth key covers LLM grading, text-to-speech and speech transcription. Disconnect anytime.';
}
function openSettings() {
  const d = $('#settingsDialog');
  $('#llmProvider').value = keys.llm.provider;
  $('#llmModel').value = keys.llm.model || '';
  $('#llmKey').value = keys.llm.key || '';
  $('#llmBaseUrl').value = keys.llm.baseUrl || '';
  $('#ttsProvider').value = keys.tts.provider;
  $('#ttsModel').value = keys.tts.model || '';
  $('#ttsKey').value = keys.tts.key || '';
  $('#ttsVoice').value = keys.tts.voice || '';
  $('#sttProvider').value = keys.stt.provider;
  $('#sttModel').value = keys.stt.model || '';
  $('#sttKey').value = keys.stt.key || '';
  refreshOAuthBox();
  d.showModal();
}
document.addEventListener('DOMContentLoaded', () => {
  const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };
  // handle OAuth callback (runs on page load after redirect back from openrouter)
  orHandleCallback();
  // show a sticky confirmation if we just connected
  const justConnected = sessionStorage.getItem('oa-or-just-connected');
  if (justConnected) {
    sessionStorage.removeItem('oa-or-just-connected');
    setTimeout(() => {
      const st = document.querySelector('#settingsStatus');
      if (st) st.textContent = 'Connected via OpenRouter OAuth. LLM, TTS and STT are ready - click "Test LLM" to verify.';
    }, 600);
  }
  on('#settingsButton', 'click', openSettings);
  on('#settingsClose', 'click', () => { const d = document.querySelector('#settingsDialog'); if (d) d.close(); });
  on('#orLoginButton', 'click', orStartLogin);
  on('#orLogoutButton', 'click', () => { orDisconnect(); refreshOAuthBox(); });
  on('#settingsSave', 'click', () => {
    keys.llm = { provider: $('#llmProvider').value, model: $('#llmModel').value.trim(), key: $('#llmKey').value.trim(), baseUrl: $('#llmBaseUrl').value.trim() };
    keys.tts = { provider: $('#ttsProvider').value, model: $('#ttsModel').value.trim(), key: $('#ttsKey').value.trim(), voice: $('#ttsVoice').value.trim() };
    keys.stt = { provider: $('#sttProvider').value, model: $('#sttModel').value.trim(), key: $('#sttKey').value.trim() };
    saveKeys();
    $('#settingsStatus').textContent = 'Saved. Keys live only in this browser localStorage.';
    toast('AI keys saved');
  });
  on('#settingsTest', 'click', async () => {
    $('#settingsStatus').textContent = 'Testing...';
    try {
      const r = await llmChat('Reply with exactly: OK', 'ping');
      $('#settingsStatus').textContent = 'LLM works: ' + r.slice(0, 60);
    } catch (e) { $('#settingsStatus').textContent = 'Test failed: ' + e.message; }
  });
  $$('.settings-tab').forEach(t => t.addEventListener('click', () => {
    $$('.settings-tab').forEach(x => x.classList.toggle('active', x === t));
    ['llm', 'tts', 'stt'].forEach(k => { const p = document.querySelector('#stab-' + k); if (p) p.hidden = (t.dataset.stab !== k); });
  }));
  const lp = document.querySelector('#llmProvider');
  if (lp) lp.addEventListener('change', function () {
    const m = { openai: 'gpt-4o-mini', groq: 'llama-3.1-8b-instant', openrouter: 'openai/gpt-4o-mini', gemini: 'gemini-1.5-flash', sarvam: 'sarvam-m', anthropic: 'claude-3-5-haiku-20241022', custom: '' };
    const mi = document.querySelector('#llmModel'); if (mi) mi.value = m[this.value] || '';
    const bw = document.querySelector('#llmBaseUrlWrap'); if (bw) bw.style.display = this.value === 'custom' ? '' : 'none';
  });
});

window.OA_AI = { AI, llmChat, ttsSpeak, sttTranscribe, refreshSettings: refreshOAuthBox, orStartLogin, openSettings };
})();