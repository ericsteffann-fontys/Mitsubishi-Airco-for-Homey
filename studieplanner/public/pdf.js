// Maakt het PDF van het studieplan, volledig in de browser (jsPDF + AutoTable).
// De plan-gegevens worden ook (gecodeerd) in de documenteigenschappen gezet,
// zodat de app het PDF later weer kan inlezen.
'use strict';

const StudiePdf = (() => {
  const S = SP;
  const PAARS = [102, 51, 153];
  const KLEUR_STATUS = {
    behaald: [220, 252, 231],
    vrijstelling: [220, 252, 231],
    bezig: [254, 243, 199],
    gepland: [241, 234, 248],
    'niet-behaald': [235, 235, 235],
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
    doc.text(`Gemaakt op ${datumNL()}`, W - M, 10, { align: 'right' });
    doc.text(`Aanbod (catalogus) versie: ${cat.versie || '-'}`, W - M, 16.5, { align: 'right' });

    doc.setTextColor(30, 27, 34);
    const st = plan.student;
    const regels = [
      ['Student', st.naam || '-'], ['Studentnummer', st.nummer || '-'], ['Studiecoach', st.coach || '-'],
      ['Start studie', S.momentLabel(api.hStart())],
      ['EC', `${t.totaal} van ${cat.totaalEC} in plan (behaald ${t.behaald}, vrijstelling ${t.vrijstelling}, loopt ${t.bezig}, gepland ${t.gepland})`],
    ];
    let y = 30;
    doc.setFontSize(10);
    regels.forEach(([k, v], idx) => {
      const x = idx < 3 ? M + idx * 80 : M + (idx - 3) * 80;
      const yy = idx < 3 ? y : y + 6;
      doc.setFont('helvetica', 'bold'); doc.text(k + ':', x, yy);
      const bw = doc.getTextWidth(k + ':');
      doc.setFont('helvetica', 'normal'); doc.text(String(v), x + bw + 2, yy);
    });
    y += 12;

    // ---- overzicht per schooljaar ----
    const h0 = api.hStart(), h1 = api.hEind();
    const body = [];
    for (let j = S.jaarVan(h0); j <= S.jaarVan(h1); j++) {
      const rij = [{ content: `${S.jaarLabel(j)}\nstudiejaar ${j - S.jaarVan(h0) + 1}`, styles: { fontStyle: 'bold' } }];
      for (let p = 1; p <= S.PER; p++) {
        const i = S.abs(j, p);
        if (i < h0 || i > h1) { rij.push({ content: '', styles: { fillColor: [243, 242, 245] } }); continue; }
        const b = plan.blokken.find((x) => x.start != null && i >= x.start && i <= api.blokEind(x));
        if (!b) { rij.push({ content: '' }); continue; }
        const begin = Math.max(b.start, S.abs(j, 1));
        if (i !== begin) continue; // valt onder colSpan
        const eind = Math.min(api.blokEind(b), S.abs(j, S.PER));
        const e = api.blokEvl(b);
        const fout = api.blokMeldingen(b).some((m) => m.niveau === 'fout');
        const vervolg = begin !== b.start;
        rij.push({
          content: `${e.code ? e.code + ' ' : ''}${e.naam}${vervolg ? ' (vervolg)' : ''}\n${e.ec} EC · ${S.leerwegNaam(b.leerweg)} · ${S.STATUS[b.status] || b.status}${fout ? ' · LET OP' : ''}`,
          colSpan: eind - begin + 1,
          styles: { fillColor: fout ? [254, 226, 226] : KLEUR_STATUS[b.status] || [255, 255, 255] },
        });
      }
      body.push(rij);
    }
    tabel({
      startY: y,
      head: [['Schooljaar', 'Periode 1', 'Periode 2', 'Periode 3', 'Periode 4']],
      body,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2, valign: 'middle', lineColor: [210, 205, 218], minCellHeight: 12 },
      headStyles: { fillColor: PAARS, textColor: 255 },
      columnStyles: (() => { const pw = (W - 2 * M - 28) / 4; return { 0: { cellWidth: 28 }, 1: { cellWidth: pw }, 2: { cellWidth: pw }, 3: { cellWidth: pw }, 4: { cellWidth: pw } }; })(),
      margin: { left: M, right: M },
    });

    // ---- EvL's met contactpersonen ----
    const volgorde = [...plan.blokken].sort((a, b) => (a.start == null ? -1 : a.start) - (b.start == null ? -1 : b.start));
    const rijen = volgorde.map((b) => {
      const e = api.blokEvl(b);
      const wanneer = b.start == null ? 'Vrijstelling' : S.momentLabel(b.start) + (api.blokDuur(b) > 1 ? ' t/m ' + S.momentLabel(api.blokEind(b)) : '');
      const contacten = (e.contacten || []).map((c) => [c.naam, c.email].filter(Boolean).join(' – ')).join('\n') || '-';
      return [e.code || '', e.naam, String(e.ec), wanneer, b.start == null ? '-' : S.leerwegNaam(b.leerweg), S.STATUS[b.status] || b.status, contacten];
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
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30, 27, 34);
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
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(98, 93, 107);
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
    return doc;
  }

  return { maak };
})();
