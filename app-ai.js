/* OA Open — AI-graded sections using Google Gemini */
(function () {
'use strict';
const { toast, esc, $, $$ } = window.OA_UI;
const pGet = (k) => ((window.OA_UI.progress || {})[k]) || {};
const progressStore = () => window.OA_UI.progress;

/* ---------- Built-in Gemini key rotation (zero setup needed) ---------- */
const _GEMINI_KEYS = [
  'AQ.Ab8RN6Kkpbe2CFBQ_hdrXKv7KxwiP1gPOB2eJOkwfOVY0sHWkg',
  'AQ.Ab8RN6KjogxIKHRvHRwsaqXzyNdBCaD_gYVPccPQklGwUyH8xA',
  'AQ.Ab8RN6JVmSygYCHsY9W9GizAnh6eaXDtTv1OGaDyifRItaykig'
];
let _gkIdx = 0;
function _nextGeminiKey() { return _GEMINI_KEYS[_gkIdx++ % _GEMINI_KEYS.length]; }

/* ---------- User key store (optional personal override) ---------- */
const KEY_STORE = 'oa-ai-keys-v2';
let keys = { userKey: '', model: 'gemini-3.6-flash' };
try {
  const k = JSON.parse(localStorage.getItem(KEY_STORE) || 'null');
  if (k) keys = Object.assign(keys, k);
} catch (e) {}
function saveKeys() { try { localStorage.setItem(KEY_STORE, JSON.stringify(keys)); } catch (e) {} }
window.OA_KEYS = { keys, saveKeys };


/* ---------- Core Gemini API caller ---------- */
async function _geminiCall(prompt, system, modelOverride) {
  const model = modelOverride || keys.model || 'gemini-3.6-flash';
  const keysToTry = keys.userKey ? [keys.userKey, ..._GEMINI_KEYS] : _GEMINI_KEYS;
  let lastErr = 'No keys';
  for (const k of keysToTry) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + k;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: 0.2 }
    });
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) { lastErr = 'Gemini HTTP ' + r.status + ': ' + (await r.text()).slice(0, 120); continue; }
      const j = await r.json();
      const text = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0].text;
      if (!text) { lastErr = 'Empty response'; continue; }
      return text;
    } catch (e) { lastErr = e.message; }
  }
  throw new Error('Gemini call failed: ' + lastErr);
}

/* Backward-compat: llmChat is used by speech/prompt graders */
async function llmChat(system, user) { return _geminiCall(user, system); }


/* ---------- TTS: browser built-in speech synthesis ---------- */
async function ttsSpeak(text, onPlay) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(u);
    return 'browser';
  } catch (e) {
    throw new Error('Browser speech synthesis unavailable');
  }
}

/* ---------- STT: browser speech recognition fallback ---------- */
async function sttTranscribe(blob) {
  throw new Error('Browser mode STT unavailable - self-grade using the rubric.');
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

/* ---------- AI settings dialog (Gemini-only) ---------- */
function openSettings() {
  const d = $('#settingsDialog');
  if (!d) return;
  const keyInput = $('#llmKey');
  const modelSel = $('#llmModel');
  if (keyInput) keyInput.value = keys.userKey || '';
  if (modelSel) modelSel.value = keys.model || 'gemini-3.6-flash';
  // Update the dot indicator
  const dot = $('#gbbDot');
  if (dot) {
    dot.className = 'gbb-dot ' + (keys.userKey ? 'dot-user' : 'dot-builtin');
    dot.title = keys.userKey ? 'Using your personal key' : 'Using built-in keys (3 rotating)';
  }
  d.showModal();
}

document.addEventListener('DOMContentLoaded', () => {
  const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };

  on('#settingsButton', 'click', openSettings);
  on('#settingsClose', 'click', () => { const d = document.querySelector('#settingsDialog'); if (d) d.close(); });

  on('#settingsSave', 'click', () => {
    keys.userKey = ($('#llmKey') && $('#llmKey').value.trim()) || '';
    keys.model   = ($('#llmModel') && $('#llmModel').value) || 'gemini-3.6-flash';
    saveKeys();
    const st = $('#settingsStatus');
    if (st) st.textContent = keys.userKey
      ? '✅ Personal key saved. It will be tried first before built-in keys.'
      : '✅ Using built-in Gemini keys (3 rotating). No personal key set.';
    toast('Gemini settings saved');
    // refresh dot
    const dot = $('#gbbDot');
    if (dot) dot.className = 'gbb-dot ' + (keys.userKey ? 'dot-user' : 'dot-builtin');
  });

  on('#settingsClear', 'click', () => {
    keys.userKey = '';
    saveKeys();
    const ki = $('#llmKey'); if (ki) ki.value = '';
    const st = $('#settingsStatus'); if (st) st.textContent = '🔑 Personal key cleared. Using built-in rotation.';
    const dot = $('#gbbDot'); if (dot) dot.className = 'gbb-dot dot-builtin';
    toast('Key cleared');
  });

  on('#settingsTest', 'click', async () => {
    const st = $('#settingsStatus');
    if (st) st.textContent = 'Testing Gemini connection…';
    try {
      const r = await _geminiCall('Reply with exactly: OK', 'You are a test bot.');
      if (st) st.textContent = '✅ Gemini works: ' + r.trim().slice(0, 60);
    } catch (e) {
      if (st) st.textContent = '❌ Test failed: ' + e.message;
    }
  });
});


