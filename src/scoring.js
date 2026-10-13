'use strict';
/**
 * Chinese Official / MCR scoring (81 fan list, 8-point minimum).
 *
 * ctx = {
 *   concealed: number[]      concealed tiles INCLUDING the winning tile
 *   melds: [{type:'chow'|'pung'|'kong', tile, concealed:boolean}]  exposed melds + concealed kongs
 *   winTile, selfDrawn, seatWind, prevalentWind (tile kinds 27-30), flowers (count)
 *   lastTileOfKind, lastWallDraw, lastDiscard, kongReplacement, robbingKong  (booleans)
 * }
 * Returns { total, base, fans: [{name, points, count}] } for the best interpretation, or null if not a win.
 */
const T = require('./tiles');
const H = require('./hand');

const FAN = {
  // 88
  BIG_FOUR_WINDS: ['Big Four Winds', 88], BIG_THREE_DRAGONS: ['Big Three Dragons', 88], ALL_GREEN: ['All Green', 88],
  NINE_GATES: ['Nine Gates', 88], FOUR_KONGS: ['Four Kongs', 88], SEVEN_SHIFTED_PAIRS: ['Seven Shifted Pairs', 88],
  THIRTEEN_ORPHANS: ['Thirteen Orphans', 88],
  // 64
  ALL_TERMINALS: ['All Terminals', 64], LITTLE_FOUR_WINDS: ['Little Four Winds', 64], LITTLE_THREE_DRAGONS: ['Little Three Dragons', 64],
  ALL_HONORS: ['All Honors', 64], FOUR_CONCEALED_PUNGS: ['Four Concealed Pungs', 64], PURE_TERMINAL_CHOWS: ['Pure Terminal Chows', 64],
  // 48
  QUADRUPLE_CHOW: ['Quadruple Chow', 48], FOUR_PURE_SHIFTED_PUNGS: ['Four Pure Shifted Pungs', 48],
  // 32
  FOUR_PURE_SHIFTED_CHOWS: ['Four Shifted Chows', 32], THREE_KONGS: ['Three Kongs', 32], ALL_TERMINALS_HONORS: ['All Terminals and Honors', 32],
  // 24
  SEVEN_PAIRS: ['Seven Pairs', 24], GREATER_HONORS_KNITTED: ['Greater Honors and Knitted Tiles', 24], ALL_EVEN: ['All Even', 24],
  FULL_FLUSH: ['Full Flush', 24], PURE_TRIPLE_CHOW: ['Pure Triple Chow', 24], PURE_SHIFTED_PUNGS: ['Pure Shifted Pungs', 24],
  UPPER_TILES: ['Upper Tiles', 24], MIDDLE_TILES: ['Middle Tiles', 24], LOWER_TILES: ['Lower Tiles', 24],
  // 16
  PURE_STRAIGHT: ['Pure Straight', 16], THREE_SUITED_TERMINAL_CHOWS: ['Three-Suited Terminal Chows', 16],
  PURE_SHIFTED_CHOWS: ['Pure Shifted Chows', 16], ALL_FIVES: ['All Fives', 16], TRIPLE_PUNG: ['Triple Pung', 16],
  THREE_CONCEALED_PUNGS: ['Three Concealed Pungs', 16],
  // 12
  LESSER_HONORS_KNITTED: ['Lesser Honors and Knitted Tiles', 12], KNITTED_STRAIGHT: ['Knitted Straight', 12],
  UPPER_FOUR: ['Upper Four', 12], LOWER_FOUR: ['Lower Four', 12], BIG_THREE_WINDS: ['Big Three Winds', 12],
  // 8
  MIXED_STRAIGHT: ['Mixed Straight', 8], REVERSIBLE: ['Reversible Tiles', 8], MIXED_TRIPLE_CHOW: ['Mixed Triple Chow', 8],
  MIXED_SHIFTED_PUNGS: ['Mixed Shifted Pungs', 8], CHICKEN: ['Chicken Hand', 8], LAST_TILE_DRAW: ['Last Tile Draw', 8],
  LAST_TILE_CLAIM: ['Last Tile Claim', 8], REPLACEMENT: ['Out With Replacement Tile', 8], ROBBING_KONG: ['Robbing The Kong', 8],
  // 6
  ALL_PUNGS: ['All Pungs', 6], HALF_FLUSH: ['Half Flush', 6], MIXED_SHIFTED_CHOWS: ['Mixed Shifted Chows', 6],
  ALL_TYPES: ['All Types', 6], MELDED_HAND: ['Melded Hand', 6], TWO_DRAGONS: ['Two Dragon Pungs', 6],
  TWO_CONCEALED_KONGS: ['Two Concealed Kongs', 6],
  // 4
  OUTSIDE_HAND: ['Outside Hand', 4], FULLY_CONCEALED: ['Fully Concealed Hand', 4], TWO_MELDED_KONGS: ['Two Melded Kongs', 4],
  LAST_TILE: ['Last Tile', 4],
  // 2
  DRAGON_PUNG: ['Dragon Pung', 2], PREVALENT_WIND: ['Prevalent Wind', 2], SEAT_WIND: ['Seat Wind', 2],
  CONCEALED_HAND: ['Concealed Hand', 2], ALL_CHOWS: ['All Chows', 2], TILE_HOG: ['Tile Hog', 2], DOUBLE_PUNG: ['Double Pung', 2],
  TWO_CONCEALED_PUNGS: ['Two Concealed Pungs', 2], CONCEALED_KONG: ['Concealed Kong', 2], ALL_SIMPLES: ['All Simples', 2],
  // 1
  PURE_DOUBLE_CHOW: ['Pure Double Chow', 1], MIXED_DOUBLE_CHOW: ['Mixed Double Chow', 1], SHORT_STRAIGHT: ['Short Straight', 1],
  TWO_TERMINAL_CHOWS: ['Two Terminal Chows', 1], PUNG_TERM_HONOR: ['Pung of Terminals or Honors', 1], MELDED_KONG: ['Melded Kong', 1],
  ONE_VOIDED_SUIT: ['One Voided Suit', 1], NO_HONORS: ['No Honors', 1], EDGE_WAIT: ['Edge Wait', 1], CLOSED_WAIT: ['Closed Wait', 1],
  SINGLE_WAIT: ['Single Wait', 1], SELF_DRAWN: ['Self-Drawn', 1], FLOWER: ['Flower Tiles', 1],
};

