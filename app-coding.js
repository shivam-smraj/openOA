/* OA Open — coding runner: python (pyodide), js, sql (sql.js), frontend preview */
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
    function init(src, indexURL) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = async () => {
        try {
          const py = await loadPyodide({
            indexURL: indexURL,
            lockFileURL: indexURL + 'pyodide-lock.json'
          });
          resolve(py);
        } catch (e) {
          if (indexURL === 'vendor/') {
            init('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js', 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/');
          } else {
            reject(e);
          }
        }
      };
      s.onerror = () => {
        if (src === 'vendor/pyodide.js') {
          init('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js', 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/');
        } else {
          reject(new Error('pyodide load failed'));
        }
      };
      document.head.appendChild(s);
    }
    init('vendor/pyodide.js', 'vendor/');
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

/* ---------- Frontend document builder ---------- */
// Sentinel injected into every frontend iframe so we can run DOM checks via postMessage
const _DOM_CHECK_LISTENER = `<script id="__oa_checker">
(function(){
window.addEventListener('message',function(e){
  if(!e.data||e.data.type!=='oa-dom-check')return;
  var checks=e.data.checks||[];
  var results=checks.map(function(c){
    try{
      var el,ok=false;
      if(c.expect==='exists'){el=document.querySelector(c.query);ok=el!==null;}
      else if(c.expect==='text-contains'){el=document.querySelector(c.query);ok=!!(el&&el.textContent.includes(c.value));}
      else if(c.expect==='attr'){el=document.querySelector(c.query);ok=!!(el&&el.getAttribute(c.attr)===c.value);}
      else if(c.expect==='class-contains'){el=document.querySelector(c.query);ok=!!(el&&el.classList.contains(c.value));}
      else if(c.expect==='child-count'){el=document.querySelector(c.query);ok=!!(el&&el.children.length>=(c.min||1));}
      else if(c.expect==='aria-role'){el=document.querySelector(c.query);ok=!!(el&&el.getAttribute('role')===c.value);}
      else if(c.expect==='cssContains'){var s=Array.from(document.querySelectorAll('style')).map(function(x){return x.textContent;}).join(' ');ok=s.indexOf(c.cssContains)!==-1;}
      return{id:c.id,label:c.label,pass:!!ok};
    }catch(err){return{id:c.id,label:c.label,pass:false,error:err.message};}
  });
  e.source.postMessage({type:'oa-dom-check-result',results:results},'*');
},false);
})();
<\/script>`;

function buildFrontendDoc(html, css, js, injectChecker) {
  const checkerSnippet = injectChecker ? _DOM_CHECK_LISTENER : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    css + '</style></head><body>' + html + '<script>' + js + '<\/script>' + checkerSnippet + '</body></html>';
}

async function runDomChecks(iframe, checks) {
  if (!checks || !checks.length) return [];
  return new Promise(function(resolve) {
    var tid = setTimeout(function() { window.removeEventListener('message', handler); resolve([]); }, 4000);
    function handler(e) {
      if (!e.data || e.data.type !== 'oa-dom-check-result') return;
      clearTimeout(tid); window.removeEventListener('message', handler);
      resolve(e.data.results || []);
    }
    window.addEventListener('message', handler);
    setTimeout(function() {
      try { iframe.contentWindow.postMessage({ type: 'oa-dom-check', checks: checks }, '*'); }
      catch(err) { clearTimeout(tid); window.removeEventListener('message', handler); resolve([]); }
    }, 600); // give iframe time to fully load
  });
}

function renderFrontendResults(domResults, aiResult, checks, out, isFrontend) {
  var merged = checks.map(function(label) {
    var dr = domResults.find(function(r) { return r.label === label; });
    var ar = aiResult && aiResult.checks && aiResult.checks.find(function(r) { return r.label === label; });
    if (dr !== undefined) return { label: label, pass: dr.pass, note: dr.error || '', source: 'DOM' };
    if (ar) return { label: label, pass: ar.pass, note: ar.note || '', source: 'AI' };
    return { label: label, pass: false, note: '', source: '-' };
  });

  var passCount = merged.filter(function(c) { return c.pass; }).length;
  var total     = checks.length;
  var allPass   = passCount === total && total > 0;
  var pct       = total ? Math.round((passCount / total) * 100) : 0;
  var scoreClass = allPass ? 'all-pass' : (passCount > 0 ? 'some-pass' : 'none-pass');

  var html = '<div class="fe-results-header ' + scoreClass + '">' +
    '<div class="fe-score-ring" role="img" aria-label="' + passCount + ' of ' + total + ' checks passed">' +
      '<svg viewBox="0 0 36 36" class="fe-score-circle">' +
        '<path class="fe-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
        '<path class="fe-circle-fill ' + scoreClass + '" stroke-dasharray="' + pct + ',100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
        '<text x="18" y="21" class="fe-score-text">' + passCount + '/' + total + '</text>' +
      '</svg>' +
    '</div>' +
    '<div class="fe-score-info">' +
      '<strong>' + (allPass ? '🎉 All checks passed!' : passCount + ' / ' + total + ' checks passed') + '</strong>' +
      '<span>' + (allPass ? 'Excellent — marking as solved.' : 'Review the failing checks below.') + '</span>' +
    '</div>' +
  '</div>';

  if (aiResult && aiResult.feedback) {
    html += '<div class="fe-ai-feedback">' +
      '<span class="fe-ai-badge">✦ Gemini AI Review</span>' +
      '<p>' + esc(aiResult.feedback) + '</p>' +
    '</div>';
  }

  html += '<div class="fe-check-list">';
  merged.forEach(function(c) {
    html += '<div class="fe-check-item ' + (c.pass ? 'pass' : 'fail') + '">' +
      '<span class="fe-check-icon">' + (c.pass ? '✅' : '❌') + '</span>' +
      '<div class="fe-check-body">' +
        '<span class="fe-check-label">' + esc(c.label) + '</span>' +
        (c.note ? '<span class="fe-check-note">' + esc(c.note) + '</span>' : '') +
      '</div>' +
      (c.source !== '-' ? '<span class="fe-check-src fe-src-' + c.source.toLowerCase() + '">' + (c.source === 'DOM' ? '⚡ DOM' : '✦ AI') + '</span>' : '') +
    '</div>';
  });
  html += '</div>';

  out.innerHTML = html;
  return allPass;
}

function checkTests(tests, runner, q) {
  return runner;
}

/* ---------- DSA Execution Helpers (JS & Python) ---------- */
function runJsDsa(code, stdinText) {
  try {
    const runner = new Function('__stdin_str', `
      "use strict";
      let __captured = [];
      const console = {
        log: (...a) => __captured.push(a.map(String).join(' ')),
        error: (...a) => __captured.push('ERR: ' + a.join(' ')),
        warn: () => {},
        info: (...a) => __captured.push(a.join(' '))
      };
      ${code}
      if (typeof solve === 'function') {
        const __ret = solve(__stdin_str);
        if (__ret !== undefined) return String(__ret);
      }
      return __captured.join('\\n');
    `);
    const out = runner(stdinText);
    return { stdout: out || '', error: null };
  } catch (e) {
    return { stdout: '', error: String(e.message || e) };
  }
}

async function runPythonDsa(code, stdinText) {
  const pyWrapper = `
import sys, io
_stdin_val = ${JSON.stringify(stdinText || '')}
sys.stdin = io.StringIO(_stdin_val)
${code}
if 'solve' in globals() and callable(globals()['solve']):
    _res = solve(_stdin_val)
    if _res is not None:
        print(_res)
`;
  return runPython(pyWrapper, stdinText);
}

function renderDsaResults(results, out, q, code, lang, onSolved) {
  const passCount = results.filter(r => r.pass).length;
  const total = results.length;
  const allPass = passCount === total && total > 0;
  const scoreClass = allPass ? 'all-pass' : (passCount > 0 ? 'some-pass' : 'none-pass');

  let html = `<div class="test-summary ${scoreClass}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong>${allPass ? '🎉 All tests passed!' : `${passCount} / ${total} tests passed`}</strong>
      <span style="font-size:11.5px;opacity:0.9">${allPass ? 'Solved & Verified' : 'Review failing cases below'}</span>
    </div>
  </div>
  <div class="test-results">`;

  results.forEach((r, i) => {
    html += `<div class="test-result ${r.pass ? 'pass' : 'fail'}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>${r.pass ? '✅ Pass' : '❌ Fail'} — ${esc(r.name || `Case ${i + 1}`)}</b>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">
        <code><span style="color:var(--text-muted)">Input:</span> ${esc(r.input ? r.input.replace(/\n/g, ' ↵ ') : 'N/A')}</code>
        <code><span style="color:var(--text-muted)">Expected:</span> ${esc(r.expected)}</code>
        <code><span style="color:var(--text-muted)">Actual:</span> ${esc(r.error ? `Runtime error: ${r.error}` : (r.actual != null ? r.actual : 'None'))}</code>
      </div>
    </div>`;
  });
  html += `</div>`;

  if (!allPass) {
    html += `<div id="dsaAiHintContainer" style="margin-top:14px">
      <button type="button" class="btn-ai-hint" id="btnDsaAiHint">
        <span>✦</span> Ask Gemini: Why did this fail? (OA Diagnostic)
      </button>
    </div>`;
  }

  out.innerHTML = html;

  if (allPass && typeof onSolved === 'function') {
    onSolved();
  } else if (!allPass) {
    const hintBtn = out.querySelector('#btnDsaAiHint');
    if (hintBtn) {
      hintBtn.addEventListener('click', async () => {
        hintBtn.disabled = true;
        hintBtn.innerHTML = '<span>✦</span> Gemini is diagnosing your code…';
        const firstFail = results.find(r => !r.pass) || results[0];
        try {
          const hint = await window.OA_AI.llmCodeHint(q.title || 'Coding Problem', q.prompt || '', lang, code, firstFail);
          const c = out.querySelector('#dsaAiHintContainer');
          if (c) {
            c.innerHTML = `<div class="ai-hint-box">
              <div class="ai-hint-header">
                <span class="ai-hint-badge">✦ Gemini OA Diagnostic</span>
                <span style="font-size:11px;color:var(--text-muted)">Case ${results.indexOf(firstFail) + 1}</span>
              </div>
              <div class="ai-hint-content">${esc(hint)}</div>
            </div>`;
          }
        } catch (err) {
          hintBtn.disabled = false;
          hintBtn.innerHTML = '<span>⚠️</span> AI diagnosis failed: ' + esc(err.message);
        }
      });
    }
  }
  return allPass;
}


const Coding = {
  state: {
    mode: null, list: [], i: 0, cat: 'dsa', cm: null,
    // frontend multi-file editors
    cm_html: null, cm_css: null, cm_js: null, activeFeTab: 'html',
    files: { html: '', css: '', js: '' }, activeTab: 'html', catTitle: ''
  },

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
      '<div class="crh-title-group">' +
      '<span class="crh-label">Problem set</span>' +
      '<span class="crh-cat" id="cRailCat">' + esc(title || 'Problems') + '</span>' +
      '</div>' +
      '<button type="button" class="rail-toggle-btn" id="cRailToggleBtn" title="Collapse problem list (wider code view)">◀</button>' +
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
      '<option value="python"' + (st.lang === 'python' ? ' selected' : '') + '>Python 3 (Live WASM)</option>' +
      '<option value="javascript"' + (st.lang === 'javascript' ? ' selected' : '') + '>JavaScript (Live V8)</option>' +
      '<option value="java"' + (st.lang === 'java' ? ' selected' : '') + '>Java (Solution template)</option>' +
      '<option value="cpp"' + (st.lang === 'cpp' ? ' selected' : '') + '>C++ (Solution template)</option>' +
      '<option value="sql"' + (st.lang === 'sql' ? ' selected' : '') + '>SQL (sql.js WASM)</option>' +
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

    const cRailToggle = $('#cRailToggleBtn');
    if (cRailToggle) {
      cRailToggle.addEventListener('click', () => {
        const wb = root.querySelector('.coding-workbench');
        if (!wb) return;
        const collapsed = wb.classList.toggle('rail-collapsed');
        cRailToggle.textContent = collapsed ? '▶' : '◀';
        cRailToggle.title = collapsed ? 'Expand problem list' : 'Collapse problem list';
        setTimeout(() => self.state.cm && self.state.cm.refresh(), 180);
      });
    }

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
        const modeMap = {
          python: 'python',
          javascript: 'javascript',
          sql: 'sql',
          java: 'text/x-java',
          cpp: 'text/x-c++src'
        };
        if (st.cm) st.cm.setOption('mode', modeMap[this.value] || 'python');
        const badge = $('#cRuntimeBadge');
        if (badge) {
          if (this.value === 'python') badge.textContent = 'Python 3 · browser WASM';
          else if (this.value === 'javascript') badge.textContent = 'JavaScript · browser V8 runtime';
          else if (this.value === 'sql') badge.textContent = 'SQLite 3 · sql.js WASM';
          else if (this.value === 'java') badge.textContent = 'Java · Solution template (AI verified)';
          else if (this.value === 'cpp') badge.textContent = 'C++ · Solution template (AI verified)';
        }
        const curQ = self.visibleList()[st.i];
        if (curQ && st.cm) {
          const drafts = pGet('drafts');
          const savedLang = drafts[curQ.id + ':' + this.value];
          if (savedLang != null) {
            st.cm.setValue(savedLang);
          } else {
            const newCode = self.getStarterCodeForLang(curQ, this.value);
            if (newCode) st.cm.setValue(newCode);
          }
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

  getStarterCodeForLang(q, lang) {
    if (!q) return '';
    if (q.starterCode) {
      if (typeof q.starterCode === 'string') {
        if (lang === 'python' || lang === 'javascript' || lang === 'sql') return q.starterCode;
      } else if (typeof q.starterCode === 'object') {
        if (lang === 'python' && q.starterCode.python) return q.starterCode.python;
        if (lang === 'javascript' && (q.starterCode.js || q.starterCode.javascript)) return q.starterCode.js || q.starterCode.javascript;
        if (lang === 'java' && q.starterCode.java) return q.starterCode.java;
        if (lang === 'cpp' && (q.starterCode.cpp || q.starterCode['c++'])) return q.starterCode.cpp || q.starterCode['c++'];
        if (q.starterCode[lang]) return q.starterCode[lang];
      }
    }
    // Fallbacks
    if (this.state.mode === 'code-check') {
      return '// Complete the component implementation\n';
    }
    if (this.state.mode === 'sql-lab') {
      return '-- Write your SQL query below\nSELECT * FROM ...;\n';
    }
    if (lang === 'javascript') {
      return 'function solve(input) {\n    // Parse input and return the required output string\n    return "";\n}\n';
    }
    if (lang === 'java') {
      return 'import java.io.*;\n\nclass Solution {\n    public static void main(String[] args) throws Exception {\n        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));\n        // Write solution here\n    }\n}\n';
    }
    if (lang === 'cpp') {
      return '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Read input and write solution here\n    return 0;\n}\n';
    }
    return 'import sys\n\ndef solve(input_data):\n    # Parse input_data and return the required output\n    return ""\n\nif __name__ == "__main__":\n    print(solve(sys.stdin.read()))\n';
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
    const lang = this.state.lang || 'python';
    const code = this.getStarterCodeForLang(q, lang);
    this.state.cm.setValue(code || '');
    const drafts = pGet('drafts');
    delete drafts[q.id];
    delete drafts[q.id + ':' + lang];
    window.OA_UI.saveProgress();
    toast('Code reset to starter template.');
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
      else if (st.mode === 'code-check') runtimeBadge.textContent = 'JavaScript / TypeScript · component';
      else if (st.lang === 'javascript') runtimeBadge.textContent = 'JavaScript · browser V8 runtime';
      else if (st.lang === 'java') runtimeBadge.textContent = 'Java · Solution template (AI verified)';
      else if (st.lang === 'cpp') runtimeBadge.textContent = 'C++ · Solution template (AI verified)';
      else runtimeBadge.textContent = 'Python 3 · browser WASM';
    }

    let code = '';
    const drafts = pGet('drafts');
    const saved = drafts[q.id + ':' + st.lang] || drafts[q.id];
    if (saved != null) {
      code = saved;
    } else {
      code = this.getStarterCodeForLang(q, st.lang);
    }
    st.cm.setValue(code || '');

    const langSel = $('#cLangSelect');
    if (st.mode === 'code-check') {
      st.lang = 'javascript';
      st.cm.setOption('mode', 'javascript');
      if (langSel) langSel.value = 'javascript';
    } else if (st.mode === 'sql-lab') {
      st.lang = 'sql';
      st.cm.setOption('mode', 'sql');
      if (langSel) langSel.value = 'sql';
    } else {
      if (langSel) langSel.value = st.lang;
      const modeMap = {
        python: 'python',
        javascript: 'javascript',
        sql: 'sql',
        java: 'text/x-java',
        cpp: 'text/x-c++src'
      };
      st.cm.setOption('mode', modeMap[st.lang] || 'python');
    }
  },

  async run() {
    const self = this;
    const st = this.state;
    const list = this.visibleList();
    const q = list[st.i];
    if (!q) return;
    const code = st.cm.getValue();
    const lang = ($('#cLangSelect') && $('#cLangSelect').value) || st.lang || 'python';
    pGet('drafts')[q.id] = code;
    pGet('drafts')[q.id + ':' + lang] = code;
    window.OA_UI.saveProgress();

    // Switch console tab to Result
    $$('#sectionEngine [data-ctab]').forEach(t => t.classList.toggle('active', t.dataset.ctab === 'result'));
    const tc = $('#cTestCases'); if (tc) tc.hidden = true;
    const out = $('#cOut'); if (out) { out.hidden = false; out.innerHTML = '<p class="runner-note">Running tests...</p>'; }
    const pv = $('#cPreview'); if (pv) pv.hidden = true;

    function renderResults(results, kind) {
      const pass = results.filter(r => r.pass).length;
      const all = pass === results.length && results.length > 0;
      let html = '<div class="test-summary ' + (all ? 'all-pass' : (pass ? 'some-pass' : 'none-pass')) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<strong>' + pass + ' / ' + results.length + ' ' + kind + ' passed</strong>' +
        '<span style="font-size:11.5px;opacity:0.9">' + (all ? 'Solved' : 'Review failing cases') + '</span>' +
        '</div></div>';
      html += '<div class="test-results">' + results.map((r, k) =>
        '<div class="test-result ' + (r.pass ? 'pass' : 'fail') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (r.pass ? '✅ Pass' : '❌ Fail') + ' - ' + esc(r.name || ('Case ' + (k + 1))) + '</b></div>' +
        '<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">' +
        (r.input ? '<code><span style="color:var(--text-muted)">Input:</span> ' + esc(r.input.replace(/\n/g, ' ↵ ')) + '</code>' : '') +
        '<code><span style="color:var(--text-muted)">Expected:</span> ' + esc(r.expected) + '</code>' +
        '<code><span style="color:var(--text-muted)">Actual:</span> ' + esc(r.error ? 'Runtime error: ' + r.error : (r.actual != null ? r.actual : 'None')) + '</code>' +
        '</div></div>').join('') + '</div>';

      if (!all) {
        html += '<div id="cAiHintContainer" style="margin-top:14px">' +
          '<button type="button" class="btn-ai-hint" id="btnGenericAiHint"><span>✦</span> Ask Gemini: Why did this fail? (OA Diagnostic)</button>' +
          '</div>';
      }

      out.innerHTML = html;

      if (!all) {
        const hintBtn = out.querySelector('#btnGenericAiHint');
        if (hintBtn) {
          hintBtn.addEventListener('click', async () => {
            hintBtn.disabled = true;
            hintBtn.innerHTML = '<span>✦</span> Gemini is diagnosing your code…';
            const firstFail = results.find(r => !r.pass) || results[0];
            try {
              const curLang = ($('#cLangSelect') && $('#cLangSelect').value) || lang;
              const hint = await window.OA_AI.llmCodeHint(q.title || 'Coding problem', q.prompt || '', curLang, code, firstFail);
              const c = out.querySelector('#cAiHintContainer');
              if (c) {
                c.innerHTML = '<div class="ai-hint-box">' +
                  '<div class="ai-hint-header"><span class="ai-hint-badge">✦ Gemini OA Diagnostic</span></div>' +
                  '<div class="ai-hint-content">' + esc(hint) + '</div></div>';
              }
            } catch (err) {
              hintBtn.disabled = false;
              hintBtn.innerHTML = '<span>⚠️</span> AI diagnosis failed: ' + esc(err.message);
            }
          });
        }
      }
      return all;
    }

    try {
      if (st.mode === 'coding-stdin' || st.mode === 'coding-fn') {
        const tests = (q.tests || []).slice(0, 10);
        if (!tests.length) {
          out.innerHTML = '<div class="test-summary some-pass"><strong>No test cases defined</strong><p>Write and run your solution code.</p></div>';
          return;
        }

        let results = [];
        if (lang === 'java' || lang === 'cpp') {
          out.innerHTML = '<p class="runner-note">Simulating ' + esc(lang.toUpperCase()) + ' execution via Gemini AI OA Judge...</p>';
          try {
            const sim = await window.OA_AI.llmCodeRunner(q.title || 'Coding Problem', q.prompt || '', lang, code, tests);
            results = (sim && sim.results) || [];
          } catch (simErr) {
            results = tests.map((t, k) => ({
              name: t.name || ('Scenario ' + (k + 1)),
              pass: false,
              input: (t.args || []).join('\n'),
              expected: t.expected,
              actual: 'Simulation unavailable',
              error: simErr.message
            }));
          }
        } else if (lang === 'javascript') {
          for (const t of tests) {
            const stdinText = (t.args || []).join('\n');
            const r = runJsDsa(code, stdinText);
            const got = norm(r.stdout);
            const exp = norm(t.expected);
            results.push({ name: t.name, pass: got === exp && !r.error, input: stdinText, expected: exp, actual: r.error ? null : got, error: r.error });
          }
        } else {
          // Default Python
          for (const t of tests) {
            const stdinText = (t.args || []).join('\n');
            const r = await runPythonDsa(code, stdinText);
            const got = norm(r.stdout);
            const exp = norm(t.expected);
            results.push({ name: t.name, pass: got === exp && !r.error, input: stdinText, expected: exp, actual: r.error ? null : got, error: r.error });
          }
        }

        const all = renderResults(results, 'tests');
        if (all) {
          window.OA_UI.recordAnswer(q.id, 0, true);
          toast('All tests passed 🎉');
          self.renderList();
        }
      } else if (st.mode === 'code-check') {
        const code2 = st.cm.getValue();
        const results = (q.checks || []).map(c => {
          let ok = false;
          try { ok = new RegExp(c.pattern).test(code2); } catch (e) {}
          return { name: c.label, pass: ok, expected: c.label, actual: ok ? c.label : 'requirement not met' };
        });
        const all = renderResults(results, 'checks');

        // Add Cognizant Evaluator Cases and AI Judge button
        let feExtras = '<div style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px">';
        if (q.evaluatorCases && q.evaluatorCases.length) {
          feExtras += '<div class="ai-eval-scenarios-title">OA Evaluator Scenarios</div>' +
            '<div class="ai-eval-scenarios">' +
            q.evaluatorCases.map(ec =>
              '<div class="ai-eval-scenario-row"><span class="scenario-icon">●</span><div class="scenario-info"><strong>' + esc(ec) + '</strong></div></div>'
            ).join('') +
            '</div>';
        }
        feExtras += '<div id="cAiFeEvalContainer">' +
          '<button type="button" class="btn-ai-hint" id="btnFeAiJudge"><span>✦</span> Evaluate Component with Gemini AI (Cognizant OA Judge)</button>' +
          '</div></div>';
        out.insertAdjacentHTML('beforeend', feExtras);

        const feJudgeBtn = out.querySelector('#btnFeAiJudge');
        if (feJudgeBtn) {
          feJudgeBtn.addEventListener('click', async () => {
            feJudgeBtn.disabled = true;
            feJudgeBtn.innerHTML = '<span>✦</span> Gemini AI is assessing component against OA rubric…';
            try {
              const evalRes = await window.OA_AI.llmComponentJudge(q.title || 'Component', q.prompt || '', code2, q.checks || [], q.evaluatorCases || []);
              const c = out.querySelector('#cAiFeEvalContainer');
              if (c) {
                const isPass = evalRes.passed || evalRes.score >= 75;
                let cardHtml = '<div class="ai-eval-card">' +
                  '<div class="ai-eval-header">' +
                  '<div class="ai-eval-title-group"><span class="ai-eval-badge">✦ Gemini OA Judge</span><strong>' + esc(evalRes.verdict || (isPass ? 'Pass' : 'Needs Review')) + '</strong></div>' +
                  '<span class="ai-eval-score-badge ' + (isPass ? 'pass' : 'fail') + '">' + evalRes.score + ' / 100</span>' +
                  '</div>' +
                  '<div class="ai-eval-summary">' + esc(evalRes.summary || '') + '</div>';

                if (evalRes.evaluatorCases && evalRes.evaluatorCases.length) {
                  cardHtml += '<div class="ai-eval-scenarios-title">Scenario Verdicts</div><div class="ai-eval-scenarios">' +
                    evalRes.evaluatorCases.map(sc =>
                      '<div class="ai-eval-scenario-row ' + (sc.passed ? 'pass' : 'fail') + '">' +
                      '<span class="scenario-icon">' + (sc.passed ? '✓' : '✗') + '</span>' +
                      '<div class="scenario-info"><strong>' + esc(sc.scenario || '') + '</strong><span>' + esc(sc.note || '') + '</span></div>' +
                      '</div>'
                    ).join('') + '</div>';
                }

                if (evalRes.recommendations) {
                  cardHtml += '<div class="ai-eval-recs"><strong>Recommendations:</strong><br>' + esc(evalRes.recommendations) + '</div>';
                }

                cardHtml += '</div>';
                c.innerHTML = cardHtml;

                if (isPass) {
                  window.OA_UI.recordAnswer(q.id, 0, true);
                  toast('Component passed AI evaluation! 🎉');
                  self.renderList();
                }
              }
            } catch (err) {
              feJudgeBtn.disabled = false;
              feJudgeBtn.innerHTML = '<span>⚠️</span> AI evaluation failed: ' + esc(err.message);
            }
          });
        }

        if (all) {
          window.OA_UI.recordAnswer(q.id, 0, true);
          toast('All checks passed 🎉');
          self.renderList();
        }
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
          if (all) {
            window.OA_UI.recordAnswer(q.id, 0, true);
            toast('SQL query passed! 🎉');
            self.renderList();
          }
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
    if (!q) return;

    const isFrontend = st.cat === 'frontend';

    /* ---- Toggle single-file vs multi-file editor layout ---- */
    const singleWrap = document.getElementById('singleEditorWrap');
    const feWrap     = document.getElementById('feEditorWrap');
    const langWrap   = document.getElementById('editorLangWrap');
    const feTabs     = document.getElementById('frontendFileTabs');
    const runBtn     = document.getElementById('runCodeButton');

    if (singleWrap) singleWrap.hidden = isFrontend;
    if (feWrap)     feWrap.hidden     = !isFrontend;
    if (langWrap)   langWrap.hidden   = isFrontend;
    if (feTabs)     feTabs.hidden     = !isFrontend;
    if (runBtn)     runBtn.textContent = isFrontend ? 'Run Preview ▶' : 'Run Solution ▶';

    if (isFrontend) {
      /* ---------- Initialise 3 CodeMirror editors (once) ---------- */
      const htmlHost = document.getElementById('cm-html-host');
      const cssHost  = document.getElementById('cm-css-host');
      const jsHost   = document.getElementById('cm-js-host');

      if (!st.cm_html && htmlHost) {
        htmlHost.innerHTML = '';
        st.cm_html = CodeMirror(htmlHost, { lineNumbers: true, mode: 'xml', autoCloseBrackets: true, indentUnit: 2, lineWrapping: true });
      }
      if (!st.cm_css && cssHost) {
        cssHost.innerHTML = '';
        st.cm_css = CodeMirror(cssHost, { lineNumbers: true, mode: 'css', autoCloseBrackets: true, indentUnit: 2 });
      }
      if (!st.cm_js && jsHost) {
        jsHost.innerHTML = '';
        st.cm_js = CodeMirror(jsHost, { lineNumbers: true, mode: 'javascript', autoCloseBrackets: true, matchBrackets: true, indentUnit: 2 });
      }

      /* ---- Load values: saved drafts → starter code ---- */
      const drafts = pGet('drafts');
      const fq = q.files || {};
      if (st.cm_html) st.cm_html.setValue(drafts[q.id + ':html'] != null ? drafts[q.id + ':html'] : (fq.html || q.starterCode || ''));
      if (st.cm_css)  st.cm_css.setValue(drafts[q.id + ':css']  != null ? drafts[q.id + ':css']  : (fq.css  || ''));
      if (st.cm_js)   st.cm_js.setValue(drafts[q.id + ':js']   != null ? drafts[q.id + ':js']   : (fq.js   || ''));

      /* ---- Wire file-tab buttons ---- */
      $$('[data-file-tab]').forEach(btn => {
        btn.onclick = null;
        btn.addEventListener('click', () => {
          const tab = btn.dataset.fileTab;
          st.activeFeTab = tab;
          $$('[data-file-tab]').forEach(b => b.classList.toggle('active', b.dataset.fileTab === tab));
          $$('.fe-editor-pane').forEach(pane => { pane.hidden = pane.dataset.fePaane !== tab; });
          // Fix: use data-fe-pane attribute
          document.querySelectorAll('[data-fe-pane]').forEach(pane => {
            pane.hidden = pane.dataset.fePane !== tab;
          });
          const cm = st['cm_' + tab];
          if (cm) setTimeout(() => cm.refresh(), 10);
        });
      });
      // Show default HTML tab
      document.querySelectorAll('[data-fe-pane]').forEach(pane => {
        pane.hidden = pane.dataset.fePane !== (st.activeFeTab || 'html');
      });
      $$('[data-file-tab]').forEach(b => b.classList.toggle('active', b.dataset.fileTab === (st.activeFeTab || 'html')));
      setTimeout(() => { if (st.cm_html) st.cm_html.refresh(); }, 50);

      /* ---- Auto-save drafts on change ---- */
      ['html', 'css', 'js'].forEach(t => {
        const cm = st['cm_' + t];
        if (cm) cm.on('change', () => {
          pGet('drafts')[q.id + ':' + t] = cm.getValue();
        });
      });

    } else {
      /* ---------- Single-file editor (DSA / SQL) ---------- */
      const editorHost = document.getElementById('codeEditor');
      if (editorHost && !st.accCm) {
        editorHost.innerHTML = '';
        st.accCm = CodeMirror(editorHost, { lineNumbers: true, mode: 'python', autoCloseBrackets: true, matchBrackets: true, indentUnit: 4 });
      }
    }

    /* ---- Highlight active question in rail ---- */
    $$('#codingQuestionList .cq-rail-item').forEach((b, idx) => b.classList.toggle('active', idx === st.accI));
    $('#problemPosition').textContent = (st.accI + 1) + ' of ' + st.accList.length;
    $('#codingCategoryLabel').textContent = 'Accenture ' + st.cat.toUpperCase();

    /* ---- Build problem pane body ---- */
    let body = '';
    body += '<div class="problem-meta">' +
      '<span class="prob-tag topic">' + esc(q.topic || st.cat.toUpperCase()) + '</span>' +
      '<span class="prob-tag diff ' + esc((q.difficulty || 'easy').toLowerCase()) + '">' + esc(q.difficulty || 'easy') + '</span>' +
      '<code class="prob-id">' + esc(q.id) + '</code>' +
    '</div>';

    body += '<h2>' + (st.accI + 1) + '. ' + esc(q.title || q.id) + '</h2>';
    body += '<p class="problem-prompt">' + esc(q.prompt) + '</p>';

    if (isFrontend) {
      body += '<div class="problem-program-box">' +
        '<span class="ppb-label">Language</span>' +
        '<span class="ppb-value">HTML · CSS · JavaScript</span>' +
      '</div>';

      /* ---- AI Review section (checklist preview) ---- */
      const checks = q.previewChecks || [];
      if (checks.length) {
        const show = checks.slice(0, 5);
        body += '<div class="problem-review-section">' +
          '<div class="prv-header"><h3 class="prv-title">Review</h3>' +
          '<span class="prv-ai-badge">✦ AI-Checked</span></div>' +
          '<p class="prv-subtitle">After clicking <strong>Run Preview ▶</strong>, Gemini AI will evaluate:</p>' +
          '<ul class="prv-checklist">' +
          show.map(c => '<li>' + esc(c) + '</li>').join('') +
          (checks.length > 5 ? '<li class="prv-more">… and ' + (checks.length - 5) + ' more checks</li>' : '') +
          '</ul></div>';
      }

      if (q.constraints && q.constraints.length) {
        const cs = Array.isArray(q.constraints) ? q.constraints : [q.constraints];
        body += '<h3>Requirements</h3><ul class="problem-constraints">' + cs.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>';
      }
    } else {
      body += '<div class="problem-program-box">' +
        '<span class="ppb-label">Program</span>' +
        '<span class="ppb-value">' + esc(q.signature || 'Standard input / standard output') + '</span>' +
      '</div>';
      if (q.constraints) {
        body += '<h3>Constraints</h3><ul class="problem-constraints"><li>' + esc(q.constraints) + '</li></ul>';
      }
      if (st.cat === 'sql') {
        if (q.schema) body += '<h3>Schema</h3><pre class="sql-output">' + esc(q.schema) + '</pre>';
        if (q.expected) body += '<h3>Expected Result</h3><pre class="sql-output">' + esc(typeof q.expected === 'string' ? q.expected : JSON.stringify(q.expected, null, 2)) + '</pre>';
      }
      if (q.tests && q.tests.length && st.cat === 'dsa') {
        body += '<h3>Examples</h3><div class="problem-examples">';
        q.tests.slice(0, 3).forEach((t, k) => {
          body += '<div class="problem-example"><strong>Example ' + (k + 1) + '</strong>' +
            '<pre><span>Input:</span> ' + esc((t.args || []).join('\n')) + '\n<span>Output:</span> ' + esc(t.expected) + '</pre></div>';
        });
        body += '</div>';
      }
    }

    $('#codingProblem').innerHTML = body;

    /* ---- Console lower pane ---- */
    const tcEl = $('#accTestCases');
    if (tcEl) {
      if (isFrontend) {
        const checks = q.previewChecks || [];
        tcEl.innerHTML = '<div class="fe-checks-preview"><div class="fcp-header"><strong>AI Rubric</strong><span>' + checks.length + ' checks</span></div>' +
          '<ul class="fcp-list">' + checks.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
          '<p class="fcp-hint">Click <strong>Run Preview ▶</strong> to render your code and get AI feedback.</p>' +
          '</div>';
      } else if (q.tests && q.tests.length && st.cat === 'dsa') {
        tcEl.innerHTML = q.tests.slice(0, 3).map((t, k) =>
          '<div class="console-case-card">' +
            '<div class="ccc-head"><strong>Case ' + (k + 1) + '</strong></div>' +
            '<div class="ccc-row"><span class="ccc-label">Input</span><pre>' + esc((t.args || []).join('\n')) + '</pre></div>' +
            '<div class="ccc-row"><span class="ccc-label">Expected</span><pre>' + esc(t.expected) + '</pre></div>' +
          '</div>'
        ).join('');
      } else {
        tcEl.innerHTML = '<div class="console-case-card"><p class="runner-note">Click "▶" to verify your solution.</p></div>';
      }
    }

    /* ---- Show/hide console tabs ---- */
    const prevTab   = $('#accPreviewTab');
    const targetTab = $('#accTargetTab');
    if (prevTab)   prevTab.hidden   = !isFrontend;
    if (targetTab) targetTab.hidden = !(isFrontend && q.answerCode);

    /* ---- Runtime badge ---- */
    const runtimeBadge = $('#accRuntimeBadge');
    if (runtimeBadge) {
      if (isFrontend)       runtimeBadge.textContent = 'HTML · CSS · JS · sandboxed iframe';
      else if (st.cat === 'sql')  runtimeBadge.textContent = 'SQLite 3 · sql.js WASM';
      else                  runtimeBadge.textContent = 'Python 3 · browser WASM';
    }

    /* ---- Single-file editor content (non-frontend) ---- */
    if (!isFrontend && st.accCm) {
      let mode = 'python', startCode = '';
      const langSel = $('#editorLanguageSelect');
      const isJs = (q.language === 'JavaScript') || (q.starterCode && typeof q.starterCode === 'string' && q.starterCode.includes('function '));
      if (st.cat === 'sql') {
        mode = 'sql';
        startCode = q.starterCode || '';
        if (langSel) langSel.value = 'sql';
        if (runtimeBadge) runtimeBadge.textContent = 'SQLite 3 · sql.js WASM';
      } else if (st.cat === 'dsa') {
        if (isJs) {
          mode = 'javascript';
          startCode = q.starterCode || 'function solve(input) {\n  // Write solution here\n  \n}\n';
          if (langSel) langSel.value = 'javascript';
          if (runtimeBadge) runtimeBadge.textContent = 'JavaScript · in-browser V8 runtime';
        } else {
          mode = 'python';
          startCode = q.starterCode || 'def solve(input_data):\n    # Write solution here\n    pass\n\nif __name__ == "__main__":\n    import sys\n    print(solve(sys.stdin.read()))\n';
          if (langSel) langSel.value = 'python';
          if (runtimeBadge) runtimeBadge.textContent = 'Python 3 · browser WASM';
        }
      } else {
        mode = 'javascript';
        startCode = q.starterCode || '';
        if (langSel) langSel.value = 'javascript';
      }
      st.accCm.setOption('mode', mode);
      const savedCode = pGet('drafts')[q.id];
      st.accCm.setValue(savedCode != null ? savedCode : startCode);
      setTimeout(() => st.accCm && st.accCm.refresh(), 30);
    }

    /* ---- Load target answer preview if answerCode is available ---- */
    if (isFrontend && q.answerCode) {
      const tpv = document.getElementById('targetPreview');
      if (tpv) {
        const ac = q.answerCode;
        tpv.srcdoc = buildFrontendDoc(ac.html || '', ac.css || '', ac.js || '', false);
      }
    }

    st.accQ = q;
  },

  async runAccenture() {
    const st = this.state, q = st.accQ;
    if (!q) return;

    /* ---- Helper: switch console tab ---- */
    function switchAccTab(name) {
      $$('#codingView [data-acctab]').forEach(t => t.classList.toggle('active', t.dataset.acctab === name));
      const tc  = $('#accTestCases');    if (tc)  tc.hidden  = (name !== 'tests');
      const out = $('#runOutput');       if (out) out.hidden = (name !== 'result');
      const pv  = $('#frontendPreview'); if (pv)  pv.hidden  = (name !== 'preview');
      const tpv = $('#targetPreview');   if (tpv) tpv.hidden = (name !== 'target');
    }

    /* ============ FRONTEND LAB ============ */
    if (st.cat === 'frontend') {
      const files = {
        html: st.cm_html ? st.cm_html.getValue() : ((q.files && q.files.html) || q.starterCode || ''),
        css:  st.cm_css  ? st.cm_css.getValue()  : ((q.files && q.files.css)  || ''),
        js:   st.cm_js   ? st.cm_js.getValue()   : ((q.files && q.files.js)   || '')
      };

      /* Save drafts per file */
      const d = pGet('drafts');
      d[q.id + ':html'] = files.html;
      d[q.id + ':css']  = files.css;
      d[q.id + ':js']   = files.js;
      window.OA_UI.saveProgress();

      const checks   = q.previewChecks || [];
      const domChecks = q.domChecks    || [];

      /* ---- 1. Render live preview ---- */
      const docStr = buildFrontendDoc(files.html, files.css, files.js, domChecks.length > 0);
      const pv = $('#frontendPreview');
      if (pv) { pv.srcdoc = docStr; pv.hidden = false; }

      /* ---- Show loading in result pane ---- */
      const out = $('#runOutput');
      if (out) {
        out.hidden = false;
        out.innerHTML = '<div class="fe-loading">' +
          '<div class="fe-loading-spinner"></div>' +
          '<p>Rendering preview and sending to Gemini AI…</p>' +
        '</div>';
      }
      switchAccTab('result');

      try {
        /* ---- 2. DOM checks (fast, parallel) ---- */
        let domResults = [];
        if (domChecks.length && pv) {
          domResults = await runDomChecks(pv, domChecks);
        }

        /* ---- 3. AI evaluation ---- */
        let aiResult = null;
        if (checks.length) {
          try {
            if (out) out.innerHTML = '<div class="fe-loading"><div class="fe-loading-spinner"></div>' +
              '<p>✦ Gemini is reviewing your code…</p></div>';
            aiResult = await window.OA_AI.llmFrontendReview(q.title, q.prompt, files, checks);
          } catch (aiErr) {
            // AI failed — show DOM-only results with a warning note
            aiResult = {
              feedback: '⚠️ AI review unavailable (' + aiErr.message.slice(0, 80) + '). Showing DOM-based results only.',
              checks: []
            };
          }
        }

        /* ---- 4. Render results ---- */
        const allPass = renderFrontendResults(domResults, aiResult, checks, out);

        /* ---- 5. Auto-switch to preview tab to show live render ---- */
        switchAccTab('preview');
        // Then immediately switch back so student sees both result + preview
        setTimeout(() => switchAccTab('result'), 180);

        /* ---- 6. Mark as solved if all pass ---- */
        if (allPass) {
          window.OA_UI.recordAnswer(q.id, 0, true);
          toast('🎉 All checks passed — solved!');
          // Refresh rail to show checkmark
          Coding.renderAccentureList(window.OA_BANKS.banks['accenture/coding'] || []);
        }

        /* ---- 7. Load target preview if available ---- */
        if (q.answerCode) {
          const targetTab = $('#accTargetTab');
          const tpv = $('#targetPreview');
          if (tpv) {
            const ac = q.answerCode;
            tpv.srcdoc = buildFrontendDoc(ac.html || '', ac.css || '', ac.js || '', false);
          }
          if (targetTab) targetTab.hidden = false;
        }

      } catch (e) {
        if (out) out.innerHTML = '<div class="fe-results-header none-pass">' +
          '<div class="fe-score-info"><strong>Runner error</strong><span>' + esc(e.message || String(e)) + '</span></div>' +
          '</div>';
      }
      return;
    }

    /* ============ DSA / SQL ============ */
    const code = st.accCm ? st.accCm.getValue() : '';
    pGet('drafts')[q.id] = code; window.OA_UI.saveProgress();

    switchAccTab('result');
    const out = $('#runOutput');
    if (out) { out.hidden = false; out.innerHTML = '<div class="fe-loading"><div class="fe-loading-spinner"></div><p>Executing test cases…</p></div>'; }
    const pv = $('#frontendPreview'); if (pv) pv.hidden = true;

    try {
      if (st.cat === 'dsa') {
        const langSel = $('#editorLanguageSelect');
        const lang = (langSel && langSel.value) || (q.language ? q.language.toLowerCase() : 'javascript');
        const tests = (q.tests || []).slice(0, 10);
        const results = [];
        for (const t of tests) {
          const stdinText = (t.args || []).join('\n');
          let r;
          if (lang === 'javascript') {
            r = runJsDsa(code, stdinText);
          } else {
            r = await runPythonDsa(code, stdinText);
          }
          const got = norm(r.stdout);
          const exp = norm(t.expected);
          const ok = (got === exp || got.toLowerCase() === exp.toLowerCase()) && !r.error;
          results.push({
            name: t.name,
            pass: ok,
            input: stdinText,
            expected: exp,
            actual: r.error ? null : got,
            error: r.error
          });
        }
        renderDsaResults(results, out, q, code, lang, () => {
          window.OA_UI.recordAnswer(q.id, 0, true);
          toast('🎉 All tests passed — solved!');
          Coding.renderAccentureList(window.OA_BANKS.banks['accenture/coding'] || []);
        });
      } else if (st.cat === 'sql') {
        const r = await runSql(code, q);
        const vt = (q.tests || []).find(t => t.kind === 'values');
        let allPass = false;
        let html = '';

        if (r.error) {
          html = `<div class="test-summary none-pass"><strong>SQL Execution Error</strong></div>
          <pre class="sql-output">${esc(r.error)}</pre>
          <div id="sqlAiHintContainer" style="margin-top:12px">
            <button type="button" class="btn-ai-hint" id="btnSqlAiHint"><span>✦</span> Ask Gemini to fix SQL error</button>
          </div>`;
        } else {
          const lines = (r.stdout || '').split('\n').filter(Boolean);
          if (lines.length) {
            const cols = lines[0].split('\t');
            const rows = lines.slice(1).map(l => l.split('\t'));
            html += `<div class="sql-table-wrap">
              <table class="sql-table">
                <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>`;
          } else {
            html += `<pre class="sql-output">${esc(r.stdout || '(0 rows returned)')}</pre>`;
          }

          if (vt) {
            const gotRows = (r.stdout || '').split('\n').slice(1).map(x => x.replace(/\t/g, '|').trim()).filter(Boolean);
            const expRows = vt.expected.map(row => row.map(v => String(v)).join('|').trim());
            allPass = gotRows.join('\n') === expRows.join('\n');
            html = `<div class="test-summary ${allPass ? 'all-pass' : 'none-pass'}">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${allPass ? '🎉 Query output matches expected result!' : '❌ Query output does not match expected result'}</strong>
                <span style="font-size:11.5px;opacity:0.9">${allPass ? 'Solved' : 'Compare outputs below'}</span>
              </div>
            </div>` + html;

            if (!allPass) {
              html += `<div style="margin-top:14px"><strong>Expected Result:</strong></div>
              <div class="sql-table-wrap">
                <table class="sql-table">
                  <tbody>${vt.expected.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
              </div>
              <div id="sqlAiHintContainer" style="margin-top:12px">
                <button type="button" class="btn-ai-hint" id="btnSqlAiHint"><span>✦</span> Ask Gemini: SQL Query Diagnostic</button>
              </div>`;
            }
          } else {
            allPass = !r.error;
          }
        }

        out.innerHTML = html;

        if (allPass) {
          window.OA_UI.recordAnswer(q.id, 0, true);
          toast('🎉 Query passed — solved!');
          Coding.renderAccentureList(window.OA_BANKS.banks['accenture/coding'] || []);
        } else {
          const hintBtn = out.querySelector('#btnSqlAiHint');
          if (hintBtn) {
            hintBtn.addEventListener('click', async () => {
              hintBtn.disabled = true;
              hintBtn.innerHTML = '<span>✦</span> Gemini is diagnosing your query…';
              try {
                const hint = await window.OA_AI.llmCodeHint(q.title || 'SQL Problem', (q.prompt || '') + '\nSchema:\n' + (q.schema || ''), 'sql', code, {
                  input: q.setupSql || '',
                  expected: vt ? JSON.stringify(vt.expected) : '',
                  actual: r.stdout,
                  error: r.error
                });
                const c = out.querySelector('#sqlAiHintContainer');
                if (c) {
                  c.innerHTML = `<div class="ai-hint-box">
                    <div class="ai-hint-header"><span class="ai-hint-badge">✦ Gemini SQL Diagnostic</span></div>
                    <div class="ai-hint-content">${esc(hint)}</div>
                  </div>`;
                }
              } catch (err) {
                hintBtn.disabled = false;
                hintBtn.innerHTML = '<span>⚠️</span> AI diagnosis failed: ' + esc(err.message);
              }
            });
          }
        }
      }
    } catch (e) { if (out) out.textContent = 'Runner error: ' + (e.message || e); }
  }
};


// Wire accenture run/reset buttons and console tabs
window.OA_CODING = { Coding, runPython, runJs, runSql, norm };

document.addEventListener('DOMContentLoaded', () => {
  const runBtn = document.getElementById('runCodeButton');
  if (runBtn) runBtn.addEventListener('click', () => window.OA_CODING.Coding.runAccenture());

  /* ---- Reset button: handles both single-file and 3-file editors ---- */
  const resetBtn = document.getElementById('resetCodeButton');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    const st  = window.OA_CODING.Coding.state;
    const q   = st.accQ;
    if (!q) return;

    if (st.cat === 'frontend') {
      // Reset all 3 files to starter code
      const fq = q.files || {};
      if (st.cm_html) st.cm_html.setValue(fq.html || q.starterCode || '');
      if (st.cm_css)  st.cm_css.setValue(fq.css  || '');
      if (st.cm_js)   st.cm_js.setValue(fq.js   || '');
      // Clear saved drafts so reset sticks on reload
      const d = window.OA_UI.progress.drafts || {};
      delete d[q.id + ':html']; delete d[q.id + ':css']; delete d[q.id + ':js'];
      window.OA_UI.saveProgress();
      window.OA_UI.toast('Code reset to starter.');
    } else if (st.accCm && q) {
      let c = q.starterCode || '';
      if (typeof c === 'object') c = Object.values(c)[0] || '';
      st.accCm.setValue(c);
      window.OA_UI.toast('Code reset.');
    }
  });

  /* ---- Keyboard shortcut: Ctrl+Enter → Run ---- */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const codingView = document.getElementById('codingView');
      if (codingView && !codingView.hidden) {
        e.preventDefault();
        window.OA_CODING.Coding.runAccenture();
        return;
      }
      const companySectionView = document.getElementById('companySectionView');
      if (companySectionView && !companySectionView.hidden) {
        const cRun = document.getElementById('cRun');
        if (cRun) {
          e.preventDefault();
          window.OA_CODING.Coding.run();
          return;
        }
      }
    }
  });

  /* ---- Accenture console tabs (including new target tab) ---- */
  $$('#codingView [data-acctab]').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#codingView [data-acctab]').forEach(t => t.classList.toggle('active', t === tab));
      const target = tab.dataset.acctab;
      const tc  = $('#accTestCases');
      const out = $('#runOutput');
      const pv  = $('#frontendPreview');
      const tpv = $('#targetPreview');
      if (tc)  tc.hidden  = (target !== 'tests');
      if (out) out.hidden = (target !== 'result');
      if (pv)  pv.hidden  = (target !== 'preview');
      if (tpv) tpv.hidden = (target !== 'target');
    });
  });

  const sel = document.getElementById('editorLanguageSelect');
  if (sel) sel.addEventListener('change', function () {
    const st = window.OA_CODING.Coding.state;
    const map = { python: 'python', javascript: 'javascript', sql: 'sql' };
    if (st.accCm) st.accCm.setOption('mode', map[this.value] || 'python');
    const badge = document.getElementById('accRuntimeBadge');
    if (badge) {
      if (this.value === 'javascript') badge.textContent = 'JavaScript · in-browser V8 runtime';
      else if (this.value === 'sql') badge.textContent = 'SQLite 3 · sql.js WASM';
      else badge.textContent = 'Python 3 · in-browser Pyodide WASM';
    }
  });

  /* ---- Rail toggle: expand/collapse sidebar for wider editor ---- */
  const railToggle = document.getElementById('railToggleBtn');
  if (railToggle) {
    railToggle.addEventListener('click', () => {
      const wb = document.querySelector('#codingView .coding-workbench');
      if (!wb) return;
      const collapsed = wb.classList.toggle('rail-collapsed');
      railToggle.textContent = collapsed ? '▶' : '◀';
      railToggle.title = collapsed ? 'Expand problem list' : 'Collapse problem list';
      const st = window.OA_CODING.Coding.state;
      setTimeout(() => {
        st.accCm && st.accCm.refresh();
        st.cm_html && st.cm_html.refresh();
        st.cm_css && st.cm_css.refresh();
        st.cm_js && st.cm_js.refresh();
      }, 180);
    });
  }
});
})();