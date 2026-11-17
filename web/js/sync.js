import { $, S, V, msg, toast } from './base.js';
import { t } from './i18n.js';
import { auto } from './detect.js';
import { ms, playBlock, stallCheck, stalled } from './picture.js';
import { cur, movieStatus } from './sources.js';

// --- Sync ---
export let M = V; // master = reaction (continuous timeline; <video> or YouTube), the movie follows
export let offset = 0, tempo = 1, fps = [24, 24]; // frame rate of my copy, of the film in the reaction; the movie's time is (reaction time − offset) × tempo, tempo = film ÷ copy (25 fps copy of a 24 fps film: 0.96)
const START_LEAD = 5; // s of the reaction shown before the movie starts when skipping to it
let marked = false; // an offset is set for this reaction ("Movie starts now", nudge, typed or from a session); Stop and a new reaction reset it
// Writers for the other modules: an imported binding is read-only there
export function resync(force) { correcting = true; sync(force); }
export function setMaster(m) { M = m; }
export function unmark() { marked = false; }

function sync(force) {
  if (S.seeking || !S.src || auto) return;
  const t = (M.currentTime - offset) * tempo;
  if (t < 0 || t > (S.duration || Infinity)) { // movie not started yet / already over
    clearTimeout(startTimer);
    const wait = offset - M.currentTime; // reaction seconds until the movie starts
    if (t < 0 && !M.paused && wait < startLatency) { // the movie needs a moment to get going: start it just before, so that it is on time
      if (S.paused) { playCallAt = performance.now(); S.play().catch(playErr); }
    } else {
      S.pause();
      if (t < 0 && S.currentTime) S.currentTime = 0;
      if (t < 0 && !M.paused && wait < 1) startTimer = setTimeout(sync, Math.max(0, (wait - startLatency) * 1000));
    }
    return;
  }
  const drift = S.currentTime - t, abs = Math.abs(drift); // drift > 0: the movie is ahead
  $('drift').textContent = `Drift ${Math.round(drift * 1000)} ms`;
  // Without rate nudging the movie is only corrected by a seek, so it seeks at a smaller drift, but at most every few seconds
  // (a seek's own error must not trigger the next one right away)
  const seekAbove = M.paused ? 0.001 : NUDGE ? 0.5 : 0.12;
  if (force || (abs > seekAbove && (M.paused || NUDGE || performance.now() - lastSeek > 3000))) {
    // Seek exactly while paused. While playing, lead by the most recently measured seek duration,
    // otherwise the movie lags again after rebuffering and seeks once more (stutter).
    seekAt = lastSeek = performance.now();
    S.currentTime = t + (M.paused ? 0 : lead);
    correcting = true;
    setRate(tempo);
  } else if (!NUDGE) setRate(tempo); // the movie keeps one constant rate
  else if (!M.paused && S.readyState >= 3) {
    // Change the rate rarely and in fixed steps: every change disturbs the movie's audio output.
    // Correction starts above 40 ms (or after an offset change/seek) and ends below 5 ms.
    if (abs > 0.04) correcting = true;
    if (abs < 0.005) correcting = false;
    setRate(correcting ? tempo * (1 - Math.sign(drift) * (abs > 0.1 ? 0.08 : 0.03)) : tempo);
  }
  if (M.paused) S.pause(); else if (S.paused) S.play().catch(playErr);
}
let correcting = true, lead = 0, seekAt = 0, lastSeek = 0, startTimer = 0, startLatency = 0.1, playCallAt = 0; // startLatency: s from play() until the movie runs
// Small playbackRate steps keep the movie on time without a seek. Firefox, though, lets picture and sound drift apart when the
// rate keeps changing (https://bugzilla.mozilla.org/show_bug.cgi?id=1762617, open; pause/play fixes it), so there the movie
// runs at one constant rate and drift is corrected by rare seeks instead. Chrome and Safari keep the smooth nudging.
// ponytail: a seek lands only within ~50–90 ms (measured), and smaller drift is left alone in Firefox; learn the seek's own error
// into `lead` if that offset to the reaction ever matters

const NUDGE = !/Firefox\//.test(navigator.userAgent);
export const playErr = e => e.name === 'AbortError' || msg(e.message); // AbortError: our own pause()/load interrupted a pending play()
const setRate = r => { if (S.playbackRate !== r) S.playbackRate = r; };

export const fmt = s => new Date((Number.isFinite(s) ? s : 0) * 1000).toISOString().slice(11, 19);