/** Fans that are implied by (and therefore not counted together with) a bigger fan. */
const EXCLUDES = {
  BIG_FOUR_WINDS: ['BIG_THREE_WINDS', 'LITTLE_FOUR_WINDS', 'ALL_PUNGS', 'PREVALENT_WIND', 'SEAT_WIND', 'PUNG_TERM_HONOR'],
  BIG_THREE_DRAGONS: ['DRAGON_PUNG', 'TWO_DRAGONS'],
  ALL_GREEN: ['HALF_FLUSH'],
  NINE_GATES: ['FULL_FLUSH', 'CONCEALED_HAND', 'FULLY_CONCEALED', 'TWO_CONCEALED_PUNGS', 'PUNG_TERM_HONOR', 'NO_HONORS'],
  FOUR_KONGS: ['THREE_KONGS', 'TWO_MELDED_KONGS', 'MELDED_KONG', 'SINGLE_WAIT', 'ALL_PUNGS', 'TWO_CONCEALED_KONGS', 'CONCEALED_KONG'],
  SEVEN_SHIFTED_PAIRS: ['SEVEN_PAIRS', 'FULL_FLUSH', 'CONCEALED_HAND', 'FULLY_CONCEALED', 'SINGLE_WAIT', 'NO_HONORS'],
  THIRTEEN_ORPHANS: ['ALL_TYPES', 'CONCEALED_HAND', 'FULLY_CONCEALED', 'SINGLE_WAIT'],
  ALL_TERMINALS: ['ALL_TERMINALS_HONORS', 'ALL_PUNGS', 'OUTSIDE_HAND', 'PUNG_TERM_HONOR', 'NO_HONORS', 'DOUBLE_PUNG'],
  LITTLE_FOUR_WINDS: ['BIG_THREE_WINDS', 'PUNG_TERM_HONOR'],
  LITTLE_THREE_DRAGONS: ['DRAGON_PUNG', 'TWO_DRAGONS'],
  ALL_HONORS: ['ALL_TERMINALS_HONORS', 'ALL_PUNGS', 'OUTSIDE_HAND', 'PUNG_TERM_HONOR'],
  FOUR_CONCEALED_PUNGS: ['THREE_CONCEALED_PUNGS', 'TWO_CONCEALED_PUNGS', 'ALL_PUNGS', 'CONCEALED_HAND', 'FULLY_CONCEALED'],
  PURE_TERMINAL_CHOWS: ['FULL_FLUSH', 'ALL_CHOWS', 'PURE_DOUBLE_CHOW', 'TWO_TERMINAL_CHOWS', 'SEVEN_PAIRS', 'NO_HONORS'],
  QUADRUPLE_CHOW: ['PURE_TRIPLE_CHOW', 'PURE_DOUBLE_CHOW', 'TILE_HOG', 'PURE_SHIFTED_PUNGS'],
  FOUR_PURE_SHIFTED_PUNGS: ['PURE_SHIFTED_PUNGS', 'ALL_PUNGS'],
  FOUR_PURE_SHIFTED_CHOWS: ['PURE_SHIFTED_CHOWS', 'SHORT_STRAIGHT', 'TWO_TERMINAL_CHOWS'],
  THREE_KONGS: ['TWO_MELDED_KONGS', 'MELDED_KONG', 'TWO_CONCEALED_KONGS', 'CONCEALED_KONG'],
  ALL_TERMINALS_HONORS: ['ALL_PUNGS', 'OUTSIDE_HAND', 'PUNG_TERM_HONOR'],
  SEVEN_PAIRS: ['CONCEALED_HAND', 'FULLY_CONCEALED', 'SINGLE_WAIT'],
  GREATER_HONORS_KNITTED: ['LESSER_HONORS_KNITTED', 'ALL_TYPES', 'CONCEALED_HAND', 'FULLY_CONCEALED', 'SINGLE_WAIT'],
  ALL_EVEN: ['ALL_PUNGS', 'ALL_SIMPLES', 'NO_HONORS'],
  FULL_FLUSH: ['NO_HONORS', 'ONE_VOIDED_SUIT', 'HALF_FLUSH'],
  PURE_TRIPLE_CHOW: ['PURE_DOUBLE_CHOW'],
  UPPER_TILES: ['NO_HONORS', 'UPPER_FOUR'],
  MIDDLE_TILES: ['NO_HONORS', 'ALL_SIMPLES'],
  LOWER_TILES: ['NO_HONORS', 'LOWER_FOUR'],
  THREE_SUITED_TERMINAL_CHOWS: ['ALL_CHOWS', 'TWO_TERMINAL_CHOWS', 'MIXED_DOUBLE_CHOW', 'NO_HONORS'],
  ALL_FIVES: ['ALL_SIMPLES'],
  TRIPLE_PUNG: ['DOUBLE_PUNG'],
  THREE_CONCEALED_PUNGS: ['TWO_CONCEALED_PUNGS'],
  LESSER_HONORS_KNITTED: ['CONCEALED_HAND', 'FULLY_CONCEALED', 'ALL_TYPES', 'SINGLE_WAIT'],
  UPPER_FOUR: ['NO_HONORS'],
  LOWER_FOUR: ['NO_HONORS'],
  BIG_THREE_WINDS: [],
  REVERSIBLE: ['ONE_VOIDED_SUIT'],
  LAST_TILE_DRAW: ['SELF_DRAWN'],
  REPLACEMENT: ['SELF_DRAWN'],
  ROBBING_KONG: ['LAST_TILE'],
  MELDED_HAND: ['SINGLE_WAIT'],
  TWO_DRAGONS: ['DRAGON_PUNG'],
  FULLY_CONCEALED: ['CONCEALED_HAND', 'SELF_DRAWN'],
  ALL_SIMPLES: ['NO_HONORS'],
};

