import { $, S, V, msg } from './base.js';
import { t } from './i18n.js';
import { Y } from './youtube.js';
import { M, fmt, fps, resync, setFps, setOffset } from './sync.js';
import { picRect, setReactionHidden } from './picture.js';
import { cur } from './sources.js';

// --- Detect the movie start automatically ---
export let auto = null; // running automatic detection: sync() stays out of the way
// Reactions show the movie's first seconds with its original sound. We record the movie's first AUTO_HEAD seconds and the sound of the
// reaction (for YouTube: the tab's sound via screen capture), then find the one inside the other by cross-correlation (GCC-PHAT).
// ponytail: the reaction has to play uninterrupted while listening; the maths runs on the main thread (~0.5 s per attempt)
// The reaction is listened to from AUTO_BACK s before its current position (the start may lie a little before it, or far ahead: long intros,
// the second episode in the same video); each attempt only looks at the last AUTO_WINDOW s, so listening can go on for AUTO_GIVE_UP s.
const AUTO_HEAD = 40, AUTO_BACK = 30, AUTO_WINDOW = 120, AUTO_GIVE_UP = 600, AUTO_Z = 20, PIC_SEARCH = 360; // s · minimum peak / noise floor
const twiddles = n => twiddles[n] ??= Float64Array.from({ length: n / 2 }, (_, k) => Math.cos(2 * Math.PI * k / n)); // sin = shifted cos
function fft(re, im, inv) {
  const n = re.length, c = twiddles(n);
  for (let i = 1, j = 0; i < n; i++) { // bit reversal
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const h = len / 2, step = n / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) {
      const a = i + k, b = a + h, w = k * step, wr = c[w], wi = (inv ? 1 : -1) * c[Math.abs(w - n / 4)];
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
function locate(x, y, fs, minOverlap) { // where does x occur in y? → { lag: s, z: peak in units of the noise floor }
  const n = 2 ** Math.ceil(Math.log2(x.length + y.length));
  const [xr, xi, yr, yi] = [0, 0, 0, 0].map(() => new Float64Array(n));
  xr.set(x); yr.set(y);
  fft(xr, xi); fft(yr, yi);
  const lo = 100 * n / fs, hi = 1800 * n / fs; // speech band; PHAT: only the phase counts, so a quiet movie under loud commentary still shows
  for (let k = 0; k < n; k++) {
    const f = Math.min(k, n - k), r = yr[k] * xr[k] + yi[k] * xi[k], i = yi[k] * xr[k] - yr[k] * xi[k], m = Math.hypot(r, i);
    [yr[k], yi[k]] = f < lo || f > hi || !m ? [0, 0] : [r / m, i / m];
  }
  fft(yr, yi, true);
  const last = Math.max(1, y.length - Math.round(minOverlap * fs)); // x has to overlap y by at least minOverlap
  let sum = 0, sq = 0, best = 0;
  for (let k = 0; k < last; k++) { sum += yr[k]; sq += yr[k] ** 2; if (yr[k] > yr[best]) best = k; }
  const mean = sum / last;
  return { lag: best / fs, z: (yr[best] - mean) / Math.sqrt(sq / last - mean ** 2) };
}

// All sound goes through one AudioContext (created on the first use; the <video>s stay wired to it)
let actx, sink, recorderReady;
function tapAudio() {
  if (actx) return;
  actx = new AudioContext();
  sink = actx.createGain(); sink.gain.value = 0; sink.connect(actx.destination); // pulls the recorders without a sound
  V.tap = actx.createMediaElementSource(V); V.tap.connect(actx.destination);
  S.tap = actx.createMediaElementSource(S); S.tap.connect(S.mix = actx.createGain()); S.mix.connect(actx.destination);
  recorderReady = actx.audioWorklet.addModule(URL.createObjectURL(new Blob([`registerProcessor('rec', class extends AudioWorkletProcessor {
    constructor(o) { super(); this.k = o.processorOptions.k; this.acc = this.c = 0; this.out = []; }
    process(inp) { // mono, averaged down to ~4 kHz
      const x = inp[0][0];
      for (let i = 0; i < 128; i++) { this.acc += x ? x[i] : 0; if (++this.c === this.k) { this.out.push(this.acc / this.k); this.acc = this.c = 0; } }
      if (this.out.length >= 64) { this.port.postMessage(Float32Array.from(this.out)); this.out = []; }
      return true;
    }
  })`], { type: 'text/javascript' })));
}
function record(src, time) { // → { chunks, n, t0: media time of the first sample, fs }
  const k = Math.round(actx.sampleRate / 4000);
  const r = { chunks: [], n: 0, t0: null, fs: actx.sampleRate / k, node: new AudioWorkletNode(actx, 'rec', { channelCount: 1, channelCountMode: 'explicit', processorOptions: { k } }) };
  r.node.port.onmessage = e => { r.t0 ??= time(); r.chunks.push(e.data); r.n += e.data.length; };
  src.connect(r.node); r.node.connect(sink);
  return r;
}
const samples = (r, max = Infinity) => {
  const a = new Float32Array(Math.min(r.n, max));
  for (let i = 0, j = 0; i < a.length; i += r.chunks[j++].length) a.set(r.chunks[j].subarray(0, a.length - i), i);
  return a;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async f => { for (let i = 0; i < 200 && !f(); i++) await sleep(50); };
const autoUi = (on, s = 0, more = '') => document.querySelectorAll('.autoSync').forEach(b => {
  b.classList.toggle('on', on);
  b.querySelector('.prog').textContent = on ? ` · ${more}${s} s · ${t('Cancel')}` : '';
});

// Files (the pictures are readable): the movie usually appears in the reaction as a small, obscured picture somewhere in the frame.
// Both videos run muted at double speed and are sampled as tiny grey pictures (the movie 64×36, the reaction 96×54, every 50 ms of media time).
// 1. a few contrasty pictures of the movie are searched for in the reaction over all offsets and rectangles (coarse grid): candidates,
// 2. each candidate's rectangle is refined, the best one wins,
// 3. the offset is refined for that rectangle and checked against the same rectangle at unrelated offsets.
// The picture detection looks PIC_SEARCH s of reaction ahead of the progress bar (the start is usually near it; a longer wait only makes failures slower).
// ponytail: the maths runs on the main thread (~2 s per attempt); a very small or heavily covered picture is not found
const PIC_HEAD = 300, PIC_HINT_HEAD = 90, PIC_DRIFTS = [0, 25 / 24 - 1, 24 / 25 - 1], PIC_RATE = 2, PIC_STEP = 0.05, MW = 64, MH = 36, RW = 96, RH = 54; // s of movie · speed · s between samples · sizes
function picBlur(g, w, h, r) { // box blur of radius r, in place
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = Math.max(0, x - r); d <= Math.min(w - 1, x + r); d++, n++) s += g[y * w + d]; tmp[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = Math.max(0, y - r); d <= Math.min(h - 1, y + r); d++, n++) s += tmp[d * w + x]; g[y * w + x] = Math.round(s / n); }
}
function picGrab(el, w, h, crop, blur) { // → { t: media times, f: grey pictures (w×h; of the crop rectangle [x, y, w, h] in video pixels, if given; blurred by the radius blur), error, stop() } of the frames shown
  const g = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d', { willReadFrequently: true });
  const r = { t: [], f: [], w, h };
  let last = -1, id;
  const tick = (_, meta) => {
    try {
      if (meta.mediaTime >= last + PIC_STEP) {
        last = meta.mediaTime; crop ? g.drawImage(el, ...crop, 0, 0, w, h) : g.drawImage(el, 0, 0, w, h);
        const px = g.getImageData(0, 0, w, h).data, grey = new Uint8Array(w * h);
        for (let i = 0; i < grey.length; i++) grey[i] = px[4 * i] * .3 + px[4 * i + 1] * .59 + px[4 * i + 2] * .11;
        if (blur) picBlur(grey, w, h, blur);
        r.t.push(meta.mediaTime); r.f.push(grey);
      }
    } catch (e) { r.error = e; } // e.g. SecurityError: the server does not allow reading the pictures
    id = el.requestVideoFrameCallback(tick);
  };
  id = el.requestVideoFrameCallback(tick);
  r.stop = () => el.cancelVideoFrameCallback(id);
  return r;
}
function picNearest(ts, x) { let lo = 0, hi = ts.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (ts[mid] < x) lo = mid + 1; else hi = mid; } return lo > 0 && x - ts[lo - 1] < ts[lo] - x ? lo - 1 : lo; }
function picSqueeze(f, w, h) { // the movie picture scaled to w×h
  const o = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * MW / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * MW / w)), y0 = Math.floor(y * MH / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * MH / h));
    let s = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += f[yy * MW + xx];
    o[y * w + x] = s / ((x1 - x0) * (y1 - y0));
  }
  return o;
}
function picNcc(a, b) {
  let ma = 0, mb = 0, s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= a.length;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
  return sa < 1e-6 || sb < 1e-6 ? null : s / Math.sqrt(sa * sb);
}
function picScore(movs, rs, ridx, { x0, y0, w, h }) { // mean correlation over the key frames of the movie (squeezed to the rectangle) and the reaction's rectangle
  const crop = new Float64Array(w * h);
  let s = 0, n = 0;
  movs.forEach((mv, k) => {
    const f = rs.f[ridx[k]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) crop[y * w + x] = f[(y0 + y) * (rs.w || RW) + x0 + x];
    const v = picNcc(mv, crop);
    if (v != null) { s += v; n++; }
  });
  return n >= movs.length * 0.4 ? s / n : -1;
}
function picKeys(ms, rs, off) { // [movie frame, reaction frame at that offset] pairs, about every 2.5 s of movie (at most 120)
  const keys = [], step = Math.max(2.5, (ms.t.at(-1) - ms.t[0]) / 120);
  for (let t = ms.t[0] + 2; t < ms.t.at(-1) - 2; t += step) { const i = picNearest(ms.t, t), j = picNearest(rs.t, ms.t[i] + off); if (Math.abs(rs.t[j] - ms.t[i] - off) < 0.1) keys.push([i, j]); }
  return keys;
}
function picFindRect(ms, rs, off, aspect, seed) { // coarse grid over position and size (unless seeded), then a search around the best
  const keys = picKeys(ms, rs, off), ridx = keys.map(([, j]) => j), cache = {}, W = rs.w || RW, H = rs.h || RH;
  let best = { v: -1 };
  if (keys.length < 15) return best;
  const score = (x0, y0, w) => {
    const h = Math.max(3, Math.round(w / aspect));
    if (x0 < 0 || y0 < 0 || x0 + w > W || y0 + h > H || w < 8) return;
    const v = picScore(cache[w] ??= keys.map(([i]) => picSqueeze(ms.f[i], w, h)), rs, ridx, { x0, y0, w, h });
    if (v > best.v) best = { v, x0, y0, w, h };
  };
  if (!seed) for (let w = Math.round(W * 0.1); w <= W * 0.7; w += Math.round(W * 0.08)) for (let y0 = 0; y0 + w / aspect <= H; y0 += 3) for (let x0 = 0; x0 + w <= W; x0 += 3) score(x0, y0, w);
  const around = (c, dw, dp, sw, sp) => { for (let w = c.w - dw; w <= c.w + dw; w += sw) for (let y0 = c.y0 - dp; y0 <= c.y0 + dp; y0 += sp) for (let x0 = c.x0 - dp; x0 <= c.x0 + dp; x0 += sp) score(x0, y0, w); };
  around(seed || best, seed ? 12 : 4, seed ? 6 : 3, seed ? 4 : 2, seed ? 2 : 1);
  if (seed) around(best, 3, 2, 1, 1);
  return best;
}
function picRefine(ms, rs, off0, rect) { // best offset within ±0.6 s for the rectangle (a parabola through the peak gets below the frame spacing)
  const frames = [], sc = [], offs = [];
  for (let t = ms.t[0] + 1; t < ms.t.at(-1) - 1; t += Math.max(0.5, (ms.t.at(-1) - ms.t[0]) / 240)) { const i = picNearest(ms.t, t); frames.push([i, picSqueeze(ms.f[i], rect.w, rect.h)]); }
  for (let d = -0.6; d <= 0.6001; d += 0.025) {
    const j = frames.map(([i]) => picNearest(rs.t, ms.t[i] + off0 + d));
    sc.push(picScore(frames.map(f => f[1]), rs, j, rect)); offs.push(off0 + d);
  }
  let b = 0;
  sc.forEach((v, i) => { if (v > sc[b]) b = i; });
  const p = b > 0 && b < sc.length - 1 ? 0.5 * (sc[b - 1] - sc[b + 1]) / (sc[b - 1] - 2 * sc[b] + sc[b + 1]) : 0;
  return { off: offs[b] + p * 0.025, v: sc[b] };
}
function picChance(ms, rs, off, rect) { // the same rectangle at unrelated offsets: how far above chance is the match? → { mean, sd }
  const vals = [];
  for (let d = 8; d <= 60; d += 4) for (const sg of [-1, 1]) {
    const keys = picKeys(ms, rs, off + sg * d);
    if (keys.length >= 15) vals.push(picScore(keys.map(([i]) => picSqueeze(ms.f[i], rect.w, rect.h)), rs, keys.map(([, j]) => j), rect));
  }
  const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  return { mean, sd: Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1)) };
}
function picNorm(f, w, h) { // the movie picture scaled to w×h, zero mean and unit length (null if flat)
  const o = picSqueeze(f, w, h);
  let m = 0, n = 0;
  for (const v of o) m += v;
  m /= o.length;
  for (let i = 0; i < o.length; i++) { o[i] -= m; n += o[i] * o[i]; }
  n = Math.sqrt(n);
  return n < 3 ? null : o.map(v => v / n);
}
function picJoint(ms, rs, aspect) { // offsets and rectangles at which a few contrasty movie pictures match the reaction (coarse grid); best six offsets, each with its best rectangle per size
  const NK = 6, keys = [], T = ms.t.at(-1) - ms.t[0], hyp = [];
  const contrast = ms.f.map(f => { let m = 0, v = 0; for (let i = 0; i < f.length; i += 3) m += f[i]; m /= f.length / 3; for (let i = 0; i < f.length; i += 3) v += (f[i] - m) ** 2; return v; });
  for (let k = 0; k < NK; k++) { // the most contrasty picture in each slice of the movie's beginning
    let best = -1;
    ms.t.forEach((t, i) => { t -= ms.t[0]; if (t >= 1 + k * (T - 2) / NK && t < 1 + (k + 1) * (T - 2) / NK && (best < 0 || contrast[i] > contrast[best])) best = i; });
    if (best >= 0) keys.push(best);
  }
  const W = rs.w || RW, H = rs.h || RH;
  for (const w of [...new Set([0.125, 0.25, 0.5, 0.75].map(f => Math.max(8, Math.round(f * W))))]) {
    const h = Math.max(3, Math.round(w / aspect)), n = w * h, patches = keys.map(i => picNorm(ms.f[i], w, h)), use = keys.map((_, k) => k).filter(k => patches[k]);
    if (use.length < 3) continue;
    for (let off = rs.t[0] - 2; off <= rs.t.at(-1) - 40; off += 0.5) {
      const js = use.map(k => picNearest(rs.t, ms.t[keys[k]] + off)), ok = use.map((k, q) => Math.abs(rs.t[js[q]] - ms.t[keys[k]] - off) <= 0.1);
      for (let y0 = 0; y0 + h <= H; y0 += 6) for (let x0 = 0; x0 + w <= W; x0 += 6) {
        let s = 0, c = 0;
        for (let q = 0; q < use.length; q++) {
          if (!ok[q]) continue;
          const f = rs.f[js[q]], p = patches[use[q]];
          let sm = 0, sq = 0, sp = 0;
          for (let y = 0; y < h; y++) for (let x = 0, row = (y0 + y) * W + x0; x < w; x++) { const v = f[row + x]; sm += v; sq += v * v; sp += v * p[y * w + x]; }
          const va = sq - sm * sm / n;
          if (va > 1) { s += sp / Math.sqrt(va); c++; }
          if (c === 3 && s / c < 0.2) { c = 0; break; } // early rejection
        }
        if (c >= use.length * 0.6) hyp.push({ v: s / c, off, x0, y0, w, h });
      }
    }
  }
  const top = [];
  for (const x of hyp.sort((a, b) => b.v - a.v)) { // small rectangles match more easily, so every size keeps its own best
    const c = top.find(o => Math.abs(o.off - x.off) <= 3) || (top.length < 6 && top[top.push({ off: x.off, seeds: {} }) - 1]);
    if (c) c.seeds[x.w] ??= x;
  }
  return top;
}
function picDelta(a, b, w, h) { // the change from movie picture a to b, scaled to w×h, zero mean and unit length (null if nothing changes)
  const d = new Float64Array(a.length);
  for (let i = 0; i < d.length; i++) d[i] = b[i] - a[i];
  const o = picSqueeze(d, w, h);
  let m = 0, n = 0;
  for (const v of o) m += v;
  m /= o.length;
  for (let i = 0; i < o.length; i++) { o[i] -= m; n += o[i] * o[i]; }
  n = Math.sqrt(n);
  return n < 1 ? null : o.map(v => v / n);
}
function picScan(ms, rs, user) { // The marked rectangle (in rs's coordinates) is only a hint: it is tried as it is, smaller and shifted, at every offset.
  // Compared are the changes between two pictures a second apart, not the pictures: whatever stays (the “sync your copy now” text, a timecode, the room) cancels out.
  // → { off, v, margin: lead over the best rival elsewhere, rect }
  const LAG = 1, W = rs.w, H = rs.h, hyps = [], cand = [], keys = [];
  for (const k of [1, 0.75, 0.55]) for (const dx of [-0.15, 0, 0.15]) for (const dy of [-0.15, 0, 0.15]) {
    const w = Math.round(user.w * k), h = Math.round(user.h * k), x0 = Math.round(user.x0 + (user.w - w) / 2 + dx * user.w), y0 = Math.round(user.y0 + (user.h - h) / 2 + dy * user.h);
    if (x0 >= 0 && y0 >= 0 && x0 + w <= W && y0 + h <= H && w >= 8 && h >= 4) hyps.push({ x0, y0, w, h, p: null, best: { v: -1 }, vals: {} });
  }
  for (let t = ms.t[0] + 1; t < ms.t.at(-1) - 1 - LAG; t += 0.5) { // the movie's moments that change most (cuts, fades, movement), at least 2 s apart
    const i = picNearest(ms.t, t), j = picNearest(ms.t, ms.t[i] + LAG);
    let e = 0;
    for (let q = 0; q < ms.f[i].length; q++) e += (ms.f[j][q] - ms.f[i][q]) ** 2;
    cand.push({ i, j, e });
  }
  for (const c of cand.sort((p, q) => q.e - p.e)) if (keys.length < 30 && keys.every(k => Math.abs(ms.t[k.i] - ms.t[c.i]) >= 2)) keys.push(c);
  for (const r of hyps) r.p = keys.map(k => picDelta(ms.f[k.i], ms.f[k.j], r.w, r.h));
  const frames = (off, drift = 0) => { // the reaction's pictures that belong to the keys; the offset is that at the movie's start, drift: how much it grows per second of movie
    const o1 = keys.map(k => off + drift * ms.t[k.i]), o2 = keys.map(k => off + drift * ms.t[k.j]);
    const j1 = keys.map((k, q) => picNearest(rs.t, ms.t[k.i] + o1[q])), j2 = keys.map((k, q) => picNearest(rs.t, ms.t[k.j] + o2[q]));
    return { j1, j2, ok: keys.map((k, q) => Math.abs(rs.t[j1[q]] - ms.t[k.i] - o1[q]) <= 0.06 && Math.abs(rs.t[j2[q]] - ms.t[k.j] - o2[q]) <= 0.06) };
  };
  const score = (r, fr) => {
    const n = r.w * r.h;
    let s = 0, c = 0;
    for (let q = 0; q < keys.length; q++) {
      if (!fr.ok[q] || !r.p[q]) continue;
      const f1 = rs.f[fr.j1[q]], f2 = rs.f[fr.j2[q]], p = r.p[q];
      let sm = 0, sq = 0, sp = 0;
      for (let y = 0; y < r.h; y++) for (let x = 0, row = (r.y0 + y) * W + r.x0; x < r.w; x++) { const v = f2[row + x] - f1[row + x]; sm += v; sq += v * v; sp += v * p[y * r.w + x]; }
      const va = sq - sm * sm / n;
      if (va > 1) { s += sp / Math.sqrt(va); c++; }
      if (c === 3 && s / c < 0.1) return -1; // early rejection
    }
    return c >= keys.length * 0.5 ? s / c : -1;
  };
  // A copy at another frame rate (the film's 24 or the television's 25 pictures per second: 4 %) runs faster or slower than in the reaction, so the offset
  // drifts. The offset at the movie's start is searched together with the drift: none, +4.2 % or −4 %.
  for (const d of PIC_DRIFTS) for (let off = rs.t[0] - 2; off <= rs.t.at(-1) - 20; off += 0.5) {
    const fr = frames(off, d);
    for (const r of hyps) {
      const v = score(r, fr);
      (r.vals[d] ??= []).push([off, v]);
      if (v > r.best.v) r.best = { v, off, drift: d };
    }
  }
  const top = hyps.reduce((a, r) => !a || r.best.v > a.best.v ? r : a, null);
  if (!top || top.best.v < 0) return null;
  const rival = Math.max(0, ...top.vals[top.best.drift].filter(([o]) => Math.abs(o - top.best.off) > 3).map(([, v]) => v));
  let fine = { v: -1 };
  const drift = top.best.drift; // exactly the frame rate ratio: a free drift would only add noise to the offset
  for (let o = -1; o <= 1.0001; o += 0.05) { // finer, then a parabola through the peak gets below the frame spacing
    const v = score(top, frames(top.best.off + o, drift));
    if (v > fine.v) fine = { v, off: top.best.off + o, drift };
  }
  const row = [-0.05, 0, 0.05].map(e => score(top, frames(fine.off + e, fine.drift)));
  const pk = row.every(v => v >= 0) ? 0.5 * (row[0] - row[2]) / (row[0] - 2 * row[1] + row[2]) : 0;
  return { off: fine.off + (Number.isFinite(pk) ? pk * 0.05 : 0), drift: fine.drift, v: fine.v, margin: fine.v - rival, rect: { x0: top.x0, y0: top.y0, w: top.w, h: top.h } };
}
function picLocate(ms, rs, aspect) { // → { off, v: match, z: in units of the chance level } or null
  let best = null;
  for (const c of picJoint(ms, rs, aspect)) {
    if (c.off < rs.t[0] - 2) continue; // the movie cannot have started before the listening began
    for (const seed of Object.values(c.seeds)) {
      const rect = picFindRect(ms, rs, c.off, aspect, seed);
      if (!best || rect.v > best.rect.v) best = { off: c.off, rect };
    }
  }
  if (!best || best.rect.v < 0) return null;
  const r = picRefine(ms, rs, best.off, best.rect), c = picChance(ms, rs, r.off, best.rect);
  return { off: r.off, v: r.v, z: (r.v - c.mean) / (c.sd + 0.02) };
}

