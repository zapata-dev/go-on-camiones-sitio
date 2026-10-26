/*!
 * Go On Camiones — nosotros.js (solo nosotros.html)
 * Script clásico (IIFE), sin red. Depende de nucleo.js y comun.js (window.GOON).
 *
 *   [data-nos-red]         lista de sucursales agrupadas por estado (GOON_SUCURSALES):
 *                          solo nombres; ninguna cifra por sucursal.
 *   [data-nos-proporcion]  barra go_on / red del corte (GOON_CATALOGO.meta.conteos).
 *   [data-nos-serie="ruta"] ajusta el número de hijos al largo de la lista en
 *                          GOON_HECHOS (clona el último con índices corridos o
 *                          quita los que sobran) antes de que comun.js aplique datos.
 *   [data-nos-cuenta="ruta"] escribe con palabra cuántos elementos tiene esa lista.
 * Corre en GOON.listo, antes de que comun.js aplique datos y despache «goon:listo».
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;

  function sucursales() {
    return Array.isArray(root.GOON_SUCURSALES) ? root.GOON_SUCURSALES : [];
  }

  function conteos() {
    var cat = root.GOON_CATALOGO || {};
    return (cat.meta && cat.meta.conteos) || {};
  }

  function pintarRed() {
    var lista = G.qs('[data-nos-red]');
    if (!lista || lista.getAttribute('data-pintado')) return;
    var grupos = {};
    var orden = [];
    sucursales().forEach(function (s) {
      if (!s || !s.nombre || !s.estado) return;
      if (!grupos[s.estado]) { grupos[s.estado] = []; orden.push(s.estado); }
      grupos[s.estado].push(String(s.nombre));
    });
    orden.sort(function (a, b) {
      return (grupos[b].length - grupos[a].length) || a.localeCompare(b, 'es');
    });
    orden.forEach(function (estado) {
      var fila = doc.createElement('div');
      var dt = doc.createElement('dt');
      var dd = doc.createElement('dd');
      dt.textContent = estado;
      dd.textContent = grupos[estado].join(' · ');
      fila.appendChild(dt);
      fila.appendChild(dd);
      lista.appendChild(fila);
    });
    if (!orden.length) lista.hidden = true;
    lista.setAttribute('data-pintado', '1');
  }

  function pintarProporcion() {
    var barra = G.qs('[data-nos-proporcion] > span');
    if (!barra) return;
    var c = conteos();
    var goOn = Number(c.go_on);
    var red = Number(c.red);
    if (!isFinite(goOn) || !isFinite(red) || red <= 0) return;
    var pct = Math.max(0, Math.min(1, goOn / red)) * 100;
    barra.style.setProperty('--pct', pct.toFixed(2) + '%');
  }

  // ---------------------------------------------------------------------------
  // Series: la plantilla trae los elementos con sus índices (data-dato="x.lista.0…")
  // para que el HTML sirva sin JS; aquí se ajusta su número al largo real de la
  // lista en GOON_HECHOS. Si la lista crece, se clona el último elemento con los
  // índices corridos; si se acorta, sobran elementos y se quitan. Así un cambio
  // en hechos no deja elementos en blanco ni pierde elementos sin aviso.
  // ---------------------------------------------------------------------------
  function escaparRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function reindexar(nodo, ruta, desde, hacia) {
    var patron = new RegExp('^' + escaparRegex(ruta + '.' + desde) + '(?=$|\\.)');
    var nuevo = ruta + '.' + hacia;
    var todos = [nodo].concat(G.qsa('[data-dato], [data-nos-serie]', nodo));
    todos.forEach(function (el) {
      ['data-dato', 'data-nos-serie'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && patron.test(v)) el.setAttribute(attr, v.replace(patron, nuevo));
      });
    });
    if (nodo.style && nodo.style.getPropertyValue('--i') !== '') nodo.style.setProperty('--i', String(hacia));
  }

  function ajustarSerie(cont) {
    var ruta = cont.getAttribute('data-nos-serie');
    var lista = G.dato(ruta);
    if (!Array.isArray(lista)) return;
    var hijos = Array.prototype.filter.call(cont.children, function (n) { return n.nodeType === 1; });
    if (!hijos.length) return;
    var i;
    for (i = hijos.length - 1; i >= lista.length; i--) cont.removeChild(hijos[i]);
    var modelo = hijos[Math.min(hijos.length, lista.length) - 1];
    if (!modelo) return;
    var desde = Math.min(hijos.length, lista.length) - 1;
    for (i = hijos.length; i < lista.length; i++) {
      var copia = modelo.cloneNode(true);
      copia.removeAttribute('id');
      reindexar(copia, ruta, desde, i);
      cont.appendChild(copia);
    }
    if (root.console && root.console.warn && hijos.length !== lista.length) {
      root.console.warn('[GOON] nosotros: la serie "' + ruta + '" tiene ' + lista.length +
        ' elementos en hechos y ' + hijos.length + ' en la plantilla; se ajustó.');
    }
  }

  function ajustarSeries() {
    // De afuera hacia adentro: las series internas de un clon ya traen su ruta corrida.
    var hechas = [];
    var pendientes;
    while ((pendientes = G.qsa('[data-nos-serie]').filter(function (n) { return hechas.indexOf(n) === -1; })).length) {
      var nodo = pendientes[0];
      ajustarSerie(nodo);
      hechas.push(nodo);
    }
  }

  var PALABRAS = ['Cero', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];

  function pintarCuentas() {
    G.qsa('[data-nos-cuenta]').forEach(function (el) {
      var lista = G.dato(el.getAttribute('data-nos-cuenta'));
      if (!Array.isArray(lista)) return;
      var n = lista.length;
      el.textContent = PALABRAS[n] || G.fmt.numero(n);
    });
  }

  G.listo(function () {
    ajustarSeries();
    pintarCuentas();
    pintarRed();
    pintarProporcion();
  });
})(window);
