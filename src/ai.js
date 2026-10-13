'use strict';
/**
 * Simple bot AI: shanten-based tile efficiency with a light "flush" bias,
 * since Chinese Official rules require 8 points to win.
 */
const T = require('./tiles');
const H = require('./hand');

/**
 * All reachable (sets, partials, head) combinations for one suit (9 counts) or the honors (7 counts),
 * memoised by the count pattern. Each suit is analysed independently, which keeps this fast.
 */
const groupMemo = new Map();
function groupCombos(arr, sequences) {
  const key = (sequences ? 's' : 'h') + arr.join('');
  const hit = groupMemo.get(key);
  if (hit) return hit;
  const c = arr.slice();
  const found = new Set();
  function dfs(i, m, t, p) {
    while (i < c.length && c[i] === 0) i++;
    if (i >= c.length) { found.add(m * 100 + t * 10 + p); return; }
    if (c[i] >= 3) { c[i] -= 3; dfs(i, m + 1, t, p); c[i] += 3; }
    if (sequences && i <= 6 && c[i + 1] && c[i + 2]) { c[i]--; c[i + 1]--; c[i + 2]--; dfs(i, m + 1, t, p); c[i]++; c[i + 1]++; c[i + 2]++; }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!p) dfs(i, m, t, 1);
      dfs(i, m, t + 1, p);
      c[i] += 2;
    }
    if (sequences && i <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; dfs(i, m, t + 1, p); c[i]++; c[i + 1]++; }
    if (sequences && i <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; dfs(i, m, t + 1, p); c[i]++; c[i + 2]++; }
    c[i]--; dfs(i + (c[i] === 0 ? 1 : 0), m, t, p); c[i]++;
  }
  dfs(0, 0, 0, 0);
  const res = [...found].map((v) => [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10]);
  groupMemo.set(key, res);
  return res;
}

/** Standard-form shanten for concealed counts with `melds` sets already fixed. */
function standardShanten(counts, melds) {
  const groups = [
    groupCombos(counts.slice(0, 9), true),
    groupCombos(counts.slice(9, 18), true),
    groupCombos(counts.slice(18, 27), true),
    groupCombos(counts.slice(27, 34), false),
  ];
  let best = 8;
  const maxBlocks = 4 - melds;
  for (const a of groups[0]) for (const b of groups[1]) for (const c of groups[2]) for (const d of groups[3]) {
    const p = a[2] + b[2] + c[2] + d[2];
    if (p > 1) continue;
    let m = a[0] + b[0] + c[0] + d[0];
    let t = a[1] + b[1] + c[1] + d[1];
    if (m > maxBlocks) m = maxBlocks;
    t = Math.min(t, maxBlocks - m);
    const s = 8 - 2 * (m + melds) - t - p;
    if (s < best) best = s;
  }
  return best;
}

function sevenPairsShanten(counts) {
  let pairs = 0, kinds = 0;
  for (let i = 0; i < 34; i++) { if (counts[i] >= 2) pairs++; if (counts[i] > 0) kinds++; }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

function orphansShanten(counts) {
  let kinds = 0, pair = false;
  for (const k of H.ORPHANS) { if (counts[k]) kinds++; if (counts[k] >= 2) pair = true; }
  return 13 - kinds - (pair ? 1 : 0);
}

function shanten(counts, melds) {
  let s = standardShanten(counts, melds);
  if (melds === 0) s = Math.min(s, sevenPairsShanten(counts), orphansShanten(counts));
  return s;
}

/** Number of unseen tiles that reduce shanten. */
function ukeire(counts, melds, visible) {
  const base = shanten(counts, melds);
  let n = 0;
  for (let k = 0; k < 34; k++) {
    const left = 4 - counts[k] - (visible ? visible[k] : 0);
    if (left <= 0) continue;
    counts[k]++;
    if (shanten(counts, melds) < base) n += left;
    counts[k]--;
  }
  return n;
}

/** Suit the hand leans towards (for half/full flush plans), or -1. */
function flushSuit(tiles) {
  const per = [0, 0, 0];
  tiles.forEach((t) => { if (T.isSuited(t)) per[T.suitOf(t)]++; });
  const max = Math.max(...per);
  return max >= 8 ? per.indexOf(max) : -1;
}

/** Pick the discard for a 14-tile (equivalent) hand. */
function chooseDiscard(hand, melds, visible, meldTiles = []) {
  const counts = T.toCounts(hand);
  const fs = flushSuit(hand.concat(meldTiles));
  let best = null;
  for (const t of new Set(hand)) {
    counts[t]--;
    const s = shanten(counts, melds);
    const u = ukeire(counts, melds, visible);
    counts[t]++;
    let val = s * 1000 - u * 5;
    if (fs >= 0 && T.isSuited(t) && T.suitOf(t) !== fs) val -= 40; // throw off-suit tiles first
    if (T.isHonor(t) && counts[t] === 1) val -= 3;                   // lone honors are cheap to drop
    if (T.isTerminal(t)) val -= 1;
    if (!best || val < best.val) best = { tile: t, val };
  }
  return best.tile;
}

module.exports = { shanten, ukeire, chooseDiscard, flushSuit };
