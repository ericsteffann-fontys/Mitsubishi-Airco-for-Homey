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

  // Welke periode is het nu? Op basis van de startdata (MM-DD) per periode uit de catalogus.
  function huidigeMoment(cat, datum = new Date()) {
    const starts = (cat && cat.periodeStart) || ['09-01', '11-09', '02-01', '04-19'];
    const kandidaten = [];
    for (const sj of [datum.getFullYear() - 1, datum.getFullYear()]) {
      starts.forEach((md, idx) => {
        const [mm, dd] = md.split('-').map(Number);
        const kalenderjaar = mm >= 8 ? sj : sj + 1; // aug-dec hoort bij het begin van het schooljaar
        kandidaten.push({ t: new Date(kalenderjaar, mm - 1, dd).getTime(), i: abs(sj, idx + 1) });
      });
    }
    kandidaten.sort((a, b) => a.t - b.t);
    let res = kandidaten[0].i;
    for (const k of kandidaten) if (k.t <= datum.getTime()) res = k.i;
    return res;
  }

  // ---- aanbod ----
  // evl.aanbod[leerweg] = { modus: 'geen' | 'doorlopend' | 'jaarlijks' | 'specifiek', periodes: [1,3], momenten: ['2026-1'] }
  function aangeboden(cat, evl, leerweg, i) {
    const a = evl && evl.aanbod && evl.aanbod[leerweg];
    if (!a) return false;
    const j = jaarVan(i);
    if (cat && (j < cat.eersteSchooljaar || j > cat.laatsteSchooljaar)) return false;
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
  const KLEUREN = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#4f46e5', '#be123c', '#0d9488'];
  function kleurVoor(cat, evl) {
    if (evl && evl.kleur) return evl.kleur;
    const cats = [...new Set(((cat && cat.evls) || []).map((e) => e.categorie || ''))];
    const idx = cats.indexOf((evl && evl.categorie) || '');
    return KLEUREN[(idx < 0 ? 0 : idx) % KLEUREN.length];
  }

  async function laadCatalogus() {
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
    c.periodeStart = Array.isArray(c.periodeStart) && c.periodeStart.length === 4 ? c.periodeStart : ['09-01', '11-09', '02-01', '04-19'];
    c.evls = Array.isArray(c.evls) ? c.evls : [];
    for (const e of c.evls) {
      e.id = e.id || 'evl-' + uid();
      e.ec = Number(e.ec) === 30 ? 30 : 15;
      e.contacten = Array.isArray(e.contacten) ? e.contacten : [];
      e.vereist = Array.isArray(e.vereist) ? e.vereist : [];
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
    duur, weken, huidigeMoment, aangeboden, leerwegenOp, aanbodTekst,
    encodePlan, decodePlanFromPdfBytes, esc, uid, kleurVoor, laadCatalogus, normaliseerCatalogus,
  };
})();
