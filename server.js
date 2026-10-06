require('dotenv').config();
const express = require('express'), multer = require('multer'), jwt = require('jsonwebtoken'),
  bcrypt = require('bcryptjs'), path = require('path'), crypto = require('crypto'), mysql = require('mysql2/promise');
const app = express(), PORT = process.env.PORT || 3000;
const SERVERLESS = !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

// ---------- MySQL ----------
// Ignore the placeholder value copied from .env.example
const dbUrl = () => { const u = (process.env.DATABASE_URL || '').trim(); return /USER:PASSWORD|@HOST[:/]/.test(u) ? '' : u; };
function dbConfig() {
  const url = dbUrl();
  if (url) {
    const u = new URL(url);
    return { host: u.hostname, port: +u.port || 3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1) };
  }
  return { host: process.env.DB_HOST || 'localhost', port: +process.env.DB_PORT || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'portfolio' };
}
const ssl = () => {
  const m = String(process.env.DB_SSL || '').toLowerCase();
  if (!m || m === 'false') return undefined;
  const o = { rejectUnauthorized: m !== 'insecure' };
  if (process.env.DB_SSL_CA) o.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  return o;
};
let pool;
const getPool = () => pool || (pool = mysql.createPool({ ...dbConfig(), ssl: ssl(), charset: 'utf8mb4', connectTimeout: 8000, waitForConnections: true, connectionLimit: SERVERLESS ? 2 : 10 }));
const q = async (sql, p) => (await getPool().query(sql, p))[0];

const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const lc = () => ({ solved: 0, total: 0 });
const DEFAULTS = () => ({
  secret: crypto.randomBytes(32).toString('hex'),
  admin: { username: process.env.ADMIN_USER || 'admin', hash: bcrypt.hashSync(process.env.ADMIN_PASS || 'admin123', 10) },
  settings: { accent: '#00e5ff', accent2: '#ff3df2', bg: '#070b14', text: '#e8f0ff', font: 'Space Grotesk', glow: 60 },
  profile: { name: 'Your Name', title: 'Full-Stack Developer', bio: 'Edit this text from the admin panel.', email: '', github: '', linkedin: '', location: '', photo: '', resume: '' },
  leetcode: { username: '', easy: lc(), medium: lc(), hard: lc(), updated: null, error: '' }
});
const kvGet = async k => { const r = await q('SELECT kval FROM kv WHERE kname=?', [k]); return r.length ? JSON.parse(r[0].kval) : null; };
const kvSet = (k, v) => q('INSERT INTO kv(kname,kval) VALUES(?,?) ON DUPLICATE KEY UPDATE kval=VALUES(kval)', [k, JSON.stringify(v)]);