async function watchForPicture(a) {
  if (!V.requestVideoFrameCallback) throw new Error(t('This browser cannot read video frames.'));
  if ($('stage').classList.contains('rhide')) { setReactionHidden(false); a.undo.push(() => setReactionHidden(true)); } // a hidden picture is not presented
  for (const el of [S, V]) { const m = el.muted; el.muted = true; a.undo.push(() => { el.muted = m; el.playbackRate = 1; }); }
  const start = Math.max(0, V.currentTime - AUTO_BACK);
  S.currentTime = 0; V.currentTime = start;
  await until(() => !S.seeking && !V.seeking);
  S.playbackRate = V.playbackRate = PIC_RATE;
  let crop, user, cw = RW, ch = RH; // a marked rectangle: only its surroundings are read, at a higher resolution (the frame is a hint, it may be off by a quarter)
  if (picRect) {
    const [x0, y0, x1, y1] = picRect, pw = x1 - x0, ph = y1 - y0;
    const rx0 = Math.max(0, x0 - pw / 4), ry0 = Math.max(0, y0 - ph / 4), rx1 = Math.min(1, x1 + pw / 4), ry1 = Math.min(1, y1 + ph / 4);
    crop = [rx0 * V.videoWidth, ry0 * V.videoHeight, (rx1 - rx0) * V.videoWidth, (ry1 - ry0) * V.videoHeight];
    cw = Math.max(8, Math.min(96, Math.round(crop[2]))); ch = Math.max(8, Math.round(cw * crop[3] / crop[2]));
    user = { x0: (x0 - rx0) / (rx1 - rx0) * cw, y0: (y0 - ry0) / (ry1 - ry0) * ch, w: pw / (rx1 - rx0) * cw, h: ph / (ry1 - ry0) * ch };
  }
  const ms = picGrab(S, MW, MH, null, crop ? 1 : 0), rs = picGrab(V, cw, ch, crop, crop ? (cw >= 64 ? 2 : 1) : 0); // with a marked rectangle both are blurred a little (obscured pictures are often blurred)
  a.undo.push(ms.stop, rs.stop);
  await Promise.all([S.play(), V.play()]);
  const t0 = performance.now();
  let prev = null;
  for (let tick = 1; !a.cancel; tick++) {
    await sleep(1000);
    autoUi(true, Math.round((performance.now() - t0) / 1000), Math.min(99, Math.round(100 * (V.currentTime - start) / PIC_SEARCH)) + ' % · ');
    if (ms.error || rs.error) throw ms.error || rs.error;
    if (S.currentTime > (crop ? PIC_HINT_HEAD + 10 : PIC_HEAD)) S.pause(); // enough of the movie's beginning
    if (V.paused && !V.ended) throw new Error(t('Detection was interrupted.'));
    if (V.currentTime - start > PIC_SEARCH || V.ended) throw new Error(t('No movie start found in the reaction between {0} and {1}. Put the progress bar a little before the movie starts, mark where the movie’s picture is (“Mark movie picture”) or set it by hand with “Movie starts now”.', fmt(start).slice(3), fmt(V.currentTime).slice(3)));
    if (tick % (crop ? 4 : 8) || S.currentTime < 60) continue; // an attempt every 4–8 s, once there is a minute of the movie
    const i0 = picNearest(rs.t, rs.t.at(-1) - 300); // the last 5 minutes of the reaction are enough (a start further back was found earlier)
    const win = { t: rs.t.slice(i0), f: rs.f.slice(i0), w: rs.w, h: rs.h };
    const n = crop && picNearest(ms.t, PIC_HINT_HEAD) + 1; // the movie's first 90 s: a longer stretch only invites a drift (a copy at 25 instead of 24 pictures per second)
    const r = crop ? picScan({ t: ms.t.slice(0, n), f: ms.f.slice(0, n) }, win, user) : picLocate(ms, win, S.videoWidth / S.videoHeight);
    const ok = r && (crop ? r.v >= 0.3 && r.margin >= 0.15 && win.t.at(-1) - r.off >= PIC_HINT_HEAD - 5 : r.v >= 0.55); // the whole head has to be in the reaction, else a drift cannot be told from an offset // a known rectangle needs less: it cannot match elsewhere in the picture by chance
    if (ok && prev != null && Math.abs(r.off - prev) < 0.15) { a.drift = r.drift; return r.off; } // the same position twice in a row
    prev = ok ? r.off : null;
  }
}

