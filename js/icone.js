/* icone.js — icone meteo e grafici in SVG (nessuna libreria esterna) */
(function () {
  'use strict';
  var MC = window.MC = window.MC || {};

  var SOLE = '<circle cx="32" cy="32" r="11" fill="#FFC53D"/><g stroke="#FFC53D" stroke-width="3.5" stroke-linecap="round">' +
    [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) {
      var r = a * Math.PI / 180, x1 = 32 + Math.cos(r) * 17, y1 = 32 + Math.sin(r) * 17, x2 = 32 + Math.cos(r) * 23, y2 = 32 + Math.sin(r) * 23;
      return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
    }).join('') + '</g>';
  var LUNA = '<path d="M38 12a20 20 0 1 0 14 30A16 16 0 0 1 38 12z" fill="#D9E2FF"/>';
  function nuvola(x, y, s, col) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M14 40h30a11 11 0 0 0 0-22 15 15 0 0 0-28-3A11 11 0 0 0 14 40z" fill="' + (col || '#E8EEF8') + '"/></g>';
  }
  function gocce(n, col) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<line x1="' + (22 + i * 9) + '" y1="48" x2="' + (19 + i * 9) + '" y2="57" stroke="' + (col || '#4FA3FF') + '" stroke-width="3.2" stroke-linecap="round"/>';
    return s;
  }
  function fiocchi() {
    return [22, 32, 42].map(function (x) { return '<text x="' + x + '" y="59" font-size="12" text-anchor="middle" fill="#fff">✻</text>'; }).join('');
  }

  MC.icona = function (cat, notte, size) {
    size = size || 48;
    var astro = notte ? LUNA : SOLE, c = '';
    switch (cat) {
      case 'sereno': c = astro; break;
      case 'poco': c = '<g transform="translate(-6 -6) scale(.9)">' + astro + '</g>' + nuvola(14, 16, 0.75); break;
      case 'parziale': c = '<g transform="translate(-8 -8) scale(.85)">' + astro + '</g>' + nuvola(4, 8, 0.95); break;
      case 'coperto': c = nuvola(-4, -2, 0.8, '#AFBCD0') + nuvola(4, 6, 0.95); break;
      case 'nebbia': c = nuvola(0, -4, 0.9, '#C5CFDD') + '<g stroke="#C5CFDD" stroke-width="3.5" stroke-linecap="round"><line x1="12" y1="46" x2="52" y2="46"/><line x1="16" y1="54" x2="48" y2="54"/></g>'; break;
      case 'pioggerella': c = nuvola(2, -2, 0.95) + gocce(3, '#7CC0FF'); break;
      case 'pioggia': c = nuvola(2, -4, 0.95, '#C9D4E5') + gocce(4); break;
      case 'neve': c = nuvola(2, -4, 0.95) + fiocchi(); break;
      case 'temporale': c = nuvola(2, -6, 0.95, '#9AA8BF') + '<path d="M34 36l-8 13h7l-4 12 12-16h-7l5-9z" fill="#FFD23F"/>'; break;
      default: c = nuvola(2, 2, 0.95, '#AFBCD0');
    }
    return '<svg class="ico" viewBox="0 0 64 64" width="' + size + '" height="' + size + '" aria-hidden="true">' + c + '</svg>';
  };

  MC.freccia = function (gradi, size) {
    if (gradi == null) return '';
    size = size || 18;
    // la direzione indica DA dove arriva il vento: la freccia punta dove va
    return '<svg class="frc" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" style="transform:rotate(' + Math.round(gradi + 180) + 'deg)"><path d="M12 3l6 15-6-4-6 4z" fill="currentColor"/></svg>';
  };

  /* Grafico a linee/barre con fascia min–max dei modelli.
     opz: { etichette:[], serie:[{valori, fascia:[[lo,hi]...], colore, tipo:'linea'|'barre', nome}], unita, h, min, max, decimali } */
  MC.grafico = function (opz) {
    var W = 360, H = Math.round((opz.h || 170) * 0.8), L = 30, R = 6, T = 10, B = 18;
    var tutti = [];
    opz.serie.forEach(function (s) {
      s.valori.forEach(function (v) { if (v != null) tutti.push(v); });
      (s.fascia || []).forEach(function (f) { if (f) { if (f[0] != null) tutti.push(f[0]); if (f[1] != null) tutti.push(f[1]); } });
    });
    if (!tutti.length) return '<p class="vuoto">Nessun dato disponibile.</p>';
    var lo = opz.min != null ? Math.min(opz.min, Math.min.apply(null, tutti)) : Math.min.apply(null, tutti);
    var hi = opz.max != null ? Math.max(opz.max, Math.max.apply(null, tutti)) : Math.max.apply(null, tutti);
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08; if (opz.min == null) lo -= pad; if (opz.max == null) hi += pad;
    var n = opz.etichette.length;
    function X(i) { return L + (n <= 1 ? 0 : i * (W - L - R) / (n - 1)); }
    function Y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    var dec = opz.decimali == null ? 0 : opz.decimali;
    var s = '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img">';
    // griglia
    for (var g = 0; g <= 3; g++) {
      var v = lo + (hi - lo) * g / 3, y = Y(v);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="gr"/>' +
        '<text x="' + (L - 5) + '" y="' + (y + 4).toFixed(1) + '" class="ga" text-anchor="end">' + v.toFixed(dec) + '</text>';
    }
    var passo = Math.max(1, Math.ceil(n / 8));
    opz.etichette.forEach(function (e, i) {
      if (i % passo === 0) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 4) + '" class="ga" text-anchor="middle">' + e + '</text>';
    });
    opz.serie.forEach(function (se) {
      var col = se.colore || '#4FA3FF';
      if (se.tipo === 'barre') {
        var bw = Math.max(2, (W - L - R) / n * 0.62);
        se.valori.forEach(function (v, i) {
          if (v == null) return;
          var y = Y(v), y0 = Y(Math.max(lo, 0));
          s += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + Math.min(y, y0).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.abs(y0 - y).toFixed(1) + '" rx="2" fill="' + col + '" opacity=".85"/>';
        });
        return;
      }
      if (se.fascia) {
        var su = [], giu = [];
        se.fascia.forEach(function (f, i) { if (f && f[0] != null && f[1] != null) { su.push(X(i).toFixed(1) + ',' + Y(f[1]).toFixed(1)); giu.unshift(X(i).toFixed(1) + ',' + Y(f[0]).toFixed(1)); } });
        if (su.length > 1) s += '<polygon points="' + su.concat(giu).join(' ') + '" fill="' + col + '" opacity=".18"/>';
      }
      var d = '', aperto = false;
      se.valori.forEach(function (v, i) {
        if (v == null) { aperto = false; return; }
        d += (aperto ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); aperto = true;
      });
      s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (se.tratteggio ? ' stroke-dasharray="5 4"' : '') + '/>';
    });
    s += '</svg>';
    var leg = opz.serie.filter(function (x) { return x.nome; }).map(function (x) {
      return '<span><i style="background:' + (x.colore || '#4FA3FF') + '"></i>' + x.nome + '</span>';
    }).join('');
    return '<div class="grafbox">' + s + (leg || opz.unita ? '<div class="leg">' + leg + (opz.unita ? '<span class="un">' + opz.unita + '</span>' : '') + (opz.nota ? '<span class="un">' + opz.nota + '</span>' : '') + '</div>' : '') + '</div>';
  };
})();