let readyP = null, SECRET = null;
async function init() {
  if (!dbUrl()) {
    try {
      const c = dbConfig(), conn = await mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, ssl: ssl() });
      await conn.query('CREATE DATABASE IF NOT EXISTS `' + c.database.replace(/`/g, '') + '` CHARACTER SET utf8mb4');
      await conn.end();
    } catch (e) { /* database may already exist or user cannot create it */ }
  }
  const T = [
    'CREATE TABLE IF NOT EXISTS kv(kname VARCHAR(40) PRIMARY KEY, kval LONGTEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS projects(id VARCHAR(24) PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT, tech TEXT, github VARCHAR(500), live_url VARCHAR(500), image VARCHAR(100), ts BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS certificates(id VARCHAR(24) PRIMARY KEY, title VARCHAR(255) NOT NULL, issuer VARCHAR(255), date_text VARCHAR(80), file VARCHAR(100), is_pdf TINYINT(1) DEFAULT 0, ts BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS messages(id VARCHAR(24) PRIMARY KEY, name VARCHAR(160), email VARCHAR(255), message TEXT, is_read TINYINT(1) DEFAULT 0, ts BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS feedback(id VARCHAR(24) PRIMARY KEY, name VARCHAR(160), role_name VARCHAR(160), text TEXT, rating TINYINT, approved TINYINT(1) DEFAULT 0, ts BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS files(id VARCHAR(40) PRIMARY KEY, mime VARCHAR(60) NOT NULL, data LONGBLOB NOT NULL)',
    'CREATE TABLE IF NOT EXISTS visits(id BIGINT AUTO_INCREMENT PRIMARY KEY, ts BIGINT NOT NULL, day CHAR(10) NOT NULL, vid VARCHAR(40), kind VARCHAR(12) NOT NULL, label VARCHAR(160), ref VARCHAR(120), device VARCHAR(10), KEY idx_ts (ts), KEY idx_kind (kind, ts))'
  ];
  for (const s of T) await q(s);
  const d = DEFAULTS();
  for (const k of Object.keys(d)) await q('INSERT IGNORE INTO kv(kname,kval) VALUES(?,?)', [k, JSON.stringify(d[k])]);
  SECRET = await kvGet('secret');
}
function dbMsg(e) {
  const c = e.code || '';
  if (SERVERLESS && !dbUrl() && !process.env.DB_HOST) return 'DATABASE_URL is not set. Add it in your hosting dashboard (Vercel: Settings > Environment Variables, Netlify: Site settings > Environment variables), then redeploy. [NO_DATABASE_URL]';
  const why = /SELF_SIGNED|UNABLE_TO_VERIFY|CERT_/.test(c) ? 'The database SSL certificate is not trusted. Set DB_SSL_CA to your provider CA certificate, or set DB_SSL=insecure to skip the check.'
    : c === 'HANDSHAKE_NO_SSL_SUPPORT' ? 'This database does not support SSL. Set DB_SSL=false.'
    : (c === 'ECONNRESET' || c === 'PROTOCOL_CONNECTION_LOST' || c === 'HANDSHAKE_SSL_ERROR') ? 'The database closed the connection. Cloud databases usually need DB_SSL=true.'
    : c === 'ECONNREFUSED' ? 'MySQL is not running on this computer (or the host/port in .env or hosting settings is wrong). Start MySQL first.'
    : c === 'ER_ACCESS_DENIED_ERROR' ? 'MySQL username or password in .env or hosting settings is wrong.'
    : c === 'ER_BAD_DB_ERROR' ? 'The database name in .env or hosting settings does not exist. Create it, or give the user permission to create it.'
    : c === 'ENOTFOUND' ? 'MySQL host name in .env or hosting settings was not found.'
    : c === 'ETIMEDOUT' ? 'MySQL server did not answer (timeout). Check host, port and firewall.'
    : 'Could not connect to MySQL: ' + (c || e.message);
  return why + ' [' + (c || 'error') + ']';
}
const ready = () => readyP || (readyP = init().catch(e => { readyP = null; throw e; }));

// ---------- row mappers ----------
const iso = ts => new Date(Number(ts)).toISOString();
const mP = r => ({ id: r.id, title: r.title, description: r.description || '', tech: JSON.parse(r.tech || '[]'), github: r.github || '', live: r.live_url || '', image: r.image || '' });
const mC = r => ({ id: r.id, title: r.title, issuer: r.issuer || '', date: r.date_text || '', file: r.file, pdf: !!r.is_pdf });
const mM = r => ({ id: r.id, name: r.name, email: r.email, message: r.message, read: !!r.is_read, at: iso(r.ts) });
const mF = r => ({ id: r.id, name: r.name, role: r.role_name || '', text: r.text, rating: r.rating, approved: !!r.approved, at: iso(r.ts) });
const list = async (t, m, where = '') => (await q(`SELECT * FROM ${t} ${where} ORDER BY ts DESC`)).map(m);

