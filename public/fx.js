'use strict';
/* Sound effects (Web Audio, synthesised — no asset files) and confetti.
   Exposed as window.FX. Audio only starts after the first user gesture. */

const FX = (() => {
  let ctx = null, master = null, muted = localStorage.getItem('mj.muted') === '1';

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }
  // resume on first gesture (autoplay policy)
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }, { once: false, passive: true }));

  function setMuted(m) {
    muted = m;
    localStorage.setItem('mj.muted', m ? '1' : '0');
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
  }
  const isMuted = () => muted;

  function env(node, t0, { a = 0.004, d = 0.12, peak = 0.5, sus = 0 } = {}) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t0 + a + d);
  }

  function tone(freq, t0, dur, type = 'sine', gain = 0.4, dest = master) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    o.connect(g); g.connect(dest);
    env(g, t0, { a: 0.004, d: dur, peak: gain });
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  // a short noise burst → the "clack" of a tile landing
  function clack(t0, { gain = 0.5, dur = 0.08, lp = 2600 } = {}) {
    if (!ctx) return;
    const n = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = lp; bp.Q.value = 1.1;
    const g = ctx.createGain();
    n.connect(bp); bp.connect(g); g.connect(master);
    env(g, t0, { a: 0.002, d: dur, peak: gain });
    n.start(t0); n.stop(t0 + dur + 0.02);
    // a little woody resonance
    tone(190, t0, 0.09, 'triangle', gain * 0.4);
  }

  const sounds = {
    draw() { const c = ensure(); if (!c) return; clack(c.currentTime, { gain: 0.35, dur: 0.05, lp: 2200 }); },
    discard() { const c = ensure(); if (!c) return; clack(c.currentTime, { gain: 0.6, dur: 0.09, lp: 2800 }); },
    select() { const c = ensure(); if (!c) return; tone(880, c.currentTime, 0.05, 'sine', 0.18); },
    claim() { // pung/chow/kong — a confident two-tile clack
      const c = ensure(); if (!c) return; const t = c.currentTime;
      clack(t, { gain: 0.6 }); clack(t + 0.06, { gain: 0.55 });
      tone(392, t, 0.14, 'triangle', 0.25); tone(523, t + 0.05, 0.16, 'triangle', 0.25);
    },
    kong() {
      const c = ensure(); if (!c) return; const t = c.currentTime;
      [0, 0.05, 0.1, 0.15].forEach((d, i) => clack(t + d, { gain: 0.5 }));
      tone(330, t, 0.2, 'triangle', 0.28);
    },
    yourturn() {
      const c = ensure(); if (!c) return; const t = c.currentTime;
      tone(660, t, 0.12, 'sine', 0.22); tone(990, t + 0.09, 0.16, 'sine', 0.22);
    },
    win() { // ascending pentatonic flourish + gong
      const c = ensure(); if (!c) return; const t = c.currentTime;
      const notes = [523.25, 587.33, 698.46, 783.99, 1046.5];
      notes.forEach((f, i) => tone(f, t + i * 0.1, 0.5, 'triangle', 0.3));
      // gong
      [196, 294, 440].forEach((f) => tone(f, t + 0.5, 1.4, 'sine', 0.22));
    },
    lose() { const c = ensure(); if (!c) return; const t = c.currentTime; tone(392, t, 0.3, 'sine', 0.2); tone(294, t + 0.14, 0.5, 'sine', 0.2); },
    flower() { const c = ensure(); if (!c) return; const t = c.currentTime; tone(1174, t, 0.1, 'sine', 0.18); tone(1568, t + 0.08, 0.14, 'sine', 0.18); },
  };

  function play(name) { try { (sounds[name] || (() => {}))(); } catch (_) {} }

  /* ---------------- confetti ---------------- */
  function confetti(durationMs = 2600) {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-confetti';
    const g = canvas.getContext('2d');
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    resize(); window.addEventListener('resize', resize);
    document.body.appendChild(canvas);
    const colors = ['#e7b43a', '#e14b4b', '#46c08a', '#1b4f9c', '#fff', '#c8902a'];
    const N = Math.min(220, Math.floor(innerWidth / 6));
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      r: 4 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 2.5,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
      shape: Math.random() < 0.5 ? 0 : 1,
    }));
    const start = performance.now();
    (function frame(now) {
      const t = now - start;
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.rot += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
        if (p.shape === 0) g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        else { g.beginPath(); g.arc(0, 0, p.r / 2, 0, 7); g.fill(); }
        g.restore();
      }
      if (t < durationMs) requestAnimationFrame(frame);
      else { canvas.style.opacity = 0; setTimeout(() => { canvas.remove(); window.removeEventListener('resize', resize); }, 400); }
    })(start);
  }

  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return { play, confetti, setMuted, isMuted, ensure, reducedMotion };
})();

window.FX = FX;
