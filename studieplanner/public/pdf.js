// Maakt het PDF van het studieplan, volledig in de browser (jsPDF + AutoTable).
// De plan-gegevens worden ook (gecodeerd) in de documenteigenschappen gezet,
// zodat de app het PDF later weer kan inlezen.
'use strict';

const StudiePdf = (() => {
  const S = SP;
  // Fontys huisstijlkleuren (RGB) en hun officiële gradaties.
  const PAARS = [102, 51, 102];       // #663366
  const MAGENTA = [229, 0, 125];      // #e5007d
  const ORANJE = [238, 116, 37];      // #ee7425
  const GRIJS_LIJN = [204, 204, 204]; // zwart 20%
  const KLEUR_STATUS = {
    behaald: [214, 235, 214],      // groen 20%
    vrijstelling: [214, 235, 214],
    bezig: [255, 235, 204],        // lichtoranje 20%
    gepland: [224, 214, 224],      // paars 20%
    'niet-behaald': [204, 204, 204], // zwart 20%
  };

  function datumNL(d = new Date()) {
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function maak(api) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF-bibliotheek niet geladen');
    const { state } = api;
    const cat = state.cat, plan = state.plan;
    const data = api.exportData();
    const { t, meldingen } = api.overzicht();

    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const tabel = (o) => (typeof window.autoTable === 'function' ? window.autoTable(doc, o) : doc.autoTable(o));
    const W = doc.internal.pageSize.getWidth();
    const M = 12;

    // ---- kop ----
    doc.setFillColor(...PAARS);
    doc.rect(0, 0, W, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Studieplan', M, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${cat.instituut} · ${cat.opleiding}`, M, 16.5);
    const opgeslagen = new Date(data.gemaakt);
    const tijd = opgeslagen.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    doc.setFont('helvetica', 'bold');
    doc.text(`Opgeslagen op ${datumNL(opgeslagen)} om ${tijd}`, W - M, 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    const eerste = data.eersteVersie && data.eersteVersie !== data.gemaakt ? `Eerste versie: ${datumNL(new Date(data.eersteVersie))} · ` : '';
    doc.text(`${eerste}Aanbod versie: ${cat.versie || '-'}`, W - M, 16.5, { align: 'right' });

    doc.setTextColor(51, 51, 51);
    const st = plan.student;
    const regels = [
      ['Student', st.naam || '-'], ['Studentnummer', st.nummer || '-'], ['Studiecoach nu', api.coachVoor(Math.max(plan.startJaar, S.jaarVan(state.nu))).naam || '-'],
      ['Instroom', `${S.momentLabel(api.hStart())} (${S.startTekst(cat, api.hStart())})`],
      ['Traject', `${api.TRAJECTEN[st.traject] || 'Voltijd'} · EC-doel: ${api.doelEC() ? api.doelEC() + ' EC' : 'geen vast doel'}`],
      ['EC', `${t.totaal}${api.doelEC() ? ' van ' + api.doelEC() : ''} in plan (behaald ${t.behaald}, vrijstelling ${t.vrijstelling}, loopt ${t.bezig}, gepland ${t.gepland})`],
    ];
    let y = 30;
    doc.setFontSize(10);
    regels.forEach(([k, v], idx) => {
      // de EC-regel is lang en krijgt een eigen regel
      const x = k === 'EC' ? M : M + (idx % 3) * 80;
      const yy = k === 'EC' ? y + 12 : y + Math.floor(idx / 3) * 6;
      doc.setFont('helvetica', 'bold'); doc.text(k + ':', x, yy);
      const bw = doc.getTextWidth(k + ':');
      doc.setFont('helvetica', 'normal'); doc.text(String(v), x + bw + 2, yy);
    });
    y += 18;

    // ---- overzicht per schooljaar ----
    // EvL's die tegelijk lopen staan onder elkaar (één tabelrij per baan).
    const h0 = api.hStart(), h1 = api.hEind();
    const bereik = (begin, eind) => (S.datumsVoorlopig(cat, S.jaarVan(begin))
      ? `± ${S.maandKort(S.periodeStart(cat, begin))} – ${S.maandKort(S.periodeEind(cat, eind))} (datum volgt)`
      : `${S.datumKort(S.periodeStart(cat, begin))} – ${S.datumKort(S.periodeEind(cat, eind))}`);
    const GRIJS = [102, 102, 102]; // zwart 60%
    const body = [];
    const rijJaar = []; // tabelrij -> schooljaar (voor de vandaag-lijn)
    for (let j = S.jaarVan(h0); j <= S.jaarVan(h1); j++) {
      const { segs, banen } = api.rijIndeling(j);
      for (let L = 0; L < banen; L++) {
        const rij = [];
        if (L === 0) rij.push({ content: `${S.jaarLabel(j)}\nstudiejaar ${j - S.jaarVan(h0) + 1}${api.coachVoor(j).naam ? '\ncoach: ' + api.coachVoor(j).naam : ''}${S.datumsVoorlopig(cat, j) ? '\ndatums volgen' : ''}`, rowSpan: banen, styles: { fontStyle: 'bold' } });
        for (let p = 1; p <= S.PER; p++) {
          const i = S.abs(j, p);
          const g = segs.find((x) => x.baan === L && x.s <= i && i <= x.eind);
          if (g) {
            if (i !== g.s) continue; // valt onder colSpan
            const b = g.b, e = api.blokEvl(b);
            const fout = api.blokMeldingen(b).some((m) => m.niveau === 'fout');
            const vb = b.status === 'gepland' && S.onderVoorbehoud(e, b.start);
            const druk = b.status !== 'behaald' && b.status !== 'niet-behaald' && [...Array(g.eind - g.s + 1).keys()].some((k) => api.blokkenIn(g.s + k).length > 1);
            rij.push({
              content: `${bereik(g.s, g.eind)}\n${e.code ? e.code + ' ' : ''}${e.naam}${g.vervolg ? ' (vervolg)' : ''}\n${e.ec} EC · ${S.leerwegNaam(b.leerweg)} · ${S.STATUS[b.status] || b.status}${vb ? ' · onder voorbehoud' : ''}${druk ? ' · tegelijk met andere EvL' : ''}${fout ? ' · LET OP' : ''}`,
              colSpan: g.eind - g.s + 1,
              styles: { fillColor: fout ? [250, 204, 229] : KLEUR_STATUS[b.status] || [255, 255, 255], lineColor: druk ? ORANJE : GRIJS_LIJN },
            });
          } else if (i < h0) {
            rij.push({ content: L === 0 ? `${S.periodeDatums(cat, i)}\nvóór instroom` : '', styles: { fillColor: [255, 255, 255], textColor: [153, 153, 153] } });
          } else {
            rij.push({ content: L === 0 ? `${S.periodeDatums(cat, i)}${i === h0 ? '\ninstroom' : ''}` : '', styles: { textColor: GRIJS } });
          }
        }
        body.push(rij);
        rijJaar.push(j);
      }
    }
    const kolom = {}; // periode -> { x, w }
    const jaarY = {}; // schooljaar -> { y1, y2 }
    tabel({
      startY: y,
      head: [['Schooljaar', 'Periode 1', 'Periode 2', 'Periode 3', 'Periode 4']],
      body,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2, valign: 'middle', lineColor: GRIJS_LIJN, minCellHeight: 12 },
      headStyles: { fillColor: PAARS, textColor: 255, minCellHeight: 8 },
      columnStyles: (() => { const pw = (W - 2 * M - 28) / 4; return { 0: { cellWidth: 28 }, 1: { cellWidth: pw }, 2: { cellWidth: pw }, 3: { cellWidth: pw }, 4: { cellWidth: pw } }; })(),
      margin: { left: M, right: M },
      didDrawCell: (d) => {
        if (d.section === 'head' && d.column.index > 0) kolom[d.column.index] = { x: d.cell.x, w: d.cell.width };
        if (d.section === 'body') {
          const j = rijJaar[d.row.index];
          const r = jaarY[j] || (jaarY[j] = { y1: Infinity, y2: -Infinity, pagina: doc.internal.getCurrentPageInfo().pageNumber });
          r.y1 = Math.min(r.y1, d.cell.y); r.y2 = Math.max(r.y2, d.cell.y + d.cell.height);
        }
      },
    });
    // Rode lijn op de datum van opslaan ('vandaag'), zodat de coach ziet waar de student toen stond.
    const vp = api.vandaagPositie();
    if (vp && kolom[S.periodeVan(vp.i)] && jaarY[S.jaarVan(vp.i)]) {
      const k = kolom[S.periodeVan(vp.i)], r = jaarY[S.jaarVan(vp.i)];
      const x = k.x + k.w * vp.frac;
      const huidig = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setPage(r.pagina);
      doc.setDrawColor(...MAGENTA); doc.setLineWidth(0.6);
      doc.line(x, r.y1 - 1, x, r.y2 + 1);
      const label = `opgeslagen ${S.datumKort(S.iso(opgeslagen))}`;
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
      const lw = doc.getTextWidth(label) + 3;
      doc.setFillColor(...MAGENTA); doc.roundedRect(x - lw / 2, r.y1 - 4, lw, 3.6, 1.2, 1.2, 'F');
      doc.setTextColor(255, 255, 255); doc.text(label, x, r.y1 - 1.3, { align: 'center' });
      doc.setTextColor(51, 51, 51); doc.setLineWidth(0.2);
      doc.setPage(huidig);
    }

    // ---- EvL's met contactpersonen ----
    const volgorde = [...plan.blokken].sort((a, b) => (a.start == null ? -1 : a.start) - (b.start == null ? -1 : b.start));
    const rijen = volgorde.map((b) => {
      const e = api.blokEvl(b);
      const wanneer = b.start == null ? 'Vrijstelling' : S.momentLabel(b.start) + (api.blokDuur(b) > 1 ? ' t/m ' + S.momentLabel(api.blokEind(b)) : '')
        + `\n${S.startTekst(cat, b.start)} – ${S.eindTekst(cat, api.blokEind(b))}`
        + (b.status === 'gepland' && S.onderVoorbehoud(e, b.start) ? '\nonder voorbehoud' : '');
      const contacten = (e.contacten || []).map((c) => [c.naam, c.email].filter(Boolean).join(' – ')).join('\n') || '-';
      const lt = S.looptijdTekst(e);
      return [e.code || '', e.naam + (lt ? `\n(looptijd ${lt})` : ''), String(e.ec), wanneer, b.start == null ? '-' : S.leerwegNaam(b.leerweg), S.STATUS[b.status] || b.status, contacten];
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    let y2 = doc.lastAutoTable.finalY + 10;
    if (y2 > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y2 = 16; }
    doc.text('EvL\'s in dit plan en contactpersonen voor inhoudelijke vragen', M, y2);
    tabel({
      startY: y2 + 3,
      head: [['Code', 'Eenheid van Leeruitkomsten', 'EC', 'Wanneer', 'Leerweg', 'Status', 'Contactpersoon / -personen']],
      body: rijen.length ? rijen : [['', 'Nog geen EvL\'s gekozen', '', '', '', '', '']],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { fillColor: PAARS, textColor: 255 },
      columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 10 }, 3: { cellWidth: 46 }, 4: { cellWidth: 34 }, 5: { cellWidth: 22 }, 6: { cellWidth: 75 } },
      margin: { left: M, right: M },
    });

    // ---- aandachtspunten en afspraken ----
    const punten = meldingen.map((m) => [m.niveau === 'fout' ? 'Moet aangepast' : m.niveau === 'let' ? 'Let op' : m.niveau === 'ok' ? 'In orde' : 'Info', m.t]);
    let y3 = doc.lastAutoTable.finalY + 10;
    if (y3 > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y3 = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(51, 51, 51);
    doc.text('Aandachtspunten', M, y3);
    tabel({
      startY: y3 + 2,
      body: punten,
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold' } },
      margin: { left: M, right: M },
    });
    if ((st.opmerkingen || '').trim()) {
      tabel({
        startY: doc.lastAutoTable.finalY + 6,
        head: [['Afspraken / opmerkingen']],
        body: [[st.opmerkingen.trim()]],
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 1.5 },
        headStyles: { fontStyle: 'bold', fontSize: 11 },
        margin: { left: M, right: M },
      });
    }

    // ---- voettekst ----
    const n = doc.getNumberOfPages();
    const H = doc.internal.pageSize.getHeight();
    for (let k = 1; k <= n; k++) {
      doc.setPage(k);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(102, 102, 102);
      doc.text('De studieplanner bewaart zelf geen gegevens. Bewaar dit PDF en lees het in met "PDF inlezen" om je plan later verder aan te passen.', M, H - 6);
      doc.text(`Pagina ${k} van ${n}`, W - M, H - 6, { align: 'right' });
    }

    doc.setDocumentProperties({
      title: `Studieplan ${st.naam || ''}`.trim(),
      subject: `Studieplan ${cat.opleiding}`,
      author: st.naam || '',
      creator: 'Studieplanner',
      keywords: S.encodePlan(data),
    });

    const naam = (st.naam || 'student').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`studieplan-${naam || 'student'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    return data;
  }

  return { maak };
})();