// ---------- helpers ----------
const FONTS = ['Space Grotesk', 'Inter', 'Poppins', 'Montserrat', 'Raleway', 'Outfit', 'Sora', 'Manrope', 'DM Sans', 'Playfair Display', 'Lora', 'Merriweather', 'Fira Code', 'JetBrains Mono', 'Orbitron', 'Rajdhani'];
const HEX = /^#[0-9a-fA-F]{6}$/, MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const okUrl = u => !u || /^https?:\/\//i.test(u);
const w = fn => (req, res, next) => fn(req, res, next).catch(next);
const hits = new Map();
const limit = max => (req, res, next) => {
  const k = req.ip + req.path, now = Date.now(), arr = (hits.get(k) || []).filter(t => now - t < 60000);
  if (arr.length >= max) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  arr.push(now); hits.set(k, arr); next();
};
const auth = (req, res, next) => {
  try { jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'Please log in' }); }
};
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, f, cb) => /\.(png|jpe?g|gif|webp|pdf)$/i.test(f.originalname) ? cb(null, true) : cb(new Error('Only PNG, JPG, GIF, WEBP or PDF files are allowed'))
});
async function saveFile(f) {
  const ext = path.extname(f.originalname).slice(1).toLowerCase(), id = uid() + '.' + ext;
  await q('INSERT INTO files(id,mime,data) VALUES(?,?,?)', [id, MIME[ext], f.buffer]);
  return '/uploads/' + id;
}
const rmFile = url => url && url.startsWith('/uploads/') ? q('DELETE FROM files WHERE id=?', [url.slice(9)]) : null;

// ---------- LeetCode ----------
let lastTry = 0;
async function refreshLeet() {
  const L = await kvGet('leetcode'), u = L.username;
  if (!u) return L;
  lastTry = Date.now();
  try {
    const r = await fetch('https://leetcode.com/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ query: 'query q($u:String!){allQuestionsCount{difficulty count} matchedUser(username:$u){submitStats{acSubmissionNum{difficulty count}}}}', variables: { u } }),
      signal: AbortSignal.timeout(8000)
    });
    const j = await r.json(), m = j.data && j.data.matchedUser;
    if (!m) throw new Error('LeetCode user "' + u + '" not found');
    const ac = m.submitStats.acSubmissionNum, all = j.data.allQuestionsCount, g = (a, d) => (a.find(x => x.difficulty === d) || { count: 0 }).count;
    ['Easy', 'Medium', 'Hard'].forEach(d => { L[d.toLowerCase()] = { solved: g(ac, d), total: g(all, d) }; });
    L.updated = new Date().toISOString(); L.error = '';
  } catch (e) { L.error = 'Could not fetch from LeetCode (' + e.message + '). Showing last saved numbers.'; }
  await kvSet('leetcode', L); return L;
}

// ---------- visitor tracking ----------
const deviceOf = ua => /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
async function logVisit(req, kind, label, vid, ref) {
  const ua = req.headers['user-agent'] || '';
  if (!ua || /bot|crawl|spider|slurp|headless|preview|curl|wget/i.test(ua)) return;
  let host = 'Direct';
  try { const h = new URL(ref).hostname.replace(/^www\./, ''); if (h && h !== String(req.hostname || '').replace(/^www\./, '')) host = h; } catch (e) { /* no referrer */ }
  const now = Date.now();
  await q('INSERT INTO visits(ts,day,vid,kind,label,ref,device) VALUES(?,?,?,?,?,?,?)', [now, new Date(now).toISOString().slice(0, 10), str(vid, 40), kind, str(label, 160), host.slice(0, 120), deviceOf(ua)]);
  if (Math.random() < 0.01) await q('DELETE FROM visits WHERE ts<?', [now - 400 * 864e5]);
}

// ---------- app ----------
app.use((req, res, next) => { req.url = req.url.replace(/^\/\.netlify\/functions\/server/, '') || '/'; next(); });
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', async (req, res) => {
  const info = { hosting: SERVERLESS ? 'serverless' : 'local', databaseUrlSet: !!dbUrl(), dbSsl: process.env.DB_SSL || 'off', node: process.version };
  try { await ready(); res.json({ ok: true, ...info }); } catch (e) { res.json({ ok: false, error: dbMsg(e), ...info }); }
});
app.use(w(async (req, res, next) => {
  try { await ready(); next(); }
  catch (e) { res.status(500).json({ error: dbMsg(e) }); }
}));

