import { $, S, V, msg, store, stored } from './base.js';
import { t } from './i18n.js';
import { Y } from './youtube.js';
import { M, fmt, fps, fpsOk, offset, setFps, setMaster, setOffset, tempo, unmark } from './sync.js';
import { picRect, pickOpen, setPicRect, stalled, updateMeta } from './picture.js';
import { renderSessions } from './link.js';
import { setPanel } from './panel.js';
import { api, deviceId, jfOpen, jfSource, loggedIn } from './jellyfin.js';

// --- Sources & sessions ---
// source = { key, name, id?, yt? }; key = 'jf:<Jellyfin id>', 'yt:<video id>' or 'file:<name>:<size>'
export const cur = {};

// Load a source into a <video>: local files directly; for Jellyfin the server decides (PlaybackInfo)
// whether the browser can play the file directly or whether it is transcoded to an HLS stream.
const playMode = {};
// Exact version + integrity: the script runs on the origin that holds the Jellyfin token. New version = new hash (sha384 of the file).
const hlsLib = () => hlsLib.p ??= new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'), {
  src: 'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js', crossOrigin: 'anonymous',
  integrity: 'sha384-cciJ0zi8d1uMKC2zJd7jvPY4HQt7W4ByUI/FlMkltvBi31aW61rcpVBhpmW8/NwX',
  onload: res, onerror: () => rej(new Error(t('hls.js could not be loaded'))),
}))).catch(e => { hlsLib.p = null; throw e; });
async function setSource(v, item, fileUrl) {
  const slot = v === S ? 'movie' : 'reaction';
  v._hls?.destroy(); v._hls = null; playMode[slot] = '';
  v.crossOrigin = item.id ? 'anonymous' : null; // the browser only hands out the audio of cross-origin media with CORS (automatic detection)
  v.removeAttribute('src'); v.load(); // detach the old video right away, not only once the new one has been resolved
  v._src = null;
  if (v === S) { merr = ''; movieStep(item.id ? 'Asking Jellyfin …' : 'Loading movie …'); showSubs(); }
  try {
    const { url, hls, subs, sub } = item.id ? await jfSource(item.id, item.sub) : { url: fileUrl };
    if (cur[slot] !== item) return; // something else has been selected in the meantime
    if (v === S) showSubs(subs, sub);
    v._src = { url, hls }; // for a second video on the same source (picker dialog)
    if (v === S) movieStep(hls ? 'Server is preparing the stream (transcoding) …' : 'Loading movie …');
    if (item.id) playMode[slot] = hls ? 'transcoded by server' : 'direct';
    showCurrent();
    if (!hls || !window.MediaSource) return void (v.src = url); // without MediaSource (Safari) the browser plays HLS natively
    await hlsLib();
    if (cur[slot] !== item) return;
    // A seek far into the film (resumed session) makes Jellyfin restart its transcoder there; the first segment can take much longer than the default 10 s.
    const slow = { maxTimeToFirstByteMs: 120000, maxLoadTimeMs: 240000, timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 8000 } };
    // Start the stream where the movie has to be right now (resumed session): loading from 0:00 first and seeking afterwards makes Jellyfin
    // abort and restart its transcoder, which can hang. Reaction position: still 0 while the reaction loads, then the saved one.
    const at = ((M.currentTime || sessions()[cur.reaction?.key]?.pos || 0) - offset) * tempo;
    const h = v._hls = new Hls({ startPosition: v === S && at > 1 ? at : -1, fragLoadPolicy: { default: slow }, manifestLoadPolicy: { default: slow } });
    let retried = false;
    h.on(Hls.Events.ERROR, (_, d) => {
      console.warn('hls.js', d.type, d.details, d);
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !retried) { retried = true; return h.startLoad(); } // one more try before giving up
      const m = t('{0}: stream error ({1})', item.name, d.details);
      msg(m); if (v === S) movieFail(m);
    });
    v._hls.loadSource(url); v._hls.attachMedia(v);
  } catch (e) { msg(`${item.name}: ${e.message}`); if (v === S) movieFail(e.message); }
}