const REVERSIBLE_SET = new Set([
  9 + 0, 9 + 1, 9 + 2, 9 + 3, 9 + 4, 9 + 7, 9 + 8, // Dots 1 2 3 4 5 8 9
  18 + 1, 18 + 3, 18 + 4, 18 + 5, 18 + 7, 18 + 8, // Bamboos 2 4 5 6 8 9
  T.WHITE,
]);
const GREEN_SET = new Set([18 + 1, 18 + 2, 18 + 3, 18 + 5, 18 + 7, T.GREEN]); // 2 3 4 6 8 Bamboo + Green Dragon

class FanList {
  constructor() { this.map = new Map(); }
  add(key, count = 1) { if (count > 0) this.map.set(key, (this.map.get(key) || 0) + count); }
  has(key) { return this.map.has(key); }
  remove(key) { this.map.delete(key); }
  applyExclusions() {
    // iterate biggest first so exclusion chains resolve properly
    const keys = [...this.map.keys()].sort((a, b) => FAN[b][1] - FAN[a][1]);
    for (const k of keys) if (this.map.has(k)) for (const ex of EXCLUDES[k] || []) this.map.delete(ex);
  }
  total() { let t = 0; for (const [k, n] of this.map) t += FAN[k][1] * n; return t; }
  list() {
    return [...this.map.entries()]
      .map(([k, n]) => ({ key: k, name: FAN[k][0], points: FAN[k][1], count: n }))
      .sort((a, b) => b.points - a.points);
  }
}