app.get('/uploads/:id', w(async (req, res) => {
  const r = await q('SELECT mime,data FROM files WHERE id=?', [req.params.id]);
  if (!r.length) return res.status(404).end();
  res.set({ 'Content-Type': r[0].mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).send(r[0].data);
}));

app.get('/api/public', w(async (req, res) => {
  let leetcode = await kvGet('leetcode'), profile = await kvGet('profile'), now = Date.now(), jobs = [];
  if (leetcode.username && now - lastTry > 60000 && (!leetcode.updated || now - new Date(leetcode.updated) > 600000)) jobs.push(refreshLeet().then(v => { leetcode = v; }));
  await Promise.all(jobs);
  res.json({
    settings: await kvGet('settings'), profile: { ...profile, resume: !!profile.resume }, leetcode,
    projects: await list('projects', mP), certificates: await list('certificates', mC), feedback: await list('feedback', mF, 'WHERE approved=1')
  });
}));
app.get('/api/resume', w(async (req, res) => {
  const p = await kvGet('profile');
  const r = p.resume ? await q('SELECT data FROM files WHERE id=?', [p.resume.slice(9)]) : [];
  if (!r.length) return res.status(404).send('No resume uploaded yet.');
  await logVisit(req, 'resume', 'Resume');
  const nm = String(p.name || 'My').replace(/[^\w\- ]+/g, '').trim() || 'My';
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="' + nm + ' - Resume.pdf"', 'X-Content-Type-Options': 'nosniff' }).send(r[0].data);
}));
app.post('/api/track', limit(60), w(async (req, res) => {
  const k = req.body.kind;
  if (!['view', 'project'].includes(k)) return res.status(400).json({ error: 'Bad event' });
  await logVisit(req, k, k === 'project' ? req.body.label : '', req.body.vid, req.body.ref);
  res.json({ ok: true });
}));
app.post('/api/messages', limit(5), w(async (req, res) => {
  const name = str(req.body.name, 80), email = str(req.body.email, 120), message = str(req.body.message, 3000);
  if (!name || !message || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter your name, a valid email and a message' });
  await q('INSERT INTO messages(id,name,email,message,ts) VALUES(?,?,?,?,?)', [uid(), name, email, message, Date.now()]);
  res.json({ ok: true });
}));
app.post('/api/feedback', limit(5), w(async (req, res) => {
  const name = str(req.body.name, 80), role = str(req.body.role, 80), text = str(req.body.text, 1000);
  const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 5));
  if (!name || !text) return res.status(400).json({ error: 'Enter your name and feedback' });
  await q('INSERT INTO feedback(id,name,role_name,text,rating,ts) VALUES(?,?,?,?,?,?)', [uid(), name, role, text, rating, Date.now()]);
  res.json({ ok: true });
}));
app.post('/api/login', limit(10), w(async (req, res) => {
  const { username, password } = req.body || {}, a = await kvGet('admin');
  if (username !== a.username || !bcrypt.compareSync(String(password || ''), a.hash)) return res.status(401).json({ error: 'Wrong username or password' });
  res.json({ token: jwt.sign({ u: username }, SECRET, { expiresIn: '12h' }) });
}));

