import { $, msg } from './base.js';
import { t } from './i18n.js';
import { fmt, fpsOk } from './sync.js';
import { btn } from './picture.js';
import { cur, current, openSession, sessions, storeSessions } from './sources.js';
import { base, configServer, loggedIn } from './jellyfin.js';

// --- Session link: sources, offset and position in the URL hash; for Jellyfin sources also the server address, never the access token ---
function sessionLink(s) {
  const p = new URLSearchParams({ m: s.movie.key, mn: s.movie.name, r: s.reaction.key, rn: s.reaction.name, o: s.offset, t: s.pos.toFixed(1) });
  if ((s.movie.id || s.reaction.id) && base() !== '/') p.set('s', base());
  if (s.fps && s.fps[0] !== s.fps[1]) p.set('f', s.fps.join(','));
  if (s.rect !== null) p.set('x', s.rect ? s.rect.map(v => v.toFixed(4)).join(',') : '0'); // the movie's picture in the reaction; 0 = search the whole picture
  return `${location.href.split('#')[0]}#${p}`;
}
async function copyLink(s) {
  const url = sessionLink(s);
  try { await navigator.clipboard.writeText(url); msg(t('Session link copied to clipboard.')); }
  catch { prompt(t('Copy session link:'), url); } // the Clipboard API is only available via https/localhost
}

function itemFromKey(key, name) { // link content is untrusted input: only let known shapes through
  const [, type, rest] = key?.match(/^(jf|yt|file):(.+)$/) || [];
  if (type === 'jf' && /^[\w-]+$/.test(rest)) return { key, name, id: rest };
  if (type === 'yt' && /^[\w-]{11}$/.test(rest)) return { key, name, yt: rest };
  if (type === 'file') return { key, name };
}
export function openLink() {
  const p = new URLSearchParams(location.hash.slice(1));
  const movie = itemFromKey(p.get('m'), p.get('mn') || t('Movie')), reaction = itemFromKey(p.get('r'), p.get('rn') || 'Reaction');
  if (!location.hash.includes('r=')) return;
  history.replaceState(null, '', location.href.split('#')[0]); // otherwise a reload resets the position to the link's state
  if (!movie || !reaction) return msg(t('Session link is invalid.'));
  const num = v => Number.isFinite(+v) ? +v : 0;
  const x = (p.get('x') || '').split(',').map(Number); // untrusted: four fractions, or 0
  const s = { movie, reaction, offset: num(p.get('o')), fps: (f => f.length === 2 && f.every(fpsOk) && f[1] / f[0] >= 0.8 && f[1] / f[0] <= 1.25 ? f : [24, 24])((p.get('f') || '').split(',').map(Number)), pos: Math.max(0, num(p.get('t'))), rect: x.length === 4 && x.every(v => v >= 0 && v <= 1) ? x : p.get('x') === '0' ? false : null, at: Date.now() };
  const all = sessions(); all[reaction.key] = s; storeSessions(all);
  renderSessions();
  // Server address from the link (untrusted input): http(s) only, only for Jellyfin sources, only when not signed in,
  // and only after the user has confirmed it – the password is sent to this address afterwards.
  let srv = ''; try { const u = new URL(p.get('s')); if (/^https?:$/.test(u.protocol)) srv = u.href.replace(/\/*$/, '/'); } catch {}
  if (srv && !configServer && srv !== base() && (movie.id || reaction.id)) {
    if (loggedIn()) return msg(t('The session link belongs to the Jellyfin server {0}, but you are signed in to {1}.', srv, base()));
    if (confirm(t('The session link wants to use the Jellyfin server {0}. Your password is sent to this address when you sign in. Use this address?', srv))) {
      $('server').value = srv; $('server').onchange();
      openSession(s);
      return msg(t('Jellyfin address {0} taken from the session link.', srv) + ' ' + $('msgText').textContent);
    }
  }
  openSession(s);
}

export function renderSessions() {
  const all = sessions();
  $('sessions').dataset.empty = t('None yet.');
  const line = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; d.title = text; return d; };
  $('sessions').replaceChildren(...Object.entries(all).sort((a, b) => b[1].at - a[1].at).map(([k, s]) => {
    const d = document.createElement('div'), acts = document.createElement('div');
    d.className = 'sess'; acts.className = 'bar';
    acts.append(
      btn(t('Resume'), () => openSession(s), 'play'),
      btn('', () => copyLink(s), 'link'),
      btn('✕', () => { const now = sessions(); delete now[k]; storeSessions(now); renderSessions(); }), // re-read: `all` is from render time
    );
    d.append(line('r', s.reaction.name), line('m', `↔ ${s.movie.name}`), line('meta', `Offset ${s.offset.toFixed(3)} s${s.fps[0] !== s.fps[1] ? ` · ${s.fps[0]} → ${s.fps[1]} fps` : ''} · ${t('at')} ${fmt(s.pos)}`), acts);
    return d;
  }));
}

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  $('link').onclick = () => cur.movie && cur.reaction ? copyLink(current()) : msg(t('Load movie and reaction first.'));
}