// What the user sees of the movie: why it is black (still loading / failed / not started yet), derived from the real state of the <video>
export let mstep = '', mstepAt = 0, merr = '';
let mpct = null, meta = ''; // transcoding progress in % (0–99) and estimated time left; null: Jellyfin does not report it, then seconds are shown
let first = null; // [transcoder position, time] at the first report: gives the transcoder's speed
const movieStep = (s = '') => { mstep = s; mstepAt = performance.now(); mpct = first = null; meta = ''; };
const movieFail = m => { merr = m; mstep = ''; };
export function movieStatus() {
  if (!cur.movie) return ['', false];
  if (merr) return [t('Movie not loaded: {0}', merr), true];
  if (mstep) return [`${t(mstep)} ${mpct == null ? Math.floor((performance.now() - mstepAt) / 1000) + ' s' : mpct + ' %' + meta}`, false];
  if (!S.src) return ['', false];
  if (stalled) return [t('Movie is buffering – the reaction waits …'), false];
  const wait = offset - M.currentTime;
  if (wait > 0.5) return [t('Movie starts in {0}', fmt(wait)), false];
  return [S.readyState < (M.paused ? 2 : 3) && (M.currentTime - offset) * tempo <= (S.duration || Infinity) ? t('Movie is buffering …') : '', false];
}

// Jellyfin lists how far its transcoder has come in the session list (TranscodingInfo.CompletionPercentage of the whole film).
// The stream can start once the transcoder has reached where the movie has to be now, plus a few segments; its speed gives the time left.
// ponytail: unverified against the Jellyfin versions in use; without a number (no TranscodingInfo, error) the seconds counter stays
const READY_S = 18; // seconds of film (3 segments) beyond the start position that count as "ready"
let polling = false;

// Subtitles of a Jellyfin movie: the choice travels with the movie item (and so with the session); a change reloads the movie
function showSubs(list = [], sel = -1) {
  $('subsBox').hidden = !list.length;
  $('subs').replaceChildren(...[[-1, t('Off')], ...list].map(([i, n]) => new Option(n, i, false, i === sel)));
}

export let movieWanted = false; // the session's movie still has to be chosen by hand: do not autosave over it with the current one
function loadMovie(item, src) { pending = null; movieWanted = false; cur.movie = item; msg(''); updateMeta(); showCurrent('movie'); setSource(S, item, src); }
function loadReaction(item, src) { // a saved session for this reaction is applied automatically
  const s = sessions()[item.key];
  movieWanted = false; pending = null; unmark(); // a manual choice replaces a session that was waiting for the sign-in
  // Property instead of a listener: a restore left over from a failed or superseded load must not hit this reaction
  V.onloadedmetadata = s && !item.yt ? () => { V.onloadedmetadata = null; V.currentTime = s.pos; } : null;
  setPicRect(s?.rect ?? null);
  V.onloadeddata = !s && !item.yt ? () => { V.onloadeddata = null; pickOpen(); } : null; // a new reaction: where is the movie in it?
  M.pause();
  setMaster(item.yt ? Y : V);
  V.hidden = !!item.yt; $('ytbox').hidden = !item.yt;
  cur.reaction = item; msg(''); updateMeta(); showCurrent('reaction');
  if (item.yt) {
    V._hls?.destroy(); V._hls = null; V.removeAttribute('src'); V.load();
    Y.load(item.yt, s?.pos || 0).catch(e => msg(e.message));
  } else {
    setSource(V, item, src);
  }
  setFps(...(s?.fps ?? [24, 24]));
  if (!s) return;
  setOffset(s.offset);
  if (cur.movie?.key === s.movie.key) return;
  if (s.movie.id && loggedIn()) return loadMovie(s.movie);
  movieWanted = true;
  msg(t(s.movie.id ? 'Please sign in to Jellyfin and choose the movie “{0}”.' : 'Please choose the movie file “{0}”.', s.movie.name));
  if (!s.movie.id) savedFile(s.movie.key).then(f => f && cur.reaction === item && movieWanted && openFile(loadMovie, f));
}
const fileItem = f => ({ key: `file:${f.name}:${f.size}`, name: f.name });

