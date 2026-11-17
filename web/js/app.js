import { $, VERSION, msg, store, stored } from './base.js';
import { LANGS, lang, t, translateDom, useLang } from './i18n.js';
import { setLayout, setReactionHidden } from './picture.js';
import { showCurrent } from './sources.js';
import { openLink, renderSessions } from './link.js';
import { renderLogin, setConfigServer } from './jellyfin.js';

// --- Language buttons: switching re-translates the static texts and redraws what the other modules build from code ---
function setLang(l) {
  useLang(l);
  for (const b of $('lang').children) b.classList.toggle('on', b.dataset.lang === lang);
  translateDom(); showCurrent(); renderSessions(); renderLogin(); renderVersion(); setReactionHidden($('stage').classList.contains('rhide')); setLayout($('layout').value, false);
}

// --- Installable as an app (PWA): sw.js keeps the page cached so it starts without the server running ---
let installPrompt;

// --- Version & update notice ---
// An installed app or a local .exe cannot update itself; so ask GitHub for the latest release and point to the download.
// ponytail: one request to GitHub per start; cache the answer for a day if the rate limit (60/h per address) ever matters
let latest = '';
function renderVersion() {
  $('version').textContent = `GL00TZR ${VERSION}`;
  if (!latest) return;
  const a = Object.assign(document.createElement('a'), { href: 'https://github.com/Onkeliroh/Glotz3r/releases/latest', target: '_blank', rel: 'noopener', textContent: t('Version {0} is available', latest) });
  $('version').append(' · ', a);
}
async function checkUpdate(current) {
  if (!/^v\d/.test(current)) return; // "dev": built from source, nothing to compare
  try {
    const tag = (await (await fetch('https://api.github.com/repos/Onkeliroh/Glotz3r/releases/latest')).json()).tag_name;
    if (!/^v[\d.]+$/.test(tag) || tag.localeCompare(current, undefined, { numeric: true }) <= 0) return;
    latest = tag; renderVersion();
    if (stored('rwSeenVersion') === tag || !$('msg').hidden) return; // announce each version once, never over another message
    store('rwSeenVersion', tag);
    msg(t('GL00TZR {0} is available – the download link is in the settings (gear icon).', tag));
  } catch {} // offline or GitHub not reachable
}

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  for (const [l, { name, flag }] of Object.entries(LANGS)) { // flags as SVG: Windows renders flag emoji as letters only
    const b = document.createElement('button');
    b.dataset.lang = l; b.onclick = () => setLang(l);
    b.innerHTML = `<svg viewBox="${flag[0]}" width="22" height="14" preserveAspectRatio="none">${flag[1]}</svg>${name}`;
    b.classList.toggle('on', l === lang);
    $('lang').append(b);
  }
  navigator.serviceWorker?.register('sw.js').catch(() => {});
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('installBox').hidden = false; }); // the browser offers installation
  addEventListener('appinstalled', () => $('installBox').hidden = true);
  $('install').onclick = () => installPrompt?.prompt();
  renderVersion();
  checkUpdate(VERSION);
  // Start: read the deployment configuration first, then show the sign-in state and open a session link if present
  fetch('config.json').then(r => r.json()).then(c => setConfigServer(c.jellyfin || '')).catch(() => {}).finally(() => {
    renderLogin();
    addEventListener('hashchange', openLink);
    openLink();
  });
}