/* ---------- Gemini frontend code review (rubric-based, structured JSON) ---------- */
async function llmFrontendReview(problemTitle, problemPrompt, files, checks) {
  const model = keys.model || 'gemini-3.6-flash';

  const systemTxt = `You are an expert frontend code reviewer for an online assessment platform.
Evaluate the student's HTML, CSS and JavaScript submission against the given rubric checklist.
Respond with ONLY valid JSON — no markdown fences, no extra text:
{
  "score": <integer 0 to ${checks.length}>,
  "pass": <true or false>,
  "feedback": "<2-3 sentence holistic feedback>",
  "checks": [
    { "label": "<exact label from rubric>", "pass": <true/false>, "note": "<one short reason>" }
  ]
}
Be strict but fair. Judge what the code DOES functionally, not just its shape.`;

  const userTxt = `Problem: ${problemTitle}
Description: ${problemPrompt}

Rubric (evaluate EACH item):
${checks.map((c, i) => `${i + 1}. ${c}`).join('\n')}

--- HTML (index.html) ---
${files.html || ''}

--- CSS (style.css) ---
${files.css || ''}

--- JavaScript (script.js) ---
${files.js || ''}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: userTxt }] }],
    systemInstruction: { parts: [{ text: systemTxt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 1500 }
  });

  // Attempt with user key first, then each built-in
  const keysToTry = keys.userKey ? [keys.userKey, ..._GEMINI_KEYS] : _GEMINI_KEYS;
  let lastErr = 'No keys available';

  for (const k of keysToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) { lastErr = `Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`; continue; }
      const j = await r.json();
      const raw = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0].text;
      if (!raw) { lastErr = 'Empty Gemini response'; continue; }
      // Strip any accidental markdown fences
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const result = JSON.parse(clean);
      // Normalise: ensure checks array is complete
      if (!result.checks || result.checks.length !== checks.length) {
        result.checks = checks.map((label, i) => {
          const found = (result.checks || []).find(c => c.label === label);
          return found || { label, pass: false, note: 'Not evaluated by AI' };
        });
        result.score = result.checks.filter(c => c.pass).length;
        result.pass  = result.score === checks.length;
      }
      return result;
    } catch (e) { lastErr = e.message; }
  }
}

/* ---------- Gemini code debugger / hints for DSA & SQL ---------- */
async function llmCodeHint(problemTitle, problemPrompt, language, code, testInfo) {
  const systemTxt = `You are an expert OA coding mentor.
The student is practicing a technical assessment coding problem and their solution failed or threw an error.
Give a brief, high-value diagnosis:
1. Root cause of why it failed or errored.
2. The specific edge case or logic bug.
3. A focused hint or conceptual fix (guide them to solve it, do not just dump the complete solution).
Keep your response concise, clear, and encouraging.`;

  const userTxt = `Problem: ${problemTitle}
Prompt: ${problemPrompt}
Language: ${language}

Student Code:
\`\`\`${language}
${code}
\`\`\`

Test Case Diagnostic:
Input: ${testInfo.input || 'N/A'}
Expected: ${testInfo.expected || 'N/A'}
Actual: ${testInfo.actual || 'N/A'}
Error: ${testInfo.error || 'None'}`;

  return _geminiCall(userTxt, systemTxt);
}

