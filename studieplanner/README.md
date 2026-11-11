# Studieplanner – persoonlijk studieprogramma (Fontys)

Een webapp waarmee een student, samen met de studiecoach, het eigen studieprogramma samenstelt uit **Eenheden van Leeruitkomsten (EvL's)** voor de hele duur van de studie.

- EvL's van **15 EC (10 weken, 1 periode)** en **30 EC (20 weken, 2 periodes)**.
- Per EvL stel je in **beheer** in wanneer hij kan starten, per leerweg: **fysiek** en/of **leerwegonafhankelijk (LWO)**.
- De student kan alleen kiezen wat op dat moment wordt aangeboden. Wordt een EvL fysiek niet aangeboden maar wel LWO, dan kan de student LWO kiezen.
- **Er wordt niets over studenten opgeslagen.** Het plan wordt bewaard als PDF, dat de app later weer kan inlezen.

## Pagina's

| Adres | Voor wie | Wat |
|---|---|---|
| `/` | student + studiecoach | Plan opbouwen, PDF opslaan, PDF inlezen |
| `/beheer` | opleiding | EvL's, aanbod per leerweg, contactpersonen en instellingen (met pincode) |

## Werken met de planner (student)

1. Vul naam, studentnummer, studiecoach en het **startmoment** van je studie in (schooljaar + periode, dus ook februari-instroom).
2. **Inplannen**: sleep een EvL uit de lijst naar een periode. Of tik op een EvL en daarna op een periode (werkt ook op telefoon/tablet). Of tik op een lege periode: dan zie je welke EvL's je daar kunt starten, per leerweg.
   - Groen = fysiek mogelijk, blauw = alleen leerwegonafhankelijk, grijs/doorzichtig = niet mogelijk.
   - Een EvL van 30 EC beslaat 2 periodes. Bij start in P4 loopt hij door in P1 van het volgende jaar.
3. **Schuiven**: sleep een blok naar een andere periode, of tik op het blok en kies *Verplaatsen*. Terugslepen naar de lijst = verwijderen.
4. **Al bezig met de studie (instappen)**: periodes die voorbij zijn, zijn grijs. Zet daar de EvL's die je al gevolgd hebt en kies *Behaald* of *Niet behaald*. Een niet-behaalde EvL kun je opnieuw inplannen. Vrijstellingen sleep je naar *Vrijstellingen / elders behaald*.
5. Onder **Overzicht** staan de EC-tellers en aandachtspunten: verplichte EvL's die nog ontbreken, voorwaarden ("eerst nodig") en blokken die niet (meer) worden aangeboden.
6. **Opslaan als PDF**: je krijgt een PDF met het overzicht per schooljaar, alle gekozen EvL's met **contactpersonen** voor inhoudelijke vragen, de aandachtspunten en de afspraken met je studiecoach.
7. **PDF inlezen**: kies het PDF (of sleep het op de pagina), dan wordt het plan weer opgebouwd. Is het aanbod sindsdien gewijzigd, dan ziet de student meteen welke blokken verplaatst moeten worden.

### Hoe het PDF ingelezen kan worden

De keuzes worden, gecodeerd, in de documenteigenschappen van het PDF gezet (veld *Trefwoorden*, begint met `STUDIEPLAN1:`). Bij het inlezen haalt de app ze daar weer uit. Dat gebeurt volledig in de browser. Gebruik het originele PDF: een PDF dat opnieuw is opgeslagen of "afgedrukt als PDF" verliest deze gegevens meestal.

## Beheer

Ga naar `/beheer` en log in met de pincode (`ADMIN_PIN`).

- **EvL's**: code, naam, omvang (15/30 EC), categorie/fase (bepaalt de groepering en kleur), verplicht ja/nee, beschrijving, één of meer **contactpersonen**, en eventueel voorwaarden (*eerst nodig*).
- **Aanbod per leerweg** (fysiek en LWO apart):
  - *Niet aangeboden*
  - *Doorlopend*: start in elke periode
  - *Elk schooljaar in vaste periodes*, bijvoorbeeld P1 en P3
  - *Specifieke startmomenten per schooljaar*: een raster van schooljaar × periode, voor aanbod dat per jaar verschilt. Met *Vul met vaste periodes* zet je snel een patroon neer en pas je daarna uitzonderingen aan.
- **Aanbodoverzicht**: alle EvL's × alle periodes in één tabel (F / L / F+L).
- **Instellingen**: opleiding, totaal EC (standaard 240), de schooljaren waarvoor aanbod geldt, en de startdatum van elke periode. Daarmee bepaalt de app welke periodes voorbij zijn.

**Opslaan** schrijft de catalogus naar `data/catalogus.json`, en de vorige versie gaat naar `data/backups/` (de laatste 50 blijven bewaard). Studenten zien de wijziging direct na het herladen van de pagina.

Verwijder je een EvL of verander je het aanbod, dan blijven oude PDF's gewoon inleesbaar. De student krijgt een melding bij de blokken die niet meer kloppen.

## Starten

Je hebt Node.js 18 of nieuwer nodig, verder niets (geen dependencies).

```bash
cd studieplanner
ADMIN_PIN=4821 PORT=3000 node server.js
```

Zolang er in beheer nog niets is opgeslagen, gebruikt de app de voorbeeldcatalogus in `public/catalogus.json`. Vervang de voorbeeld-EvL's in beheer door het echte aanbod.

Gebruik HTTPS als je de app online zet (bijvoorbeeld achter de webserver of reverse proxy van de opleiding).

### Zonder server (statische hosting)

De studentpagina werkt ook als gewone statische website: zet de map `public/` op een webserver. Beheer gaat dan via `/beheer.html` → *Werk zonder server*. Je past de catalogus aan, klikt op **Download JSON** en vervangt daarmee `public/catalogus.json` op de webserver.

## Privacy

- De server heeft **geen** endpoint dat studentgegevens ontvangt. Naam, studentnummer en keuzes blijven in de browser en komen alleen in het PDF van de student.
- Er worden geen cookies gebruikt, en ook geen localStorage of analytics. Sluit je de pagina zonder PDF, dan is het plan weg (de browser waarschuwt daarvoor).
- De PDF-bibliotheken (jsPDF, jsPDF-AutoTable, MIT-licentie) staan lokaal in `public/vendor/`. Er gaat dus niets naar een CDN.

## Bestanden

```
studieplanner/
  server.js              kleine server: pagina's, catalogus, beheer-API (pincode)
  public/
    index.html, planner.js   studentpagina
    pdf.js                   PDF maken
    beheer.html, beheer.js   beheerpagina
    common.js                gedeelde logica (periodes, aanbod, PDF-codering)
    catalogus.json           voorbeeldcatalogus
    vendor/                  jsPDF + AutoTable
  data/                  (niet in git) opgeslagen catalogus + back-ups
```
