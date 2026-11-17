import { $, msg, store, stored } from './base.js';
import { t } from './i18n.js';
import { btn } from './picture.js';
import { openSession, pending, slots, takePending } from './sources.js';
import { setUi, ui } from './panel.js';

// --- Jellyfin ---
// The server address comes from the deployment (config.json, see main.go: -jellyfin / JELLYFIN_URL) or else from the input field.
// Sign-in with the user's own Jellyfin account; only the token is stored, never the password.
export let configServer = '';
export const setConfigServer = s => configServer = s; // for app.js (imports are read-only)
let jf = {}; // { server, token, userId, name }
export let deviceId = 'glotz3r';
export const base = () => { // an address typed without a scheme (192.168.1.5:8096) means http
  const s = (configServer || $('server').value).trim();
  return (s && !/^https?:\/\//i.test(s) ? 'http://' + s : s).replace(/\/*$/, '/');
};
export const loggedIn = () => !!jf.token && jf.server === base();

// What this browser can play itself; Jellyfin transcodes everything else to H.264/AAC as HLS
const can = type => !!document.createElement('video').canPlayType(type);
const deviceProfile = () => ({
  MaxStreamingBitrate: 120000000,
  DirectPlayProfiles: [
    { Type: 'Video', Container: 'mp4,m4v,mov', AudioCodec: 'aac,mp3,opus,flac',
      VideoCodec: ['h264', 'vp9', can('video/mp4; codecs="hvc1.1.6.L120.90"') && 'hevc', can('video/mp4; codecs="av01.0.08M.08"') && 'av1'].filter(Boolean).join() },
    { Type: 'Video', Container: 'webm', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'opus,vorbis' },
  ],
  TranscodingProfiles: [{ Type: 'Video', Container: 'ts', Protocol: 'hls', Context: 'Streaming', VideoCodec: 'h264', AudioCodec: 'aac', MaxAudioChannels: '2', MinSegments: 1, BreakOnNonKeyFrames: false }],
  CodecProfiles: [{ Type: 'Video', Codec: 'h264', Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }] }], // no browser plays 10-bit H.264
  ContainerProfiles: [], SubtitleProfiles: [],
});
// ponytail: transcoding is not stopped actively; Jellyfin cleans it up itself once no more segments are requested
// Subtitles: without SubtitleProfiles Jellyfin can only burn them into the picture, so a subtitle means transcoding.
// sub: stream index; -1 or missing = off, whatever the user's Jellyfin default says. Returns the subtitle streams and the one actually burned in.
// ponytail: text subtitles could come as WebVTT <track> (SubtitleProfiles External) and keep direct play; add when transcoding hurts
export async function jfSource(id, sub) {
  const info = await api(`Items/${id}/PlaybackInfo?userId=${jf.userId}`, { method: 'POST', body: JSON.stringify({
    UserId: jf.userId, DeviceProfile: deviceProfile(), MaxStreamingBitrate: 120000000,
    EnableDirectPlay: true, EnableDirectStream: true, EnableTranscoding: true, AutoOpenLiveStream: true,
    // Jellyfin applies the stream indexes only together with the media source id (the item's own source has the item's id)
    MediaSourceId: id, SubtitleStreamIndex: Number.isInteger(sub) ? sub : -1, // sub from stored sessions: untrusted
  }) });
  const src = info.MediaSources?.[0];
  if (!src) throw new Error(t('Jellyfin returned no playable source{0}.', info.ErrorCode ? ` (${info.ErrorCode})` : ''));
  const subs = (src.MediaStreams || []).filter(s => s.Type === 'Subtitle').map(s => [s.Index, s.DisplayTitle || s.Language || `#${s.Index}`]);
  if (src.SupportsDirectPlay || src.SupportsDirectStream) {
    return { subs, sub: -1, url: `${base()}Videos/${id}/stream?static=true&mediaSourceId=${encodeURIComponent(src.Id)}&ApiKey=${encodeURIComponent(jf.token)}` };
  }
  if (!src.TranscodingUrl) throw new Error(t('Format not supported by the browser and Jellyfin offers no transcoding.'));
  const burned = new URL(src.TranscodingUrl, base()).searchParams.get('SubtitleStreamIndex');
  return { subs, sub: burned === null ? -1 : +burned, url: base() + src.TranscodingUrl.replace(/^\//, ''), hls: true };
}

export async function api(path, opts = {}) {
  if (base() === '/') throw new Error(t('Please enter the Jellyfin address.'));
  const auth = `MediaBrowser Client="GL00TZR", Device="Browser", DeviceId="${deviceId}", Version="1.0"` + (loggedIn() ? `, Token="${jf.token}"` : '');
  const r = await fetch(new URL(path, base()), { ...opts, headers: { 'Content-Type': 'application/json', Authorization: auth } });
  if (r.status === 401 && loggedIn()) setLogin({}); // token expired or revoked
  if (!r.ok) throw new Error(r.status === 401 ? t('Wrong credentials or sign-in expired.') : `HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}
function setLogin(auth) {
  jf = auth.AccessToken ? { server: base(), token: auth.AccessToken, userId: auth.User.Id, name: auth.User.Name } : {};
  store('rwJf', JSON.stringify(jf)); qcStop();
  renderLogin();
  if (loggedIn() && pending) openSession(takePending());
}
export function renderLogin() {
  $('jfLogin').hidden = loggedIn(); $('jfUser').hidden = !loggedIn();
  $('server').hidden = !!configServer;
  $('who').textContent = jf.name || '';
  document.body.classList.toggle('jf-in', loggedIn()); // dot on the settings tab
  for (const box of slots) {
    box.querySelector('.jf').disabled = !loggedIn();
    box.querySelector('.jf .hint').textContent = loggedIn() ? '' : t('Sign in to Jellyfin in the settings first');
  }
}

let qcTimer;
const qcStop = () => { clearInterval(qcTimer); $('qcCode').textContent = ''; };

// Jellyfin id directly (32 hex characters or GUID) or from a Jellyfin link (…details?id=…)
const jfId = q => q.match(/[?&]id=([0-9a-f-]{32,36})/i)?.[1] ?? (/^[0-9a-f-]{32,36}$/i.test(q) ? q : null);
const pad2 = n => String(n ?? 0).padStart(2, '0');
const jfName = it => it.SeriesName
  ? `${it.SeriesName} S${pad2(it.ParentIndexNumber)}E${pad2(it.IndexNumber)} – ${it.Name}`
  : `${it.Name}${it.ProductionYear ? ` (${it.ProductionYear})` : ''}`;
const jfItem = it => ({ key: `jf:${it.Id}`, name: jfName(it), id: it.Id });

// Picker dialog: libraries → movies or series → season → episode, or search results. Each slot keeps its own path.
// trail: the folders above the shown list, [{ Id, Name }] or a search { q, Name }; [] = the user's libraries.
// Views: grid of posters, list, or tree (folders open in place instead of navigating).
const noVideo = ['music', 'books', 'photos', 'livetv', 'playlists'];
let jfBox, jfSeq = 0;
export function jfOpen(box) {
  jfBox = box;
  $('jfDlg').showModal();
  jfShow(box.trail ?? []);
}
function jfShow(trail) {
  jfBox.trail = trail; jfSeq++;
  $('jfPath').replaceChildren(...[{ Name: t('Libraries') }, ...trail].map((f, i) => btn(f.Name, () => jfShow(trail.slice(0, i)))));
  $('jfPath').lastChild.className = 'flat';
  $('jfItems').replaceChildren();
  $('jfItems').scrollTop = 0;
  jfLoad($('jfItems'), trail);
}
const jfNote = text => { const p = document.createElement('p'); p.className = 'hint'; p.textContent = text; return p; };
async function jfLoad(el, trail, start = 0) { // appends the trail's content to el; false if it failed
  const seq = jfSeq, last = trail.at(-1), box = jfBox, id = last?.q && jfId(last.q), tree = $('jfDlg').classList.contains('tree');
  try {
    const { Items, TotalRecordCount } = !last ? await api(`UserViews?userId=${jf.userId}`) : await api(`Items?${new URLSearchParams({
      userId: jf.userId, EnableImageTypes: 'Primary', ImageTypeLimit: 1, StartIndex: start, Limit: 200,
      ...(id ? { ids: id } : last.q ? { searchTerm: last.q, Recursive: true, IncludeItemTypes: 'Movie,Series,Episode,Video' } : { parentId: last.Id, SortBy: 'IsFolder,SortName' }),
    })}`);
    if (seq !== jfSeq) return true; // the user moved on meanwhile
    el.querySelector(':scope > .more')?.remove();
    el.append(...Items.filter(it => !noVideo.includes(it.CollectionType) && (it.IsFolder || it.MediaType === 'Video')).map(it => {
      const path = [...trail, { Id: it.Id, Name: it.Name }];
      const pic = document.createElement(it.ImageTags?.Primary ? 'img' : 'i'), text = document.createElement('span'), name = document.createElement('b'), year = document.createElement('small');
      if (it.ImageTags?.Primary) Object.assign(pic, { loading: 'lazy', alt: '', src: `${base()}Items/${it.Id}/Images/Primary?fillHeight=300&quality=90&tag=${encodeURIComponent(it.ImageTags.Primary)}` });
      name.textContent = it.Type !== 'Episode' ? it.Name : last.q ? jfName(it) : `${it.IndexNumber ?? '?'}. ${it.Name}`; // inside a season the number is enough
      year.textContent = it.ProductionYear ?? '';
      text.append(name, year);
      if (tree && it.IsFolder) { // loaded on first opening; a failed load is retried on the next
        const d = document.createElement('details'), sum = document.createElement('summary'), sub = document.createElement('div');
        sum.className = 'it'; sum.append(pic, text); d.append(sum, sub);
        d.ontoggle = () => { if (d.open && !d.loaded) { sub.replaceChildren(); d.loaded = jfLoad(sub, path).then(ok => ok || (d.loaded = null)); } };
        return d;
      }
      const card = btn('', () => it.IsFolder ? jfShow(path) : (box.pick(jfItem(it)), $('jfDlg').close()));
      card.className = 'it';
      card.append(pic, text);
      return card;
    }));
    if (!TotalRecordCount) el.append(jfNote(t(last?.q ? 'Nothing found.' : '(empty)')));
    if (last && start + Items.length < TotalRecordCount) {
      const more = btn(t('Load more ({0} of {1})', start + Items.length, TotalRecordCount), () => jfLoad(el, trail, start + Items.length));
      more.className = 'more';
      el.append(more);
    }
    return true;
  } catch (e) { if (seq === jfSeq) el.append(jfNote(`Jellyfin: ${e.message}`)); return false; }
}
const jfSearch = () => { const q = $('jfQ').value.trim(); if (q) jfShow([{ q, Name: t('Search: {0}', q) }]); };
function jfView(v) {
  const dlg = $('jfDlg'), wasTree = dlg.classList.contains('tree');
  setUi('JfView', v);
  dlg.classList.toggle('list', v !== 'grid'); dlg.classList.toggle('tree', v === 'tree');
  for (const b of $('jfViews').children) b.classList.toggle('on', b.dataset.v === v);
  if (dlg.open && wasTree !== (v === 'tree')) jfShow(jfBox.trail); // folders become buttons or <details>
}

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  try { jf = JSON.parse(stored('rwJf', '{}')) || {}; } catch {}
  $('server').value = stored('jfServer');
  deviceId = stored('rwDevice') || (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
  store('rwDevice', deviceId);
  $('server').onchange = () => { store('jfServer', $('server').value.trim()); renderLogin(); };
  $('jfLogin').onsubmit = async e => {
    e.preventDefault();
    try {
      setLogin(await api('Users/AuthenticateByName', { method: 'POST', body: JSON.stringify({ Username: $('user').value, Pw: $('pw').value }) }));
      $('pw').value = ''; msg('');
    } catch (e) { msg(t('Jellyfin sign-in: {0}', e.message)); }
  };
  $('qc').onclick = async () => {
    qcStop();
    try {
      if (!await api('QuickConnect/Enabled')) return msg(t('Quick Connect is not enabled on the Jellyfin server.'));
      const { Secret, Code } = await api('QuickConnect/Initiate', { method: 'POST' })
        .catch(() => api('QuickConnect/Initiate')); // Jellyfin < 10.9 expects GET
      msg('');
      $('qcCode').textContent = t('Code {0} – enter it in Jellyfin under Settings → Quick Connect', Code);
      let busy = false; // a slow answer must not overlap with the next poll
      qcTimer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          if (!(await api(`QuickConnect/Connect?secret=${encodeURIComponent(Secret)}`)).Authenticated) return;
          qcStop();
          setLogin(await api('Users/AuthenticateWithQuickConnect', { method: 'POST', body: JSON.stringify({ Secret }) }));
        } catch (e) { qcStop(); msg(`Quick Connect: ${e.message}`); }
        finally { busy = false; }
      }, 3000);
    } catch (e) { msg(`Quick Connect: ${e.message}`); }
  };
  $('logout').onclick = () => { api('Sessions/Logout', { method: 'POST' }).catch(() => {}); setLogin({}); };
  $('jfQ').onkeydown = e => { if (e.key === 'Enter') jfSearch(); }; // no return value: false would discard the keystroke
  $('jfSearch').onclick = jfSearch;
  $('jfClose').onclick = () => $('jfDlg').close();
  for (const b of $('jfViews').children) b.onclick = () => jfView(b.dataset.v);
  jfView(ui('JfView', 'grid'));
}
