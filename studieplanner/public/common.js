// Gedeelde logica voor de studieplanner (student- en beheerpagina).
// Alles draait in de browser. Er wordt niets over studenten naar de server gestuurd.
'use strict';

const SP = (() => {
  const PER = 4; // periodes per schooljaar (Fontys: 4 x 10 weken)

  const LEERWEGEN = [
    { id: 'fysiek', naam: 'Fysiek', lang: 'Fysiek (op locatie)', kort: 'F' },
    { id: 'lwo', naam: 'Leerwegonafhankelijk', lang: 'Leerwegonafhankelijk (LWO)', kort: 'LWO' },
  ];
  const leerwegNaam = (id) => (LEERWEGEN.find((l) => l.id === id) || { naam: id }).naam;
  const leerwegKort = (id) => (LEERWEGEN.find((l) => l.id === id) || { kort: id }).kort;

  const STATUS = {
    gepland: 'Gepland',
    bezig: 'Loopt nu',
    behaald: 'Behaald',
    'niet-behaald': 'Niet behaald',
    vrijstelling: 'Vrijstelling',
  };

  // ---- periodes ----
  // Een moment is een absolute periode-index: schooljaar * 4 + (periode - 1).
  // Schooljaar 2026 betekent 2026-2027.
  const abs = (jaar, p) => jaar * PER + (p - 1);
  const jaarVan = (i) => Math.floor(i / PER);
  const periodeVan = (i) => (i % PER) + 1;
  const jaarLabel = (j) => `${j}-${j + 1}`;
  const momentKey = (i) => `${jaarVan(i)}-${periodeVan(i)}`;
  const parseMoment = (s) => {
    const m = /^(\d{4})-([1-4])$/.exec(String(s));
    return m ? abs(Number(m[1]), Number(m[2])) : null;
  };
  const momentLabel = (i) => `${jaarLabel(jaarVan(i))} P${periodeVan(i)}`;

  const duur = (evl) => Math.max(1, Math.round((Number(evl && evl.ec) || 15) / 15));
  const weken = (evl) => duur(evl) * 10;

  // ---- datums ----
  // Een schooljaar heeft 4 periodes van 10 weken tussen september en juli.
  // Standaard volgen de startdata een vast patroon (MM-DD); per schooljaar kan beheer
  // afwijkende datums instellen in cat.periodeData[jaar] = [p1, p2, p3, p4, einde] (yyyy-mm-dd).
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const vanIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const plusDagen = (s, n) => { const d = vanIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const vandaag = () => iso(new Date());
  const isIso = (s) => /^\d{4}-\d\d-\d\d$/.test(String(s || ''));
  const STANDAARD_START = ['09-01', '11-09', '02-01', '04-19'];
  const STANDAARD_EINDE = '07-10';

  function patroonDatum(md, j) {
    const [mm, dd] = md.split('-').map(Number);
    return `${mm >= 8 ? j : j + 1}-${pad(mm)}-${pad(dd)}`; // aug-dec hoort bij het begin van het schooljaar
  }
  function eigenDatum(cat, j, k) {
    const o = cat && cat.periodeData && cat.periodeData[j];
    return o && isIso(o[k]) ? o[k] : null;
  }
  function periodeStart(cat, i) {
    const j = jaarVan(i), p = periodeVan(i);
    return eigenDatum(cat, j, p - 1) || patroonDatum(((cat && cat.periodeStart) || STANDAARD_START)[p - 1], j);
  }
  function periodeEind(cat, i) {
    const j = jaarVan(i), p = periodeVan(i);
    if (p < PER) return plusDagen(periodeStart(cat, i + 1), -1);
    return eigenDatum(cat, j, 4) || patroonDatum((cat && cat.jaarEinde) || STANDAARD_EINDE, j);
  }

  const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const datumKort = (s) => { const d = vanIso(s); return `${d.getDate()} ${MAANDEN[d.getMonth()]}`; };
  const datumLang = (s) => { const d = vanIso(s); return `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`; };
  // Schooljaren waarvan de periodedatums nog niet vaststaan: datums zijn dan een schatting.
  const datumsVoorlopig = (cat, j) => !!(cat && Array.isArray(cat.datumsOnbekend) && cat.datumsOnbekend.includes(Number(j)));
  const maandKort = (s) => MAANDEN[vanIso(s).getMonth()];
  const periodeDatums = (cat, i) => (datumsVoorlopig(cat, jaarVan(i))
    ? `± ${maandKort(periodeStart(cat, i))} – ${maandKort(periodeEind(cat, i))} (datum volgt)`
    : `${datumKort(periodeStart(cat, i))} – ${datumKort(periodeEind(cat, i))}`);
  // Datum van een periode als tekst, met 'ca.' als het schooljaar nog voorlopig is.
  const startTekst = (cat, i) => (datumsVoorlopig(cat, jaarVan(i)) ? `ca. ${maandKort(periodeStart(cat, i))} ${periodeStart(cat, i).slice(0, 4)} (datum volgt)` : datumLang(periodeStart(cat, i)));
  const eindTekst = (cat, i) => (datumsVoorlopig(cat, jaarVan(i)) ? `ca. ${maandKort(periodeEind(cat, i))} ${periodeEind(cat, i).slice(0, 4)}` : datumLang(periodeEind(cat, i)));
  const maandVan = (cat, p) => MAANDEN[Number((((cat && cat.periodeStart) || STANDAARD_START)[p - 1]).split('-')[0]) - 1];

  // Welke periode is het nu? De eerste periode die nog niet afgelopen is.
  // In de zomervakantie is dat dus periode 1 van het nieuwe schooljaar.
  function huidigeMoment(cat, datum = new Date()) {
    const nu = iso(datum);
    const j0 = datum.getMonth() >= 7 ? datum.getFullYear() : datum.getFullYear() - 1;
    for (let i = abs(j0 - 1, 1); i <= abs(j0 + 1, PER); i++) if (periodeEind(cat, i) >= nu) return i;
    return abs(j0, 1);
  }

  // ---- looptijd (infaseren / uitfaseren) ----
  // Een EvL kan alleen gepland worden als hij start op of na de ingangsdatum
  // en helemaal afgerond is op of vóór de sluitingsdatum.
  function binnenLooptijd(cat, evl, i) {
    if (!evl) return false;
    if (isIso(evl.ingangsdatum) && periodeStart(cat, i) < evl.ingangsdatum) return false;
    if (isIso(evl.sluitingsdatum) && periodeEind(cat, i + duur(evl) - 1) > evl.sluitingsdatum) return false;
    return true;
  }
  function looptijdTekst(evl) {
    const a = isIso(evl.ingangsdatum), b = isIso(evl.sluitingsdatum);
    if (a && b) return `van ${datumLang(evl.ingangsdatum)} t/m ${datumLang(evl.sluitingsdatum)}`;
    if (a) return `vanaf ${datumLang(evl.ingangsdatum)}`;
    if (b) return `t/m ${datumLang(evl.sluitingsdatum)}`;
    return '';
  }
  const uitgefaseerd = (evl) => isIso(evl.sluitingsdatum) && evl.sluitingsdatum < vandaag();
  const nogNietActief = (evl) => isIso(evl.ingangsdatum) && evl.ingangsdatum > vandaag();

  // ---- aanbod ----
  // evl.aanbod[leerweg] = { modus: 'geen' | 'doorlopend' | 'jaarlijks' | 'specifiek', periodes: [1,3], momenten: ['2026-1'] }
  // Schooljaren waarin nog niet bekend is óf en wanneer de EvL gegeven wordt.
  // De student mag hem daar dan in elke periode plannen (met de leerwegen die de EvL kent),
  // maar het blok staat 'onder voorbehoud'.
  const onderVoorbehoud = (evl, i) => !!(evl && Array.isArray(evl.onbekendeJaren) && evl.onbekendeJaren.includes(jaarVan(i)));

  function aangeboden(cat, evl, leerweg, i) {
    const a = evl && evl.aanbod && evl.aanbod[leerweg];
    if (!a) return false;
    const j = jaarVan(i);
    if (cat && (j < cat.eersteSchooljaar || j > cat.laatsteSchooljaar)) return false;
    if (!binnenLooptijd(cat, evl, i)) return false;
    if (onderVoorbehoud(evl, i)) return a.modus !== 'geen';
    switch (a.modus) {
      case 'doorlopend': return true;
      case 'jaarlijks': return (a.periodes || []).includes(periodeVan(i));
      case 'specifiek': return (a.momenten || []).includes(momentKey(i));
      default: return false;
    }
  }
  const leerwegenOp = (cat, evl, i) => LEERWEGEN.filter((l) => aangeboden(cat, evl, l.id, i)).map((l) => l.id);

  function aanbodTekst(evl) {
    const delen = [];
    for (const l of LEERWEGEN) {
      const a = evl.aanbod && evl.aanbod[l.id];
      if (!a || a.modus === 'geen' || !a.modus) continue;
      let t;
      if (a.modus === 'doorlopend') t = 'doorlopend (elke periode)';
      else if (a.modus === 'jaarlijks') t = (a.periodes || []).length ? 'elk jaar in ' + a.periodes.map((p) => 'P' + p).join(', ') : 'geen periodes gekozen';
      else t = (a.momenten || []).length ? `${a.momenten.length} specifieke startmoment(en)` : 'geen startmomenten gekozen';
      delen.push(`${l.naam}: ${t}`);
    }
    if (delen.length && (evl.onbekendeJaren || []).length) delen.push('nog niet bekend in ' + evl.onbekendeJaren.slice().sort().map(jaarLabel).join(', '));
    return delen.length ? delen.join(' · ') : 'Niet aangeboden';
  }

  // ---- plan coderen voor in de PDF ----
  const MARKER = 'STUDIEPLAN1:';
  function encodePlan(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return MARKER + btoa(bin);
  }
  function decodePlanFromPdfBytes(buf) {
    const u8 = new Uint8Array(buf);
    let txt = '';
    for (let k = 0; k < u8.length; k += 0x8000) txt += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    const m = /STUDIEPLAN1:([A-Za-z0-9+/=]+)/.exec(txt);
    if (!m) return null;
    const bin = atob(m[1]);
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return JSON.parse(new TextDecoder().decode(out));
  }

  // ---- hulpjes ----
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Fontys huisstijlkleuren voor categorieën/EvL's.
  const KLEUREN = ['#663366', '#0076e0', '#e5007d', '#339933', '#ee7425', '#008387', '#0099cc', '#ff9900', '#39b54a', '#855c85'];
  const KLEUR_NAMEN = { '#663366': 'Paars', '#855c85': 'Paars 80%', '#e5007d': 'Magenta', '#0076e0': 'Blauw', '#0099cc': 'Lichtblauw', '#008387': 'Petrol', '#339933': 'Groen', '#39b54a': 'Lichtgroen', '#ee7425': 'Oranje', '#ff9900': 'Lichtoranje', '#ffcc00': 'Geel' };
  function kleurVoor(cat, evl) {
    if (evl && evl.kleur && KLEUR_NAMEN[String(evl.kleur).toLowerCase()]) return evl.kleur; // alleen huisstijlkleuren
    const cats = [...new Set(((cat && cat.evls) || []).map((e) => e.categorie || ''))];
    const idx = cats.indexOf((evl && evl.categorie) || '');
    return KLEUREN[(idx < 0 ? 0 : idx) % KLEUREN.length];
  }

  // In de losse HTML-versie zit de catalogus in de pagina zelf (geen server nodig).
  const ingebouwd = () => document.getElementById('catalogus-data');
  async function laadCatalogus() {
    const el = ingebouwd();
    if (el) return normaliseerCatalogus(JSON.parse(el.textContent));
    const r = await fetch('catalogus.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Kon de catalogus niet laden (' + r.status + ')');
    return normaliseerCatalogus(await r.json());
  }

  function normaliseerCatalogus(c) {
    c = c && typeof c === 'object' ? c : {};
    const nu = new Date();
    const dit = nu.getMonth() >= 7 ? nu.getFullYear() : nu.getFullYear() - 1;
    c.opleiding = c.opleiding || 'Opleiding';
    c.instituut = c.instituut || 'Fontys';
    c.totaalEC = Number(c.totaalEC) || 240;
    c.eersteSchooljaar = Number(c.eersteSchooljaar) || dit - 4;
    c.laatsteSchooljaar = Number(c.laatsteSchooljaar) || dit + 5;
    c.periodeStart = Array.isArray(c.periodeStart) && c.periodeStart.length === 4 ? c.periodeStart : STANDAARD_START.slice();
    c.jaarEinde = /^\d\d-\d\d$/.test(c.jaarEinde || '') ? c.jaarEinde : STANDAARD_EINDE;
    c.periodeData = c.periodeData && typeof c.periodeData === 'object' ? c.periodeData : {};
    c.datumsOnbekend = Array.isArray(c.datumsOnbekend) ? c.datumsOnbekend.map(Number) : [];
    c.evls = Array.isArray(c.evls) ? c.evls : [];
    for (const e of c.evls) {
      e.id = e.id || 'evl-' + uid();
      e.ec = Number(e.ec) === 30 ? 30 : 15;
      e.contacten = Array.isArray(e.contacten) ? e.contacten : [];
      e.vereist = Array.isArray(e.vereist) ? e.vereist : [];
      e.ingangsdatum = isIso(e.ingangsdatum) ? e.ingangsdatum : '';
      e.sluitingsdatum = isIso(e.sluitingsdatum) ? e.sluitingsdatum : '';
      e.onbekendeJaren = Array.isArray(e.onbekendeJaren) ? e.onbekendeJaren.map(Number) : [];
      e.aanbod = e.aanbod || {};
      for (const l of LEERWEGEN) {
        const a = e.aanbod[l.id] || { modus: 'geen' };
        a.modus = a.modus || 'geen';
        a.periodes = Array.isArray(a.periodes) ? a.periodes.map(Number) : [];
        a.momenten = Array.isArray(a.momenten) ? a.momenten : [];
        e.aanbod[l.id] = a;
      }
    }
    return c;
  }

  return {
    PER, LEERWEGEN, STATUS, leerwegNaam, leerwegKort,
    abs, jaarVan, periodeVan, jaarLabel, momentKey, parseMoment, momentLabel,
    duur, weken, huidigeMoment, aangeboden, isIso, vandaag, periodeStart, periodeEind, periodeDatums, datumKort, datumLang, maandVan,
    binnenLooptijd, looptijdTekst, datumsVoorlopig, maandKort, startTekst, eindTekst, onderVoorbehoud, iso, uitgefaseerd, nogNietActief, STANDAARD_START, STANDAARD_EINDE, patroonDatum, leerwegenOp, aanbodTekst,
    encodePlan, decodePlanFromPdfBytes, esc, uid, kleurVoor, KLEUR_NAMEN, laadCatalogus, normaliseerCatalogus, ingebouwd,
  };
})();
