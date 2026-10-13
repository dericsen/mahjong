'use strict';
/**
 * Authoritative game engine for one table (4 seats), Chinese Official rules.
 * Seat order 0..3 is the turn order (East -> South -> West -> North for the dealer rotation).
 */
const T = require('./tiles');
const H = require('./hand');
const S = require('./scoring');
const AI = require('./ai');

const DEAD_WALL = 14;
const HANDS_PER_GAME = 16;
const WIND_NAMES = ['Timur', 'Selatan', 'Barat', 'Utara'];

class Game {
  /**
   * @param {Array<{name:string, bot:boolean}>} players  exactly 4
   * @param {object} opts { onUpdate(game), botDelay, claimTimeout, turnTimeout, nextHandTimeout, schedule }
   */
  constructor(players, opts = {}) {
    if (players.length !== 4) throw new Error('Need 4 players');
    this.players = players.map((p, i) => ({ name: p.name, bot: !!p.bot, seat: i }));
    this.opts = {
      botDelay: 700, claimTimeout: 12000, turnTimeout: 30000, nextHandTimeout: 20000,
      onUpdate: () => {}, schedule: (fn, ms) => setTimeout(fn, ms), cancel: (h) => clearTimeout(h),
      ...opts,
    };
    this.scores = [0, 0, 0, 0];
    this.handIndex = 0;
    this.history = [];
    this.gameOver = false;
    this.timers = [];
    this.version = 0;
  }

  /* ======================= lifecycle ======================= */

  start() { this.startHand(); }

  destroy() { this.clearTimers(); this.destroyed = true; }

  startHand() {
    this.clearTimers();
    this.dealer = this.handIndex % 4;
    this.prevalentWind = T.EAST + Math.floor(this.handIndex / 4);
    this.wall = T.buildWall(true);
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.flowers = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.log = [];
    this.result = null;
    this.lastDiscard = null;
    this.pending = null;
    this.drawn = null;
    this.readyNext = new Set();

    // deal: 13 each, dealer 14
    for (let r = 0; r < 13; r++) for (let i = 0; i < 4; i++) this.hands[(this.dealer + i) % 4].push(this.wall.shift());
    this.hands[this.dealer].push(this.wall.shift());
    // flower replacement, starting with the dealer
    for (let i = 0; i < 4; i++) {
      const seat = (this.dealer + i) % 4;
      let f;
      while ((f = this.hands[seat].find(T.isFlower)) !== undefined) {
        this.hands[seat].splice(this.hands[seat].indexOf(f), 1);
        this.flowers[seat].push(f);
        this.hands[seat].push(this.wall.pop());
      }
    }
    this.addLog(`Ronde ${WIND_NAMES[this.prevalentWind - T.EAST]}, tangan ke-${this.handIndex + 1}. Dealer: ${this.players[this.dealer].name}`);
    this.phase = 'turn';
    this.current = this.dealer;
    this.drawn = { tile: this.hands[this.dealer][13], kongReplacement: false, lastWall: false, canAct: true };
    this.mustDiscardOnly = false;
    this.scheduleTurn();
    this.afterChange();
  }

  /* ======================= helpers ======================= */

  seatWind(seat) { return T.EAST + ((seat - this.dealer + 4) % 4); }
  wallRemaining() { return this.wall.length - DEAD_WALL; }
  addLog(msg) { this.log.push(msg); if (this.log.length > 60) this.log.shift(); }
  name(seat) { return this.players[seat].name; }