// Local files: a browser never reveals the path, but (Chromium) a file handle can be kept in IndexedDB and reopened later.
// ponytail: without handle support (Firefox/Safari) or permission the session still asks for the file
const idb = (mode, fn) => new Promise((res, rej) => {
  const o = indexedDB.open('rw', 1);
  o.onupgradeneeded = () => o.result.createObjectStore('h');
  o.onerror = () => rej(o.error);
  o.onsuccess = () => { const r = fn(o.result.transaction('h', mode).objectStore('h')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); };
});
function openFile(load, f, handle) { // load a picked file and remember its handle under the session key
  if (handle) idb('readwrite', s => s.put(handle, fileItem(f).key)).catch(() => {});
  load(fileItem(f), URL.createObjectURL(f));
}
async function savedFile(key) { // the file again from the remembered handle; without permission (needs a click) or if it changed: nothing
  try {
    const h = await idb('readonly', s => s.get(key)), o = { mode: 'read' };
    if (!h || (await h.queryPermission(o) !== 'granted' && await h.requestPermission(o) !== 'granted')) return;
    const f = await h.getFile();
    if (fileItem(f).key === key) return f;
  } catch {}
}

const ytId = url => url.trim().match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})|^([\w-]{11})$/)?.slice(1).find(Boolean);
const loadYt = id => id ? loadReaction({ key: `yt:${id}`, name: `YouTube ${id}`, yt: id }) : msg(t('No YouTube link recognised.'));

// Source selection: one block each for movie and reaction; exactly one source type is shown per block
export const slots = [...document.querySelectorAll('.slot')];
const srcType = item => item.yt ? 'yt' : item.id ? 'jf' : 'file';
const srcLabel = type => ({ jf: 'Jellyfin', yt: 'YouTube' })[type] ?? t('Local file');
function showSrc(box, type) {
  box.querySelector(`input[type=radio][value=${type}]`).checked = true;
  for (const el of box.querySelectorAll('[data-src]')) el.hidden = el.dataset.src !== type;
}
export function showCurrent(slot) { // the "Current" line shows what is actually loaded – whether via selection, drop or session
  for (const box of slots) {
    const item = cur[box.dataset.slot];
    if (!item) continue;
    $('empty').hidden = true;
    for (const el of document.querySelectorAll(`[data-now=${box.dataset.slot}]`)) el.textContent = `${item.name} (${srcLabel(srcType(item))}${playMode[box.dataset.slot] ? ', ' + t(playMode[box.dataset.slot]) : ''})`;
    if (box.dataset.slot === slot) showSrc(box, srcType(item)); // only switch on load, not on title updates
  }
}

// Drag & drop: drag a file (or YouTube link) onto the movie or reaction half of the stage
let dropTimer;
const dropZone = e => e.target.closest?.('#drop [data-as]');

// ponytail: sessions live only in this browser's localStorage; export/Jellyfin sync once multiple devices are needed
export function sessions() { // stored data is not trusted: broken entries are dropped, numbers made finite (JSON turns Infinity into null)
  try {
    const all = JSON.parse(stored('rwSessions', '{}'));
    for (const [k, s] of Object.entries(all)) {
      if (!s?.reaction?.key || !s.movie?.key) delete all[k];
      else { s.offset = +s.offset || 0; s.pos = +s.pos || 0; s.fps = Array.isArray(s.fps) && s.fps.length === 2 && s.fps.every(fpsOk) && s.fps[1] / s.fps[0] >= 0.8 && s.fps[1] / s.fps[0] <= 1.25 ? s.fps.map(Number) : [24, 24]; s.rect = Array.isArray(s.rect) && s.rect.length === 4 && s.rect.every(v => v >= 0 && v <= 1) ? s.rect.map(Number) : s.rect === false ? false : null; }
    }
    return all;
  } catch { return {}; }
}
export function storeSessions(all) { store('rwSessions', JSON.stringify(all)); }

