// Kerstmarkt bestelstatus – kleine server zonder externe dependencies.
// Start: ADMIN_PIN=1234 node server.js   (poort via PORT, standaard 3000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'orders.json');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '';

if (!ADMIN_PIN) {
  console.warn('LET OP: geen ADMIN_PIN gezet. Start met bv. ADMIN_PIN=4821 node server.js');
}

// Statussen in volgorde van het proces.
const STATUSES = ['betalen', 'wachtrij', 'printen', 'klaar', 'opgehaald', 'geannuleerd'];

// ---------- opslag ----------
let orders = {};
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) orders = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  console.error('Kon orders niet laden, begin leeg:', e.message);
  orders = {};
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(orders, null, 1));
    fs.renameSync(tmp, DATA_FILE);
  }, 200);
}

// ---------- codes ----------
// Willekeurige code zonder verwarrende tekens (geen 0/O, 1/I/L).
// Niet oplopend, dus een klant kan niet afleiden hoeveel bestellingen er zijn.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    const bytes = crypto.randomBytes(5);
    for (const b of bytes) c += ALPHABET[b % ALPHABET.length];
    if (!orders[c]) return c;
  }
}

// ---------- opruimen ----------
const MIN = 60 * 1000;
function cleanup() {
  const now = Date.now();
  const c = CONFIG.cleanup;
  const purgeAt = c.purgeEverythingAfter ? Date.parse(c.purgeEverythingAfter) : NaN;
  let changed = false;
  for (const [code, o] of Object.entries(orders)) {
    const age = now - o.updatedAt;
    const gone =
      (now > purgeAt) ||
      (o.status === 'opgehaald' && age > c.pickedUpVisibleMinutes * MIN) ||
      (o.status === 'geannuleerd' && age > c.cancelledVisibleMinutes * MIN) ||
      (o.status === 'betalen' && age > c.unpaidExpireMinutes * MIN);
    if (gone) { delete orders[code]; changed = true; }
  }
  if (changed) save();
}
setInterval(cleanup, MIN);
cleanup();

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10_000) { reject(new Error('te groot')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('ongeldige JSON')); }
    });
  });
}

function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CONFIG.maxNameLength);
}

function validColor(id) {
  return CONFIG.colors.some((c) => c.id === id);
}

function publicOrder(o) {
  // Bewust géén wachtrijpositie of totaal aantal: alleen wat deze klant moet weten.
  return { code: o.code, name: o.name, color: o.color, status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt };
}

// ---------- beheer-sessies ----------
const sessions = new Set();
function isAdmin(req) {
  const m = /(?:^|;\s*)kraam=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return !!(m && sessions.has(m[1]));
}

// Eenvoudige rem tegen spam-bestellingen en PIN-raden.
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
function ip(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
}

// ---------- statische bestanden ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveFile(res, file) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) return send(res, 403, 'Nee');
  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, 'Niet gevonden');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  let m;

  // Pagina's
  if (req.method === 'GET') {
    if (p === '/') return serveFile(res, 'index.html');
    if (p === '/kraam') return serveFile(res, 'kraam.html');
    if (/^\/b\/[A-Za-z0-9]{3,8}$/.test(p)) return serveFile(res, 'status.html');
    if (/^\/[a-z0-9_-]+\.(css|js|svg|png|ico)$/.test(p)) return serveFile(res, p.slice(1));
  }

  // Publieke API
  if (p === '/api/config' && req.method === 'GET') {
    const { shopName, tagline, price, maxNameLength, selfOrder, colors, days, standLocation } = CONFIG;
    return send(res, 200, { shopName, tagline, price, maxNameLength, selfOrder, colors, days, standLocation });
  }

  if (p === '/api/orders' && req.method === 'POST') {
    if (!CONFIG.selfOrder) return send(res, 403, { error: 'Bestellen gaat via de kraam.' });
    if (limited('order:' + ip(req), 6, 10 * MIN)) return send(res, 429, { error: 'Even rustig aan, probeer het zo nog eens.' });
    const body = await readBody(req);
    const name = cleanName(body.name);
    if (!name) return send(res, 400, { error: 'Vul een naam in.' });
    if (!validColor(body.color)) return send(res, 400, { error: 'Kies een kleur.' });
    const now = Date.now();
    const o = { code: newCode(), name, color: body.color, status: 'betalen', createdAt: now, updatedAt: now, source: 'klant' };
    orders[o.code] = o;
    save();
    return send(res, 201, publicOrder(o));
  }

  if ((m = /^\/api\/orders\/([A-Za-z0-9]{3,8})$/.exec(p)) && req.method === 'GET') {
    if (limited('look:' + ip(req), 240, MIN)) return send(res, 429, { error: 'Te veel verzoeken.' });
    const o = orders[m[1].toUpperCase()];
    if (!o) return send(res, 404, { error: 'Niet (meer) gevonden.' });
    return send(res, 200, publicOrder(o));
  }

  // Beheer (kraam)
  if (p === '/api/admin/login' && req.method === 'POST') {
    if (limited('pin:' + ip(req), 8, 10 * MIN)) return send(res, 429, { error: 'Te vaak geprobeerd, wacht even.' });
    const body = await readBody(req);
    if (!ADMIN_PIN || String(body.pin) !== ADMIN_PIN) return send(res, 401, { error: 'Onjuiste pincode.' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.add(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `kraam=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=172800` });
  }

  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Niet ingelogd.' });

    if (p === '/api/admin/orders' && req.method === 'GET') {
      return send(res, 200, { orders: Object.values(orders).sort((a, b) => a.createdAt - b.createdAt), statuses: STATUSES });
    }

    if (p === '/api/admin/orders' && req.method === 'POST') {
      const body = await readBody(req);
      const name = cleanName(body.name);
      if (!name) return send(res, 400, { error: 'Vul een naam in.' });
      if (!validColor(body.color)) return send(res, 400, { error: 'Kies een kleur.' });
      const now = Date.now();
      const o = { code: newCode(), name, color: body.color, status: 'wachtrij', createdAt: now, updatedAt: now, source: 'kraam' };
      orders[o.code] = o;
      save();
      return send(res, 201, o);
    }

    if ((m = /^\/api\/admin\/orders\/([A-Z0-9]{3,8})$/.exec(p)) && req.method === 'PATCH') {
      const o = orders[m[1]];
      if (!o) return send(res, 404, { error: 'Niet gevonden.' });
      const body = await readBody(req);
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) return send(res, 400, { error: 'Onbekende status.' });
        o.status = body.status;
      }
      if (body.name !== undefined) {
        const name = cleanName(body.name);
        if (name) o.name = name;
      }
      if (body.color !== undefined && validColor(body.color)) o.color = body.color;
      o.updatedAt = Date.now();
      save();
      return send(res, 200, o);
    }

    if ((m = /^\/api\/admin\/orders\/([A-Z0-9]{3,8})$/.exec(p)) && req.method === 'DELETE') {
      delete orders[m[1]];
      save();
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Niet gevonden.' });
}

http
  .createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 400, { error: e.message || 'Fout' }));
  })
  .listen(PORT, () => console.log(`Kerstmarkt-bestelstatus draait op http://localhost:${PORT}  (kraam: /kraam)`));
