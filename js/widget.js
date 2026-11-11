/* widget.js — vista compatta da aggiungere alla schermata Home */
(function () {
  'use strict';
  var MC = window.MC, box = document.getElementById('wdg');
  var VALIDITA = 30 * 60 * 1000, occupato = false;
  function f0(v) { return v == null ? '–' : Math.round(v); }
  function nome(i, d) { return i === 0 ? 'Oggi' : new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short' }); }

  function disegna(w) {
    if (!w || !w.giorni) return;
    var o = w.ora || {}, cat = o.cat || (w.giorni[0] && w.giorni[0].cat) || 'parziale';
    document.body.className = 'tema-' + cat + (o.notte ? ' notte' : '');
    var g0 = w.giorni[0] || {};
    box.innerHTML = '<div class="r1">' + MC.icona(cat, o.notte, 64) + '<div class="t">' + f0(o.temp) + '°</div>' +
      '<div class="l"><b>' + (w.luogo ? w.luogo.nome : '') + '</b><small>' + MC.TESTI[cat] + '<br>↑ ' + f0(g0.max) + '° ↓ ' + f0(g0.min) + '°</small></div></div>' +
      '<div class="r2">' + w.giorni.map(function (g, i) {
        return '<div><div class="n">' + nome(i, g.data) + '</div>' + MC.icona(g.cat || 'parziale', false, 30) +
          '<div><b>' + f0(g.max) + '°</b> <span style="color:var(--tenue)">' + f0(g.min) + '°</span></div>' +
          '<div class="p">' + (g.prob ? Math.round(g.prob * 100) + '%' : '') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="pie"><span>🗳️ ' + (g0.n || '–') + ' modelli · affidabilità ' + MC.etichettaAffidabilita(g0.aff || 0).toLowerCase() + '</span><span>' +
      new Date(w.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '</span></div>';
  }

  function aggiorna(forza) {
    var w = MC.leggi('widget', null);
    var luogo = MC.leggi('luogo', null) || (w && w.luogo) || { nome: 'Taino', zona: 'Varese, Lombardia', paese: 'IT', lat: 45.7636, lon: 8.6150 };
    var stessoLuogo = w && w.luogo && MC.chiaveLuogo(w.luogo) === MC.chiaveLuogo(luogo);
    if (w && stessoLuogo) disegna(w);
    if (occupato || !navigator.onLine) return;
    if (!forza && w && stessoLuogo && Date.now() - w.quando < VALIDITA) return;
    occupato = true;
    document.getElementById('rw').classList.add('gira');
    MC.scaricaPrevisioni(luogo.lat, luogo.lon, MC.leggi('modelli', {})).then(function (r) {
      var c = r.consenso;
      var adesso = MC.oraLocale(c.offset);
      var o = c.ore.filter(function (x) { return x.t <= adesso; }).pop() || c.ore[0];
      var g = c.giorni[0], notte = g && g.alba ? (o.t < g.alba.slice(0, 13) + ':00' || o.t > g.tramonto) : false;
      var nw = {
        luogo: luogo, quando: Date.now(),
        ora: { temp: o.temp && o.temp.med, cat: o.voto && o.voto.cat, notte: notte, pioggia: o.probPioggia },
        giorni: c.giorni.slice(0, 6).map(function (g) { return { data: g.data, cat: g.voto && g.voto.cat, max: g.tmax && g.tmax.med, min: g.tmin && g.tmin.med, prob: g.probPioggia, aff: g.affidabilita, n: g.n }; })
      };
      MC.scrivi('widget', nw);
      disegna(nw);
    }).catch(function () {
      if (!w) box.innerHTML = '<div class="carica" style="padding:30px 0">Dati non disponibili. Tocca per aprire l\'app.</div>';
    }).then(function () { occupato = false; document.getElementById('rw').classList.remove('gira'); });
  }

  document.getElementById('rw').onclick = function () { aggiorna(true); };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) aggiorna(false); });
  setInterval(function () { aggiorna(false); }, 10 * 60 * 1000);
  aggiorna(false);
})();
