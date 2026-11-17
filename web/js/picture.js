import { $, S, V, msg, store, stored, toast } from './base.js';
import { t } from './i18n.js';
import { Y } from './youtube.js';
import { M, fmt, nudge, offset, playErr, restart, tempo, unmark } from './sync.js';
import { auto, autoSync } from './detect.js';
import { cur, merr, movieStatus, movieWanted, mstep } from './sources.js';
import { ui } from './panel.js';

// --- Where is the movie in the reaction? Draw a frame around it on a picture of the reaction; the detection then only looks there ---
export let picRect = null; // [x0, y0, x1, y1] as fractions of the reaction's picture · false: search the whole picture · null: not asked yet
export const setPicRect = r => picRect = r; // for sources.js (imports are read-only)
const pickBox = $('pickBox'), pickSel = $('pickSel');
let pickR = null, pickFrom = null; // the frame being drawn
let pickV = null; // the dialog's own video on the reaction's source: moving it must not move the reaction in the main window
function pickDraw() {
  const c = $('pickCanvas');
  try { c.getContext('2d').drawImage(pickV, 0, 0, c.width, c.height); c.getContext('2d').getImageData(0, 0, 1, 1); }
  catch { $('pickDlg').close(); msg(t('The browser does not allow reading this video’s pictures.')); } // no CORS
  $('pickTime').textContent = fmt(pickV.currentTime);
}
function pickShow(r) {
  pickR = r; pickSel.hidden = !r; $('pickUse').disabled = !r;
  if (r) Object.assign(pickSel.style, { left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: (r[2] - r[0]) * 100 + '%', height: (r[3] - r[1]) * 100 + '%' });
}
export function pickOpen() {
  if (!cur.reaction) return msg(t('Choose a reaction first.'));
  if (M === Y) return msg(t('Not possible for YouTube: its pictures cannot be read.'));
  if (!V.videoWidth) return msg(t('The reaction is not loaded yet.'));
  if (!V._src) return msg(t('The reaction is not loaded yet.'));
  M.pause();
  const c = $('pickCanvas'), start = V.currentTime, { url, hls } = V._src;
  c.width = Math.min(960, V.videoWidth); c.height = Math.round(c.width * V.videoHeight / V.videoWidth);
  $('pickSeek').max = V.duration || 0; $('pickSeek').value = start;
  pickShow(picRect || null);
  const pv = pickV = Object.assign(document.createElement('video'), { muted: true, preload: 'auto' });
  if (V.crossOrigin) pv.crossOrigin = V.crossOrigin;
  pv.onloadedmetadata = () => { if (start) pv.currentTime = start; };
  pv.onloadeddata = pv.onseeked = () => $('pickDlg').open && pickDraw();
  if (hls && window.MediaSource) { pv._hls = new Hls({ startPosition: start || -1 }); pv._hls.loadSource(url); pv._hls.attachMedia(pv); } // hls.js is loaded: the reaction itself uses it
  else pv.src = url;
  $('pickDlg').showModal();
}
const pickPoint = e => { const b = pickBox.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height].map(v => Math.min(1, Math.max(0, v))); };

// Play and stop only make sense once it is clear what is played and the movie can be jumped to: both sources chosen, the movie loaded (transcoding finished)
export function playBlock() {
  if (!cur.reaction) return t(cur.movie ? 'No reaction chosen yet.' : 'Nothing loaded yet – choose movie and reaction first.');
  if (movieWanted) return t('The movie of this session still has to be chosen.');
  if (!cur.movie) return t('No movie chosen yet.');
  if (!cur.reaction.yt && V.src && V.readyState < 1) return t('The reaction is still loading.');
  if (mstep) return t('The movie is still loading: {0}', movieStatus()[0]);
  return '';
}
// The movie stalls (buffering, transcoder catching up after a seek): the reaction waits for it instead of running away, and goes on by itself.
// Short stalls (< 0.5 s, e.g. a correcting seek) are ignored. `stalled` = paused by us, so that a pause by hand is not undone.
export let stalled = false, starvedAt = 0;
export function stallCheck() {
  const t = (M.currentTime - offset) * tempo;
  const starved = !auto && !merr && !mstep && S.src && cur.movie && t >= 0 && t <= (S.duration || Infinity) && (S.seeking || S.readyState < 3);
  if (stalled) {
    if (!M.paused) stalled = false; // started by hand
    else if (!starved) { stalled = false; M.play().catch(playErr); }
  } else if (starved && !M.paused) {
    starvedAt ||= performance.now();
    if (performance.now() - starvedAt > 500) { stalled = true; starvedAt = 0; M.pause(); }
  } else starvedAt = 0;
}
const blocked = () => { const why = playBlock(); if (why) toast(t('Not available yet: {0}', why)); return !!why; }; // a click on the greyed-out button says why
const toggle = () => stalled ? (stalled = false) : blocked() || (M.paused ? M.play().catch(playErr) : M.pause()); // while waiting for the movie a click means: stop waiting
const stop = () => (stalled = false, blocked()) || (M.pause(), M.currentTime = 0, unmark());

