=== Fontys Studieplanner ===
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Laat studenten samen met hun studiecoach een persoonlijk studieprogramma samenstellen uit Eenheden van Leeruitkomsten (EvL's).

== Description ==

* De student sleept of kiest EvL's (15 EC / 10 weken of 30 EC / 20 weken) in de periodes van elk schooljaar.
* De planner laat alleen zien wat in een periode wordt aangeboden, per leerweg: fysiek of leerwegonafhankelijk.
* Ingangs- en sluitingsdatums (in- en uitfaseren) worden meegenomen, net als aanbod dat nog niet vaststaat ("onder voorbehoud").
* Een student kan tussentijds instromen. Een student die al bezig is, vult eerst in wat hij al gevolgd heeft.
* Meerdere EvL's tegelijk kan, met een melding over extra studiedruk.
* Per student een traject (voltijd, deeltijd, maatwerk, losse modules), een eigen EC-doel en een studiecoach per schooljaar.
* **Er worden geen studentgegevens opgeslagen.** Met "Opslaan als PDF" bewaart de student zijn plan zelf. Hetzelfde PDF kan later weer worden ingelezen om verder te plannen.
* Het PDF bevat de contactpersonen per EvL en de datum en tijd van opslaan.

== Installation ==

1. Ga in het dashboard naar Plugins > Nieuwe plugin > Plugin uploaden en kies fontys-studieplanner.zip.
2. Activeer de plugin.
3. Ga naar het menu **Studieplanner** en vervang het voorbeeldaanbod door het echte aanbod. Klik op **Opslaan**.
4. Maak een pagina met de shortcode `[studieplanner]`, bijvoorbeeld in een Shortcode-blok.

== Frequently Asked Questions ==

= Wie mag het aanbod beheren? =

Standaard gebruikers met de rechten `manage_options` (beheerders). Aan te passen met een filter:

`add_filter( 'fontys_studieplanner_capability', function () { return 'edit_pages'; } );`

= Wat slaat de plugin op? =

Alleen het aanbod (de catalogus) en de laatste 20 vorige versies daarvan, in de WordPress-opties. Bij het verwijderen van de plugin worden die ook verwijderd.

= Werkt het als de site een cache gebruikt? =

Ja. De planner draait volledig in de browser van de student. Na het opslaan van het aanbod moet de cache van de pagina met de planner wel worden geleegd.

== Changelog ==

= 1.0.0 =
* Eerste versie.

== Third party ==

Bevat jsPDF 4.2.1 en jsPDF-AutoTable 5.0.9 (MIT-licentie) voor het maken van PDF's in de browser.
