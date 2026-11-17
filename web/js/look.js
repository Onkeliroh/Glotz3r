import { $, store, stored } from './base.js';
import { translateDom } from './i18n.js';

// Settings that shape the look: color scheme picker, layout sketches; then the first translation of the page
// Color schemes (SCHEMES, applyScheme: top of the page): one button per scheme with its five colors; the choice is stored
function setScheme(id) {
  if (!SCHEMES[id]) id = 'sunset';
  applyScheme(id); store('rwScheme', id);
  for (const b of $('scheme').children) b.classList.toggle('on', b.dataset.scheme === id);
  // Title bar of the installed app: the header's color, through a canvas pixel as plain hex (the computed value is an oklab() mix)
  const cx = document.createElement('canvas').getContext('2d');
  cx.fillStyle = getComputedStyle(document.querySelector('header')).backgroundColor; cx.fillRect(0, 0, 1, 1);
  document.querySelector('meta[name=theme-color]').content = '#' + [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
}
// Layout sketches inside the dropdown's options, next to the text (customisable <select>: Chromium 135+; elsewhere the plain text list).
// The text moves into a data-t span first, so that translating it does not wipe the picture.
const LAYOUT_ICON = { // [movie, reaction] as x, y, width, height in a 32×20 frame
  side: [[0, 0, 22, 20], [23, 0, 9, 20]], 'side-left': [[10, 0, 22, 20], [0, 0, 9, 20]],
  stack: [[0, 0, 32, 13], [0, 14, 32, 6]], 'stack-top': [[0, 7, 32, 13], [0, 0, 32, 6]],
  'pip-br': [[0, 0, 32, 20], [20, 12, 10, 6]], 'pip-bl': [[0, 0, 32, 20], [2, 12, 10, 6]],
  'pip-tr': [[0, 0, 32, 20], [20, 2, 10, 6]], 'pip-tl': [[0, 0, 32, 20], [2, 2, 10, 6]],
};

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  for (const [id, s] of Object.entries(SCHEMES)) {
    const b = document.createElement('button'), sw = document.createElement('span');
    b.dataset.scheme = id; b.onclick = () => setScheme(id);
    sw.className = 'sw'; sw.append(...s.colors.map(c => Object.assign(document.createElement('i'), { style: `background:${c}` })));
    b.append(sw, s.name);
    $('scheme').append(b);
  }
  setScheme(stored('rwScheme', 'sunset'));
  for (const o of $('layout').options) {
    const rect = (c, [x, y, w, h]) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"/>`;
    o.innerHTML = `<svg viewBox="0 0 32 20" aria-hidden="true">${rect('m', LAYOUT_ICON[o.value][0])}${rect('r', LAYOUT_ICON[o.value][1])}</svg><span data-t>${o.innerHTML.trim()}</span>`;
    delete o.dataset.t;
  }
  translateDom();
}