// Media keys / OS media controls: always control the master, the movie follows via sync()
export const ms = navigator.mediaSession;
export function updateMeta() {
  if (ms) ms.metadata = new MediaMetadata({ title: cur.movie?.name || 'GL00TZR', artist: cur.reaction?.name || '' });
}
// Volume: master slider × individual slider; positions are stored in the browser
const vols = ['volMaster', 'volMovie', 'volReaction'].map($);
export function applyVolume() {
  const [m, f, r] = vols.map(v => +v.value);
  S.volume = m * f; V.volume = Y.volume = m * r;
  for (const v of vols) v.nextElementSibling.value = Math.round(v.value * 100) + ' %';
}
const setSize = v => { $('size').value = v; v = $('size').value; /* clamped to the slider's range */ $('stage').style.setProperty('--rs', v + '%'); $('size').nextElementSibling.value = v + ' %'; };
const fullscreen = () => document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen();
let moveTimer;
const help = () => $('keys').hidden = !$('keys').hidden;

export function setLayout(l, keep = true) {
  $('layout').selectedIndex = -1; // the dropdown copies the chosen option's picture and text only when the choice changes (also after a language switch)
  $('stage').dataset.layout = $('layout').value = l;
  if (keep) store('rwLayout', l);
}
export function setReactionHidden(h) {
  $('stage').classList.toggle('rhide', h);
  $('rhidden').hidden = !h;
  $('hideR').textContent = t(h ? 'Show reaction' : 'Hide reaction');
  store('rwHideReaction', h ? '1' : '');
}
const toggleReaction = () => { setReactionHidden(!$('stage').classList.contains('rhide')); toast(t($('stage').classList.contains('rhide') ? 'Reaction picture hidden' : 'Reaction picture shown')); };
const toggleTimer = () => store('rwTimer', document.body.classList.toggle('timer') ? '1' : '');

const layouts = [...$('layout').options].map(o => o.value);
const nextLayout = () => setLayout(layouts[(layouts.indexOf($('layout').value) + 1) % layouts.length]);

