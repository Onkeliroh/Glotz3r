// Color schemes: five colors each, listed in role order [accent, reaction, highlight, alert, base]; every UI color is derived from these
// five (:root below). A new scheme is one more entry. The choice is stored per browser (rwScheme) and applied here, before the page
// is drawn, so nothing flashes. Source of the palettes: https://colorany.com/color-palettes/cinematic-color-palettes/ (README: Color scheme).
const SCHEMES = {
  sunset: { name: 'Warm Sunset Journey for Cinematic Road Trips', colors: ['#FFC300', '#FF5733', '#FFDA44', '#C70039', '#581845'] },
  pastel: { name: 'Ethereal Pastel Cinematic Dreamscape Palette', colors: ['#FAD3A4', '#B2E8E0', '#FFFFFF', '#FFC3E3', '#E0B0FF'] },
  timetravel: { name: 'Cinematic Time Travel: A Colorful Journey', colors: ['#FFD700', '#4682B4', '#F5F5DC', '#B22222', '#8B4513'] },
  glamour: { name: 'Cinematic Glamour with Gold Shimmer', colors: ['#FFD700', '#C0C0C0', '#FFFFFF', '#8B0000', '#000000'] },
  classic: { name: 'Classic', colors: ['#FFB224', '#5AA2FF', '#FFC34F', '#E5484D', '#2B3A55'] },
};
function applyScheme(id) {
  const s = SCHEMES[id] || SCHEMES.sunset;
  ['accent', 'reaction', 'highlight', 'alert', 'base'].forEach((r, i) => document.documentElement.style.setProperty('--s-' + r, s.colors[i]));
}
try { applyScheme(localStorage.rwScheme); } catch { applyScheme(); }
