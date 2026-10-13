'use strict';
/* Hand-drawn vector glyphs for the Chinese characters on tiles, so they render
   identically everywhere with no font dependency. Each glyph is drawn with
   stroke rectangles/lines on a 100x100 box, centred, then scaled by the caller.
   Style: bold rounded strokes resembling a chunky brush/engraving. */

const SW = 11;                       // stroke width
const H = (x, y, w) => `<rect x="${x}" y="${y - SW / 2}" width="${w}" height="${SW}" rx="${SW / 2}"/>`;          // horizontal
const V = (x, y, h) => `<rect x="${x - SW / 2}" y="${y}" width="${SW}" height="${h}" rx="${SW / 2}"/>`;          // vertical
const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${SW}" stroke-linecap="round"/>`;

// 萬 (wan — "ten thousand"), the character suit mark.
const WAN =
  // 艹 grass radical on top
  H(24, 16, 52) + V(38, 10, 14) + V(62, 10, 14) +
  // 田-like box body
  H(28, 32, 44) +
  V(28, 32, 42) + V(72, 32, 42) +
  H(28, 50, 44) +
  V(50, 32, 18) +
  H(30, 68, 40) +
  // legs under the box
  L(34, 72, 24, 92) +
  V(50, 68, 16) + L(50, 84, 70, 92);

// 東 (east) — 日 box pierced by a vertical stroke, with splayed legs (木 base)
const DONG =
  V(50, 12, 76) +                        // long central vertical
  H(28, 26, 44) +                        // box top
  V(28, 26, 36) + V(72, 26, 36) +        // box sides
  H(28, 44, 44) +                        // box middle bar
  H(28, 62, 44) +                        // box bottom
  L(50, 60, 24, 90) + L(50, 60, 76, 90); // two legs

// 南 (south)
const NAN =
  H(28, 18, 44) + V(50, 10, 12) +
  V(26, 28, 56) + V(74, 28, 56) +
  H(26, 30, 48) +
  H(36, 46, 28) + V(36, 46, 24) + V(64, 46, 24) + H(36, 68, 28) +
  V(50, 46, 16);

// 西 (west)
const XI =
  H(26, 20, 48) +
  V(26, 26, 56) + V(74, 26, 56) + H(26, 80, 48) +
  H(38, 40, 24) + V(38, 40, 24) + V(62, 40, 24) +
  V(50, 20, 18);

// 北 (north)
const BEI =
  V(30, 20, 60) + H(30, 42, 16) + L(30, 80, 18, 92) +
  V(66, 20, 50) + H(66, 20, 18) + H(50, 46, 26) + V(72, 46, 34) + L(72, 20, 86, 30);

// 中 (red dragon / centre)
const ZHONG =
  H(26, 36, 48) + V(26, 36, 28) + V(74, 36, 28) + H(26, 64, 48) +
  V(50, 14, 72);

// 發 (green dragon / "prosper")
const FA =
  L(24, 20, 40, 40) + L(40, 20, 24, 40) +
  L(60, 20, 76, 40) + L(76, 20, 60, 40) +
  H(22, 52, 56) +
  V(34, 52, 34) + H(30, 70, 20) +
  V(66, 52, 30) + H(60, 86, 20) + L(66, 66, 82, 86);

const MAP = { WAN, DONG, NAN, XI, BEI, ZHONG, FA };

/** Return a <g> containing the glyph drawn in `color`, mapped into the given box. */
function glyph(name, color, x, y, size) {
  const paths = MAP[name];
  if (!paths) return '';
  const s = size / 100;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}" stroke="${color}">${paths}</g>`;
}

window.MJ_GLYPH = glyph;