export function setOffset(v) {
  offset = Math.round(v * 1000) / 1000; marked = true;
  $('offset').value = offset.toFixed(3);
  correcting = true; // approach the new offset to within a few ms right away
  sync();
}
export const fpsOk = v => Number.isFinite(+v) && +v >= 10 && +v <= 120;
export function setFps(copy, film) { // both frame rates; the pair has to give a plausible speed, otherwise 24 / 24
  fps = fpsOk(copy) && fpsOk(film) && film / copy >= 0.8 && film / copy <= 1.25 ? [+copy, +film] : [24, 24];
  tempo = fps[1] / fps[0];
  $('fpsCopy').value = fps[0]; $('fpsFilm').value = fps[1];
  $('fpsNote').textContent = tempo === 1 ? '' : `× ${tempo.toFixed(3)}`;
  correcting = true;
  sync();
}
// After the offset is known: watch the reaction from its beginning (the movie joins on time at the offset) or skip the chatter before the movie
function watchFrom(where) {
  $('found').hidden = true;
  if (!cur.reaction || !cur.movie) return;
  if (where === 'start') M.currentTime = 0;
  else if (where === 'movie') {
    if (!marked) return msg(t('Set the offset first (“Movie starts now” or the automatic detection).'));
    M.currentTime = Math.max(0, offset - START_LEAD);
  }
  if (M.paused) M.play().catch(playErr);
}
export const nudge = d => { setOffset(offset + d); toast(`Offset ${offset.toFixed(3)} s`); };
export const restart = () => { setOffset(M.currentTime); toast(`${t('Movie starts now')} · Offset ${offset.toFixed(3)} s`); }; // movie 0:00 = current reaction time

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  S.addEventListener('playing', () => { if (playCallAt) startLatency = Math.min(0.4, Math.max(0.03, (startLatency + (performance.now() - playCallAt) / 1000) / 2)); playCallAt = 0; });
  S.addEventListener('seeked', () => { if (seekAt) lead = Math.min(3, (performance.now() - seekAt) / 1000); seekAt = 0; });
  ['play', 'pause', 'seeked'].forEach(e => V.addEventListener(e, () => { if (M === V) resync(e === 'seeked'); }));
  setInterval(() => {
    sync();
    const why = playBlock();
    if (why && !M.paused && !auto) M.pause(); // e.g. another movie is being loaded: do not run on without it
    stallCheck();
    for (const [id, label] of [['toggle', 'Play / pause (Space)'], ['stop', 'Stop']]) {
      const b = $(id), ti = why ? `${t(label)} – ${t('Not available yet: {0}', why)}` : t(label);
      b.setAttribute('aria-disabled', !!why);
      if (b.title !== ti) b.title = ti;
    }
    const [st, bad] = movieStatus();
    if ($('mstate').textContent !== st) { $('mstate').textContent = st; $('mstate').hidden = !st; }
    $('mstate').classList.toggle('err', bad);
    const dur = Number.isFinite(M.duration) ? M.duration : 0; // Infinity: live stream or file without a duration
    $('seek').max = dur;
    // Where the movie lies on the reaction's timeline: from the offset for the movie's length
    const pct = v => Math.min(100, Math.max(0, v / dur * 100)) + '%';
    $('spans').hidden = !dur;
    $('spans').style.setProperty('--a', pct(offset));
    $('spans').style.setProperty('--b', pct(S.duration ? offset + S.duration / tempo : offset));
    if (!$('seek').matches(':active')) $('seek').value = M.currentTime;
    $('time').textContent = `${fmt(M.currentTime)} / ${fmt(dur)}`;
    // Film time as in the reaction (before the fps conversion to my copy): what the reaction's own timer should show; negative before the movie starts
    const ft = M.currentTime - offset, mt = (ft < 0 ? '−' : '') + fmt(Math.abs(ft));
    $('mtimer').hidden = !document.body.classList.contains('timer') || !cur.movie || !cur.reaction;
    if ($('mtimer').textContent !== mt) $('mtimer').textContent = mt;
    document.body.classList.toggle('playing', !M.paused || stalled); // play/pause icon; while waiting for the movie it offers "pause" (= stop waiting)
    document.body.classList.toggle('unmarked', !marked && !!cur.movie && !!cur.reaction); // large "Movie starts now"
    if (ms) ms.playbackState = M.paused ? 'paused' : 'playing'; // otherwise it counts as "paused" while the movie waits for the intro to end
  }, 100);
  $('seek').onchange = e => M.currentTime = +e.target.value;
  $('offset').onchange = e => setOffset(+e.target.value || 0);
  $('fpsCopy').onchange = $('fpsFilm').onchange = () => setFps($('fpsCopy').value, $('fpsFilm').value);
  $('fromStart').onclick = $('foundStart').onclick = () => watchFrom('start');
  $('toMovie').onclick = $('foundSkip').onclick = () => watchFrom('movie');
  $('foundHere').onclick = () => watchFrom();
  $('foundClose').onclick = () => $('found').hidden = true;
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => nudge(+b.dataset.d));
  $('restart').onclick = $('startNow').onclick = restart;
}