  clearTimers() { this.timers.forEach((h) => this.opts.cancel(h)); this.timers = []; }
  later(fn, ms) {
    const h = this.opts.schedule(() => {
      this.timers = this.timers.filter((x) => x !== h);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.push(h);
  }

  meldTiles(seat) {
    const out = [];
    for (const m of this.melds[seat]) {
      if (m.type === 'chow') out.push(m.tile, m.tile + 1, m.tile + 2);
      else out.push(...new Array(m.type === 'kong' ? 4 : 3).fill(m.tile));
    }
    return out;
  }

  /** Counts of tiles visible to everybody (discards + exposed melds). */
  visibleCounts() {
    const c = new Array(34).fill(0);
    this.discards.forEach((d) => d.forEach((t) => c[t]++));
    for (let s = 0; s < 4; s++) this.meldTiles(s).forEach((t) => c[t]++);
    return c;
  }

  buildCtx(seat, winTile, { selfDrawn, robbingKong = false }) {
    const concealed = this.hands[seat].slice();
    if (!selfDrawn) concealed.push(winTile);
    const vis = this.visibleCounts();
    let seen = vis[winTile];
    if (!selfDrawn && !robbingKong && this.lastDiscard) seen -= 1; // the claimed discard itself
    return {
      concealed,
      melds: this.melds[seat].map((m) => ({ type: m.type, tile: m.tile, concealed: !!m.concealed })),
      winTile,
      selfDrawn,
      seatWind: this.seatWind(seat),
      prevalentWind: this.prevalentWind,
      flowers: this.flowers[seat].length,
      lastTileOfKind: seen >= 3,
      lastWallDraw: selfDrawn && this.drawn && this.drawn.lastWall,
      lastDiscard: !selfDrawn && !robbingKong && this.lastDiscard && this.lastDiscard.isLast,
      kongReplacement: selfDrawn && this.drawn && this.drawn.kongReplacement,
      robbingKong,
    };
  }

  /** Returns score result if `seat` may legally win with winTile (>= 8 points), else null. */
  winCheck(seat, winTile, opts) {
    const ctx = this.buildCtx(seat, winTile, opts);
    const counts = T.toCounts(ctx.concealed);
    if (!H.isWinningShape(counts, ctx.melds.length)) return null;
    const r = S.score(ctx);
    if (!r || r.base < S.MIN_POINTS) return null;
    return r;
  }

  /* ======================= option computation ======================= */

  turnOptions(seat) {
    if (this.phase !== 'turn' || seat !== this.current) return null;
    const hand = this.hands[seat];
    const opts = { discard: true, win: false, kongs: [] };
    if (!this.mustDiscardOnly && this.drawn) {
      opts.win = !!this.winCheck(seat, this.drawn.tile, { selfDrawn: true });
      if (this.wallRemaining() > 0) {
        const counts = T.toCounts(hand);
        for (let k = 0; k < 34; k++) if (counts[k] === 4) opts.kongs.push({ tile: k, kind: 'concealed' });
        for (const m of this.melds[seat]) {
          if (m.type === 'pung' && counts[m.tile] >= 1) opts.kongs.push({ tile: m.tile, kind: 'add' });
        }
      }
    }
    return opts;
  }

  claimOptions(seat, tile, from) {
    const opts = { win: false, pung: false, kong: false, chows: [] };
    if (seat === from) return null;
    opts.win = !!this.winCheck(seat, tile, { selfDrawn: false });
    const counts = T.toCounts(this.hands[seat]);
    const last = this.lastDiscard && this.lastDiscard.isLast;
    if (!last) {
      if (counts[tile] >= 2) opts.pung = true;
      if (counts[tile] >= 3 && this.wallRemaining() > 0) opts.kong = true;
      if ((from + 1) % 4 === seat && T.isSuited(tile)) {
        const n = T.numOf(tile);
        for (let start = tile - 2; start <= tile; start++) {
          const sn = n - (tile - start);
          if (sn < 1 || sn > 7) continue;
          const need = [start, start + 1, start + 2].filter((x) => x !== tile);
          if (need.every((x) => counts[x] > 0)) opts.chows.push(start);
        }
      }
    }
    if (!opts.win && !opts.pung && !opts.kong && !opts.chows.length) return null;
    return opts;
  }

  /* ======================= actions ======================= */

  /** Entry point for all player input. Returns {ok, error}. */
  act(seat, action) {
    if (this.gameOver) return { ok: false, error: 'Permainan sudah selesai' };
    try {
      switch (this.phase) {
        case 'turn': return this.actTurn(seat, action);
        case 'claim':
        case 'rob': return this.actClaim(seat, action);
        case 'ended':
          if (action.type === 'next') { this.readyNext.add(seat); this.maybeNextHand(); return { ok: true }; }
          return { ok: false, error: 'Tangan sudah selesai' };
        default: return { ok: false, error: 'Fase tidak valid' };
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  actTurn(seat, a) {
    if (seat !== this.current) return { ok: false, error: 'Bukan giliranmu' };
    const opts = this.turnOptions(seat);
    const hand = this.hands[seat];
    if (a.type === 'discard') {
      const i = hand.indexOf(a.tile);
      if (i < 0) return { ok: false, error: 'Tile tidak ada di tangan' };
      hand.splice(i, 1);
      this.discards[seat].push(a.tile);
      this.lastDiscard = { tile: a.tile, from: seat, isLast: this.wallRemaining() <= 0 };
      this.drawn = null;
      this.mustDiscardOnly = false;
      this.addLog(`${this.name(seat)} membuang ${T.tileName(a.tile)}`);
      this.openClaims(a.tile, seat, 'claim');
      return { ok: true };
    }
    if (a.type === 'win') {
      if (!opts.win) return { ok: false, error: 'Belum bisa Mahjong (minimal 8 poin)' };
      this.finishWin(seat, this.drawn.tile, { selfDrawn: true, from: -1 });
      return { ok: true };
    }
    if (a.type === 'kong') {
      const k = opts.kongs.find((x) => x.tile === a.tile);
      if (!k) return { ok: false, error: 'Kong tidak valid' };
      if (k.kind === 'concealed') {
        for (let n = 0; n < 4; n++) hand.splice(hand.indexOf(k.tile), 1);
        this.melds[seat].push({ type: 'kong', tile: k.tile, concealed: true });
        this.addLog(`${this.name(seat)} menyatakan Kong tertutup`);
        this.replacementDraw(seat);
      } else {
        hand.splice(hand.indexOf(k.tile), 1);
        this.addLog(`${this.name(seat)} menambah Pung menjadi Kong (${T.tileName(k.tile)})`);
        this.pendingAddKong = { seat, tile: k.tile };
        this.drawn = null;
        this.openClaims(k.tile, seat, 'rob');
      }
      return { ok: true };
    }
    return { ok: false, error: 'Aksi tidak dikenal' };
  }

  openClaims(tile, from, phase) {
    const pending = {};
    for (let s = 0; s < 4; s++) {
      if (s === from) continue;
      let o;
      if (phase === 'rob') {
        const r = this.winCheck(s, tile, { selfDrawn: false, robbingKong: true });
        o = r ? { win: true, pung: false, kong: false, chows: [] } : null;
      } else {
        o = this.claimOptions(s, tile, from);
      }
      if (o) pending[s] = { options: o, response: null };
    }
    if (!Object.keys(pending).length) return this.afterClaimsResolved(phase, tile, from, null);
    this.phase = phase;
    this.pending = { tile, from, seats: pending, deadline: Date.now() + this.opts.claimTimeout };
    const pend = this.pending;
    this.later(() => { if (this.pending === pend) this.claimTimeout(); }, this.opts.claimTimeout);
    this.afterChange();
  }

  actClaim(seat, a) {
    const p = this.pending && this.pending.seats[seat];
    if (!p) return { ok: false, error: 'Tidak ada klaim untukmu' };
    if (p.response) return { ok: false, error: 'Sudah merespon' };
    const o = p.options;
    if (a.type === 'pass') p.response = { type: 'pass' };
    else if (a.type === 'win' && o.win) p.response = { type: 'win' };
    else if (a.type === 'pung' && o.pung) p.response = { type: 'pung' };
    else if (a.type === 'kong' && o.kong) p.response = { type: 'kong' };
    else if (a.type === 'chow' && o.chows.includes(a.start)) p.response = { type: 'chow', start: a.start };
    else return { ok: false, error: 'Klaim tidak valid' };
    this.tryResolveClaims();
    return { ok: true };
  }

  claimTimeout() {
    if (!this.pending) return;
    for (const s of Object.keys(this.pending.seats)) {
      const p = this.pending.seats[s];
      if (!p.response) p.response = { type: 'pass' };
    }
    this.tryResolveClaims();
  }

  tryResolveClaims() {
    const { seats, tile, from } = this.pending;
    const entries = Object.entries(seats).map(([s, v]) => ({ seat: +s, ...v }));
    // order by distance from the discarder (player to the right of the thrower first)
    entries.sort((a, b) => ((a.seat - from + 4) % 4) - ((b.seat - from + 4) % 4));
    // A higher-priority claim must wait for players who could still out-claim it.
    const rank = (r) => (r.type === 'win' ? 3 : r.type === 'pung' || r.type === 'kong' ? 2 : r.type === 'chow' ? 1 : 0);
    const potential = (o) => (o.win ? 3 : o.pung || o.kong ? 2 : o.chows.length ? 1 : 0);
    let best = null;
    for (const e of entries) if (e.response && rank(e.response) > 0 && (!best || rank(e.response) > rank(best.response))) best = e;
    const undecided = entries.filter((e) => !e.response);
    const blocking = undecided.some((e) => {
      const pr = potential(e.options);
      if (!best) return pr > 0;
      if (pr > rank(best.response)) return true;
      // equal rank win: closer seat has priority
      return pr === 3 && rank(best.response) === 3 && ((e.seat - from + 4) % 4) < ((best.seat - from + 4) % 4);
    });
    if (blocking) { this.afterChange(); return; }
    const phase = this.phase;
    this.pending = null;
    this.clearTimers();
    this.afterClaimsResolved(phase, tile, from, best);
  }

  afterClaimsResolved(phase, tile, from, claim) {
    if (phase === 'rob') {
      const pk = this.pendingAddKong;
      this.pendingAddKong = null;
      if (claim && claim.response.type === 'win') {
        this.addLog(`${this.name(claim.seat)} merampok Kong!`);
        this.finishWin(claim.seat, tile, { selfDrawn: false, from, robbingKong: true });
        return;
      }
      const m = this.melds[pk.seat].find((x) => x.type === 'pung' && x.tile === pk.tile);
      m.type = 'kong';
      this.replacementDraw(pk.seat);
      return;
    }
    if (!claim) {
      if (this.lastDiscard && this.lastDiscard.isLast) return this.exhaustiveDraw();
      return this.drawFor((from + 1) % 4);
    }
    const seat = claim.seat;
    const r = claim.response;
    const hand = this.hands[seat];
    const removeN = (k, n) => { for (let i = 0; i < n; i++) hand.splice(hand.indexOf(k), 1); };
    if (r.type === 'win') {
      this.finishWin(seat, tile, { selfDrawn: false, from });
      return;
    }
    this.discards[from].pop(); // claimed tile leaves the discard pile
    if (r.type === 'pung') {
      removeN(tile, 2);
      this.melds[seat].push({ type: 'pung', tile, concealed: false, from });
      this.addLog(`${this.name(seat)}: Pung ${T.tileName(tile)}`);
    } else if (r.type === 'kong') {
      removeN(tile, 3);
      this.melds[seat].push({ type: 'kong', tile, concealed: false, from });
      this.addLog(`${this.name(seat)}: Kong ${T.tileName(tile)}`);
      this.lastDiscard = null;
      this.replacementDraw(seat);
      return;
    } else if (r.type === 'chow') {
      [r.start, r.start + 1, r.start + 2].filter((x) => x !== tile).forEach((x) => removeN(x, 1));
      this.melds[seat].push({ type: 'chow', tile: r.start, concealed: false, from, claimed: tile });
      this.addLog(`${this.name(seat)}: Chow ${T.tileName(r.start)}-${T.numOf(r.start) + 2}`);
    }
    this.lastDiscard = null;
    this.phase = 'turn';
    this.current = seat;
    this.drawn = null;
    this.mustDiscardOnly = true;
    this.scheduleTurn();
    this.afterChange();
  }

  drawFor(seat, kongReplacement = false) {
    let replacement = kongReplacement;
    for (;;) {
      if (this.wallRemaining() <= 0) return this.exhaustiveDraw();
      const t = replacement ? this.wall.pop() : this.wall.shift();
      if (T.isFlower(t)) {
        this.flowers[seat].push(t);
        this.addLog(`${this.name(seat)} mendapat bunga ${T.tileName(t)}`);
        replacement = true;
        continue;
      }
      this.hands[seat].push(t);
      this.drawn = { tile: t, kongReplacement, lastWall: this.wallRemaining() <= 0 };
      break;
    }
    this.phase = 'turn';
    this.current = seat;
    this.mustDiscardOnly = false;
    this.lastDiscard = null;
    this.scheduleTurn();
    this.afterChange();
  }

  replacementDraw(seat) { this.drawFor(seat, true); }

  finishWin(seat, tile, { selfDrawn, from, robbingKong = false }) {
    const r = this.winCheck(seat, tile, { selfDrawn, robbingKong });
    if (!selfDrawn && !robbingKong) this.discards[from].pop();
    if (!selfDrawn) this.hands[seat].push(tile);
    const pay = S.payments(r.total, seat, from, selfDrawn);
    for (let i = 0; i < 4; i++) this.scores[i] += pay[i];
    this.result = {
      type: 'win', winner: seat, from, selfDrawn, tile, robbingKong,
      total: r.total, base: r.base, fans: r.fans, payments: pay,
    };
    this.addLog(`${this.name(seat)} MAHJONG! ${r.total} poin${selfDrawn ? ' (tsumo)' : ` dari buangan ${this.name(from)}`}`);
    this.endHand();
  }

  exhaustiveDraw() {
    this.result = { type: 'draw', payments: [0, 0, 0, 0] };
    this.addLog('Tembok habis — tangan seri (tidak ada pemenang).');
    this.endHand();
  }

  endHand() {
    this.clearTimers();
    this.phase = 'ended';
    this.pending = null;
    this.drawn = null;
    this.history.push({ hand: this.handIndex, result: this.result });
    if (this.handIndex + 1 >= HANDS_PER_GAME) {
      this.gameOver = true;
      this.addLog('Permainan selesai!');
    } else {
      this.nextDeadline = Date.now() + this.opts.nextHandTimeout;
      this.later(() => this.nextHand(), this.opts.nextHandTimeout);
      this.players.forEach((p, i) => { if (p.bot) this.readyNext.add(i); });
    }
    this.afterChange();
  }

  maybeNextHand() {
    if (this.readyNext.size >= 4) this.nextHand();
    else this.afterChange();
  }

  nextHand() {
    if (this.phase !== 'ended' || this.gameOver) return;
    this.handIndex++;
    this.startHand();
  }

  /* ======================= bots & timeouts ======================= */

  scheduleTurn() {
    const seat = this.current;
    const turnId = this.turnId = (this.turnId || 0) + 1;
    if (this.players[seat].bot) {
      this.later(() => this.botTurn(seat), this.opts.botDelay);
    } else {
      this.turnDeadline = Date.now() + this.opts.turnTimeout;
      this.later(() => {
        if (this.turnId === turnId && this.phase === 'turn' && this.current === seat) this.autoDiscard(seat);
      }, this.opts.turnTimeout);
    }
  }

  autoDiscard(seat) {
    const tile = this.drawn ? this.drawn.tile : this.hands[seat][this.hands[seat].length - 1];
    this.act(seat, { type: 'discard', tile });
  }

  botTurn(seat) {
    if (this.phase !== 'turn' || this.current !== seat) return;
    const o = this.turnOptions(seat);
    if (o.win) return this.act(seat, { type: 'win' });
    const hand = this.hands[seat];
    const melds = this.melds[seat].length;
    for (const k of o.kongs) {
      const c = T.toCounts(hand);
      const before = AI.shanten(c, melds);
      c[k.tile] -= k.kind === 'concealed' ? 4 : 1;
      if (AI.shanten(c, melds + (k.kind === 'concealed' ? 1 : 0)) <= before) return this.act(seat, { type: 'kong', tile: k.tile });
    }
    const tile = AI.chooseDiscard(hand, melds, this.visibleCounts(), this.meldTiles(seat));
    this.act(seat, { type: 'discard', tile });
  }

  botClaims() {
    if (!this.pending) return;
    const { tile, seats } = this.pending;
    for (const [s, p] of Object.entries(seats)) {
      const seat = +s;
      if (!this.players[seat].bot || p.response) continue;
      this.act(seat, this.botDecideClaim(seat, tile, p.options));
      if (!this.pending) return;
    }
  }

  botDecideClaim(seat, tile, o) {
    if (o.win) return { type: 'win' };
    const hand = this.hands[seat];
    const melds = this.melds[seat].length;
    const counts = T.toCounts(hand);
    const before = AI.shanten(counts, melds);
    const fs = AI.flushSuit(hand.concat(this.meldTiles(seat)));
    const valuableHonor = T.isDragon(tile) || tile === this.seatWind(seat) || tile === this.prevalentWind;
    const fitsFlush = fs >= 0 && (T.isHonor(tile) || T.suitOf(tile) === fs);
    // after claiming we must discard one tile -> best shanten over discards
    const afterClaim = (remove) => {
      const c = counts.slice();
      remove.forEach((x) => c[x]--);
      let best = 99;
      for (let k = 0; k < 34; k++) if (c[k] > 0) { c[k]--; best = Math.min(best, AI.shanten(c, melds + 1)); c[k]++; }
      return best;
    };
    if (o.kong && (valuableHonor || fitsFlush)) return { type: 'kong' };
    if (o.pung) {
      const s = afterClaim([tile, tile]);
      if (s < before && (valuableHonor || fitsFlush || melds > 0)) return { type: 'pung' };
    }
    if (o.chows.length && fitsFlush) {
      for (const start of o.chows) {
        const need = [start, start + 1, start + 2].filter((x) => x !== tile);
        if (afterClaim(need) < before) return { type: 'chow', start };
      }
    }
    return { type: 'pass' };
  }

  afterChange() {
    this.version++;
    if (this.phase === 'claim' || this.phase === 'rob') {
      if (this.pending && Object.entries(this.pending.seats).some(([s, p]) => this.players[s].bot && !p.response)) {
        this.later(() => this.botClaims(), Math.min(this.opts.botDelay, 400));
      }
    }
    this.opts.onUpdate(this);
  }

  /* ======================= views ======================= */

  publicMelds(seat) {
    return this.melds[seat].map((m) => ({ type: m.type, tile: m.tile, concealed: !!m.concealed }));
  }

  viewFor(seat) {
    const reveal = this.phase === 'ended';
    const players = this.players.map((p, i) => ({
      name: p.name, bot: p.bot, seat: i, seatWind: this.seatWind(i), score: this.scores[i],
      handCount: this.hands[i].length,
      hand: reveal || i === seat ? T.sortTiles(this.hands[i]) : null,
      melds: this.publicMelds(i), flowers: this.flowers[i], discards: this.discards[i],
    }));
    let options = null;
    if (seat >= 0) {
      if (this.phase === 'turn' && this.current === seat) options = { kind: 'turn', ...this.turnOptions(seat) };
      else if (this.pending && this.pending.seats[seat] && !this.pending.seats[seat].response) {
        options = { kind: this.phase, tile: this.pending.tile, ...this.pending.seats[seat].options };
      } else if (this.phase === 'ended' && !this.gameOver && !this.readyNext.has(seat)) options = { kind: 'next' };
    }
    let waits = null;
    if (seat >= 0 && this.hands[seat].length % 3 === 1) {
      waits = H.waitingTiles(T.toCounts(this.hands[seat]), this.melds[seat].length);
    }
    return {
      version: this.version,
      you: seat,
      phase: this.phase,
      current: this.current,
      dealer: this.dealer,
      prevalentWind: this.prevalentWind,
      handIndex: this.handIndex,
      handsPerGame: HANDS_PER_GAME,
      wallRemaining: Math.max(0, this.wallRemaining()),
      drawnTile: seat === this.current && this.drawn ? this.drawn.tile : null,
      lastDiscard: this.pending ? { tile: this.pending.tile, from: this.pending.from } : null,
      deadline: this.pending ? this.pending.deadline : this.phase === 'turn' ? this.turnDeadline : this.phase === 'ended' ? this.nextDeadline : null,
      players,
      options,
      waits,
      result: this.result,
      gameOver: this.gameOver,
      log: this.log.slice(-15),
    };
  }
}

module.exports = { Game, HANDS_PER_GAME };
