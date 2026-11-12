// Maakt losse HTML-bestanden die zonder server werken (dubbelklikken om te openen).
// Gebruik: node build-html.js            -> dist/studieplanner.html + dist/studieplanner-beheer.html
//
// - studieplanner.html: de studentpagina met alles erin (CSS, scripts, PDF-bibliotheek, catalogus).
// - studieplanner-beheer.html: de beheerpagina. Na het aanpassen van het aanbod maakt die zelf
//   een nieuwe studieplanner.html (en een bijgewerkt beheerbestand) met één klik.
//
// De catalogus komt uit data/catalogus.json (wat via de server is opgeslagen) of anders
// uit public/catalogus.json.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const lees = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');

const catBestand = fs.existsSync(path.join(ROOT, 'data', 'catalogus.json'))
  ? path.join(ROOT, 'data', 'catalogus.json')
  : path.join(PUB, 'catalogus.json');
const catalogus = JSON.stringify(JSON.parse(fs.readFileSync(catBestand, 'utf8'))).replace(/</g, '\\u003c');

const scriptVeilig = (js) => js.replace(/<\/script/gi, '<\\/script');

function inline(html, { extraVoorScripts = '', extraNaScripts = '' } = {}) {
  html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${lees('style.css')}\n</style>`);
  let eerste = true;
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const voor = eerste ? `<script type="application/json" id="catalogus-data">${catalogus}</script>\n  ${extraVoorScripts}` : '';
    eerste = false;
    return `${voor}<script>\n${scriptVeilig(lees(src))}\n</script>`;
  });
  return html.replace('</body>', () => `${extraNaScripts}</body>`);
}

fs.mkdirSync(DIST, { recursive: true });

// Studentpagina
const student = inline(lees('index.html'));
fs.writeFileSync(path.join(DIST, 'studieplanner.html'), student);

// Beheerpagina: met sjabloon van de studentpagina (base64) en een kopie van de eigen bron.
const sjabloon = Buffer.from(student, 'utf8').toString('base64');
const beheer = inline(lees('beheer.html'), {
  extraVoorScripts: `<script type="text/plain" id="planner-sjabloon">${sjabloon}</script>\n  `,
  // Bewaar de eigen (nog onaangeraakte) HTML, zodat het beheerbestand zichzelf kan bijwerken.
  extraNaScripts: '<script>window.__BEHEER_BRON = "<!doctype html>\\n" + document.documentElement.outerHTML;</script>\n',
});
// Het vastleg-script staat onderaan de body: beheer.js past de pagina pas aan na
// DOMContentLoaded, dus op dat moment is de HTML nog onaangeraakt.
fs.writeFileSync(path.join(DIST, 'studieplanner-beheer.html'), beheer);

const kb = (f) => Math.round(fs.statSync(path.join(DIST, f)).size / 1024) + ' kB';
console.log('Catalogus:', path.relative(ROOT, catBestand));
console.log('dist/studieplanner.html        ', kb('studieplanner.html'));
console.log('dist/studieplanner-beheer.html ', kb('studieplanner-beheer.html'));