const setTiles = (s) => (s.type === 'chow' ? [s.tile, s.tile + 1, s.tile + 2] : s.type === 'kong' ? [s.tile, s.tile, s.tile, s.tile] : [s.tile, s.tile, s.tile]);
const isPungLike = (s) => s.type === 'pung' || s.type === 'kong';

/* ---------------- chow combination fans ---------------- */
function chowFans(chows, fans) {
  const n = chows.length;
  if (n < 2) return;
  const S = (c) => T.suitOf(c.tile), N = (c) => T.numOf(c.tile);
  const same = (a, b) => a.tile === b.tile;

  // --- big fans using 4 chows
  if (n === 4) {
    const allSuit = chows.every((c) => S(c) === S(chows[0]));
    if (chows.every((c) => same(c, chows[0]))) { fans.add('QUADRUPLE_CHOW'); return; }
    if (allSuit) {
      const nums = chows.map(N).sort((a, b) => a - b);
      const d = nums[1] - nums[0];
      if ((d === 1 || d === 2) && nums[2] - nums[1] === d && nums[3] - nums[2] === d) { fans.add('FOUR_PURE_SHIFTED_CHOWS'); return; }
    }
  }

  // --- big fans using 3 chows (try every triple, keep best)
  const triples = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) triples.push([a, b, c]);
  let best = { key: null, used: [] };
  const consider = (key, used) => { if (!best.key || FAN[key][1] > FAN[best.key][1]) best = { key, used }; };
  for (const tri of triples) {
    const cs = tri.map((i) => chows[i]);
    const suits = cs.map(S), nums = cs.map(N);
    const oneSuit = suits.every((s) => s === suits[0]);
    const threeSuits = new Set(suits).size === 3;
    const sn = nums.slice().sort((x, y) => x - y);
    if (oneSuit && nums.every((x) => x === nums[0])) consider('PURE_TRIPLE_CHOW', tri);
    if (oneSuit && sn[0] === 1 && sn[1] === 4 && sn[2] === 7) consider('PURE_STRAIGHT', tri);
    if (oneSuit) {
      const d = sn[1] - sn[0];
      if ((d === 1 || d === 2) && sn[2] - sn[1] === d) consider('PURE_SHIFTED_CHOWS', tri);
    }
    if (threeSuits && nums.every((x) => x === nums[0])) consider('MIXED_TRIPLE_CHOW', tri);
    if (threeSuits && sn[0] === 1 && sn[1] === 4 && sn[2] === 7) consider('MIXED_STRAIGHT', tri);
    if (threeSuits && sn[1] === sn[0] + 1 && sn[2] === sn[1] + 1) consider('MIXED_SHIFTED_CHOWS', tri);
  }

  const pairFan = (a, b) => {
    if (same(a, b)) return 'PURE_DOUBLE_CHOW';
    if (S(a) !== S(b) && N(a) === N(b)) return 'MIXED_DOUBLE_CHOW';
    if (S(a) === S(b) && Math.abs(N(a) - N(b)) === 3) return 'SHORT_STRAIGHT';
    if (S(a) === S(b) && ((N(a) === 1 && N(b) === 7) || (N(a) === 7 && N(b) === 1))) return 'TWO_TERMINAL_CHOWS';
    return null;
  };

  if (best.key) {
    fans.add(best.key);
    // the leftover chow (if any) may combine once with one of the used chows
    const rest = [...Array(n).keys()].filter((i) => !best.used.includes(i));
    if (rest.length === 1) {
      let bestPair = null;
      for (const u of best.used) {
        const f = pairFan(chows[rest[0]], chows[u]);
        if (f && (!bestPair || FAN[f][1] > FAN[bestPair][1])) bestPair = f;
      }
      if (bestPair && !(EXCLUDES[best.key] || []).includes(bestPair)) fans.add(bestPair);
    }
    return;
  }

  // --- pair fans: each chow participates in at most one pair fan (best matching)
  let bestScore = -1, bestSet = [];
  const idx = [...Array(n).keys()];
  function match(remaining, acc, score) {
    if (score > bestScore) { bestScore = score; bestSet = acc.slice(); }
    if (remaining.length < 2) return;
    const [first, ...others] = remaining;
    match(others, acc, score); // first unused
    for (let j = 0; j < others.length; j++) {
      const f = pairFan(chows[first], chows[others[j]]);
      if (!f) continue;
      acc.push(f);
      match(others.filter((_, k) => k !== j), acc, score + FAN[f][1]);
      acc.pop();
    }
  }
  match(idx, [], 0);
  bestSet.forEach((f) => fans.add(f));
}