// ---------- admin ----------
const A = express.Router();
A.use(auth);
A.get('/all', w(async (req, res) => {
  res.json({
    settings: await kvGet('settings'), profile: await kvGet('profile'), leetcode: await kvGet('leetcode'),
    projects: await list('projects', mP), certificates: await list('certificates', mC), messages: await list('messages', mM),
    feedback: await list('feedback', mF), fonts: FONTS, username: (await kvGet('admin')).username
  });
}));
A.put('/profile', upload.single('photo'), w(async (req, res) => {
  const p = await kvGet('profile');
  ['name', 'title', 'bio', 'email', 'github', 'linkedin', 'location'].forEach(k => { if (k in req.body) p[k] = str(req.body[k], k === 'bio' ? 2000 : 200); });
  if (req.file) { await rmFile(p.photo); p.photo = await saveFile(req.file); }
  await kvSet('profile', p);
  res.json(p);
}));
A.delete('/photo', w(async (req, res) => {
  const p = await kvGet('profile'); await rmFile(p.photo); p.photo = ''; await kvSet('profile', p); res.json(p);
}));
A.put('/settings', w(async (req, res) => {
  const b = req.body, s = await kvGet('settings');
  ['accent', 'accent2', 'bg', 'text'].forEach(k => { if (HEX.test(b[k])) s[k] = b[k]; });
  if (FONTS.includes(b.font)) s.font = b.font;
  if (b.glow !== undefined) s.glow = Math.min(100, Math.max(0, parseInt(b.glow, 10) || 0));
  await kvSet('settings', s); res.json(s);
}));
A.put('/password', w(async (req, res) => {
  const { current, next, username } = req.body || {}, a = await kvGet('admin');
  if (!bcrypt.compareSync(String(current || ''), a.hash)) return res.status(400).json({ error: 'Current password is wrong' });
  const nu = String(username || '').trim(), np = String(next || ''); let changed = false;
  if (nu && nu !== a.username) {
    if (!/^[A-Za-z0-9_.@-]{3,40}$/.test(nu)) return res.status(400).json({ error: 'Username must be 3 to 40 characters: letters, numbers and . _ - @' });
    a.username = nu; changed = true;
  }
  if (np) {
    if (np.length < 6) return res.status(400).json({ error: 'New password needs at least 6 characters' });
    a.hash = bcrypt.hashSync(np, 10); changed = true;
  }
  if (!changed) return res.status(400).json({ error: 'Nothing to change. Enter a new username or a new password' });
  await kvSet('admin', a); res.json({ ok: true, username: a.username });
}));