export let pending; // session waiting for the Jellyfin sign-in
export function takePending() { const s = pending; pending = null; return s; }
export function openSession(s) {
  const r = s.reaction;
  if ((r.id || s.movie.id) && !loggedIn()) {
    pending = s;
    setPanel(true, 'jf');
    return msg(t('Please sign in to Jellyfin – the session resumes automatically afterwards.'));
  }
  if (r.yt || r.id) return loadReaction(r);
  savedFile(r.key).then(f => f ? openFile(loadReaction, f) : msg(t('Please choose the reaction file “{0}” – offset & position are then applied.', r.name)));
}
export const current = () => ({ movie: cur.movie, reaction: cur.reaction, offset, fps, pos: M.currentTime, rect: picRect, at: Date.now() });

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  for (const v of [V, S]) v.onerror = () => {
    if (!v.src) return;
    const m = t('Video cannot be played (codec/container not supported by the browser?)');
    msg(`${v === S ? t('Movie') : 'Reaction'}: ${m}`);
    if (v === S) movieFail(m);
  };
  S.addEventListener('loadedmetadata', () => S._hls || movieStep()); // direct play: the browser may not load more before play
  S.addEventListener('loadeddata', () => movieStep());
  setInterval(async () => {
    const h = S._hls, d = h?.levels?.[0]?.details?.totalduration;
    if (!mstep || !h || !d || !loggedIn() || polling) return;
    polling = true;
    try {
      const p = (await api(`Sessions?DeviceId=${encodeURIComponent(deviceId)}`)).map(x => x.TranscodingInfo?.CompletionPercentage).find(Number.isFinite);
      if (p === undefined) return;
      const pos = p / 100 * d, goal = Math.max(0, h.config.startPosition) + READY_S, now = performance.now();
      first ??= [pos, now];
      const speed = (pos - first[0]) / ((now - first[1]) / 1000); // seconds of film per second
      mpct = Math.min(99, Math.max(0, Math.round(pos / goal * 100)));
      meta = speed > 0 && pos < goal && (goal - pos) / speed < 3600 ? ` · ${t('about {0} left', fmt((goal - pos) / speed).replace(/^00:/, ''))}` : '';
    } catch {} finally { polling = false; }
  }, 1500);
  $('subs').onchange = e => { if (!cur.movie) return; M.pause(); loadMovie({ ...cur.movie, sub: +e.target.value }); };
  for (const box of slots) {
    const pick = box.pick = box.dataset.slot === 'movie' ? loadMovie : loadReaction;
    const yt = box.querySelector('.yt');
    showSrc(box, 'jf');
    box.querySelectorAll('input[type=radio]').forEach(r => r.onchange = () => showSrc(box, r.value));
    const file = box.querySelector('input[type=file]');
    file.onchange = e => { const f = e.target.files[0]; if (f) openFile(pick, f); };
    if (window.showOpenFilePicker) file.onclick = async e => { // the picker returns a handle that survives reloads
      e.preventDefault();
      try { const [h] = await showOpenFilePicker(); openFile(pick, await h.getFile(), h); } catch {} // cancelled
    };
    box.querySelector('.browse').onclick = () => jfOpen(box);
    if (yt) {
      yt.onkeydown = e => { if (e.key === 'Enter') loadYt(ytId(yt.value)); };
      box.querySelector('.ytLoad').onclick = () => loadYt(ytId(yt.value));
    }
  }
  addEventListener('dragover', e => {
    if (!['Files', 'text/uri-list'].some(t => e.dataTransfer.types.includes(t))) return; // e.g. selected text from an input field
    e.preventDefault();
    $('drop').hidden = false;
    for (const z of $('drop').children) z.classList.toggle('over', z === dropZone(e));
    clearTimeout(dropTimer); // dragover fires continuously; once it stops, the pointer has left the page
    dropTimer = setTimeout(() => $('drop').hidden = true, 600);
  });
  addEventListener('drop', e => {
    $('drop').hidden = true;
    if (e.target.closest?.('input')) return; // input fields take the file or text themselves
    e.preventDefault(); // otherwise the browser opens the file instead of the page
    const as = dropZone(e)?.dataset.as, f = e.dataTransfer.files[0];
    if (!as) return;
    if (f) { // the handle has to be requested synchronously inside the drop event
      const hp = e.dataTransfer.items[0]?.getAsFileSystemHandle?.();
      Promise.resolve(hp).catch(() => null).then(h => openFile(as === 'movie' ? loadMovie : loadReaction, f, h?.kind === 'file' ? h : null));
    } else if (as === 'reaction') loadYt(ytId(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')));
    else msg(t('Only a video file works as the movie.'));
  });
  setInterval(() => { // autosave: offset + position per reaction
    if (!cur.movie || !cur.reaction || movieWanted || M.readyState < 1 || M.seeking) return;
    const all = sessions(), isNew = !all[cur.reaction.key];
    all[cur.reaction.key] = current();
    storeSessions(all);
    if (isNew) renderSessions(); // ponytail: positions in the list only refresh when a tab is opened
  }, 2000);
}
