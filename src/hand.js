'use strict';
/**
 * Hand structure analysis: decompositions, special hands, win/ready checks.
 * Works on "counts" arrays (length 34) of the concealed part of a hand.
 */
const T = require('./tiles');

/** The 6 knitted patterns: knit[suitIndex] = starting number offset (0 -> 147, 1 -> 258, 2 -> 369). */
const KNIT_PERMS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];
function knitTiles(perm) {
  const out = [];
  for (let s = 0; s < 3; s++) for (let i = 0; i < 3; i++) out.push(s * 9 + perm[s] + i * 3);
  return out; // 9 tile kinds
}
const KNITS = KNIT_PERMS.map(knitTiles);
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/**
 * Enumerate every way to split `counts` into `nSets` sets (chow/pung) + 1 pair.
 * Returns array of { sets: [{type, tile}], pair }.
 */
function decompose(counts, nSets) {
  const results = [];
  const c = counts.slice();
  const sets = [];

  function findSets(start, remaining) {
    if (remaining === 0) {
      results.push({ sets: sets.map((s) => ({ ...s })), pair: currentPair });
      return;
    }
    let i = start;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) return;
    // pung
    if (c[i] >= 3) {
      c[i] -= 3; sets.push({ type: 'pung', tile: i });
      findSets(i, remaining - 1);
      sets.pop(); c[i] += 3;
    }
    // chow
    if (T.isSuited(i) && T.numOf(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ type: 'chow', tile: i });
      findSets(i, remaining - 1);
      sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
    }
  }

  let currentPair = -1;
  const total = c.reduce((a, b) => a + b, 0);
  if (total !== nSets * 3 + 2) return results;
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2; currentPair = p;
    findSets(0, nSets);
    c[p] += 2;
  }
  // de-duplicate (identical multisets can appear via different pung/chow orders)
  const seen = new Set();
  return results.filter((r) => {
    const key = r.pair + '|' + r.sets.map((s) => s.type[0] + s.tile).sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSevenPairs(counts) {
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 2) pairs += 1;
    else if (counts[i] === 4) pairs += 2;
    else if (counts[i] !== 0) return false;
  }
  return pairs === 7;
}

function isThirteenOrphans(counts) {
  let total = 0, hasPair = false;
  for (let i = 0; i < 34; i++) {
    if (!ORPHANS.includes(i)) { if (counts[i]) return false; continue; }
    if (counts[i] === 0) return false;
    if (counts[i] === 2) { if (hasPair) return false; hasPair = true; } else if (counts[i] !== 1) return false;
    total += counts[i];
  }
  return total === 14 && hasPair;
}

/** Honors & Knitted Tiles: 14 distinct singles from 7 honors + one knitted pattern. Returns 'greater'|'lesser'|null */
function honorsAndKnitted(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== 14) return null;
  for (const knit of KNITS) {
    let ok = true;
    for (let i = 0; i < 34; i++) {
      if (counts[i] > 1) { ok = false; break; }
      if (counts[i] === 1 && !(T.isHonor(i) || knit.includes(i))) { ok = false; break; }
    }
    if (ok) {
      let honors = 0;
      for (let i = 27; i < 34; i++) honors += counts[i];
      return honors === 7 ? 'greater' : 'lesser';
    }
  }
  return null;
}

/** Knitted Straight + 1 set + pair (nSets = 1 concealed set needed, or 0 if a meld exists). */
function knittedStraightDecomps(counts, nSets) {
  const out = [];
  for (const knit of KNITS) {
    if (!knit.every((k) => counts[k] > 0)) continue;
    const c = counts.slice();
    knit.forEach((k) => c[k]--);
    for (const d of decompose(c, nSets)) out.push({ ...d, knitted: knit });
  }
  return out;
}

/** All structural ways a hand can be complete. meldCount = number of exposed melds / concealed kongs. */
function winningStructures(counts, meldCount) {
  const nSets = 4 - meldCount;
  const res = [];
  for (const d of decompose(counts, nSets)) res.push({ kind: 'standard', ...d });
  if (meldCount === 0) {
    if (isSevenPairs(counts)) res.push({ kind: 'sevenPairs' });
    if (isThirteenOrphans(counts)) res.push({ kind: 'thirteenOrphans' });
    const hk = honorsAndKnitted(counts);
    if (hk) res.push({ kind: 'honorsKnitted', level: hk });
  }
  if (meldCount <= 1) {
    for (const d of knittedStraightDecomps(counts, 1 - meldCount)) res.push({ kind: 'knittedStraight', ...d });
  }
  return res;
}

function isWinningShape(counts, meldCount) {
  return winningStructures(counts, meldCount).length > 0;
}

/** Tile kinds that would complete a 13-tile-equivalent hand. */
function waitingTiles(counts, meldCount) {
  const waits = [];
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    if (isWinningShape(counts, meldCount)) waits.push(k);
    counts[k]--;
  }
  return waits;
}

module.exports = { decompose, winningStructures, isWinningShape, waitingTiles, KNITS, ORPHANS };
