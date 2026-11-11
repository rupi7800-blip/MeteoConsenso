/* =========================================================
   fonti.js — MeteoConsenso
   Scarica le previsioni da tutti i modelli meteorologici gratuiti
   (via Open-Meteo, senza chiave) e costruisce la previsione
   "di maggioranza": voto sul tipo di tempo, mediana dei valori,
   probabilità = quota di modelli che prevedono il fenomeno.
   ========================================================= */
(function () {
  'use strict';
  var MC = window.MC = window.MC || {};

  MC.MODELLI = [
    { id: 'italia_meteo_arpae_icon_2i', nome: 'ItaliaMeteo ICON-2I', ente: 'ItaliaMeteo / Arpae', paese: 'Italia', giorni: 3 },
    { id: 'meteoswiss_icon_seamless', nome: 'MeteoSvizzera ICON-CH', ente: 'MeteoSvizzera', paese: 'Svizzera', giorni: 5 },
    { id: 'ecmwf_ifs025', nome: 'ECMWF IFS', ente: 'Centro Europeo', paese: 'Europa', giorni: 15 },
    { id: 'ecmwf_aifs025_single', nome: 'ECMWF AIFS (IA)', ente: 'Centro Europeo', paese: 'Europa', giorni: 15 },
    { id: 'icon_seamless', nome: 'DWD ICON', ente: 'Deutscher Wetterdienst', paese: 'Germania', giorni: 7 },
    { id: 'meteofrance_seamless', nome: 'Météo-France ARPEGE/AROME', ente: 'Météo-France', paese: 'Francia', giorni: 4 },
    { id: 'ukmo_seamless', nome: 'UK Met Office', ente: 'Met Office', paese: 'Regno Unito', giorni: 7 },
    { id: 'gfs_seamless', nome: 'NOAA GFS', ente: 'NOAA', paese: 'USA', giorni: 16 },
    { id: 'gem_seamless', nome: 'GEM', ente: 'Environment Canada', paese: 'Canada', giorni: 10 },
    { id: 'jma_seamless', nome: 'JMA GSM', ente: 'Japan Meteorological Agency', paese: 'Giappone', giorni: 11 },
    { id: 'cma_grapes_global', nome: 'CMA GRAPES', ente: 'China Meteorological Adm.', paese: 'Cina', giorni: 10 },
    { id: 'bom_access_global', nome: 'BOM ACCESS-G', ente: 'Bureau of Meteorology', paese: 'Australia', giorni: 10 }
  ];

  var GIORNI = 15;
  var H_FULL = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility';
  var D_FULL = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset';
  var H_MIN = 'temperature_2m,precipitation,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
  var D_MIN = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset';

  /* ---------- utilità ---------- */
  function getJSON(url, ms) {
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms || 20000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (t) clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.error) { var e = new Error(j.reason || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  function q(o) { return Object.keys(o).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function vals(a) { return a.filter(function (v) { return typeof v === 'number' && isFinite(v); }); }
  function mediana(a) {
    var v = vals(a).sort(function (x, y) { return x - y; });
    if (!v.length) return null;
    var m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  function stat(a) {
    var v = vals(a);
    if (!v.length) return null;
    return { med: mediana(v), min: Math.min.apply(null, v), max: Math.max.apply(null, v), n: v.length };
  }
  function media(a) { var v = vals(a); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
  function direzioneMedia(dirs, pesi) {
    var x = 0, y = 0, ok = 0;
    dirs.forEach(function (d, i) {
      if (num(d) == null) return;
      var w = pesi && num(pesi[i]) != null ? Math.max(pesi[i], 0.1) : 1;
      x += Math.cos(d * Math.PI / 180) * w; y += Math.sin(d * Math.PI / 180) * w; ok++;
    });
    if (!ok) return null;
    var g = Math.atan2(y, x) * 180 / Math.PI;
    return (g + 360) % 360;
  }
  MC.util = { mediana: mediana, stat: stat, media: media, direzioneMedia: direzioneMedia, getJSON: getJSON };

  /* ---------- tipo di tempo ---------- */
  var BAGNATO = { pioggerella: 1, pioggia: 1, neve: 1, temporale: 1 };
  var ORDINE_SECCO = ['sereno', 'poco', 'parziale', 'coperto'];
  MC.TESTI = {
    sereno: 'Sereno', poco: 'Poco nuvoloso', parziale: 'Parzialmente nuvoloso', coperto: 'Coperto',
    nebbia: 'Nebbia', pioggerella: 'Pioggerella', pioggia: 'Pioggia', neve: 'Neve', temporale: 'Temporale'
  };
  function categoria(code) {
    if (num(code) == null) return null;
    if (code === 0) return 'sereno';
    if (code === 1) return 'poco';
    if (code === 2) return 'parziale';
    if (code === 3) return 'coperto';
    if (code === 45 || code === 48) return 'nebbia';
    if (code >= 51 && code <= 57) return 'pioggerella';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'pioggia';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neve';
    if (code >= 95) return 'temporale';
    return 'coperto';
  }
  MC.categoria = categoria;

  /* Voto a maggioranza in due fasi:
     1) asciutto o bagnato? vince la maggioranza dei modelli (pareggio: decide la pioggia mediana)
     2) dentro il gruppo vincente: per l'asciutto la nuvolosità mediana, per il bagnato il fenomeno più votato
        (il temporale vince se lo prevede almeno 1/3 dei modelli "bagnati" e almeno 2 modelli: prudenza) */
  function vota(cats, pioggiaMediana) {
    var v = cats.filter(Boolean);
    if (!v.length) return null;
    var cont = {};
    v.forEach(function (c) { cont[c] = (cont[c] || 0) + 1; });
    var wet = v.filter(function (c) { return BAGNATO[c]; });
    var dry = v.filter(function (c) { return !BAGNATO[c]; });
    var bagnato = wet.length * 2 > v.length || (wet.length * 2 === v.length && (pioggiaMediana || 0) >= 0.5);
    var cat, gruppo;
    if (bagnato) {
      gruppo = wet;
      var tst = cont.temporale || 0;
      if ((tst >= 2 && tst * 3 >= wet.length) || tst * 2 > wet.length) cat = 'temporale';
      else {
        var best = null, bn = -1;
        ['pioggia', 'neve', 'pioggerella', 'temporale'].forEach(function (c) { if ((cont[c] || 0) > bn) { bn = cont[c] || 0; best = c; } });
        cat = best;
      }
    } else {
      gruppo = dry;
      if ((cont.nebbia || 0) * 2 > dry.length) cat = 'nebbia';
      else {
        var idx = dry.map(function (c) { return c === 'nebbia' ? 3 : ORDINE_SECCO.indexOf(c); }).sort(function (a, b) { return a - b; });
        cat = ORDINE_SECCO[idx[(idx.length - 1) >> 1]];
      }
    }
    return {
      cat: cat,
      quota: gruppo.length / v.length,       // quanti modelli stanno dalla parte della maggioranza
      esatti: (cont[cat] || 0) / v.length,   // quanti prevedono esattamente questo tempo
      n: v.length,
      bagnati: wet.length,
      temporale: (cont.temporale || 0) / v.length,
      conteggio: cont
    };
  }
  MC.vota = vota;

  /* ---------- download ---------- */
  function scaricaModello(m, lat, lon) {
    var base = 'https://api.open-meteo.com/v1/forecast?';
    var p = { latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto', forecast_days: GIORNI, models: m.id, wind_speed_unit: 'kmh' };
    return getJSON(base + q(Object.assign({}, p, { hourly: H_FULL, daily: D_FULL })))
      .catch(function (e) {
        if (e.status === 400) return getJSON(base + q(Object.assign({}, p, { hourly: H_MIN, daily: D_MIN })));
        throw e;
      })
      .then(function (j) {
        var valido = j.daily && vals(j.daily.temperature_2m_max || []).length > 0;
        if (!valido) throw new Error('nessun dato per questa zona');
        return { id: m.id, nome: m.nome, ok: true, dati: j };
      });
  }

  MC.scaricaPrevisioni = function (lat, lon, attivi) {
    var lista = MC.MODELLI.filter(function (m) { return !attivi || attivi[m.id] !== false; });
    return Promise.all(lista.map(function (m) {
      return scaricaModello(m, lat, lon).catch(function (e) { return { id: m.id, nome: m.nome, ok: false, errore: String(e.message || e) }; });
    })).then(function (ris) {
      var buoni = ris.filter(function (r) { return r.ok; });
      if (!buoni.length) throw new Error('Nessun modello raggiungibile. Controlla la connessione.');
      return { stato: ris.map(function (r) { return { id: r.id, nome: r.nome, ok: r.ok, errore: r.errore || null }; }), consenso: costruisciConsenso(buoni) };
    });
  };

  /* ---------- consenso ---------- */
  function costruisciConsenso(modelli) {
    var rif = modelli[0].dati;
    var offset = rif.utc_offset_seconds || 0;

    // --- orario ---
    var tempi = {};
    modelli.forEach(function (m) { (m.dati.hourly && m.dati.hourly.time || []).forEach(function (t) { tempi[t] = 1; }); });
    var listaTempi = Object.keys(tempi).sort();
    var idxModello = modelli.map(function (m) {
      var mp = {};
      (m.dati.hourly && m.dati.hourly.time || []).forEach(function (t, i) { mp[t] = i; });
      return mp;
    });
    function serie(t, campo) {
      return modelli.map(function (m, k) {
        var i = idxModello[k][t];
        var h = m.dati.hourly;
        return i == null || !h || !h[campo] ? null : num(h[campo][i]);
      });
    }
    var ore = listaTempi.map(function (t) {
      var pr = serie(t, 'precipitation');
      var prS = stat(pr);
      var codici = serie(t, 'weather_code').map(categoria);
      var voto = vota(codici, prS && prS.med);
      var conPioggia = vals(pr);
      var vento = serie(t, 'wind_speed_10m');
      return {
        t: t,
        n: prS ? prS.n : vals(serie(t, 'temperature_2m')).length,
        voto: voto,
        temp: stat(serie(t, 'temperature_2m')),
        perc: stat(serie(t, 'apparent_temperature')),
        umid: stat(serie(t, 'relative_humidity_2m')),
        pioggia: prS,
        probPioggia: conPioggia.length ? conPioggia.filter(function (x) { return x >= 0.1; }).length / conPioggia.length : null,
        probApi: stat(serie(t, 'precipitation_probability')),
        neve: stat(serie(t, 'snowfall')),
        press: stat(serie(t, 'pressure_msl')),
        nuvole: stat(serie(t, 'cloud_cover')),
        basse: stat(serie(t, 'cloud_cover_low')),
        medie: stat(serie(t, 'cloud_cover_mid')),
        alte: stat(serie(t, 'cloud_cover_high')),
        vento: stat(vento),
        raffica: stat(serie(t, 'wind_gusts_10m')),
        dir: direzioneMedia(serie(t, 'wind_direction_10m'), vento),
        uv: stat(serie(t, 'uv_index')),
        visib: stat(serie(t, 'visibility'))
      };
    }).filter(function (o) { return o.temp; });

    // --- giornaliero ---
    var date = {};
    modelli.forEach(function (m) { (m.dati.daily.time || []).forEach(function (d) { date[d] = 1; }); });
    var listaDate = Object.keys(date).sort().slice(0, GIORNI);
    var giorni = listaDate.map(function (d) {
      var perModello = modelli.map(function (m) {
        var dd = m.dati.daily, i = dd.time.indexOf(d);
        function g(c) { return i < 0 || !dd[c] ? null : num(dd[c][i]); }
        return {
          id: m.id, nome: m.nome,
          cat: categoria(g('weather_code')),
          tmax: g('temperature_2m_max'), tmin: g('temperature_2m_min'),
          pioggia: g('precipitation_sum'), prob: g('precipitation_probability_max'),
          neve: g('snowfall_sum'), vento: g('wind_speed_10m_max'), raffica: g('wind_gusts_10m_max'),
          dir: g('wind_direction_10m_dominant'), uv: g('uv_index_max'),
          alba: i < 0 || !dd.sunrise ? null : dd.sunrise[i], tramonto: i < 0 || !dd.sunset ? null : dd.sunset[i]
        };
      }).filter(function (p) { return p.tmax != null; });

      var pz = perModello.map(function (p) { return p.pioggia; });
      var pzS = stat(pz);
      var voto = vota(perModello.map(function (p) { return p.cat; }), pzS && pzS.med);
      var pv = vals(pz);
      var oreG = ore.filter(function (o) { return o.t.slice(0, 10) === d; });
      var tmax = stat(perModello.map(function (p) { return p.tmax; }));
      var tmin = stat(perModello.map(function (p) { return p.tmin; }));
      var n = perModello.length;
      var spread = tmax ? tmax.max - tmax.min : 0;
      var score = (voto ? voto.quota : 0.5) * 0.45 + Math.max(0, 1 - spread / 8) * 0.35 + Math.min(1, n / 7) * 0.2;
      var pressOre = oreG.map(function (o) { return o.press && o.press.med; }).filter(function (x) { return x != null; });
      var alba = null, tramonto = null;
      perModello.some(function (p) { if (p.alba) { alba = p.alba; tramonto = p.tramonto; return true; } return false; });
      return {
        data: d,
        n: n,
        modelli: perModello,
        voto: voto,
        tmax: tmax, tmin: tmin,
        pioggia: pzS,
        probPioggia: pv.length ? pv.filter(function (x) { return x >= 1; }).length / pv.length : null,
        probApi: stat(perModello.map(function (p) { return p.prob; })),
        neve: stat(perModello.map(function (p) { return p.neve; })),
        vento: stat(perModello.map(function (p) { return p.vento; })),
        raffica: stat(perModello.map(function (p) { return p.raffica; })),
        dir: direzioneMedia(perModello.map(function (p) { return p.dir; }), perModello.map(function (p) { return p.vento; })),
        uv: stat(perModello.map(function (p) { return p.uv; })),
        nuvole: media(oreG.map(function (o) { return o.nuvole && o.nuvole.med; })),
        umid: media(oreG.map(function (o) { return o.umid && o.umid.med; })),
        press: pressOre.length ? { media: media(pressOre), min: Math.min.apply(null, pressOre), max: Math.max.apply(null, pressOre), tendenza: pressOre[pressOre.length - 1] - pressOre[0] } : null,
        alba: alba, tramonto: tramonto,
        affidabilita: score,
        ore: oreG
      };
    }).filter(function (g) { return g.n > 0; });

    return {
      creato: Date.now(),
      fuso: rif.timezone, offset: offset,
      quota: rif.elevation,
      modelliUsati: modelli.map(function (m) { return m.id; }),
      ore: ore,
      giorni: giorni
    };
  }
  MC.costruisciConsenso = costruisciConsenso;

  /* ---------- ora locale del luogo ---------- */
  MC.oraLocale = function (offset) {
    return new Date(Date.now() + (offset || 0) * 1000).toISOString().slice(0, 13) + ':00';
  };

  /* ---------- qualità dell'aria, UV, pollini (CAMS Europa) ---------- */
  MC.scaricaAria = function (lat, lon) {
    var base = 'https://air-quality-api.open-meteo.com/v1/air-quality?';
    var p = {
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto',
      hourly: 'pm10,pm2_5,nitrogen_dioxide,ozone,european_aqi,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
    };
    return getJSON(base + q(Object.assign({}, p, { forecast_days: 5 }))).catch(function () {
      return getJSON(base + q(Object.assign({}, p, { forecast_days: 4 })));
    }).then(function (j) {
      var h = j.hourly, giorni = {};
      h.time.forEach(function (t, i) {
        var d = t.slice(0, 10);
        var g = giorni[d] = giorni[d] || {};
        Object.keys(h).forEach(function (k) {
          if (k === 'time') return;
          (g[k] = g[k] || []).push(h[k][i]);
        });
      });
      return { ore: h, giorni: giorni };
    });
  };

  /* ---------- mari ---------- */
  MC.MARI = [
    { nome: 'Mar Ligure – Genova', lat: 44.38, lon: 8.93 },
    { nome: 'Mar Ligure – Sanremo', lat: 43.80, lon: 7.78 },
    { nome: 'Tirreno – Versilia', lat: 43.90, lon: 10.18 },
    { nome: 'Tirreno – Livorno', lat: 43.52, lon: 10.27 },
    { nome: 'Tirreno – Civitavecchia', lat: 42.08, lon: 11.75 },
    { nome: 'Tirreno – Ostia', lat: 41.72, lon: 12.25 },
    { nome: 'Golfo di Napoli', lat: 40.78, lon: 14.20 },
    { nome: 'Costiera Amalfitana', lat: 40.60, lon: 14.55 },
    { nome: 'Tirreno – Calabria', lat: 38.90, lon: 15.95 },
    { nome: 'Stretto di Messina', lat: 38.20, lon: 15.62 },
    { nome: 'Sicilia – Palermo', lat: 38.18, lon: 13.40 },
    { nome: 'Sicilia – Catania', lat: 37.45, lon: 15.15 },
    { nome: 'Sicilia – Canale di Sicilia', lat: 37.00, lon: 12.40 },
    { nome: 'Sardegna – Cagliari', lat: 39.10, lon: 9.15 },
    { nome: 'Sardegna – Olbia', lat: 40.95, lon: 9.65 },
    { nome: 'Sardegna – Alghero', lat: 40.55, lon: 8.25 },
    { nome: 'Ionio – Taranto', lat: 40.35, lon: 17.15 },
    { nome: 'Ionio – Crotone', lat: 39.05, lon: 17.20 },
    { nome: 'Adriatico – Bari', lat: 41.20, lon: 16.90 },
    { nome: 'Adriatico – Gargano', lat: 41.95, lon: 16.20 },
    { nome: 'Adriatico – Pescara', lat: 42.50, lon: 14.30 },
    { nome: 'Adriatico – Ancona', lat: 43.65, lon: 13.55 },
    { nome: 'Adriatico – Rimini', lat: 44.10, lon: 12.65 },
    { nome: 'Adriatico – Venezia', lat: 45.35, lon: 12.45 },
    { nome: 'Golfo di Trieste', lat: 45.62, lon: 13.65 }
  ];
  function distanza(a, b, c, d) {
    var R = 6371, r = Math.PI / 180;
    var x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  MC.distanza = distanza;
  MC.piuVicino = function (lista, lat, lon) {
    var best = null, bd = 1e9;
    lista.forEach(function (p) { var dd = distanza(lat, lon, p.lat, p.lon); if (dd < bd) { bd = dd; best = p; } });
    return best ? Object.assign({ km: bd }, best) : null;
  };

  MC.scaricaMare = function (punto) {
    var base = 'https://marine-api.open-meteo.com/v1/marine?';
    var p = {
      latitude: punto.lat.toFixed(4), longitude: punto.lon.toFixed(4), timezone: 'auto',
      hourly: 'wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,sea_surface_temperature',
      daily: 'wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max'
    };
    function prova(gg) { return getJSON(base + q(Object.assign({}, p, { forecast_days: gg }))); }
    return prova(GIORNI).catch(function () { return prova(8); }).catch(function () { return prova(7); }).then(function (j) {
      if (!j.daily || !vals(j.daily.wave_height_max || []).length) throw new Error('nessun dato di mare');
      return j;
    });
  };

  /* Scala Douglas dallo stato del mare (altezza d'onda in metri) */
  MC.statoMare = function (h) {
    if (h == null) return '–';
    if (h < 0.1) return 'Calmo';
    if (h < 0.5) return 'Poco mosso';
    if (h < 1.25) return 'Mosso';
    if (h < 2.5) return 'Molto mosso';
    if (h < 4) return 'Agitato';
    if (h < 6) return 'Molto agitato';
    if (h < 9) return 'Grosso';
    return 'Molto grosso';
  };

  /* ---------- laghi ---------- */
  MC.LAGHI = [
    { nome: 'Lago Maggiore', lat: 45.93, lon: 8.58, profondo: true },
    { nome: 'Lago di Comabbio', lat: 45.765, lon: 8.69, profondo: false },
    { nome: 'Lago di Monate', lat: 45.80, lon: 8.665, profondo: false },
    { nome: 'Lago di Varese', lat: 45.815, lon: 8.73, profondo: false },
    { nome: 'Lago d\'Orta', lat: 45.82, lon: 8.40, profondo: true },
    { nome: 'Lago di Lugano', lat: 45.98, lon: 9.02, profondo: true },
    { nome: 'Lago di Como', lat: 46.00, lon: 9.26, profondo: true },
    { nome: 'Lago d\'Iseo', lat: 45.72, lon: 10.07, profondo: true },
    { nome: 'Lago di Garda', lat: 45.62, lon: 10.66, profondo: true },
    { nome: 'Lago di Trasimeno', lat: 43.13, lon: 12.10, profondo: false },
    { nome: 'Lago di Bolsena', lat: 42.59, lon: 11.93, profondo: true },
    { nome: 'Lago di Vico', lat: 42.32, lon: 12.17, profondo: false },
    { nome: 'Lago di Bracciano', lat: 42.12, lon: 12.23, profondo: true },
    { nome: 'Lago del Turano', lat: 42.20, lon: 12.95, profondo: false },
    { nome: 'Lago di Bomba', lat: 42.00, lon: 14.37, profondo: false },
    { nome: 'Lago di Lesina', lat: 41.89, lon: 15.43, profondo: false },
    { nome: 'Lago Omodeo', lat: 40.13, lon: 8.92, profondo: false },
    { nome: 'Lago di Pergusa', lat: 37.52, lon: 14.30, profondo: false }
  ];

  MC.scaricaLago = function (lago) {
    var url = 'https://api.open-meteo.com/v1/forecast?' + q({
      latitude: lago.lat.toFixed(4), longitude: lago.lon.toFixed(4), timezone: 'auto',
      past_days: 31, forecast_days: GIORNI,
      daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant',
      hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m'
    });
    return getJSON(url).then(function (j) {
      // Stima della temperatura dell'acqua: l'acqua segue l'aria con ritardo
      // (media mobile esponenziale; i laghi profondi reagiscono più lentamente).
      var d = j.daily, tau = lago.profondo ? 24 : 9, tw = null, stime = [];
      d.time.forEach(function (t, i) {
        var ta = num(d.temperature_2m_mean && d.temperature_2m_mean[i]);
        if (ta == null) { var a = num(d.temperature_2m_max[i]), b = num(d.temperature_2m_min[i]); ta = a != null && b != null ? (a + b) / 2 : null; }
        if (ta != null) tw = tw == null ? ta : tw + (ta - tw) / tau;
        var v = tw == null ? null : Math.max(lago.profondo ? 5 : 1, tw);
        stime.push(v);
      });
      j.acqua = stime;
      return j;
    });
  };

  MC.statoLago = function (v) {
    if (v == null) return '–';
    if (v < 6) return 'Calmo';
    if (v < 15) return 'Increspato';
    if (v < 25) return 'Mosso';
    if (v < 38) return 'Agitato';
    return 'Burrascoso';
  };

  /* ---------- scale e livelli ---------- */
  MC.beaufort = function (kmh) {
    if (kmh == null) return null;
    var lim = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
    var nomi = ['Calma', 'Bava di vento', 'Brezza leggera', 'Brezza tesa', 'Vento moderato', 'Vento teso', 'Vento fresco', 'Vento forte', 'Burrasca', 'Burrasca forte', 'Tempesta', 'Fortunale', 'Uragano'];
    var b = 0; while (b < lim.length && kmh >= lim[b]) b++;
    return { forza: b, nome: nomi[b] };
  };
  MC.puntoCardinale = function (g) {
    if (g == null) return '–';
    var p = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    return p[Math.round(g / 22.5) % 16];
  };
  MC.livelloUV = function (u) {
    if (u == null) return { t: '–', c: 0 };
    if (u < 3) return { t: 'Basso', c: 1 };
    if (u < 6) return { t: 'Moderato', c: 2 };
    if (u < 8) return { t: 'Alto', c: 3 };
    if (u < 11) return { t: 'Molto alto', c: 4 };
    return { t: 'Estremo', c: 5 };
  };
  MC.livelloAQI = function (a) {
    if (a == null) return { t: '–', c: 0 };
    if (a <= 20) return { t: 'Buona', c: 1 };
    if (a <= 40) return { t: 'Discreta', c: 2 };
    if (a <= 60) return { t: 'Moderata', c: 3 };
    if (a <= 80) return { t: 'Scadente', c: 4 };
    if (a <= 100) return { t: 'Molto scadente', c: 5 };
    return { t: 'Pessima', c: 6 };
  };
  MC.POLLINI = {
    alder_pollen: { nome: 'Ontano', soglie: [1, 10, 100] },
    birch_pollen: { nome: 'Betulla', soglie: [1, 10, 100] },
    grass_pollen: { nome: 'Graminacee', soglie: [1, 5, 50] },
    mugwort_pollen: { nome: 'Artemisia', soglie: [1, 5, 30] },
    olive_pollen: { nome: 'Olivo', soglie: [1, 10, 50] },
    ragweed_pollen: { nome: 'Ambrosia', soglie: [1, 5, 20] }
  };
  MC.livelloPolline = function (k, v) {
    if (v == null) return { t: '–', c: 0 };
    var s = MC.POLLINI[k].soglie;
    if (v < s[0]) return { t: 'Assente', c: 0 };
    if (v < s[1]) return { t: 'Basso', c: 1 };
    if (v < s[2]) return { t: 'Medio', c: 3 };
    return { t: 'Alto', c: 5 };
  };
  MC.etichettaAffidabilita = function (s) {
    if (s >= 0.75) return 'Alta';
    if (s >= 0.55) return 'Media';
    return 'Bassa';
  };

  /* ---------- luoghi ---------- */
  MC.cercaLuoghi = function (testo, soloItalia) {
    var p = { name: testo, count: 10, language: 'it', format: 'json' };
    if (soloItalia) p.countryCode = 'IT';
    return getJSON('https://geocoding-api.open-meteo.com/v1/search?' + q(p)).then(function (j) {
      return (j.results || []).map(function (r) {
        return { nome: r.name, zona: [r.admin3, r.admin2, r.admin1].filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i && x !== r.name; }).slice(0, 2).join(', '), paese: r.country_code, lat: r.latitude, lon: r.longitude, quota: r.elevation };
      });
    });
  };
  MC.nomeDaCoordinate = function (lat, lon) {
    return getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?' + q({ latitude: lat, longitude: lon, localityLanguage: 'it' }), 10000)
      .then(function (j) { return { nome: j.city || j.locality || 'Posizione attuale', zona: j.principalSubdivision || '', paese: j.countryCode || '' }; })
      .catch(function () { return { nome: 'Posizione attuale', zona: lat.toFixed(3) + ', ' + lon.toFixed(3), paese: '' }; });
  };

  /* ---------- memoria locale ---------- */
  MC.leggi = function (k, def) { try { var v = localStorage.getItem('mc.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  MC.scrivi = function (k, v) { try { localStorage.setItem('mc.' + k, JSON.stringify(v)); } catch (e) { /* pieno */ } };
  MC.chiaveLuogo = function (l) { return l.lat.toFixed(3) + ',' + l.lon.toFixed(3); };
})();
