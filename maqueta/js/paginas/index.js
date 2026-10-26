/*!
 * Go On Camiones — js/paginas/index.js (Inicio)
 * Script clásico (IIFE), sin red. Depende de nucleo.js y comun.js (window.GOON).
 * Todo lo demás del Home es declarativo (data-dato, data-conteo, data-tarjetas,
 * data-wa, data-capa); este archivo solo hace tres cosas:
 *   1. [data-acento="palabra"] pinta esa palabra del texto (que llega por data-dato)
 *      con .acento-marca. Se re-aplica después de cada GOON.refrescar
 *      («goon:contenido») y de cada cambio de modo P («goon:modo»), porque
 *      aplicarDatos reescribe el texto.
 *   2. [data-proporcion] recibe --proporcion = go_on / red del catálogo (barra de
 *      la escalera). Sin conteos válidos, la barra se oculta.
 *   3. Vitrina de destacadas: en celular las tarjetas van en carrusel con desliz
 *      (solo CSS: scroll-snap). Aquí se pinta la guía «1 / 3 · Desliza», se marca
 *      la tarjeta visible y el carrusel recibe tabindex solo cuando de verdad
 *      desborda (así el teclado puede desplazarlo con las flechas). Sin JS la
 *      guía queda oculta y el carrusel sigue funcionando con el dedo.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;

  // ---------------------------------------------------------------------------
  // 1. Acento de marca en el eslogan
  // ---------------------------------------------------------------------------
  function acentuar(raiz) {
    G.qsa('[data-acento]', raiz || doc).forEach(function (el) {
      var palabra = el.getAttribute('data-acento');
      if (!palabra || el.children.length) return; // vacío o ya acentuado
      var texto = el.textContent || '';
      var i = texto.toLocaleLowerCase('es').indexOf(palabra.toLocaleLowerCase('es'));
      if (i < 0) return;
      var marca = doc.createElement('span');
      marca.className = 'acento-marca';
      marca.textContent = texto.slice(i, i + palabra.length);
      el.textContent = '';
      el.appendChild(doc.createTextNode(texto.slice(0, i)));
      el.appendChild(marca);
      el.appendChild(doc.createTextNode(texto.slice(i + palabra.length)));
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Proporción Go On / red (escalera)
  // ---------------------------------------------------------------------------
  function proporcion() {
    var conteos = ((root.GOON_CATALOGO || {}).meta || {}).conteos || {};
    var goOn = Number(conteos.go_on);
    var red = Number(conteos.red);
    var valida = isFinite(goOn) && isFinite(red) && goOn > 0 && red > 0;
    G.qsa('[data-proporcion]').forEach(function (barra) {
      if (!valida) { barra.hidden = true; return; }
      barra.style.setProperty('--proporcion', Math.min(1, goOn / red).toFixed(4));
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Vitrina (carrusel en celular)
  // ---------------------------------------------------------------------------
  var vitrina = null;

  function prepararVitrina() {
    var carril = G.qs('.inicio-tarjetas');
    var guia = G.qs('[data-vitrina-guia]');
    if (!carril || !guia) return null;
    var tarjetas = G.qsa('.tarjeta', carril);
    if (tarjetas.length < 2) { guia.hidden = true; return null; }

    var puntos = G.qs('[data-vitrina-puntos]', guia);
    var actual = G.qs('[data-vitrina-actual]', guia);
    var total = G.qs('[data-vitrina-total]', guia);
    if (puntos && !puntos.children.length) {
      tarjetas.forEach(function () { puntos.appendChild(doc.createElement('i')); });
    }
    if (total) total.textContent = String(tarjetas.length);
    guia.hidden = false;

    var texto = G.qs('[data-vitrina-texto]', guia);
    var v = { carril: carril, tarjetas: tarjetas, puntos: puntos ? G.qsa('i', puntos) : [], actual: actual, texto: texto, indice: -1, pendiente: false };

    function paso() {
      var t = v.tarjetas[0];
      var hueco = 0;
      try { hueco = parseFloat(root.getComputedStyle(v.carril).columnGap) || 0; } catch (e) { hueco = 0; }
      return (t ? t.getBoundingClientRect().width : 0) + hueco;
    }

    function marcar() {
      v.pendiente = false;
      var p = paso();
      var i = p > 0 ? Math.round(v.carril.scrollLeft / p) : 0;
      i = Math.max(0, Math.min(v.tarjetas.length - 1, i));
      if (i === v.indice) return;
      v.indice = i;
      if (v.actual) v.actual.textContent = String(i + 1);
      v.puntos.forEach(function (punto, k) { punto.classList.toggle('es-actual', k === i); });
      if (v.texto) v.texto.textContent = i === v.tarjetas.length - 1 ? 'Desliza para regresar' : 'Desliza para ver más';
    }

    function programar() {
      if (v.pendiente) return;
      v.pendiente = true;
      if (root.requestAnimationFrame) root.requestAnimationFrame(marcar);
      else root.setTimeout(marcar, 16);
    }

    // Enfocable solo si desborda (celular): así no sobra un tabulador en escritorio.
    function medir() {
      var desborda = v.carril.scrollWidth > v.carril.clientWidth + 1;
      if (desborda) v.carril.setAttribute('tabindex', '0');
      else v.carril.removeAttribute('tabindex');
      programar();
    }

    v.carril.addEventListener('scroll', programar, { passive: true });
    root.addEventListener('resize', medir);
    medir();
    marcar();
    return v;
  }

  // 4. Las tarjetas de una sola unidad no traen insignia: se les pone «Disponible», como en el diseño.
  function insignias() {
    G.qsa('.inicio-tarjetas .tarjeta__media').forEach(function (media) {
      if (G.qs('.tarjeta__insignia', media) || media.querySelector('.tarjeta__insignia--disponible')) return;
      var marca = G.qs('.plano__marca', media);
      if (marca) return; // sin foto: el plano ya trae su propia marca arriba a la derecha
      var s = doc.createElement('span');
      s.className = 'tarjeta__insignia tarjeta__insignia--disponible';
      s.textContent = 'Disponible';
      media.appendChild(s);
    });
  }

  // 5. Cada tarjeta lleva un solo botón, «Ver unidades» (en lugar de WhatsApp y «Ver ficha»).
  function botonesUnidades() {
    G.qsa('.inicio-tarjetas .tarjeta__acciones').forEach(function (acciones) {
      if (acciones.getAttribute('data-ver-unidades')) return;
      var a = doc.createElement('a');
      a.className = 'btn btn--primario';
      a.setAttribute('href', 'inventario.html');
      a.setAttribute('data-event', 'cta_ver_inventario');
      a.setAttribute('data-event-origen', 'destacadas_tarjeta');
      var texto = doc.createElement('span');
      texto.textContent = 'Ver unidades';
      a.appendChild(texto);
      acciones.textContent = '';
      acciones.setAttribute('data-ver-unidades', '1');
      acciones.appendChild(a);
    });
  }

  function alRepintar() {
    acentuar(doc);
    insignias();
    botonesUnidades();
    if (!vitrina) vitrina = prepararVitrina();
  }

  G.listo(function () {
    acentuar(doc);
    proporcion();
    insignias();
    botonesUnidades();
    vitrina = prepararVitrina();
    doc.addEventListener('goon:contenido', alRepintar);
    doc.addEventListener('goon:modo', alRepintar);
  });
})(window);