const pf = b => ({
  title: str(b.title, 120), description: str(b.description, 3000), github: str(b.github, 300), live: str(b.live, 300),
  tech: str(b.tech, 300).split(',').map(s => s.trim()).filter(Boolean).slice(0, 15)
});
const pCheck = p => !p.title ? 'Project title is required' : (!okUrl(p.github) || !okUrl(p.live)) ? 'Links must start with http:// or https://' : null;
A.post('/projects', upload.single('image'), w(async (req, res) => {
  const p = pf(req.body), bad = pCheck(p); if (bad) return res.status(400).json({ error: bad });
  const image = req.file ? await saveFile(req.file) : '', id = uid();
  await q('INSERT INTO projects(id,title,description,tech,github,live_url,image,ts) VALUES(?,?,?,?,?,?,?,?)', [id, p.title, p.description, JSON.stringify(p.tech), p.github, p.live, image, Date.now()]);
  res.json({ id, ...p, image });
}));
A.put('/projects/:id', upload.single('image'), w(async (req, res) => {
  const r = await q('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!r.length) return res.status(404).json({ error: 'Project not found' });
  const p = pf(req.body), bad = pCheck(p); if (bad) return res.status(400).json({ error: bad });
  let image = r[0].image;
  if (req.file) { await rmFile(image); image = await saveFile(req.file); }
  await q('UPDATE projects SET title=?,description=?,tech=?,github=?,live_url=?,image=? WHERE id=?', [p.title, p.description, JSON.stringify(p.tech), p.github, p.live, image, req.params.id]);
  res.json({ id: req.params.id, ...p, image });
}));
A.delete('/projects/:id', w(async (req, res) => {
  const r = await q('SELECT image FROM projects WHERE id=?', [req.params.id]);
  if (r.length) { await rmFile(r[0].image); await q('DELETE FROM projects WHERE id=?', [req.params.id]); }
  res.json({ ok: true });
}));
A.post('/certificates', upload.single('file'), w(async (req, res) => {
  const title = str(req.body.title, 150);
  if (!title) return res.status(400).json({ error: 'Certificate title is required' });
  if (!req.file) return res.status(400).json({ error: 'Choose an image or PDF file' });
  const file = await saveFile(req.file), id = uid(), pdf = /\.pdf$/i.test(file) ? 1 : 0;
  await q('INSERT INTO certificates(id,title,issuer,date_text,file,is_pdf,ts) VALUES(?,?,?,?,?,?,?)', [id, title, str(req.body.issuer, 120), str(req.body.date, 40), file, pdf, Date.now()]);
  res.json({ id, title, file, pdf: !!pdf });
}));
A.delete('/certificates/:id', w(async (req, res) => {
  const r = await q('SELECT file FROM certificates WHERE id=?', [req.params.id]);
  if (r.length) { await rmFile(r[0].file); await q('DELETE FROM certificates WHERE id=?', [req.params.id]); }
  res.json({ ok: true });
}));
A.put('/leetcode', w(async (req, res) => {
  const b = req.body || {}, L = await kvGet('leetcode');
  L.username = str(b.username, 60);
  if (b.manual) ['easy', 'medium', 'hard'].forEach(k => {
    const m = b.manual[k]; if (!m) return;
    L[k] = { solved: Math.max(0, parseInt(m.solved, 10) || 0), total: Math.max(0, parseInt(m.total, 10) || 0) };
    L.updated = new Date().toISOString(); L.error = '';
  });
  await kvSet('leetcode', L);
  res.json(L.username && !b.manual ? await refreshLeet() : L);
}));
A.post('/leetcode/refresh', w(async (req, res) => {
  if (!(await kvGet('leetcode')).username) return res.status(400).json({ error: 'Save your LeetCode username first' });
  res.json(await refreshLeet());
}));
A.patch('/messages/:id', w(async (req, res) => { await q('UPDATE messages SET is_read=? WHERE id=?', [req.body.read === false ? 0 : 1, req.params.id]); res.json({ ok: true }); }));
A.delete('/messages/:id', w(async (req, res) => { await q('DELETE FROM messages WHERE id=?', [req.params.id]); res.json({ ok: true }); }));
A.patch('/feedback/:id', w(async (req, res) => { await q('UPDATE feedback SET approved=? WHERE id=?', [req.body.approved ? 1 : 0, req.params.id]); res.json({ ok: true }); }));
A.delete('/feedback/:id', w(async (req, res) => { await q('DELETE FROM feedback WHERE id=?', [req.params.id]); res.json({ ok: true }); }));
A.put('/resume', upload.single('resume'), w(async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Choose a PDF file' });
  if (!/\.pdf$/i.test(f.originalname) || f.buffer.slice(0, 4).toString() !== '%PDF') return res.status(400).json({ error: 'Resume must be a PDF file' });
  const p = await kvGet('profile'); await rmFile(p.resume); p.resume = await saveFile(f); await kvSet('profile', p); res.json({ ok: true, resume: p.resume });
}));
A.delete('/resume', w(async (req, res) => { const p = await kvGet('profile'); await rmFile(p.resume); p.resume = ''; await kvSet('profile', p); res.json({ ok: true }); }));
A.get('/analytics', w(async (req, res) => {
  const off = Math.max(-50400, Math.min(50400, parseInt(req.query.tz, 10) || 0)), DAY = 864e5, now = Date.now();
  const ymd = ms => new Date(ms + off * 1000).toISOString().slice(0, 10), RE = /^\d{4}-\d{2}-\d{2}$/;
  let to = RE.test(req.query.to) ? req.query.to : ymd(now), from = RE.test(req.query.from) ? req.query.from : ymd(now - 29 * DAY);
  if (from > to) [from, to] = [to, from];
  if (isNaN(Date.parse(from + 'T00:00:00Z')) || isNaN(Date.parse(to + 'T00:00:00Z'))) return res.status(400).json({ error: 'Invalid date' });
  const t1 = Date.parse(to + 'T00:00:00Z');
  if ((t1 - Date.parse(from + 'T00:00:00Z')) / DAY > 400) from = new Date(t1 - 400 * DAY).toISOString().slice(0, 10);
  const t0 = Date.parse(from + 'T00:00:00Z'), since = t0 - off * 1000, until = t1 + DAY - off * 1000;
  const LD = "DATE_ADD('1970-01-01', INTERVAL (ts DIV 1000 + " + off + ") SECOND)";
  const one = async (sql, p) => (await q(sql, p))[0];
  const tot = await one("SELECT COUNT(*) v, COUNT(DISTINCT vid) u FROM visits WHERE kind='view' AND ts>=? AND ts<?", [since, until]);
  const ts0 = Date.parse(ymd(now) + 'T00:00:00Z') - off * 1000;
  const td = await one("SELECT COUNT(*) v, COUNT(DISTINCT vid) u FROM visits WHERE kind='view' AND ts>=? AND ts<?", [ts0, ts0 + DAY]);
  const cnt = async k => Number((await one('SELECT COUNT(*) c FROM visits WHERE kind=? AND ts>=? AND ts<?', [k, since, until])).c);
  const grp = async fmt => { const m = {}; (await q(`SELECT ${fmt} g, COUNT(*) v, COUNT(DISTINCT vid) u FROM visits WHERE kind='view' AND ts>=? AND ts<? GROUP BY g`, [since, until])).forEach(r => { m[r.g] = { views: Number(r.v), unique: Number(r.u) }; }); return m; };
  const dm = await grp(`DATE_FORMAT(${LD}, '%Y-%m-%d')`), mm = await grp(`DATE_FORMAT(${LD}, '%Y-%m')`), wm = await grp(`DAYOFWEEK(${LD})`);
  const pick = (m, k) => ({ key: k, views: (m[k] || {}).views || 0, unique: (m[k] || {}).unique || 0 });
  const daily = []; for (let t = t0; t <= t1; t += DAY) daily.push(pick(dm, new Date(t).toISOString().slice(0, 10)));
  const monthly = []; { let y = +from.slice(0, 4), mo = +from.slice(5, 7); const ey = +to.slice(0, 4), em = +to.slice(5, 7);
    while (y < ey || (y === ey && mo <= em)) { monthly.push(pick(mm, y + '-' + String(mo).padStart(2, '0'))); if (++mo > 12) { mo = 1; y++; } } }
  const weekday = [['Mon', 2], ['Tue', 3], ['Wed', 4], ['Thu', 5], ['Fri', 6], ['Sat', 7], ['Sun', 1]].map(([n, d]) => ({ ...pick(wm, d), key: n }));
  const top = async (sql, p) => (await q(sql, p)).map(r => ({ label: r.label, count: Number(r.c) }));
  res.json({
    from, to, views: Number(tot.v), unique: Number(tot.u), today: { views: Number(td.v), unique: Number(td.u) }, projectOpens: await cnt('project'), resume: await cnt('resume'),
    daily, monthly, weekday,
    topProjects: await top("SELECT label, COUNT(*) c FROM visits WHERE kind='project' AND ts>=? AND ts<? GROUP BY label ORDER BY c DESC LIMIT 6", [since, until]),
    devices: await top("SELECT device label, COUNT(*) c FROM visits WHERE kind='view' AND ts>=? AND ts<? GROUP BY device ORDER BY c DESC", [since, until]),
    referrers: await top("SELECT ref label, COUNT(*) c FROM visits WHERE kind='view' AND ts>=? AND ts<? GROUP BY ref ORDER BY c DESC LIMIT 8", [since, until]),
    recent: (await q('SELECT ts, kind, label, ref, device FROM visits ORDER BY id DESC LIMIT 15')).map(r => ({ at: new Date(Number(r.ts)).toISOString(), kind: r.kind, label: r.label, ref: r.ref, device: r.device }))
  });
}));
app.use('/api/admin', A);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is larger than 4 MB' });
  if (err instanceof multer.MulterError || /Only PNG/.test(err.message)) return res.status(400).json({ error: err.message });
  console.error(err); res.status(500).json({ error: 'Server error. Please try again.' });
});

module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Portfolio:   http://localhost:${PORT}\n  Admin panel: http://localhost:${PORT}/admin.html\n`);
    ready().then(() => console.log('  MySQL: connected and tables are ready\n'))
      .catch(e => console.log('  MySQL ERROR: ' + dbMsg(e) + '\n  Fix your .env file (copy .env.example to .env), then restart with: npm start\n'));
  });
}
