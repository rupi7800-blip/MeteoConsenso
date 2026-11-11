/* =========================================================
   app.js — MeteoConsenso: interfaccia
   ========================================================= */
(function () {
  'use strict';
  var MC = window.MC;
  var $ = function (s) { return document.querySelector(s); };

  var DATI = [
    { k: 'meteo', nome: 'Meteo', ic: '🌤️' },
    { k: 'pioggia', nome: 'Pioggia', ic: '🌧️' },
    { k: 'vento', nome: 'Vento', ic: '💨' },
    { k: 'nuvole', nome: 'Nuvole', ic: '☁️' },
    { k: 'pressione', nome: 'Pressione', ic: '🧭' },
    { k: 'uv', nome: 'Raggi UV', ic: '🕶️' },
    { k: 'mari', nome: 'Mari', ic: '🌊' },
    { k: 'laghi', nome: 'Laghi', ic: '🏞️' },
    { k: 'pollini', nome: 'Pollini', ic: '🌼' },
    { k: 'polveri', nome: 'Polveri sottili', ic: '🏭' }
  ];
  var DEF_DATI = { meteo: true, pioggia: true, vento: true, nuvole: true, pressione: true, uv: true, mari: false, laghi: false, pollini: false, polveri: true };
  var LUOGO_DEF = { nome: 'Taino', zona: 'Varese, Lombardia', paese: 'IT', lat: 45.7636, lon: 8.6150 };
  var VALIDITA = 30 * 60 * 1000;

  var S = {
    dati: Object.assign({}, DEF_DATI, MC.leggi('dati', {})),
    modelli: MC.leggi('modelli', {}),
    luogo: MC.leggi('luogo', LUOGO_DEF),
    luoghi: MC.leggi('luoghi', []),       // preferiti e recenti
    soloItalia: MC.leggi('soloItalia', true),
    mareScelto: MC.leggi('mare', null),   // nome del punto mare scelto (null = automatico)
    lagoScelto: MC.leggi('lago', null),   // nome del lago scelto (null = il più vicino)
    giorno: 0,
    r: null,                              // risultato corrente
    carico: false
  };

  /* ---------- formati ---------- */
  function f0(v) { return v == null ? '–' : Math.round(v); }
  function f1(v) { return v == null ? '–' : (Math.round(v * 10) / 10).toLocaleString('it-IT'); }
  function pc(v) { return v == null ? '–' : Math.round(v * 100) + '%'; }
  function dataIt(d, opz) { return new Date(d + 'T12:00:00').toLocaleDateString('it-IT', opz); }
  function ora(t) { return t ? t.slice(11, 16) : '–'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nomeGiorno(i, d) {
    if (i === 0) return 'Oggi';
    if (i === 1) return 'Domani';
    return dataIt(d, { weekday: 'short', day: 'numeric' });
  }
  function classeAff(s) { return MC.etichettaAffidabilita(s).toLowerCase(); }
  function notteOra(o, g) {
    if (!g || !g.alba || !g.tramonto) { var h = +o.t.slice(11, 13); return h < 7 || h >= 18; }
    return o.t < g.alba.slice(0, 13) + ':00' || o.t > g.tramonto;
  }
  function giornoDi(t) {
    var d = t.slice(0, 10);
    return S.r && S.r.consenso.giorni.filter(function (g) { return g.data === d; })[0];
  }
  function avviso(msg, ms) {
    var a = $('#avviso'); a.textContent = msg; a.hidden = false;
    clearTimeout(avviso.t); avviso.t = setTimeout(function () { a.hidden = true; }, ms || 3500);
  }

  /* ---------- memoria dei luoghi ---------- */
  function ricordaLuogo(l) {
    var k = MC.chiaveLuogo(l);
    var es = S.luoghi.filter(function (x) { return MC.chiaveLuogo(x) === k; })[0];
    S.luoghi = S.luoghi.filter(function (x) { return MC.chiaveLuogo(x) !== k; });
    S.luoghi.unshift(Object.assign({}, l, { pref: es ? !!es.pref : !!l.pref, usato: Date.now() }));
    // tiene tutti i preferiti + gli ultimi 8 recenti
    var pref = S.luoghi.filter(function (x) { return x.pref; });
    var rec = S.luoghi.filter(function (x) { return !x.pref; }).slice(0, 8);
    S.luoghi = pref.concat(rec).sort(function (a, b) { return (b.usato || 0) - (a.usato || 0); });
    MC.scrivi('luoghi', S.luoghi);
  }
  function scegliLuogo(l) {
    S.luogo = { nome: l.nome, zona: l.zona || '', paese: l.paese || '', lat: l.lat, lon: l.lon };
    MC.scrivi('luogo', S.luogo);
    ricordaLuogo(S.luogo);
    S.giorno = 0;
    chiudiFoglio();
    mostraLuogo();
    var c = leggiCache();
    if (c) { S.r = c; disegna(); }
    else { $('#ora').innerHTML = '<div class="carica">Raccolgo le previsioni di tutti i modelli…</div>'; $('#giorni').innerHTML = ''; $('#dettaglio').innerHTML = ''; }
    carica(!c || Date.now() - c.quando > VALIDITA);
  }
  function mostraLuogo() {
    $('#nomeLuogo').textContent = S.luogo.nome;
    $('#zonaLuogo').textContent = [S.luogo.zona, S.luogo.paese && S.luogo.paese !== 'IT' ? S.luogo.paese : ''].filter(Boolean).join(' · ');
  }

  /* ---------- cache ---------- */
  function chiaveCache() { return 'cache.' + MC.chiaveLuogo(S.luogo); }
  function leggiCache() {
    var c = MC.leggi(chiaveCache(), null);
    if (!c || !c.consenso) return null;
    c.consenso.giorni.forEach(function (g) { g.ore = c.consenso.ore.filter(function (o) { return o.t.slice(0, 10) === g.data; }); });
    return c;
  }
  function salvaCache(r) {
    var copia = JSON.parse(JSON.stringify(r));
    copia.consenso.giorni.forEach(function (g) { delete g.ore; });
    // tiene in memoria solo gli ultimi 4 luoghi consultati
    var indice = MC.leggi('indiceCache', []).filter(function (k) { return k !== chiaveCache(); });
    indice.unshift(chiaveCache());
    indice.slice(4).forEach(function (k) { try { localStorage.removeItem('mc.' + k); } catch (e) { /* no */ } });
    MC.scrivi('indiceCache', indice.slice(0, 4));
    try { localStorage.setItem('mc.' + chiaveCache(), JSON.stringify(copia)); }
    catch (e) { indice.slice(1).forEach(function (k) { try { localStorage.removeItem('mc.' + k); } catch (x) { /* no */ } }); MC.scrivi(chiaveCache(), copia); }
  }
  function salvaWidget() {
    var c = S.r && S.r.consenso; if (!c) return;
    var o = oraCorrente();
    MC.scrivi('widget', {
      luogo: S.luogo, quando: S.r.quando,
      ora: o ? { temp: o.temp && o.temp.med, cat: o.voto && o.voto.cat, notte: notteOra(o, giornoDi(o.t)), pioggia: o.probPioggia } : null,
      giorni: c.giorni.slice(0, 6).map(function (g) {
        return { data: g.data, cat: g.voto && g.voto.cat, max: g.tmax && g.tmax.med, min: g.tmin && g.tmin.med, prob: g.probPioggia, aff: g.affidabilita, n: g.n };
      })
    });
  }

  /* ---------- caricamento ---------- */
  function puntoMare() {
    if (S.mareScelto) { var m = MC.MARI.filter(function (x) { return x.nome === S.mareScelto; })[0]; if (m) return Object.assign({ km: MC.distanza(S.luogo.lat, S.luogo.lon, m.lat, m.lon) }, m); }
    return MC.piuVicino(MC.MARI, S.luogo.lat, S.luogo.lon);
  }
  function lagoAttivo() {
    if (S.lagoScelto) { var l = MC.LAGHI.filter(function (x) { return x.nome === S.lagoScelto; })[0]; if (l) return Object.assign({ km: MC.distanza(S.luogo.lat, S.luogo.lon, l.lat, l.lon) }, l); }
    return MC.piuVicino(MC.LAGHI, S.luogo.lat, S.luogo.lon);
  }

  function carica(forza) {
    if (S.carico) return;
    if (!forza && S.r && Date.now() - S.r.quando < VALIDITA) return;
    if (!navigator.onLine) { if (S.r) avviso('Sei offline: mostro le ultime previsioni salvate.'); return; }
    S.carico = true;
    $('#btnRicarica').classList.add('gira');
    var l = S.luogo, d = S.dati;
    var serveAria = d.uv || d.pollini || d.polveri;
    var pm = d.mari ? puntoMare() : null, pl = d.laghi ? lagoAttivo() : null;
    Promise.all([
      MC.scaricaPrevisioni(l.lat, l.lon, S.modelli),
      serveAria ? MC.scaricaAria(l.lat, l.lon).catch(function () { return null; }) : null,
      pm ? MC.scaricaMare(pm).then(function (j) { return { punto: pm, dati: j }; }).catch(function () { return { punto: pm, errore: true }; }) : null,
      pl ? MC.scaricaLago(pl).then(function (j) { return { lago: pl, dati: j }; }).catch(function () { return { lago: pl, errore: true }; }) : null
    ]).then(function (v) {
      S.r = { quando: Date.now(), consenso: v[0].consenso, stato: v[0].stato, aria: v[1], mare: v[2], lago: v[3] };
      if (S.giorno >= S.r.consenso.giorni.length) S.giorno = 0;
      salvaCache(S.r);
      disegna();
      salvaWidget();
    }).catch(function (e) {
      if (!S.r) $('#ora').innerHTML = '<div class="carica">⚠️ ' + esc(e.message || e) + '<br><br><button class="btn" id="riprova">Riprova</button></div>';
      var b = $('#riprova'); if (b) b.onclick = function () { carica(true); };
      avviso('Aggiornamento non riuscito: ' + (e.message || e));
    }).then(function () {
      S.carico = false;
      $('#btnRicarica').classList.remove('gira');
    });
  }

  /* ---------- disegno ---------- */
  function oraCorrente() {
    var c = S.r.consenso, adesso = MC.oraLocale(c.offset);
    var o = c.ore.filter(function (x) { return x.t === adesso; })[0];
    if (!o) o = c.ore.filter(function (x) { return x.t <= adesso; }).pop() || c.ore[0];
    return o;
  }

  function disegna() {
    if (!S.r) return;
    disegnaOra();
    disegnaGiorni();
    disegnaDettaglio();
    disegnaTendenza();
    disegnaFonti();
  }

  function disegnaOra() {
    var o = oraCorrente(), g0 = S.r.consenso.giorni[0];
    if (!o) return;
    var notte = notteOra(o, giornoDi(o.t));
    var cat = o.voto ? o.voto.cat : 'parziale';
    document.body.className = 'tema-' + cat + (notte ? ' notte' : '');
    var vecchio = Date.now() - S.r.quando;
    var quando = vecchio < 90000 ? 'adesso' : 'alle ' + new Date(S.r.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    var h = '<div class="grande">' + MC.icona(cat, notte, 96) + '<div class="temp">' + f0(o.temp.med) + '°</div></div>' +
      '<div class="desc">' + MC.TESTI[cat] + '</div>' +
      '<div class="sub">Percepita ' + f0(o.perc && o.perc.med) + '° · modelli tra ' + f0(o.temp.min) + '° e ' + f0(o.temp.max) + '°</div>' +
      (g0 ? '<div class="sub">Oggi ↑ ' + f0(g0.tmax && g0.tmax.med) + '° ↓ ' + f0(g0.tmin && g0.tmin.med) + '° · alba ' + ora(g0.alba) + ' · tramonto ' + ora(g0.tramonto) + '</div>' : '') +
      '<div class="chips">' +
      (o.voto ? '<span class="chip">🗳️ ' + Math.round(o.voto.quota * o.voto.n) + ' su ' + o.voto.n + ' modelli d\'accordo</span>' : '') +
      (g0 ? '<span class="chip ' + classeAff(g0.affidabilita) + '">Affidabilità oggi: ' + MC.etichettaAffidabilita(g0.affidabilita) + '</span>' : '') +
      (S.dati.vento && o.vento ? '<span class="chip">' + MC.freccia(o.dir, 14) + ' ' + f0(o.vento.med) + ' km/h</span>' : '') +
      (S.dati.pioggia && o.probPioggia != null ? '<span class="chip">💧 ' + pc(o.probPioggia) + '</span>' : '') +
      '<span class="chip">🕑 ' + quando + '</span>' +
      '</div>';
    $('#ora').innerHTML = h;
  }

  function disegnaGiorni() {
    var gg = S.r.consenso.giorni;
    $('#giorni').innerHTML = gg.map(function (g, i) {
      var cat = g.voto ? g.voto.cat : 'parziale';
      return '<button class="gg' + (i === S.giorno ? ' sel' : '') + '" data-i="' + i + '" type="button">' +
        '<i class="acc ' + classeAff(g.affidabilita) + '" title="Affidabilità ' + MC.etichettaAffidabilita(g.affidabilita) + '"></i>' +
        '<div class="n">' + nomeGiorno(i, g.data) + '</div>' + MC.icona(cat, false, 40) +
        '<div><span class="mx">' + f0(g.tmax && g.tmax.med) + '°</span> <span class="mn">' + f0(g.tmin && g.tmin.med) + '°</span></div>' +
        '<div class="pp">' + (g.probPioggia ? '💧' + pc(g.probPioggia) : '') + '</div></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.gg'), function (b) {
      b.onclick = function () { S.giorno = +b.dataset.i; disegnaGiorni(); disegnaDettaglio(); };
    });
    var sel = document.querySelector('.gg.sel');
    if (sel && sel.scrollIntoView && S.giorno > 2) sel.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function card(titolo, dx, corpo) {
    return '<div class="card"><h3>' + titolo + (dx ? '<span class="dx">' + dx + '</span>' : '') + '</h3>' + corpo + '</div>';
  }

  function disegnaDettaglio() {
    var g = S.r.consenso.giorni[S.giorno];
    if (!g) { $('#dettaglio').innerHTML = ''; return; }
    var d = S.dati, ore = g.ore, et = ore.map(function (o) { return o.t.slice(11, 13); });
    var adesso = MC.oraLocale(S.r.consenso.offset);
    var cat = g.voto ? g.voto.cat : 'parziale';
    var h = '<div class="titoloGiorno">' + (S.giorno < 2 ? nomeGiorno(S.giorno) + ', ' : '') + dataIt(g.data, { weekday: 'long', day: 'numeric', month: 'long' }) +
      '<small>' + MC.TESTI[cat] + ' · ' + g.n + ' modelli · affidabilità ' + MC.etichettaAffidabilita(g.affidabilita).toLowerCase() +
      (S.giorno >= 10 ? ' · oltre i 10 giorni è una tendenza' : '') + '</small></div>';

    // ora per ora
    if (ore.length) {
      h += card('Ora per ora', ore.length < 24 ? 'dalle ' + ora(ore[0].t) : '', '<div class="ore">' + ore.map(function (o) {
        var c = o.voto ? o.voto.cat : 'parziale';
        return '<div class="ora' + (o.t === adesso ? ' ora-ora' : '') + '"><div class="h">' + o.t.slice(11, 13) + '</div>' + MC.icona(c, notteOra(o, g), 34) +
          '<div class="t">' + f0(o.temp.med) + '°</div>' +
          (d.pioggia ? '<div class="p">' + (o.probPioggia ? pc(o.probPioggia) : '') + '</div>' : '') +
          (d.vento && o.vento ? '<div class="v">' + MC.freccia(o.dir, 11) + f0(o.vento.med) + '</div>' : '') + '</div>';
      }).join('') + '</div>');
    }

    if (d.meteo) {
      var v = g.voto, voti = '';
      if (v) voti = '<div class="voti">' + Object.keys(v.conteggio).sort(function (a, b) { return v.conteggio[b] - v.conteggio[a]; }).map(function (c) {
        return '<span>' + MC.icona(c, false, 20) + MC.TESTI[c] + ' <b>' + v.conteggio[c] + '</b></span>';
      }).join('') + '</div>';
      var righe = g.modelli.slice().sort(function (a, b) { return (b.tmax || 0) - (a.tmax || 0); }).map(function (m) {
        return '<tr><td>' + esc(m.nome) + '</td><td>' + (m.cat ? MC.icona(m.cat, false, 24) : '–') + '</td><td>' + f0(m.tmax) + '°</td><td>' + f0(m.tmin) + '°</td>' +
          (d.pioggia ? '<td>' + f1(m.pioggia) + '</td>' : '') + (d.vento ? '<td>' + f0(m.vento) + '</td>' : '') + '</tr>';
      }).join('');
      h += card('🌤️ Meteo di maggioranza', v ? Math.round(v.quota * 100) + '% d\'accordo' : '',
        '<div class="kpi"><div><span>Massima</span><b>' + f0(g.tmax && g.tmax.med) + '°</b><em>modelli ' + f0(g.tmax && g.tmax.min) + '…' + f0(g.tmax && g.tmax.max) + '°</em></div>' +
        '<div><span>Minima</span><b>' + f0(g.tmin && g.tmin.med) + '°</b><em>modelli ' + f0(g.tmin && g.tmin.min) + '…' + f0(g.tmin && g.tmin.max) + '°</em></div>' +
        '<div><span>Umidità media</span><b>' + f0(g.umid) + '%</b></div>' +
        (v && v.temporale > 0 && v.cat !== 'temporale' ? '<div><span>Rischio temporali</span><b>' + pc(v.temporale) + '</b><em>dei modelli</em></div>' : '') + '</div>' +
        '<div class="barra" title="Affidabilità"><i style="width:' + Math.round(g.affidabilita * 100) + '%"></i></div>' + voti +
        (ore.length ? MC.grafico({ etichette: et, serie: [{ valori: ore.map(function (o) { return o.temp.med; }), fascia: ore.map(function (o) { return [o.temp.min, o.temp.max]; }), colore: '#FFC53D', nome: 'Temperatura (mediana)' }], unita: '°C · fascia = tutti i modelli' }) : '') +
        '<h3 style="margin-top:14px">Cosa dice ogni modello</h3><table class="tab"><tr><th>Modello</th><th></th><th>Max</th><th>Min</th>' + (d.pioggia ? '<th>mm</th>' : '') + (d.vento ? '<th>km/h</th>' : '') + '</tr>' +
        '<tr class="cons"><td>Maggioranza</td><td>' + MC.icona(cat, false, 24) + '</td><td>' + f0(g.tmax && g.tmax.med) + '°</td><td>' + f0(g.tmin && g.tmin.med) + '°</td>' +
        (d.pioggia ? '<td>' + f1(g.pioggia && g.pioggia.med) + '</td>' : '') + (d.vento ? '<td>' + f0(g.vento && g.vento.med) + '</td>' : '') + '</tr>' + righe + '</table>');
    }

    var doppie = '';
    if (d.pioggia) {
      var neve = g.neve && g.neve.med > 0;
      doppie += card('🌧️ Pioggia', '',
        '<div class="kpi"><div><span>Probabilità</span><b>' + pc(g.probPioggia) + '</b><em>modelli con ≥ 1 mm</em></div>' +
        '<div><span>Quantità</span><b>' + f1(g.pioggia && g.pioggia.med) + ' mm</b><em>da ' + f1(g.pioggia && g.pioggia.min) + ' a ' + f1(g.pioggia && g.pioggia.max) + '</em></div>' +
        (neve ? '<div><span>Neve</span><b>' + f1(g.neve.med) + ' cm</b><em>fino a ' + f1(g.neve.max) + '</em></div>' : '') + '</div>' +
        (ore.length ? MC.grafico({ etichette: et, serie: [{ valori: ore.map(function (o) { return o.probPioggia == null ? null : o.probPioggia * 100; }), tipo: 'barre', colore: '#4FA3FF', nome: 'Probabilità oraria' }], min: 0, max: 100, unita: '%', h: 130 }) : ''));
    }
    if (d.vento) {
      var bf = MC.beaufort(g.vento && g.vento.med);
      doppie += card('💨 Vento', bf ? 'Forza ' + bf.forza + ' · ' + bf.nome : '',
        '<div class="kpi"><div><span>Vento massimo</span><b>' + f0(g.vento && g.vento.med) + ' km/h</b><em>modelli ' + f0(g.vento && g.vento.min) + '…' + f0(g.vento && g.vento.max) + '</em></div>' +
        '<div><span>Raffiche</span><b>' + f0(g.raffica && g.raffica.med) + ' km/h</b></div>' +
        '<div><span>Provenienza</span><b>' + MC.freccia(g.dir, 22) + ' ' + MC.puntoCardinale(g.dir) + '</b></div></div>' +
        (ore.length ? MC.grafico({ etichette: et, serie: [
          { valori: ore.map(function (o) { return o.vento && o.vento.med; }), fascia: ore.map(function (o) { return o.vento ? [o.vento.min, o.vento.max] : null; }), colore: '#3DDC97', nome: 'Vento' },
          { valori: ore.map(function (o) { return o.raffica && o.raffica.med; }), colore: '#FF8C42', nome: 'Raffiche', tratteggio: true }], min: 0, unita: 'km/h', h: 140 }) : ''));
    }
    if (d.nuvole) {
      doppie += card('☁️ Nuvole', 'media ' + f0(g.nuvole) + '%',
        (ore.length ? MC.grafico({ etichette: et, serie: [
          { valori: ore.map(function (o) { return o.nuvole && o.nuvole.med; }), colore: '#E8EEF8', nome: 'Totale' },
          { valori: ore.map(function (o) { return o.basse && o.basse.med; }), colore: '#9AA8BF', nome: 'Basse', tratteggio: true },
          { valori: ore.map(function (o) { return o.medie && o.medie.med; }), colore: '#4FA3FF', nome: 'Medie', tratteggio: true },
          { valori: ore.map(function (o) { return o.alte && o.alte.med; }), colore: '#B58CFF', nome: 'Alte', tratteggio: true }], min: 0, max: 100, unita: '%', h: 140 }) : '<p class="vuoto">Nessun dato orario.</p>') +
        '<p class="nota">Nuvole basse = nebbie e strati sotto i 2 km; alte = velature (cirri) sopra i 6 km.</p>');
    }
    if (d.pressione && g.press) {
      var tnd = g.press.tendenza, frase = tnd > 2 ? '↗ in aumento' : tnd < -2 ? '↘ in calo' : '→ stabile';
      doppie += card('🧭 Pressione atmosferica', frase,
        '<div class="kpi"><div><span>Media</span><b>' + f0(g.press.media) + ' hPa</b></div><div><span>Escursione</span><b>' + f0(g.press.min) + '–' + f0(g.press.max) + '</b><em>hPa</em></div>' +
        '<div><span>Variazione</span><b>' + (tnd > 0 ? '+' : '') + f1(tnd) + '</b><em>hPa nel giorno</em></div></div>' +
        MC.grafico({ etichette: et, serie: [{ valori: ore.map(function (o) { return o.press && o.press.med; }), fascia: ore.map(function (o) { return o.press ? [o.press.min, o.press.max] : null; }), colore: '#B58CFF', nome: 'Pressione al livello del mare' }], unita: 'hPa', h: 130 }) +
        '<p class="nota">Sotto 1005 hPa: tempo spesso instabile · sopra 1020 hPa: anticiclone. Un calo rapido (> 3 hPa in 3 ore) annuncia peggioramento.</p>');
    }
    if (d.uv) {
      var uvAria = ariaGiorno(g.data, 'uv_index');
      var uvMax = g.uv && g.uv.med != null ? g.uv.med : (uvAria ? Math.max.apply(null, uvAria) : null);
      var lv = MC.livelloUV(uvMax);
      doppie += card('🕶️ Raggi UV', '<span class="liv c' + lv.c + '">' + lv.t + '</span>',
        '<div class="kpi"><div><span>Indice UV massimo</span><b>' + f1(uvMax) + '</b>' + (g.uv && g.uv.n > 1 ? '<em>modelli ' + f1(g.uv.min) + '…' + f1(g.uv.max) + '</em>' : '') + '</div></div>' +
        (ore.some(function (o) { return o.uv; }) ? MC.grafico({ etichette: et, serie: [{ valori: ore.map(function (o) { return o.uv && o.uv.med; }), tipo: 'barre', colore: '#FFC53D', nome: 'UV orario' }], min: 0, unita: 'indice', h: 120 }) : '') +
        '<p class="nota">' + (lv.c >= 3 ? 'Protezione necessaria tra le 11 e le 16: crema SPF 30+, occhiali e cappello.' : lv.c === 2 ? 'Protezione consigliata nelle ore centrali.' : 'Nessuna protezione particolare necessaria.') + '</p>');
    }
    if (d.polveri) doppie += cardPolveri(g);
    if (d.pollini) doppie += cardPollini(g);
    if (d.mari) doppie += cardMare(g);
    if (d.laghi) doppie += cardLago(g);
    h += '<div class="doppia">' + doppie + '</div>';
    $('#dettaglio').innerHTML = h;
    var sm = $('#selMare'); if (sm) sm.onchange = function () { S.mareScelto = sm.value || null; MC.scrivi('mare', S.mareScelto); carica(true); };
    var sl = $('#selLago'); if (sl) sl.onchange = function () { S.lagoScelto = sl.value || null; MC.scrivi('lago', S.lagoScelto); carica(true); };
    var oo = document.querySelector('.ora-ora'); if (oo && oo.parentNode) oo.parentNode.scrollLeft = oo.offsetLeft - 60;
  }

  function ariaGiorno(data, campo) {
    var a = S.r.aria; if (!a || !a.giorni[data] || !a.giorni[data][campo]) return null;
    var v = a.giorni[data][campo].filter(function (x) { return x != null; });
    return v.length ? v : null;
  }
  function ariaOre(data, campo) {
    var a = S.r.aria; if (!a) return null;
    var idx = []; a.ore.time.forEach(function (t, i) { if (t.slice(0, 10) === data) idx.push(i); });
    return { et: idx.map(function (i) { return a.ore.time[i].slice(11, 13); }), v: idx.map(function (i) { return a.ore[campo] ? a.ore[campo][i] : null; }) };
  }
  function max(a) { return a ? Math.max.apply(null, a) : null; }
  function med(a) { return a ? MC.util.media(a) : null; }

  function cardPolveri(g) {
    if (!S.r.aria) return card('🏭 Polveri sottili', '', '<p class="vuoto">Dati sulla qualità dell\'aria non disponibili ora.</p>');
    var aqi = ariaGiorno(g.data, 'european_aqi');
    if (!aqi) return card('🏭 Polveri sottili', '', '<p class="vuoto">Previsione disponibile solo per i prossimi 4–5 giorni.</p>');
    var lv = MC.livelloAQI(max(aqi));
    var pm10 = ariaGiorno(g.data, 'pm10'), pm25 = ariaGiorno(g.data, 'pm2_5'), no2 = ariaGiorno(g.data, 'nitrogen_dioxide'), o3 = ariaGiorno(g.data, 'ozone');
    var oo = ariaOre(g.data, 'european_aqi');
    var sopra = med(pm10) > 50;
    return card('🏭 Polveri sottili e aria', '<span class="liv c' + lv.c + '">' + lv.t + '</span>',
      '<div class="kpi"><div><span>PM10 media</span><b>' + f0(med(pm10)) + '</b><em>µg/m³ · limite UE 50</em></div>' +
      '<div><span>PM2.5 media</span><b>' + f0(med(pm25)) + '</b><em>µg/m³ · guida OMS 15</em></div>' +
      '<div><span>NO₂ max</span><b>' + f0(max(no2)) + '</b><em>µg/m³</em></div>' +
      '<div><span>Ozono max</span><b>' + f0(max(o3)) + '</b><em>µg/m³ · soglia 180</em></div></div>' +
      MC.grafico({ etichette: oo.et, serie: [{ valori: oo.v, colore: '#FF8C42', nome: 'Indice europeo AQI' }], min: 0, unita: 'AQI', h: 120 }) +
      '<p class="nota">' + (sopra ? '⚠️ PM10 oltre il limite giornaliero: meglio evitare sforzi intensi all\'aperto nelle ore di punta. ' : '') + 'Fonte: Copernicus CAMS (modello europeo di qualità dell\'aria).</p>');
  }

  function cardPollini(g) {
    if (!S.r.aria) return card('🌼 Pollini', '', '<p class="vuoto">Dati sui pollini non disponibili ora.</p>');
    var righe = '', almeno = false, presenti = false;
    Object.keys(MC.POLLINI).forEach(function (k) {
      var v = ariaGiorno(g.data, k);
      if (!v) return;
      almeno = true;
      var m = max(v), lv = MC.livelloPolline(k, m);
      if (lv.c > 0) presenti = true;
      righe += '<div><span>' + MC.POLLINI[k].nome + '</span><span>' + f0(m) + ' gr/m³ <span class="liv c' + lv.c + '">' + lv.t + '</span></span></div>';
    });
    if (!almeno) return card('🌼 Pollini', '', '<p class="vuoto">Previsione disponibile solo per i prossimi 4–5 giorni e solo in Europa.</p>');
    return card('🌼 Pollini', '', '<div class="righe">' + righe + '</div><p class="nota">' + (presenti ? 'Valori massimi del giorno (granuli per metro cubo). ' : 'Nessun polline significativo: fuori stagione o giornata piovosa. ') + 'Il modello CAMS copre i 6 pollini principali; cipresso, nocciolo e parietaria non sono inclusi.</p>');
  }

  function cardMare(g) {
    var m = S.r.mare;
    var opzioni = '<option value="">Automatico (il più vicino)</option>' + MC.MARI.map(function (x) {
      return '<option' + (S.mareScelto === x.nome ? ' selected' : '') + '>' + esc(x.nome) + '</option>';
    }).join('');
    var sel = '<select id="selMare" class="sel-inline" aria-label="Scegli il mare">' + opzioni + '</select>';
    if (!m) return card('🌊 Mari', '', sel + '<p class="vuoto">Caricamento al prossimo aggiornamento…</p>');
    if (m.errore) return card('🌊 Mari', '', sel + '<p class="vuoto">Dati del mare non disponibili per ' + esc(m.punto.nome) + '.</p>');
    var j = m.dati, i = j.daily.time.indexOf(g.data);
    var testa = sel + '<p class="nota" style="margin-top:6px">' + esc(m.punto.nome) + ' · ' + f0(m.punto.km) + ' km da ' + esc(S.luogo.nome) + '</p>';
    if (i < 0) return card('🌊 Mari', '', testa + '<p class="vuoto">Previsione del mare non disponibile per questo giorno.</p>');
    var hm = j.daily.wave_height_max[i];
    var idx = []; j.hourly.time.forEach(function (t, k) { if (t.slice(0, 10) === g.data) idx.push(k); });
    var sst = idx.map(function (k) { return j.hourly.sea_surface_temperature ? j.hourly.sea_surface_temperature[k] : null; }).filter(function (x) { return x != null; });
    return card('🌊 Mari', MC.statoMare(hm), testa +
      '<div class="kpi"><div><span>Onda massima</span><b>' + f1(hm) + ' m</b><em>' + MC.statoMare(hm) + '</em></div>' +
      '<div><span>Da</span><b>' + MC.freccia(j.daily.wave_direction_dominant[i], 22) + ' ' + MC.puntoCardinale(j.daily.wave_direction_dominant[i]) + '</b></div>' +
      '<div><span>Periodo</span><b>' + f1(j.daily.wave_period_max[i]) + ' s</b></div>' +
      (sst.length ? '<div><span>Acqua</span><b>' + f1(MC.util.media(sst)) + '°</b><em>superficie</em></div>' : '') +
      (j.daily.swell_wave_height_max ? '<div><span>Onda lunga</span><b>' + f1(j.daily.swell_wave_height_max[i]) + ' m</b><em>swell</em></div>' : '') + '</div>' +
      MC.grafico({ etichette: idx.map(function (k) { return j.hourly.time[k].slice(11, 13); }), serie: [
        { valori: idx.map(function (k) { return j.hourly.wave_height[k]; }), colore: '#4FA3FF', nome: 'Onda' },
        { valori: idx.map(function (k) { return j.hourly.swell_wave_height ? j.hourly.swell_wave_height[k] : null; }), colore: '#B58CFF', nome: 'Swell', tratteggio: true }], min: 0, unita: 'metri', decimali: 1, h: 120 }));
  }

  function cardLago(g) {
    var lr = S.r.lago;
    var opzioni = '<option value="">Il più vicino</option>' + MC.LAGHI.map(function (x) {
      return '<option' + (S.lagoScelto === x.nome ? ' selected' : '') + '>' + esc(x.nome) + '</option>';
    }).join('');
    var sel = '<select id="selLago" class="sel-inline" aria-label="Scegli il lago">' + opzioni + '</select>';
    if (!lr) return card('🏞️ Laghi', '', sel + '<p class="vuoto">Caricamento al prossimo aggiornamento…</p>');
    if (lr.errore) return card('🏞️ Laghi', '', sel + '<p class="vuoto">Dati non disponibili per ' + esc(lr.lago.nome) + '.</p>');
    var j = lr.dati, i = j.daily.time.indexOf(g.data);
    if (i < 0) return card('🏞️ Laghi', '', sel + '<p class="vuoto">Nessun dato per questo giorno.</p>');
    var v = j.daily.wind_speed_10m_max[i], rf = j.daily.wind_gusts_10m_max[i];
    var idx = []; j.hourly.time.forEach(function (t, k) { if (t.slice(0, 10) === g.data) idx.push(k); });
    var sup = v < 12 && rf < 22, vela = v >= 12 && v < 30 && rf < 45;
    return card('🏞️ Laghi', MC.statoLago(v), sel + '<p class="nota" style="margin-top:6px">' + esc(lr.lago.nome) + ' · ' + f0(lr.lago.km) + ' km da ' + esc(S.luogo.nome) + '</p>' +
      '<div class="kpi"><div><span>Vento sul lago</span><b>' + f0(v) + ' km/h</b><em>raffiche ' + f0(rf) + '</em></div>' +
      '<div><span>Da</span><b>' + MC.freccia(j.daily.wind_direction_10m_dominant[i], 22) + ' ' + MC.puntoCardinale(j.daily.wind_direction_10m_dominant[i]) + '</b></div>' +
      '<div><span>Acqua (stima)</span><b>' + f0(j.acqua[i]) + '°</b><em>± 2–3 °C</em></div>' +
      '<div><span>Attività</span><b style="font-size:15px">' + (sup ? '🏄 SUP e kayak ok' : vela ? '⛵ Buono per la vela' : rf >= 45 ? '⚠️ Raffiche forti' : '🚫 Sconsigliato') + '</b></div></div>' +
      MC.grafico({ etichette: idx.map(function (k) { return j.hourly.time[k].slice(11, 13); }), serie: [
        { valori: idx.map(function (k) { return j.hourly.wind_speed_10m[k]; }), colore: '#3DDC97', nome: 'Vento' },
        { valori: idx.map(function (k) { return j.hourly.wind_gusts_10m[k]; }), colore: '#FF8C42', nome: 'Raffiche', tratteggio: true }], min: 0, unita: 'km/h', h: 120 }) +
      '<p class="nota">La temperatura dell\'acqua è stimata dall\'andamento dell\'aria degli ultimi 30 giorni (non esiste un servizio gratuito di misure sui laghi italiani): usala come indicazione.</p>');
  }

  function disegnaTendenza() {
    var gg = S.r.consenso.giorni, d = S.dati;
    var et = gg.map(function (g, i) { return i === 0 ? 'oggi' : dataIt(g.data, { day: 'numeric' }); });
    var h = '';
    if (d.meteo) h += MC.grafico({ etichette: et, serie: [
      { valori: gg.map(function (g) { return g.tmax && g.tmax.med; }), fascia: gg.map(function (g) { return g.tmax ? [g.tmax.min, g.tmax.max] : null; }), colore: '#FF8C42', nome: 'Massime' },
      { valori: gg.map(function (g) { return g.tmin && g.tmin.med; }), fascia: gg.map(function (g) { return g.tmin ? [g.tmin.min, g.tmin.max] : null; }), colore: '#4FA3FF', nome: 'Minime' }], unita: '°C', h: 160 });
    if (d.pioggia) h += MC.grafico({ etichette: et, serie: [{ valori: gg.map(function (g) { return g.probPioggia == null ? null : g.probPioggia * 100; }), tipo: 'barre', colore: '#4FA3FF', nome: 'Probabilità di pioggia' }], min: 0, max: 100, unita: '%', h: 110 });
    if (d.pressione) h += MC.grafico({ etichette: et, serie: [{ valori: gg.map(function (g) { return g.press && g.press.media; }), colore: '#B58CFF', nome: 'Pressione media' }], unita: 'hPa', h: 110 });
    h += MC.grafico({ etichette: et, serie: [{ valori: gg.map(function (g) { return g.n; }), tipo: 'barre', colore: 'rgba(255,255,255,.45)', nome: 'Modelli disponibili' }], min: 0, unita: 'n. modelli', h: 90 });
    $('#tendenza').innerHTML = card('📈 Tendenza 15 giorni', '', h + '<p class="nota">La fascia colorata mostra quanto i modelli sono in disaccordo: più è larga, meno è sicura la previsione. Dopo 7–10 giorni restano solo i modelli a lungo raggio (ECMWF, GFS, JMA…).</p>');
  }

  function disegnaFonti() {
    var st = S.r.stato, ok = st.filter(function (s) { return s.ok; }).length;
    var mod = {}; MC.MODELLI.forEach(function (m) { mod[m.id] = m; });
    $('#fonti').innerHTML = card('🛰️ Fonti analizzate', ok + ' su ' + st.length + ' attive',
      '<div class="fonti"><ul>' + st.map(function (s) {
        var m = mod[s.id] || {};
        return '<li><span>' + esc(s.nome) + '<br><small style="color:var(--tenue)">' + esc(m.ente || '') + ' · fino a ' + (m.giorni || '?') + ' giorni</small></span>' +
          (s.ok ? '<span class="ok">✓ usato</span>' : '<span class="ko" title="' + esc(s.errore) + '">✗ ' + (s.errore && s.errore.indexOf('zona') >= 0 ? 'non copre la zona' : 'non disponibile') + '</span>') + '</li>';
      }).join('') + '</ul></div><p class="nota">Ogni modello è un "meteo" indipendente calcolato da un ente diverso. Il tipo di tempo è deciso a maggioranza; temperature, vento e pressione sono la mediana; la probabilità di pioggia è la quota di modelli che la prevedono.</p>');
  }

  /* ---------- fogli: luogo e impostazioni ---------- */
  function apriFoglio(html) {
    var f = $('#foglio'); f.innerHTML = html; f.hidden = false; $('#velo').hidden = false;
    var x = f.querySelector('.chiudi'); if (x) x.onclick = chiudiFoglio;
  }
  function chiudiFoglio() { $('#foglio').hidden = true; $('#velo').hidden = true; }

  function rigaLuogo(l, i) {
    return '<li><button class="go" data-i="' + i + '" type="button"><b>' + esc(l.nome) + '</b><small>' + esc([l.zona, l.paese].filter(Boolean).join(' · ')) + '</small></button>' +
      '<button class="ic' + (l.pref ? ' on' : '') + '" data-pref="' + i + '" type="button" title="Preferito">' + (l.pref ? '★' : '☆') + '</button>' +
      '<button class="ic" data-del="' + i + '" type="button" title="Rimuovi">✕</button></li>';
  }
  function apriLuoghi() {
    apriFoglio('<h2>Scegli il luogo <button class="chiudi" aria-label="Chiudi">×</button></h2>' +
      '<div class="cerca"><input id="qLuogo" type="search" placeholder="Città, paese, località…" autocomplete="off" enterkeyhint="search"><button id="btnGps" class="btn sec" type="button" title="Usa la mia posizione">📍</button></div>' +
      '<label class="check"><input id="chkMondo" type="checkbox"' + (S.soloItalia ? '' : ' checked') + '> Cerca anche fuori dall\'Italia</label>' +
      '<ul id="risultati" class="lista"></ul><div id="memoria"></div>');
    var inp = $('#qLuogo'), tm = null, risultati = [];
    disegnaMemoria();
    setTimeout(function () { inp.focus(); }, 150);
    inp.oninput = function () {
      clearTimeout(tm);
      var t = inp.value.trim();
      if (t.length < 2) { $('#risultati').innerHTML = ''; return; }
      tm = setTimeout(function () {
        MC.cercaLuoghi(t, S.soloItalia).then(function (r) {
          risultati = r;
          $('#risultati').innerHTML = r.length ? r.map(function (l, i) {
            return '<li><button class="go" data-r="' + i + '" type="button"><b>' + esc(l.nome) + '</b><small>' + esc([l.zona, l.paese].filter(Boolean).join(' · ')) + (l.quota != null ? ' · ' + Math.round(l.quota) + ' m' : '') + '</small></button></li>';
          }).join('') : '<li class="vuoto">Nessun risultato' + (S.soloItalia ? ' in Italia' : '') + '.</li>';
          Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (b) { b.onclick = function () { scegliLuogo(risultati[+b.dataset.r]); }; });
        }).catch(function () { $('#risultati').innerHTML = '<li class="vuoto">Ricerca non riuscita: sei online?</li>'; });
      }, 300);
    };
    $('#chkMondo').onchange = function () { S.soloItalia = !this.checked; MC.scrivi('soloItalia', S.soloItalia); inp.oninput(); };
    $('#btnGps').onclick = function () {
      if (!navigator.geolocation) return avviso('Posizione non disponibile su questo dispositivo.');
      avviso('Cerco la tua posizione…');
      navigator.geolocation.getCurrentPosition(function (p) {
        var lat = p.coords.latitude, lon = p.coords.longitude;
        MC.nomeDaCoordinate(lat, lon).then(function (n) { scegliLuogo({ nome: n.nome, zona: n.zona, paese: n.paese, lat: lat, lon: lon }); });
      }, function () { avviso('Permesso di posizione negato.'); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    };
  }
  function disegnaMemoria() {
    var box = $('#memoria'); if (!box) return;
    var pref = [], rec = [];
    S.luoghi.forEach(function (l, i) { (l.pref ? pref : rec).push(rigaLuogo(l, i)); });
    box.innerHTML = (pref.length ? '<h4>★ Preferiti</h4><ul class="lista">' + pref.join('') + '</ul>' : '') +
      (rec.length ? '<h4>Recenti</h4><ul class="lista">' + rec.join('') + '</ul>' : '') +
      (!pref.length && !rec.length ? '<p class="nota">I luoghi che consulti vengono ricordati qui. Tocca ☆ per tenerli tra i preferiti.</p>' : '');
    Array.prototype.forEach.call(box.querySelectorAll('[data-i]'), function (b) { b.onclick = function () { scegliLuogo(S.luoghi[+b.dataset.i]); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-pref]'), function (b) {
      b.onclick = function () { var l = S.luoghi[+b.dataset.pref]; l.pref = !l.pref; MC.scrivi('luoghi', S.luoghi); disegnaMemoria(); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-del]'), function (b) {
      b.onclick = function () { S.luoghi.splice(+b.dataset.del, 1); MC.scrivi('luoghi', S.luoghi); disegnaMemoria(); };
    });
  }

  function apriImpostazioni() {
    apriFoglio('<h2>Dati da mostrare <button class="chiudi" aria-label="Chiudi">×</button></h2>' +
      '<div class="interr">' + DATI.map(function (x) {
        return '<label><input type="checkbox" data-dato="' + x.k + '"' + (S.dati[x.k] ? ' checked' : '') + '> ' + x.ic + ' ' + x.nome + '</label>';
      }).join('') + '</div>' +
      '<h4>Modelli da mettere a confronto</h4><div class="interr modelli">' + MC.MODELLI.map(function (m) {
        return '<label><input type="checkbox" data-mod="' + m.id + '"' + (S.modelli[m.id] === false ? '' : ' checked') + '> ' + esc(m.nome) + '<small>' + esc(m.paese) + ' · ' + m.giorni + ' gg</small></label>';
      }).join('') + '</div>' +
      '<h4>Widget</h4><p class="nota" style="margin-top:0">Apri la versione compatta e aggiungila alla schermata Home (menu del browser → "Aggiungi a schermata Home"): avrai un riquadro con il meteo del luogo scelto.</p>' +
      '<p><a class="btn sec" style="display:inline-block;text-decoration:none" href="widget.html">Apri il widget</a></p>' +
      '<p style="margin-top:18px"><button class="btn" id="btnApplica" type="button">Applica</button></p>');
    $('#btnApplica').onclick = function () {
      var primaD = JSON.stringify(S.dati), primaM = JSON.stringify(S.modelli);
      Array.prototype.forEach.call(document.querySelectorAll('[data-dato]'), function (c) { S.dati[c.dataset.dato] = c.checked; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-mod]'), function (c) { if (c.checked) delete S.modelli[c.dataset.mod]; else S.modelli[c.dataset.mod] = false; });
      var attivi = MC.MODELLI.filter(function (m) { return S.modelli[m.id] !== false; }).length;
      if (!attivi) { S.modelli = {}; avviso('Serve almeno un modello: li ho riattivati tutti.'); }
      MC.scrivi('dati', S.dati); MC.scrivi('modelli', S.modelli);
      chiudiFoglio();
      var servonoNuovi = primaM !== JSON.stringify(S.modelli) ||
        (S.dati.mari && !(S.r && S.r.mare)) || (S.dati.laghi && !(S.r && S.r.lago)) ||
        ((S.dati.uv || S.dati.pollini || S.dati.polveri) && !(S.r && S.r.aria));
      if (servonoNuovi) carica(true); else if (primaD !== JSON.stringify(S.dati)) disegna();
    };
  }

  /* ---------- avvio ---------- */
  $('#btnLuogo').onclick = apriLuoghi;
  $('#btnImpost').onclick = apriImpostazioni;
  $('#btnRicarica').onclick = function () { carica(true); };
  $('#velo').onclick = chiudiFoglio;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') chiudiFoglio(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) carica(false); });
  window.addEventListener('online', function () { carica(false); });
  setInterval(function () { if (S.r) disegnaOra(); }, 5 * 60 * 1000);

  var v = document.querySelector('script[data-version]');
  $('#versione').textContent = v ? 'v' + v.dataset.version : '';
  mostraLuogo();
  if (!S.luoghi.length) ricordaLuogo(S.luogo);
  S.r = leggiCache();
  if (S.r) disegna();
  carica(!S.r || Date.now() - S.r.quando > VALIDITA);
})();
