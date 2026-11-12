# Studieplanner – persoonlijk studieprogramma (Fontys)

Een webapp waarmee een student, samen met de studiecoach, het eigen studieprogramma samenstelt uit **Eenheden van Leeruitkomsten (EvL's)** voor de hele duur van de studie.

- Elk schooljaar heeft **4 periodes van 10 weken** tussen september en juli (start rond september, november, februari en april). De datums staan in het rooster.
- EvL's van **15 EC (10 weken, 1 periode)** en **30 EC (20 weken, 2 periodes)**. Een 30 EC-blok is ook visueel twee keer zo groot: in de lijst, tijdens het slepen en in het rooster.
- Een student kan **meerdere EvL's tegelijk** volgen. Dat is toegestaan, maar de app meldt dat het extra studiedruk kan geven. De student hoeft niets te bevestigen.
- EvL's kunnen worden **ingefaseerd** (ingangsdatum) en **uitgefaseerd** (sluitingsdatum). Een student kan een EvL alleen plaatsen binnen die looptijd.
- Per EvL stel je in **beheer** in wanneer hij kan starten, per leerweg: **fysiek** en/of **leerwegonafhankelijk (LWO)**.
- De student kan alleen kiezen wat op dat moment wordt aangeboden. Wordt een EvL fysiek niet aangeboden maar wel LWO, dan kan de student LWO kiezen.
- **Er wordt niets over studenten opgeslagen.** Het plan wordt bewaard als PDF, dat de app later weer kan inlezen.

## Pagina's

| Adres | Voor wie | Wat |
|---|---|---|
| `/` | student + studiecoach | Plan opbouwen, PDF opslaan, PDF inlezen |
| `/beheer` | opleiding | EvL's, aanbod per leerweg, contactpersonen en instellingen (met pincode) |

## Werken met de planner (student)

1. Vul naam, studentnummer, **traject** (voltijd, deeltijd, maatwerk/verkort, losse modules) en je eigen **EC-doel** in. Het EC-doel verschilt per student. Voltijd en deeltijd beginnen met het standaarddoel van de opleiding, bij losse modules mag het leeg blijven (geen vast doel). Vul de **studiecoach per schooljaar** in: een jaar zonder naam neemt de coach van het jaar ervoor over. Kies daarna je **instroommoment**: schooljaar + periode (met startdatum). Tussentijds instromen kan dus in elke periode. Periodes vóór je instroom zijn gearceerd.
2. **Inplannen**: sleep een EvL uit de lijst naar een periode. Of tik op een EvL en daarna op een periode (werkt ook op telefoon/tablet). Of tik op een lege periode: dan zie je welke EvL's je daar kunt starten, per leerweg.
   - Groen = fysiek mogelijk, blauw = alleen leerwegonafhankelijk, grijs/doorzichtig = niet mogelijk.
   - Een EvL van 30 EC beslaat 2 periodes en start altijd in **P1** (loopt door in P2) of **P3** (loopt door in P4). Hij loopt dus nooit over een schooljaar heen.
3. **Schuiven**: sleep een blok naar een andere periode, of tik op het blok en kies *Verplaatsen*. Terugslepen naar de lijst = verwijderen.
4. **Al bezig met de studie (instappen)**: periodes die voorbij zijn, zijn grijs. Zet daar de EvL's die je al gevolgd hebt en kies *Behaald* of *Niet behaald*. Een niet-behaalde EvL kun je opnieuw inplannen. Vrijstellingen sleep je naar *Vrijstellingen / elders behaald*.
5. Een **rode lijn** in het rooster laat zien waar je vandaag staat. Volg je in een periode meer dan één EvL, dan staan de blokken onder elkaar en wordt de periode oranje gemarkeerd (*extra studiedruk*). Een EvL met *onder voorbehoud* kan nog wijzigen: het is nog niet bekend of en wanneer hij dan gegeven wordt. "Datum volgt" betekent dat de periodedatums van dat schooljaar nog niet vaststaan.
6. Het rooster toont 4 periodes per schooljaar. Met **+ Schooljaar toevoegen** breid je het uit naar volgende schooljaren (bijvoorbeeld bij uitloop). Met *Laatste schooljaar weghalen* haal je een leeg jaar weer weg.
7. Onder **Overzicht** staan de EC-tellers en aandachtspunten: verplichte EvL's die nog ontbreken, voorwaarden ("eerst nodig") en blokken die niet (meer) worden aangeboden.
8. **Opslaan als PDF**: je krijgt een PDF met het overzicht per schooljaar, alle gekozen EvL's met **contactpersonen** voor inhoudelijke vragen, de aandachtspunten en de afspraken met je studiecoach. Bovenaan staan **datum en tijd van opslaan** (en de datum van de eerste versie), en een rode lijn in het overzicht markeert de opslagdatum. Zo ziet de studiecoach hoe oud de planning is.
9. **PDF inlezen**: kies het PDF (of sleep het op de pagina), dan wordt het plan weer opgebouwd. Is het aanbod sindsdien gewijzigd, dan ziet de student meteen welke blokken verplaatst moeten worden. De app toont wanneer het plan is opgeslagen ("… dagen geleden"). Is het plan ouder dan 90 dagen, dan volgt een melding om te bespreken of het herzien moet worden.

### Hoe het PDF ingelezen kan worden

De keuzes worden, gecodeerd, in de documenteigenschappen van het PDF gezet (veld *Trefwoorden*, begint met `STUDIEPLAN1:`). Bij het inlezen haalt de app ze daar weer uit. Dat gebeurt volledig in de browser. Gebruik het originele PDF: een PDF dat opnieuw is opgeslagen of "afgedrukt als PDF" verliest deze gegevens meestal.

## Beheer

Ga naar `/beheer` en log in met de pincode (`ADMIN_PIN`).

- **In- en uitfaseren**: per EvL een *ingangsdatum* en een *sluitingsdatum* (beide optioneel). Een student kan een EvL alleen plaatsen als hij op of na de ingangsdatum start en op of vóór de sluitingsdatum helemaal is afgerond. Bij 30 EC telt de tweede periode dus mee (een EvL van 30 EC start altijd in P1 of P3). Dat geldt ook voor eerder gevolgde EvL's: een EvL die toen nog niet bestond, kan daar niet staan. In de lijst ziet de student labels als *nieuw vanaf …*, *t/m …* en *uitgefaseerd*. Staat een uitgefaseerde EvL in een bestaand PDF op een moment dat niet meer kan, dan krijgt de student bij het inlezen een melding.
- **EvL's**: code, naam, omvang (15/30 EC), categorie/fase (bepaalt de groepering en kleur), verplicht ja/nee, beschrijving, één of meer **contactpersonen**, en eventueel voorwaarden (*eerst nodig*).
- **Aanbod per leerweg** (fysiek en LWO apart):
  - *Niet aangeboden*
  - *Doorlopend*: start in elke periode
  - *Elk schooljaar in vaste periodes*, bijvoorbeeld P1 en P3
  - *Specifieke startmomenten per schooljaar*: een raster van schooljaar × periode, voor aanbod dat per jaar verschilt. Met *Vul met vaste periodes* zet je snel een patroon neer en pas je daarna uitzonderingen aan.
- **Aanbod nog niet bekend**: vink per EvL de schooljaren aan waarin nog niet vaststaat óf en wanneer hij gegeven wordt. Studenten kunnen hem daar in elke periode inplannen (met de leerwegen die de EvL heeft), maar het blok staat *onder voorbehoud*. In het aanbodoverzicht staat zo'n periode als **?**.
- **Aanbodoverzicht**: alle EvL's × alle periodes in één tabel (F / L / F+L).
- **Instellingen**: opleiding, het standaard EC-doel voor voltijd/deeltijd (de student kan dit per persoon aanpassen), de schooljaren waarvoor aanbod geldt, en het datumpatroon: de startdatum van elke periode plus het einde van het schooljaar in juli. Wijkt een schooljaar af (de jaarplanning schuift elk jaar iets), pas dan de datums van dat jaar aan in *Datums per schooljaar*. Zijn de datums van een schooljaar nog niet bekend, vink dan *nog niet bekend* aan. Studenten zien dan "± sep – nov (datum volgt)", en de app rekent met het patroon als schatting. Een periode loopt tot de dag vóór de volgende. Deze datums bepalen welke periodes voorbij zijn en of een EvL binnen zijn looptijd valt.

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

### Als WordPress-plugin

`dist/fontys-studieplanner.zip` is een WordPress-plugin (WordPress 6.0+, PHP 7.4+).

1. Ga naar **Plugins > Nieuwe plugin > Plugin uploaden**, kies de zip en activeer de plugin.
2. Ga naar het menu **Studieplanner** in het dashboard. Daar staat dezelfde beheeromgeving als hierboven. **Opslaan** bewaart het aanbod in WordPress, en de vorige 20 versies blijven als back-up bewaard.
3. Zet de planner op een pagina met de shortcode `[studieplanner]`, bijvoorbeeld in een Shortcode-blok. De planner wordt standaard breder dan de tekstkolom van het thema, tot maximaal 1500 px. Met `[studieplanner breedte="normaal"]` blijft hij binnen de kolom.

Hoe de plugin werkt:
- **Rechten:** alleen gebruikers met `manage_options` (beheerders) kunnen het aanbod wijzigen. Aan te passen met het filter `fontys_studieplanner_capability`. Opslaan gaat via de WordPress REST API met een nonce. De invoer wordt gecontroleerd en opgeschoond.
- **Privacy:** de plugin slaat alleen het aanbod op. Studentgegevens komen niet op de server; het plan blijft een PDF bij de student.
- **Opmaak:** de stijlen zijn afgeschermd (`.sp-app`), zodat de planner en het thema elkaar zo min mogelijk beïnvloeden.
- **Verwijderen:** bij het verwijderen van de plugin worden het aanbod en de back-ups ook verwijderd.

De plugin opnieuw bouwen na een codewijziging: `node build-wordpress.js`. De PHP-bron staat in `wordpress/`.

### Als losse HTML-bestanden (geen server, geen installatie)

In `dist/` staan twee bestanden die je opent door erop te dubbelklikken:

| Bestand | Voor wie | Wat |
|---|---|---|
| `dist/studieplanner.html` | studenten en studiecoaches | De complete planner, met het aanbod erin. Delen via mail, Teams, Canvas of een gedeelde map. Werkt offline. |
| `dist/studieplanner-beheer.html` | opleiding | Aanbod aanpassen. Bewaar het bestand op een plek waar alleen beheerders bij kunnen. |

Aanbod wijzigen met de losse bestanden:
1. Open `studieplanner-beheer.html` en pas het aanbod aan.
2. Klik op **Download studieplanner.html**. Je krijgt een nieuwe `studieplanner.html` voor studenten en een bijgewerkt `studieplanner-beheer.html`, zodat je wijzigingen bewaard blijven.
3. Vervang de oude bestanden en verspreid de nieuwe `studieplanner.html`. PDF's die met een oudere versie zijn gemaakt, kun je gewoon inlezen. De student ziet dan wat er sinds die versie is veranderd.

*Bewaar beheerbestand* bewaart tussentijds alleen het beheerbestand, zonder een nieuwe studentversie te maken.

Na een wijziging in de code bouw je de bestanden opnieuw met `node build-html.js`. Het script neemt de catalogus uit `data/catalogus.json` (opgeslagen via de server) of anders uit `public/catalogus.json`.

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

## Huisstijl

Alle kleuren in de app en het PDF komen uit de Fontys-huisstijl (*Kleurcodes Fontys*):

- **Hoofdkleur:** paars `#663366`.
- **Accentkleuren:** magenta `#E5007D` (fouten, vandaag-lijn) en blauw `#0076E0` (leerwegonafhankelijk).
- **Secundaire kleuren:** groen `#339933` (behaald/fysiek), oranje `#EE7425` en lichtoranje `#FF9900` (aandachtspunten, extra studiedruk).
- **Overig:** de officiële gradaties (80/60/40/20%) en grijstinten.

In `public/style.css` staan ze als `--f-…`-variabelen bovenaan. In beheer kies je de kleur van een EvL alleen uit deze huisstijlkleuren. Lettertype: Roboto (met Arial als terugval).
