// Beheerpagina: de catalogus (EvL's en hun aanbod) bewerken.
'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const S = SP;
  let cat = null;
  let pin = '';
  let zonderServer = false;
  let gekozen = null; // id van de EvL in de editor
  let gewijzigd = false;

  const MODI = [
    ['geen', 'Niet aangeboden'],
    ['doorlopend', 'Doorlopend (start in elke periode)'],
    ['jaarlijks', 'Elk schooljaar in vaste periodes'],
    ['specifiek', 'Specifieke startmomenten per schooljaar'],
  ];

  function markeer(w = true) {
    gewijzigd = w;
    $('#status').textContent = w ? 'Niet opgeslagen wijzigingen' : (zonderServer ? (S.ingebouwd() ? 'Alles bewaard' : 'Zonder server: download het JSON-bestand') : 'Alles opgeslagen');
  }

  // ---------- inloggen ----------
  $('#inlog-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    pin = $('#pin').value;
    $('#inlog-fout').textContent = '';
    try {
      const r = await fetch('api/login', { method: 'POST', headers: { 'X-Admin-Pin': pin } });
      if (r.status === 404 || r.status === 405) { $('#inlog-fout').textContent = 'Er draait geen planner-server. Kies "Werk zonder server".'; return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { $('#inlog-fout').textContent = d.error || 'Inloggen mislukt'; return; }
      await openBeheer();
    } catch (e) {
      $('#inlog-fout').textContent = 'Geen verbinding met de server.';
    }
  });
  $('#zonder-server').addEventListener('click', async (ev) => {
    ev.preventDefault();
    zonderServer = true;
    $('#btn-opslaan').hidden = true;
    await openBeheer();
  });

  async function openBeheer() {
    try { cat = await S.laadCatalogus(); } catch (e) { cat = S.normaliseerCatalogus({}); }
    $('#inlog').hidden = true;
    $('#beheer').hidden = false;
    $('#acties').hidden = false;
    markeer(false);
    vulInstellingen();
    renderTabel();
    renderEditor();
  }

  // ---------- tabs ----------
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('primair', x === b));
    document.querySelectorAll('[data-paneel]').forEach((p) => { p.hidden = p.dataset.paneel !== b.dataset.tab; });
    if (b.dataset.tab === 'overzicht') renderOverzicht();
  }));

  // ---------- EvL-lijst ----------
  function renderTabel() {
    $('#evl-tabel').innerHTML = cat.evls.map((e, idx) => `
      <tr class="klik${e.id === gekozen ? ' actief' : ''}" data-id="${S.esc(e.id)}">
        <td>${S.esc(e.code || '')}</td>
        <td><b>${S.esc(e.naam)}</b><br><small class="status-tekst">${S.esc(e.categorie || '')}${e.verplicht ? ' · verplicht' : ''}</small></td>
        <td>${e.ec}</td>
        <td><small>${S.esc(S.aanbodTekst(e))}${S.looptijdTekst(e) ? `<br><b>${S.esc(S.uitgefaseerd(e) ? 'Uitgefaseerd: ' : 'Looptijd: ')}</b>${S.esc(S.looptijdTekst(e))}` : ''}</small></td>
        <td style="white-space:nowrap"><button class="btn klein" data-op="${idx}" title="Omhoog" type="button">↑</button><button class="btn klein" data-neer="${idx}" title="Omlaag" type="button">↓</button></td>
      </tr>`).join('') || '<tr><td colspan="5">Nog geen EvL\'s.</td></tr>';
  }
  $('#evl-tabel').addEventListener('click', (ev) => {
    const op = ev.target.closest('[data-op]'), neer = ev.target.closest('[data-neer]');
    if (op || neer) {
      const i = Number((op || neer).dataset.op ?? (op || neer).dataset.neer);
      const j = op ? i - 1 : i + 1;
      if (j < 0 || j >= cat.evls.length) return;
      [cat.evls[i], cat.evls[j]] = [cat.evls[j], cat.evls[i]];
      markeer(); renderTabel();
      return;
    }
    const tr = ev.target.closest('tr[data-id]');
    if (tr) { gekozen = tr.dataset.id; renderTabel(); renderEditor(); }
  });
  $('#btn-nieuw').addEventListener('click', () => {
    const e = { id: 'evl-' + S.uid(), code: '', naam: 'Nieuwe EvL', ec: 15, categorie: '', verplicht: false, beschrijving: '', contacten: [{ naam: '', email: '' }], vereist: [], aanbod: { fysiek: { modus: 'jaarlijks', periodes: [1], momenten: [] }, lwo: { modus: 'geen', periodes: [], momenten: [] } } };
    cat.evls.push(e);
    gekozen = e.id;
    markeer(); renderTabel(); renderEditor();
    $('#e-naam').select();
  });

  // ---------- editor ----------
  const evl = () => cat.evls.find((e) => e.id === gekozen);

  function renderEditor() {
    const e = evl();
    const box = $('#editor');
    if (!e) { box.innerHTML = '<p class="uitleg">Kies links een EvL om te bewerken, of maak een nieuwe.</p>'; return; }
    const cats = [...new Set(cat.evls.map((x) => x.categorie).filter(Boolean))];
    box.innerHTML = `
      <div class="rij" style="justify-content:space-between;margin-bottom:10px"><h2>EvL bewerken</h2><button class="btn klein gevaar" id="e-weg" type="button">Verwijderen</button></div>
      <div class="velden">
        <div class="veld"><label for="e-code">Code</label><input id="e-code" data-veld="code" value="${S.esc(e.code || '')}"></div>
        <div class="veld"><label for="e-naam">Naam</label><input id="e-naam" data-veld="naam" value="${S.esc(e.naam)}"></div>
        <div class="veld"><label for="e-ec">Omvang</label><select id="e-ec" data-veld="ec"><option value="15"${e.ec === 15 ? ' selected' : ''}>15 EC · 10 weken (1 periode)</option><option value="30"${e.ec === 30 ? ' selected' : ''}>30 EC · 20 weken (2 periodes)</option></select></div>
        <div class="veld"><label for="e-cat">Categorie / fase</label><input id="e-cat" data-veld="categorie" list="cat-lijst" value="${S.esc(e.categorie || '')}"><datalist id="cat-lijst">${cats.map((c) => `<option value="${S.esc(c)}">`).join('')}</datalist></div>
        <div class="veld"><label for="e-kleur">Kleur (Fontys huisstijl)</label><select id="e-kleur" data-veld="kleur"><option value="">Automatisch (per categorie)</option>${Object.entries(S.KLEUR_NAMEN).map(([hex, naam]) => `<option value="${hex}"${(e.kleur || '').toLowerCase() === hex ? ' selected' : ''}>${naam}</option>`).join('')}</select></div>
        <div class="veld"><label>Verplicht onderdeel</label><label style="display:inline-flex;gap:6px;align-items:center;font-weight:400;font-size:.9rem;color:inherit;margin-top:6px"><input type="checkbox" data-veld="verplicht" style="width:auto"${e.verplicht ? ' checked' : ''}> Ja, iedere student moet deze EvL halen</label></div>
        <div class="veld"><label for="e-in">Ingangsdatum (infaseren)</label><input id="e-in" type="date" data-veld="ingangsdatum" value="${S.esc(e.ingangsdatum || '')}"></div>
        <div class="veld"><label for="e-uit">Sluitingsdatum (uitfaseren)</label><input id="e-uit" type="date" data-veld="sluitingsdatum" value="${S.esc(e.sluitingsdatum || '')}"></div>
        <div class="veld breed"><p class="uitleg" id="e-looptijd" style="margin:0">${looptijdUitleg(e)}</p></div>
        <div class="veld breed"><label for="e-besch">Korte beschrijving</label><textarea id="e-besch" data-veld="beschrijving">${S.esc(e.beschrijving || '')}</textarea></div>
      </div>

      <h3 style="margin:14px 0 6px;font-size:.95rem">Contactperso(o)n(en) voor inhoudelijke vragen</h3>
      <div id="contacten">${e.contacten.map((c, k) => `<div class="contact-rij"><input placeholder="Naam" data-cnaam="${k}" value="${S.esc(c.naam || '')}"><input placeholder="E-mail" type="email" data-cmail="${k}" value="${S.esc(c.email || '')}"><button class="btn klein" data-cweg="${k}" type="button">✕</button></div>`).join('')}</div>
      <button class="btn klein" id="c-plus" type="button">+ Contactpersoon</button>

      <h3 style="margin:14px 0 6px;font-size:.95rem">Eerst nodig (voorwaarden, optioneel)</h3>
      <div class="vereist-lijst">${cat.evls.filter((x) => x.id !== e.id).map((x) => `<label><input type="checkbox" data-vereist="${S.esc(x.id)}"${e.vereist.includes(x.id) ? ' checked' : ''}> ${S.esc((x.code ? x.code + ' ' : '') + x.naam)}</label>`).join('') || '<span class="status-tekst">Geen andere EvL\'s.</span>'}</div>

      <h3 style="margin:14px 0 2px;font-size:.95rem">Aanbod</h3>
      <p class="uitleg">Stel per leerweg in wanneer de EvL kan <b>starten</b>.${e.ec === 30 ? ' Deze EvL duurt 2 periodes: bij start in P4 loopt hij door tot en met P1 van het volgende schooljaar.' : ''} Studenten kunnen een leerwegonafhankelijke variant kiezen als de fysieke variant op dat moment niet wordt aangeboden.</p>
      ${S.LEERWEGEN.map((l) => leerwegHtml(e, l)).join('')}
      <div class="leerweg-blok"><h3>Aanbod nog niet bekend</h3>
        <p class="uitleg" style="margin-top:0">Vink de schooljaren aan waarin nog niet vaststaat óf en wanneer deze EvL gegeven wordt. Studenten kunnen hem in die jaren in elke periode inplannen (met de leerwegen die hierboven aan staan), maar het blok staat dan <b>onder voorbehoud</b>.</p>
        <div class="checks">${jarenLijst().map((j) => `<label><input type="checkbox" data-onbekend="${j}"${e.onbekendeJaren.includes(j) ? ' checked' : ''}> ${S.jaarLabel(j)}</label>`).join('')}</div>
      </div>`;
  }

  const jarenLijst = () => { const r = []; for (let j = cat.eersteSchooljaar; j <= cat.laatsteSchooljaar; j++) r.push(j); return r; };

  function looptijdUitleg(e) {
    if (e.ingangsdatum && e.sluitingsdatum && e.ingangsdatum > e.sluitingsdatum) return '<b style="color:var(--fout)">De ingangsdatum ligt na de sluitingsdatum.</b>';
    const t = S.looptijdTekst(e);
    return (t ? `Looptijd: ${S.esc(t)}. ` : 'Leeg laten = geen begin- of einddatum. ')
      + 'Studenten kunnen deze EvL alleen plaatsen als hij op of na de ingangsdatum start en vóór of op de sluitingsdatum helemaal is afgerond'
      + (e.ec === 30 ? ' (bij 30 EC dus inclusief de tweede periode).' : '.');
  }

  function leerwegHtml(e, l) {
    const a = e.aanbod[l.id];
    let extra = '';
    if (a.modus === 'jaarlijks') {
      extra = `<div class="checks" style="margin-top:6px">${[1, 2, 3, 4].map((p) => `<label><input type="checkbox" data-lw="${l.id}" data-per="${p}"${a.periodes.includes(p) ? ' checked' : ''}> P${p}</label>`).join('')}</div>
        <p class="uitleg">Geldt voor alle schooljaren ${S.jaarLabel(cat.eersteSchooljaar)} t/m ${S.jaarLabel(cat.laatsteSchooljaar)}.</p>`;
    } else if (a.modus === 'specifiek') {
      const rijen = [];
      for (let j = cat.eersteSchooljaar; j <= cat.laatsteSchooljaar; j++) {
        rijen.push(`<tr><th>${S.jaarLabel(j)}</th>${[1, 2, 3, 4].map((p) => { const k = `${j}-${p}`; const aan = a.momenten.includes(k); return `<td class="${aan ? 'aan' : ''}"><input type="checkbox" data-lw="${l.id}" data-moment="${k}"${aan ? ' checked' : ''} aria-label="${S.jaarLabel(j)} P${p}"></td>`; }).join('')}</tr>`);
      }
      extra = `<div class="rij" style="margin:6px 0"><button class="btn klein" data-patroon="${l.id}" type="button">Vul met vaste periodes:</button>${[1, 2, 3, 4].map((p) => `<label class="checks"><input type="checkbox" data-patroonp="${l.id}" value="${p}"> P${p}</label>`).join('')}<button class="btn klein" data-leeg="${l.id}" type="button">Alles uit</button></div>
        <table class="aanbod-raster"><thead><tr><th>Schooljaar</th><th>P1</th><th>P2</th><th>P3</th><th>P4</th></tr></thead><tbody>${rijen.join('')}</tbody></table>`;
    }
    return `<div class="leerweg-blok"><h3>${S.esc(l.lang)}</h3>
      <select data-modus="${l.id}">${MODI.map(([v, t]) => `<option value="${v}"${a.modus === v ? ' selected' : ''}>${t}</option>`).join('')}</select>${extra}</div>`;
  }

  const editor = $('#editor');
  editor.addEventListener('input', (ev) => {
    const e = evl(); if (!e) return;
    const t = ev.target;
    if (t.dataset.veld && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
      e[t.dataset.veld] = t.value; markeer(); renderTabel();
      if (t.type === 'date') $('#e-looptijd').innerHTML = looptijdUitleg(e);
    }
    if (t.dataset.cnaam) { e.contacten[t.dataset.cnaam].naam = t.value; markeer(); }
    if (t.dataset.cmail) { e.contacten[t.dataset.cmail].email = t.value; markeer(); }
  });
  editor.addEventListener('change', (ev) => {
    const e = evl(); if (!e) return;
    const t = ev.target;
    if (t.dataset.veld === 'verplicht') e.verplicht = t.checked;
    else if (t.dataset.veld === 'ec') { e.ec = Number(t.value); renderEditor(); }
    else if (t.dataset.veld === 'kleur') e.kleur = t.value;
    else if (t.dataset.vereist) {
      e.vereist = t.checked ? [...new Set([...e.vereist, t.dataset.vereist])] : e.vereist.filter((x) => x !== t.dataset.vereist);
    } else if (t.dataset.modus) {
      const a = e.aanbod[t.dataset.modus];
      // bij overstap van jaarlijks naar specifiek: het patroon alvast invullen
      if (t.value === 'specifiek' && a.modus === 'jaarlijks' && !a.momenten.length) {
        for (let j = cat.eersteSchooljaar; j <= cat.laatsteSchooljaar; j++) a.periodes.forEach((p) => a.momenten.push(`${j}-${p}`));
      }
      a.modus = t.value;
      renderEditor();
    } else if (t.dataset.per) {
      const a = e.aanbod[t.dataset.lw]; const p = Number(t.dataset.per);
      a.periodes = t.checked ? [...new Set([...a.periodes, p])].sort() : a.periodes.filter((x) => x !== p);
    } else if (t.dataset.moment) {
      const a = e.aanbod[t.dataset.lw];
      a.momenten = t.checked ? [...new Set([...a.momenten, t.dataset.moment])].sort() : a.momenten.filter((x) => x !== t.dataset.moment);
      t.closest('td').classList.toggle('aan', t.checked);
    } else if (t.dataset.onbekend) {
      const j = Number(t.dataset.onbekend);
      e.onbekendeJaren = t.checked ? [...new Set([...e.onbekendeJaren, j])].sort() : e.onbekendeJaren.filter((x) => x !== j);
    } else if (t.dataset.patroonp) return;
    markeer(); renderTabel();
  });
  editor.addEventListener('click', (ev) => {
    const e = evl(); if (!e) return;
    const t = ev.target;
    if (t.id === 'c-plus') { e.contacten.push({ naam: '', email: '' }); markeer(); renderEditor(); }
    else if (t.dataset.cweg) { e.contacten.splice(Number(t.dataset.cweg), 1); markeer(); renderEditor(); }
    else if (t.dataset.patroon) {
      const lw = t.dataset.patroon;
      const ps = [...editor.querySelectorAll(`[data-patroonp="${lw}"]:checked`)].map((x) => Number(x.value));
      if (!ps.length) { alert('Vink eerst de periodes aan (P1–P4) die je in elk schooljaar wilt aanzetten.'); return; }
      const a = e.aanbod[lw];
      const set = new Set(a.momenten);
      for (let j = cat.eersteSchooljaar; j <= cat.laatsteSchooljaar; j++) ps.forEach((p) => set.add(`${j}-${p}`));
      a.momenten = [...set].sort();
      markeer(); renderEditor(); renderTabel();
    } else if (t.dataset.leeg) { e.aanbod[t.dataset.leeg].momenten = []; markeer(); renderEditor(); renderTabel(); }
    else if (t.id === 'e-weg') {
      if (!confirm(`"${e.naam}" verwijderen? Studenten met deze EvL in hun PDF krijgen bij inlezen een melding.`)) return;
      cat.evls = cat.evls.filter((x) => x.id !== e.id);
      cat.evls.forEach((x) => { x.vereist = x.vereist.filter((r) => r !== e.id); });
      gekozen = null; markeer(); renderTabel(); renderEditor();
    }
  });

  // ---------- overzicht ----------
  function renderOverzicht() {
    const kop1 = [], kop2 = [];
    for (let j = cat.eersteSchooljaar; j <= cat.laatsteSchooljaar; j++) {
      kop1.push(`<th colspan="4">${S.jaarLabel(j)}</th>`);
      for (let p = 1; p <= 4; p++) kop2.push(`<th>P${p}</th>`);
    }
    const rijen = cat.evls.map((e) => {
      const cellen = [];
      for (let j = cat.eersteSchooljaar; j <= cat.laatsteSchooljaar; j++) {
        for (let p = 1; p <= 4; p++) {
          const i = S.abs(j, p);
          const f = S.aangeboden(cat, e, 'fysiek', i), l = S.aangeboden(cat, e, 'lwo', i);
          if ((f || l) && S.onderVoorbehoud(e, i)) { cellen.push('<td class="vb" title="Nog niet bekend">?</td>'); continue; }
          cellen.push(f && l ? '<td class="beide">F+L</td>' : f ? '<td class="f">F</td>' : l ? '<td class="lwo">L</td>' : '<td></td>');
        }
      }
      return `<tr><td class="l">${S.esc((e.code ? e.code + ' ' : '') + e.naam)} <small>(${e.ec})</small></td>${cellen.join('')}</tr>`;
    });
    $('#overzicht').innerHTML = `<table><thead><tr><th class="l" rowspan="2">EvL (EC)</th>${kop1.join('')}</tr><tr>${kop2.join('')}</tr></thead><tbody>${rijen.join('')}</tbody></table>`;
  }

  // ---------- instellingen ----------
  function vulInstellingen() {
    $('#i-instituut').value = cat.instituut;
    $('#i-opleiding').value = cat.opleiding;
    $('#i-totaal').value = cat.totaalEC;
    const nu = new Date().getFullYear();
    for (const s of ['#i-eerste', '#i-laatste']) {
      $(s).innerHTML = '';
      for (let j = nu - 10; j <= nu + 10; j++) $(s).insertAdjacentHTML('beforeend', `<option value="${j}">${S.jaarLabel(j)}</option>`);
    }
    $('#i-eerste').value = cat.eersteSchooljaar;
    $('#i-laatste').value = cat.laatsteSchooljaar;
    cat.periodeStart.forEach((d, k) => { $('#i-p' + (k + 1)).value = d; });
    $('#i-einde').value = cat.jaarEinde;
    renderJaardatums();
    $('#subtitel').textContent = `${cat.instituut} · ${cat.opleiding}`;
  }
  document.querySelector('[data-paneel="instellingen"]').addEventListener('change', () => {
    cat.instituut = $('#i-instituut').value.trim() || 'Fontys';
    cat.opleiding = $('#i-opleiding').value.trim() || 'Opleiding';
    cat.totaalEC = Number($('#i-totaal').value) || 240;
    const j1 = Number($('#i-eerste').value), j2 = Number($('#i-laatste').value);
    if (j1 > j2) { alert('Het eerste schooljaar moet vóór het laatste liggen.'); vulInstellingen(); return; }
    cat.eersteSchooljaar = j1; cat.laatsteSchooljaar = j2;
    const ps = [1, 2, 3, 4].map((k) => $('#i-p' + k).value.trim());
    if (ps.every((d) => /^\d\d-\d\d$/.test(d))) cat.periodeStart = ps;
    if (/^\d\d-\d\d$/.test($('#i-einde').value.trim())) cat.jaarEinde = $('#i-einde').value.trim();
    renderJaardatums();
    $('#subtitel').textContent = `${cat.instituut} · ${cat.opleiding}`;
    markeer(); renderEditor();
  });

  // Tabel met de werkelijke datums per schooljaar; een aangepaste datum overschrijft het patroon.
  function renderJaardatums() {
    const rijen = [];
    for (let j = cat.eersteSchooljaar; j <= cat.laatsteSchooljaar; j++) {
      const eigen = cat.periodeData[j] || [];
      const cellen = [0, 1, 2, 3, 4].map((k) => {
        const waarde = k < 4 ? S.periodeStart(cat, S.abs(j, k + 1)) : S.periodeEind(cat, S.abs(j, 4));
        const aangepast = S.isIso(eigen[k]);
        return `<td><input type="date" data-jaar="${j}" data-k="${k}" value="${waarde}" style="${aangepast ? 'font-weight:700' : ''}"></td>`;
      }).join('');
      const iets = eigen.some((x) => S.isIso(x));
      const onbekend = cat.datumsOnbekend.includes(j);
      rijen.push(`<tr${onbekend ? ' class="voorlopig"' : ''}><th>${S.jaarLabel(j)}</th>${cellen}<td><label class="checks"><input type="checkbox" data-onbekendjaar="${j}"${onbekend ? ' checked' : ''}> nog niet bekend</label></td><td>${iets ? `<button class="btn klein" data-herstel="${j}" type="button">Patroon</button>` : ''}</td></tr>`);
    }
    $('#jaardatums').innerHTML = `<thead><tr><th>Schooljaar</th><th>Start P1</th><th>Start P2</th><th>Start P3</th><th>Start P4</th><th>Einde P4</th><th>Datums</th><th></th></tr></thead><tbody>${rijen.join('')}</tbody>`;
  }
  $('#jaardatums').addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.onbekendjaar) {
      ev.stopPropagation();
      const j = Number(t.dataset.onbekendjaar);
      cat.datumsOnbekend = t.checked ? [...new Set([...cat.datumsOnbekend, j])].sort() : cat.datumsOnbekend.filter((x) => x !== j);
      markeer(); renderJaardatums();
      return;
    }
    if (!t.dataset.jaar) return;
    ev.stopPropagation();
    const j = t.dataset.jaar, k = Number(t.dataset.k);
    const rij = (cat.periodeData[j] || ['', '', '', '', '']).slice();
    const patroon = k < 4 ? S.patroonDatum(cat.periodeStart[k], Number(j)) : S.patroonDatum(cat.jaarEinde, Number(j));
    rij[k] = S.isIso(t.value) && t.value !== patroon ? t.value : '';
    if (rij.some((x) => S.isIso(x))) cat.periodeData[j] = rij; else delete cat.periodeData[j];
    markeer(); renderJaardatums();
  });
  $('#jaardatums').addEventListener('click', (ev) => {
    const j = ev.target.dataset && ev.target.dataset.herstel;
    if (!j) return;
    delete cat.periodeData[j];
    markeer(); renderJaardatums();
  });

  // ---------- opslaan / JSON ----------
  function controleer() {
    for (const e of cat.evls) {
      if (!e.naam.trim()) return 'Er is een EvL zonder naam.';
      if (e.ingangsdatum && e.sluitingsdatum && e.ingangsdatum > e.sluitingsdatum) return `Bij "${e.naam}" ligt de ingangsdatum na de sluitingsdatum.`;
      e.contacten = e.contacten.filter((c) => (c.naam || '').trim() || (c.email || '').trim());
    }
    return null;
  }
  $('#btn-opslaan').addEventListener('click', async () => {
    const f = controleer();
    if (f) { alert(f); return; }
    $('#status').textContent = 'Opslaan…';
    try {
      const r = await fetch('api/catalogus', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin }, body: JSON.stringify(cat) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { $('#status').textContent = 'Niet opgeslagen: ' + (d.error || r.status); return; }
      cat.versie = d.versie;
      markeer(false);
      renderEditor();
    } catch (e) {
      $('#status').textContent = 'Niet opgeslagen: geen verbinding';
    }
  });
  $('#btn-json-uit').addEventListener('click', () => {
    const f = controleer();
    if (f) { alert(f); return; }
    if (zonderServer) cat.versie = new Date().toISOString().slice(0, 10) + '.' + Date.now().toString(36);
    const blob = new Blob([JSON.stringify(cat, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'catalogus.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    if (zonderServer) markeer(false);
  });
  $('#btn-json-in').addEventListener('click', () => $('#json-bestand').click());
  $('#json-bestand').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.evls)) throw new Error('Geen geldige catalogus (evls ontbreekt)');
      cat = S.normaliseerCatalogus(data);
      gekozen = null;
      markeer(); vulInstellingen(); renderTabel(); renderEditor();
    } catch (e) { alert('Kon het bestand niet lezen: ' + e.message); }
  });
  // ---------- losse HTML-versie (zonder server) ----------
  // Het beheerbestand bevat de catalogus en een sjabloon van de studentpagina.
  // Met één klik maak je een nieuwe studieplanner.html met het aangepaste aanbod.
  function vervangCatalogus(html, json) {
    const veilig = json.replace(/</g, '\\u003c');
    return html.replace(/(<script type="application\/json" id="catalogus-data">)[\s\S]*?(<\/script>)/, (m, a, b) => a + veilig + b);
  }
  function download(naam, inhoud) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([inhoud], { type: 'text/html;charset=utf-8' }));
    a.download = naam;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function sjabloon() {
    const el = document.getElementById('planner-sjabloon');
    const bin = atob(el.textContent.trim());
    const u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return new TextDecoder().decode(u8);
  }
  function nieuweVersie() {
    const f = controleer();
    if (f) { alert(f); return null; }
    cat.versie = new Date().toISOString().slice(0, 10) + '.' + Date.now().toString(36);
    return JSON.stringify(cat);
  }
  $('#btn-html-student').addEventListener('click', () => {
    const json = nieuweVersie();
    if (!json) return;
    download('studieplanner.html', vervangCatalogus(sjabloon(), json));
    // het beheerbestand zelf ook bijwerken, anders ben je de wijzigingen kwijt
    download('studieplanner-beheer.html', vervangCatalogus(window.__BEHEER_BRON, json));
    markeer(false);
    $('#status').textContent = 'Beide bestanden gedownload. Vervang de oude versies.';
  });
  $('#btn-html-beheer').addEventListener('click', () => {
    const json = nieuweVersie();
    if (!json) return;
    download('studieplanner-beheer.html', vervangCatalogus(window.__BEHEER_BRON, json));
    markeer(false);
    $('#status').textContent = 'Beheerbestand gedownload. Vervang het oude bestand.';
  });
  if (S.ingebouwd() && document.getElementById('planner-sjabloon')) {
    document.addEventListener('DOMContentLoaded', async () => {
      zonderServer = true;
      $('#btn-opslaan').hidden = true;
      $('#btn-json-uit').hidden = true;
      $('#btn-html-beheer').hidden = false;
      $('#btn-html-student').hidden = false;
      await openBeheer();
      $('#status').textContent = 'Losse versie: wijzigingen bewaar je met de knoppen hiernaast';
    });
  }

  window.addEventListener('beforeunload', (ev) => { if (gewijzigd) { ev.preventDefault(); ev.returnValue = ''; } });
})();
