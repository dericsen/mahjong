'use strict';
/* SVG face artwork for every Mahjong tile. Each builder returns inner SVG markup
   drawn on a 60x84 viewBox (the <svg> wrapper is added by tileFace). Vector art
   means tiles look authentic at any size and without CJK fonts. */

const RED = '#c0202a', GREEN = '#1f7a3d', BLUE = '#1b4f9c', BLACK = '#2a2a2a', GOLD = '#b8860b';

/* ---- dots (bulatan) ---- */
function dot(cx, cy, r, ring) {
  // concentric ring like a real "circle" tile
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ring}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="#fff"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.34}" fill="${ring}"/>`;
}
function dots(n) {
  const col = (i) => [RED, GREEN, BLUE][i % 3];
  const R = 7;
  // layouts per number, coordinates on 60x84
  const P = {
    1: [[30, 42, 15, GREEN]],
    2: [[30, 24], [30, 60]],
    3: [[18, 20], [30, 42], [42, 64]],
    4: [[20, 24], [40, 24], [20, 60], [40, 60]],
    5: [[20, 24], [40, 24], [30, 42], [20, 60], [40, 60]],
    6: [[20, 22], [40, 22], [20, 42], [40, 42], [20, 62], [40, 62]],
    7: [[30, 18], [20, 34], [40, 34], [30, 42], [20, 62], [40, 62], [30, 62]],
    8: [[20, 18], [40, 18], [20, 36], [40, 36], [20, 54], [40, 54], [20, 72], [40, 72]],
    9: [[18, 20], [30, 20], [42, 20], [18, 42], [30, 42], [42, 42], [18, 64], [30, 64], [42, 64]],
  };
  if (n === 1) { const [x, y, r] = P[1][0]; return dot(x, y, r, RED) + dot(x, y, r, GREEN).replace(/#1f7a3d/g, 'none'); }
  return P[n].map((p, i) => dot(p[0], p[1], R, col(n === 9 ? Math.floor(i / 3) : n <= 2 ? 2 : i))).join('');
}

/* ---- bamboo (bambu) ---- */
function stick(x, y, h, col) {
  const w = 5;
  return `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="${col}"/>` +
    `<rect x="${x - w / 2}" y="${y + h / 2 - 1.4}" width="${w}" height="2.8" fill="rgba(0,0,0,.22)"/>`;
}
function bird() {
  // the "1 of bamboo" is traditionally a sparrow — a stylised bird
  return `<g transform="translate(30 40)">
    <ellipse cx="0" cy="4" rx="12" ry="15" fill="${GREEN}"/>
    <circle cx="0" cy="-13" r="7" fill="${GREEN}"/>
    <path d="M0 -18 L4 -24 L-1 -22 Z" fill="${RED}"/>
    <circle cx="2.5" cy="-14" r="1.6" fill="#fff"/>
    <path d="M-10 2 Q-24 0 -22 10 Q-14 10 -8 10 Z" fill="${BLUE}"/>
    <path d="M8 14 L4 24 M-4 15 L-6 25" stroke="${GOLD}" stroke-width="2" fill="none"/>
  </g>`;
}
function bamboos(n) {
  const col = (i) => [GREEN, GREEN, GREEN][i] || GREEN;
  if (n === 1) return bird();
  const rows = {
    2: [[30, 2]],
    3: [[18, 2], [42, 2], [30, 2]], // handled specially below
  };
  const H = 22;
  const place = [];
  const colOf = (i, total) => (total >= 6 && i < 2 ? RED : GREEN);
  // columns of two except specific layouts
  const layout = {
    2: [[30, 1]],
    3: [[18, 1], [42, 1], [30, 1]],
    4: [[18, 1], [42, 1], [18, 1], [42, 1]],
    5: [[18, 1], [42, 1], [30, 1], [18, 1], [42, 1]],
    6: [[16, 1], [30, 1], [44, 1], [16, 1], [30, 1], [44, 1]],
    7: [[30, 1], [16, 1], [30, 1], [44, 1], [16, 1], [30, 1], [44, 1]],
    8: [[16, 1], [30, 1], [44, 1], [16, 1], [30, 1], [44, 1], [23, 1], [37, 1]],
    9: [[16, 1], [30, 1], [44, 1], [16, 1], [30, 1], [44, 1], [16, 1], [30, 1], [44, 1]],
  };
  // vertical grouping: for 2 and others we stack per column
  const cols = {};
  if (n === 2) return stick(22, 18, 48, GREEN) + stick(38, 18, 48, GREEN);
  if (n === 3) return stick(18, 18, 48, GREEN) + stick(30, 18, 48, RED) + stick(42, 18, 48, GREEN);
  if (n === 4) return [18, 42].map((x) => stick(x, 10, 30, GREEN) + stick(x, 46, 30, GREEN)).join('');
  if (n === 5) return [18, 42].map((x) => stick(x, 10, 30, GREEN) + stick(x, 46, 30, GREEN)).join('') + stick(30, 28, 30, RED);
  if (n === 6) return [16, 30, 44].map((x, i) => stick(x, 10, 30, i === 1 ? GREEN : GREEN) + stick(x, 46, 30, GREEN)).join('');
  if (n === 7) return stick(30, 6, 24, RED) + [16, 30, 44].map((x) => stick(x, 34, 24, GREEN) + stick(x, 60, 20, GREEN)).join('');
  if (n === 8) {
    const top = [16, 30, 44].map((x) => stick(x, 8, 24, GREEN)).join('');
    const bot = [16, 30, 44].map((x) => stick(x, 38, 24, GREEN)).join('');
    const mid = stick(23, 64, 16, GREEN) + stick(37, 64, 16, GREEN);
    return top + bot;
  }
  if (n === 9) return [16, 30, 44].map((x) => [8, 32, 56].map((y, r) => stick(x, y, 20, r === 0 ? RED : GREEN)).join('')).join('');
  return '';
}

/* ---- characters (karakter / wan): top = Arabic numeral, bottom = 萬 glyph ---- */
function characters(n) {
  return `<text x="30" y="33" font-size="27" font-weight="800" text-anchor="middle" fill="${BLACK}" font-family="Sora,system-ui,sans-serif">${n}</text>` +
    window.MJ_GLYPH('WAN', RED, 11, 38, 38);
}

/* ---- honors: vector glyphs, no font needed ---- */
function honor(name, color) {
  return window.MJ_GLYPH(name, color, 13, 20, 44);
}
function whiteDragon() {
  return `<rect x="13" y="15" width="34" height="54" rx="5" fill="none" stroke="${BLUE}" stroke-width="4"/>` +
    `<line x1="19" y1="21" x2="41" y2="63" stroke="${BLUE}" stroke-width="3"/>`;
}

/* ---- flowers & seasons: a drawn blossom/leaf + a number badge (no CJK) ---- */
function flower(k) {
  const idx = k - 34;              // 0..7 (0-3 flowers, 4-7 seasons)
  const isSeason = idx >= 4;
  const n = (idx % 4) + 1;
  const color = isSeason ? GREEN : RED;
  let art;
  if (isSeason) {
    // a sprig/leaf motif
    art = `<path d="M30 60 Q30 34 30 22" stroke="${GREEN}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
      `<path d="M30 44 Q16 40 12 28 Q26 28 30 44Z" fill="${GREEN}"/>` +
      `<path d="M30 36 Q44 32 48 20 Q34 20 30 36Z" fill="${GREEN}" opacity=".85"/>` +
      `<path d="M30 52 Q20 50 16 42 Q28 42 30 52Z" fill="${GREEN}" opacity=".7"/>`;
  } else {
    const petals = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const cx = 30 + Math.cos(a) * 10, cy = 32 + Math.sin(a) * 10;
      return `<ellipse cx="${cx}" cy="${cy}" rx="6" ry="9" transform="rotate(${(a * 180) / Math.PI + 90} ${cx} ${cy})" fill="${color}" opacity=".9"/>`;
    }).join('');
    art = petals + `<circle cx="30" cy="32" r="4.5" fill="${GOLD}"/>`;
  }
  return art +
    `<circle cx="30" cy="68" r="12" fill="${isSeason ? GREEN : GOLD}"/>` +
    `<text x="30" y="74" font-size="16" font-weight="800" text-anchor="middle" fill="#fff" font-family="Sora,system-ui,sans-serif">${n}</text>`;
}

/* ---- dispatcher ---- */
function tileArt(k) {
  if (k < 9) return characters(k + 1);
  if (k < 18) return dots(k - 9 + 1);
  if (k < 27) return bamboos(k - 18 + 1);
  if (k < 34) {
    const h = k - 27;
    if (h === 0) return honor('DONG', BLUE);
    if (h === 1) return honor('NAN', BLUE);
    if (h === 2) return honor('XI', BLUE);
    if (h === 3) return honor('BEI', BLUE);
    if (h === 4) return honor('ZHONG', RED);
    if (h === 5) return honor('FA', GREEN);
    return whiteDragon();
  }
  return flower(k);
}

window.MJ_TILE_ART = tileArt;
