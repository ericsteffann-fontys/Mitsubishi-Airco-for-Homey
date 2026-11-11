// Studentpagina: plan opbouwen door EvL's te slepen of te selecteren.
// Het plan leeft alleen in het geheugen van deze browsertab. Bewaren gaat via de PDF.
'use strict';

const Planner = (() => {
  const $ = (s) => document.querySelector(s);
  const S = SP;

  const state = {
    cat: null,
    nu: 0,
    plan: null,
    sel: null, // { type: 'evl', id } of { type: 'blok', uid } – klik-modus
    drag: null, // idem, tijdens slepen
    gewijzigd: false,
    ingelezen: null, // { opgeslagen, eersteVersie } van een ingelezen PDF
  };

  // ---------- plan ----------
  function leegPlan() {
    const nu = state.nu;
    return {
      student: { naam: '', nummer: '', coach: '', opmerkingen: '' },
      startJaar: S.jaarVan(nu),
      startPeriode: S.periodeVan(nu), // tussentijds instromen kan: elke periode is een instroommoment
      jaren: 4, // aantal schooljaren (rijen) in beeld; uit te breiden met '+ Schooljaar toevoegen'
      eersteVersie: null, // wanneer dit plan voor het eerst als PDF is opgeslagen
      blokken: [],
    };
  }

  const evlVan = (id) => state.cat.evls.find((e) => e.id === id) || null;
  const blokEvl = (b) => evlVan(b.evl) || { id: b.evl, code: b.code, naam: b.naam, ec: b.ec, aanbod: {}, contacten: b.contacten || [], vereist: [] };
  const blokDuur = (b) => S.duur(blokEvl(b));
  const blokEind = (b) => b.start + blokDuur(b) - 1;
  const hStart = () => S.abs(state.plan.startJaar, state.plan.startPeriode);
  const hEind = () => S.abs(state.plan.startJaar + state.plan.jaren - 1, S.PER);
  const actief = (b) => b.status !== 'niet-behaald';

  function snapshot(b) {
    const e = evlVan(b.evl);
    if (e) { b.code = e.code; b.naam = e.naam; b.ec = e.ec; }
    return b;
  }

  function autoStatus(b) {
    if (b.start == null) { b.status = 'vrijstelling'; return; }
    if (blokEind(b) < state.nu) {
      if (b.status !== 'behaald' && b.status !== 'niet-behaald') b.status = 'behaald';
    } else if (b.start <= state.nu) b.status = 'bezig';
    else b.status = 'gepland';
  }

  // Alle blokken die in periode i lopen (meerdere EvL's tegelijk volgen is toegestaan).
  function blokkenIn(i, skipUid) {
    return state.plan.blokken.filter((b) => b.start != null && b.uid !== skipUid && actief(b) && i >= b.start && i <= blokEind(b));
  }
  // Studielast in een periode: elke lopende EvL telt 15 EC per periode (30 EC = 2 periodes x 15).
  const lastIn = (i, skipUid) => blokkenIn(i, skipUid).length * 15;
  const DRUK_TEKST = 'Meerdere EvL\'s tegelijk volgen kan, maar geeft mogelijk extra studiedruk. Bespreek dit met je studiecoach.';

  // Kan EvL (id) starten op moment i? Geeft de mogelijke leerwegen terug.
  function kanPlaatsen(evlId, i, skipUid) {
    const e = evlVan(evlId);
    if (!e) return { ok: false, reden: 'Onbekende EvL' };
    const d = S.duur(e);
    if (i < hStart()) return { ok: false, reden: 'Vóór de start van je studie' };
    if (i + d - 1 > hEind()) return { ok: false, reden: 'Past niet meer binnen de getoonde schooljaren. Voeg een schooljaar toe.' };
    if (!S.binnenLooptijd(state.cat, e, i)) return { ok: false, reden: `${e.naam} bestaat dan niet: looptijd ${S.looptijdTekst(e)}.` };
    const extraDruk = [];
    for (let k = i; k < i + d; k++) if (blokkenIn(k, skipUid).length) extraDruk.push(k);
    const dubbel = state.plan.blokken.find((b) => b.evl === evlId && b.uid !== skipUid && actief(b));
    if (dubbel) return { ok: false, reden: 'Deze EvL staat al in je plan' };
    if (i < state.nu) return { ok: true, verleden: true, extraDruk, leerwegen: S.LEERWEGEN.map((l) => l.id) };
    const lw = S.leerwegenOp(state.cat, e, i);
    if (!lw.length) return { ok: false, reden: `Wordt niet aangeboden met start in ${S.momentLabel(i)}` };
    return { ok: true, leerwegen: lw, extraDruk, voorbehoud: S.onderVoorbehoud(e, i) };
  }

  // Melding na plaatsen/verplaatsen; de student hoeft niets te bevestigen.
  function meldNaPlaatsen(k, e, extra) {
    const t = [];
    if (extra) t.push(extra);
    if (k.extraDruk && k.extraDruk.length && !k.verleden) {
      t.push(`Let op: in ${k.extraDruk.map(S.momentLabel).join(' en ')} volg je dan meerdere EvL's tegelijk. Dat kan extra studiedruk geven.`);
    }
    if (k.voorbehoud) t.push(`Onder voorbehoud: het is nog niet bekend of en wanneer ${e.naam} in dat schooljaar gegeven wordt.`);
    if (t.length) toast(t.join(' '), t.length > 1 ? 8000 : 6000);
  }

  function plaatsEvl(evlId, i, leerweg) {
    const k = kanPlaatsen(evlId, i);
    if (!k.ok) { toast(k.reden); return false; }
    const b = snapshot({ uid: S.uid(), evl: evlId, start: i, leerweg: leerweg && k.leerwegen.includes(leerweg) ? leerweg : k.leerwegen[0], status: '' });
    autoStatus(b);
    state.plan.blokken.push(b);
    wijzig();
    meldNaPlaatsen(k, evlVan(evlId));
    return true;
  }

  function verplaatsBlok(uid, i) {
    const b = state.plan.blokken.find((x) => x.uid === uid);
    if (!b) return false;
    const k = kanPlaatsen(b.evl, i, uid);
    if (!k.ok) { toast(k.reden); return false; }
    const oud = b.start;
    b.start = i;
    if (oud == null) b.status = '';
    let extra = '';
    if (!k.leerwegen.includes(b.leerweg)) {
      b.leerweg = k.leerwegen[0];
      extra = `Leerweg aangepast naar ${S.leerwegNaam(b.leerweg)}: ${S.leerwegNaam(k.leerwegen.includes('fysiek') ? 'lwo' : 'fysiek')} wordt dan niet aangeboden.`;
    }
    autoStatus(b);
    wijzig();
    meldNaPlaatsen(k, blokEvl(b), extra);
    return true;
  }

  function maakVrijstelling(sel) {
    if (sel.type === 'evl') {
      const dubbel = state.plan.blokken.find((b) => b.evl === sel.id && actief(b));
      if (dubbel) { dubbel.start = null; autoStatus(dubbel); }
      else state.plan.blokken.push(snapshot({ uid: S.uid(), evl: sel.id, start: null, leerweg: '', status: 'vrijstelling' }));
    } else {
      const b = state.plan.blokken.find((x) => x.uid === sel.uid);
      if (!b) return;
      b.start = null; autoStatus(b);
    }
    wijzig();
  }

  function verwijder(uid) {
    state.plan.blokken = state.plan.blokken.filter((b) => b.uid !== uid);
    wijzig();
  }

  function wijzig() {
    state.gewijzigd = true;
    render();
  }

  // ---------- controles ----------
  function blokMeldingen(b) {
    const m = [];
    const e = evlVan(b.evl);
    if (!e) { m.push({ niveau: 'fout', t: 'staat niet meer in de catalogus. Overleg met je studiecoach.' }); return m; }
    if (b.ec && b.ec !== e.ec) m.push({ niveau: 'let', t: `is gewijzigd van ${b.ec} naar ${e.ec} EC.` });
    if (b.start == null) return m;
    if (b.start < hStart() || blokEind(b) > hEind()) m.push({ niveau: 'let', t: 'valt (deels) buiten de getoonde studiejaren.' });
    const looptijdOk = S.binnenLooptijd(state.cat, e, b.start);
    if (!looptijdOk && actief(b) && b.status !== 'bezig') {
      m.push({ niveau: 'fout', t: `valt buiten de looptijd van deze EvL (${S.looptijdTekst(e)}). Verplaats deze EvL of overleg met je studiecoach.` });
    } else if (b.start >= state.nu && b.status !== 'bezig' && !S.aangeboden(state.cat, e, b.leerweg, b.start)) {
      const anders = S.leerwegenOp(state.cat, e, b.start);
      m.push({ niveau: 'fout', t: `wordt ${S.leerwegNaam(b.leerweg).toLowerCase()} niet aangeboden met start in ${S.momentLabel(b.start)}.` + (anders.length ? ` Wel als ${anders.map(S.leerwegNaam).join(' / ').toLowerCase()}.` : ' Verplaats deze EvL.') });
    }
    if (looptijdOk && b.status === 'gepland' && S.onderVoorbehoud(e, b.start)) {
      m.push({ niveau: 'info', t: `staat onder voorbehoud: nog niet bekend of en wanneer deze EvL in ${S.jaarLabel(S.jaarVan(b.start))} gegeven wordt.` });
    }
    if (looptijdOk && e.sluitingsdatum && (b.status === 'gepland' || b.status === 'bezig')) {
      m.push({ niveau: 'info', t: `wordt uitgefaseerd: afronden kan tot en met ${S.datumLang(e.sluitingsdatum)}.` });
    }
    if (actief(b)) {
      for (const rid of e.vereist || []) {
        const r = evlVan(rid);
        if (!r) continue;
        const rb = state.plan.blokken.filter((x) => x.evl === rid && actief(x));
        const okVoor = rb.some((x) => x.start == null || blokEind(x) < b.start);
        if (!okVoor) m.push({ niveau: 'let', t: rb.length ? `${r.naam} moet eerst afgerond zijn, maar staat later gepland.` : `vraagt eerst ${r.naam}; die staat nog niet in je plan.` });
      }
    }
    return m;
  }

  function overzicht() {
    const t = { behaald: 0, vrijstelling: 0, bezig: 0, gepland: 0 };
    for (const b of state.plan.blokken) {
      if (b.status in t) t[b.status] += blokEvl(b).ec;
    }
    t.totaal = t.behaald + t.vrijstelling + t.bezig + t.gepland;
    const meldingen = [];
    for (const b of state.plan.blokken) {
      for (const x of blokMeldingen(b)) meldingen.push({ niveau: x.niveau, t: `${b.code ? b.code + ' ' : ''}${b.naam} ${x.t}`, uid: b.uid });
    }
    for (let i = Math.max(state.nu, hStart()); i <= hEind(); i++) {
      const lopend = blokkenIn(i);
      if (lopend.length > 1) {
        meldingen.push({ niveau: 'let', t: `In ${S.momentLabel(i)} volg je ${lopend.length} EvL's tegelijk (${lopend.length * 15} EC in 10 weken, normaal is 15 EC): ${lopend.map((b) => b.naam).join(', ')}. Dat kan extra studiedruk geven.` });
      }
    }
    if (state.ingelezen && state.ingelezen.opgeslagen) {
      const dagen = Math.floor((Date.now() - new Date(state.ingelezen.opgeslagen).getTime()) / 864e5);
      if (dagen >= 90) meldingen.push({ niveau: 'let', t: `Dit plan is ${dagen} dagen geleden voor het laatst opgeslagen. Bespreek met je studiecoach of het herzien moet worden.` });
    }
    const ontbreekt = state.cat.evls.filter((e) => e.verplicht && !state.plan.blokken.some((b) => b.evl === e.id && actief(b)));
    if (ontbreekt.length) meldingen.push({ niveau: 'let', t: `Nog niet ingepland (verplicht): ${ontbreekt.map((e) => e.naam).join(', ')}.` });
    const doel = state.cat.totaalEC;
    if (t.totaal < doel) meldingen.push({ niveau: 'info', t: `Nog ${doel - t.totaal} EC te plannen om op ${doel} EC te komen.` });
    if (t.totaal > doel) meldingen.push({ niveau: 'let', t: `Je plan telt ${t.totaal} EC, meer dan de ${doel} EC van de opleiding.` });
    if (!meldingen.length || (t.totaal === doel && !meldingen.some((x) => x.niveau !== 'info'))) meldingen.push({ niveau: 'ok', t: `Je plan is compleet: ${doel} EC zonder aandachtspunten.` });
    return { t, meldingen };
  }

  // ---------- render ----------
  const datumTijd = (isoTijd) => new Date(isoTijd).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function leeftijd(isoTijd) {
    const d = Math.floor((Date.now() - new Date(isoTijd).getTime()) / 864e5);
    if (d <= 0) return 'vandaag';
    if (d === 1) return 'gisteren';
    if (d < 60) return `${d} dagen geleden`;
    return `${Math.round(d / 30.4)} maanden geleden`;
  }
  function renderPlanInfo() {
    const el = $('#plan-info');
    const ing = state.ingelezen;
    if (!ing || !ing.opgeslagen) { el.hidden = true; return; }
    const dagen = Math.floor((Date.now() - new Date(ing.opgeslagen).getTime()) / 864e5);
    el.hidden = false;
    el.className = 'plan-info' + (dagen >= 90 ? ' oud' : '');
    el.innerHTML = `Dit plan is laatst opgeslagen als PDF op <b>${S.esc(datumTijd(ing.opgeslagen))}</b> (${S.esc(leeftijd(ing.opgeslagen))}).`
      + (ing.eersteVersie && ing.eersteVersie !== ing.opgeslagen ? ` Eerste versie: ${S.esc(datumTijd(ing.eersteVersie))}.` : '')
      + (dagen >= 90 ? ' Dit plan is al wat ouder: bespreek of het herzien moet worden.' : '');
  }

  function render() {
    renderPlanInfo();
    renderLijst();
    renderRooster();
    renderVrij();
    renderOverzicht();
    markeer();
  }

  function renderLijst() {
    const zoek = $('#zoek').value.trim().toLowerCase();
    const filter = $('#filter').value;
    const html = [];
    let cat = null;
    const evls = [...state.cat.evls];
    for (const e of evls) {
      const inPlan = state.plan.blokken.filter((b) => b.evl === e.id && actief(b));
      if (zoek && !(`${e.code} ${e.naam} ${e.categorie || ''}`.toLowerCase().includes(zoek))) continue;
      if (filter === 'open' && inPlan.length) continue;
      if (filter === 'verplicht' && !e.verplicht) continue;
      if ((e.categorie || '') !== cat) { cat = e.categorie || ''; html.push(`<div class="cat-kop">${S.esc(cat || 'Overig')}</div>`); }
      const heeftF = e.aanbod.fysiek.modus !== 'geen';
      const heeftL = e.aanbod.lwo.modus !== 'geen';
      const plek = inPlan.map((b) => (b.start == null ? 'vrijstelling' : S.momentLabel(b.start))).join(', ');
      let looptijd = '';
      if (S.uitgefaseerd(e)) looptijd = `<span class="tag grijs">uitgefaseerd per ${S.esc(S.datumKort(e.sluitingsdatum))} ${e.sluitingsdatum.slice(0, 4)}</span>`;
      else if (S.nogNietActief(e)) looptijd = `<span class="tag">nieuw vanaf ${S.esc(S.datumLang(e.ingangsdatum))}</span>`;
      else if (e.sluitingsdatum) looptijd = `<span class="tag verpl">t/m ${S.esc(S.datumLang(e.sluitingsdatum))}</span>`;
      const gekozen = (state.sel && state.sel.type === 'evl' && state.sel.id === e.id) ? ' gekozen' : '';
      html.push(`<div class="evl-kaart ec${e.ec}${inPlan.length ? ' ingepland' : ''}${gekozen}" draggable="true" data-evl="${S.esc(e.id)}" style="--kleur:${S.esc(S.kleurVoor(state.cat, e))}">
        <div class="t">${e.code ? `<small>${S.esc(e.code)}</small> ` : ''}${S.esc(e.naam)}</div>
        <div class="m"><span>${e.ec} EC · ${S.weken(e)} wk</span>${heeftF ? '<span class="tag f">fysiek</span>' : ''}${heeftL ? '<span class="tag lwo">LWO</span>' : ''}${e.verplicht ? '<span class="tag verpl">verplicht</span>' : ''}${looptijd}${plek ? `<span>✓ ${S.esc(plek)}</span>` : ''}</div>
      </div>`);
    }
    $('#evl-lijst').innerHTML = html.join('') || '<p class="uitleg">Geen EvL\'s gevonden.</p>';
  }

  // Verdeel de blokken van één schooljaar over banen (rijen), zodat EvL's die tegelijk
  // lopen onder elkaar komen te staan. Een 30 EC-blok is altijd 2 kolommen breed.
  function rijIndeling(j) {
    const segs = [];
    for (const b of state.plan.blokken) {
      if (b.start == null) continue;
      const s = Math.max(b.start, S.abs(j, 1));
      const eind = Math.min(blokEind(b), S.abs(j, S.PER));
      if (s > eind) continue;
      segs.push({ b, s, eind, vervolg: s !== b.start });
    }
    segs.sort((x, y) => x.s - y.s || (y.eind - y.s) - (x.eind - x.s) || (actief(y.b) - actief(x.b)));
    const banen = [];
    for (const g of segs) {
      let L = banen.findIndex((laatste) => laatste < g.s);
      if (L < 0) { L = banen.length; banen.push(0); }
      banen[L] = g.eind;
      g.baan = L;
    }
    return { segs, banen: Math.max(1, banen.length) };
  }

  // Positie van vandaag: periode en fractie binnen die periode.
  function vandaagPositie() {
    const vandaag = S.vandaag();
    let res = null;
    for (let i = hStart() - S.PER; i <= hEind(); i++) {
      const st = S.periodeStart(state.cat, i), ei = S.periodeEind(state.cat, i);
      if (st > vandaag) break;
      const dur = (new Date(ei) - new Date(st)) || 1;
      res = { i, frac: Math.min(1, Math.max(0, (new Date(vandaag) - new Date(st)) / dur)) };
    }
    return res;
  }

  function renderRooster() {
    const h0 = hStart(), h1 = hEind();
    const rijen = [];
    const vp = vandaagPositie();
    for (let j = S.jaarVan(h0); j <= S.jaarVan(h1); j++) {
      const { segs, banen } = rijIndeling(j);
      const cel = [];
      for (let p = 1; p <= S.PER; p++) {
        const i = S.abs(j, p);
        const cls = ['cel'];
        if (i < h0 || i > h1) cls.push('buiten');
        else if (i < state.nu) cls.push('verleden');
        if (i === state.nu) cls.push('nu');
        const druk = i >= state.nu && i >= h0 && blokkenIn(i).length > 1;
        if (druk) cls.push('druk');
        const lab = i < h0 ? 'vóór instroom' : `${druk ? '⚠ extra studiedruk · ' : ''}${i === h0 ? 'instroom · ' : ''}${S.periodeDatums(state.cat, i)}`;
        cel.push(`<div class="${cls.join(' ')}" data-i="${i}" style="grid-column:${p + 1};grid-row:1 / -1" title="${S.esc(S.momentLabel(i) + ': ' + S.periodeDatums(state.cat, i) + (druk ? '. ' + DRUK_TEKST : ''))}"><span class="datum">${S.esc(lab)}</span></div>`);
      }
      const blokken = segs.map((g) => blokHtml(g.b, S.periodeVan(g.s), g.eind - g.s + 1, g.vervolg, g.baan + 1));
      let lijn = '';
      if (vp && S.jaarVan(vp.i) === j) {
        lijn = `<div class="vandaag" style="grid-column:${S.periodeVan(vp.i) + 1};grid-row:1 / -1;--pos:${(vp.frac * 100).toFixed(1)}%"><span>vandaag ${S.esc(S.datumKort(S.vandaag()))}</span></div>`;
      }
      const jaarNr = j - S.jaarVan(h0) + 1;
      const voorlopig = S.datumsVoorlopig(state.cat, j) ? '<small class="voorlopig">datums volgen</small>' : '';
      rijen.push(`<div class="jaar" style="--banen:${banen}"><div class="label" style="grid-row:1 / -1">${S.jaarLabel(j)}<small>studiejaar ${jaarNr}</small>${voorlopig}</div>${cel.join('')}${blokken.join('')}${lijn}</div>`);
    }
    $('#rooster').innerHTML = rijen.join('');
    $('#kolomkop').innerHTML = '<div></div>' + [1, 2, 3, 4].map((p) => `<div>Periode ${p} · ${S.maandVan(state.cat, p)}<br><small>10 weken</small></div>`).join('');
    const laatsteJaar = state.plan.startJaar + state.plan.jaren - 1;
    const laatsteBezet = state.plan.blokken.some((b) => b.start != null && blokEind(b) >= S.abs(laatsteJaar, 1));
    $('#btn-jaar-min').disabled = state.plan.jaren <= 1 || laatsteBezet;
    $('#btn-jaar-min').title = laatsteBezet ? 'Er staan nog EvL\'s in het laatste schooljaar' : '';
    $('#btn-jaar-plus').disabled = state.plan.jaren >= 12;
    $('#jaar-info').textContent = laatsteJaar >= state.cat.laatsteSchooljaar
      ? `Let op: er is nog geen aanbod ingesteld na ${S.jaarLabel(state.cat.laatsteSchooljaar)}.` : '';
    const instap = h0 < state.nu;
    $('#instap-uitleg').textContent = instap
      ? 'Je bent al met je studie bezig. Zet in de grijze periodes (verleden) de EvL\'s die je al gevolgd hebt en geef aan of je ze behaald hebt. Daarna plan je de rest.'
      : '';
  }

  function blokHtml(b, p, span, vervolg, rij = 1) {
    const e = blokEvl(b);
    const m = blokMeldingen(b);
    const fout = m.find((x) => x.niveau === 'fout');
    const let_ = !fout && m.find((x) => x.niveau === 'let');
    const cls = ['blok', b.status];
    if (fout) cls.push('fout'); else if (let_) cls.push('let');
    if (vervolg) cls.push('vervolg');
    if (state.sel && state.sel.type === 'blok' && state.sel.uid === b.uid) cls.push('verplaatsen');
    let lw = '';
    if (!vervolg) {
      const verleden = b.start < state.nu;
      const opts = S.LEERWEGEN.map((l) => {
        const kan = verleden || S.aangeboden(state.cat, e, l.id, b.start);
        return `<option value="${l.id}"${b.leerweg === l.id ? ' selected' : ''}${!kan && b.leerweg !== l.id ? ' disabled' : ''}>${S.esc(l.naam)}${!kan ? ' (niet aangeboden)' : ''}</option>`;
      }).join('');
      lw = `<select data-leerweg="${b.uid}" title="Leerweg">${opts}</select>`;
      if (b.status === 'behaald' || b.status === 'niet-behaald') {
        lw += `<select data-status="${b.uid}" title="Resultaat"><option value="behaald"${b.status === 'behaald' ? ' selected' : ''}>Behaald</option><option value="niet-behaald"${b.status === 'niet-behaald' ? ' selected' : ''}>Niet behaald</option></select>`;
      } else if (b.status === 'bezig') lw += '<span class="tag">loopt nu</span>';
      if (b.status === 'gepland' && S.onderVoorbehoud(e, b.start)) lw += '<span class="tag vb" title="Nog niet bekend of en wanneer deze EvL in dit schooljaar gegeven wordt">onder voorbehoud</span>';
    }
    const melding = !vervolg && (fout || let_) ? `<div class="melding${fout ? '' : ' let'}">⚠ ${S.esc((fout || let_).t)}</div>` : '';
    return `<div class="${cls.join(' ')}" draggable="true" data-blok="${b.uid}" style="grid-column:${p + 1} / span ${span};grid-row:${rij};--kleur:${S.esc(S.kleurVoor(state.cat, e))}">
      <div class="r kopregel"><div class="t">${e.code ? `<small>${S.esc(e.code)}</small> ` : ''}${S.esc(e.naam)}${vervolg ? ' <small>(vervolg)</small>' : ''}</div>${vervolg ? '' : `<button class="x" data-weg="${b.uid}" title="Verwijderen" type="button">✕</button>`}</div>
      <div class="r"><span class="tag grijs">${e.ec} EC</span>${lw}</div>${melding}
    </div>`;
  }

  function renderVrij() {
    const v = state.plan.blokken.filter((b) => b.start == null);
    $('#vrij-zone').innerHTML = v.length
      ? v.map((b) => `<span class="chip" data-blok="${b.uid}" draggable="true" style="--kleur:${S.esc(S.kleurVoor(state.cat, blokEvl(b)))}">${S.esc(b.code ? b.code + ' ' : '')}${S.esc(b.naam)} · ${blokEvl(b).ec} EC<button data-weg="${b.uid}" title="Verwijderen" type="button">✕</button></span>`).join('')
      : 'Nog geen vrijstellingen.';
  }

  function renderOverzicht() {
    const { t, meldingen } = overzicht();
    const doel = state.cat.totaalEC;
    $('#tellers').innerHTML = [
      ['Behaald', t.behaald], ['Vrijstelling', t.vrijstelling], ['Loopt nu', t.bezig], ['Gepland', t.gepland], ['Totaal in plan', `${t.totaal} / ${doel}`],
    ].map(([n, v]) => `<div class="teller"><b>${v} EC</b><span>${n}</span></div>`).join('');
    const pct = (x) => Math.min(100, (x / doel) * 100) + '%';
    $('#balk').innerHTML = `<i style="width:${pct(t.behaald + t.vrijstelling)};background:var(--ok)"></i><i style="width:${pct(t.bezig)};background:#f59e0b"></i><i style="width:${pct(t.gepland)};background:var(--paars)"></i>`;
    $('#meldingen').innerHTML = meldingen.map((m) => `<li class="${m.niveau}">${S.esc(m.t)}</li>`).join('');
  }

  // Cellen kleuren voor de EvL/het blok dat gekozen of gesleept wordt.
  function markeer() {
    const sel = state.drag || state.sel;
    const cellen = document.querySelectorAll('.cel');
    cellen.forEach((c) => c.classList.remove('kan-f', 'kan-lwo', 'kan-verleden', 'kan-niet', 'kan-druk', 'kan-vb'));
    $('#vrij-zone').classList.toggle('kan', !!sel);
    const hint = $('#hint');
    if (!sel) { hint.hidden = true; return; }
    const id = sel.type === 'evl' ? sel.id : (state.plan.blokken.find((b) => b.uid === sel.uid) || {}).evl;
    const skip = sel.type === 'blok' ? sel.uid : undefined;
    const e = evlVan(id);
    cellen.forEach((c) => {
      if (c.classList.contains('buiten')) return;
      const k = kanPlaatsen(id, Number(c.dataset.i), skip);
      if (!k.ok) c.classList.add('kan-niet');
      else if (k.verleden) c.classList.add('kan-verleden');
      else c.classList.add(k.leerwegen.includes('fysiek') ? 'kan-f' : 'kan-lwo');
      if (k.ok && k.extraDruk.length && !k.verleden) c.classList.add('kan-druk');
      if (k.ok && k.voorbehoud) c.classList.add('kan-vb');
    });
    if (state.sel && !state.drag) {
      hint.hidden = false;
      $('#hint-tekst').textContent = `${sel.type === 'blok' ? 'Verplaatsen' : 'Inplannen'}: ${e ? e.naam : ''}. Kies een gekleurde periode als startmoment (of de vrijstellingen).`;
    }
  }

  // ---------- dialogen ----------
  function toonKeuze(i) {
    const dlg = $('#dlg-keuze');
    $('#keuze-titel').textContent = `Start in ${S.momentLabel(i)}`;
    const verleden = i < state.nu;
    const lopend = blokkenIn(i);
    $('#keuze-uitleg').textContent = (verleden
      ? 'Deze periode is voorbij. Kies welke EvL je hier gevolgd hebt.'
      : 'Deze EvL\'s kun je in deze periode starten.')
      + (lopend.length && !verleden ? ` Je volgt hier al ${lopend.map((b) => b.naam).join(', ')}. ${DRUK_TEKST}` : '')
      + ` (${S.periodeDatums(state.cat, i)})`;
    const opties = state.cat.evls.map((e) => ({ e, k: kanPlaatsen(e.id, i) })).filter((x) => x.k.ok);
    $('#keuze-lijst').innerHTML = opties.length ? opties.map(({ e, k }) => {
      const knoppen = verleden
        ? `<button class="btn klein primair" data-kies="${S.esc(e.id)}" data-lw="fysiek" type="button">Gevolgd</button>`
        : k.leerwegen.map((l) => `<button class="btn klein${l === 'fysiek' ? ' primair' : ''}" data-kies="${S.esc(e.id)}" data-lw="${l}" type="button">${S.esc(S.leerwegNaam(l))}</button>`).join('');
      return `<div class="keuze" style="--kleur:${S.esc(S.kleurVoor(state.cat, e))}"><div class="info"><b>${S.esc(e.code ? e.code + ' ' : '')}${S.esc(e.naam)}</b><small>${e.ec} EC · ${S.weken(e)} weken${e.verplicht ? ' · verplicht' : ''}${k.voorbehoud ? ' · onder voorbehoud' : ''}</small></div>${knoppen}</div>`;
    }).join('') : '<p>Er is hier niets (meer) te kiezen. Misschien is de periode al bezet, of staat alles wat hier wordt aangeboden al in je plan.</p>';
    dlg.dataset.i = i;
    dlg.showModal();
  }

  function toonInfo(evlId, blokUid) {
    const b = blokUid ? state.plan.blokken.find((x) => x.uid === blokUid) : null;
    const e = b ? blokEvl(b) : evlVan(evlId);
    if (!e) return;
    $('#info-titel').textContent = `${e.code ? e.code + ' ' : ''}${e.naam}`;
    const komend = [];
    for (let i = Math.max(state.nu, hStart()); i <= hEind() && komend.length < 12; i++) {
      const lw = S.leerwegenOp(state.cat, e, i);
      if (lw.length) komend.push(`${S.momentLabel(i)} (${lw.map(S.leerwegKort).join(' + ')})`);
    }
    const vereist = (e.vereist || []).map((id) => evlVan(id)).filter(Boolean);
    const m = b ? blokMeldingen(b) : [];
    $('#info-inhoud').innerHTML = `
      ${e.beschrijving ? `<p>${S.esc(e.beschrijving)}</p>` : ''}
      <p><b>${e.ec} EC</b> · ${S.weken(e)} weken${e.categorie ? ' · ' + S.esc(e.categorie) : ''}${e.verplicht ? ' · <span class="tag verpl">verplicht</span>' : ''}</p>
      ${b ? `<p><b>In je plan:</b> ${b.start == null ? 'vrijstelling' : `${S.momentLabel(b.start)}${blokDuur(b) > 1 ? ' t/m ' + S.momentLabel(blokEind(b)) : ''} (${S.startTekst(state.cat, b.start)} – ${S.eindTekst(state.cat, blokEind(b))}) · ${S.esc(S.leerwegNaam(b.leerweg))}`} · ${S.esc(S.STATUS[b.status] || b.status)}</p>` : ''}
      ${m.length ? `<ul class="meldingen">${m.map((x) => `<li class="${x.niveau === 'fout' ? 'fout' : ''}">${S.esc(e.naam + ' ' + x.t)}</li>`).join('')}</ul>` : ''}
      <p><b>Aanbod:</b> ${S.esc(S.aanbodTekst(e))}</p>
      ${S.looptijdTekst(e) ? `<p><b>Looptijd:</b> ${S.esc(S.looptijdTekst(e))}</p>` : ''}
      <p><b>Eerstvolgende startmomenten:</b> ${komend.length ? S.esc(komend.join(', ')) : 'geen binnen je planning'}</p>
      ${vereist.length ? `<p><b>Eerst nodig:</b> ${S.esc(vereist.map((v) => v.naam).join(', '))}</p>` : ''}
      <p><b>Contactpersoon${(e.contacten || []).length === 1 ? '' : 'en'} voor inhoudelijke vragen:</b></p>
      ${(e.contacten || []).length ? e.contacten.map((c) => `<div class="contact">${S.esc(c.naam)}${c.email ? ` – <a href="mailto:${S.esc(c.email)}">${S.esc(c.email)}</a>` : ''}</div>`).join('') : '<div class="contact">Nog niet bekend.</div>'}`;
    const voet = [];
    if (b) {
      voet.push(`<button class="btn gevaar" data-actie="weg" type="button">Verwijderen</button>`);
      if (b.start != null) voet.push(`<button class="btn" data-actie="vrij" type="button">Vrijstelling</button>`);
      voet.push(`<button class="btn primair" data-actie="verplaats" type="button">Verplaatsen</button>`);
    } else {
      voet.push(`<button class="btn" data-actie="vrij" type="button">Vrijstelling</button>`);
      voet.push(`<button class="btn primair" data-actie="plan" type="button">Inplannen</button>`);
    }
    $('#info-voet').innerHTML = voet.join('');
    const dlg = $('#dlg-info');
    dlg.dataset.evl = e.id;
    dlg.dataset.blok = b ? b.uid : '';
    dlg.showModal();
  }

  let toastTimer = null;
  function toast(t, ms = 4500) {
    let el = document.querySelector('.melding-toast');
    if (!el) { el = document.createElement('div'); el.className = 'melding-toast'; document.body.appendChild(el); }
    el.textContent = t;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ---------- selectie ----------
  function kies(sel) {
    // EvL die al in het plan staat? Dan verplaatsen we het bestaande blok.
    if (sel && sel.type === 'evl') {
      const b = state.plan.blokken.find((x) => x.evl === sel.id && actief(x));
      if (b) sel = { type: 'blok', uid: b.uid };
    }
    state.sel = sel;
    render();
  }
  function annuleer() { state.sel = null; state.drag = null; document.body.classList.remove('sleept'); render(); }

  function doelBereikt(i, sel = state.sel) {
    if (!sel) return false;
    const ok = sel.type === 'evl' ? plaatsEvlOfVerplaats(sel.id, i) : verplaatsBlok(sel.uid, i);
    if (ok) { state.sel = null; render(); }
    return ok;
  }
  function plaatsEvlOfVerplaats(id, i) {
    const b = state.plan.blokken.find((x) => x.evl === id && actief(x));
    return b ? verplaatsBlok(b.uid, i) : plaatsEvl(id, i);
  }

  // ---------- gegevens-formulier ----------
  function vulFormulier() {
    const p = state.plan;
    $('#f-naam').value = p.student.naam || '';
    $('#f-nummer').value = p.student.nummer || '';
    $('#f-coach').value = p.student.coach || '';
    $('#f-opmerkingen').value = p.student.opmerkingen || '';
    const sj = $('#f-startjaar');
    sj.innerHTML = '';
    const j0 = Math.min(state.cat.eersteSchooljaar, p.startJaar), j1 = Math.max(state.cat.laatsteSchooljaar, p.startJaar);
    for (let j = j0; j <= j1; j++) sj.insertAdjacentHTML('beforeend', `<option value="${j}">${S.jaarLabel(j)}</option>`);
    sj.value = p.startJaar;
    vulPeriodes(p.startJaar);
    $('#f-startperiode').value = p.startPeriode;
  }

  function vulPeriodes(j) {
    const sel = $('#f-startperiode');
    const oud = sel.value;
    sel.innerHTML = [1, 2, 3, 4].map((p) => `<option value="${p}">Periode ${p} – start ${S.esc(S.startTekst(state.cat, S.abs(j, p)))}</option>`).join('');
    if (oud) sel.value = oud;
  }

  function leesFormulier() {
    const p = state.plan;
    p.student.naam = $('#f-naam').value.trim();
    p.student.nummer = $('#f-nummer').value.trim();
    p.student.coach = $('#f-coach').value.trim();
    p.student.opmerkingen = $('#f-opmerkingen').value;
    p.startJaar = Number($('#f-startjaar').value);
    p.startPeriode = Number($('#f-startperiode').value);
  }

  // ---------- import / export ----------
  function exportData() {
    leesFormulier();
    const p = state.plan;
    const nu = new Date().toISOString();
    return {
      app: 'fontys-studieplanner', formaat: 1, gemaakt: nu, eersteVersie: p.eersteVersie || nu,
      opleiding: state.cat.opleiding, catalogusVersie: state.cat.versie || '',
      student: p.student, start: S.momentKey(hStart()), jaren: p.jaren,
      blokken: p.blokken.map((b) => ({ evl: b.evl, code: b.code, naam: b.naam, ec: b.ec, start: b.start == null ? null : S.momentKey(b.start), leerweg: b.leerweg, status: b.status })),
    };
  }

  function importData(d) {
    if (!d || d.app !== 'fontys-studieplanner' || !Array.isArray(d.blokken)) throw new Error('Dit PDF bevat geen studieplan van deze app.');
    const start = S.parseMoment(d.start);
    const p = leegPlan();
    p.student = { naam: '', nummer: '', coach: '', opmerkingen: '', ...(d.student || {}) };
    if (start != null) { p.startJaar = S.jaarVan(start); p.startPeriode = S.periodeVan(start); }
    p.jaren = Math.min(12, Math.max(1, Number(d.jaren) || 4));
    p.eersteVersie = d.eersteVersie || d.gemaakt || null;
    p.blokken = d.blokken.map((x) => {
      const b = { uid: S.uid(), evl: String(x.evl), code: x.code || '', naam: x.naam || String(x.evl), ec: Number(x.ec) || 15, start: x.start == null ? null : S.parseMoment(x.start), leerweg: x.leerweg || 'fysiek', status: x.status || '' };
      return b;
    });
    state.plan = p;
    // zorg dat alle ingelezen blokken in beeld zijn
    const laatste = Math.max(-1, ...p.blokken.filter((b) => b.start != null).map((b) => blokEind(b)));
    while (laatste > hEind() && p.jaren < 12) p.jaren++;
    // status opnieuw bepalen: de tijd is verstreken sinds het PDF gemaakt is
    for (const b of p.blokken) autoStatus(b);
    state.sel = null;
    state.gewijzigd = false;
    state.ingelezen = { opgeslagen: d.gemaakt || null, eersteVersie: p.eersteVersie };
    vulFormulier();
    render();
    const anders = d.catalogusVersie && state.cat.versie && d.catalogusVersie !== state.cat.versie;
    const fouten = overzicht().meldingen.filter((m) => m.niveau === 'fout').length;
    return (anders ? ' Het aanbod is sindsdien gewijzigd: kijk bij Overzicht wat er aangepast moet worden.' : '') + (fouten ? ` ${fouten} blok(ken) moeten verplaatst worden.` : '');
  }

  async function leesPdf(file) {
    try {
      const buf = await file.arrayBuffer();
      const d = S.decodePlanFromPdfBytes(buf);
      if (!d) throw new Error('In dit PDF is geen studieplan gevonden. Gebruik het originele PDF dat met "Opslaan als PDF" is gemaakt.');
      const extra = importData(d);
      const naam = state.plan.student.naam ? ' van ' + state.plan.student.naam : '';
      toast(`Plan ingelezen${naam}${d.gemaakt ? `, opgeslagen op ${datumTijd(d.gemaakt)} (${leeftijd(d.gemaakt)})` : ''}.${extra}`, 8000);
    } catch (e) {
      toast(e.message || 'Kon het PDF niet lezen.');
    }
  }

  // ---------- events ----------
  function koppel() {
    // formulier
    ['#f-naam', '#f-nummer', '#f-coach', '#f-opmerkingen'].forEach((s) => $(s).addEventListener('input', () => { leesFormulier(); state.gewijzigd = true; }));
    ['#f-startjaar', '#f-startperiode'].forEach((s) => $(s).addEventListener('change', () => {
      const oudJaar = state.plan.startJaar;
      if (s === '#f-startjaar') vulPeriodes(Number($('#f-startjaar').value));
      leesFormulier();
      // het laatste schooljaar in beeld blijft gelijk als je het instroomjaar verschuift
      state.plan.jaren = Math.min(12, Math.max(1, state.plan.jaren + (oudJaar - state.plan.startJaar)));
      state.plan.blokken.forEach(autoStatus);
      wijzig();
    }));
    $('#btn-jaar-plus').addEventListener('click', () => { state.plan.jaren = Math.min(12, state.plan.jaren + 1); wijzig(); });
    $('#btn-jaar-min').addEventListener('click', () => { state.plan.jaren = Math.max(1, state.plan.jaren - 1); wijzig(); });
    $('#zoek').addEventListener('input', renderLijst);
    $('#filter').addEventListener('change', renderLijst);
    $('#hint-annuleer').addEventListener('click', annuleer);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && state.sel) annuleer(); });

    // lijst
    const lijst = $('#evl-lijst');
    lijst.addEventListener('click', (ev) => {
      const k = ev.target.closest('.evl-kaart');
      if (!k) return;
      const id = k.dataset.evl;
      if (state.sel && state.sel.type === 'evl' && state.sel.id === id) { toonInfo(id); return; }
      kies({ type: 'evl', id });
    });
    lijst.addEventListener('dblclick', (ev) => { const k = ev.target.closest('.evl-kaart'); if (k) toonInfo(k.dataset.evl); });

    // slepen
    document.addEventListener('dragstart', (ev) => {
      const k = ev.target.closest && ev.target.closest('[data-evl], [data-blok]');
      if (!k) return;
      if (k.dataset.evl) {
        const b = state.plan.blokken.find((x) => x.evl === k.dataset.evl && actief(x));
        state.drag = b ? { type: 'blok', uid: b.uid } : { type: 'evl', id: k.dataset.evl };
      } else state.drag = { type: 'blok', uid: k.dataset.blok };
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', k.dataset.evl || k.dataset.blok);
      // Sleepbeeld op ware grootte: 30 EC is twee periodes breed, 15 EC één.
      const sb = state.drag.type === 'blok' ? state.plan.blokken.find((x) => x.uid === state.drag.uid) : null;
      const se = sb ? blokEvl(sb) : evlVan(state.drag.id);
      const cel = document.querySelector('.cel:not(.buiten)') || document.querySelector('.cel');
      if (se && cel && ev.dataTransfer.setDragImage && !k.classList.contains('blok')) {
        const d = S.duur(se), w = cel.getBoundingClientRect().width;
        const g = document.createElement('div');
        g.className = 'sleep-ghost';
        g.style.width = Math.round(w * d + 6 * (d - 1)) + 'px';
        g.style.setProperty('--kleur', S.kleurVoor(state.cat, se));
        g.innerHTML = `<b>${S.esc((se.code ? se.code + ' ' : '') + se.naam)}</b><span>${se.ec} EC · ${S.weken(se)} weken</span>`;
        document.body.appendChild(g);
        ev.dataTransfer.setDragImage(g, 24, 20);
        setTimeout(() => g.remove(), 0);
      }
      // klasse pas na de start zetten, anders annuleert Chrome het slepen
      setTimeout(() => { document.body.classList.add('sleept'); markeer(); }, 0);
    });
    // Let op: na een drop wordt de lijst opnieuw getekend, waardoor 'dragend' op een
    // losgekoppeld element kan vallen en niet bij document aankomt. Daarom ruimen we
    // ook direct in elke drop-handler op.
    const eindeSleep = () => {
      state.drag = null;
      document.body.classList.remove('sleept');
      document.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
      markeer();
    };
    document.addEventListener('dragend', eindeSleep);
    const metSleep = (fn) => { const d = state.drag; eindeSleep(); if (d) fn(d); };
    const rooster = $('#rooster');
    rooster.addEventListener('dragover', (ev) => {
      const c = ev.target.closest('.cel');
      if (!c || !state.drag) return;
      if (c.classList.contains('kan-f') || c.classList.contains('kan-lwo') || c.classList.contains('kan-verleden')) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.drop').forEach((x) => x !== c && x.classList.remove('drop'));
        c.classList.add('drop');
      }
    });
    rooster.addEventListener('dragleave', (ev) => { const c = ev.target.closest('.cel'); if (c) c.classList.remove('drop'); });
    rooster.addEventListener('drop', (ev) => {
      const c = ev.target.closest('.cel');
      if (!c || !state.drag) return;
      ev.preventDefault();
      const i = Number(c.dataset.i);
      metSleep((d) => doelBereikt(i, d));
    });
    const vrij = $('#vrij-zone');
    vrij.addEventListener('dragover', (ev) => { if (state.drag) { ev.preventDefault(); vrij.classList.add('drop'); } });
    vrij.addEventListener('dragleave', () => vrij.classList.remove('drop'));
    vrij.addEventListener('drop', (ev) => { ev.preventDefault(); vrij.classList.remove('drop'); metSleep(maakVrijstelling); });
    vrij.addEventListener('click', (ev) => {
      const w = ev.target.closest('[data-weg]');
      if (w) { verwijder(w.dataset.weg); return; }
      const chip = ev.target.closest('[data-blok]');
      if (chip) { toonInfo(null, chip.dataset.blok); return; }
      if (state.sel) { maakVrijstelling(state.sel); state.sel = null; render(); }
    });
    // blok terugslepen naar de lijst = verwijderen
    const aside = document.querySelector('.lijst');
    aside.addEventListener('dragover', (ev) => { if (state.drag && state.drag.type === 'blok') ev.preventDefault(); });
    aside.addEventListener('drop', (ev) => { if (state.drag && state.drag.type === 'blok') { ev.preventDefault(); metSleep((d) => verwijder(d.uid)); } });

    // klikken in het rooster
    rooster.addEventListener('click', (ev) => {
      const w = ev.target.closest('[data-weg]');
      if (w) { verwijder(w.dataset.weg); return; }
      if (ev.target.closest('select')) return;
      const blok = ev.target.closest('.blok');
      if (blok) {
        if (state.sel) {
          // tijdens kiezen: de periode onder het blok is het doel (EvL's mogen tegelijk lopen)
          const onder = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.classList && el.classList.contains('cel'));
          if (onder && !onder.classList.contains('buiten')) doelBereikt(Number(onder.dataset.i));
          return;
        }
        toonInfo(null, blok.dataset.blok);
        return;
      }
      const c = ev.target.closest('.cel');
      if (!c || c.classList.contains('buiten')) return;
      const i = Number(c.dataset.i);
      if (state.sel) { doelBereikt(i); return; }
      toonKeuze(i);
    });
    rooster.addEventListener('change', (ev) => {
      const lw = ev.target.dataset.leerweg, st = ev.target.dataset.status;
      const b = state.plan.blokken.find((x) => x.uid === (lw || st));
      if (!b) return;
      if (lw) b.leerweg = ev.target.value;
      if (st) b.status = ev.target.value;
      wijzig();
    });

    // dialogen
    document.querySelectorAll('dialog').forEach((d) => {
      d.addEventListener('click', (ev) => { if (ev.target === d || ev.target.closest('[data-sluit]')) d.close(); });
    });
    $('#keuze-lijst').addEventListener('click', (ev) => {
      const k = ev.target.closest('[data-kies]');
      if (!k) return;
      const dlg = $('#dlg-keuze');
      if (plaatsEvl(k.dataset.kies, Number(dlg.dataset.i), k.dataset.lw)) dlg.close();
    });
    $('#info-voet').addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-actie]');
      if (!a) return;
      const dlg = $('#dlg-info');
      const uid = dlg.dataset.blok, evl = dlg.dataset.evl;
      dlg.close();
      if (a.dataset.actie === 'weg') verwijder(uid);
      if (a.dataset.actie === 'vrij') maakVrijstelling(uid ? { type: 'blok', uid } : { type: 'evl', id: evl });
      if (a.dataset.actie === 'verplaats') kies({ type: 'blok', uid });
      if (a.dataset.actie === 'plan') kies({ type: 'evl', id: evl });
    });

    // kopknoppen
    $('#btn-nieuw').addEventListener('click', () => {
      if (state.plan.blokken.length && !confirm('Een nieuw plan beginnen? Je huidige plan gaat verloren als je het niet als PDF hebt opgeslagen.')) return;
      state.plan = leegPlan(); state.sel = null; state.gewijzigd = false; state.ingelezen = null;
      vulFormulier(); render();
    });
    $('#btn-inlezen').addEventListener('click', () => {
      if (state.gewijzigd && state.plan.blokken.length && !confirm('Een PDF inlezen vervangt je huidige plan. Doorgaan?')) return;
      $('#pdf-bestand').click();
    });
    $('#pdf-bestand').addEventListener('change', (ev) => {
      const f = ev.target.files[0];
      ev.target.value = '';
      if (f) leesPdf(f);
    });
    // PDF slepen op de pagina
    document.addEventListener('dragover', (ev) => { if (!state.drag && ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
    document.addEventListener('drop', (ev) => {
      if (state.drag || !ev.dataTransfer || !ev.dataTransfer.files.length) return;
      ev.preventDefault();
      const f = ev.dataTransfer.files[0];
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') leesPdf(f);
    });
    $('#btn-opslaan').addEventListener('click', () => {
      leesFormulier();
      try {
        const d = StudiePdf.maak(api);
        state.gewijzigd = false;
        if (!state.plan.eersteVersie) state.plan.eersteVersie = d.eersteVersie;
        state.ingelezen = { opgeslagen: d.gemaakt, eersteVersie: state.plan.eersteVersie };
        renderPlanInfo();
      } catch (e) {
        console.error(e);
        toast('Het maken van het PDF is mislukt: ' + e.message);
      }
    });
    window.addEventListener('beforeunload', (ev) => {
      if (state.gewijzigd && state.plan.blokken.length) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  async function start() {
    try {
      state.cat = await S.laadCatalogus();
    } catch (e) {
      document.querySelector('main').innerHTML = `<div class="kaart"><h2>De catalogus kon niet geladen worden</h2><p>${S.esc(e.message)}</p></div>`;
      return;
    }
    state.nu = S.huidigeMoment(state.cat);
    state.plan = leegPlan();
    document.title = `Studieplanner – ${state.cat.opleiding}`;
    $('#titel').textContent = 'Studieplanner';
    $('#subtitel').textContent = `${state.cat.instituut} · ${state.cat.opleiding} · nu: ${S.momentLabel(state.nu)}`;
    vulFormulier();
    koppel();
    render();
  }

  const api = { rijIndeling, vandaagPositie, blokkenIn, state, evlVan, blokEvl, blokDuur, blokEind, hStart, hEind, overzicht, exportData, blokMeldingen, importData, toast };
  document.addEventListener('DOMContentLoaded', start);
  return api;
})();
