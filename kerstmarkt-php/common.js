// Gedeelde helpers voor klant- en kraampagina's.

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) { const err = new Error(data.error || 'Er ging iets mis.'); err.status = res.status; throw err; }
  return data;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Leesbare tekstkleur op een gekleurde badge.
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#1b1b1b' : '#ffffff';
}

function colorById(config, id) {
  return (config.allColors || config.colors).find((c) => c.id === id) || { id, label: id, hex: '#999999' };
}

function pencilHTML(name, color) {
  return `<div class="pencil" aria-hidden="true">
    <div class="tip"></div><div class="body"></div>
    <div class="badge" style="background:${color.hex};color:${textOn(color.hex)}">${esc(name || 'Jouw naam')}</div>
    <div class="body end"></div><div class="eraser"></div>
  </div>`;
}

// Tijden als "13:00" → "13.00 uur"-achtige weergave: "13–18 uur".
function hourShort(t) { return t.endsWith(':00') ? String(parseInt(t, 10)) : t.replace(':', '.'); }
function dayDate(d) {
  return new Date(d.date + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
}
function dayLine(d) { return `${d.label} ${dayDate(d)}, ${hourShort(d.open)}–${hourShort(d.close)} uur`; }

function hoursHTML(config) {
  return `<h2>Openingstijden kraam</h2>
    <ul class="hours">${config.days.map((d) => `<li><span>${esc(d.label[0].toUpperCase() + d.label.slice(1))} ${esc(dayDate(d))}</span><strong>${hourShort(d.open)}–${hourShort(d.close)} uur</strong></li>`).join('')}</ul>
    <p class="hint">Kun je je badge niet ophalen? Laat via je bestelling je adres achter, dan bezorgen we hem ${esc(config.deliveryWithin)} in je brievenbus (alleen in ${esc(config.deliveryPlace)}).
    Niet opgehaalde badges zonder adres worden na de markt vernietigd.</p>`;
}

// Bepaalt waar we zijn in het marktweekend (op basis van de klok van de telefoon).
function marketPhase(days, now = new Date()) {
  const ts = days.map((d) => ({
    ...d,
    openTs: new Date(`${d.date}T${d.open}:00`).getTime(),
    closeTs: new Date(`${d.date}T${d.close}:00`).getTime(),
  }));
  const t = now.getTime();
  if (t < ts[0].openTs) return { phase: 'voor', next: ts[0] };
  for (let i = 0; i < ts.length; i++) {
    if (t >= ts[i].openTs && t <= ts[i].closeTs) return { phase: 'open', day: ts[i], next: ts[i + 1], isLast: i === ts.length - 1 };
    if (ts[i + 1] && t > ts[i].closeTs && t < ts[i + 1].openTs) return { phase: 'dicht', next: ts[i + 1] };
  }
  return { phase: 'na' };
}

const STATUS_LABEL = {
  betalen: 'Betalen bij de kraam',
  wachtrij: 'In de wachtrij',
  printen: 'Wordt geprint',
  klaar: 'Klaar om op te halen',
  opgehaald: 'Opgehaald',
  geannuleerd: 'Geannuleerd',
};
function statusLabel(o) {
  if (o.delivery && o.status === 'opgehaald') return 'Bezorgd';
  if (o.delivery && o.status !== 'geannuleerd') return 'Wordt thuisbezorgd';
  return STATUS_LABEL[o.status];
}

// Onthoud bestellingen van deze klant op dit toestel.
const MINE_KEY = 'kerstmarkt-bestellingen';
function getMine() {
  try { return JSON.parse(localStorage.getItem(MINE_KEY)) || []; } catch { return []; }
}
function setMine(list) {
  try { localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(-10))); } catch {}
}
function rememberOrder(code) {
  const list = getMine().filter((c) => c !== code);
  list.push(code);
  setMine(list);
}
function forgetOrder(code) {
  setMine(getMine().filter((c) => c !== code));
}
