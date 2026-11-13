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
  // solo le variabili usate davvero: meno variabili = meno "peso" sul limite gratuito di Open-Meteo
  var H_FULL = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index';
  var D_FULL = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset';
  var H_MIN = 'temperature_2m,precipitation,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
  var D_MIN = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset';

  /* ---------- utilità ---------- */
  // Errori con un motivo leggibile: e.tipo = 'limite' | 'tempo' | 'rete' | 'richiesta'
  function errore(msg, tipo, status) { var e = new Error(msg); e.tipo = tipo; e.status = status || 0; return e; }
  function getJSON(url, ms) {
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms || 30000) : null;
    return fetch(url, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' }).then(function (r) {
      if (t) clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 429) throw errore('Limite di richieste raggiunto', 'limite', 429);
        if (!r.ok || j.error) throw errore(j.reason || ('Errore del server (' + r.status + ')'), r.status >= 500 ? 'rete' : 'richiesta', r.status);
        return j;
      });
    }, function (e) {
      if (t) clearTimeout(t);
      // una risposta 429 senza intestazioni CORS arriva al browser come "Failed to fetch"
      throw errore(e && e.name === 'AbortError' ? 'Il server non ha risposto in tempo' : 'Connessione non riuscita', e && e.name === 'AbortError' ? 'tempo' : 'rete');
    });
  }
  function attendi(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // un nuovo tentativo dopo una pausa per errori temporanei (rete, tempo, limite al minuto)
  function conRiprova(fn, pausa) {
    return fn().catch(function (e) {
      if (e.tipo === 'richiesta') throw e;
      return attendi(pausa || 2500).then(fn);
    });
  }
  MC.messaggioErrore = function (e) {
    if (!e) return 'Errore sconosciuto';
    if (e.tipo === 'limite') return 'Il servizio meteo gratuito ha raggiunto il limite di richieste per la tua rete (capita sulle reti mobili condivise). Riprova tra qualche minuto o con il Wi-Fi.';
    if (e.tipo === 'tempo') return 'Il servizio meteo è lento a rispondere. Riprova tra poco.';
    if (e.tipo === 'rete') return 'Connessione al servizio meteo non riuscita. Controlla la rete e riprova.';
    return e.message || String(e);
  };
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

  /* ---------- download ----------
     1) UNA sola richiesta con tutti i modelli insieme (models=a,b,c): molto più leggera
        per il limite gratuito di Open-Meteo rispetto a 12 richieste separate.
     2) Se il server rifiuta la lista (es. un modello rinominato), si passa a una richiesta
        per modello, al massimo 3 alla volta, e i modelli che falliscono vengono saltati. */
  var BASE_F = 'https://api.open-meteo.com/v1/forecast?';
  function parametri(lat, lon, models, completo) {
    return q({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto', forecast_days: GIORNI,
      models: models, wind_speed_unit: 'kmh', hourly: completo ? H_FULL : H_MIN, daily: completo ? D_FULL : D_MIN
    });
  }
  function haDati(d) { return d && d.daily && vals(d.daily.temperature_2m_max || []).length > 0; }

  // separa la risposta multi-modello (chiavi "temperature_2m_ecmwf_ifs025") in una risposta per modello
  function separa(j, m) {
    function parte(blocco) {
      if (!blocco) return null;
      var out = { time: blocco.time };
      Object.keys(blocco).forEach(function (k) {
        var suf = '_' + m.id;
        if (k.length > suf.length && k.slice(-suf.length) === suf) out[k.slice(0, -suf.length)] = blocco[k];
      });
      // variabili non legate al modello (alba, tramonto) arrivano senza suffisso
      ['sunrise', 'sunset'].forEach(function (k) { if (!out[k] && blocco[k]) out[k] = blocco[k]; });
      return out;
    }
    return { timezone: j.timezone, utc_offset_seconds: j.utc_offset_seconds, elevation: j.elevation, hourly: parte(j.hourly), daily: parte(j.daily) };
  }

  function insieme(lista, lat, lon) {
    var ids = lista.map(function (m) { return m.id; }).join(',');
    return conRiprova(function () {
      return getJSON(BASE_F + parametri(lat, lon, ids, true), 40000);
    }).then(function (j) {
      return lista.map(function (m) {
        var d = separa(j, m);
        return haDati(d) ? { id: m.id, nome: m.nome, ok: true, dati: d } : { id: m.id, nome: m.nome, ok: false, errore: 'nessun dato per questa zona' };
      });
    });
  }

  function unoPerUno(lista, lat, lon) {
    var ris = [], i = 0;
    function uno(m) {
      return getJSON(BASE_F + parametri(lat, lon, m.id, true))
        .catch(function (e) { if (e.tipo === 'richiesta') return getJSON(BASE_F + parametri(lat, lon, m.id, false)); throw e; })
        .then(function (d) {
          if (!haDati(d)) throw errore('nessun dato per questa zona', 'richiesta');
          return { id: m.id, nome: m.nome, ok: true, dati: d };
        })
        .catch(function (e) { return { id: m.id, nome: m.nome, ok: false, errore: e.message, tipo: e.tipo }; });
    }
    function lavoratore() {
      if (i >= lista.length) return Promise.resolve();
      var k = i++;
      return uno(lista[k]).then(function (r) { ris[k] = r; return lavoratore(); });
    }
    return Promise.all([lavoratore(), lavoratore(), lavoratore()]).then(function () { return ris; });
  }

  MC.scaricaPrevisioni = function (lat, lon, attivi) {
    var lista = MC.MODELLI.filter(function (m) { return !attivi || attivi[m.id] !== false; });
    return insieme(lista, lat, lon).catch(function (e) {
      if (e.tipo === 'limite') throw e;   // inutile insistere: anche le richieste singole verrebbero rifiutate
      return unoPerUno(lista, lat, lon);
    }).then(function (ris) {
      var buoni = ris.filter(function (r) { return r.ok; });
      if (!buoni.length) {
        var t = ris.filter(function (r) { return r.tipo; }).map(function (r) { return r.tipo; });
        throw errore('Nessun modello disponibile per questo luogo', t.indexOf('limite') >= 0 ? 'limite' : t.indexOf('rete') >= 0 ? 'rete' : t.indexOf('tempo') >= 0 ? 'tempo' : 'richiesta');
      }
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
    giorni.forEach(allineaAlleOre);

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

  /* ---------- giorno coerente con le ore ----------
     Il codice "tempo del giorno" dei modelli indica il fenomeno PIÙ intenso delle 24 ore
     (un piovasco alle 3 di notte = icona pioggia per tutto il giorno). Qui il tempo del
     giorno si ricava dalle previsioni ora per ora di maggioranza, contando soprattutto
     le ore di luce, così giorno e ore dicono la stessa cosa. */
  function allineaAlleOre(g) {
    var ore = g.ore.filter(function (o) { return o.voto; });
    if (ore.length < 6) return;   // troppe poche ore: resta il voto giornaliero dei modelli
    var alba = g.alba ? g.alba.slice(11, 13) + ':00' : '07:00', tramonto = g.tramonto ? g.tramonto.slice(11, 16) : '18:00';
    function peso(o) { var h = o.t.slice(11, 16); return h >= alba && h <= tramonto ? 1 : 0.4; }
    var tot = 0, bagnato = 0, cont = {}, temporali = 0;
    ore.forEach(function (o) {
      var w = peso(o), c = o.voto.cat;
      tot += w; cont[c] = (cont[c] || 0) + w;
      if (BAGNATO[c]) bagnato += w;
      if (c === 'temporale') temporali += w;
    });
    var cat;
    // giornata "bagnata" se piove per almeno ~3 ore di luce (o il 25% della giornata)
    if (bagnato >= Math.max(2.5, tot * 0.25)) {
      if (temporali >= 1.5) cat = 'temporale';
      else {
        var best = null, bn = -1;
        ['pioggia', 'neve', 'pioggerella'].forEach(function (c) { if ((cont[c] || 0) > bn) { bn = cont[c] || 0; best = c; } });
        cat = best;
      }
    } else {
      // nuvolosità: mediana pesata delle ore asciutte (soprattutto quelle di luce)
      var secche = ore.filter(function (o) { return !BAGNATO[o.voto.cat]; });
      var nebbia = secche.reduce(function (a, o) { return a + (o.voto.cat === 'nebbia' ? peso(o) : 0); }, 0);
      var totS = secche.reduce(function (a, o) { return a + peso(o); }, 0);
      if (totS && nebbia > totS / 2) cat = 'nebbia';
      else {
        var lista = secche.map(function (o) { return { i: o.voto.cat === 'nebbia' ? 3 : ORDINE_SECCO.indexOf(o.voto.cat), w: peso(o) }; }).sort(function (a, b) { return a.i - b.i; });
        var acc = 0; cat = 'parziale';
        for (var k = 0; k < lista.length; k++) { acc += lista[k].w; if (acc >= totS / 2) { cat = ORDINE_SECCO[lista[k].i]; break; } }
        // qualche ora di pioggia in una giornata asciutta: almeno "parzialmente nuvoloso"
        if (bagnato > 0 && ORDINE_SECCO.indexOf(cat) < 2) cat = 'parziale';
      }
    }
    // accordo = media dell'accordo dei modelli nelle singole ore (pesata sulle ore di luce),
    // così è coerente con le previsioni ora per ora mostrate
    var qs = 0, qw = 0;
    ore.forEach(function (o) { var w = peso(o); qs += o.voto.quota * w; qw += w; });
    var quotaOre = qw ? qs / qw : (g.voto ? g.voto.quota : 0.5);
    if (g.voto) g.voto = Object.assign({}, g.voto, { cat: cat, quota: quotaOre });
    else g.voto = { cat: cat, quota: quotaOre, esatti: 1, n: g.n, bagnati: 0, temporale: 0, conteggio: {} };
    // fasce orarie con pioggia (es. "02–04"), per spiegarle anche in una giornata asciutta
    var fasce = [], inizio = null, prec = null;
    ore.forEach(function (o) {
      var h = +o.t.slice(11, 13), b = !!BAGNATO[o.voto.cat];
      if (b && inizio == null) inizio = h;
      if (!b && inizio != null) { fasce.push([inizio, prec + 1]); inizio = null; }
      prec = h;
    });
    if (inizio != null) fasce.push([inizio, prec + 1]);
    g.fascePioggia = fasce;
    g.oreBagnate = Math.round(ore.filter(function (o) { return BAGNATO[o.voto.cat]; }).length);
    // massima e minima del giorno = quelle della curva oraria (la fascia resta quella dei modelli)
    if (g.ore.length >= 20) {
      var t = g.ore.map(function (o) { return o.temp && o.temp.med; }).filter(function (x) { return x != null; });
      if (t.length >= 20 && g.tmax && g.tmin) {
        g.tmax = Object.assign({}, g.tmax, { med: Math.max.apply(null, t) });
        g.tmin = Object.assign({}, g.tmin, { med: Math.min.apply(null, t) });
        g.tmax.min = Math.min(g.tmax.min, g.tmax.med); g.tmax.max = Math.max(g.tmax.max, g.tmax.med);
        g.tmin.min = Math.min(g.tmin.min, g.tmin.med); g.tmin.max = Math.max(g.tmin.max, g.tmin.med);
      }
    }
    // il punteggio di affidabilità usa la nuova quota di accordo
    var spread = g.tmax ? g.tmax.max - g.tmax.min : 0;
    g.affidabilita = g.voto.quota * 0.45 + Math.max(0, 1 - spread / 8) * 0.35 + Math.min(1, g.n / 7) * 0.2;
  }
  MC.allineaAlleOre = allineaAlleOre;

  /* ---------- riassunto per il widget (usato da app e widget) ---------- */
  MC.riassuntoWidget = function (c, luogo) {
    var adesso = MC.oraLocale(c.offset);
    var o = c.ore.filter(function (x) { return x.t <= adesso; }).pop() || c.ore[0];
    function notte(x) {
      var g = c.giorni.filter(function (d) { return d.data === x.t.slice(0, 10); })[0];
      if (!g || !g.alba) { var h = +x.t.slice(11, 13); return h < 7 || h >= 18; }
      return x.t < g.alba.slice(0, 13) + ':00' || x.t > g.tramonto;
    }
    var i0 = c.ore.indexOf(o);
    return {
      luogo: luogo, quando: Date.now(),
      ora: o ? { temp: o.temp && o.temp.med, perc: o.perc && o.perc.med, cat: o.voto && o.voto.cat, notte: notte(o), pioggia: o.probPioggia, vento: o.vento && o.vento.med, dir: o.dir, umid: o.umid && o.umid.med } : null,
      ore: c.ore.slice(Math.max(0, i0), Math.max(0, i0) + 24).map(function (x) {
        return { t: x.t, temp: x.temp && x.temp.med, cat: x.voto && x.voto.cat, notte: notte(x), prob: x.probPioggia };
      }),
      giorni: c.giorni.slice(0, 10).map(function (g) {
        return { data: g.data, cat: g.voto && g.voto.cat, max: g.tmax && g.tmax.med, min: g.tmin && g.tmin.med, prob: g.probPioggia, mm: g.pioggia && g.pioggia.med, aff: g.affidabilita, n: g.n, vento: g.vento && g.vento.med, alba: g.alba, tramonto: g.tramonto };
      })
    };
  };


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
      past_days: 21, forecast_days: GIORNI,
      daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant',
      hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m'
    });
    return conRiprova(function () { return getJSON(url); }).then(function (j) {
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