export async function autoSync() {
  if (auto) return void (auto.cancel = true);
  if (!cur.movie || !cur.reaction) return msg(t('Choose a movie and a reaction first.'));
  const a = auto = { cancel: false, undo: [] };
  $('found').hidden = true;
  autoUi(true);
  try {
    const off = await (M === Y ? listenForMovie(a) : watchForPicture(a));
    if (off != null) {
      setOffset(off);
      let text = t('Movie start found: offset {0} s', off.toFixed(3)) + '.';
      if (a.drift !== undefined) { // a copy at the television's 25 instead of the film's 24 pictures per second runs 4.17 % faster; the estimate itself is only good to about 0.3 %
        const d = Math.abs(a.drift) > 0.02 ? [25 / 24 - 1, 24 / 25 - 1].find(k => Math.abs(k - a.drift) < 0.007) ?? a.drift : 0;
        setFps(...(d > 0 ? [24 * (1 + d), 24] : [24, 24 / (1 + d)]).map(v => +v.toFixed(3)));
        if (d) text += ' ' + t(d > 0 ? 'The movie runs about {0} % faster than in the reaction (copy {1} fps, film {2} fps): its speed was adjusted.' : 'The movie runs about {0} % slower than in the reaction (copy {1} fps, film {2} fps): its speed was adjusted.', Math.abs(d * 100).toFixed(1), +fps[0].toFixed(3), fps[1]);
      }
      M.pause(); // the reaction must not run on before the choice
      $('foundText').textContent = text + ' ' + t('How do you want to watch?');
      $('found').hidden = false;
    }
  } catch (e) {
    msg(t('Detection not possible: {0}', e.name === 'NotAllowedError' ? t('the screen share was declined or blocked.') : e.message || e.name));
  } finally {
    a.undo.forEach(f => f());
    auto = null; autoUi(false); resync();
  }
}
// YouTube (no access to its pictures): listen to the tab's sound instead, see above
async function listenForMovie(a) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include' });
  a.undo.push(() => stream.getTracks().forEach(tr => tr.stop()));
  if (!stream.getAudioTracks().length) throw new Error(t('No audio was shared: choose this tab and tick “Also share tab audio”.'));
  tapAudio(); await actx.resume(); await recorderReady;
  S.mix.gain.value = 0; // only the reaction is heard and recorded
  a.undo.push(() => S.mix.gain.value = 1);
  S.currentTime = 0; M.currentTime = Math.max(0, M.currentTime - AUTO_BACK);
  await until(() => !S.seeking && !M.seeking);
  await Promise.all([S.play(), M.play()]);
  await until(() => !M.paused);
  const mr = record(S.tap, () => S.currentTime), rr = record(actx.createMediaStreamSource(stream), () => M.currentTime);
  a.undo.push(() => { mr.node.disconnect(); rr.node.disconnect(); });
  const t0 = performance.now();
  let prev = null;
  for (let tick = 1; !a.cancel; tick++) {
    await sleep(1000);
    const heard = (performance.now() - t0) / 1000;
    autoUi(true, Math.round(heard));
    if (M.paused) throw new Error(t('Detection was interrupted.'));
    if (mr.n < AUTO_HEAD * mr.fs) continue;
    S.pause(); // the movie's beginning is complete
    if (tick % 4) continue; // one attempt every 4 s
    const x = samples(mr, AUTO_HEAD * mr.fs);
    if (!x.some(v => Math.abs(v) > 1e-4)) throw new Error(t('The movie has no sound that can be analysed (silent, or the server refuses access).'));
    const y = samples(rr), from = Math.max(0, y.length - AUTO_WINDOW * rr.fs);
    if (heard > 10 && !y.some(v => Math.abs(v) > 1e-4)) throw new Error(t('The reaction’s sound does not arrive (with a tab share: is the audio part of it?).'));
    const { lag, z } = locate(x, y.subarray(from), rr.fs, 8), off = rr.t0 + (from / rr.fs) + lag - mr.t0;
    if (z >= AUTO_Z && prev != null && Math.abs(off - prev) < 0.05) return off; // the same position twice in a row
    prev = z >= AUTO_Z ? off : null;
    if (heard > AUTO_GIVE_UP) throw new Error(t('No movie start found in the reaction’s sound. Set it by hand with “Movie starts now”.'));
  }
}
