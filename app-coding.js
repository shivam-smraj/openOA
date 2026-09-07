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

/* ---------- Visual Diff Viewer ---------- */
function buildVisualDiff(expected, actual) {
  if (actual == null || expected == null) return '';
  const exp = String(expected).replace(/\r/g, '');
  const act = String(actual).replace(/\r/g, '');
  if (exp === act) return '';
  const expLines = exp.split('\n');
  const actLines = act.split('\n');
  const maxL = Math.max(expLines.length, actLines.length);
  let diffLines = '';
  for (let i = 0; i < maxL; i++) {
    const el = expLines[i];
    const al = actLines[i];
    if (el === al) {
      diffLines += '<div class="diff-line diff-line-match"><span class="diff-badge">MATCH</span> <span>' + esc(el) + '</span></div>';
    } else {
      if (el !== undefined) {
        diffLines += '<div class="diff-line diff-line-expected"><span class="diff-badge">- EXP</span> <span>' + esc(el) + '</span></div>';
      }
      if (al !== undefined) {
        diffLines += '<div class="diff-line diff-line-actual"><span class="diff-badge">+ ACT</span> <span>' + esc(al) + '</span></div>';
      }
    }
  }
  return '<div class="diff-view-box"><div style="font-size:10.5px;color:var(--text-muted);font-weight:700;margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px">Output Comparison</div>' + diffLines + '</div>';
}

/* ---------- Editor Font Scaling & State ---------- */
let currentEditorFontSize = parseInt(localStorage.getItem('oa-editor-font-size') || '13', 10);
function applyEditorFontSize(size, refreshEditors) {
  currentEditorFontSize = Math.max(11, Math.min(20, size));
  localStorage.setItem('oa-editor-font-size', String(currentEditorFontSize));
  document.documentElement.style.setProperty('--cm-font-size', currentEditorFontSize + 'px');
  $$('.editor-font-val').forEach(el => { el.textContent = currentEditorFontSize + 'px'; });
  if (refreshEditors) {
    setTimeout(() => {
      const st = window.OA_CODING && window.OA_CODING.Coding && window.OA_CODING.Coding.state;
      if (st) {
        st.accCm && st.accCm.refresh();
        st.cm_html && st.cm_html.refresh();
        st.cm_css && st.cm_css.refresh();
        st.cm_js && st.cm_js.refresh();
        st.cm && st.cm.refresh();
      }
    }, 40);
  }
}
// Set initial CSS property
document.documentElement.style.setProperty('--cm-font-size', currentEditorFontSize + 'px');

/* ---------- Workbench Mobile Navigation Helper (< 1024px) ---------- */
function setupWorkbenchMobileNav(navRoot, workbench) {
  if (!navRoot || !workbench) return;
  const tabs = navRoot.querySelectorAll('[data-wmn]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const pane = tab.dataset.wmn;
      workbench.setAttribute('data-active-pane', pane);
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      if (pane === 'editor' || pane === 'console') {
        setTimeout(() => {
          const st = window.OA_CODING && window.OA_CODING.Coding && window.OA_CODING.Coding.state;
          if (st) {
            st.accCm && st.accCm.refresh();
            st.cm_html && st.cm_html.refresh();
            st.cm_css && st.cm_css.refresh();
            st.cm_js && st.cm_js.refresh();
            st.cm && st.cm.refresh();
          }
        }, 50);
      }
    });
  });
}

function setMobileActivePane(navRoot, workbench, paneName) {
  if (!workbench) return;
  workbench.setAttribute('data-active-pane', paneName);
  if (navRoot) {
    navRoot.querySelectorAll('[data-wmn]').forEach(t => {
      t.classList.toggle('active', t.dataset.wmn === paneName);
    });
  }
}

/* ---------- Editor Tools Group (Font, Wrap, Copy, Zen) ---------- */
function setupEditorToolGroup(container, getActiveCm, getCodeFn) {
  if (!container) return;
  const btnMinus = container.querySelector('.btn-editor-tool[id$="FontMinus"]');
  const btnPlus = container.querySelector('.btn-editor-tool[id$="FontPlus"]');
  const btnWrap = container.querySelector('.btn-editor-tool[id$="WrapToggle"]');
  const btnCopy = container.querySelector('.btn-editor-tool[id$="CopyCode"]');
  const btnZen = container.querySelector('.btn-editor-tool[id$="ZenToggle"]');
  const fontVal = container.querySelector('.editor-font-val');

  if (fontVal) fontVal.textContent = currentEditorFontSize + 'px';

  if (btnMinus && !btnMinus._wired) {
    btnMinus._wired = true;
    btnMinus.addEventListener('click', () => {
      applyEditorFontSize(currentEditorFontSize - 1, true);
    });
  }
  if (btnPlus && !btnPlus._wired) {
    btnPlus._wired = true;
    btnPlus.addEventListener('click', () => {
      applyEditorFontSize(currentEditorFontSize + 1, true);
    });
  }
  if (btnWrap && !btnWrap._wired) {
    btnWrap._wired = true;
    btnWrap.addEventListener('click', () => {
      const cm = getActiveCm();
      if (!cm) return;
      const curWrap = !!cm.getOption('lineWrapping');
      const nextWrap = !curWrap;
      cm.setOption('lineWrapping', nextWrap);
      btnWrap.classList.toggle('active', nextWrap);
      toast(nextWrap ? 'Line wrapping enabled' : 'Line wrapping disabled');
    });
  }
  if (btnCopy && !btnCopy._wired) {
    btnCopy._wired = true;
    btnCopy.addEventListener('click', () => {
      const code = getCodeFn();
      if (code == null) return;
      navigator.clipboard.writeText(code).then(() => {
        toast('Code copied to clipboard 📋');
      }).catch(() => {
        toast('Failed to copy code');
      });
    });
  }
  if (btnZen && !btnZen._wired) {
    btnZen._wired = true;
    btnZen.addEventListener('click', () => {
      const sheet = container.closest('.editor-sheet');
      if (!sheet) return;
      const isZen = sheet.classList.toggle('zen-mode');
      btnZen.classList.toggle('active', isZen);
      btnZen.textContent = isZen ? '✕' : '⛶';
      btnZen.title = isZen ? 'Exit Zen mode (Esc)' : 'Zen fullscreen mode';
      toast(isZen ? 'Zen mode active (Press Esc to exit)' : 'Exited Zen mode');
      setTimeout(() => {
        const cm = getActiveCm();
        if (cm) cm.refresh();
      }, 50);
    });
  }
}

/* ---------- 1-Click Copy on Example Cards ---------- */
function attachExampleCopyHandlers(container) {
  if (!container) return;
  container.querySelectorAll('.btn-copy-example').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const textToCopy = btn.dataset.copyVal != null ? btn.dataset.copyVal : '';
      navigator.clipboard.writeText(textToCopy).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
        toast('Test case input copied to clipboard');
      }).catch(() => {
        toast('Copy failed');
      });
    };
  });
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