/* ---------------- pung combination fans ---------------- */
function pungFans(pungs, fans) {
  const suited = pungs.filter((p) => T.isSuited(p.tile));
  const S = (p) => T.suitOf(p.tile), N = (p) => T.numOf(p.tile);
  if (suited.length === 4 && suited.every((p) => S(p) === S(suited[0]))) {
    const nums = suited.map(N).sort((a, b) => a - b);
    if (nums.every((x, i) => i === 0 || x === nums[i - 1] + 1)) { fans.add('FOUR_PURE_SHIFTED_PUNGS'); return; }
  }
  let big = null, used = [];
  const n = suited.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
    const ps = [suited[a], suited[b], suited[c]];
    const suits = ps.map(S), nums = ps.map(N).sort((x, y) => x - y);
    const consecutive = nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1;
    let key = null;
    if (suits.every((s) => s === suits[0]) && consecutive) key = 'PURE_SHIFTED_PUNGS';
    else if (new Set(suits).size === 3 && nums[0] === nums[2]) key = 'TRIPLE_PUNG';
    else if (new Set(suits).size === 3 && consecutive) key = 'MIXED_SHIFTED_PUNGS';
    if (key && (!big || FAN[key][1] > FAN[big][1])) { big = key; used = [a, b, c]; }
  }
  if (big) fans.add(big);
  // Double Pung: two pungs of the same number in different suits
  let dp = 0;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (big === 'TRIPLE_PUNG' && used.includes(a) && used.includes(b)) continue;
    if (N(suited[a]) === N(suited[b]) && S(suited[a]) !== S(suited[b])) dp++;
  }
  fans.add('DOUBLE_PUNG', dp);
}

/* ---------------- whole-hand tile property fans ---------------- */
function tilePropertyFans(allTiles, fans, { standard }) {
  const suits = new Set(allTiles.filter(T.isSuited).map(T.suitOf));
  const hasHonor = allTiles.some(T.isHonor);
  const suited = allTiles.filter(T.isSuited);
  const nums = suited.map(T.numOf);

  if (allTiles.every((t) => GREEN_SET.has(t))) fans.add('ALL_GREEN');
  if (allTiles.every(T.isHonor)) fans.add('ALL_HONORS');
  else if (allTiles.every(T.isTerminal)) fans.add('ALL_TERMINALS');
  else if (allTiles.every(T.isTermOrHonor)) fans.add('ALL_TERMINALS_HONORS');

  if (suits.size === 1 && !hasHonor) fans.add('FULL_FLUSH');
  else if (suits.size === 1 && hasHonor) fans.add('HALF_FLUSH');
  if (suits.size === 2) fans.add('ONE_VOIDED_SUIT');
  if (!hasHonor) fans.add('NO_HONORS');

  if (!hasHonor) {
    if (nums.every((x) => x >= 7)) fans.add('UPPER_TILES');
    else if (nums.every((x) => x >= 4 && x <= 6)) fans.add('MIDDLE_TILES');
    else if (nums.every((x) => x <= 3)) fans.add('LOWER_TILES');
    else if (nums.every((x) => x >= 6)) fans.add('UPPER_FOUR');
    else if (nums.every((x) => x <= 4)) fans.add('LOWER_FOUR');
    if (nums.every((x) => x >= 2 && x <= 8)) fans.add('ALL_SIMPLES');
  }
  if (allTiles.every((t) => REVERSIBLE_SET.has(t))) fans.add('REVERSIBLE');
  if (standard) {
    const hasWind = allTiles.some(T.isWind), hasDragon = allTiles.some(T.isDragon);
    if (suits.size === 3 && hasWind && hasDragon) fans.add('ALL_TYPES');
  }
}

