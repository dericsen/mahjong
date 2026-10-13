'use strict';
/* Mahjong Online — browser client (vanilla JS, no build step). */

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/* ---------------- tiles ---------------- */
const HONOR_NAME = ['Timur', 'Selatan', 'Barat', 'Utara', 'Naga Merah', 'Naga Hijau', 'Naga Putih'];
const FLOWER_NAME = ['Plum', 'Anggrek', 'Krisan', 'Bambu', 'Semi', 'Panas', 'Gugur', 'Dingin'];
const SUIT_NAME = ['Karakter', 'Bulatan', 'Bambu'];
const WIND_SHORT = ['Timur', 'Selatan', 'Barat', 'Utara'];

function tileName(k) {
  if (k < 27) return `${(k % 9) + 1} ${SUIT_NAME[Math.floor(k / 9)]}`;
  if (k < 34) return HONOR_NAME[k - 27];
  return FLOWER_NAME[k - 34];
}

function tileEl(k, extra = '') {
  const t = el('div', 'tile ' + extra);
  if (k === null || k === undefined) { t.classList.add('back'); return t; }
  t.title = tileName(k);
  if (k < 9) t.classList.add('suit-k');
  else if (k < 18) t.classList.add('suit-d');
  else if (k < 27) t.classList.add('suit-b');
  else if (k < 34) t.classList.add('honor');
  else t.classList.add('flower');
  t.innerHTML = `<svg class="face" viewBox="0 0 60 84" aria-hidden="true">${window.MJ_TILE_ART(k)}</svg>`;
  return t;
}

function meldEl(m, size = 'small') {
  const box = el('span', 'meld');
  let tiles;
  if (m.type === 'chow') tiles = [m.tile, m.tile + 1, m.tile + 2];
  else tiles = new Array(m.type === 'kong' ? 4 : 3).fill(m.tile);
  tiles.forEach((t, i) => {
    const hidden = m.concealed && m.type === 'kong' && (i === 1 || i === 2);
    box.appendChild(tileEl(hidden ? null : t, size));
  });
  return box;
}

/* ---------------- session ---------------- */
const store = {
  get name() { return localStorage.getItem('mj.name') || ''; },
  set name(v) { localStorage.setItem('mj.name', v); },
  token(code) { return localStorage.getItem('mj.token.' + code); },
  setToken(code, t) { localStorage.setItem('mj.token.' + code, t); },
};

let roomCode = null, token = null, es = null, state = null, selectedTile = null, timerHandle = null;

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-player-token': token || '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.add('hidden'), 2600);
}

function show(screen) {
  ['home', 'room', 'game'].forEach((s) => $('#screen-' + s).classList.toggle('hidden', s !== screen));
}

function enterRoom(code, t) {
  roomCode = code;
  token = t;
  store.setToken(code, t);
  history.replaceState(null, '', '/?room=' + code);
  connect();
}

function connect() {
  if (es) es.close();
  es = new EventSource(`/api/room/${roomCode}/events?token=${encodeURIComponent(token)}`);
  es.addEventListener('state', (ev) => { state = JSON.parse(ev.data); render(); });
  es.onerror = () => { /* EventSource reconnects automatically */ };
}

async function act(action) {
  try {
    await api(`/api/room/${roomCode}/action`, action);
    selectedTile = null;
  } catch (e) { toast(e.message); }
}

/* ---------------- home ---------------- */
$('#name').value = store.name;
$('#btn-create').onclick = async () => {
  const name = $('#name').value.trim();
  if (!name) return ($('#home-error').textContent = 'Isi nama dulu ya.');
  store.name = name;
  token = null;
  try { const r = await api('/api/room', { name }); enterRoom(r.code, r.token); } catch (e) { $('#home-error').textContent = e.message; }
};
$('#btn-join').onclick = () => joinRoom($('#join-code').value.trim().toUpperCase());

async function joinRoom(code) {
  const name = $('#name').value.trim();
  if (!code) return ($('#home-error').textContent = 'Masukkan kode room.');
  if (!name) return ($('#home-error').textContent = 'Isi nama dulu ya.');
  store.name = name;
  token = store.token(code);
  try { const r = await api(`/api/room/${code}/join`, { name }); enterRoom(r.code, r.token); } catch (e) { $('#home-error').textContent = e.message; }
}

/* ---------------- waiting room ---------------- */
$('#btn-copy').onclick = () => { $('#share-link').select(); navigator.clipboard?.writeText($('#share-link').value); toast('Link disalin'); };
$('#btn-start').onclick = async () => {
  try { await api(`/api/room/${roomCode}/start`, {}); } catch (e) { $('#room-error').textContent = e.message; }
};