/* ---------- Multi-Language Helpers & Starter Code ---------- */
function detectLanguageFromString(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH)\b/i.test(s) || /--\s*Write your SQL/i.test(s)) {
    return 'sql';
  }
  if (/\b(function\b|const\b|let\b|var\b|console\.log|module\.exports|=>)/.test(s)) {
    return 'javascript';
  }
  if (/\b(def\s+\w+|import\s+sys|if\s+__name__\s*==|sys\.stdin|print\()/i.test(s)) {
    return 'python';
  }
  if (/\b(public\s+class|BufferedReader|System\.out|InputStreamReader)\b/.test(s)) {
    return 'java';
  }
  if (/\b(#include\s*<|std::|cin\s*>>|cout\s*<<)\b/.test(s)) {
    return 'cpp';
  }
  return null;
}

function getCodeMirrorModeForLang(lang) {
  const map = {
    python: 'python',
    javascript: 'javascript',
    sql: 'sql',
    java: 'text/x-java',
    cpp: 'text/x-c++src'
  };
  return map[lang] || 'python';
}

function getRuntimeBadgeText(lang, category) {
  if (category === 'frontend') return 'HTML · CSS · JS · sandboxed iframe';
  if (lang === 'sql' || category === 'sql') return 'SQLite 3 · sql.js WASM';
  if (lang === 'javascript') return 'JavaScript · in-browser V8 runtime';
  if (lang === 'java') return 'Java · Solution template (AI verified)';
  if (lang === 'cpp') return 'C++ · Solution template (AI verified)';
  return 'Python 3 · browser WASM';
}

function populateLanguageSelect(selectEl, category, currentLang, isCompanyWorkbench) {
  if (!selectEl) return currentLang;
  const isSql = category === 'sql' || category === 'sql-lab';
  let options = [];

  if (isSql) {
    options = [
      { value: 'sql', label: 'SQL (SQLite WASM)' }
    ];
  } else if (isCompanyWorkbench) {
    options = [
      { value: 'python', label: 'Python 3 (Live WASM)' },
      { value: 'javascript', label: 'JavaScript (Live V8)' },
      { value: 'java', label: 'Java (Solution template)' },
      { value: 'cpp', label: 'C++ (Solution template)' }
    ];
  } else {
    // Accenture / Coding Lab (DSA): DSA -> NO SQL in option!
    options = [
      { value: 'python', label: 'Python 3 (Pyodide WASM)' },
      { value: 'javascript', label: 'JavaScript (Sandbox)' },
      { value: 'java', label: 'Java (Solution Template)' }
    ];
  }

  const validVals = options.map(o => o.value);
  let effectiveLang = currentLang;
  if (!validVals.includes(effectiveLang)) {
    effectiveLang = validVals[0];
  }

  selectEl.innerHTML = options.map(o =>
    '<option value="' + esc(o.value) + '"' + (o.value === effectiveLang ? ' selected' : '') + '>' + esc(o.label) + '</option>'
  ).join('');

  selectEl.value = effectiveLang;
  selectEl.dataset.prevLang = effectiveLang;
  return effectiveLang;
}

function getStarterCodeForLang(q, lang) {
  if (!q) return '';
  const targetLang = (lang || 'python').toLowerCase();

  // 1. If starterCode is an object containing code per language
  if (q.starterCode && typeof q.starterCode === 'object') {
    if (targetLang === 'python' && (q.starterCode.python || q.starterCode.py)) {
      return q.starterCode.python || q.starterCode.py;
    }
    if (targetLang === 'javascript' && (q.starterCode.javascript || q.starterCode.js)) {
      return q.starterCode.javascript || q.starterCode.js;
    }
    if (targetLang === 'java' && q.starterCode.java) {
      return q.starterCode.java;
    }
    if (targetLang === 'cpp' && (q.starterCode.cpp || q.starterCode['c++'])) {
      return q.starterCode.cpp || q.starterCode['c++'];
    }
    if (targetLang === 'sql' && q.starterCode.sql) {
      return q.starterCode.sql;
    }
    if (q.starterCode[targetLang]) {
      return q.starterCode[targetLang];
    }
  }

  // 2. Extract comment or instruction if starterCode is string
  let promptComment = '';
  if (typeof q.starterCode === 'string') {
    const detected = detectLanguageFromString(q.starterCode);
    if (detected === targetLang) {
      return q.starterCode;
    }
    // Extract inner comment from starterCode if present
    const cMatch = q.starterCode.match(/\/\/\s*([^\n\r]+)/) || q.starterCode.match(/#\s*([^\n\r]+)/);
    if (cMatch) promptComment = cMatch[1].trim();
  }

  // 3. Fallbacks per target language
  if (targetLang === 'sql' || q.category === 'sql') {
    if (typeof q.starterCode === 'string' && detectLanguageFromString(q.starterCode) === 'sql') {
      return q.starterCode;
    }
    return '-- Write your SQL query below\nSELECT * FROM ...;\n';
  }

  if (targetLang === 'javascript') {
    return 'function solve(input) {\n  // ' + (promptComment || 'Parse input and return the required output') + '\n  return "";\n}\n';
  }

  if (targetLang === 'java') {
    return 'import java.io.*;\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) throws Exception {\n        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));\n        // ' + (promptComment || 'Read input and write solution here') + '\n    }\n}\n';
  }

  if (targetLang === 'cpp') {
    return '#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // ' + (promptComment || 'Read input and write solution here') + '\n    return 0;\n}\n';
  }

  // Default: Python
  return 'import sys\n\ndef solve(input_data):\n    # ' + (promptComment || 'Parse input_data and return the required output') + '\n    return ""\n\nif __name__ == "__main__":\n    print(solve(sys.stdin.read()))\n';
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
    const hasDiff = !r.pass && !r.error && r.actual != null && r.expected != null;
    html += `<div class="test-result ${r.pass ? 'pass' : 'fail'}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>${r.pass ? '✅ Pass' : '❌ Fail'} — ${esc(r.name || `Case ${i + 1}`)}</b>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">
        <code><span style="color:var(--text-muted)">Input:</span> ${esc(r.input ? r.input.replace(/\n/g, ' ↵ ') : 'N/A')}</code>
        <code><span style="color:var(--text-muted)">Expected:</span> ${esc(r.expected)}</code>
        <code><span style="color:var(--text-muted)">Actual:</span> ${esc(r.error ? `Runtime error: ${r.error}` : (r.actual != null ? r.actual : 'None'))}</code>
        ${hasDiff ? buildVisualDiff(r.expected, r.actual) : ''}
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
    st.mode = mode; st.list = questions; st.i = 0; st.search = ''; st.diff = 'all'; st.catTitle = title || 'Coding';
    if (mode === 'coding-fn' || mode === 'coding-stdin') st.lang = 'python';
    else if (mode === 'code-check') st.lang = 'javascript';
    else if (mode === 'sql-lab') st.lang = 'sql';
    else st.lang = 'python';

    root.innerHTML =
      '<div class="coding-workbench" id="cWorkbench">' +
      '<!-- Mobile Segmented View Navigation (< 1024px) -->' +
      '<nav class="workbench-mobile-nav" id="cMobileNav" role="tablist" aria-label="Workbench view mode">' +
      '<button type="button" class="wmn-tab" data-wmn="rail">☰ Problems</button>' +
      '<button type="button" class="wmn-tab active" data-wmn="problem">📄 Problem</button>' +
      '<button type="button" class="wmn-tab" data-wmn="editor">💻 Code</button>' +
      '<button type="button" class="wmn-tab" data-wmn="console">🧪 Output</button>' +
      '</nav>' +

      '<!-- Column 1: Rail -->' +
      '<aside class="coding-rail" id="cRail">' +
      '<div class="coding-rail-head">' +
      '<div class="crh-title-group">' +
      '<span class="crh-label">Problem set</span>' +
      '<span class="crh-cat" id="cRailCat">' + esc(title || 'Problems') + '</span>' +
      '</div>' +
      '<button type="button" class="rail-toggle-btn" id="cRailToggleBtn" title="Collapse problem list (wider code view)">◀</button>' +
      '</div>' +
      '<div class="rail-filter-panel">' +
      '<div class="rail-search-box">' +
      '<span class="rail-search-icon">🔍</span>' +
      '<input type="search" id="cRailSearch" class="rail-search-input" placeholder="Search problems (Ctrl+/)..." aria-label="Search problems">' +
      '</div>' +
      '<div class="rail-diff-filters" role="group" aria-label="Difficulty filter">' +
      '<button type="button" class="diff-filter-pill active" data-c-diff="all">All</button>' +
      '<button type="button" class="diff-filter-pill" data-c-diff="easy">Easy</button>' +
      '<button type="button" class="diff-filter-pill" data-c-diff="medium">Med</button>' +
      '<button type="button" class="diff-filter-pill" data-c-diff="hard">Hard</button>' +
      '</div>' +
      '<div class="rail-progress-track" title="Solved progress">' +
      '<div class="rail-progress-fill" id="cRailProgress" style="width: 0%"></div>' +
      '</div>' +
      '</div>' +
      '<div class="coding-rail-list" id="cList" role="tablist" aria-label="Problems"></div>' +
      '<div class="coding-rail-foot">' +
      '<span id="cRailFootInfo">' + questions.length + ' problems</span>' +
      '</div>' +
      '</aside>' +

      '<!-- Column 2: Problem Pane -->' +
      '<section class="problem-pane" id="cProblemPane">' +
      '<header class="panel-toolbar">' +
      '<div class="panel-title-group"><span class="panel-icon">📄</span><strong>Description</strong></div>' +
      '<div class="problem-nav-buttons">' +
      '<button type="button" class="btn-problem-nav" id="cProbPrevBtn" title="Previous problem (Alt+Left)">◀ Prev</button>' +
      '<span id="cPos" class="panel-pos"></span>' +
      '<button type="button" class="btn-problem-nav" id="cProbNextBtn" title="Next problem (Alt+Right)">Next ▶</button>' +
      '</div>' +
      '</header>' +
      '<article class="problem-sheet" id="cProblem"></article>' +
      '</section>' +

      '<!-- Column 3: Editor Sheet -->' +
      '<section class="editor-sheet" id="cEditorSheet">' +
      '<div class="editor-toolbar">' +
      '<div class="editor-toolbar-start">' +
      '<div class="editor-lang-wrap">' +
      '<span class="editor-code-icon"><code>&lt;/&gt;</code></span>' +
      '<select id="cLangSelect" class="editor-lang-select">' +
      '<option value="python"' + (st.lang === 'python' ? ' selected' : '') + '>Python 3 (Live WASM)</option>' +
      '<option value="javascript"' + (st.lang === 'javascript' ? ' selected' : '') + '>JavaScript (Live V8)</option>' +
      '<option value="java"' + (st.lang === 'java' ? ' selected' : '') + '>Java (Solution template)</option>' +
      '<option value="cpp"' + (st.lang === 'cpp' ? ' selected' : '') + '>C++ (Solution template)</option>' +
      '<option value="sql"' + (st.lang === 'sql' ? ' selected' : '') + '>SQL (sql.js WASM)</option>' +
      '</select>' +
      '</div>' +
      '</div>' +
      '<div class="editor-toolbar-end">' +
      '<div class="editor-tools-group">' +
      '<button type="button" class="btn-editor-tool" id="cFontMinus" title="Decrease font size">A-</button>' +
      '<span class="editor-font-val" id="cFontVal">13px</span>' +
      '<button type="button" class="btn-editor-tool" id="cFontPlus" title="Increase font size">A+</button>' +
      '<button type="button" class="btn-editor-tool" id="cWrapToggle" title="Toggle line wrap">Wrap</button>' +
      '<button type="button" class="btn-editor-tool" id="cCopyCode" title="Copy code to clipboard">Copy</button>' +
      '<button type="button" class="btn-editor-tool" id="cZenToggle" title="Zen fullscreen mode">⛶</button>' +
      '</div>' +
      '<div class="editor-actions">' +
      '<button id="cReset" class="btn-editor-action" type="button">Reset</button>' +
      '<button id="cRun" class="btn-editor-run" type="button">Run ▶</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="code-editor-wrap">' +
      '<textarea id="cCode"></textarea>' +
      '</div>' +
      '<section class="console-pane" id="cConsolePane">' +
      '<header class="console-toolbar">' +
      '<div class="console-tabs" role="tablist">' +
      '<button type="button" class="console-tab active" data-ctab="tests">Test cases</button>' +
      '<button type="button" class="console-tab" data-ctab="custom" id="cCustomTab">Custom Input</button>' +
      '<button type="button" class="console-tab" data-ctab="result" id="cResultTab">Result</button>' +
      '<button type="button" class="console-tab" data-ctab="preview" id="cPreviewTab" hidden>Preview</button>' +
      '</div>' +
      '<span class="console-runtime-badge" id="cRuntimeBadge">Python 3 · browser WASM</span>' +
      '</header>' +
      '<div class="console-body">' +
      '<div id="cTestCases" class="console-test-cases"></div>' +
      '<div id="cCustomInputPane" class="custom-input-pane" hidden>' +
      '<div class="cip-header">' +
      '<span>Enter custom standard input to test your code:</span>' +
      '<button type="button" class="btn-cip-run" id="btnRunCCustom">Run with Custom Input ▶</button>' +
      '</div>' +
      '<textarea id="cCustomInputText" class="custom-input-textarea" placeholder="Paste or type test input here..."></textarea>' +
      '</div>' +
      '<div id="cOut" class="run-output" hidden>Click "Run ▶" to execute your solution.</div>' +
      '<iframe id="cPreview" class="frontend-preview" title="preview" sandbox="allow-scripts" hidden></iframe>' +
      '</div>' +
      '</section>' +
      '</section>' +
      '</div>';

    const self = this;
    $('#cRun', root).addEventListener('click', () => self.run());
    $('#cReset', root).addEventListener('click', () => self.reset());

    // Setup mobile segmented navigation
    const cMobileNav = $('#cMobileNav', root);
    const cWb = $('#cWorkbench', root);
    if (cMobileNav && cWb) {
      setupWorkbenchMobileNav(cMobileNav, cWb);
    }

    // Setup editor tools
    const cEditorSheet = $('#cEditorSheet', root);
    if (cEditorSheet) {
      setupEditorToolGroup(cEditorSheet, () => st.cm, () => st.cm ? st.cm.getValue() : '');
    }

    // Prev / Next buttons
    const prevBtn = $('#cProbPrevBtn', root);
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (st.i > 0) {
          st.i--;
          self.renderList();
          self.render();
        }
      });
    }
    const nextBtn = $('#cProbNextBtn', root);
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const vis = self.visibleList();
        if (st.i < vis.length - 1) {
          st.i++;
          self.renderList();
          self.render();
        }
      });
    }

    // Rail Search & Difficulty Filters
    const cSearch = $('#cRailSearch', root);
    if (cSearch) {
      cSearch.addEventListener('input', () => {
        st.search = cSearch.value;
        st.i = 0;
        self.renderList();
      });
    }
    $$('#sectionEngine [data-c-diff]').forEach(pill => {
      pill.addEventListener('click', () => {
        st.diff = pill.dataset.cDiff;
        $$('#sectionEngine [data-c-diff]').forEach(p => p.classList.toggle('active', p === pill));
        st.i = 0;
        self.renderList();
      });
    });

    const cRailToggle = $('#cRailToggleBtn', root);
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
        const tc = $('#cTestCases', root);
        const cip = $('#cCustomInputPane', root);
        const out = $('#cOut', root);
        const pv = $('#cPreview', root);
        if (tc) tc.hidden = (target !== 'tests');
        if (cip) cip.hidden = (target !== 'custom');
        if (out) out.hidden = (target !== 'result');
        if (pv) pv.hidden = (target !== 'preview');
      });
    });

    // Custom runner button
    const btnCustom = $('#btnRunCCustom', root);
    if (btnCustom) {
      btnCustom.addEventListener('click', async () => {
        const curQ = self.visibleList()[st.i];
        if (!curQ) return;
        const customStdin = ($('#cCustomInputText', root) && $('#cCustomInputText', root).value) || '';
        const code = st.cm ? st.cm.getValue() : '';
        const curLang = ($('#cLangSelect', root) && $('#cLangSelect', root).value) || st.lang || 'python';

        $$('#sectionEngine [data-ctab]').forEach(t => t.classList.toggle('active', t.dataset.ctab === 'result'));
        const tc = $('#cTestCases', root); if (tc) tc.hidden = true;
        const cip = $('#cCustomInputPane', root); if (cip) cip.hidden = true;
        const out = $('#cOut', root); if (out) { out.hidden = false; out.innerHTML = '<div class="fe-loading"><div class="fe-loading-spinner"></div><p>Executing with custom input…</p></div>'; }
        const pv = $('#cPreview', root); if (pv) pv.hidden = true;

        if (window.innerWidth <= 1024) {
          setMobileActivePane($('#cMobileNav', root), $('#cWorkbench', root), 'console');
        }

        try {
          let r;
          if (curLang === 'javascript') {
            r = runJsDsa(code, customStdin);
          } else if (curLang === 'sql' || st.mode === 'sql-lab') {
            r = await runSql(code, curQ);
          } else {
            r = await runPythonDsa(code, customStdin);
          }
          const hasErr = !!r.error;
          let html = '<div class="test-summary ' + (hasErr ? 'none-pass' : 'all-pass') + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<strong>' + (hasErr ? '❌ Custom Run Error' : '✅ Custom Run Succeeded') + '</strong>' +
            '<span style="font-size:11.5px;opacity:0.9">' + (hasErr ? 'Runtime Exception' : 'Standard I/O') + '</span>' +
            '</div></div>';
          html += '<div class="test-results">' +
            '<div class="test-result ' + (hasErr ? 'fail' : 'pass') + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (hasErr ? '❌ Execution Error' : '✅ Standard Output') + '</b></div>' +
            '<div style="margin-top:6px;display:flex;flex-direction:column;gap:8px">' +
            '<div><span style="color:var(--text-muted);font-size:11.5px">Custom Input (stdin):</span><pre class="ccc-pre" style="margin-top:2px;padding:8px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:4px;font-family:var(--font-mono);font-size:12px">' + esc(customStdin || '(empty stdin)') + '</pre></div>' +
            '<div><span style="color:var(--text-muted);font-size:11.5px">' + (hasErr ? 'Error:' : 'Output (stdout):') + '</span><pre class="ccc-pre" style="margin-top:2px;padding:8px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:' + (hasErr ? 'var(--color-error)' : 'var(--text-primary)') + '">' + esc(r.error || r.stdout || '(no output produced)') + '</pre></div>' +
            '</div></div></div>';
          out.innerHTML = html;
        } catch (err) {
          out.innerHTML = '<div class="test-summary none-pass"><strong>Runner Error</strong></div><div class="test-result fail"><code>' + esc(err.message || String(err)) + '</code></div>';
        }
      });
    }

    const langSel = $('#cLangSelect', root);
    if (langSel) {
      langSel.addEventListener('change', function () {
        const curQ = self.visibleList()[st.i];
        const prevLang = this.dataset.prevLang || st.lang || 'python';
        const newLang = this.value;
        this.dataset.prevLang = newLang;
        st.lang = newLang;

        if (curQ && st.cm) {
          const curCode = st.cm.getValue();
          const drafts = pGet('drafts');
          drafts[curQ.id + ':' + prevLang] = curCode;
          drafts[curQ.id] = curCode;
          window.OA_UI.saveProgress();
        }

        if (st.cm) st.cm.setOption('mode', getCodeMirrorModeForLang(newLang));
        const badge = $('#cRuntimeBadge', root);
        if (badge) {
          badge.textContent = getRuntimeBadgeText(newLang, st.mode === 'sql-lab' ? 'sql' : 'dsa');
        }

        if (curQ && st.cm) {
          const drafts = pGet('drafts');
          const savedLang = drafts[curQ.id + ':' + newLang];
          if (savedLang != null) {
            st.cm.setValue(savedLang);
          } else {
            const newCode = getStarterCodeForLang(curQ, newLang);
            st.cm.setValue(newCode || '');
          }
          setTimeout(() => st.cm && st.cm.refresh(), 30);
        }
      });
    }

    if (st.cm && st.cm.toTextArea) {
      try { st.cm.toTextArea(); } catch (e) {}
      st.cm = null;
    }
    const codeEl = $('#cCode', root);
    if (codeEl) {
      st.cm = CodeMirror.fromTextArea(codeEl, { lineNumbers: true, mode: getCodeMirrorModeForLang(st.lang || 'python'), autoCloseBrackets: true, matchBrackets: true, indentUnit: 4 });
      st.cm.on('change', () => {
        const curQ = self.visibleList()[st.i];
        if (!curQ) return;
        const curLang = ($('#cLangSelect', root) && $('#cLangSelect', root).value) || st.lang || 'python';
        const val = st.cm.getValue();
        pGet('drafts')[curQ.id + ':' + curLang] = val;
        pGet('drafts')[curQ.id] = val;
      });
    }
    this.renderList();
    setTimeout(() => { if (st.cm) st.cm.refresh(); }, 50);
  },

  getStarterCodeForLang(q, lang) {
    return getStarterCodeForLang(q, lang);
  },

  visibleList() {
    const st = this.state;
    let list = st.list;
    if (st.diff && st.diff !== 'all') {
      list = list.filter(q => (q.difficulty || 'easy').toLowerCase() === st.diff.toLowerCase());
    }
    if (st.search) {
      const s = st.search.toLowerCase().trim();
      list = list.filter(q =>
        (q.title || '').toLowerCase().includes(s) ||
        (q.prompt || '').toLowerCase().includes(s) ||
        (q.topic || '').toLowerCase().includes(s) ||
        (q.id || '').toLowerCase().includes(s));
    }
    return list;
  },

  renderList() {
    const st = this.state;
    const list = this.visibleList();
    if (st.i >= list.length) st.i = 0;
    const totalCount = st.list.length;
    const solvedCount = st.list.filter(q => pDone(q.id)).length;
    const pct = totalCount ? Math.round((solvedCount / totalCount) * 100) : 0;
    const progFill = $('#cRailProgress');
    if (progFill) progFill.style.width = pct + '%';

    const footInfo = $('#cRailFootInfo');
    if (footInfo) footInfo.textContent = (solvedCount ? solvedCount + ' solved · ' : '') + list.length + (list.length !== totalCount ? ' matching (' + totalCount + ' total)' : ' total');
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
      if (window.innerWidth <= 1024) {
        setMobileActivePane($('#cMobileNav'), $('#cWorkbench'), 'problem');
      }
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
    const langSel = $('#cLangSelect');
    const lang = (langSel && langSel.value) || this.state.lang || 'python';
    const code = getStarterCodeForLang(q, lang);
    if (this.state.cm) this.state.cm.setValue(code || '');
    const drafts = pGet('drafts');
    delete drafts[q.id];
    delete drafts[q.id + ':' + lang];
    window.OA_UI.saveProgress();
    toast('Code reset to ' + lang + ' starter template.');
  },

  render() {
    const st = this.state;
    const list = this.visibleList();
    const q = list[st.i];
    if (!q) { $('#cProblem').innerHTML = '<div class="no-results"><strong>No matches.</strong><p>Try another search.</p></div>'; return; }
    $('#cPos').textContent = (st.i + 1) + ' of ' + list.length;

    const prevBtn = $('#cProbPrevBtn');
    const nextBtn = $('#cProbNextBtn');
    if (prevBtn) prevBtn.disabled = st.i <= 0;
    if (nextBtn) nextBtn.disabled = st.i >= list.length - 1;

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
        const inputStr = (t.args || []).join('\n');
        body += '<div class="problem-example">' +
          '<button type="button" class="btn-copy-example" data-copy-val="' + esc(inputStr) + '" title="Copy example input">📋 Copy</button>' +
          '<strong>Example ' + (k + 1) + (t.name ? ' - ' + esc(t.name) : '') + '</strong>' +
          '<pre><span>Input:</span> ' + esc(inputStr) + '\n<span>Output:</span> ' + esc(t.expected) + '</pre>' +
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
    attachExampleCopyHandlers($('#cProblem'));

    /* ---- 1. Reset console tabs and clear stale outputs ---- */
    $$('#sectionEngine [data-ctab]').forEach(t => t.classList.toggle('active', t.dataset.ctab === 'tests'));
    const tcEl = $('#cTestCases');
    const cipEl = $('#cCustomInputPane');
    const outEl = $('#cOut');
    const prevEl = $('#cPreview');
    const cipText = $('#cCustomInputText');

    if (tcEl) tcEl.hidden = false;
    if (cipEl) cipEl.hidden = true;
    if (outEl) {
      outEl.hidden = true;
      outEl.innerHTML = 'Click "Run ▶" to execute your solution.';
    }
    if (prevEl) { prevEl.hidden = true; prevEl.srcdoc = ''; }
    if (cipText) cipText.value = '';

    // Populate test cases
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
        tcEl.innerHTML = '<div class="console-case-card"><p class="runner-note">No public test cases specified. Click "Run ▶" to test your solution.</p></div>';
      }
    }

    const prevTab = $('#cPreviewTab');
    if (prevTab) prevTab.hidden = !isFrontend;

    /* ---- 2. Contextual language options (DSA: no SQL; SQL: SQL only) ---- */
    const langSel = $('#cLangSelect');
    const isSql = st.mode === 'sql-lab' || q.category === 'sql';
    const catKind = isSql ? 'sql' : 'dsa';
    let prefLang = st.lang || (langSel ? langSel.value : 'python');
    if (isSql) prefLang = 'sql';
    else if (prefLang === 'sql') prefLang = 'python';

    const effectiveLang = populateLanguageSelect(langSel, catKind, prefLang, true);
    st.lang = effectiveLang;

    const runtimeBadge = $('#cRuntimeBadge');
    if (runtimeBadge) {
      if (isFrontend) runtimeBadge.textContent = (q.framework || 'Frontend') + ' preview · sandboxed';
      else runtimeBadge.textContent = getRuntimeBadgeText(effectiveLang, catKind);
    }

    /* ---- 3. Load code for question + effective language ---- */
    if (st.cm) {
      st.cm.setOption('mode', getCodeMirrorModeForLang(effectiveLang));
      const drafts = pGet('drafts');
      const saved = drafts[q.id + ':' + effectiveLang] || drafts[q.id];
      const code = (saved != null) ? saved : getStarterCodeForLang(q, effectiveLang);
      st.cm.setValue(code || '');
      setTimeout(() => st.cm && st.cm.refresh(), 30);
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
    const cip = $('#cCustomInputPane'); if (cip) cip.hidden = true;
    const out = $('#cOut'); if (out) { out.hidden = false; out.innerHTML = '<p class="runner-note">Running tests...</p>'; }
    const pv = $('#cPreview'); if (pv) pv.hidden = true;

    if (window.innerWidth <= 1024) {
      setMobileActivePane($('#cMobileNav'), $('#cWorkbench'), 'console');
    }

    function renderResults(results, kind) {
      const pass = results.filter(r => r.pass).length;
      const all = pass === results.length && results.length > 0;
      let html = '<div class="test-summary ' + (all ? 'all-pass' : (pass ? 'some-pass' : 'none-pass')) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<strong>' + pass + ' / ' + results.length + ' ' + kind + ' passed</strong>' +
        '<span style="font-size:11.5px;opacity:0.9">' + (all ? 'Solved' : 'Review failing cases') + '</span>' +
        '</div></div>';
      html += '<div class="test-results">' + results.map((r, k) => {
        const hasDiff = !r.pass && !r.error && r.actual != null && r.expected != null;
        return '<div class="test-result ' + (r.pass ? 'pass' : 'fail') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (r.pass ? '✅ Pass' : '❌ Fail') + ' - ' + esc(r.name || ('Case ' + (k + 1))) + '</b></div>' +
          '<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">' +
          (r.input ? '<code><span style="color:var(--text-muted)">Input:</span> ' + esc(r.input.replace(/\n/g, ' ↵ ')) + '</code>' : '') +
          '<code><span style="color:var(--text-muted)">Expected:</span> ' + esc(r.expected) + '</code>' +
          '<code><span style="color:var(--text-muted)">Actual:</span> ' + esc(r.error ? 'Runtime error: ' + r.error : (r.actual != null ? r.actual : 'None')) + '</code>' +
          (hasDiff ? buildVisualDiff(r.expected, r.actual) : '') +
          '</div></div>';
      }).join('') + '</div>';

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

  renderAccentureList(all, skipQuestionRender) {
    const st = this.state;
    st.accDiff = st.accDiff || 'all';
    st.accSearch = st.accSearch || '';

    const catAll = all.filter(q => q.category === st.cat);
    let list = catAll;
    if (st.accDiff && st.accDiff !== 'all') {
      list = list.filter(q => (q.difficulty || 'easy').toLowerCase() === st.accDiff.toLowerCase());
    }
    if (st.accSearch) {
      const qLower = st.accSearch.toLowerCase().trim();
      list = list.filter(q =>
        (q.title || '').toLowerCase().includes(qLower) ||
        (q.prompt || '').toLowerCase().includes(qLower) ||
        (q.topic || '').toLowerCase().includes(qLower) ||
        (q.id || '').toLowerCase().includes(qLower)
      );
    }

    const catSolved = catAll.filter(q => pDone(q.id)).length;
    const pct = catAll.length ? Math.round((catSolved / catAll.length) * 100) : 0;
    const progFill = $('#codingRailProgress');
    if (progFill) progFill.style.width = pct + '%';

    $('#questionSetTitle').textContent = st.cat.toUpperCase();
    const pos = $('#codingStripPosition');
    if (pos) pos.textContent = (catSolved ? catSolved + ' solved · ' : '') + list.length + (list.length !== catAll.length ? ' matching (' + catAll.length + ' total)' : ' total');

    // Wire search input once
    const searchInput = $('#codingRailSearch');
    if (searchInput && !searchInput._wired) {
      searchInput._wired = true;
      searchInput.addEventListener('input', () => {
        st.accSearch = searchInput.value;
        st.accI = 0;
        Coding.renderAccentureList(all);
      });
    }

    // Wire diff filter pills once
    $$('#codingView [data-acc-diff]').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.accDiff === st.accDiff);
      if (!pill._wired) {
        pill._wired = true;
        pill.addEventListener('click', () => {
          st.accDiff = pill.dataset.accDiff;
          $$('#codingView [data-acc-diff]').forEach(p => p.classList.toggle('active', p === pill));
          st.accI = 0;
          Coding.renderAccentureList(all);
        });
      }
    });

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
      self.renderAccentureList(all, true);
      if (window.innerWidth <= 1024) {
        setMobileActivePane($('#accMobileNav'), $('#accWorkbench'), 'problem');
      }
      const station = $('.coding-workbench');
      if (station) station.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    const activeBtn = $('#codingQuestionList .active');
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (list.length) {
      st.accList = list;
      if (!st.accList.includes(st.accQ) || st.accI >= list.length) st.accI = 0;
      if (!skipQuestionRender) this.renderAccentureQuestion();
    }
  },

  renderAccentureQuestion() {
    const st = this.state, q = st.accList[st.accI];
    if (!q) return;
    st.accQ = q;

    const isFrontend = st.cat === 'frontend';

    /* ---- 1. Reset console state & tabs to Test Cases ---- */
    $$('#codingView [data-acctab]').forEach(t => t.classList.toggle('active', t.dataset.acctab === 'tests'));
    const tcEl    = $('#accTestCases');
    const cipEl   = $('#accCustomInputPane');
    const outEl   = $('#runOutput');
    const prevEl  = $('#frontendPreview');
    const tgtEl   = $('#targetPreview');
    const cipText = $('#accCustomInputText');

    if (tcEl)    tcEl.hidden   = false;
    if (cipEl)   cipEl.hidden  = true;
    if (outEl) {
      outEl.hidden = true;
      outEl.innerHTML = isFrontend
        ? 'Click "Run Preview ▶" to execute your code and get AI evaluation.'
        : 'Click "Run Solution ▶" to execute your code.';
    }
    if (prevEl) { prevEl.hidden = true; prevEl.srcdoc = ''; }
    if (tgtEl)  { tgtEl.hidden  = true; }
    if (cipText) cipText.value = '';

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
        st.accCm.on('change', () => {
          const curQ = st.accQ;
          if (!curQ) return;
          const langSel = $('#editorLanguageSelect');
          const curLang = (langSel && langSel.value) || (st.cat === 'sql' ? 'sql' : 'python');
          const val = st.accCm.getValue();
          pGet('drafts')[curQ.id + ':' + curLang] = val;
          pGet('drafts')[curQ.id] = val;
        });
      }
    }

    /* ---- Highlight active question in rail ---- */
    $$('#codingQuestionList .cq-rail-item').forEach((b, idx) => b.classList.toggle('active', idx === st.accI));
    $('#problemPosition').textContent = (st.accI + 1) + ' of ' + st.accList.length;
    $('#codingCategoryLabel').textContent = 'Accenture ' + st.cat.toUpperCase();

    const prevBtn = $('#probPrevBtn');
    const nextBtn = $('#probNextBtn');
    if (prevBtn) prevBtn.disabled = st.accI <= 0;
    if (nextBtn) nextBtn.disabled = st.accI >= st.accList.length - 1;

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
          const inputStr = (t.args || []).join('\n');
          body += '<div class="problem-example">' +
            '<button type="button" class="btn-copy-example" data-copy-val="' + esc(inputStr) + '" title="Copy example input">📋 Copy</button>' +
            '<strong>Example ' + (k + 1) + '</strong>' +
            '<pre><span>Input:</span> ' + esc(inputStr) + '\n<span>Output:</span> ' + esc(t.expected) + '</pre></div>';
        });
        body += '</div>';
      }
    }

    $('#codingProblem').innerHTML = body;
    attachExampleCopyHandlers($('#codingProblem'));

    /* ---- Console lower pane ---- */
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

    /* ---- Single-file editor content (DSA / SQL) ---- */
    if (!isFrontend && st.accCm) {
      const langSel = $('#editorLanguageSelect');
      let preferredLang = (langSel && (langSel.dataset.prevLang || langSel.value)) || 'python';
      if (st.cat === 'sql') preferredLang = 'sql';
      else if (preferredLang === 'sql') preferredLang = 'python';

      const effectiveLang = populateLanguageSelect(langSel, st.cat, preferredLang, false);

      if (runtimeBadge) runtimeBadge.textContent = getRuntimeBadgeText(effectiveLang, st.cat);

      st.accCm.setOption('mode', getCodeMirrorModeForLang(effectiveLang));

      const drafts = pGet('drafts');
      const savedCode = drafts[q.id + ':' + effectiveLang] || drafts[q.id];
      const startCode = getStarterCodeForLang(q, effectiveLang);

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
      const tc  = $('#accTestCases');       if (tc)  tc.hidden  = (name !== 'tests');
      const cip = $('#accCustomInputPane'); if (cip) cip.hidden = (name !== 'custom');
      const out = $('#runOutput');          if (out) out.hidden = (name !== 'result');
      const pv  = $('#frontendPreview');    if (pv)  pv.hidden  = (name !== 'preview');
      const tpv = $('#targetPreview');      if (tpv) tpv.hidden = (name !== 'target');
      if (window.innerWidth <= 1024 && (name === 'result' || name === 'preview' || name === 'target')) {
        setMobileActivePane($('#accMobileNav'), $('#accWorkbench'), 'console');
      }
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
    const langSel = $('#editorLanguageSelect');
    const lang = (langSel && langSel.value) || (st.cat === 'sql' ? 'sql' : 'python');
    pGet('drafts')[q.id] = code;
    pGet('drafts')[q.id + ':' + lang] = code;
    window.OA_UI.saveProgress();

    switchAccTab('result');
    if (window.innerWidth <= 1024) {
      setMobileActivePane($('#accMobileNav'), $('#accWorkbench'), 'console');
    }
    const out = $('#runOutput');
    if (out) { out.hidden = false; out.innerHTML = '<div class="fe-loading"><div class="fe-loading-spinner"></div><p>Executing test cases…</p></div>'; }
    const pv = $('#frontendPreview'); if (pv) pv.hidden = true;

    try {
      if (st.cat === 'dsa') {
        const tests = (q.tests || []).slice(0, 10);
        let results = [];
        if (lang === 'java' || lang === 'cpp') {
          out.innerHTML = '<div class="fe-loading"><div class="fe-loading-spinner"></div><p>Evaluating ' + esc(lang.toUpperCase()) + ' solution via Gemini AI OA Judge…</p></div>';
          try {
            const sim = await window.OA_AI.llmCodeRunner(q.title || 'Coding Problem', q.prompt || '', lang, code, tests);
            results = (sim && sim.results) || [];
          } catch (simErr) {
            results = tests.map((t, k) => ({
              name: t.name || ('Case ' + (k + 1)),
              pass: false,
              input: (t.args || []).join('\n'),
              expected: t.expected,
              actual: 'Evaluation unavailable',
              error: simErr.message
            }));
          }
        } else if (lang === 'javascript') {
          for (const t of tests) {
            const stdinText = (t.args || []).join('\n');
            const r = runJsDsa(code, stdinText);
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
        } else {
          for (const t of tests) {
            const stdinText = (t.args || []).join('\n');
            const r = await runPythonDsa(code, stdinText);
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
        }
        renderDsaResults(results, out, q, code, lang, () => {
          window.OA_UI.recordAnswer(q.id, 0, true);
          toast('🎉 All tests passed — solved!');
          Coding.renderAccentureList(window.OA_BANKS.banks['accenture/coding'] || [], true);
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
      const d = pGet('drafts');
      delete d[q.id + ':html']; delete d[q.id + ':css']; delete d[q.id + ':js'];
      window.OA_UI.saveProgress();
      window.OA_UI.toast('Code reset to starter.');
    } else if (st.accCm && q) {
      const langSel = $('#editorLanguageSelect');
      const curLang = (langSel && langSel.value) || (st.cat === 'sql' ? 'sql' : 'python');
      const d = pGet('drafts');
      delete d[q.id];
      delete d[q.id + ':' + curLang];
      window.OA_UI.saveProgress();
      const code = getStarterCodeForLang(q, curLang);
      st.accCm.setValue(code || '');
      window.OA_UI.toast('Code reset to ' + curLang + ' starter template.');
    }
  });

  /* ---- Mobile segmented navigation for Accenture studio (< 1024px) ---- */
  const accMNav = document.getElementById('accMobileNav');
  const accWb = document.getElementById('accWorkbench');
  if (accMNav && accWb) {
    setupWorkbenchMobileNav(accMNav, accWb);
  }

  /* ---- Editor tools group for Accenture studio (Font, Wrap, Copy, Zen) ---- */
  const accSheet = document.getElementById('accEditorSheet');
  if (accSheet) {
    setupEditorToolGroup(
      accSheet,
      () => {
        const st = window.OA_CODING.Coding.state;
        return st.cat === 'frontend' ? st['cm_' + (st.activeFeTab || 'html')] : st.accCm;
      },
      () => {
        const st = window.OA_CODING.Coding.state;
        if (st.cat === 'frontend') {
          const cm = st['cm_' + (st.activeFeTab || 'html')];
          return cm ? cm.getValue() : '';
        }
        return st.accCm ? st.accCm.getValue() : '';
      }
    );
  }

  /* ---- Prev / Next problem buttons for Accenture studio ---- */
  const prevBtn = document.getElementById('probPrevBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const st = window.OA_CODING.Coding.state;
      if (st.accI > 0) {
        st.accI--;
        window.OA_CODING.Coding.renderAccentureQuestion();
        window.OA_CODING.Coding.renderAccentureList(window.OA_BANKS.banks['accenture/coding'] || [], true);
      }
    });
  }
  const nextBtn = document.getElementById('probNextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const st = window.OA_CODING.Coding.state;
      if (st.accList && st.accI < st.accList.length - 1) {
        st.accI++;
        window.OA_CODING.Coding.renderAccentureQuestion();
        window.OA_CODING.Coding.renderAccentureList(window.OA_BANKS.banks['accenture/coding'] || [], true);
      }
    });
  }

  /* ---- Custom test runner button for Accenture studio ---- */
  const btnRunAccCustom = document.getElementById('btnRunAccCustom');
  if (btnRunAccCustom) {
    btnRunAccCustom.addEventListener('click', async () => {
      const st = window.OA_CODING.Coding.state;
      const q = st.accQ;
      if (!q) return;
      const customStdin = ($('#accCustomInputText') && $('#accCustomInputText').value) || '';
      const code = st.accCm ? st.accCm.getValue() : '';
      const langSel = $('#editorLanguageSelect');
      const lang = (langSel && langSel.value) || (q.language ? q.language.toLowerCase() : 'javascript');

      $$('#codingView [data-acctab]').forEach(t => t.classList.toggle('active', t.dataset.acctab === 'result'));
      const tc  = $('#accTestCases');       if (tc)  tc.hidden  = true;
      const cip = $('#accCustomInputPane'); if (cip) cip.hidden = true;
      const out = $('#runOutput');          if (out) { out.hidden = false; out.innerHTML = '<div class="fe-loading"><div class="fe-loading-spinner"></div><p>Executing with custom input…</p></div>'; }
      const pv  = $('#frontendPreview');    if (pv)  pv.hidden  = true;
      const tpv = $('#targetPreview');      if (tpv) tpv.hidden = true;

      if (window.innerWidth <= 1024) {
        setMobileActivePane(document.getElementById('accMobileNav'), document.getElementById('accWorkbench'), 'console');
      }

      try {
        let r;
        if (lang === 'java' || lang === 'cpp') {
          try {
            const sim = await window.OA_AI.llmCodeRunner(q.title || 'Coding Problem', q.prompt || '', lang, code, [{ name: 'Custom Input', args: [customStdin], expected: '' }]);
            const res0 = (sim && sim.results && sim.results[0]) || {};
            r = { stdout: res0.actual || '', error: res0.error || null };
          } catch (e) {
            r = { stdout: '', error: e.message || String(e) };
          }
        } else if (lang === 'javascript') {
          r = runJsDsa(code, customStdin);
        } else if (st.cat === 'sql') {
          r = await runSql(code, q);
        } else {
          r = await runPythonDsa(code, customStdin);
        }
        const hasErr = !!r.error;
        let html = '<div class="test-summary ' + (hasErr ? 'none-pass' : 'all-pass') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<strong>' + (hasErr ? '❌ Custom Run Error' : '✅ Custom Run Succeeded') + '</strong>' +
          '<span style="font-size:11.5px;opacity:0.9">' + (hasErr ? 'Runtime Exception' : 'Standard I/O') + '</span>' +
          '</div></div>';
        html += '<div class="test-results">' +
          '<div class="test-result ' + (hasErr ? 'fail' : 'pass') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (hasErr ? '❌ Execution Error' : '✅ Standard Output') + '</b></div>' +
          '<div style="margin-top:6px;display:flex;flex-direction:column;gap:8px">' +
          '<div><span style="color:var(--text-muted);font-size:11.5px">Custom Input (stdin):</span><pre class="ccc-pre" style="margin-top:2px;padding:8px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:4px;font-family:var(--font-mono);font-size:12px">' + esc(customStdin || '(empty stdin)') + '</pre></div>' +
          '<div><span style="color:var(--text-muted);font-size:11.5px">' + (hasErr ? 'Error:' : 'Output (stdout):') + '</span><pre class="ccc-pre" style="margin-top:2px;padding:8px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:' + (hasErr ? 'var(--color-error)' : 'var(--text-primary)') + '">' + esc(r.error || r.stdout || '(no output produced)') + '</pre></div>' +
          '</div></div></div>';
        out.innerHTML = html;
      } catch (err) {
        out.innerHTML = '<div class="test-summary none-pass"><strong>Runner Error</strong></div><div class="test-result fail"><code>' + esc(err.message || String(err)) + '</code></div>';
      }
    });
  }

  /* ---- Global keyboard shortcuts ---- */
  document.addEventListener('keydown', (e) => {
    // 1. Ctrl+Enter / Cmd+Enter: Run
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

    // 2. Ctrl+/ or Cmd+/: Focus problem rail search
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      const codingView = document.getElementById('codingView');
      if (codingView && !codingView.hidden) {
        const s = document.getElementById('codingRailSearch');
        if (s) { e.preventDefault(); s.focus(); s.select(); return; }
      }
      const companySectionView = document.getElementById('companySectionView');
      if (companySectionView && !companySectionView.hidden) {
        const s = document.getElementById('cRailSearch');
        if (s) { e.preventDefault(); s.focus(); s.select(); return; }
      }
    }

    // 3. Alt+ArrowLeft / Alt+ArrowRight: Cycle problems
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const codingView = document.getElementById('codingView');
      if (codingView && !codingView.hidden) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') {
          const b = document.getElementById('probPrevBtn');
          if (b && !b.disabled) b.click();
        } else {
          const b = document.getElementById('probNextBtn');
          if (b && !b.disabled) b.click();
        }
        return;
      }
      const companySectionView = document.getElementById('companySectionView');
      if (companySectionView && !companySectionView.hidden) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') {
          const b = document.getElementById('cProbPrevBtn');
          if (b && !b.disabled) b.click();
        } else {
          const b = document.getElementById('cProbNextBtn');
          if (b && !b.disabled) b.click();
        }
        return;
      }
    }

    // 4. Escape: Exit Zen fullscreen mode if active
    if (e.key === 'Escape') {
      const zenSheets = document.querySelectorAll('.editor-sheet.zen-mode');
      if (zenSheets.length) {
        zenSheets.forEach(sheet => {
          sheet.classList.remove('zen-mode');
          const zenBtn = sheet.querySelector('.btn-editor-tool[id$="ZenToggle"]');
          if (zenBtn) {
            zenBtn.classList.remove('active');
            zenBtn.textContent = '⛶';
            zenBtn.title = 'Zen fullscreen mode';
          }
        });
        toast('Exited Zen mode');
        const st = window.OA_CODING && window.OA_CODING.Coding && window.OA_CODING.Coding.state;
        if (st) {
          setTimeout(() => {
            st.accCm && st.accCm.refresh();
            st.cm_html && st.cm_html.refresh();
            st.cm_css && st.cm_css.refresh();
            st.cm_js && st.cm_js.refresh();
            st.cm && st.cm.refresh();
          }, 50);
        }
      }
    }
  });

  /* ---- Accenture console tabs (including tests, custom, result, preview, target) ---- */
  $$('#codingView [data-acctab]').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#codingView [data-acctab]').forEach(t => t.classList.toggle('active', t === tab));
      const target = tab.dataset.acctab;
      const tc  = $('#accTestCases');
      const cip = $('#accCustomInputPane');
      const out = $('#runOutput');
      const pv  = $('#frontendPreview');
      const tpv = $('#targetPreview');
      if (tc)  tc.hidden  = (target !== 'tests');
      if (cip) cip.hidden = (target !== 'custom');
      if (out) out.hidden = (target !== 'result');
      if (pv)  pv.hidden  = (target !== 'preview');
      if (tpv) tpv.hidden = (target !== 'target');
    });
  });

  const sel = document.getElementById('editorLanguageSelect');
  if (sel) {
    sel.addEventListener('change', function () {
      const st = window.OA_CODING.Coding.state;
      const q = st.accQ;
      if (!q || !st.accCm) return;

      const prevLang = this.dataset.prevLang || (st.cat === 'sql' ? 'sql' : 'python');
      const newLang = this.value;
      this.dataset.prevLang = newLang;

      // 1. Save current editor content to draft for prevLang
      const curCode = st.accCm.getValue();
      const drafts = pGet('drafts');
      drafts[q.id + ':' + prevLang] = curCode;
      drafts[q.id] = curCode;
      window.OA_UI.saveProgress();

      // 2. Set CodeMirror mode
      st.accCm.setOption('mode', getCodeMirrorModeForLang(newLang));

      // 3. Update runtime badge
      const badge = document.getElementById('accRuntimeBadge');
      if (badge) badge.textContent = getRuntimeBadgeText(newLang, st.cat);

      // 4. Retrieve draft for newLang, or generate starter code for newLang
      const savedNewLang = drafts[q.id + ':' + newLang];
      const newCode = (savedNewLang != null) ? savedNewLang : getStarterCodeForLang(q, newLang);
      st.accCm.setValue(newCode || '');
      setTimeout(() => st.accCm && st.accCm.refresh(), 30);
    });
  }

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