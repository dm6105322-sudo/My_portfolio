const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function applyTheme(s) {
  const r = document.documentElement.style;
  r.setProperty('--a', s.accent); r.setProperty('--b', s.accent2); r.setProperty('--bg', s.bg); r.setProperty('--tx', s.text);
  r.setProperty('--g', (s.glow / 100).toFixed(2));
  r.setProperty('--font', "'" + s.font + "',system-ui,sans-serif");
  let l = document.getElementById('gf');
  if (!l) { l = document.createElement('link'); l.id = 'gf'; l.rel = 'stylesheet'; document.head.appendChild(l); }
  l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(s.font).replace(/%20/g, '+') + ':wght@400;500;700&display=swap';
}
function live(fn) { setInterval(() => { if (!document.hidden) fn(); }, 8000); }