export const btn = (text, fn, icon) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; if (icon) b.dataset.i = icon; return b; };
const row = (...kids) => { const r = document.createElement('span'); r.append(...kids); return r; };

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  $('pickDlg').onclose = () => { // release the second video (and with transcoding the server's work)
    if (!pickV) return;
    pickV._hls?.destroy(); pickV.removeAttribute('src'); pickV.load(); pickV = null;
  };
  pickBox.onpointerdown = e => { pickBox.setPointerCapture(e.pointerId); pickFrom = pickPoint(e); pickShow(null); };
  pickBox.onpointermove = e => {
    if (!pickFrom) return;
    const p = pickPoint(e);
    pickShow([Math.min(pickFrom[0], p[0]), Math.min(pickFrom[1], p[1]), Math.max(pickFrom[0], p[0]), Math.max(pickFrom[1], p[1])]);
  };
  pickBox.onpointerup = () => { pickFrom = null; if (pickR && (pickR[2] - pickR[0] < 0.02 || pickR[3] - pickR[1] < 0.02)) pickShow(null); }; // a click is not a frame
  $('pickSeek').oninput = e => { if (pickV) pickV.currentTime = +e.target.value; };
  $('pickUse').onclick = () => { picRect = pickR; $('pickDlg').close(); toast(t('Movie picture marked')); };
  $('pickSkip').onclick = () => { picRect = false; $('pickDlg').close(); };
  $('pickCancel').onclick = () => $('pickDlg').close();
  document.querySelectorAll('.pickBtn').forEach(b => b.onclick = pickOpen);
  document.querySelectorAll('.autoSync').forEach(b => b.onclick = autoSync);
  $('toggle').onclick = toggle;
  $('stop').onclick = stop;
  if (ms) {
    ms.setActionHandler('play', () => blocked() || M.play());
    ms.setActionHandler('pause', () => { stalled = false; M.pause(); });
    ms.setActionHandler('stop', stop);
    ms.setActionHandler('seekbackward', e => M.currentTime -= e.seekOffset || 10);
    ms.setActionHandler('seekforward', e => M.currentTime += e.seekOffset || 10);
  }
  try { JSON.parse(stored('rwVol', '[]')).forEach((v, i) => { if (vols[i] && v >= 0 && v <= 1) vols[i].value = v; }); } catch {}
  for (const v of vols) v.oninput = () => { applyVolume(); store('rwVol', JSON.stringify(vols.map(v => +v.value))); };
  applyVolume();
  $('size').oninput = e => { setSize(e.target.value); store('rwSize', e.target.value); };
  if (+stored('rwSize', -1) >= 0) setSize(+stored('rwSize'));
  $('fs').onclick = $('fsExit').onclick = fullscreen;
  $('stage').onpointermove = $('stage').onpointerdown = e => { // shows the exit button in fullscreen for a moment; the dock while the pointer is near the bottom edge
    $('stage').classList.add('moving');
    clearTimeout(moveTimer); moveTimer = setTimeout(() => $('stage').classList.remove('moving'), 2500);
    $('stage').classList.toggle('showdock', !!document.fullscreenElement && (e.clientY > innerHeight - 90 || !!e.target.closest('#dock')));
  };
  $('stage').onpointerleave = () => $('stage').classList.remove('showdock');
  document.onfullscreenchange = () => { // controls (play, volume, offset…) stay reachable: the dock lives inside the stage while it is fullscreen, in its compact form
    const fs = !!document.fullscreenElement;
    if (fs) $('stage').append($('dock')); else $('stage').after($('dock'));
    document.body.classList.toggle('compact', fs || !!ui('Compact', ''));
    document.body.classList.toggle('vol', fs || !!ui('Vol', ''));
    $('stage').classList.remove('showdock');
  };
  $('help').onclick = $('keys').onclick = help;
  $('hideR').onclick = $('rhidden').onclick = toggleReaction;
  $('timerBtn').onclick = toggleTimer;
  document.body.classList.toggle('timer', !!stored('rwTimer'));
  setReactionHidden(!!stored('rwHideReaction'));
  $('layout').onchange = e => setLayout(e.target.value);
  if (layouts.includes(stored('rwLayout'))) setLayout(stored('rwLayout'));
  else setLayout(matchMedia('(max-width: 600px)').matches ? 'stack' : 'side', false); // phone / desktop default, not stored
  document.addEventListener('keydown', e => {
    if (/text|number|select|password/.test(e.target.type) || e.target.closest?.('dialog') || e.ctrlKey || e.metaKey || e.altKey) return; // leave Ctrl+R, Ctrl+V etc. to the browser
    const d = { ',': -0.01, '.': 0.01, '-': -0.1, '+': 0.1 }[e.key];
    if (d) nudge(d);
    else if (e.key === 'r' || e.key === 'R') restart();
    else if (e.key === 'a' || e.key === 'A') autoSync();
    else if (e.key === 't' || e.key === 'T') toggleTimer();
    else if (e.key === 'l' || e.key === 'L') { nextLayout(); toast($('layout').selectedOptions[0].text); }
    else if (e.key === 'v' || e.key === 'V') toggleReaction();
    else if (e.key === 'f' || e.key === 'F') fullscreen();
    else if (e.key === 'h' || e.key === 'H' || e.key === '?') help();
    else if (e.key === ' ' && !e.target.closest?.('button, summary, select, input:not([type=range])')) { e.preventDefault(); toggle(); } // a focused control keeps its own Space
  });
}
