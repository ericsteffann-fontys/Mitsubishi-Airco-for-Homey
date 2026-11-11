// Studieplanner – kleine server zonder externe dependencies.
// Start: ADMIN_PIN=1234 node server.js   (poort via PORT, standaard 3000)
//
// Privacy: de server kent GEEN studentgegevens. Er is geen enkel endpoint dat een
// studieplan ontvangt of opslaat. Het plan wordt in de browser opgebouwd en als PDF
// bewaard door de student zelf. De server serveert alleen de pagina's en de catalogus
// (het aanbod van EvL's), die via /beheer met een pincode aangepast kan worden.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'catalogus.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DEFAULT_CATALOG = path.join(PUBLIC, 'catalogus.json'); // voorbeeld, gebruikt zolang beheer nog niets opsloeg
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '';
const MAX_BODY = 2 * 1024 * 1024;

if (!ADMIN_PIN) {
  console.warn('LET OP: geen ADMIN_PIN gezet. Beheer kan dan niet opslaan. Start met bv. ADMIN_PIN=4821 node server.js');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, ...SECURITY_HEADERS, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// ---------- pincode met eenvoudige rem op raden ----------
const attempts = new Map(); // ip -> { n, until }
function pinOk(req) {
  const ip = req.socket.remoteAddress || '?';
  const a = attempts.get(ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return 'locked';
  const given = Buffer.from(String(req.headers['x-admin-pin'] || ''));
  const want = Buffer.from(ADMIN_PIN);
  const ok = ADMIN_PIN && given.length === want.length && crypto.timingSafeEqual(given, want);
  if (ok) { attempts.delete(ip); return true; }
  a.n += 1;
  if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
  attempts.set(ip, a);
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('te groot')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- catalogus ----------
function validateCatalog(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'Catalogus moet een object zijn';
  if (!Array.isArray(c.evls)) return 'evls ontbreekt';
  const ids = new Set();
  for (const e of c.evls) {
    if (!e || typeof e.id !== 'string' || !e.id) return 'EvL zonder id';
    if (ids.has(e.id)) return 'Dubbele EvL-id: ' + e.id;
    ids.add(e.id);
    if (typeof e.naam !== 'string' || !e.naam.trim()) return 'EvL zonder naam (' + e.id + ')';
    if (![15, 30].includes(Number(e.ec))) return 'EC moet 15 of 30 zijn (' + e.naam + ')';
  }
  const j1 = Number(c.eersteSchooljaar), j2 = Number(c.laatsteSchooljaar);
  if (!(j1 >= 2000 && j2 <= 2100 && j1 <= j2)) return 'Ongeldige schooljaren';
  return null;
}

function currentCatalogFile() {
  return fs.existsSync(CATALOG_FILE) ? CATALOG_FILE : DEFAULT_CATALOG;
}

function saveCatalog(c) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (fs.existsSync(CATALOG_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(CATALOG_FILE, path.join(BACKUP_DIR, `catalogus-${stamp}.json`));
    // houd de laatste 50 back-ups
    const all = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
    for (const f of all.slice(0, Math.max(0, all.length - 50))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  }
  const tmp = CATALOG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, CATALOG_FILE);
}

// ---------- statische bestanden ----------
function serveStatic(res, rel) {
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, data, type, { 'Cache-Control': 'no-cache' });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/catalogus.json') {
      return fs.readFile(currentCatalogFile(), (err, data) => {
        if (err) return send(res, 500, { error: 'Catalogus niet leesbaar' });
        send(res, 200, data, MIME['.json'], { 'Cache-Control': 'no-store' });
      });
    }
    if (req.method === 'POST' && p === '/api/login') {
      const ok = pinOk(req);
      if (ok === 'locked') return send(res, 429, { error: 'Te veel pogingen, probeer het over 5 minuten opnieuw' });
      return ok ? send(res, 200, { ok: true }) : send(res, 401, { error: 'Onjuiste pincode' });
    }
    if (req.method === 'PUT' && p === '/api/catalogus') {
      const ok = pinOk(req);
      if (ok === 'locked') return send(res, 429, { error: 'Te veel pogingen, probeer het over 5 minuten opnieuw' });
      if (!ok) return send(res, 401, { error: 'Onjuiste pincode' });
      let c;
      try { c = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'Ongeldige JSON' }); }
      const err = validateCatalog(c);
      if (err) return send(res, 400, { error: err });
      c.versie = new Date().toISOString().slice(0, 10) + '.' + Date.now().toString(36);
      saveCatalog(c);
      return send(res, 200, { ok: true, versie: c.versie });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Niet toegestaan' });
    if (p === '/' || p === '/index.html') return serveStatic(res, 'index.html');
    if (p === '/beheer' || p === '/beheer/') return serveStatic(res, 'beheer.html');
    return serveStatic(res, decodeURIComponent(p).replace(/^\/+/, ''));
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Serverfout' });
  }
});

server.listen(PORT, () => {
  console.log(`Studieplanner draait op http://localhost:${PORT}  (beheer: /beheer)`);
  console.log('Catalogus: ' + currentCatalogFile());
});