function renderRoom() {
  const L = state.lobby;
  show('room');
  $('#room-code').textContent = L.code;
  $('#share-link').value = `${location.origin}/?room=${L.code}`;
  const list = $('#seat-list');
  list.innerHTML = '';
  L.seats.forEach((s, i) => {
    const li = el('li');
    if (!s) li.innerHTML = `<span class="num">${i + 1}</span><span class="empty">Kosong — akan diisi bot</span>`;
    else li.innerHTML = `<span class="num">${i + 1}</span>${escapeHtml(s.name)}${i === L.you ? ' <b>(kamu)</b>' : ''}<span class="dot ${s.connected ? 'on' : ''}"></span>`;
    list.appendChild(li);
  });
  $('#btn-start').classList.toggle('hidden', !L.isHost);
  $('#room-wait').classList.toggle('hidden', L.isHost);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------------- game ---------------- */
function render() {
  if (!state) return;
  if (!state.game) return renderRoom();
  show('game');
  renderGame(state.game);
}

const pos = (g, seat) => (seat - g.you + 4) % 4; // 0 = me, 1 = right, 2 = top, 3 = left

const WIND_GLYPH = ['DONG', 'NAN', 'XI', 'BEI'];
function windSvg(name, color) { return `<svg class="wind-g" viewBox="0 0 70 70">${window.MJ_GLYPH(name, color, 13, 13, 44)}</svg>`; }
function playerHeader(g, p) {
  const dealer = p.seat === g.dealer;
  const connected = state.lobby.seats[p.seat]?.connected;
  const scoreCls = p.score > 0 ? 'pos' : p.score < 0 ? 'neg' : '';
  const tag = p.bot ? '<span class="bot-tag">bot</span>' : connected ? '' : '<span class="bot-tag">offline</span>';
  const windGlyph = windSvg(WIND_GLYPH[p.seatWind - 27], dealer ? '#fff' : '#e9e2d2');
  return `<div class="pname"><span class="wind ${dealer ? 'dealer' : ''}" title="Angin ${WIND_SHORT[p.seatWind - 27]}${dealer ? ' · Dealer' : ''}">${windGlyph}</span>` +
    `<span>${escapeHtml(p.name)}</span>${tag}<span class="score ${scoreCls}">${p.score >= 0 ? '+' : ''}${p.score}</span></div>`;
}

function renderGame(g) {
  const me = g.you >= 0 ? g.players[g.you] : null;
  // info bar
  $('#info').innerHTML =
    `<span class="chip">Ronde <b>${WIND_SHORT[g.prevalentWind - 27]}</b></span><span class="sep"></span>` +
    `<span class="chip">Tangan <b>${g.handIndex + 1}/${g.handsPerGame}</b></span><span class="sep"></span>` +
    `<span class="chip">Tembok <b>${g.wallRemaining}</b></span><span class="sep"></span>` +
    `<span class="chip">Giliran <b>${escapeHtml(g.players[g.current]?.name || '-')}</b></span>` +
    `<span class="timer" id="timer"></span>`;

  // opponents
  for (const p of g.players) {
    const ps = g.you >= 0 ? pos(g, p.seat) : p.seat;
    const pile = document.querySelector(`.pile[data-pos="${ps}"]`);
    pile.innerHTML = '';
    p.discards.forEach((t, i) => {
      const isLast = g.lastDiscard && g.lastDiscard.from === p.seat && i === p.discards.length - 1;
      pile.appendChild(tileEl(t, isLast ? 'last' : ''));
    });
    if (ps === 0 && g.you >= 0) continue;
    const box = document.querySelector(`.seat[data-pos="${ps}"]`);
    box.classList.toggle('active', g.current === p.seat && g.phase === 'turn');
    box.innerHTML = playerHeader(g, p);
    const melds = el('div', 'melds');
    p.melds.forEach((m) => melds.appendChild(meldEl(m, 'small')));
    if (p.flowers.length) { const f = el('span', 'flowers'); p.flowers.forEach((t) => f.appendChild(tileEl(t, 'small'))); melds.appendChild(f); }
    box.appendChild(melds);
    const backs = el('div', 'backs');
    if (p.hand) p.hand.forEach((t) => backs.appendChild(tileEl(t, 'tiny')));
    else for (let i = 0; i < p.handCount; i++) backs.appendChild(tileEl(null, 'tiny'));
    box.appendChild(backs);
  }

  if (!me) return;
  const bottom = $('.seat-bottom');
  bottom.classList.toggle('active', g.current === me.seat && g.phase === 'turn');
  $('#my-header').innerHTML = playerHeader(g, me);
  const myMelds = $('#my-melds');
  myMelds.innerHTML = '';
  me.melds.forEach((m) => myMelds.appendChild(meldEl(m, 'small')));
  if (me.flowers.length) { const f = el('span', 'flowers'); me.flowers.forEach((t) => f.appendChild(tileEl(t, 'small'))); myMelds.appendChild(f); }

  // hand (drawn tile shown separately at the end)
  const handBox = $('#my-hand');
  handBox.innerHTML = '';
  const canDiscard = g.options && g.options.kind === 'turn';
  handBox.classList.toggle('disabled', !canDiscard);
  let tiles = me.hand.slice();
  let drawn = null;
  if (g.drawnTile !== null && g.drawnTile !== undefined) {
    const i = tiles.indexOf(g.drawnTile);
    if (i >= 0) { tiles.splice(i, 1); drawn = g.drawnTile; }
  }
  const addTile = (t, isDrawn, idx) => {
    const id = `${t}:${idx}`;
    const te = tileEl(t, (isDrawn ? 'drawn ' : '') + (selectedTile === id ? 'selected' : ''));
    te.onclick = () => {
      if (!canDiscard) return;
      if (selectedTile === id) act({ type: 'discard', tile: t });
      else { selectedTile = id; renderGame(g); }
    };
    te.ondblclick = () => canDiscard && act({ type: 'discard', tile: t });
    handBox.appendChild(te);
  };
  tiles.forEach((t, i) => addTile(t, false, i));
  if (drawn !== null) addTile(drawn, true, 'd');

  // waits
  const w = $('#my-waits');
  w.innerHTML = '';
  if (g.waits && g.waits.length) {
    w.appendChild(el('span', 'label', 'Menunggu'));
    g.waits.forEach((t) => w.appendChild(tileEl(t, 'tiny wait')));
    w.appendChild(el('span', 'label', '· butuh ≥ 8 poin'));
  }

  renderActions(g);
  renderLog(g);
  renderResult(g);
  startTimer(g.deadline);
}

function renderActions(g) {
  const box = $('#actions');
  box.innerHTML = '';
  const o = g.options;
  const btn = (label, cls, fn) => { const b = el('button', cls, label); b.onclick = fn; box.appendChild(b); return b; };
  if (!o) {
    if (g.phase === 'turn' && g.current !== g.you) box.append(`Menunggu ${g.players[g.current].name}…`);
    if (g.phase === 'claim' || g.phase === 'rob') box.append('Menunggu pemain lain…');
    return;
  }
  if (o.kind === 'turn') {
    if (o.win) btn('MAHJONG! (Tsumo)', 'win', () => act({ type: 'win' }));
    (o.kongs || []).forEach((k) => {
      const b = btn('', '', () => act({ type: 'kong', tile: k.tile }));
      b.append(k.kind === 'concealed' ? 'Kong tertutup ' : 'Tambah Kong ');
      b.appendChild(tileEl(k.tile, 'tiny'));
    });
    if (selectedTile) {
      const t = Number(selectedTile.split(':')[0]);
      const b = btn('Buang ', 'primary', () => act({ type: 'discard', tile: t }));
      b.appendChild(tileEl(t, 'tiny'));
    } else box.append('Giliranmu — pilih tile untuk dibuang');
    return;
  }
  if (o.kind === 'claim' || o.kind === 'rob') {
    const lbl = el('span', 'claim-tile');
    lbl.append(o.kind === 'rob' ? 'Rampok Kong?' : 'Buangan');
    lbl.appendChild(tileEl(o.tile, 'small'));
    box.appendChild(lbl);
    if (o.win) btn('MAHJONG!', 'win', () => act({ type: 'win' }));
    if (o.kong) btn('Kong', 'primary', () => act({ type: 'kong' }));
    if (o.pung) btn('Pung', 'primary', () => act({ type: 'pung' }));
    (o.chows || []).forEach((s) => {
      const b = btn('Chow ', 'primary', () => act({ type: 'chow', start: s }));
      [s, s + 1, s + 2].forEach((t) => b.appendChild(tileEl(t, 'tiny')));
    });
    btn('Lewati', '', () => act({ type: 'pass' }));
  }
}

let lastLogLen = 0;
function renderLog(g) {
  const log = $('#log');
  log.innerHTML = '<h4>Riwayat</h4>';
  const lines = g.log.slice().reverse();
  const fresh = g.log.length > lastLogLen ? g.log.length - lastLogLen : 0;
  lines.forEach((m, i) => log.appendChild(el('div', 'line' + (i < fresh && lastLogLen ? ' fresh' : ''), escapeHtml(m))));
  lastLogLen = g.log.length;
}

function renderResult(g) {
  const modal = $('#modal');
  if (g.phase !== 'ended' || !g.result) { modal.classList.add('hidden'); return; }
  const r = g.result;
  const body = $('#modal-body');
  body.innerHTML = '';
  if (r.type === 'win') {
    const w = g.players[r.winner];
    const banner = el('div', 'result-banner');
    banner.appendChild(el('div', 'big', '🀄 Mahjong!'));
    banner.appendChild(el('h2', '', escapeHtml(w.name)));
    banner.appendChild(el('p', 'hint', r.selfDrawn ? 'Tsumo — tarik sendiri' : `Menang dari buangan ${escapeHtml(g.players[r.from].name)}${r.robbingKong ? ' (merampok Kong)' : ''}`));
    body.appendChild(banner);
    const tbl = el('table', 'fans');
    r.fans.forEach((f) => tbl.appendChild(el('tr', '', `<td>${escapeHtml(f.name)}${f.count > 1 ? ' ×' + f.count : ''}</td><td>+${f.points * f.count}</td>`)));
    tbl.appendChild(el('tr', 'total', `<td>Total</td><td>${r.total} poin</td>`));
    body.appendChild(tbl);
  } else {
    const banner = el('div', 'result-banner');
    banner.appendChild(el('div', 'big draw', 'Seri'));
    banner.appendChild(el('p', 'hint', 'Tembok habis — tidak ada pemenang'));
    body.appendChild(banner);
  }
  body.appendChild(el('h3', '', 'Tangan pemain'));
  g.players.forEach((p) => {
    const row = el('div', 'reveal');
    const pay = r.payments[p.seat];
    const lbl = el('span', 'label');
    lbl.innerHTML = `${escapeHtml(p.name)} <span class="pay ${pay > 0 ? 'pos' : pay < 0 ? 'neg' : ''}">${pay > 0 ? '+' : ''}${pay}</span>`;
    row.appendChild(lbl);
    p.melds.forEach((m) => row.appendChild(meldEl(m, 'tiny')));
    (p.hand || []).forEach((t) => row.appendChild(tileEl(t, 'tiny' + (r.type === 'win' && p.seat === r.winner && t === r.tile ? ' last' : ''))));
    body.appendChild(row);
  });
  if (g.gameOver) {
    const ranking = g.players.slice().sort((a, b) => b.score - a.score);
    body.appendChild(el('h3', '', '🏆 Permainan selesai — Klasemen'));
    const ol = el('ol', 'rank-list');
    ranking.forEach((p) => { const li = el('li'); li.innerHTML = `${escapeHtml(p.name)}<span class="pts">${p.score >= 0 ? '+' : ''}${p.score}</span>`; ol.appendChild(li); });
    body.appendChild(ol);
    if (state.lobby.isHost) {
      const b = el('button', 'primary block', 'Main lagi');
      b.onclick = () => api(`/api/room/${roomCode}/start`, {}).catch((e) => toast(e.message));
      body.appendChild(b);
    }
  } else if (g.options && g.options.kind === 'next') {
    const b = el('button', 'primary block', 'Lanjut ke tangan berikutnya ');
    b.onclick = () => act({ type: 'next' });
    b.appendChild(el('span', 'timer', '')).id = 'timer2';
    body.appendChild(b);
  } else {
    body.appendChild(el('p', 'hint', 'Menunggu pemain lain…'));
  }
  modal.classList.remove('hidden');
}

function startTimer(deadline) {
  clearInterval(timerHandle);
  const tick = () => {
    const s = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null;
    const txt = s !== null ? `(${s} dtk)` : '';
    const t1 = $('#timer'); if (t1) t1.textContent = txt;
    const t2 = $('#timer2'); if (t2) t2.textContent = txt;
  };
  tick();
  if (deadline) timerHandle = setInterval(tick, 500);
}

/* ---------------- boot ---------------- */
(function boot() {
  const logo = $('#logo-tile');
  if (logo) logo.innerHTML = window.MJ_TILE_ART(4); // 5 of characters as the brand mark
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') || '').toUpperCase();
  if (!code) return show('home');
  const t = store.token(code);
  if (t) {
    token = t;
    api(`/api/room/${code}/state`)
      .then((s) => {
        if (s.lobby.you >= 0) return enterRoom(code, t);
        show('home'); $('#join-code').value = code; // token no longer valid for this room
      })
      .catch((e) => { show('home'); $('#home-error').textContent = e.message; });
    return;
  }
  // invited via link: ask for name then join
  show('home');
  $('#join-code').value = code;
  if (store.name) joinRoom(code);
})();