/* ---------------- situational fans ---------------- */
function situationFans(ctx, fans, { exposed }) {
  if (ctx.selfDrawn) fans.add('SELF_DRAWN');
  if (!exposed) fans.add(ctx.selfDrawn ? 'FULLY_CONCEALED' : 'CONCEALED_HAND');
  if (ctx.lastWallDraw && ctx.selfDrawn) fans.add('LAST_TILE_DRAW');
  if (ctx.lastDiscard && !ctx.selfDrawn) fans.add('LAST_TILE_CLAIM');
  if (ctx.kongReplacement && ctx.selfDrawn) fans.add('REPLACEMENT');
  if (ctx.robbingKong) fans.add('ROBBING_KONG');
  if (ctx.lastTileOfKind) fans.add('LAST_TILE');
}

function tileHogCount(allCounts, sets) {
  let n = 0;
  for (let k = 0; k < 34; k++) {
    if (allCounts[k] !== 4) continue;
    if (sets && sets.some((s) => s.type === 'kong' && s.tile === k)) continue;
    n++;
  }
  return n;
}

/** Wait fan given which kinds complete the hand and where the winning tile sits in this decomposition. */
function waitFan(waitKinds, role) {
  if (waitKinds.length !== 1 || !role) return null;
  if (role.where === 'pair') return 'SINGLE_WAIT';
  if (role.where === 'chow') {
    const n = T.numOf(role.set.tile);
    if (role.offset === 1) return 'CLOSED_WAIT';
    if ((role.offset === 2 && n === 1) || (role.offset === 0 && n === 7)) return 'EDGE_WAIT';
  }
  return null;
}

