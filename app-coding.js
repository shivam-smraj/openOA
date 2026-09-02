/* OA Practice Desk - coding runner: python (pyodide), js, sql (sql.js), frontend preview */
(function () {
'use strict';
const { toast, esc, $, $$ } = window.OA_UI;
const progress = () => window.OA_UI.progress;
const pGet = (k) => progress()[k] || {};
const pDone = (id) => progress().done.has(id);

let pyodideReady = null;
function loadPyodideRuntime() {
  if (pyodideReady) return pyodideReady;
  pyodideReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/pyodide.js';
    s.onload = async () => {
      try {
        const py = await loadPyodide({ indexURL: 'vendor/' });
        resolve(py);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('pyodide load failed'));
    document.head.appendChild(s);
  });
  return pyodideReady;
}

let sqlReady = null;
function loadSqlJs() {
  if (sqlReady) return sqlReady;
  sqlReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/sql-wasm.js';
    s.onload = async () => {
      try {
        const SQL = await initSqlJs({ locateFile: f => 'vendor/' + f });
        resolve(SQL);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('sql.js load failed'));
    document.head.appendChild(s);
  });
  return sqlReady;
}

function norm(s) {
  return String(s == null ? '' : s).replace(/\r/g, '').trim();
}

async function runPython(code, stdinText) {
  const py = await loadPyodideRuntime();
  const runnerScript =
    'import sys, io, traceback\n' +
    '_stdin_val = ' + JSON.stringify(stdinText || '') + '\n' +
    'sys.stdin = io.StringIO(_stdin_val)\n' +
    '_stdout_trap = io.StringIO()\n' +
    '_stderr_trap = io.StringIO()\n' +
    'sys.stdout = _stdout_trap\n' +
    'sys.stderr = _stderr_trap\n' +
    '_error_msg = None\n' +
    'try:\n' +
    '    _exec_ns = {"__name__": "__main__"}\n' +
    '    exec(' + JSON.stringify(code) + ', _exec_ns)\n' +
    'except Exception as _e:\n' +
    '    _error_msg = str(_e)\n' +
    'finally:\n' +
    '    sys.stdout = sys.__stdout__\n' +
    '    sys.stderr = sys.__stderr__\n' +
    '    sys.stdin = sys.__stdin__\n' +
    '_out_str = _stdout_trap.getvalue()\n' +
    '_err_str = _stderr_trap.getvalue()\n';
  try {
    await py.runPythonAsync(runnerScript);
    const out = py.globals.get('_out_str') || '';
    const err = py.globals.get('_error_msg') || null;
    const stderr = py.globals.get('_err_str') || '';
    return { stdout: out + (stderr ? (out ? '\n' : '') + stderr : ''), error: err };
  } catch (e) {
    return { stdout: '', error: String(e.message || e) };
  }
}

