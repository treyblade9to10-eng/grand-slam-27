// Sound: CC0 crowd beds (audio/, see CREDITS.txt) + synthesized bat crack, mitt pop, umpire-free cues, original organ riffs.
import { Settings } from '../store.js';
let ctx = null, master = null, bed = null, hype = null, bedGain = null, hypeGain = null;
const buf = {};
async function loadBuf(url) { if (buf[url]) return buf[url]; const r = await fetch(url); const a = await r.arrayBuffer(); buf[url] = await ctx.decodeAudioData(a); return buf[url]; }
export const Sound = {
  async start() {
    if (!Settings.sound) return;
    try {
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') await ctx.resume();
      if (!bed) {
        const [b1, b2] = await Promise.all([loadBuf('audio/crowd_bed.mp3'), loadBuf('audio/crowd_hype.mp3')]);
        bedGain = ctx.createGain(); bedGain.gain.value = 0.32; bedGain.connect(master);
        hypeGain = ctx.createGain(); hypeGain.gain.value = 0; hypeGain.connect(master);
        bed = ctx.createBufferSource(); bed.buffer = b1; bed.loop = true; bed.connect(bedGain); bed.start();
        hype = ctx.createBufferSource(); hype.buffer = b2; hype.loop = true; hype.connect(hypeGain); hype.start();
      }
    } catch (e) { console.warn('audio', e); }
  },
  unlock() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  stop() { try { bed && bed.stop(); hype && hype.stop(); } catch (e) { } bed = hype = null; },
  excite(v) { if (!hypeGain) return; const t = ctx.currentTime; hypeGain.gain.cancelScheduledValues(t); hypeGain.gain.setTargetAtTime(Math.min(0.9, v * 0.85), t, v > hypeGain.gain.value ? 0.08 : 0.9); bedGain.gain.setTargetAtTime(0.3 + v * 0.12, t, 0.5); },
  noise(dur, f0, q, gain, type = 'bandpass', at = 0) {
    if (!ctx || !Settings.sound) return;
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = f0; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(master); s.start(ctx.currentTime + at);
  },
  tone(freq, dur, gain, type = 'sine', at = 0, slide = 0) {
    if (!ctx || !Settings.sound) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  },
  crack(q = 1) { // wood bat: sharp click + resonant body
    this.noise(0.05, 2600, 1.2, 1.1 * q, 'highpass'); this.noise(0.18, 900 + q * 500, 4, 0.9 * q); this.tone(1500 + q * 400, 0.09, 0.25 * q, 'triangle');
  },
  foulTip() { this.noise(0.06, 3500, 2, 0.5, 'highpass'); },
  mitt() { this.noise(0.08, 500, 1.5, 1.2); this.tone(180, 0.07, 0.4, 'sine'); },
  glove() { this.noise(0.05, 900, 2, 0.6); },
  whoosh() { this.noise(0.22, 700, 0.8, 0.25, 'bandpass'); },
  thud() { this.noise(0.12, 220, 1, 0.8, 'lowpass'); },
  // original organ phrases (not any existing stadium song)
  organ(kind = 'rally') {
    if (!Settings.music) return;
    const P = { rally: [[392, 0.12], [523, 0.12], [659, 0.12], [784, 0.36]], walk: [[523, 0.14], [587, 0.14], [659, 0.3]], change: [[659, 0.16], [587, 0.16], [523, 0.16], [440, 0.4]], win: [[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.5]] }[kind] || [];
    let t = 0;
    for (const [f, d] of P) { for (const h of [1, 2, 3]) this.tone(f * h, d * 1.1, 0.07 / h, 'sine', t); this.tone(f / 2, d, 0.05, 'triangle', t); t += d; }
  },
  horn() { if (!Settings.sound) return; for (const f of [233, 294, 349]) this.tone(f, 1.4, 0.09, 'sawtooth', 0); },
};
