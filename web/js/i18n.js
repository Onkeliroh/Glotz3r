import { store, stored } from './base.js';

// --- i18n ---
// The source text is English; the English text is also the key. New language = entry in LANGS + dictionary in I18N.
// Static texts: elements with data-t (content) plus all title/placeholder attributes. In code: t('Text {0}', value).
export const LANGS = { // flag: [viewBox, SVG content]
  de: { name: 'Deutsch', flag: ['0 0 5 3', '<path d="M0 0h5v3H0z"/><path fill="#d00" d="M0 1h5v2H0z"/><path fill="#fc0" d="M0 2h5v1H0z"/>'] },
  en: { name: 'English', flag: ['0 0 60 30', '<path fill="#012169" d="M0 0h60v30H0z"/><path stroke="#fff" stroke-width="6" d="M0 0l60 30M60 0L0 30"/><path stroke="#c8102e" stroke-width="2" d="M0 0l60 30M60 0L0 30"/><path stroke="#fff" stroke-width="10" d="M30 0v30M0 15h60"/><path stroke="#c8102e" stroke-width="6" d="M30 0v30M0 15h60"/>'] },
};
const I18N = { de: {
  // Header & panel
  'Menu': 'Menü', 'Movie': 'Film', 'not selected': 'nicht gewählt', 'Keys': 'Tasten', 'Session link': 'Session-Link',
  'Show / hide menu': 'Menü ein- / ausblenden', 'Copy link with sources, offset and position': 'Link mit Quellen, Offset und Position kopieren',
  'Keyboard shortcuts (H)': 'Tastenübersicht (H)', 'Close panel': 'Panel schließen', 'Dismiss message': 'Meldung schließen',
  'Current': 'Aktuell', 'nothing selected yet': 'noch nichts gewählt', 'Local file': 'Lokale Datei', 'Search': 'Suchen', 'Load': 'Laden',
  'YouTube link': 'YouTube-Link', 'or drag a file onto the video area': 'oder Datei auf den Videobereich ziehen',
  'or drag a link onto the video area': 'oder Link auf den Videobereich ziehen',
  'Offset and position are saved automatically per reaction in this browser.': 'Offset und Position werden pro Reaction automatisch in diesem Browser gespeichert.',
  'Username': 'Benutzername', 'Password': 'Passwort', 'Sign in': 'Anmelden', 'Signed in as': 'Angemeldet als', 'Sign out': 'Abmelden',
  'Install as app': 'Als App installieren', 'Afterwards GL00TZR starts like a program of its own – even without the server running.': 'Danach startet GL00TZR wie ein eigenes Programm – auch ohne laufenden Server.',
  'Title, Jellyfin id or link…': 'Titel, Jellyfin-Id oder -Link…', 'Sign in to Jellyfin in the settings first': 'Erst in den Einstellungen bei Jellyfin anmelden',
  'Language': 'Sprache', 'Color scheme': 'Farbschema', 'Jellyfin account': 'Jellyfin-Konto', 'Settings: Jellyfin account and language': 'Einstellungen: Jellyfin-Konto und Sprache',
  'Browse Jellyfin…': 'Jellyfin durchsuchen…', 'Libraries': 'Mediatheken', 'Grid': 'Raster', 'List': 'Liste', 'Tree': 'Baum', 'Close': 'Schließen', 'Search: {0}': 'Suche: {0}',
  '(empty)': '(leer)', 'Load more ({0} of {1})': 'Weitere laden ({0} von {1})', 'Resume': 'Fortsetzen', 'None yet.': 'Noch keine.', 'at': 'bei',
  // Stage
  'Nothing loaded yet': 'Noch nichts geladen',
  'Choose movie and reaction in the menu<br>or drag video files here.': 'Film und Reaction im Menü wählen<br>oder Videodateien hierher ziehen.',
  'Choose sources': 'Quellen wählen',
  'Reaction picture hidden, audio keeps playing – click or press V to show it': 'Reaction-Bild ausgeblendet, Ton läuft – klicken oder Taste V zum Einblenden',
  'Drop movie here<small>video file</small>': 'Film hier ablegen<small>Videodatei</small>',
  'Drop reaction here<small>video file or YouTube link</small>': 'Reaction hier ablegen<small>Videodatei oder YouTube-Link</small>',
  'Space': 'Leertaste', 'Media keys: play / pause, stop': 'Media-Tasten: Play / Pause, Stopp',
  'Movie starts now (reset offset)': 'Film startet jetzt (Offset neu setzen)', 'Next layout': 'Nächstes Layout',
  'Hide / show reaction picture (audio keeps playing)': 'Reaction-Bild aus- / einblenden (Ton läuft weiter)',
  'Fullscreen on / off': 'Vollbild an / aus', 'Show / hide this overview': 'Diese Übersicht ein- / ausblenden',
  // Control dock
  'Play / pause (Space)': 'Play / Pause (Leertaste)', 'Stop': 'Stopp', 'Fullscreen (F)': 'Vollbild (F)', 'Version {0} is available': 'Version {0} ist verfügbar',
  'GL00TZR {0} is available – the download link is in the settings (gear icon).': 'GL00TZR {0} ist verfügbar – der Download-Link steht in den Einstellungen (Zahnrad).', 'Blue: reaction · amber: movie': 'Blau: Reaction · Gelb: Film', 'Exit fullscreen': 'Vollbild beenden', 'Controls': 'Regler',
  'Show / hide controls for offset, volume and view': 'Regler für Offset, Lautstärke und Ansicht ein- / ausblenden',
  'Offset (seconds)': 'Offset (Sekunden)', 'Offset = reaction time at which the movie is at 0:00': 'Offset = Reaction-Zeit, zu der der Film bei 0:00 steht',
  'Detect movie start automatically': 'Filmstart automatisch erkennen', 'Cancel': 'Abbrechen',
  'Mark movie picture': 'Filmbild markieren', 'Where is the movie in the reaction?': 'Wo ist der Film in der Reaction zu sehen?',
  'Draw a frame around the movie\'s picture in the reaction (helps the automatic detection)': 'Rahmen um das Filmbild in der Reaction ziehen (hilft der automatischen Erkennung)',
  'Move to a moment where the movie\'s picture is visible, then drag a frame around it.': 'Zu einer Stelle springen, an der das Filmbild zu sehen ist, dann einen Rahmen darum ziehen.',
  'Use this area': 'Diesen Bereich verwenden', 'Search the whole picture': 'Im ganzen Bild suchen', 'Movie picture marked': 'Filmbild markiert',
  'Choose a reaction first.': 'Bitte zuerst eine Reaction wählen.', 'The reaction is not loaded yet.': 'Die Reaction ist noch nicht geladen.',
  'Not possible for YouTube: its pictures cannot be read.': 'Bei YouTube nicht möglich: die Bilder lassen sich nicht auslesen.',
  'The browser does not allow reading this video’s pictures.': 'Der Browser erlaubt kein Auslesen der Bilder dieses Videos.',
  'Choose a movie and a reaction first.': 'Bitte zuerst Film und Reaction wählen.',
  'Movie start found: offset {0} s': 'Filmstart gefunden: Offset {0} s',
  'The movie runs about {0} % faster than in the reaction (copy {1} fps, film {2} fps): its speed was adjusted.': 'Der Film läuft etwa {0} % schneller als in der Reaction (Kopie {1} fps, Film {2} fps): seine Geschwindigkeit wurde angepasst.',
  'The movie runs about {0} % slower than in the reaction (copy {1} fps, film {2} fps): its speed was adjusted.': 'Der Film läuft etwa {0} % langsamer als in der Reaction (Kopie {1} fps, Film {2} fps): seine Geschwindigkeit wurde angepasst.',
  'How do you want to watch?': 'Wie möchtest du schauen?', 'Set the offset first (“Movie starts now” or the automatic detection).': 'Bitte zuerst den Offset setzen („Film startet jetzt“ oder die automatische Erkennung).',
  'From the beginning of the reaction': 'Von Anfang der Reaction', 'Skip to the movie start': 'Zum Filmstart springen', 'Continue here': 'Hier weiter', 'Watch': 'Schauen',
  'From the beginning of the reaction: play it from 0:00, the movie joins on time at its offset': 'Von Anfang der Reaction: ab 0:00 abspielen, der Film setzt pünktlich beim Offset ein',
  'Skip to the movie start: jump to a few seconds before the movie starts and play': 'Zum Filmstart springen: einige Sekunden vor dem Filmstart anfangen und abspielen',
  'Frame rate': 'Bildrate', 'of my copy': 'meiner Kopie', 'of the film in the reaction': 'des Films in der Reaction',
  'Movie time = (reaction time − offset) × frame rate of the film ÷ frame rate of the copy': 'Filmzeit = (Reaktionszeit − Offset) × Bildrate des Films ÷ Bildrate der Kopie',
  'A television copy at 25 fps of a film at 24 fps runs 4 % too fast: enter both and the speed is adjusted.': 'Eine Fernsehkopie mit 25 fps eines Films mit 24 fps läuft 4 % zu schnell: beide eintragen, dann wird die Geschwindigkeit angepasst.',
  'No movie start found in the reaction’s sound. Set it by hand with “Movie starts now”.': 'Kein Filmstart im Ton der Reaction gefunden. Bitte von Hand mit „Film startet jetzt“ setzen.',
  'This browser cannot read video frames.': 'Dieser Browser kann keine Videobilder auslesen.',
  'No movie start found in the reaction between {0} and {1}. Put the progress bar a little before the movie starts, mark where the movie’s picture is (“Mark movie picture”) or set it by hand with “Movie starts now”.': 'Kein Filmstart in der Reaction zwischen {0} und {1} gefunden. Den Fortschrittsbalken etwas vor den Filmstart setzen, das Filmbild markieren („Filmbild markieren“) oder von Hand mit „Film startet jetzt“ setzen.',
  'Detection was interrupted.': 'Die Erkennung wurde unterbrochen.',
  'The movie has no sound that can be analysed (silent, or the server refuses access).': 'Der Film liefert keinen analysierbaren Ton (stumm, oder der Server verweigert den Zugriff).',
  'No audio was shared: choose this tab and tick “Also share tab audio”.': 'Es wurde kein Ton geteilt: diesen Tab wählen und „Auch Tab-Audio teilen“ anhaken.',
  'The reaction’s sound does not arrive (with a tab share: is the audio part of it?).': 'Der Ton der Reaction kommt nicht an (bei Tab-Freigabe: ist der Ton mit freigegeben?).',
  'the screen share was declined or blocked.': 'die Bildschirmfreigabe wurde abgelehnt oder blockiert.',
  'Detection not possible: {0}': 'Erkennung nicht möglich: {0}',
  'Movie starts now': 'Film startet jetzt','Key R': 'Taste R', 'Key L': 'Taste L', 'Key V': 'Taste V',
  '<b>−</b> if your movie is <b>behind</b> (the reaction audio comes first)': '<b>−</b> wenn dein Film <b>hinterherhinkt</b> (Ton der Reaction kommt zuerst)',
  '<b>+</b> if your movie is <b>ahead</b> (your audio comes first)': '<b>+</b> wenn dein Film <b>voraus</b> ist (dein Ton kommt zuerst)',
  'Rough: press “Movie starts now” as soon as the movie begins in the reaction.': 'Grob: „Film startet jetzt“ drücken, sobald der Film in der Reaction beginnt.',
  'Volume': 'Lautstärke', 'Master': 'Gesamt', 'Size': 'Größe',
  'Movie subtitles': 'Untertitel des Films', 'Movie timer': 'Film-Timer', 'Show / hide movie timer': 'Film-Timer ein- / ausblenden',
  'Key T: the movie\'s time as the reaction\'s timer shows it – compare both to set the offset': 'Taste T: die Filmzeit, wie der Timer der Reaction sie zeigt – beide vergleichen, um den Offset einzustellen', 'Off': 'Aus', 'Changing them reloads the movie from Jellyfin': 'Ändern lädt den Film neu von Jellyfin',
  'Side by side (reaction right)': 'Nebeneinander (Reaction rechts)', 'Side by side (reaction left)': 'Nebeneinander (Reaction links)',
  'Top and bottom (reaction below)': 'Übereinander (Reaction unten)', 'Top and bottom (reaction above)': 'Übereinander (Reaction oben)',
  'Picture-in-picture bottom right': 'Bild-in-Bild unten rechts', 'Picture-in-picture bottom left': 'Bild-in-Bild unten links',
  'Picture-in-picture top right': 'Bild-in-Bild oben rechts', 'Picture-in-picture top left': 'Bild-in-Bild oben links',
  'Show reaction': 'Reaction einblenden', 'Hide reaction': 'Reaction ausblenden',
  'Reaction picture hidden': 'Reaction-Bild ausgeblendet', 'Reaction picture shown': 'Reaction-Bild eingeblendet',
  // Messages
  'YouTube API not reachable': 'YouTube-API nicht erreichbar', 'YouTube error {0}': 'YouTube-Fehler {0}',
  ': embedding not allowed (video restricted, or page not served via http/https).': ': Einbetten nicht erlaubt (Video gesperrt, oder Seite läuft nicht über http/https).',
  'Video cannot be played (codec/container not supported by the browser?)': 'Video kann nicht abgespielt werden (Codec/Container vom Browser nicht unterstützt?)',
  'hls.js could not be loaded': 'hls.js nicht ladbar', 'transcoded by server': 'vom Server umgewandelt', 'direct': 'direkt',
  '{0}: stream error ({1})': '{0}: Stream-Fehler ({1})',
  'Please sign in to Jellyfin and choose the movie “{0}”.': 'Bitte bei Jellyfin anmelden und den Film „{0}“ wählen.',
  'Please choose the movie file “{0}”.': 'Bitte Film-Datei „{0}“ wählen.',
  'No YouTube link recognised.': 'Kein YouTube-Link erkannt.', 'Only a video file works as the movie.': 'Als Film geht nur eine Videodatei.',
  'Please sign in to Jellyfin – the session resumes automatically afterwards.': 'Bitte bei Jellyfin anmelden – die Session wird danach automatisch fortgesetzt.',
  'Please choose the reaction file “{0}” – offset & position are then applied.': 'Bitte Reaction-Datei „{0}“ wählen – Offset & Position werden dann übernommen.',
  'Asking Jellyfin …': 'Frage Jellyfin ab …', 'Server is preparing the stream (transcoding) …': 'Server bereitet den Stream vor (Transkodierung) …', 'Loading movie …': 'Film wird geladen …', 'Movie is buffering …': 'Film puffert …', 'Movie starts in {0}': 'Film startet in {0}', 'Movie not loaded: {0}': 'Film nicht geladen: {0}',
  'about {0} left': 'noch ca. {0}', 'Movie is buffering – the reaction waits …': 'Film puffert – die Reaction wartet …',
  'Not available yet: {0}': 'Noch nicht verfügbar: {0}',
  'Nothing loaded yet – choose movie and reaction first.': 'Noch nichts geladen – zuerst Film und Reaction wählen.', 'No reaction chosen yet.': 'Noch keine Reaction gewählt.',
  'The movie of this session still has to be chosen.': 'Der Film dieser Session muss noch gewählt werden.', 'No movie chosen yet.': 'Noch kein Film gewählt.',
  'The reaction is still loading.': 'Die Reaction wird noch geladen.', 'The movie is still loading: {0}': 'Der Film lädt noch: {0}',
  'Session link copied to clipboard.': 'Session-Link in die Zwischenablage kopiert.', 'Copy session link:': 'Session-Link kopieren:',
  'Load movie and reaction first.': 'Erst Film und Reaction laden.', 'Session link is invalid.': 'Session-Link ist ungültig.',
  'Jellyfin address {0} taken from the session link.': 'Jellyfin-Adresse {0} aus dem Session-Link übernommen.',
  'The session link wants to use the Jellyfin server {0}. Your password is sent to this address when you sign in. Use this address?': 'Der Session-Link möchte den Jellyfin-Server {0} verwenden. Dein Passwort wird beim Anmelden an diese Adresse gesendet. Diese Adresse verwenden?',
  'The session link belongs to the Jellyfin server {0}, but you are signed in to {1}.': 'Der Session-Link gehört zum Jellyfin-Server {0}, angemeldet bist du bei {1}.',
  'Jellyfin returned no playable source{0}.': 'Jellyfin liefert keine abspielbare Quelle{0}.',
  'Format not supported by the browser and Jellyfin offers no transcoding.': 'Format wird vom Browser nicht unterstützt und Jellyfin bietet keine Umwandlung an.',
  'Please enter the Jellyfin address.': 'Bitte Jellyfin-Adresse eintragen.',
  'Wrong credentials or sign-in expired.': 'Zugangsdaten falsch oder Anmeldung abgelaufen.',
  'Jellyfin sign-in: {0}': 'Jellyfin-Anmeldung: {0}', 'Quick Connect is not enabled on the Jellyfin server.': 'Quick Connect ist auf dem Jellyfin-Server nicht aktiviert.',
  'Code {0} – enter it in Jellyfin under Settings → Quick Connect': 'Code {0} – in Jellyfin unter Einstellungen → Quick Connect eingeben',
  'Nothing found.': 'Nichts gefunden.', 'Jellyfin search failed: {0}': 'Jellyfin-Suche fehlgeschlagen: {0}',
} };
export let lang = 'en';
lang = stored('rwLang') || navigator.language.slice(0, 2);
if (!LANGS[lang]) lang = 'en';
const tr = s => I18N[lang]?.[s] ?? s;
export function t(s, ...a) {
  if (lang !== 'en' && !(s in I18N[lang])) console.warn('i18n: missing translation', lang, s);
  return tr(s).replace(/\{(\d)\}/g, (_, i) => a[i]);
}
export function translateDom() { // remember the original (English) on the element during the first pass
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) el.innerHTML = t(el._t ??= el.innerHTML.trim());
  for (const a of ['title', 'placeholder']) for (const el of document.querySelectorAll(`[${a}]`)) el[a] = tr((el._ta ??= {})[a] ??= el.getAttribute(a));
}
export function useLang(l) { // the switch with its redraw of the page is setLang (app.js)
  lang = l; store('rwLang', lang);
}
