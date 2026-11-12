// Bouwt de WordPress-plugin: dist/fontys-studieplanner.zip
// Gebruik: node build-wordpress.js
//
// - Neemt de JavaScript uit public/ ongewijzigd over.
// - Maakt de CSS 'scoped': elke regel krijgt .sp-app ervoor, zodat de planner het
//   WordPress-thema niet beïnvloedt (en andersom zo min mogelijk).
// - Haalt de HTML van de student- en beheerpagina uit index.html en beheer.html.
// - De catalogus uit data/catalogus.json (of public/catalogus.json) wordt het
//   standaardaanbod bij activeren; daarna beheer je het aanbod in WordPress.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const WPSRC = path.join(ROOT, 'wordpress');
const DIST = path.join(ROOT, 'dist');
const NAAM = 'fontys-studieplanner';
const OUT = path.join(DIST, 'wordpress', NAAM);

const lees = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const schrijf = (rel, inhoud) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, inhoud);
};
const kopieer = (van, naar) => {
  fs.mkdirSync(path.dirname(path.join(OUT, naar)), { recursive: true });
  fs.copyFileSync(van, path.join(OUT, naar));
};

// ---------- CSS scopen ----------
const SCOPE = '.sp-app';

function splitSelectors(s) {
  const out = [];
  let diepte = 0, huidig = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') diepte++;
    if (ch === ')' || ch === ']') diepte--;
    if (ch === ',' && diepte === 0) { out.push(huidig); huidig = ''; } else huidig += ch;
  }
  out.push(huidig);
  return out.map((x) => x.trim()).filter(Boolean);
}

function scopeSelector(sel) {
  if (sel === ':root' || sel === 'html' || sel === 'body') return [SCOPE];
  if (sel === '*') return [SCOPE, `${SCOPE} *`];
  if (sel.startsWith(SCOPE)) return [sel];
  if (sel.startsWith('.sleept')) return [SCOPE + sel]; // .sleept staat op de container zelf
  return [`${SCOPE} ${sel}`];
}

function scopeCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const uit = [];
  function blok(eind) {
    const res = [];
    while (i < css.length) {
      // witruimte overslaan
      while (i < css.length && /\s/.test(css[i])) i++;
      if (i >= css.length) break;
      if (css[i] === '}') { i++; if (eind) break; continue; }
      const open = css.indexOf('{', i);
      if (open < 0) break;
      const kop = css.slice(i, open).trim();
      i = open + 1;
      if (kop.startsWith('@media') || kop.startsWith('@supports')) {
        const binnen = blok(true);
        res.push(`${kop} {\n${binnen}\n}`);
      } else {
        const sluit = css.indexOf('}', i);
        const decl = css.slice(i, sluit).trim();
        i = sluit + 1;
        const sels = splitSelectors(kop).flatMap(scopeSelector);
        res.push(`${sels.join(',\n')} { ${decl} }`);
      }
    }
    return res.join('\n');
  }
  uit.push(blok(false));
  return uit.join('\n');
}

const WP_EXTRA = `
/* ---- aanvullingen voor WordPress ---- */
.sp-app { border-radius: 12px; isolation: isolate; text-align: left; }
.sp-app .kop { position: static; border-radius: 12px 12px 0 0; }
.sp-app .lijst { top: 40px; }
.sp-app.sp-beheer { margin: 16px 20px 0 0; }
/* Breder dan de tekstkolom van het thema, gecentreerd, nooit breder dan het scherm. */
.sp-app.sp-breed {
  width: min(1500px, calc(100vw - 32px)) !important;
  max-width: none !important;
  margin-left: calc(50% - min(750px, 50vw - 16px)) !important;
  margin-right: calc(50% - min(750px, 50vw - 16px)) !important;
}
.sp-app .wrap { margin: 0 auto; }
/* Thema's stylen vaak knoppen, invoervelden en tabellen; hier zetten we dat terug. */
.sp-app button, .sp-app input:not([type=checkbox]):not([type=radio]), .sp-app select, .sp-app textarea {
  font-family: inherit; font-size: inherit; line-height: normal; letter-spacing: normal;
  text-transform: none; box-shadow: none; margin: 0; min-height: 0; height: auto; max-width: 100%;
}
.sp-app input[type=checkbox], .sp-app input[type=radio] { width: auto; margin: 0 2px 0 0; }
.sp-app table { margin: 0; border: 0; width: auto; }
.sp-app .tabel { width: 100%; }
.sp-app h1, .sp-app h2, .sp-app h3 { font-family: inherit; color: inherit; margin: 0; padding: 0; text-transform: none; letter-spacing: normal; }
.sp-app .kop h1 { color: #ffffff; font-size: 1.15rem; }
.sp-app p { margin: 4px 0 10px; }
.sp-app a { box-shadow: none; }
.sp-app small { font-size: 80%; }
.sp-app details > summary { list-style: none; }
.sp-app dialog { margin: auto; color: var(--tekst); background: #ffffff; }
.sp-app code { background: transparent; padding: 0; }
`;

// ---------- HTML-templates ----------
function template(html, { verbergInlog = false } = {}) {
  let body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  body = body.replace(/<script[\s\S]*?<\/script>/g, '');
  body = body.trim();
  body = body.replace(/^<div class="sp-app">/, '').replace(/<\/div>\s*$/, '').trim();
  if (verbergInlog) body = body.replace('<section class="kaart inlog" id="inlog">', '<section class="kaart inlog" id="inlog" hidden>');
  if (body.includes('<?')) throw new Error('Template bevat <? en kan niet veilig door PHP worden ingelezen');
  return body + '\n';
}

// ---------- bouwen ----------
fs.rmSync(path.join(DIST, 'wordpress'), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

kopieer(path.join(WPSRC, 'fontys-studieplanner.php'), 'fontys-studieplanner.php');
kopieer(path.join(WPSRC, 'uninstall.php'), 'uninstall.php');
kopieer(path.join(WPSRC, 'readme.txt'), 'readme.txt');
for (const f of ['common.js', 'planner.js', 'pdf.js', 'beheer.js']) kopieer(path.join(PUB, f), `assets/${f}`);
for (const f of fs.readdirSync(path.join(PUB, 'vendor'))) kopieer(path.join(PUB, 'vendor', f), `assets/vendor/${f}`);
const catBestand = fs.existsSync(path.join(ROOT, 'data', 'catalogus.json')) ? path.join(ROOT, 'data', 'catalogus.json') : path.join(PUB, 'catalogus.json');
kopieer(catBestand, 'assets/catalogus.json');
schrijf('assets/studieplanner.css', `/* Fontys Studieplanner – automatisch gegenereerd uit public/style.css (scoped op .sp-app) */\n${scopeCss(lees('style.css'))}\n${WP_EXTRA}`);
schrijf('templates/planner.html', template(lees('index.html')));
schrijf('templates/beheer.html', template(lees('beheer.html'), { verbergInlog: true }));
schrijf('templates/index.php', '<?php // Stilte is goud.\n');
schrijf('assets/index.php', '<?php // Stilte is goud.\n');
schrijf('index.php', '<?php // Stilte is goud.\n');

const zip = path.join(DIST, `${NAAM}.zip`);
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, NAAM], { cwd: path.join(DIST, 'wordpress') });
console.log('Catalogus:', path.relative(ROOT, catBestand));
console.log('Plugin:   ', path.relative(ROOT, OUT));
console.log('Zip:      ', path.relative(ROOT, zip), Math.round(fs.statSync(zip).size / 1024) + ' kB');
