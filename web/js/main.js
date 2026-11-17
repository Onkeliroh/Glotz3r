// Entry point. Evaluating the modules only defines things (their imports form cycles, so the order in which they are evaluated
// is not ours to choose); the start-up code that wires up the page runs here, in this fixed order.
import * as look from './look.js';
import * as youtube from './youtube.js';
import * as sync from './sync.js';
import * as picture from './picture.js';
import * as sources from './sources.js';
import * as link from './link.js';
import * as panel from './panel.js';
import * as jellyfin from './jellyfin.js';
import * as app from './app.js';

for (const m of [look, youtube, sync, picture, sources, link, panel, jellyfin, app]) m.start();
