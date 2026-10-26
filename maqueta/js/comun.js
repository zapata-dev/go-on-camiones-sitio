/*!
 * Go On Camiones — comun.js (lo carga el shell en TODAS las páginas)
 * Script clásico (IIFE), sin red. Depende de nucleo.js (window.GOON).
 *
 * Qué hace:
 *   - cabecera sólida al hacer scroll, menú móvil accesible (trampa de foco, Esc)
 *   - barra fija inferior en celular tras el primer pliegue
 *   - navegación activa (aria-current) según <body data-nav>
 *   - scroll suave en anclas internas (respeta prefers-reduced-motion)
 *   - fechas de corte:      <time data-corte>            -> «24 sep 2026»
 *                           data-corte="larga|dia-mes|mes" (GOON.fmt.fecha)
 *   - conteos del catálogo: data-conteo="go_on|red|con_foto|por_sucursal.queretaro"
 *                           data-conteo-barra="por_sucursal" · data-conteo-plazas="por_sucursal"
 *   - contadores:           data-contador (con data-conteo o data-dato numérico):
 *                           el DOM tiene SIEMPRE el valor final; la animación
 *                           (≤ 800 ms, solo al entrar en pantalla) la dibuja un
 *                           ::after de CSS, nunca el texto. Sin animación con
 *                           movimiento reducido, al imprimir o en modo estático.
 *   - revelados:            data-revela ["izq"|"der"|"escala"] (+ style="--i:n")
 *   - medición:             page_view + vista_pagina al montar; vista_seccion
 *                           para cada [data-seccion] que entra a la vista
 *   - contexto de WhatsApp de la página: un elemento con data-unidad-pagina="<id>"
 *     (y opcional data-lote-pagina="<lote>") dentro de <main> hace que la cabecera,
 *     el menú, la banda y la barra móvil ([data-wa-pagina]) pregunten por esa unidad.
 *   - al terminar de montar (datos aplicados, contadores en su valor final) pone
 *     window.GOON_LISTO = true, html.goon-listo y despacha document «goon:listo».
 *
 * API que agrega a window.GOON:
 *   GOON.params() -> {clave: valor} · GOON.param(clave, defecto)
 *   GOON.ponerParams({clave: valor|null}) (history.replaceState; en file:// puede no
 *     cambiar la barra de direcciones, pero nunca truena)
 *   GOON.sucursal(id) · GOON.nombreSucursal(id) · GOON.corte() · GOON.anioCorte()
 *   GOON.refrescar(raiz)   tras pintar contenido nuevo: datos, WhatsApp, conteos,
 *                          fechas, revelados y distintivos del modo P
 *   GOON.retenerListo()    -> soltar(): retrasa «goon:listo» hasta que se llame
 *   GOON.estatico()        congela todo en su estado final (capturas, PDF)
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;
  var html = doc.documentElement;

  var CAT = root.GOON_CATALOGO || { meta: {}, unidades: [] };
  var META = CAT.meta || {};
  var CONTEOS = META.conteos || {};
  var SUC = Array.isArray(root.GOON_SUCURSALES) ? root.GOON_SUCURSALES : [];
  var DUR_CONTADOR = 800; // ms, tope del contrato
  var MAX_ANIMABLE = 9999; // counter() de CSS no agrupa miles: arriba de esto no se anima

  function movReducido() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function estatico() { return html.classList.contains('goon-estatico'); }

  // ---------------------------------------------------------------------------
  // Parámetros de la URL (funcionan en file://)
  // ---------------------------------------------------------------------------
  function params() {
    var salida = {};
    var s = String((root.location && root.location.search) || '').replace(/^\?/, '');
    if (!s) return salida;
    s.split('&').forEach(function (par) {
      if (!par) return;
      var i = par.indexOf('=');
      var k = i === -1 ? par : par.slice(0, i);
      var v = i === -1 ? '' : par.slice(i + 1);
      try {
        k = decodeURIComponent(k.replace(/\+/g, ' '));
        v = decodeURIComponent(v.replace(/\+/g, ' '));
      } catch (e) { return; }
      if (k) salida[k] = v;
    });
    return salida;
  }

  function param(clave, defecto) {
    var p = params();
    return Object.prototype.hasOwnProperty.call(p, clave) ? p[clave] : (defecto === undefined ? null : defecto);
  }

  function ponerParams(cambios) {
    var p = params();
    Object.keys(cambios || {}).forEach(function (k) {
      var v = cambios[k];
      if (v === null || v === undefined || v === '') delete p[k];
      else p[k] = String(v);
    });
    var partes = Object.keys(p).map(function (k) {
      return encodeURIComponent(k) + (p[k] === '' ? '' : '=' + encodeURIComponent(p[k]));
    });
    var loc = root.location || {};
    var nueva = (loc.pathname || '') + (partes.length ? '?' + partes.join('&') : '') + (loc.hash || '');
    try {
      if (root.history && root.history.replaceState) root.history.replaceState(null, '', nueva);
    } catch (e) { /* file:// en algunos navegadores: se ignora */ }
    return p;
  }

  // ---------------------------------------------------------------------------
  // Datos del corte y sucursales
  // ---------------------------------------------------------------------------
  function sucursal(id) {
    for (var i = 0; i < SUC.length; i++) if (SUC[i] && SUC[i].id === id) return SUC[i];
    return null;
  }
  function nombreSucursal(id) {
    var s = sucursal(id);
    return s && s.nombre ? s.nombre : (id || '');
  }
  function corte() { return META.fecha_corte || null; }
  function anioCorte() {
    var m = /^(\d{4})/.exec(String(META.fecha_corte || ''));
    return m ? Number(m[1]) : new Date().getFullYear();
  }

  function valorConteo(ruta) {
    var v = G.dato(ruta, CONTEOS);
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function pintarCortes(raiz) {
    G.qsa('[data-corte]', raiz).forEach(function (el) {
      var estilo = el.getAttribute('data-corte') || 'corta';
      el.textContent = G.fmt.fecha(META.fecha_corte, estilo);
      if (META.fecha_corte && String(el.tagName).toUpperCase() === 'TIME') el.setAttribute('datetime', META.fecha_corte);
    });
  }

  function pintarConteos(raiz) {
    G.qsa('[data-conteo]', raiz).forEach(function (el) {
      var v = valorConteo(el.getAttribute('data-conteo'));
      el.textContent = v === null ? '—' : G.fmt.numero(v);
      if (v !== null) el.setAttribute('data-final', String(v));
    });
    G.qsa('[data-conteo-barra]', raiz).forEach(function (el) {
      if (el.getAttribute('data-pintado')) return;
      var mapa = G.dato(el.getAttribute('data-conteo-barra'), CONTEOS) || {};
      ordenados(mapa).forEach(function (id, i) {
        var s = doc.createElement('span');
        s.style.flexGrow = String(mapa[id]);
        s.style.setProperty('--o', String(Math.max(0.35, 1 - i * 0.2)));
        s.title = nombreSucursal(id) + ': ' + G.fmt.numero(mapa[id]);
        el.appendChild(s);
      });
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-pintado', '1');
    });
    G.qsa('[data-conteo-plazas]', raiz).forEach(function (el) {
      if (el.getAttribute('data-pintado')) return;
      var mapa = G.dato(el.getAttribute('data-conteo-plazas'), CONTEOS) || {};
      ordenados(mapa).forEach(function (id, i) {
        var li = doc.createElement('li');
        var cuadro = doc.createElement('i');
        cuadro.setAttribute('aria-hidden', 'true');
        cuadro.style.setProperty('--o', String(Math.max(0.35, 1 - i * 0.2)));
        var cifra = doc.createElement('b');
        cifra.textContent = G.fmt.numero(mapa[id]);
        li.appendChild(cuadro);
        li.appendChild(doc.createTextNode(nombreSucursal(id) + ' '));
        li.appendChild(cifra);
        el.appendChild(li);
      });
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Unidades por sucursal');
      el.setAttribute('data-pintado', '1');
    });
  }

  // Solo sucursales con unidades (las que están en 0 no se muestran en público).
  function ordenados(mapa) {
    return Object.keys(mapa || {})
      .filter(function (k) { return typeof mapa[k] === 'number' && mapa[k] > 0; })
      .sort(function (a, b) { return mapa[b] - mapa[a]; });
  }

  // ---------------------------------------------------------------------------
  // Contadores: ::after con @property (el texto del DOM no cambia)
  // ---------------------------------------------------------------------------
  var ioContadores = null;

  function valorFinal(el) {
    var t = el.getAttribute('data-final');
    if (t === null) t = String(el.textContent || '').replace(/[^\d]/g, '');
    var n = Number(t);
    return t !== '' && isFinite(n) ? n : null;
  }

  function terminarContador(el) {
    el.classList.remove('goon-contando');
    el.removeAttribute('data-goon-animando');
  }

  function animarContador(el) {
    if (el.getAttribute('data-contado')) return;
    el.setAttribute('data-contado', '1');
    var n = valorFinal(el);
    if (n === null || n > MAX_ANIMABLE || n <= 0 || movReducido() || estatico()) return;
    var color = '';
    try { color = root.getComputedStyle(el).color; } catch (e) { color = ''; }
    el.style.setProperty('--goon-final', String(Math.round(n)));
    if (color) el.style.setProperty('--goon-color', color);
    el.style.setProperty('--goon-dur', DUR_CONTADOR + 'ms');
    el.setAttribute('data-goon-animando', '');
    el.classList.add('goon-contando');
    var hecho = false;
    function fin() {
      if (hecho) return;
      hecho = true;
      terminarContador(el);
    }
    el.addEventListener('animationend', fin);
    root.setTimeout(fin, DUR_CONTADOR + 150);
  }

  function enVista(el) {
    if (!el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    var alto = root.innerHeight || html.clientHeight || 0;
    return r.bottom > 0 && r.top < alto && (r.width > 0 || r.height > 0);
  }

  function prepararContadores(raiz) {
    var lista = G.qsa('[data-contador]', raiz).filter(function (el) { return !el.getAttribute('data-contado'); });
    if (!lista.length) return;
    if (movReducido() || estatico() || !('IntersectionObserver' in root)) {
      lista.forEach(function (el) { el.setAttribute('data-contado', '1'); });
      return;
    }
    if (!ioContadores) {
      ioContadores = new root.IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          ioContadores.unobserve(e.target);
          animarContador(e.target);
        });
      }, { threshold: 0.4 });
    }
    lista.forEach(function (el) {
      // Los que ya están en pantalla arrancan ya: así «goon:listo» sale con su animación en curso
      // (render_capturas espera a que no quede ningún [data-goon-animando]).
      if (enVista(el)) animarContador(el);
      else ioContadores.observe(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Revelados
  // ---------------------------------------------------------------------------
  var ioRevela = null;

  function prepararRevelados(raiz) {
    var lista = G.qsa('[data-revela]', raiz).filter(function (el) { return !el.classList.contains('es-visible'); });
    if (!lista.length) return;
    if (estatico() || movReducido() || !('IntersectionObserver' in root)) {
      lista.forEach(function (el) { el.classList.add('es-visible'); });
      return;
    }
    if (!ioRevela) {
      ioRevela = new root.IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('es-visible');
          ioRevela.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    }
    lista.forEach(function (el) { ioRevela.observe(el); });
  }

  function revelarTodo() {
    G.qsa('[data-revela]').forEach(function (el) { el.classList.add('es-visible'); });
    G.qsa('[data-contador]').forEach(function (el) {
      el.setAttribute('data-contado', '1');
      terminarContador(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Navegación: activa, cabecera, barra móvil, menú, anclas
  // ---------------------------------------------------------------------------
  function marcarNavegacion() {
    var activa = doc.body ? doc.body.getAttribute('data-nav') : '';
    if (!activa) return;
    G.qsa('[data-nav-id]').forEach(function (a) {
      if (a.getAttribute('data-nav-id') === activa) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  var cabecera = null;
  var barra = null;
  var pendienteScroll = false;

  function alDesplazar() {
    pendienteScroll = false;
    var y = root.pageYOffset || html.scrollTop || 0;
    if (cabecera) cabecera.classList.toggle('es-solida', y > 24);
    if (barra) {
      var umbral = Math.max(240, (root.innerHeight || 700) * 0.6);
      barra.classList.toggle('es-visible', y > umbral);
    }
  }

  function programarScroll() {
    if (pendienteScroll) return;
    pendienteScroll = true;
    if (root.requestAnimationFrame) root.requestAnimationFrame(alDesplazar);
    else root.setTimeout(alDesplazar, 16);
  }

  var menu = null;
  var botonMenu = null;
  var focoPrevioMenu = null;

  function enfocables(contenedor) {
    return G.qsa('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', contenedor)
      .filter(function (n) { return n.offsetParent !== null || n === doc.activeElement; });
  }

  function atraparFoco(ev, contenedor) {
    var nodos = enfocables(contenedor);
    if (!nodos.length) return;
    var primero = nodos[0];
    var ultimo = nodos[nodos.length - 1];
    if (ev.shiftKey && (doc.activeElement === primero || !contenedor.contains(doc.activeElement))) {
      ev.preventDefault(); ultimo.focus();
    } else if (!ev.shiftKey && (doc.activeElement === ultimo || !contenedor.contains(doc.activeElement))) {
      ev.preventDefault(); primero.focus();
    }
  }

  function abrirMenu() {
    if (!menu) return;
    focoPrevioMenu = doc.activeElement;
    menu.hidden = false;
    doc.body.classList.add('sin-scroll');
    if (botonMenu) botonMenu.setAttribute('aria-expanded', 'true');
    var destino = menu.querySelector('.menu-movil__lista a') || menu.querySelector('a, button');
    if (destino) destino.focus();
  }

  function cerrarMenu(devolverFoco) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    doc.body.classList.remove('sin-scroll');
    if (botonMenu) botonMenu.setAttribute('aria-expanded', 'false');
    if (devolverFoco !== false && focoPrevioMenu && focoPrevioMenu.focus) focoPrevioMenu.focus();
  }

  function irAncla(ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a || a.hasAttribute('data-wa') || a.hasAttribute('data-wa-unidad')) return false;
    var id = a.getAttribute('href').slice(1);
    if (!id) return false;
    var destino = doc.getElementById(id);
    if (!destino) return false;
    ev.preventDefault();
    cerrarMenu(false);
    if (destino.hidden) return true;
    try {
      destino.scrollIntoView({ behavior: movReducido() ? 'auto' : 'smooth', block: 'start' });
    } catch (e) { destino.scrollIntoView(); }
    if (!destino.hasAttribute('tabindex')) destino.setAttribute('tabindex', '-1');
    try { destino.focus({ preventScroll: true }); } catch (e2) { /* navegadores viejos */ }
    try { if (root.history && root.history.replaceState) root.history.replaceState(null, '', '#' + id); } catch (e3) { /* file:// */ }
    return true;
  }

  function alClic(ev) {
    if (ev.defaultPrevented) return;
    if (irAncla(ev)) return;
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-accion]') : null;
    if (!t) return;
    var accion = t.getAttribute('data-accion');
    if (accion === 'menu') abrirMenu();
    else if (accion === 'menu-cerrar') cerrarMenu();
    else if (accion === 'presentacion') cerrarMenu(false);
  }

  function alTeclear(ev) {
    if (!menu || menu.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); cerrarMenu(); return; }
    if (ev.key === 'Tab') atraparFoco(ev, menu);
  }

  // ---------------------------------------------------------------------------
  // Contexto de WhatsApp de la página (fichas)
  // ---------------------------------------------------------------------------
  function contextoWhatsApp() {
    var marca = G.qs('#contenido [data-unidad-pagina]');
    if (!marca) return;
    var id = marca.getAttribute('data-unidad-pagina');
    var lote = marca.getAttribute('data-lote-pagina');
    G.qsa('[data-wa-pagina]').forEach(function (el) {
      if (id) el.setAttribute('data-wa-unidad', id);
      if (lote) el.setAttribute('data-wa-lote', lote);
    });
  }

  // ---------------------------------------------------------------------------
  // Medición de página y secciones
  // ---------------------------------------------------------------------------
  function nombrePagina() {
    var ruta = String((root.location && root.location.pathname) || '');
    var ultimo = ruta.split(/[\\/]/).pop() || 'index.html';
    ultimo = ultimo.replace(/\.html?$/i, '') || 'index';
    return ultimo;
  }

  function medirPagina() {
    var nombre = nombrePagina();
    var marca = G.qs('#contenido [data-unidad-pagina]');
    var esFicha = /^unidad-/.test(nombre);
    var pagina = esFicha ? 'ficha' : (nombre === 'index' ? 'inicio' : nombre);
    G.evento('page_view', { pagina: pagina });
    var props = { pagina: pagina, corte: META.fecha_corte || null, unidades_go_on: valorConteo('go_on') };
    if (marca) props.unidad_id = marca.getAttribute('data-unidad-pagina');
    G.evento('vista_pagina', props);
    return pagina;
  }

  var ioSecciones = null;
  var seccionesVistas = {};
  var paginaActual = '';

  function prepararSecciones(raiz) {
    if (!('IntersectionObserver' in root)) return;
    var lista = G.qsa('[data-seccion]', raiz).filter(function (el) { return !el.getAttribute('data-seccion-medida'); });
    if (!lista.length) return;
    if (!ioSecciones) {
      ioSecciones = new root.IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          var id = e.target.getAttribute('data-seccion');
          ioSecciones.unobserve(e.target);
          if (!id || seccionesVistas[id]) return;
          seccionesVistas[id] = true;
          G.evento('vista_seccion', { pagina: paginaActual, seccion: id });
        });
      }, { threshold: 0.3 });
    }
    lista.forEach(function (el) {
      el.setAttribute('data-seccion-medida', '1');
      ioSecciones.observe(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Refresco, modo estático y «goon:listo»
  // ---------------------------------------------------------------------------
  function despachar(nombre, detalle) {
    var ev = null;
    try { ev = new root.CustomEvent(nombre, { detail: detalle || null }); } catch (e) {
      try { ev = doc.createEvent('CustomEvent'); ev.initCustomEvent(nombre, false, false, detalle || null); } catch (e2) { ev = null; }
    }
    if (ev) doc.dispatchEvent(ev);
  }

  function refrescar(raiz) {
    var base = raiz || doc;
    pintarCortes(base);
    pintarConteos(base);
    G.aplicarDatos(base);
    G.enlazarWhatsApp(base);
    contextoWhatsApp();
    prepararRevelados(base);
    prepararContadores(base);
    prepararSecciones(base);
    despachar('goon:contenido', { raiz: base });
  }

  function aEstatico() {
    html.classList.add('goon-estatico');
    revelarTodo();
    return true;
  }

  var retenciones = 0;
  var montado = false;
  var listoEmitido = false;

  function emitirListo() {
    if (listoEmitido || !montado || retenciones > 0) return;
    listoEmitido = true;
    root.GOON_LISTO = true;
    html.classList.add('goon-listo');
    html.classList.remove('js-fallo');
    if (!/(^|\s)js(\s|$)/.test(html.className)) html.classList.add('js');
    despachar('goon:listo', { pagina: paginaActual, corte: META.fecha_corte || null });
  }

  function retenerListo() {
    retenciones++;
    var soltado = false;
    return function soltar() {
      if (soltado) return;
      soltado = true;
      retenciones = Math.max(0, retenciones - 1);
      emitirListo();
    };
  }

  function finalizar() {
    refrescar(doc);
    alDesplazar();
    paginaActual = medirPagina();
    montado = true;
    emitirListo();
  }

  function iniciar() {
    cabecera = G.qs('#cabecera');
    barra = G.qs('[data-barra-movil]');
    menu = G.qs('#menu-movil');
    botonMenu = G.qs('[data-accion="menu"]');
    if (param('estatico') === '1') aEstatico();
    marcarNavegacion();
    pintarCortes(doc);
    pintarConteos(doc);
    contextoWhatsApp();
    root.addEventListener('scroll', programarScroll, { passive: true });
    root.addEventListener('resize', function () {
      programarScroll();
      if (root.innerWidth >= 1100) cerrarMenu(false);
    });
    root.addEventListener('beforeprint', revelarTodo);
    doc.addEventListener('click', alClic);
    doc.addEventListener('keydown', alTeclear);
    // Después de TODOS los DOMContentLoaded (tarjetas y script de la página).
    root.setTimeout(finalizar, 0);
  }

  G.params = params;
  G.param = param;
  G.ponerParams = ponerParams;
  G.sucursal = sucursal;
  G.nombreSucursal = nombreSucursal;
  G.corte = corte;
  G.anioCorte = anioCorte;
  G.refrescar = refrescar;
  G.retenerListo = retenerListo;
  G.estatico = aEstatico;
  G._comun = { cerrarMenu: cerrarMenu, atraparFoco: atraparFoco, enfocables: enfocables, despachar: despachar };

  G.listo(iniciar);
})(window);