function runJs(code) {
  const logs = [];
  const fakeConsole = { log: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')), warn: () => {}, info: (...a) => logs.push(a.join(' ')) };
  let result = null, err = null;
  try { result = new Function('console', '"use strict";\n' + code + '\n')(fakeConsole); }
  catch (e) { err = String(e.message || e); }
  return { stdout: logs.join('\n') + (result !== undefined ? '\n' + String(result) : ''), error: err };
}

async function runSql(code, q) {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  const logs = [];
  try {
    if (q.setupSql) db.run(q.setupSql);
    const stmts = code.split(/;\s*(?=\n|$)/).map(s => s.trim()).filter(Boolean);
    let lastRows = null, lastCols = null;
    for (const st of stmts) {
      try {
        const res = db.exec(st);
        if (res.length) { lastCols = res[0].columns; lastRows = res[0].values; }
      } catch (e) { logs.push('SQL error: ' + e.message); }
    }
    if (lastCols) {
      logs.push(lastCols.join('\t'));
      lastRows.forEach(r => logs.push(r.map(v => v == null ? 'NULL' : String(v)).join('\t')));
    }
  } finally { db.close(); }
  return { stdout: logs.join('\n'), error: null };
}

function runFrontend(q, files) {
  const html = files.html || (q.starterCode && q.starterCode.html) || '';
  const css = files.css || '';
  const js = files.js || '';
  const doc = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + html + '<script>' + js + '<\/script></body></html>';
  const out = $('#frontendPreview');
  out.srcdoc = doc;
  out.hidden = false;
  return { stdout: 'Preview rendered.', error: null };
}

function checkTests(tests, runner, q) {
  // tests: [{args:[stdin], expected}]
  return runner;
}

const Coding = {
  state: { mode: null, list: [], i: 0, cat: 'dsa', cm: null, files: { html: '', css: '', js: '' }, activeTab: 'html', catTitle: '' },

  mount(root, mode, questions, title) {
    const st = this.state;
    st.mode = mode; st.list = questions; st.i = 0; st.search = ''; st.catTitle = title || 'Coding';
    if (mode === 'coding-fn' || mode === 'coding-stdin') st.lang = 'python';
    else if (mode === 'code-check') st.lang = 'javascript';
    else if (mode === 'sql-lab') st.lang = 'sql';
    else st.lang = 'python';

    root.innerHTML =
      '<div class="coding-workbench">' +
      '<!-- Column 1: Rail -->' +
      '<aside class="coding-rail" id="cRail">' +
      '<div class="coding-rail-head">' +
      '<span class="crh-label">Problem set</span>' +
      '<span class="crh-cat" id="cRailCat">' + esc(title || 'Problems') + '</span>' +
      '</div>' +
      '<div class="coding-rail-list" id="cList" role="tablist" aria-label="Problems"></div>' +
      '<div class="coding-rail-foot">' +
      '<span id="cRailFootInfo">' + questions.length + ' problems</span>' +
      '</div>' +
      '</aside>' +

      '<!-- Column 2: Problem Pane -->' +
      '<section class="problem-pane">' +
      '<header class="panel-toolbar">' +
      '<div class="panel-title-group"><span class="panel-icon">≡</span><strong>Description</strong></div>' +
      '<span id="cPos" class="panel-pos"></span>' +
      '</header>' +
      '<article class="problem-sheet" id="cProblem"></article>' +
      '</section>' +

      '<!-- Column 3: Editor Sheet -->' +
      '<section class="editor-sheet">' +
      '<div class="editor-toolbar">' +
      '<div class="editor-lang-wrap">' +
      '<span class="editor-code-icon"><code>{ }</code> Code</span>' +
      '<select id="cLangSelect" class="editor-lang-select">' +
      '<option value="python"' + (st.lang === 'python' ? ' selected' : '') + '>Python 3</option>' +
      '<option value="javascript"' + (st.lang === 'javascript' ? ' selected' : '') + '>JavaScript</option>' +
      '<option value="sql"' + (st.lang === 'sql' ? ' selected' : '') + '>SQL</option>' +
      '</select>' +
      '</div>' +
      '<div class="editor-actions">' +
      '<button id="cReset" class="btn-editor-action" type="button">Reset</button>' +
      '<button id="cRun" class="btn-editor-run" type="button">Run &#9654;</button>' +
      '</div>' +
      '</div>' +
      '<div class="code-editor-wrap">' +
      '<textarea id="cCode"></textarea>' +
      '</div>' +
      '<section class="console-pane">' +
      '<header class="console-toolbar">' +
      '<div class="console-tabs" role="tablist">' +
      '<button type="button" class="console-tab active" data-ctab="tests">Test cases</button>' +
      '<button type="button" class="console-tab" data-ctab="result">Result</button>' +
      '<button type="button" class="console-tab" data-ctab="preview" id="cPreviewTab" hidden>Preview</button>' +
      '</div>' +
      '<span class="console-runtime-badge" id="cRuntimeBadge">Python 3 · browser WASM</span>' +
      '</header>' +
      '<div class="console-body">' +
      '<div id="cTestCases" class="console-test-cases"></div>' +
      '<div id="cOut" class="run-output" hidden>Click "Run &#9654;" to execute your solution.</div>' +
      '<iframe id="cPreview" class="frontend-preview" title="preview" sandbox="allow-scripts" hidden></iframe>' +
      '</div>' +
      '</section>' +
      '</section>' +
      '</div>';

    const self = this;
    $('#cRun').addEventListener('click', () => self.run());
    $('#cReset').addEventListener('click', () => self.reset());

    // Console tabs
    $$('#sectionEngine [data-ctab]').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#sectionEngine [data-ctab]').forEach(t => t.classList.toggle('active', t === tab));
        const target = tab.dataset.ctab;
        const tc = $('#cTestCases');
        const out = $('#cOut');
        const pv = $('#cPreview');
        if (target === 'tests') {
          if (tc) tc.hidden = false;
          if (out) out.hidden = true;
          if (pv) pv.hidden = true;
        } else if (target === 'result') {
          if (tc) tc.hidden = true;
          if (out) out.hidden = false;
          if (pv) pv.hidden = true;
        } else if (target === 'preview') {
          if (tc) tc.hidden = true;
          if (out) out.hidden = true;
          if (pv) pv.hidden = false;
        }
      });
    });

    const langSel = $('#cLangSelect');
    if (langSel) {
      langSel.addEventListener('change', function () {
        st.lang = this.value;
        if (st.cm) st.cm.setOption('mode', this.value === 'sql' ? 'sql' : (this.value === 'javascript' ? 'javascript' : 'python'));
        const badge = $('#cRuntimeBadge');
        if (badge) {
          if (this.value === 'python') badge.textContent = 'Python 3 · browser WASM';
          else if (this.value === 'javascript') badge.textContent = 'JavaScript · browser runtime';
          else if (this.value === 'sql') badge.textContent = 'SQLite 3 · sql.js WASM';
        }
      });
    }

    if (st.cm && st.cm.toTextArea) {
      try { st.cm.toTextArea(); } catch (e) {}
      st.cm = null;
    }
    const codeEl = $('#cCode', root);
    if (codeEl) {
      st.cm = CodeMirror.fromTextArea(codeEl, { lineNumbers: true, mode: st.lang || 'python', autoCloseBrackets: true, matchBrackets: true, indentUnit: 4 });
    }
    this.renderList();
    setTimeout(() => { if (st.cm) st.cm.refresh(); }, 50);
  },

  visibleList() {
    const st = this.state;
    let list = st.list;
    if (st.search) list = list.filter(q =>
      (q.title || '').toLowerCase().includes(st.search) ||
      (q.prompt || '').toLowerCase().includes(st.search) ||
      (q.topic || '').toLowerCase().includes(st.search));
    return list;
  },

  renderList() {
    const st = this.state;
    const list = this.visibleList();
    if (st.i >= list.length) st.i = 0;
    const solvedCount = list.filter(q => pDone(q.id)).length;
    const footInfo = $('#cRailFootInfo');
    if (footInfo) footInfo.textContent = (solvedCount ? solvedCount + ' solved · ' : '') + list.length + ' total';
    const catEl = $('#cRailCat');
    if (catEl && st.catTitle) catEl.textContent = st.catTitle;

    $('#cList').innerHTML = list.map((q, i) => {
      const done = pDone(q.id);
      const diff = (q.difficulty || 'easy').toLowerCase();
      return '<button type="button" class="cq-rail-item' + (i === st.i ? ' active' : '') + (done ? ' is-done' : '') + '" data-cq="' + i + '" title="' + esc(q.title || q.id) + '">' +
        '<span class="cq-rail-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="cq-rail-body">' +
          '<span class="cq-rail-title">' + esc(q.title || q.id) + '</span>' +
          '<span class="cq-rail-diff ' + diff + '">' + esc(q.difficulty || 'easy') + '</span>' +
        '</div>' +
        (done ? '<span class="cq-rail-check">&#10003;</span>' : '') +
      '</button>';
    }).join('');

    const self = this;
    $$('#cList [data-cq]').forEach(b => b.addEventListener('click', () => {
      st.i = +b.dataset.cq;
      self.renderList();
      self.render();
      const stEl = $('.coding-workbench');
      if (stEl) stEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    const activeBtn = $('#cList .active');
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    this.render();
  },

  reset() {
    const list = this.visibleList();
    const q = list[this.state.i];
    if (!q) return;
    let code = '';
    if (q.starterCode) {
      code = typeof q.starterCode === 'string' ? q.starterCode : (q.starterCode.python || q.starterCode.js || Object.values(q.starterCode)[0] || '');
    }
    this.state.cm.setValue(code);
    toast('Code reset.');
  },

  render() {
    const st = this.state;
    const list = this.visibleList();
    const q = list[st.i];
    if (!q) { $('#cProblem').innerHTML = '<div class="no-results"><strong>No matches.</strong><p>Try another search.</p></div>'; return; }
    $('#cPos').textContent = (st.i + 1) + ' of ' + list.length;

    const pubTests = (q.tests || []).slice(0, q.publicTestCount || 3);
    const isFrontend = st.mode === 'code-check' || q.framework || q.filename || (q.previewChecks && q.previewChecks.length);

    let body = '';
    body += '<div class="problem-meta">' +
      '<span class="prob-tag topic">' + esc(q.topic || q.category || 'DSA') + '</span>' +
      '<span class="prob-tag diff ' + esc(q.difficulty || 'easy').toLowerCase() + '">' + esc(q.difficulty || 'easy') + '</span>' +
      '<code class="prob-id">' + esc(q.id) + '</code>' +
    '</div>';

    body += '<h2>' + (st.i + 1) + '. ' + esc(q.title || q.id) + '</h2>';
    body += '<p class="problem-prompt">' + esc(q.prompt) + '</p>';

    if (isFrontend) {
      body += '<div class="problem-program-box">' +
        '<span class="ppb-label">File</span>' +
        '<span class="ppb-value">' + esc(q.filename || (q.starterCode && q.starterCode.filename) || 'solution.component.ts') + '</span>' +
      '</div>';
    } else {
      body += '<div class="problem-program-box">' +
        '<span class="ppb-label">Program</span>' +
        '<span class="ppb-value">' + esc(q.signature || 'Standard input / standard output') + '</span>' +
      '</div>';
    }

    if (q.inputFormat || q.outputFormat || q.framework || q.entryPoint) {
      body += '<div class="problem-contract-table">';
      if (q.inputFormat) body += '<div class="pct-row"><span class="pct-label">Input</span><div class="pct-content">' + esc(q.inputFormat) + '</div></div>';
      if (q.outputFormat) body += '<div class="pct-row"><span class="pct-label">Output</span><div class="pct-content">' + esc(q.outputFormat) + '</div></div>';
      if (q.framework) body += '<div class="pct-row"><span class="pct-label">Framework</span><div class="pct-content">' + esc(q.framework) + '</div></div>';
      if (q.entryPoint) body += '<div class="pct-row"><span class="pct-label">Entry point</span><div class="pct-content">' + esc(q.entryPoint) + '</div></div>';
      body += '</div>';
    }

    if (pubTests.length) {
      body += '<h3>Examples</h3><div class="problem-examples">';
      pubTests.forEach((t, k) => {
        body += '<div class="problem-example"><strong>Example ' + (k + 1) + (t.name ? ' - ' + esc(t.name) : '') + '</strong>' +
          '<pre><span>Input:</span> ' + esc((t.args || []).join('\n')) + '\n<span>Output:</span> ' + esc(t.expected) + '</pre>' +
          (t.explanation ? '<small>' + esc(t.explanation) + '</small>' : '') + '</div>';
      });
      body += '</div>';
    }

    if (q.constraints && q.constraints.length) {
      body += '<h3>Constraints</h3><ul class="problem-constraints">' + q.constraints.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>';
    }
    if (q.previewChecks && q.previewChecks.length) {
      body += '<h3>Requirements</h3><ul class="problem-constraints">' + q.previewChecks.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>';
    }
    if (q.guidance) body += '<details class="problem-approach"><summary>Approach hint</summary><p>' + esc(q.guidance) + '</p></details>';

    $('#cProblem').innerHTML = body;

    // Test cases in console
    const tcEl = $('#cTestCases');
    if (tcEl) {
      if (pubTests.length) {
        tcEl.innerHTML = pubTests.map((t, k) =>
          '<div class="console-case-card">' +
            '<div class="ccc-head"><strong>Case ' + (k + 1) + (t.name ? ' - ' + esc(t.name) : '') + '</strong></div>' +
            '<div class="ccc-row"><span class="ccc-label">Input</span><pre>' + esc((t.args || []).join('\n')) + '</pre></div>' +
            '<div class="ccc-row"><span class="ccc-label">Expected</span><pre>' + esc(t.expected) + '</pre></div>' +
          '</div>'
        ).join('');
      } else if (q.previewChecks && q.previewChecks.length) {
        tcEl.innerHTML = '<div class="console-case-card"><div class="ccc-head"><strong>Preview Checks</strong></div><ul class="problem-constraints">' + q.previewChecks.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>';
      } else {
        tcEl.innerHTML = '<div class="console-case-card"><p class="runner-note">No public test cases specified. Click "Run &#9654;" to test your solution.</p></div>';
      }
    }

    const prevTab = $('#cPreviewTab');
    if (prevTab) prevTab.hidden = !isFrontend;

    const runtimeBadge = $('#cRuntimeBadge');
    if (runtimeBadge) {
      if (isFrontend) runtimeBadge.textContent = (q.framework || 'Frontend') + ' preview · sandboxed';
      else if (st.mode === 'sql-lab') runtimeBadge.textContent = 'SQLite 3 · sql.js WASM';
      else if (st.mode === 'code-check') runtimeBadge.textContent = 'JavaScript · browser runtime';
      else runtimeBadge.textContent = 'Python 3 · browser WASM';
    }

    let code = '';
    if (q.starterCode) code = typeof q.starterCode === 'string' ? q.starterCode : (q.starterCode.python || q.starterCode.js || Object.values(q.starterCode)[0] || '');
    const saved = pGet('drafts')[q.id];
    st.cm.setValue(saved != null ? saved : (code || ''));

    const langSel = $('#cLangSelect');
    if (st.mode === 'code-check') {
      st.cm.setOption('mode', 'javascript');
      if (langSel) langSel.value = 'javascript';
    } else if (st.mode === 'sql-lab') {
      st.cm.setOption('mode', 'sql');
      if (langSel) langSel.value = 'sql';
    } else {
      st.cm.setOption('mode', 'python');
      if (langSel) langSel.value = 'python';
    }
  },

  async run() {
    const st = this.state;
    const list = this.visibleList();
    const q = list[st.i];
    if (!q) return;
    const code = st.cm.getValue();
    pGet('drafts')[q.id] = code; window.OA_UI.saveProgress();

    // Switch console tab to Result
    $$('#sectionEngine [data-ctab]').forEach(t => t.classList.toggle('active', t.dataset.ctab === 'result'));
    const tc = $('#cTestCases'); if (tc) tc.hidden = true;
    const out = $('#cOut'); if (out) { out.hidden = false; out.innerHTML = '<p class="runner-note">Running locally...</p>'; }
    const pv = $('#cPreview'); if (pv) pv.hidden = true;

    function renderResults(results, kind) {
      const pass = results.filter(r => r.pass).length;
      const all = pass === results.length && results.length > 0;
      let html = '<div class="test-summary ' + (all ? 'all-pass' : (pass ? 'some-pass' : 'none-pass')) + '"><strong>' + pass + ' / ' + results.length + ' ' + kind + ' passed</strong></div>';
      html += '<div class="test-results">' + results.map((r, k) =>
        '<div class="test-result ' + (r.pass ? 'pass' : 'fail') + '">' +
        '<b>' + (r.pass ? 'Pass' : 'Fail') + ' - ' + (r.name || ('Case ' + (k + 1))) + '</b>' +
        '<code>' + (r.pass ? (r.actual != null ? 'expected ' + esc(r.expected) + ' = received ' + esc(r.actual) : 'check satisfied') :
          (r.error ? 'runtime error: ' + esc(r.error) : 'expected ' + esc(r.expected) + ' &#8800; received ' + esc(r.actual))) + '</code>' +
        '</div>').join('') + '</div>';
      out.innerHTML = html;
      return all;
    }

    try {
      if (st.mode === 'coding-stdin') {
        const tests = (q.tests || []).slice(0, 8);
        const results = [];
        for (const t of tests) {
          const stdinText = (t.args || []).join('\n');
          const r = await runPython(code, stdinText);
          const got = norm(r.stdout);
          const exp = norm(t.expected);
          results.push({ name: t.name, pass: got === exp && !r.error, expected: exp, actual: r.error ? null : got, error: r.error });
        }
        const all = renderResults(results, 'tests');
        if (all) { window.OA_UI.recordAnswer(q.id, 0, true); toast('All tests passed'); }
      } else if (st.mode === 'coding-fn') {
        const tests = (q.tests || []).slice(0, 8);
        const results = [];
        for (const t of tests) {
          const stdinText = (t.args || []).join('\n');
          const wrapper = code + '\nimport sys, json\n_input = sys.stdin.read() if False else ' + JSON.stringify(stdinText) + '\nprint(solve(_input))';
          const r = await runPython(wrapper, '');
          const got = norm(r.stdout).split('\n').filter(Boolean).pop() || '';
          results.push({ name: t.name, pass: norm(got) === norm(t.expected) && !r.error, expected: norm(t.expected), actual: r.error ? null : got, error: r.error });
        }
        const all = renderResults(results, 'tests');
        if (all) { window.OA_UI.recordAnswer(q.id, 0, true); toast('All tests passed'); }
      } else if (st.mode === 'code-check') {
        const code2 = st.cm.getValue();
        const results = (q.checks || []).map(c => {
          let ok = false;
          try { ok = new RegExp(c.pattern).test(code2); } catch (e) {}
          return { name: c.label, pass: ok, expected: c.label, actual: ok ? c.label : 'pattern not found' };
        });
        const all = renderResults(results, 'checks');
        out.insertAdjacentHTML('beforeend', '<p class="runner-note">Evaluation cases: ' + esc((q.evaluatorCases || []).join(' | ')) + '</p>');
        if (all) { window.OA_UI.recordAnswer(q.id, 0, true); toast('All checks passed'); }
      } else if (st.mode === 'sql-lab') {
        const r = await runSql(code, q);
        const vt = (q.tests || []).find(t => t.kind === 'values');
        if (vt) {
          const gotRows = r.stdout.split('\n').slice(1);
          const expRows = vt.expected.map(row => row.map(v => String(v)).join('\t'));
          const ok = gotRows.join('\n') === expRows.join('\n');
          const results = [{ name: 'result set', pass: ok, expected: expRows.join(' | '), actual: r.error ? null : gotRows.join(' | '), error: r.error }];
          const all = renderResults(results, 'checks');
          out.insertAdjacentHTML('beforeend', '<pre class="sql-output">' + esc(r.stdout || '(no output)') + '</pre>');
          if (all) { window.OA_UI.recordAnswer(q.id, 0, true); }
        } else {
          out.innerHTML = '<pre class="sql-output">' + esc(r.stdout || r.error || '(no output)') + '</pre>';
        }
      }
    } catch (e) {
      out.innerHTML = '<div class="test-summary none-pass"><strong>Runner error</strong></div><div class="test-result fail"><b>Fail - runner</b><code>' + esc(String(e.message || e)) + '</code></div>';
    }
  },

  /* ---------- accenture coding lab ---------- */
  openAccenture() {
    const all = (window.OA_BANKS.banks['accenture/coding'] || []);
    const cats = ['dsa', 'sql', 'frontend'];
    const st = this.state;
    st.cat = 'dsa';
    const UI = window.OA_UI;
    if (UI._nav) { UI._nav.length = 1; UI._nav.push({ label: 'Coding Lab', go: () => this.openAccenture() }); UI._crumbs && UI._crumbs(); }
    $('#codingCategoryNav').innerHTML = cats.map(c =>
      '<button type="button" class="track-pill" data-acc-cat="' + c + '">' + c.toUpperCase() + ' <span>' + all.filter(q => q.category === c).length + '</span></button>').join('');
    $$('#codingCategoryNav [data-acc-cat]').forEach(b => b.addEventListener('click', () => {
      st.cat = b.dataset.accCat;
      $$('#codingCategoryNav [data-acc-cat]').forEach(x => x.classList.toggle('active', x === b));
      Coding.renderAccentureList(all);
    }));
    $$('#codingCategoryNav [data-acc-cat]')[0].classList.add('active');
    this.renderAccentureList(all);
    window.OA_UI.show('codingView');
  },

  renderAccentureList(all) {
    const st = this.state;
    const list = all.filter(q => q.category === st.cat);
    const solvedN = list.filter(q => pDone(q.id)).length;
    $('#questionSetTitle').textContent = st.cat.toUpperCase();
    const pos = $('#codingStripPosition');
    if (pos) pos.textContent = (solvedN ? solvedN + ' solved · ' : '') + list.length + ' total';

    $('#codingQuestionList').innerHTML = list.map((q, i) => {
      const done = pDone(q.id);
      const diff = (q.difficulty || 'easy').toLowerCase();
      return '<button type="button" class="cq-rail-item' + (i === (st.accI || 0) ? ' active' : '') + (done ? ' is-done' : '') + '" data-acq="' + i + '" title="' + esc(q.title || q.id) + '">' +
        '<span class="cq-rail-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="cq-rail-body">' +
          '<span class="cq-rail-title">' + esc(q.title || q.id) + '</span>' +
          '<span class="cq-rail-diff ' + diff + '">' + esc(q.difficulty || 'easy') + '</span>' +
        '</div>' +
        (done ? '<span class="cq-rail-check">&#10003;</span>' : '') +
      '</button>';
    }).join('');

    const self = this;
    $$('#codingQuestionList [data-acq]').forEach(b => b.addEventListener('click', () => {
      st.accList = list; st.accI = +b.dataset.acq;
      self.renderAccentureQuestion();
      self.renderAccentureList(all);
      const station = $('.coding-workbench');
      if (station) station.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    const activeBtn = $('#codingQuestionList .active');
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (list.length) {
      st.accList = list;
      if (!st.accList.includes(st.accQ) || st.accI >= list.length) st.accI = 0;
      this.renderAccentureQuestion();
    }
  },

  renderAccentureQuestion() {
    const st = this.state, q = st.accList[st.accI];
    if (!st.accCm) {
      const editorHost = $('#codeEditor');
      if (editorHost) {
        editorHost.innerHTML = '';
        st.accCm = CodeMirror(editorHost, { lineNumbers: true, mode: 'python', autoCloseBrackets: true, matchBrackets: true, indentUnit: 4 });
      }
    }
    $$('#codingQuestionList .cq-rail-item').forEach((b, idx) => b.classList.toggle('active', idx === st.accI));
    $('#problemPosition').textContent = (st.accI + 1) + ' of ' + st.accList.length;
    $('#codingCategoryLabel').textContent = 'Accenture ' + st.cat.toUpperCase();

    const isFrontend = st.cat === 'frontend';
    let body = '';
    body += '<div class="problem-meta">' +
      '<span class="prob-tag topic">' + esc(q.topic || st.cat.toUpperCase()) + '</span>' +
      '<span class="prob-tag diff ' + esc(q.difficulty || 'easy').toLowerCase() + '">' + esc(q.difficulty || 'easy') + '</span>' +
      '<code class="prob-id">' + esc(q.id) + '</code>' +
    '</div>';

    body += '<h2>' + (st.accI + 1) + '. ' + esc(q.title || q.id) + '</h2>';
    body += '<p class="problem-prompt">' + esc(q.prompt) + '</p>';

    if (isFrontend) {
      body += '<div class="problem-program-box">' +
        '<span class="ppb-label">File</span>' +
        '<span class="ppb-value">solution.component.ts</span>' +
      '</div>';
    } else {
      body += '<div class="problem-program-box">' +
        '<span class="ppb-label">Program</span>' +
        '<span class="ppb-value">' + esc(q.signature || 'Standard input / standard output') + '</span>' +
      '</div>';
    }

    if (q.constraints) {
      body += '<h3>Constraints</h3><ul class="problem-constraints"><li>' + esc(q.constraints) + '</li></ul>';
    }
    if (st.cat === 'sql') {
      if (q.schema) body += '<h3>Schema</h3><pre class="sql-output">' + esc(q.schema) + '</pre>';
      if (q.expected) body += '<h3>Expected Result</h3><pre class="sql-output">' + esc(typeof q.expected === 'string' ? q.expected : JSON.stringify(q.expected, null, 2)) + '</pre>';
    }
    if (isFrontend && q.previewChecks) {
      body += '<h3>Requirements</h3><ul class="problem-constraints">' + q.previewChecks.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>';
    }
    if (q.tests && q.tests.length && st.cat === 'dsa') {
      body += '<h3>Examples</h3><div class="problem-examples">';
      q.tests.slice(0, 3).forEach((t, k) => {
        body += '<div class="problem-example"><strong>Example ' + (k + 1) + '</strong>' +
          '<pre><span>Input:</span> ' + esc((t.args || []).join('\n')) + '\n<span>Output:</span> ' + esc(t.expected) + '</pre></div>';
      });
      body += '</div>';
    }
    $('#codingProblem').innerHTML = body;

    // Test cases console
    const tcEl = $('#accTestCases');
    if (tcEl) {
      if (q.tests && q.tests.length && st.cat === 'dsa') {
        tcEl.innerHTML = q.tests.slice(0, 3).map((t, k) =>
          '<div class="console-case-card">' +
            '<div class="ccc-head"><strong>Case ' + (k + 1) + '</strong></div>' +
            '<div class="ccc-row"><span class="ccc-label">Input</span><pre>' + esc((t.args || []).join('\n')) + '</pre></div>' +
            '<div class="ccc-row"><span class="ccc-label">Expected</span><pre>' + esc(t.expected) + '</pre></div>' +
          '</div>'
        ).join('');
      } else if (isFrontend && q.previewChecks) {
        tcEl.innerHTML = '<div class="console-case-card"><div class="ccc-head"><strong>Preview Checks</strong></div><ul class="problem-constraints">' + q.previewChecks.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>';
      } else {
        tcEl.innerHTML = '<div class="console-case-card"><p class="runner-note">Click "Run &#9654;" to verify your solution.</p></div>';
      }
    }

    const prevTab = $('#accPreviewTab');
    if (prevTab) prevTab.hidden = !isFrontend;

    const runtimeBadge = $('#accRuntimeBadge');
    if (runtimeBadge) {
      if (st.cat === 'frontend') runtimeBadge.textContent = 'Frontend preview · sandboxed';
      else if (st.cat === 'sql') runtimeBadge.textContent = 'SQLite 3 · sql.js WASM';
      else runtimeBadge.textContent = 'Python 3 · browser WASM';
    }

    let mode = 'python', startCode = '';
    const langSel = $('#editorLanguageSelect');
    if (st.cat === 'sql') {
      mode = 'sql'; startCode = q.starterCode || '';
      if (langSel) langSel.value = 'sql';
    } else if (st.cat === 'frontend') {
      mode = 'javascript'; startCode = q.starterCode && q.starterCode.js ? q.starterCode.js : (typeof q.starterCode === 'string' ? q.starterCode : '');
      if (langSel) langSel.value = 'javascript';
    } else {
      startCode = q.starterCode || '';
      if (langSel) langSel.value = 'python';
    }
    if (st.accCm) {
      st.accCm.setOption('mode', mode);
      const saved = pGet('drafts')[q.id];
      st.accCm.setValue(saved != null ? saved : startCode);
      setTimeout(() => st.accCm && st.accCm.refresh(), 30);
    }
    st.accQ = q;
  },

  async runAccenture() {
    const st = this.state, q = st.accQ;
    if (!q) return;
    const code = st.accCm.getValue();
    pGet('drafts')[q.id] = code; window.OA_UI.saveProgress();

    // Switch console tab to Result
    $$('#codingView [data-acctab]').forEach(t => t.classList.toggle('active', t.dataset.acctab === 'result'));
    const tc = $('#accTestCases'); if (tc) tc.hidden = true;
    const out = $('#runOutput'); if (out) { out.hidden = false; out.textContent = 'Running locally...'; }
    const pv = $('#frontendPreview'); if (pv) pv.hidden = true;

    try {
      if (st.cat === 'dsa') {
        const tests = (q.tests || []).slice(0, 8);
        let pass = 0; const lines = [];
        for (const t of tests) {
          const stdinText = (t.args || []).join('\n');
          const r = await runPython(code, stdinText);
          const got = norm(r.stdout), exp = norm(t.expected);
          const ok = got === exp && !r.error;
          if (ok) pass++;
          lines.push((ok ? 'PASS' : 'FAIL') + '  in: ' + stdinText.replace(/\n/g, ' | ') + '\n  expected: ' + exp + '\n  got: ' + (r.error ? 'ERROR: ' + r.error : got));
        }
        lines.unshift(pass + '/' + tests.length + ' tests passed');
        out.textContent = lines.join('\n\n');
        if (tests.length && pass === tests.length) { window.OA_UI.recordAnswer(q.id, 0, true); toast('All tests passed'); }
      } else if (st.cat === 'sql') {
        const r = await runSql(code, q);
        out.textContent = r.stdout || '(no output)';
        const vt = (q.tests || []).find(t => t.kind === 'values');
        if (vt) {
          const gotRows = r.stdout.split('\n').slice(1).map(x => x.replace(/\t/g, '|'));
          const expRows = vt.expected.map(row => row.map(v => String(v)).join('|'));
          const ok = gotRows.join('\n') === expRows.join('\n');
          out.textContent += '\n\n' + (ok ? 'PASS - matches expected values' : 'FAIL - expected:\n' + expRows.join('\n'));
          if (ok) window.OA_UI.recordAnswer(q.id, 0, true);
        }
      } else if (st.cat === 'frontend') {
        const files = { html: q.files ? q.files.html : (typeof q.starterCode === 'string' ? q.starterCode : ''), css: q.files ? q.files.css : '', js: code };
        const jsCode = code;
        const htmlSrc = (files.html || '') + '';
        const doc = '<!doctype html><html><head><meta charset="utf-8"><style>' + (files.css || '') + '</style></head><body>' + htmlSrc + '<script>' + jsCode + '<\/script></body></html>';
        pv.srcdoc = doc; pv.hidden = false;
        let pass = 0; const lines = [];
        (q.previewChecks || []).forEach(c => lines.push('CHECK  ' + c));
        lines.unshift('Preview rendered below. Verify the ' + (q.previewChecks || []).length + ' preview checks by hand:');
        out.textContent = lines.join('\n');
      }
    } catch (e) { out.textContent = 'Runner error: ' + (e.message || e); }
  }
};

// Wire accenture run/reset buttons and console tabs
window.OA_CODING = { Coding, runPython, runJs, runSql, norm };

document.addEventListener('DOMContentLoaded', () => {
  const runBtn = document.getElementById('runCodeButton');
  if (runBtn) runBtn.addEventListener('click', () => window.OA_CODING.Coding.runAccenture());
  const resetBtn = document.getElementById('resetCodeButton');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    const st = window.OA_CODING.Coding.state;
    if (st.accCm && st.accQ) {
      let c = st.accQ.starterCode || '';
      if (typeof c === 'object') c = Object.values(c)[0] || '';
      st.accCm.setValue(c);
    }
  });

  // Accenture console tabs
  $$('#codingView [data-acctab]').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#codingView [data-acctab]').forEach(t => t.classList.toggle('active', t === tab));
      const target = tab.dataset.acctab;
      const tc = $('#accTestCases');
      const out = $('#runOutput');
      const pv = $('#frontendPreview');
      if (target === 'tests') {
        if (tc) tc.hidden = false;
        if (out) out.hidden = true;
        if (pv) pv.hidden = true;
      } else if (target === 'result') {
        if (tc) tc.hidden = true;
        if (out) out.hidden = false;
        if (pv) pv.hidden = true;
      } else if (target === 'preview') {
        if (tc) tc.hidden = true;
        if (out) out.hidden = true;
        if (pv) pv.hidden = false;
      }
    });
  });

  const sel = document.getElementById('editorLanguageSelect');
  if (sel) sel.addEventListener('change', function () {
    const st = window.OA_CODING.Coding.state;
    const map = { python: 'python', javascript: 'javascript', sql: 'sql' };
    if (st.accCm) st.accCm.setOption('mode', map[this.value] || 'python');
  });
});
})();