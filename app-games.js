/* OA Practice Desk - puzzle games: Key Maze, Arithmetic Order, Matrix Flow */
(function () {
'use strict';
const { toast, esc, $, $$ } = window.OA_UI;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const SCORE_KEY = 'oa-scores-v1';
let scores = {};
try { scores = JSON.parse(localStorage.getItem(SCORE_KEY) || '{}'); } catch (e) {}
function saveScore(game, level, score) {
  const k = game + '/' + level;
  if (!scores[k] || score > scores[k]) { scores[k] = score; try { localStorage.setItem(SCORE_KEY, JSON.stringify(scores)); } catch (e) {} }
}

const Games = {
  current: 'maze', level: 'medium',
  open(game) {
    this.current = game;
    $('#gameTitle').textContent = { maze: 'Key Maze', math: 'Arithmetic Order', path: 'Matrix Flow Puzzle' }[game];
    $('#gameNumber').textContent = { maze: '01 / 03', math: '02 / 03', path: '03 / 03' }[game];
    $$('#difficultyControl button').forEach(b => b.classList.toggle('active', b.dataset.level === this.level));
    this.start();
    window.OA_UI.show('gameView');
  },
  start() {
    const seed = Date.now() & 0xffff;
    if (this.current === 'maze') this.maze(seed);
    else if (this.current === 'math') this.math(seed);
    else this.path(seed);
  },

  /* ---- Key Maze: grid, collect all keys then reach exit ---- */
  maze(seed) {
    const r = rng(seed);
    const size = { easy: 5, medium: 8, hard: 12 }[this.level];
    const keyCount = { easy: 1, medium: 3, hard: 5 }[this.level];
    const walls = new Set();
    const cells = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push({ x, y });
    // random walls (not on start or exit)
    const start = { x: 0, y: 0 }, exit = { x: size - 1, y: size - 1 };
    const nWalls = Math.floor(size * size * ({ easy: .1, medium: .2, hard: .28 }[this.level]));
    for (let i = 0; i < nWalls; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      if ((x !== start.x || y !== start.y) && (x !== exit.x || y !== exit.y)) walls.add(x + ',' + y);
    }
    const keys = [];
    while (keys.length < keyCount) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      const k = x + ',' + y;
      if (!walls.has(k) && !(x === start.x && y === start.y) && !(x === exit.x && y === exit.y) && !keys.some(q => q.x === x && q.y === y)) keys.push({ x, y });
    }
    let player = { ...start }, collected = 0, moves = 0, won = false;
    const mount = $('#gameMount');
    renderMaze();

    function renderMaze() {
      let html = '<div class="game-hud"><span>Keys <b id="mzKeys">' + collected + '/' + keyCount + '</b></span><span>Moves <b id="mzMoves">' + moves + '</b></span><span>Walls <b>' + walls.size + '</b></span><button class="btn" id="mzNew">New maze</button></div>';
      html += '<div class="game-grid maze-grid" style="grid-template-columns:repeat(' + size + ', minmax(0, 1fr)); max-width:min(100%, ' + (size * 42) + 'px)">';
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const k = x + ',' + y;
        let cls = 'cell-btn';
        if (walls.has(k)) cls += ' dim';
        if (keys.some(q => q.x === x && q.y === y) && !collectedKeys().some(q => q.x === x && q.y === y)) cls += ' key';
        if (x === exit.x && y === exit.y) cls += ' exit';
        if (player.x === x && player.y === y) cls += ' player';
        html += '<div class="' + cls + '">' + (cls.includes('key') ? 'K' : cls.includes('exit') ? 'E' : cls.includes('player') ? '@' : walls.has(k) ? '#' : '') + '</div>';
      }
      html += '</div>';
      html += '<div class="maze-touch-controls" id="mazeTouchControls" aria-label="On-screen directional controls">' +
        '<button type="button" class="maze-touch-btn" data-m-move="0,-1" aria-label="Up">&#9650;</button>' +
        '<div class="maze-touch-row">' +
        '<button type="button" class="maze-touch-btn" data-m-move="-1,0" aria-label="Left">&#9664;</button>' +
        '<button type="button" class="maze-touch-btn" data-m-move="0,1" aria-label="Down">&#9660;</button>' +
        '<button type="button" class="maze-touch-btn" data-m-move="1,0" aria-label="Right">&#9654;</button>' +
        '</div></div>';
      html += '<p class="status-line">Use D-pad or Arrow keys / WASD to move. Collect all keys, then reach exit &#128682;.</p>';
      mount.innerHTML = html;
      $('#mzNew').addEventListener('click', () => Games.maze(Date.now() & 0xffff));
      $$('[data-m-move]', mount).forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const [dx, dy] = btn.dataset.mMove.split(',').map(Number);
          move(dx, dy);
        });
      });
    }
    function collectedKeys() { return keys.slice(0, 0); }
    function move(dx, dy) {
      if (won) return;
      const nx = player.x + dx, ny = player.y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
      if (walls.has(nx + ',' + ny)) return;
      player = { x: nx, y: ny }; moves++;
      const ki = keys.findIndex(q => q.x === nx && q.y === ny);
      if (ki >= 0) { keys.splice(ki, 1); collected++; }
      if (!keys.length && nx === exit.x && ny === exit.y) {
        won = true;
        const score = Math.max(10, size * 20 - moves);
        saveScore('maze', Games.level, score);
        toast('Maze cleared! Score ' + score);
      }
      renderMaze();
    }
    this._keyHandler = (e) => {
      const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      const m = map[e.key];
      if (m && !$('#gameView').hidden) { e.preventDefault(); move(m[0], m[1]); }
    };
  },

  /* ---- Arithmetic Order: solve mental math, sort ascending ---- */
  math(seed) {
    const r = rng(seed);
    const nVals = { easy: 3, medium: 4, hard: 5 }[this.level];
    const secs = { easy: 25, medium: 18, hard: 13 }[this.level];
    const ops = ['+', '-', '*', '%'];
    const vals = [];
    for (let i = 0; i < nVals; i++) {
      let s;
      do {
        const a = 2 + Math.floor(r() * ({ easy: 9, medium: 12, hard: 19 }[this.level]));
        const b = 1 + Math.floor(r() * 9);
        const op = ops[Math.floor(r() * ops.length)];
        s = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : (a * b) % 10 + b;
      } while (s === undefined);
      vals.push({ expr: Math.floor(r() * 100) + ' ' + ['+', '-', '*', '/'][Math.floor(r() * 4)] + ' ' + (1 + Math.floor(r() * 9)), val: 0 });
    }
    // build real expressions
    vals.length = 0;
    for (let i = 0; i < nVals; i++) {
      const a = 2 + Math.floor(r() * 12), b = 1 + Math.floor(r() * 9);
      const op = ['+', '-', '*', '/'][Math.floor(r() * 4)];
      const val = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : Math.floor(a / b);
      vals.push({ expr: a + ' ' + op + ' ' + b, val });
    }
    const mount = $('#gameMount');
    let remaining = secs, placed = [], timer = null, started = false;

    render();
    function render() {
      let html = '<div class="game-hud"><span>Time <b id="mtTime">' + remaining + 's</b></span><span>Placed <b id="mtPlaced">' + placed.length + '/' + nVals + '</b></span><button class="btn" id="mtNew">New round</button></div>' +
        '<div class="timer-bar"><i style="width:' + (remaining / secs * 100) + '%"></i></div>' +
        '<div class="math-slot" id="mtSlot">' + (placed.map(p => '<span class="math-card selected"><b>' + p.expr + '</b><small>= ' + p.val + '</small></span>').join('')) + '</div>' +
        '<div class="game-grid math-grid" style="grid-template-columns:repeat(auto-fit, minmax(76px, 1fr)); max-width:min(100%, ' + (nVals * 110) + 'px)">' +
        vals.filter(v => !placed.includes(v)).map((v, i) => '<div class="math-card" tabindex="0" data-mi="' + vals.indexOf(v) + '"><b>' + v.expr + '</b></div>').join('') +
        '</div><p class="status-line">Click the cards in ascending order (lowest value first). Wrong pick = penalty.</p>';
      mount.innerHTML = html;
      $('#mtNew').addEventListener('click', () => Games.math(Date.now() & 0xffff));
      $$('.math-card[data-mi]', mount).forEach(c => c.addEventListener('click', () => {
        if (!started) { started = true; startTimer(); }
        const v = vals[+c.dataset.mi];
        const smallest = Math.min.apply(null, vals.filter(x => !placed.includes(x)).map(x => x.val));
        if (v.val === smallest) {
          placed.push(v); render();
          if (placed.length === nVals) win();
        } else { remaining = Math.max(1, remaining - 3); toast('Too high - pick a smaller value (-3s)'); render(); }
      }));
    }
    function startTimer() {
      timer = setInterval(() => {
        remaining--; const el = $('#mtTime'); if (el) { el.textContent = remaining + 's'; const bar = $('.timer-bar i'); if (bar) bar.style.width = (remaining / secs * 100) + '%'; }
        if (remaining <= 0) { clearInterval(timer); toast('Time up! Score 0'); render(); started = false; }
      }, 1000);
    }
    function win() {
      clearInterval(timer);
      const score = remaining * 10 + nVals * 5;
      saveScore('math', Games.level, score);
      toast('Sorted! Score ' + score);
    }
  },

  /* ---- Matrix Flow: rotate pipe tiles to connect start->finish ---- */
  path(seed) {
    const r = rng(seed);
    const size = { easy: 3, medium: 5, hard: 7 }[this.level];
    // tile types: 0=empty,1=straight,2=elbow,3=T,4=cross (directions as bit flags N=1,E=2,S=4,W=8)
    const DIRS = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
    function rot(bits) { return ((bits << 1) | (bits >> 3)) & 15; }
    // build a guaranteed path from (0,0) to (size-1,size-1) walking right/down
    const pathCells = [];
    let x = 0, y = 0; pathCells.push({ x, y });
    while (x < size - 1 || y < size - 1) {
      if (x === size - 1) y++;
      else if (y === size - 1) x++;
      else if (r() < .5) x++; else y++;
      pathCells.push({ x, y });
    }
    // assign connection bits along the path
    const grid = [];
    for (let yy = 0; yy < size; yy++) { grid.push(new Array(size).fill(0)); }
    for (let i = 0; i < pathCells.length; i++) {
      const c = pathCells[i];
      let bits = 0;
      const prev = pathCells[i - 1], next = pathCells[i + 1];
      if (prev) bits |= prev.x < c.x ? 8 : prev.x > c.x ? 2 : prev.y < c.y ? 1 : 4;
      if (next) bits |= next.x > c.x ? 2 : next.x < c.x ? 8 : next.y > c.y ? 4 : 1;
      grid[c.y][c.x] = bits || 2;
    }
    // scatter decoys
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
      if (!grid[yy][xx] && r() < .4) grid[yy][xx] = [3, 6, 12, 9, 5, 10][Math.floor(r() * 6)];
    }
    // random rotations
    const rotations = [];
    for (let yy = 0; yy < size; yy++) { rotations.push(new Array(size).fill(0)); }
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
      if (grid[yy][xx]) { const n = Math.floor(r() * 4); rotations[yy][xx] = n; for (let i = 0; i < n; i++) grid[yy][xx] = rot(grid[yy][xx]); }
    }
    const start = { x: 0, y: 0 }, goal = { x: size - 1, y: size - 1 };
    let clicks = 0;
    const mount = $('#gameMount');
    render();

    function svgFor(bits) {
      const cx = 32, lines = [];
      if (bits & 1) lines.push('M32 0 L32 32');   // N
      if (bits & 2) lines.push('M32 32 L64 32');  // E
      if (bits & 4) lines.push('M32 32 L32 64');  // S
      if (bits & 8) lines.push('M0 32 L32 32');   // W
      return '<svg viewBox="0 0 64 64"><path d="' + lines.join(' ') + '"/></svg>';
    }
    function render() {
      const connected = flood();
      let html = '<div class="game-hud"><span>Clicks <b>' + clicks + '</b></span><span>Flow <b>' + (connected ? 'CONNECTED' : 'open') + '</b></span><button class="btn" id="pfNew">New board</button></div>' +
        '<div class="game-grid path-grid" style="grid-template-columns:repeat(' + size + ', minmax(0, 1fr)); max-width:min(100%, ' + (size * 56) + 'px);">';
      for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
        const bits = grid[yy][xx];
        const on = bits && reachable()[yy * size + xx];
        html += '<div class="path-tile' + (bits ? '' : ' locked') + '" data-pt="' + xx + ',' + yy + '">' + (bits ? svgFor(bits) : '') + '</div>';
      }
      html += '</div><p class="status-line">Click tiles to rotate. Connect the top-left to the bottom-right corner.</p>';
      mount.innerHTML = html;
      $('#pfNew').addEventListener('click', () => Games.path(Date.now() & 0xffff));
      $$('.path-tile[data-pt]', mount).forEach(t => t.addEventListener('click', () => {
        const [px, py] = t.dataset.pt.split(',').map(Number);
        if (grid[py][px]) { grid[py][px] = rot(grid[py][px]); clicks++; render(); }
      }));
    }
    function reachable() {
      // from start, follow matching connections both directions
      const seen = new Uint8Array(size * size);
      const q = [[start.x, start.y]];
      while (q.length) {
        const [cx, cy] = q.pop();
        const idx = cy * size + cx;
        if (seen[idx]) continue;
        seen[idx] = 1;
        const bits = grid[cy][cx];
        if (!bits) continue;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
          const outBit = dy === -1 ? 1 : dx === 1 ? 2 : dy === 1 ? 4 : 8;      // from c to n
          const inBit = dy === -1 ? 4 : dx === 1 ? 8 : dy === 1 ? 1 : 2;       // from n to c
          if ((bits & outBit) && (grid[ny][nx] & inBit)) q.push([nx, ny]);
        });
      }
      return seen;
    }
    function flood() {
      const seen = reachable();
      return !!seen[goal.y * size + goal.x];
    }
    // check win on each render
    const origRender = render;
    render = function () {
      origRender();
      if (flood()) {
        const score = Math.max(20, 200 - clicks * 4);
        saveScore('path', Games.level, score);
        toast('Flow connected! Score ' + score);
      }
    };
  }
};

document.addEventListener('DOMContentLoaded', () => {
  $$('#difficultyControl button').forEach(b => b.addEventListener('click', () => {
    Games.level = b.dataset.level;
    $$('#difficultyControl button').forEach(x => x.classList.toggle('active', x === b));
    Games.start();
  }));
  document.addEventListener('keydown', (e) => { if (Games._keyHandler) Games._keyHandler(e); });
});

window.OA_GAMES = Games;
})();