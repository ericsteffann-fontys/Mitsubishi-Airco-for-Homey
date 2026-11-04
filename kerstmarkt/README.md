# Kerstmarkt – bestelstatus voor potlood-badges

Een kleine webapp waarmee klanten een naam-badge (naam + kleur) bestellen en **live** volgen wanneer hij klaar ligt. Zo hoeven ze niet bij de kraam te wachten en kun je meerdere bestellingen tegelijk aannemen.

## Pagina's

| Adres | Voor wie | Wat |
|---|---|---|
| `/` | klant | Naam + kleur kiezen (met voorbeeld op een potlood), bestellen. Toont ook "Jouw bestellingen" op dit toestel. |
| `/b/CODE` | klant | Live status van één bestelling (ververst elke 5 s): betalen → in de rij → printen → klaar. Trilt en geeft een melding als hij klaar is. |
| `/kraam` | jij | Overzicht met kolommen per status, één knop per stap, zoeken op code/naam bij ophalen, bestelling aan de kraam toevoegen. Beveiligd met pincode. |

## Werkwijze op de markt

1. Hang een bordje met een QR-code naar je adres (bijv. `https://jouw-adres/`) op de kraam. Maak de QR met een gratis QR-generator.
2. De klant bestelt op de telefoon en krijgt een code (bijv. `C96GG`). Status: **Betalen bij de kraam**.
3. De klant betaalt bij jou, jij tikt op **Betaald**. Daarna staat de bestelling in de rij.
4. **Start print**, en daarna **Klaar**. De klant ziet het meteen op de telefoon.
5. De klant laat de code zien, jij zoekt hem op en tikt op **Opgehaald**.

Heeft iemand geen telefoon? Gebruik **＋ Bestelling aan de kraam**. Die bestelling telt meteen als betaald, en je geeft de klant de code op een briefje.

## Privacy / weinig inzicht in je aantallen

- Codes zijn willekeurig (geen oplopende nummers), dus niemand kan afleiden hoeveel bestellingen je hebt.
- Een klant ziet alleen de eigen bestelling: geen wachtrijpositie en geen totalen.
- Automatisch opruimen (in te stellen in `config.json`):
  - opgehaald → na 30 min weg
  - geannuleerd → na 15 min weg
  - niet betaald → na 45 min weg
  - na het weekend (`purgeEverythingAfter`) → alles weg

## Zaterdag niet klaar of niet opgehaald?

Op basis van de marktdagen in `config.json` laat de pagina vanzelf zien:
- tijdens zaterdag: "Lukt het niet? Je kunt hem ook zondag ophalen bij dezelfde kraam."
- na sluiting op zaterdag: "De kraam is nu dicht, je badge ligt zondag vanaf 11:00 klaar."
- op zondag: "Laatste marktdag, open tot …"

## Starten

Je hebt Node.js 18 of nieuwer nodig, verder niets (geen dependencies).

```bash
cd kerstmarkt
ADMIN_PIN=4821 PORT=3000 node server.js
```

Bestellingen worden bewaard in `data/orders.json`, zodat een herstart niets kwijtmaakt.

### Online zetten

De klant moet de pagina via mobiel internet kunnen bereiken. Een paar opties:
- **Render / Railway / Fly.io**: start command `node server.js`, en zet `ADMIN_PIN` als environment variable. Kies een vorm met een blijvende schijf, of accepteer dat de data bij een herstart verdwijnt (de markt duurt maar een weekend).
- **Eigen VPS of Raspberry Pi** thuis, met bijvoorbeeld een Cloudflare Tunnel voor HTTPS.

Gebruik HTTPS: meldingen op de telefoon werken alleen via HTTPS.

## Aanpassen

Alles staat in `config.json`: naam van de kraam, prijs, maximaal aantal tekens, de (max. 8) kleuren met hun kleurcode, de marktdagen en openingstijden, de tekst voor de ophaallocatie, en de opruimtijden. Met `"selfOrder": false` kunnen klanten niet zelf bestellen. Dan maak jij alle bestellingen aan via `/kraam`.