/* ---------------- scoring per structure ---------------- */
function scoreStandard(ctx, struct, waitKinds, allTiles, allCounts) {
  const results = [];
  const concealedSets = struct.sets.map((s) => ({ ...s, open: false }));
  const meldSets = ctx.melds.map((m) => ({ type: m.type, tile: m.tile, open: !m.concealed, meld: true }));
  const exposed = ctx.melds.some((m) => !m.concealed);

  // possible roles of the winning tile inside the concealed part
  const roles = [];
  if (struct.pair === ctx.winTile) roles.push({ where: 'pair' });
  concealedSets.forEach((s, i) => {
    const tiles = setTiles(s);
    const off = tiles.indexOf(ctx.winTile);
    if (off >= 0) roles.push({ where: s.type, index: i, set: s, offset: off });
  });
  if (struct.knitted && struct.knitted.includes(ctx.winTile)) roles.push({ where: 'knit' });
  if (!roles.length) roles.push(null); // robbing kong edge cases

  for (const role of roles) {
    const fans = new FanList();
    const sets = concealedSets.map((s) => ({ ...s })).concat(meldSets);
    // a pung completed by a discard counts as melded (not concealed)
    if (role && role.where === 'pung' && !ctx.selfDrawn) sets[role.index].open = true;

    const chows = sets.filter((s) => s.type === 'chow');
    const pungs = sets.filter(isPungLike);
    const kongs = sets.filter((s) => s.type === 'kong');
    const pair = struct.pair;
    const knitted = !!struct.knitted;

    if (knitted) fans.add('KNITTED_STRAIGHT');

    // honors
    const dragonPungs = pungs.filter((p) => T.isDragon(p.tile)).length;
    const windPungs = pungs.filter((p) => T.isWind(p.tile));
    if (dragonPungs === 3) fans.add('BIG_THREE_DRAGONS');
    else if (dragonPungs === 2 && T.isDragon(pair)) fans.add('LITTLE_THREE_DRAGONS');
    else if (dragonPungs === 2) fans.add('TWO_DRAGONS');
    else fans.add('DRAGON_PUNG', dragonPungs);
    if (windPungs.length === 4) fans.add('BIG_FOUR_WINDS');
    else if (windPungs.length === 3 && T.isWind(pair)) fans.add('LITTLE_FOUR_WINDS');
    else if (windPungs.length === 3) fans.add('BIG_THREE_WINDS');
    if (windPungs.some((p) => p.tile === ctx.prevalentWind)) fans.add('PREVALENT_WIND');
    if (windPungs.some((p) => p.tile === ctx.seatWind)) fans.add('SEAT_WIND');
    // Pung of terminals or honors (dragon pungs and seat/prevalent wind pungs already score their own fan)
    let pth = pungs.filter((p) => T.isTerminal(p.tile)).length;
    if (windPungs.length < 3) pth += windPungs.filter((p) => p.tile !== ctx.prevalentWind && p.tile !== ctx.seatWind).length;
    fans.add('PUNG_TERM_HONOR', pth);

    // kongs
    const mk = kongs.filter((k) => k.open).length, ck = kongs.length - mk;
    if (kongs.length === 4) fans.add('FOUR_KONGS');
    else if (kongs.length === 3) fans.add('THREE_KONGS');
    else if (ck === 2) fans.add('TWO_CONCEALED_KONGS');
    else if (mk === 2) fans.add('TWO_MELDED_KONGS');
    else { if (ck === 1) fans.add('CONCEALED_KONG'); if (mk === 1) fans.add('MELDED_KONG'); }

    // concealed pungs
    const cp = pungs.filter((p) => !p.open).length;
    if (cp === 4) fans.add('FOUR_CONCEALED_PUNGS');
    else if (cp === 3) fans.add('THREE_CONCEALED_PUNGS');
    else if (cp === 2) fans.add('TWO_CONCEALED_PUNGS');

    if (!knitted && pungs.length === 4) fans.add('ALL_PUNGS');
    if (!knitted && chows.length === 4 && !T.isHonor(pair)) fans.add('ALL_CHOWS');

    // set-structure fans
    if (!knitted) {
      // Pure Terminal Chows / Three-Suited Terminal Chows
      const ct = chows.map((c) => c.tile).sort((a, b) => a - b);
      if (chows.length === 4) {
        const s0 = T.suitOf(ct[0]);
        if (ct.every((t) => T.suitOf(t) === s0) && T.suitOf(pair) === s0 && T.numOf(pair) === 5 &&
          ct.filter((t) => T.numOf(t) === 1).length === 2 && ct.filter((t) => T.numOf(t) === 7).length === 2) {
          fans.add('PURE_TERMINAL_CHOWS');
        }
        const bySuit = [0, 1, 2].map((s) => ct.filter((t) => T.suitOf(t) === s).map(T.numOf).sort().join(''));
        const tsc = bySuit.filter((x) => x === '17').length === 2 && T.isSuited(pair) && T.numOf(pair) === 5 &&
          bySuit[T.suitOf(pair)] === '';
        if (tsc) fans.add('THREE_SUITED_TERMINAL_CHOWS');
      }
      if (!fans.has('PURE_TERMINAL_CHOWS') && !fans.has('THREE_SUITED_TERMINAL_CHOWS')) chowFans(chows, fans);
      pungFans(pungs, fans);

      const elements = sets.map(setTiles).concat([[pair, pair]]);
      if (elements.every((e) => e.some(T.isTermOrHonor))) fans.add('OUTSIDE_HAND');
      if (elements.every((e) => e.some((t) => T.isSuited(t) && T.numOf(t) === 5))) fans.add('ALL_FIVES');
      if (pungs.length === 4 && [pair, ...pungs.map((p) => p.tile)].every((t) => T.isSuited(t) && T.numOf(t) % 2 === 0)) fans.add('ALL_EVEN');
    }

    tilePropertyFans(allTiles, fans, { standard: true });
    // Nine Gates: concealed 1112345678999 of one suit, completed by any tile of that suit
    if (fans.has('FULL_FLUSH') && ctx.melds.length === 0) {
      const s = T.suitOf(ctx.winTile);
      const c = ctx.concealed.slice();
      c.splice(c.indexOf(ctx.winTile), 1);
      const cc = T.toCounts(c);
      if ([3, 1, 1, 1, 1, 1, 1, 1, 3].every((v, i) => cc[s * 9 + i] === v)) fans.add('NINE_GATES');
    }

    fans.add('TILE_HOG', tileHogCount(allCounts, sets));

    const wf = waitFan(waitKinds, role);
    if (wf) fans.add(wf);
    // Melded Hand: all four sets exposed and winning on a discard (single wait on the pair)
    if (!ctx.selfDrawn && ctx.melds.filter((m) => !m.concealed).length === 4) fans.add('MELDED_HAND');

    situationFans(ctx, fans, { exposed });
    results.push(fans);
  }
  return results;
}

