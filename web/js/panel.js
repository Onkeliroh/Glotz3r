import { $, store, stored } from './base.js';
import { renderSessions } from './link.js';

// --- UI state: panel open?, which tab?, controls collapsed? – stored in the browser ---
export const ui = (key, def) => stored('rwUi' + key, def);
export function setUi(key, v) { store('rwUi' + key, v); }
export function setPanel(open, tab = ui('Tab', 'movie')) {
  document.body.classList.toggle('panel', open); setUi('Panel', open ? '1' : '');
  setUi('Tab', tab);
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== tab;
  renderSessions();
}

// Start-up: wires up this module's part of the page (main.js calls it once, in order)
export function start() {
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setPanel(true, b.dataset.tab));
  $('panelBtn').onclick = () => setPanel(!document.body.classList.contains('panel'));
  $('panelClose').onclick = () => setPanel(false);
  $('more').onclick = () => setUi('Compact', document.body.classList.toggle('compact') ? '1' : '');
  document.body.classList.toggle('compact', !!ui('Compact', ''));
  $('volBtn').onclick = () => setUi('Vol', document.body.classList.toggle('vol') ? '1' : '');
  document.body.classList.toggle('vol', !!ui('Vol', ''));
  setPanel(!!ui('Panel', '1')); // open on the first visit
}
