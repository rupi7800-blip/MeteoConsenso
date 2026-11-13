/* widget.js — widget grande da mettere sulla schermata Home */
(function () {
  'use strict';
  var MC = window.MC, box = document.getElementById('w');
  var VALIDITA = 30 * 60 * 1000, occupato = false;
  function f0(v) { return v == null ? '–' : Math.round(v); }
  function nome(i, d) { return i === 0 ? 'Oggi' : i === 1 ? 'Domani' : new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' }); }

  function disegna(w) {
    if (!w || !w.giorni || !w.giorni.length) return;
    var o = w.ora || {}, cat = o.cat || w.giorni[0].cat || 'parziale';
    document.body.className = 'wbody tema-' + cat + (o.notte ? ' notte' : '');
    var g0 = w.giorni[0];
    var lo = Math.min.apply(null, w.giorni.map(function (g) { return g.min; }).filter(function (x) { return x != null; }));
    var hi = Math.max.apply(null, w.giorni.map(function (g) { return g.max; }).filter(function (x) { return x != null; }));
    var rng = Math.max(1, hi - lo);
    var h = '<section class="wcard wnow">' +
      '<div class="wl"><b>📍 ' + (w.luogo ? w.luogo.nome : '') + '</b><small>agg. ' + new Date(w.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '</small></div>' +
      MC.icona(cat, o.notte, 92) + '<div class="wt">' + f0(o.temp) + '°</div>' +
      '<div class="wd">' + MC.TESTI[cat] + ' · oggi ' + MC.TESTI[g0.cat || cat].toLowerCase() + '</div>' +
      '<div class="wx"><span>↑ ' + f0(g0.max) + '° ↓ ' + f0(g0.min) + '°</span>' +
      (o.perc != null ? '<span>percepita ' + f0(o.perc) + '°</span>' : '') +
      (o.vento != null ? '<span>' + MC.freccia(o.dir, 12) + ' ' + f0(o.vento) + ' km/h</span>' : '') +
      (o.umid != null ? '<span>💧 umidità ' + f0(o.umid) + '%</span>' : '') +
      (g0.prob != null ? '<span>☔ ' + Math.round(g0.prob * 100) + '% oggi</span>' : '') + '</div></section>';
    if (w.ore && w.ore.length) {
      h += '<section class="wcard"><p class="wtit">Prossime 24 ore</p><div class="wh">' + w.ore.map(function (x, i) {
        return '<div><div class="h">' + (i === 0 ? 'Ora' : x.t.slice(11, 13)) + '</div>' + MC.icona(x.cat || 'parziale', x.notte, 32) +
          '<div class="t">' + f0(x.temp) + '°</div><div class="p">' + (x.prob ? Math.round(x.prob * 100) + '%' : '') + '</div></div>';
      }).join('') + '</div></section>';
    }
    h += '<section class="wcard"><p class="wtit">' + w.giorni.length + ' giorni</p><div class="wd10">' + w.giorni.map(function (g, i) {
      var a = g.min == null ? 0 : (g.min - lo) / rng * 100, b = g.max == null ? 0 : (g.max - lo) / rng * 100;
      return '<div class="wr"><span class="n">' + nome(i, g.data) + '</span>' + MC.icona(g.cat || 'parziale', false, 30) +
        '<span class="p">' + (g.prob ? Math.round(g.prob * 100) + '%' : '') + '</span><span class="mn">' + f0(g.min) + '°</span>' +
        '<span class="wbarra"><i style="left:' + a.toFixed(0) + '%;right:' + (100 - b).toFixed(0) + '%"></i></span><span class="mx">' + f0(g.max) + '°</span></div>';
    }).join('') + '</div></section>' +
      '<div class="wpie"><span>🗳️ ' + (g0.n || '–') + ' modelli · affidabilità ' + MC.etichettaAffidabilita(g0.aff || 0).toLowerCase() + '</span><span>MeteoConsenso</span></div>';
    box.innerHTML = h;
  }

  function aggiorna(forza) {
    var w = MC.leggi('widget', null);
    var luogo = MC.leggi('luogo', null) || (w && w.luogo) || { nome: 'Taino', zona: 'Varese, Lombardia', paese: 'IT', lat: 45.7636, lon: 8.6150 };
    var stesso = w && w.luogo && MC.chiaveLuogo(w.luogo) === MC.chiaveLuogo(luogo) && w.ore;
    if (stesso) disegna(w);
    if (occupato || !navigator.onLine) return;
    if (!forza && stesso && Date.now() - w.quando < VALIDITA) return;
    occupato = true;
    document.getElementById('rw').classList.add('gira');
    MC.scaricaPrevisioni(luogo.lat, luogo.lon, MC.leggi('modelli', {})).then(function (r) {
      var nw = MC.riassuntoWidget(r.consenso, luogo);
      MC.scrivi('widget', nw);
      disegna(nw);
    }).catch(function (e) {
      if (!stesso) box.innerHTML = '<div class="wcard carica">⚠️ ' + MC.messaggioErrore(e) + '</div>';
    }).then(function () { occupato = false; document.getElementById('rw').classList.remove('gira'); });
  }

  document.getElementById('rw').onclick = function () { aggiorna(true); };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) aggiorna(false); });
  setInterval(function () { aggiorna(false); }, 10 * 60 * 1000);
  aggiorna(false);
})();