function scoreSpecial(ctx, struct, allTiles, allCounts) {
  const fans = new FanList();
  if (struct.kind === 'thirteenOrphans') fans.add('THIRTEEN_ORPHANS');
  if (struct.kind === 'honorsKnitted') fans.add(struct.level === 'greater' ? 'GREATER_HONORS_KNITTED' : 'LESSER_HONORS_KNITTED');
  if (struct.kind === 'sevenPairs') {
    fans.add('SEVEN_PAIRS');
    // Seven Shifted Pairs: 7 consecutive pairs in one suit
    const kinds = allCounts.map((n, k) => (n ? k : -1)).filter((k) => k >= 0);
    if (kinds.length === 7 && kinds.every(T.isSuited) && kinds.every((k) => T.suitOf(k) === T.suitOf(kinds[0])) &&
      kinds[6] - kinds[0] === 6) fans.add('SEVEN_SHIFTED_PAIRS');
    tilePropertyFans(allTiles, fans, { standard: false });
    fans.add('TILE_HOG', tileHogCount(allCounts, null));
  }
  situationFans(ctx, fans, { exposed: false });
  return [fans];
}

function score(ctx) {
  const concealedCounts = T.toCounts(ctx.concealed);
  const meldCount = ctx.melds.length;
  const structs = H.winningStructures(concealedCounts, meldCount);
  if (!structs.length) return null;

  const allTiles = ctx.concealed.slice();
  for (const m of ctx.melds) allTiles.push(...setTiles(m));
  const allCounts = T.toCounts(allTiles);

  // the wait (for edge/closed/single): what tiles complete the hand without the winning tile?
  const before = concealedCounts.slice();
  before[ctx.winTile]--;
  const waitKinds = H.waitingTiles(before, meldCount);

  let best = null;
  for (const st of structs) {
    const candidates = st.kind === 'standard' || st.kind === 'knittedStraight'
      ? scoreStandard(ctx, st, waitKinds, allTiles, allCounts)
      : scoreSpecial(ctx, st, allTiles, allCounts);
    for (const fans of candidates) {
      fans.applyExclusions();
      if (fans.total() === 0) fans.add('CHICKEN');
      const base = fans.total();
      if (!best || base > best.base) best = { base, fans, structure: st.kind };
    }
  }
  const flowers = ctx.flowers || 0;
  if (flowers) best.fans.add('FLOWER', flowers);
  const fanList = best.fans.list();
  return { base: best.base, total: best.base + flowers, fans: fanList, structure: best.structure };
}

/** Payments per the guide: discard win -> 8 from everyone + total from discarder; self-drawn -> (total + 8) from everyone. */
function payments(total, winner, discarder, selfDrawn) {
  const pay = [0, 0, 0, 0];
  for (let p = 0; p < 4; p++) {
    if (p === winner) continue;
    const amount = selfDrawn ? total + 8 : 8 + (p === discarder ? total : 0);
    pay[p] -= amount;
    pay[winner] += amount;
  }
  return pay;
}

const MIN_POINTS = 8;

module.exports = { score, payments, MIN_POINTS, FAN };
