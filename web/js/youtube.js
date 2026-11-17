import { msg } from './base.js';
import { t } from './i18n.js';
import { M, resync } from './sync.js';
import { applyVolume, updateMeta } from './picture.js';
import { cur, showCurrent } from './sources.js';

// --- YouTube as reaction ---
// Adapter exposing the subset of HTMLMediaElement that sync() and friends use
const ytApi = () => ytApi.p ??= new Promise((res, rej) => {
  window.onYouTubeIframeAPIReady = res;
  document.head.append(Object.assign(document.createElement('script'), {
    src: 'https://www.youtube.com/iframe_api', onerror: () => rej(new Error(t('YouTube API not reachable'))),
  }));
}).catch(e => { ytApi.p = null; throw e; }); // do not remember a failure: the next attempt loads the script again
export const Y = {
  player: null, state: -1, start: 0,
  clock: null, // video time − performance.now() in s; getCurrentTime() alone only updates ~4×/s
  async load(id, start) {
    this.start = start; this.state = -1; this.clock = null;
    await ytApi();
    this.player ??= await new Promise(res => {
      const p = new YT.Player('yt', {
        width: '100%', height: '100%', playerVars: { playsinline: 1, rel: 0, controls: 0, cc_load_policy: 0 },
        events: {
          onReady: () => res(p),
          onStateChange: e => this.onState(e.data),
          onError: e => msg(t('YouTube error {0}', e.data) + ([101, 150, 153].includes(e.data) ? t(': embedding not allowed (video restricted, or page not served via http/https).') : '')),
        },
      });
    });
    applyVolume();
    this.player.cueVideoById(id, start);
  },
  onState(s) { // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    this.state = s;
    if (s === 1) this.player.unloadModule?.('captions'); // ponytail: undocumented but long-stable; cc_load_policy alone does not override the account's caption setting
    this.clock = s === 1 ? this.player.getCurrentTime() - performance.now() / 1000 : null;
    const d = this.player.getVideoData?.(); // events of the previous video still arrive after a switch
    if (d?.title && d.video_id === cur.reaction?.yt) { cur.reaction.name = d.title; updateMeta(); showCurrent(); }
    if (M === this) resync();
  },
  get started() { return this.player && this.state !== -1 && this.state !== 5; },
  get paused() { return this.state !== 1; }, // buffering counts as paused so the movie waits
  get currentTime() {
    if (!this.started) return this.start;
    return this.clock == null ? this.player.getCurrentTime() : this.clock + performance.now() / 1000;
  },
  set currentTime(t) {
    this.start = t; this.clock = null;
    this.player?.seekTo(t, true);
    if (this.state !== 1 && this.state !== 3) this.player?.pauseVideo(); // seekTo starts playback from the ended/cued state
  },
  get duration() { return this.player?.getDuration?.() || NaN; },
  get readyState() { return this.player && this.state !== -1 ? 1 : 0; },
  seeking: false,
  set volume(v) { this.player?.setVolume(v * 100); },
  play() { this.player?.playVideo(); return Promise.resolve(); },
  pause() { this.player?.pauseVideo(); },
};

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  // The player reports its time via postMessage; timestamping on receipt and smoothing yields a ms-accurate clock.
  // ponytail: assumes 1× speed; factor the rate into the clock if other YouTube speeds are needed
  addEventListener('message', e => {
    if (e.origin !== 'https://www.youtube.com' || typeof e.data !== 'string' || Y.state !== 1) return;
    let d; try { d = JSON.parse(e.data); } catch { return; }
    const t = d.info?.currentTime;
    if (d.event !== 'infoDelivery' || t == null) return;
    const c = t - performance.now() / 1000;
    Y.clock = Y.clock != null && Math.abs(c - Y.clock) < 0.1 ? Y.clock + 0.1 * (c - Y.clock) : c; // jump > 100 ms = seek
  });
}