/* ---------- Gemini Technical Frontend Component Judge (Cognizant / React / Angular) ---------- */
async function llmComponentJudge(problemTitle, problemPrompt, componentCode, checks, evaluatorCases) {
  const model = keys.model || 'gemini-3.6-flash';
  const systemTxt = `You are an automated technical assessment evaluator for enterprise frontend coding assessments (Cognizant/Accenture/Infosys).
Evaluate the candidate's React or Angular component implementation against the problem requirements, architecture checks, and evaluator test cases.
Respond ONLY with valid JSON (no markdown formatting, no extra prose):
{
  "score": <integer 0 to 100>,
  "passed": <boolean: true if score >= 75>,
  "verdict": "<short verdict, e.g. Pass / High Distinction, Strong Pass, or Incomplete Implementation>",
  "summary": "<2-3 sentence technical assessment of correctness, state management, and edge-case handling>",
  "evaluatorCases": [
    { "scenario": "<name of evaluator case>", "passed": <boolean>, "note": "<brief technical note>" }
  ],
  "recommendations": "<1-2 specific bullet suggestions for improvement or edge cases>"
}
Be rigorous, evaluating both behavioral correctness and code quality.`;

  const userTxt = `Assessment: Frontend Component Lab
Problem: ${problemTitle}
Prompt: ${problemPrompt}

Expected Evaluator Scenarios:
${(evaluatorCases || []).map((ec, i) => `${i + 1}. ${ec}`).join('\n')}

Architectural & Behavioral Checks:
${(checks || []).map((c, i) => `${i + 1}. ${c.label || c}`).join('\n')}

Candidate Code:
\`\`\`
${componentCode}
\`\`\``;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: userTxt }] }],
    systemInstruction: { parts: [{ text: systemTxt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 1500 }
  });

  const keysToTry = keys.userKey ? [keys.userKey, ..._GEMINI_KEYS] : _GEMINI_KEYS;
  let lastErr = 'No keys available';

  for (const k of keysToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) { lastErr = `Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`; continue; }
      const j = await r.json();
      const raw = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0].text;
      if (!raw) { lastErr = 'Empty Gemini response'; continue; }
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(clean);
    } catch (e) { lastErr = e.message; }
  }
  throw new Error('Component evaluation failed: ' + lastErr);
}

/* ---------- Gemini Code Runner for Compiled Languages (Java / C++) ---------- */
async function llmCodeRunner(problemTitle, problemPrompt, language, code, tests) {
  const model = keys.model || 'gemini-3.6-flash';
  const systemTxt = `You are a strict Online Assessment (OA) Judge simulating the execution of a ${language.toUpperCase()} program.
For each given test case (with standard input and expected output), accurately simulate running the student's code.
Respond ONLY with valid JSON (no markdown formatting, no extra prose):
{
  "results": [
    {
      "name": "<test case name>",
      "pass": <true or false>,
      "input": "<the stdin input>",
      "expected": "<the expected output>",
      "actual": "<the simulated stdout output of candidate code>",
      "error": <null or string error message if syntax/runtime/compile error>
    }
  ]
}`;

  const testsFormatted = (tests || []).map((t, i) =>
    `Test ${i + 1} (${t.name || 'Scenario ' + (i + 1)}):\nInput: ${(t.args || []).join('\n')}\nExpected: ${t.expected}`
  ).join('\n\n');

  const userTxt = `Problem: ${problemTitle}
Prompt: ${problemPrompt}
Language: ${language}

Candidate Code:
\`\`\`${language}
${code}
\`\`\`

Test Cases to Execute:
${testsFormatted}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: userTxt }] }],
    systemInstruction: { parts: [{ text: systemTxt }] },
    generationConfig: { temperature: 0.05, maxOutputTokens: 1500 }
  });

  const keysToTry = keys.userKey ? [keys.userKey, ..._GEMINI_KEYS] : _GEMINI_KEYS;
  let lastErr = 'No keys available';

  for (const k of keysToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) { lastErr = `Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`; continue; }
      const j = await r.json();
      const raw = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts[0].text;
      if (!raw) { lastErr = 'Empty Gemini response'; continue; }
      const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(clean);
    } catch (e) { lastErr = e.message; }
  }
  throw new Error('Code simulation failed: ' + lastErr);
}

window.OA_AI = { AI, llmChat, ttsSpeak, sttTranscribe, llmFrontendReview, llmCodeHint, llmComponentJudge, llmCodeRunner, refreshSettings: openSettings, openSettings };
})();