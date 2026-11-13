# MeteoConsenso

Previsioni meteo di maggioranza: l'app confronta 12 modelli meteorologici (ItaliaMeteo, MeteoSvizzera, ECMWF, DWD, Météo-France, UK Met Office, NOAA, GEM, JMA, CMA, BOM) e costruisce la previsione su ciò che dice la maggioranza, fino a 15 giorni.

- Dati selezionabili: meteo, pressione, vento, pioggia, nuvole, UV, mari, laghi, pollini, polveri sottili
- Luoghi con memoria (preferiti e recenti), ricerca in Italia o nel mondo, GPS
- Widget grande per la Home: `widget/` (installabile come icona separata "Meteo W")
- Funziona offline con le ultime previsioni salvate
- Sistema di aggiornamento: a ogni rilascio aumentare il numero in `version.json` e in `data-version` di `index.html` e `widget/index.html`

Dati: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0), Copernicus CAMS.
