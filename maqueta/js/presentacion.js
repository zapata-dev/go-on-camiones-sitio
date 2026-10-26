/*!
 * Go On Camiones — presentacion.js (distintivos de capa + vista previa de WhatsApp)
 * Script clásico (IIFE), sin red. Depende de nucleo.js y comun.js.
 *
 * El modo presentación ya no se activa desde la página: sin tecla P, sin botones,
 * sin consola de medición y sin ?p=1.
 *   - data-capa="ya_opera:<id> se_construye:<id> ilustrativo:<id>" (ids de
 *     GOON_HECHOS.capas): los distintivos se siguen pintando, ocultos por
 *     presentacion.css, porque .tiene-capa da posición a algunos bloques.
 *     Se repintan con «goon:contenido» (GOON.refrescar).
 *
 * Vista previa de WhatsApp (#wa-demo, <dialog> nativo del shell):
 *   escucha «goon:wa-demo» (lo emite nucleo.js en modo demo) y muestra el
 *   mensaje, el ruteo propuesto (sucursal + centro SAP) y copiar. Nunca abre wa.me.
 *   Esc y el botón Cerrar la cierran; el foco vuelve al botón que la abrió.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;
  var html = doc.documentElement;

  var ROTULOS = { ya_opera: 'Ya opera', se_construye: 'Se construye', ilustrativo: 'Ilustrativo' };
  var TIPOS = ['ya_opera', 'se_construye', 'ilustrativo'];
  // Ids viejos de los conceptos (fase B) -> ids vigentes de hechos.capas
  var ALIAS = { 'fotos-por-lote': 'fotos-lote', 'reporte-inspeccion': 'reporte-muestra' };
  var VACIOS = { IMG: 1, INPUT: 1, BR: 1, HR: 1, SOURCE: 1, META: 1, LINK: 1, AREA: 1, WBR: 1, TEXTAREA: 1, SELECT: 1 };

  function el(tag, attrs, hijos) {
    var n = doc.createElement(tag);
    for (var k in (attrs || {})) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, String(v));
    }
    [].concat(hijos || []).forEach(function (h) {
      if (h === null || h === undefined || h === false) return;
      n.appendChild(typeof h === 'string' ? doc.createTextNode(h) : h);
    });
    return n;
  }

  function capas() {
    var c = G.dato('capas');
    return c && typeof c === 'object' ? c : {};
  }

  function buscarCapa(tipo, id) {
    var lista = Array.isArray(capas()[tipo]) ? capas()[tipo] : [];
    for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === id) return lista[i];
    return null;
  }

  // ---------------------------------------------------------------------------
  // Distintivos
  // ---------------------------------------------------------------------------
  function fichas(valor) {
    return String(valor || '').split(/\s+/).filter(Boolean).map(function (f) {
      var p = f.indexOf(':');
      var tipo = p === -1 ? f : f.slice(0, p);
      var id = p === -1 ? '' : f.slice(p + 1);
      return { tipo: tipo, id: ALIAS[id] || id };
    }).filter(function (x) { return ROTULOS[x.tipo] && x.id; });
  }

  function pintarDistintivos(raiz) {
    var base = raiz && raiz.querySelectorAll ? raiz : doc;
    var nodos = G.qsa('[data-capa]', base);
    if (base !== doc && base.hasAttribute && base.hasAttribute('data-capa')) nodos.unshift(base);
    nodos.forEach(function (nodo) {
      var valor = nodo.getAttribute('data-capa');
      if (!valor || nodo.getAttribute('data-capa-pintada') === valor) return;
      if (VACIOS[String(nodo.tagName).toUpperCase()]) {
        if (root.console && root.console.warn) root.console.warn('[GOON] data-capa en un elemento vacío (' + nodo.tagName + '): ponlo en su contenedor');
        return;
      }
      var previa = nodo.querySelector(':scope > .distintivos');
      if (previa) nodo.removeChild(previa);
      var lista = fichas(valor);
      if (!lista.length) return;
      var caja = el('div', { 'class': 'distintivos', 'aria-hidden': 'true' });
      lista.forEach(function (f) {
        var item = buscarCapa(f.tipo, f.id);
        if (!item && root.console && root.console.warn) root.console.warn('[GOON] capa sin definir en hechos: ' + f.tipo + ':' + f.id);
        caja.appendChild(el('span', { 'class': 'distintivo distintivo--' + f.tipo, title: item && item.detalle ? item.detalle : null }, [
          el('b', { text: ROTULOS[f.tipo] }), item && item.etiqueta ? item.etiqueta : f.id
        ]));
      });
      nodo.classList.add('tiene-capa');
      TIPOS.forEach(function (t) { nodo.classList.remove('capa--' + t); });
      nodo.classList.add('capa--' + lista[0].tipo);
      nodo.insertBefore(caja, nodo.firstChild);
      nodo.setAttribute('data-capa-pintada', valor);
    });
  }

  // ---------------------------------------------------------------------------
  // Vista previa de WhatsApp (modo demo)
  // ---------------------------------------------------------------------------
  var dialogo = null;
  var focoPrevio = null;
  var mensajeActual = '';
  var unidadActual = null;

  // Texto de la celda «Unidad» cuando el botón pregunta por un tema y no por una unidad.
  var TEMAS = { garantia: 'Consulta sobre la garantía', financiamiento: 'Consulta sobre financiamiento' };
  var CENTRO_PUBLICO = 'Se asigna con la sucursal';

  function confirmadoSuc(s, campo) {
    var lista = s && Array.isArray(s.por_confirmar) ? s.por_confirmar : [];
    return lista.indexOf(campo) === -1;
  }

  function sucursalPorId(id) {
    return id && typeof G.sucursal === 'function' ? G.sucursal(id) : null;
  }

  function nombreLargo(s, respaldoNombre, respaldoEstado) {
    var nombre = s && s.nombre ? s.nombre : (respaldoNombre || '');
    var estado = s && s.estado ? s.estado : (respaldoEstado || '');
    return nombre + (estado && estado !== nombre ? ', ' + estado : '');
  }

  /** Centro SAP que se puede afirmar: el de la unidad (inventario) o el confirmado de la sucursal. */
  function centroDe(u, s) {
    if (u && u.centro_sap) return String(u.centro_sap);
    if (s && s.centro_sap && confirmadoSuc(s, 'centro_sap')) return String(s.centro_sap);
    return null;
  }

  function llenar(sel, texto) {
    var n = dialogo.querySelector(sel);
    if (n) n.textContent = texto;
  }

  /** Centro en el modal: el dato, o «Se asigna con la sucursal» (público) / «Por confirmar» marcado (modo P). */
  function llenarCentro(centro) {
    var n = dialogo.querySelector('[data-wa-demo-centro]');
    if (!n) return;
    var p = html.classList.contains('modo-presentacion');
    n.textContent = centro || (p ? 'Por confirmar' : CENTRO_PUBLICO);
    n.classList.toggle('es-por-confirmar', !centro && p);
  }

  function abrirVistaPrevia(detalle) {
    if (!dialogo) return;
    var d = detalle || {};
    focoPrevio = d.disparador || doc.activeElement;
    mensajeActual = d.mensaje || '';
    var u = d.unidad || null;
    var lote = d.lote || null;
    var suc = !u ? (d.sucursal || sucursalPorId(d.disparador && d.disparador.getAttribute
      ? d.disparador.getAttribute('data-wa-sucursal') : null)) : null;
    var tema = d.tema || (d.disparador && d.disparador.getAttribute ? d.disparador.getAttribute('data-wa-tema') : null);
    unidadActual = u;
    llenar('[data-wa-demo-mensaje]', mensajeActual);
    var nota = dialogo.querySelector('[data-wa-demo-nota]');
    var texto;
    if (u) {
      var s = sucursalPorId(u.sucursal_id);
      var nombre = [u.marca, u.modelo, u.anio].filter(Boolean).join(' ');
      var centroU = centroDe(u, s);
      llenar('[data-wa-demo-unidad]', lote ? 'Lote ' + lote.id + ' · ' + lote.n + ' × ' + nombre : nombre + ' · Ref. ' + u.id);
      llenar('[data-wa-demo-sucursal]', nombreLargo(s, u.plaza, u.estado) || '—');
      llenarCentro(centroU);
      texto = centroU
        ? 'No se abre WhatsApp. En la versión publicada este mensaje abre WhatsApp y el prospecto llega a la sucursal donde está la unidad, con su centro SAP y su referencia.'
        : 'No se abre WhatsApp. En la versión publicada este mensaje abre WhatsApp y el prospecto llega a la sucursal donde está la unidad, con su referencia.';
    } else if (suc) {
      var centroS = centroDe(null, suc);
      llenar('[data-wa-demo-unidad]', TEMAS[tema] || 'Consulta a la sucursal');
      llenar('[data-wa-demo-sucursal]', nombreLargo(suc));
      llenarCentro(centroS);
      texto = 'No se abre WhatsApp. En la versión publicada este mensaje abre WhatsApp y el prospecto llega a la sucursal ' +
        suc.nombre + (centroS ? ' (centro ' + centroS + ')' : '') + '.';
    } else {
      llenar('[data-wa-demo-unidad]', TEMAS[tema] || 'Consulta general');
      llenar('[data-wa-demo-sucursal]', 'La más cercana al prospecto');
      // Consulta general: el centro no está pendiente, sale de la sucursal que se asigne.
      llenarCentro(CENTRO_PUBLICO);
      texto = 'No se abre WhatsApp. En la versión publicada este mensaje abre WhatsApp y el prospecto se reparte a la sucursal que le corresponde.';
    }
    if (nota) {
      nota.textContent = '';
      nota.appendChild(el('b', { text: 'Modo demo' }));
      nota.appendChild(doc.createTextNode(texto));
    }
    llenar('[data-wa-demo-estado]', '');
    doc.body.classList.add('con-dialogo');
    if (G._comun && G._comun.cerrarMenu) G._comun.cerrarMenu(false);
    if (typeof dialogo.showModal === 'function') {
      if (!dialogo.open) dialogo.showModal();
    } else {
      dialogo.setAttribute('open', '');
      var b = dialogo.querySelector('button');
      if (b) b.focus();
    }
  }

  function cerrarVistaPrevia() {
    if (!dialogo) return;
    if (typeof dialogo.close === 'function' && dialogo.open) dialogo.close();
    else { dialogo.removeAttribute('open'); alCerrar(); }
  }

  function alCerrar() {
    doc.body.classList.remove('con-dialogo');
    var destino = focoPrevio;
    focoPrevio = null;
    if (destino && destino.focus && doc.contains(destino)) {
      try { destino.focus({ preventScroll: true }); } catch (e) { destino.focus(); }
    }
  }

  function copiarMensaje() {
    var estado = dialogo && dialogo.querySelector('[data-wa-demo-estado]');
    G.copiar(mensajeActual, dialogo).then(function (ok) {
      if (estado) estado.textContent = ok ? 'Mensaje copiado.' : 'No se pudo copiar: selecciona el texto a mano.';
      G.evento('whatsapp_copiar', { ok: ok, unidad_id: unidadActual ? String(unidadActual.id) : null });
    });
  }

  function prepararDialogo() {
    dialogo = G.qs('#wa-demo');
    if (!dialogo) return;
    dialogo.addEventListener('close', alCerrar);
    dialogo.addEventListener('click', function (ev) {
      if (ev.target !== dialogo) return;
      var r = dialogo.getBoundingClientRect();
      var fuera = ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      if (fuera) cerrarVistaPrevia();
    });
    doc.addEventListener('goon:wa-demo', function (e) {
      if (e.preventDefault) e.preventDefault();
      abrirVistaPrevia(e.detail || {});
    });
  }

  // ---------------------------------------------------------------------------
  // Eventos globales
  // ---------------------------------------------------------------------------
  function alClic(ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-accion]') : null;
    if (!t) return;
    var accion = t.getAttribute('data-accion');
    if (accion === 'dialogo-cerrar') cerrarVistaPrevia();
    else if (accion === 'wa-copiar') copiarMensaje();
  }

  function alTeclear(ev) {
    if (ev.key === 'Escape' && dialogo && dialogo.hasAttribute('open') && typeof dialogo.showModal !== 'function') {
      cerrarVistaPrevia();
    }
  }

  function iniciar() {
    prepararDialogo();
    doc.addEventListener('click', alClic);
    doc.addEventListener('keydown', alTeclear);
    doc.addEventListener('goon:contenido', function (e) { pintarDistintivos(e.detail && e.detail.raiz); });
  }

  G.presentacion = {
    pintar: pintarDistintivos,
    vistaPrevia: abrirVistaPrevia,
    cerrarVistaPrevia: cerrarVistaPrevia
  };

  G.listo(iniciar);
})(window);
