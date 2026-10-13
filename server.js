'use strict';
/**
 * Mahjong Online server — zero dependencies (Node.js >= 18).
 *  - Static files from ./public
 *  - REST: POST /api/room (create), POST /api/room/:code/join, POST /api/room/:code/start,
 *          POST /api/room/:code/action, GET /api/room/:code/state
 *  - Realtime: GET /api/room/:code/events  (Server-Sent Events)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game } = require('./src/game');

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;
const BOT_NAMES = ['Bot Naga', 'Bot Bambu', 'Bot Bunga', 'Bot Angin'];

/** rooms: code -> { code, hostToken, seats: [{token,name,bot}|null], game, clients:Set<{res,token}>, touched } */
const rooms = new Map();

const newCode = () => {
  let code;
  do code = crypto.randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(code));
  return code;
};
const newToken = () => crypto.randomBytes(16).toString('hex');
const cleanName = (n) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 20) || 'Pemain';

function seatOf(room, token) {
  return room.seats.findIndex((s) => s && s.token === token);
}

function lobbyView(room, token) {
  return {
    code: room.code,
    started: !!room.game,
    isHost: token === room.hostToken,
    you: seatOf(room, token),
    seats: room.seats.map((s) => (s ? { name: s.name, bot: s.bot, connected: s.bot || isConnected(room, s.token) } : null)),
  };
}

function isConnected(room, token) {
  for (const c of room.clients) if (c.token === token) return true;
  return false;
}

function stateFor(room, token) {
  const seat = seatOf(room, token);
  return { lobby: lobbyView(room, token), game: room.game ? room.game.viewFor(seat) : null };
}

function broadcast(room) {
  room.touched = Date.now();
  for (const c of room.clients) sendEvent(c.res, 'state', stateFor(room, c.token));
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10_000) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA fallback so /room/ABC123 links work
      if (!path.extname(rel)) return serveStatic(req, res, '/index.html');
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function startGame(room) {
  room.seats = room.seats.map((s, i) => s || { token: null, name: BOT_NAMES[i], bot: true });
  room.game = new Game(room.seats.map((s) => ({ name: s.name, bot: s.bot })), {
    onUpdate: () => broadcast(room),
  });
  room.game.start();
}

async function handleApi(req, res, parts, url) {
  // parts: ['api', 'room', code?, action?]
  const token = req.headers['x-player-token'] || url.searchParams.get('token') || '';

  if (req.method === 'POST' && parts.length === 2) {
    const body = await readBody(req);
    const code = newCode();
    const t = newToken();
    const room = { code, hostToken: t, seats: [null, null, null, null], game: null, clients: new Set(), touched: Date.now() };
    room.seats[0] = { token: t, name: cleanName(body.name), bot: false };
    rooms.set(code, room);
    return json(res, 200, { code, token: t });
  }

  const room = rooms.get((parts[2] || '').toUpperCase());
  if (!room) return json(res, 404, { error: 'Room tidak ditemukan' });
  const action = parts[3];

  if (req.method === 'GET' && action === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const client = { res, token };
    room.clients.add(client);
    sendEvent(res, 'state', stateFor(room, token));
    broadcast(room); // update "connected" flags for everyone
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); room.clients.delete(client); broadcast(room); });
    return;
  }

  if (req.method === 'GET' && action === 'state') return json(res, 200, stateFor(room, token));

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await readBody(req);

  if (action === 'join') {
    const existing = seatOf(room, token);
    if (existing >= 0) return json(res, 200, { code: room.code, token });
    if (room.game) return json(res, 409, { error: 'Permainan sudah dimulai' });
    const free = room.seats.findIndex((s) => !s);
    if (free < 0) return json(res, 409, { error: 'Room penuh' });
    const t = newToken();
    room.seats[free] = { token: t, name: cleanName(body.name), bot: false };
    broadcast(room);
    return json(res, 200, { code: room.code, token: t });
  }

  if (action === 'start') {
    if (token !== room.hostToken) return json(res, 403, { error: 'Hanya host yang bisa memulai' });
    if (room.game && !room.game.gameOver) return json(res, 409, { error: 'Permainan sedang berlangsung' });
    if (room.game) { room.game.destroy(); room.game = null; room.seats = room.seats.map((s) => (s && s.bot ? null : s)); }
    startGame(room);
    broadcast(room);
    return json(res, 200, { ok: true });
  }

  if (action === 'action') {
    if (!room.game) return json(res, 409, { error: 'Permainan belum dimulai' });
    const seat = seatOf(room, token);
    if (seat < 0) return json(res, 403, { error: 'Kamu bukan pemain di room ini' });
    const a = body || {};
    const clean = { type: String(a.type || '') };
    if (a.tile !== undefined) clean.tile = Number(a.tile);
    if (a.start !== undefined) clean.start = Number(a.start);
    const r = room.game.act(seat, clean);
    if (!r.ok) return json(res, 400, { error: r.error });
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'api' && parts[1] === 'room') return await handleApi(req, res, parts, url);
    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    res.writeHead(405); res.end();
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message });
  }
});

// clean up idle rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.clients.size === 0 && now - room.touched > ROOM_IDLE_MS) {
      if (room.game) room.game.destroy();
      rooms.delete(code);
    }
  }
}, 60_000).unref();

server.listen(PORT, () => console.log(`Mahjong Online berjalan di http://localhost:${PORT}`));
