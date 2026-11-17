// Basics used everywhere: element lookup, version, storage, messages on the stage, the two <video> elements
export const $ = id => document.getElementById(id);
export const VERSION = 'dev'; // the release workflow replaces this with the tag (release.yml)
// localStorage may be blocked or full: reading falls back to the default, writing fails silently
export const stored = (key, def = '') => { try { return localStorage[key] ?? def; } catch { return def; } };
export const store = (key, v) => { try { localStorage[key] = v; } catch {} };


let toastTimer;
export function toast(t) { // short feedback on top of the video, visible in fullscreen too
  $('toast').textContent = t; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 2000);
}
let msgTimer;
export function msg(t) { // notice/error: stays for 12 s or until dismissed
  $('msgText').textContent = t; $('msg').hidden = !t;
  if (t) console.warn(t);
  clearTimeout(msgTimer); if (t) msgTimer = setTimeout(() => $('msg').hidden = true, 12000);
}
$('msgClose').onclick = () => msg('');
export const S = $('movie'), V = $('rvideo');
