// Bot-only simulation with a virtual clock to stress-test the engine.
const { Game } = require('../src/game.js');
const T = require('../src/tiles.js');

function runGame(seed) {
  let now = 0, seq = 0;
  const q = [];
  const schedule = (fn, ms) => { const h = { at: now + ms, seq: seq++, fn, dead: false }; q.push(h); return h; };
  const cancel = (h) => { h.dead = true; };
  const g = new Game([0, 1, 2, 3].map((i) => ({ name: 'Bot' + i, bot: true })), { schedule, cancel, onUpdate: check });
  let steps = 0;
  function check(game) {
    // invariant: total tiles = 144
    let n = game.wall.length;
    for (let s = 0; s < 4; s++) n += game.hands[s].length + game.flowers[s].length + game.discards[s].length + game.meldTiles(s).length;
    if (game.phase === 'rob') n += 1; // tile being promoted is in limbo
    if (n !== 144) throw new Error(`tile count ${n} phase ${game.phase}`);
    for (let s = 0; s < 4; s++) {
      const eq = game.hands[s].length + 3 * game.melds[s].length;
      const expect = game.phase === 'turn' && game.current === s ? 14 : 13;
      if (game.phase !== 'ended' && game.phase !== 'rob' && eq !== expect) throw new Error(`seat ${s} has ${eq} tiles (expect ${expect}) phase ${game.phase}`);
    }
    for (let s = 0; s < 4; s++) game.viewFor(s); // must not throw
  }
  g.start();
  while (!g.gameOver) {
    q.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const h = q.shift();
    if (!h) throw new Error('stalled in phase ' + g.phase);
    if (h.dead) continue;
    now = h.at;
    h.fn();
    if (++steps > 200000) throw new Error('too many steps');
  }
  return g;
}

const stats = { wins: 0, draws: 0, self: 0, fans: {}, maxTotal: 0 };
const N = +process.argv[2] || 20;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const g = runGame(i);
  if (g.scores.reduce((a, b) => a + b, 0) !== 0) throw new Error('scores not zero-sum');
  for (const h of g.history) {
    if (h.result.type === 'draw') { stats.draws++; continue; }
    stats.wins++;
    if (h.result.selfDrawn) stats.self++;
    stats.maxTotal = Math.max(stats.maxTotal, h.result.total);
    for (const f of h.result.fans) stats.fans[f.name] = (stats.fans[f.name] || 0) + 1;
  }
}
console.log(`games=${N} hands=${N * 16} wins=${stats.wins} draws=${stats.draws} selfDrawn=${stats.self} maxTotal=${stats.maxTotal} time=${Date.now() - t0}ms`);
console.log(Object.entries(stats.fans).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', '));
