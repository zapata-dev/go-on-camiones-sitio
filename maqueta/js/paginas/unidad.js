/*!
 * Go On Camiones — js/paginas/unidad.js
 * Fichas unidad-<id>.html (data-ficha="vigente") y páginas de baja o venta
 * (data-ficha="baja" | "vendida"). Script clásico (IIFE), sin red, todo con
 * createElement. Depende de nucleo.js (GOON), comun.js y tarjeta-unidad.js
 * (GOON_TARJETA, que a su vez usa financiamiento-core.js para la mensualidad).
 *
 * Ficha vigente: la plantilla trae el texto base estampado por Python
 * ({{U.campo}}) y este script lo hidrata desde GOON_CATALOGO por data-unidad-id:
 *   - cabeza: logo de la marca, km con GOON.fmt.kmCorto, plaza, «dentro del
 *     estándar» (GOON_TARJETA.califica) y la línea del lote
 *   - galería: foto principal + miniaturas + visor (<dialog>: ←/→/Inicio/Fin,
 *     Esc, trampa de foco, el foco regresa al botón que lo abrió); sin fotos,
 *     el plano «Fotografía en proceso» (GOON_TARJETA.plano) con su pie
 *   - panel: precio, «Desde $X/mes*» (GOON_TARJETA.desde) y su nota
 *   - lote de flota (si la unidad es parte de un lote de 2 o más)
 *   - medición contra el estándar (GOON_TARJETA.medicion)
 *   - ficha técnica, sucursal (lo por confirmar solo en modo P)
 *   - formulario demo: NO envía; arma el «prospecto que recibiría Salesforce»
 *     (origen, sucursal y centro SAP por ubicación física, id, UTM de la URL,
 *     propietario vacío → reparto por centro) y mide lead_form_demo
 *   - similares (GOON_TARJETA.render): misma plaza o mismo modelo, cada lote una
 *     sola vez, lotes primero; si hay que rellenar con otra plaza y otro modelo,
 *     la entrada de la sección lo dice («características parecidas»)
 * Baja / vendida: «siguen disponibles» (una unidad o lote por plaza, hasta 3 plazas);
 * la frase con el conteo nace oculta y solo aparece si el catálogo lo trae.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;

  var NS = 'http://www.w3.org/2000/svg';
  // Rutas literales para que la verificación de assets las encuentre.
  var MARCAS = {
    freightliner: ['assets/marcas/freightliner.webp', 811, 160],
    international: ['assets/marcas/international.webp', 145, 160],
    kenworth: ['assets/marcas/kenworth.webp', 85, 160],
    mack: ['assets/marcas/mack.webp', 1609, 160],
    'mercedes-benz': ['assets/marcas/mercedes-benz.webp', 160, 160],
    peterbilt: ['assets/marcas/peterbilt.webp', 372, 160],
    scania: ['assets/marcas/scania.webp', 169, 160],
    volvo: ['assets/marcas/volvo.webp', 164, 160]
  };
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var NOTA_MENSUALIDAD = 'Mensualidad con enganche de {enganche} a {plazo} meses; cifra ilustrativa sujeta a aprobación de crédito.';
  var MAX_SIMILARES = 3;
  var MAX_DISPONIBLES = 3; // una fila completa a 1440 (la rejilla no baja de 300 px por tarjeta)
  var ENTRADA_SIMILARES_AMPLIA = 'Unidades de la misma plaza, del mismo modelo o de características parecidas. Cada lote aparece una sola vez.';

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function el(tag, attrs, hijos) {
    var n = doc.createElement(tag);
    for (var k in (attrs || {})) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    [].concat(hijos === undefined || hijos === null ? [] : hijos).forEach(function (h) {
      if (h === null || h === undefined || h === false || h === '') return;
      n.appendChild(typeof h === 'string' || typeof h === 'number' ? doc.createTextNode(String(h)) : h);
    });
    return n;
  }

  function icono(id, clase) {
    var s = doc.createElementNS(NS, 'svg');
    s.setAttribute('class', clase || 'icono');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var u = doc.createElementNS(NS, 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }

  /** Ícono de «ampliar» (cuatro esquinas), propio de la galería. */
  function iconoAmpliar() {
    var s = doc.createElementNS(NS, 'svg');
    s.setAttribute('class', 'icono');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var p = doc.createElementNS(NS, 'path');
    p.setAttribute('d', 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8');
    s.appendChild(p);
    return s;
  }

  function T() { return root.GOON_TARJETA || null; }
  function numero(v) { var n = Number(v); return v !== null && v !== '' && isFinite(n) ? n : null; }
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function slug(marca) { return String(marca || '').toLowerCase().trim().replace(/\s+/g, '-'); }
  function titulo(u) { return [u.marca, u.modelo, u.anio].filter(Boolean).join(' '); }

  function lugar(u) {
    if (!u) return '';
    if (!u.estado || u.estado === u.plaza) return u.plaza || '';
    return (u.plaza || '') + ', ' + u.estado;
  }

  function loteDe(u) {
    if (!u || !u.lote || typeof G.lote !== 'function') return null;
    var l = G.lote(u.lote);
    return l && l.n >= 2 ? l : null;
  }

  function texto(ruta, respaldo) {
    var v = G.dato(ruta);
    return typeof v === 'string' && v && !G.porConfirmar(ruta) ? v : respaldo;
  }

  function mostrar(n, si) { if (n) n.hidden = !si; }

  /** Candidato más chico de un srcset (miniaturas) y el más grande (visor). */
  function candidatos(foto) {
    var lista = [];
    String((foto && foto.srcset) || '').split(',').forEach(function (c) {
      var p = c.trim().split(/\s+/);
      if (!p[0]) return;
      var w = p[1] && /w$/.test(p[1]) ? parseInt(p[1], 10) : 0;
      lista.push({ src: p[0], w: w || 0 });
    });
    lista.sort(function (a, b) { return a.w - b.w; });
    if (!lista.length && foto && foto.src) lista.push({ src: foto.src, w: foto.ancho || 0 });
    return lista;
  }

  // ---------------------------------------------------------------------------
  // Cabeza
  // ---------------------------------------------------------------------------
  function pintarCampos(u) {
    G.qsa('[data-u]').forEach(function (n) {
      var k = n.getAttribute('data-u');
      if (k === 'km') n.textContent = G.fmt.kmCorto(u.km);
      else if (k === 'precio') n.textContent = G.fmt.mxn(u.precio);
      else if (k === 'lugar') n.textContent = lugar(u);
      else if (k === 'sucursal') n.textContent = typeof G.nombreSucursal === 'function' ? G.nombreSucursal(u.sucursal_id) || u.plaza : u.plaza;
    });
  }

  function cabeza(u, lt) {
    var logo = G.qs('[data-logo-marca]');
    var m = MARCAS[slug(u.marca)];
    if (logo && m && !logo.firstChild) {
      logo.appendChild(el('img', { src: m[0], width: m[1], height: m[2], alt: '', decoding: 'async' }));
      logo.hidden = false;
    }
    var t = T();
    mostrar(G.qs('[data-si-califica]'), !!(t && t.califica(u)));
    var linea = G.qs('[data-lote-linea]');
    if (linea && lt) {
      linea.textContent = '';
      linea.appendChild(el('a', { 'class': 'btn btn--primario ficha__lote-boton', href: 'inventario.html?lote=' + encodeURIComponent(lt.id),
        'data-event': 'cta_ver_inventario', 'data-event-origen': 'ficha_lote' }, [
        el('span', { text: 'Ver las ' + lt.n + ' unidades' }), icono('i-flecha')
      ]));
      linea.hidden = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Galería + visor
  // ---------------------------------------------------------------------------
  function fotosDe(u, lt) {
    var g = (u.fotos && Array.isArray(u.fotos.galeria)) ? u.fotos.galeria.slice() : [];
    if (!g.length && u.fotos && u.fotos.portada) g = [u.fotos.portada];
    if (!g.length && lt) {
      for (var i = 0; i < lt.unidades.length && !g.length; i++) {
        var f = lt.unidades[i].fotos;
        if (f && Array.isArray(f.galeria) && f.galeria.length) g = f.galeria.slice();
        else if (f && f.portada) g = [f.portada];
      }
    }
    return g.filter(function (f) { return f && f.src; });
  }

  function altDe(u, tipo, i, n) {
    var base = titulo(u);
    if (tipo === 'lote') base += ', foto representativa del lote';
    else if (tipo === 'representativa') base += ', foto representativa del modelo';
    return base + ' (' + (i + 1) + ' de ' + n + ')';
  }

  var galeria = null; // {u, fotos, tipo, leyenda, actual, img, contador, minis, escenario}

  function ponerFoto(img, f, sizes) {
    img.setAttribute('src', f.src);
    if (f.srcset) img.setAttribute('srcset', f.srcset); else img.removeAttribute('srcset');
    img.setAttribute('sizes', sizes);
    if (f.ancho) img.setAttribute('width', String(f.ancho));
    if (f.alto) img.setAttribute('height', String(f.alto));
  }

  function irA(i) {
    if (!galeria) return;
    var n = galeria.fotos.length;
    var k = ((i % n) + n) % n;
    galeria.actual = k;
    var f = galeria.fotos[k];
    ponerFoto(galeria.img, f, '(min-width: 1440px) 720px, (min-width: 900px) 56vw, 100vw');
    galeria.img.setAttribute('alt', altDe(galeria.u, galeria.tipo, k, n));
    galeria.escenario.classList.toggle('es-vertical', !!(f.alto && f.ancho && f.alto > f.ancho));
    if (galeria.contador) galeria.contador.textContent = dos(k + 1) + ' / ' + dos(n);
    if (galeria.abrir) galeria.abrir.setAttribute('aria-label', 'Ver en grande la foto ' + (k + 1) + ' de ' + n);
    galeria.minis.forEach(function (b, j) {
      if (j === k) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  function montarGaleria(u, lt) {
    var t = T();
    var esc = G.qs('[data-galeria-escenario]');
    var leyenda = G.qs('[data-galeria-leyenda]');
    if (!esc) return;
    var info = t ? t.foto(u) : { tipo: 'dibujo', leyenda: null };
    var fotos = info.tipo === 'dibujo' ? [] : fotosDe(u, lt);

    if (!fotos.length) {
      esc.classList.add('galeria__escenario--plano');
      esc.setAttribute('data-capa', 'se_construye:sello-go-on ilustrativo:plano-tecnico');
      if (t) esc.appendChild(t.plano(u));
      if (leyenda) leyenda.textContent = texto('mensajes.leyenda_dibujo_tecnico', 'Dibujo técnico de referencia; no es la foto de la unidad');
      mostrar(G.qs('[data-galeria-sin-foto]'), true);
      return;
    }

    esc.setAttribute('data-capa', info.tipo === 'propia' ? 'se_construye:sello-go-on' : 'se_construye:sello-go-on ilustrativo:fotos-lote');
    if (leyenda) leyenda.textContent = info.leyenda || '';
    var img = el('img', { 'class': 'galeria__foto', decoding: 'async', fetchpriority: 'high', alt: '' });
    var abrir = el('button', { 'class': 'galeria__abrir', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'visor' }, [
      img,
      el('span', { 'class': 'galeria__ampliar', 'aria-hidden': 'true' }, [iconoAmpliar(), 'Ver en grande'])
    ]);
    esc.appendChild(abrir);
    var contador = null;
    var minis = [];
    if (fotos.length > 1) {
      contador = el('span', { 'class': 'galeria__contador', 'aria-hidden': 'true' });
      esc.appendChild(contador);
      esc.appendChild(el('button', { 'class': 'galeria__paso galeria__paso--prev', type: 'button', 'data-paso': '-1' },
        [icono('i-flecha'), el('span', { 'class': 'sr', text: 'Foto anterior' })]));
      esc.appendChild(el('button', { 'class': 'galeria__paso galeria__paso--next', type: 'button', 'data-paso': '1' },
        [icono('i-flecha'), el('span', { 'class': 'sr', text: 'Foto siguiente' })]));
      var tira = G.qs('[data-galeria-miniaturas]');
      if (tira) {
        fotos.forEach(function (f, i) {
          var c = candidatos(f);
          var chica = c.length ? c[0].src : f.src;
          var b = el('button', { 'class': 'galeria__mini', type: 'button', 'data-indice': String(i),
            'aria-label': 'Foto ' + (i + 1) + ' de ' + fotos.length }, [
            el('img', { src: chica, alt: '', width: 400, height: f.alto && f.ancho ? Math.round(400 * f.alto / f.ancho) : 300,
              loading: 'lazy', decoding: 'async' })
          ]);
          tira.appendChild(b);
          minis.push(b);
        });
        tira.hidden = false;
      }
    }
    galeria = { u: u, fotos: fotos, tipo: info.tipo, leyenda: info.leyenda || '', actual: 0,
      img: img, abrir: abrir, contador: contador, minis: minis, escenario: esc };
    irA(0);

    // Clics: abrir el visor, pasos y miniaturas
    var suprimirClic = false;
    abrir.addEventListener('click', function () {
      if (suprimirClic) { suprimirClic = false; return; }
      abrirVisor(galeria.actual, abrir);
    });
    esc.addEventListener('click', function (ev) {
      var p = ev.target && ev.target.closest ? ev.target.closest('[data-paso]') : null;
      if (p) irA(galeria.actual + Number(p.getAttribute('data-paso')));
    });
    var tiraMinis = G.qs('[data-galeria-miniaturas]');
    if (tiraMinis) {
      tiraMinis.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-indice]') : null;
        if (b) irA(Number(b.getAttribute('data-indice')));
      });
    }
    // Deslizar en celular (sin librerías): > 40 px en horizontal cambia de foto.
    var x0 = null;
    var y0 = null;
    esc.addEventListener('touchstart', function (ev) {
      if (!ev.touches || ev.touches.length !== 1) { x0 = null; return; }
      x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY;
    }, { passive: true });
    esc.addEventListener('touchend', function (ev) {
      if (x0 === null || !ev.changedTouches || !ev.changedTouches.length || fotos.length < 2) return;
      var dx = ev.changedTouches[0].clientX - x0;
      var dy = ev.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        suprimirClic = true;
        root.setTimeout(function () { suprimirClic = false; }, 400);
        irA(galeria.actual + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    prepararVisor();
  }

  var visor = null;
  var visorImg = null;
  var visorIndice = 0;
  var focoVisor = null;

  function visorMostrar(i) {
    if (!galeria || !visor) return;
    var n = galeria.fotos.length;
    var k = ((i % n) + n) % n;
    visorIndice = k;
    var f = galeria.fotos[k];
    ponerFoto(visorImg, f, '100vw');
    visorImg.setAttribute('alt', altDe(galeria.u, galeria.tipo, k, n));
    visor.classList.toggle('es-vertical', !!(f.alto && f.ancho && f.alto > f.ancho));
    var cont = visor.querySelector('[data-visor-contador]');
    if (cont) cont.textContent = 'Foto ' + (k + 1) + ' de ' + n;
    var pie = visor.querySelector('[data-visor-pie]');
    if (pie) {
      pie.textContent = '';
      pie.appendChild(el('span', { 'class': 'fig', text: 'Fig. 01·' + String.fromCharCode(97 + (k % 26)) }));
      pie.appendChild(el('span', { text: galeria.leyenda }));
    }
    G.qsa('[data-visor-paso]', visor).forEach(function (b) { b.hidden = n < 2; });
  }

  function abrirVisor(i, disparador) {
    if (!visor) return;
    focoVisor = disparador || doc.activeElement;
    visorMostrar(i);
    doc.body.classList.add('con-dialogo');
    if (typeof visor.showModal === 'function') {
      if (!visor.open) visor.showModal();
    } else {
      visor.setAttribute('open', '');
    }
    var cerrar = visor.querySelector('[data-visor-cerrar]');
    if (cerrar) cerrar.focus();
  }

  function cerrarVisor() {
    if (!visor) return;
    if (typeof visor.close === 'function' && visor.open) visor.close();
    else { visor.removeAttribute('open'); alCerrarVisor(); }
  }

  function alCerrarVisor() {
    doc.body.classList.remove('con-dialogo');
    if (galeria) irA(visorIndice);
    var destino = focoVisor;
    focoVisor = null;
    if (destino && destino.focus && doc.contains(destino)) {
      try { destino.focus({ preventScroll: true }); } catch (e) { destino.focus(); }
    }
  }

  function prepararVisor() {
    visor = G.qs('[data-visor]');
    if (!visor || visor.getAttribute('data-listo')) return;
    visor.setAttribute('data-listo', '1');
    var figura = visor.querySelector('[data-visor-figura]');
    visorImg = el('img', { 'class': 'visor__foto', alt: '', decoding: 'async' });
    if (figura) figura.insertBefore(visorImg, figura.firstChild);
    visor.addEventListener('close', alCerrarVisor);
    visor.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t === visor || t === figura) { cerrarVisor(); return; }
      var b = t && t.closest ? t.closest('[data-visor-paso],[data-visor-cerrar]') : null;
      if (!b) return;
      if (b.hasAttribute('data-visor-cerrar')) cerrarVisor();
      else visorMostrar(visorIndice + Number(b.getAttribute('data-visor-paso')));
    });
    visor.addEventListener('keydown', function (ev) {
      var n = galeria ? galeria.fotos.length : 0;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); visorMostrar(visorIndice + 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); visorMostrar(visorIndice - 1); }
      else if (ev.key === 'Home') { ev.preventDefault(); visorMostrar(0); }
      else if (ev.key === 'End') { ev.preventDefault(); visorMostrar(n - 1); }
      else if (ev.key === 'Tab' && G._comun && G._comun.atraparFoco) G._comun.atraparFoco(ev, visor);
      else if (ev.key === 'Escape' && typeof visor.showModal !== 'function') { ev.preventDefault(); cerrarVisor(); }
      // La tecla P no cambia el modo presentación con el visor abierto.
      if (ev.key === 'p' || ev.key === 'P') ev.stopPropagation();
    });
  }

  // ---------------------------------------------------------------------------
  // Panel de compra
  // ---------------------------------------------------------------------------
  function notaTexto(d) {
    return texto('mensajes.nota_mensualidad', NOTA_MENSUALIDAD)
      .replace('{enganche}', G.fmt.pct(d.enganche_pct))
      .replace('{plazo}', String(d.plazo));
  }

  function compra(u) {
    var t = T();
    var d = t ? t.desde(u.precio, u.anio) : null;
    if (!d) return;
    var m = G.qs('[data-u="mensualidad"]');
    if (m) m.textContent = G.fmt.mxn(d.mensualidad);
    mostrar(G.qs('[data-desde]'), true);
    var nota = G.qs('[data-desde-nota-texto]');
    if (nota) nota.textContent = notaTexto(d);
    mostrar(G.qs('[data-desde-nota]'), true);
    var cot = G.qs('[data-cotizar]');
    if (cot) {
      cot.setAttribute('data-event-precio', String(u.precio));
      cot.setAttribute('data-event-plazo', String(d.plazo));
      cot.setAttribute('data-event-enganche-pct', String(d.enganche_pct));
      cot.setAttribute('data-event-mensualidad', String(Math.round(d.mensualidad)));
    }
  }

  // ---------------------------------------------------------------------------
  // Lote de flota
  // ---------------------------------------------------------------------------
  function bloqueLote(u, lt) {
    var sec = G.qs('[data-lote-bloque]');
    if (!sec || !lt) return;
    var t = T();
    var plazas = {};
    lt.unidades.forEach(function (x) { plazas[x.sucursal_id] = true; });
    var unaPlaza = Object.keys(plazas).length === 1;
    var tit = sec.querySelector('[data-lote-titulo]');
    if (tit) tit.textContent = 'Esta unidad es parte de un lote de ' + lt.n + '.';
    var txt = sec.querySelector('[data-lote-texto]');
    if (txt) {
      txt.textContent = 'Elige una para ver su ficha técnica · de menos a más kilómetros.';
    }
    var caja = sec.querySelector('[data-lote-pictos]');
    if (caja) {
      var unids = lt.unidades.slice().sort(function (p, q) { return (p.km || 0) - (q.km || 0); });
      unids.forEach(function (v, i) {
        var esta = String(v.id) === String(u.id);
        caja.appendChild(el('a', {
          'class': 'ficha-lote__cuadro' + (esta ? ' es-esta' : ''),
          href: 'unidad-' + encodeURIComponent(String(v.id)) + '.html',
          title: G.fmt.kmCorto(v.km),
          'aria-label': 'Unidad ' + (i + 1) + ' de ' + lt.n + ', ' + G.fmt.kmCorto(v.km) + (esta ? ' (la que estás viendo)' : ''),
          'aria-current': esta ? 'page' : null,
          'data-event': 'ver_unidad', 'data-event-unidad-id': String(v.id), 'data-event-origen': 'ficha_lote_selector',
          'data-event-lote': lt.id
        }, [el('span', { text: String(i + 1) })]));
      });
    }
    sec.setAttribute('data-capa', 'ya_opera:inventario-diario');
    sec.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Medición contra el estándar
  // ---------------------------------------------------------------------------
  function medicion(u) {
    var t = T();
    var cont = G.qs('[data-medicion]');
    if (!t || !cont) return;
    var m = t.medicion(u);
    if (!m) { cont.hidden = true; return; }
    var e = G.dato('estandar') || {};
    var aniosMax = numero(e.anios_max);
    var kmMax = numero(e.km_max);
    var anioCorte = typeof G.anioCorte === 'function' ? numero(G.anioCorte()) : null;
    var edad = anioCorte !== null && numero(u.anio) !== null ? Math.max(0, anioCorte - numero(u.anio)) : null;
    var km = numero(u.km);
    var filas = m.querySelectorAll('.medicion__fila');
    // [divisiones de la escala, inicio, tope, ¿dentro del tope?]
    var escalas = [
      [aniosMax, '0 años', aniosMax + ' años', edad !== null && aniosMax !== null && edad <= aniosMax],
      [kmMax ? Math.max(1, Math.round(kmMax / 100000)) : null, '0 km', G.fmt.kmCorto(kmMax), km !== null && kmMax !== null && km <= kmMax]
    ];
    for (var i = 0; i < filas.length && i < escalas.length; i++) {
      var barra = filas[i].querySelector('.medicion__barra');
      if (barra && escalas[i][0]) barra.style.setProperty('--div', String(escalas[i][0]));
      var dentro = escalas[i][3];
      filas[i].classList.toggle('es-dentro', !!dentro);
      // Barra llena no es «al límite»: el tramo va en tono neutro y la escala dice que está dentro del tope.
      filas[i].appendChild(el('span', { 'class': 'medicion__escala', 'aria-hidden': 'true' }, [
        el('span', { text: escalas[i][1] }),
        dentro
          ? el('span', { 'class': 'medicion__dentro' }, [icono('i-check'), 'Dentro del tope · ' + escalas[i][2]])
          : el('span', { text: 'tope ' + escalas[i][2] })
      ]));
    }
    cont.appendChild(m);
    if (!t.califica(u)) {
      var tit = G.qs('[data-medicion-titulo]');
      if (tit) tit.textContent = 'Medición contra el estándar Go On';
    }
  }

  // ---------------------------------------------------------------------------
  // Ficha técnica
  // ---------------------------------------------------------------------------
  function especificaciones(u) {
    G.qsa('.especificaciones [data-fila]').forEach(function (fila) {
      var dd = fila.querySelector('dd');
      var v = dd ? String(dd.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (!v || v === '—' || v === 'km') fila.hidden = true;
    });
    var t = T();
    var info = t ? t.foto(u) : null;
    var nota = G.qs('[data-color-nota]');
    if (nota && info && (info.tipo === 'representativa' || info.tipo === 'lote') && u.color) {
      var distinto = Array.isArray(u.advertencias) && u.advertencias.indexOf('color_foto_distinto') !== -1;
      nota.textContent = distinto ? 'Distinto al de la foto representativa.' : 'Puede no coincidir con la foto representativa.';
      nota.hidden = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Sucursal
  // ---------------------------------------------------------------------------
  function sucursal(u) {
    var s = typeof G.sucursal === 'function' ? G.sucursal(u.sucursal_id) : null;
    if (!s) return;
    var pc = Array.isArray(s.por_confirmar) ? s.por_confirmar : [];
    function marcar(n, campo) {
      if (pc.indexOf(campo) !== -1) { n.setAttribute('data-suc-por-confirmar', ''); n.classList.add('es-por-confirmar'); }
      return n;
    }
    var nombre = G.qs('#ubicacion-titulo');
    if (nombre && s.nombre) nombre.textContent = s.nombre;
    var ciudad = G.qs('[data-suc="ciudad"]');
    if (ciudad) {
      var partes = [];
      [s.ciudad, s.estado].forEach(function (p) { if (p && partes.indexOf(p) === -1) partes.push(p); });
      ciudad.textContent = partes.join(', ');
    }
    var datos = G.qs('[data-suc-datos]');
    if (datos) {
      if (s.direccion) {
        datos.appendChild(marcar(el('div', null, [el('dt', { text: 'Dirección' }),
          el('dd', { text: s.direccion + (s.cp ? ', C.P. ' + s.cp : '') })]), 'direccion'));
      }
      if (s.horario) {
        var dd = el('dd');
        String(s.horario).split(/\s*·\s*/).forEach(function (h) { dd.appendChild(el('span', { text: h })); });
        datos.appendChild(marcar(el('div', null, [el('dt', { text: 'Horario' }), dd]), 'horario'));
      }
      if (s.telefono) {
        var tel = el('a', { href: s.telefono_e164 ? 'tel:' + s.telefono_e164 : null, 'class': 'ficha-sucursal__tel',
          'data-event': 'tel_click', 'data-event-sucursal-id': s.id, 'data-event-origen': 'ficha_ubicacion' },
          [icono('i-tel'), s.telefono]);
        datos.appendChild(marcar(el('div', null, [el('dt', { text: 'Teléfono' }), el('dd', null, [tel])]), 'telefono'));
      }
      var centro = u.centro_sap || s.centro_sap;
      if (centro) {
        datos.appendChild(el('div', { 'class': 'solo-presentacion' }, [el('dt', { text: 'Centro SAP' }), el('dd', { text: String(centro) })]));
      }
    }
    var acc = G.qs('[data-suc-acciones]');
    if (acc) {
      if (s.maps_url) {
        acc.appendChild(marcar(el('a', { 'class': 'enlace-flecha', href: s.maps_url, target: '_blank', rel: 'noopener',
          'data-event': 'mapa_click', 'data-event-sucursal-id': s.id, 'data-event-origen': 'ficha_ubicacion' },
          ['Cómo llegar', icono('i-externo')]), 'maps_url'));
      }
      acc.appendChild(el('a', { 'class': 'enlace-flecha', href: 'sucursales.html' }, ['Ver sucursales', icono('i-flecha')]));
    }
  }

  // ---------------------------------------------------------------------------
  // Formulario demo → prospecto que recibiría Salesforce
  // ---------------------------------------------------------------------------
  function leerUtm() {
    var p = typeof G.params === 'function' ? G.params() : {};
    var salida = [];
    UTM.forEach(function (k) {
      if (p[k]) salida.push([k.replace('utm_', ''), String(p[k]).slice(0, 80)]);
    });
    return salida;
  }

  function enmascararTel(d) {
    if (d.length !== 10) return '••••';
    return d.slice(0, 3) + ' ••• ••' + d.slice(8);
  }

  function enmascararCorreo(c) {
    var i = c.indexOf('@');
    if (i < 1) return '••••';
    return c.charAt(0) + '•••' + c.slice(i);
  }

  function telefonoLimpio(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.slice(0, 2) === '52') d = d.slice(2);
    else if (d.length === 13 && d.slice(0, 3) === '521') d = d.slice(3);
    return d;
  }

  function filaProspecto(etiqueta, valor, opciones) {
    var o = opciones || {};
    var dd = el('dd', { 'class': o.pendiente ? 'es-pendiente' : null }, valor);
    return el('div', { 'class': 'prospecto__fila' + (o.auto ? ' prospecto__fila--auto' : '') }, [
      el('dt', null, [etiqueta, o.auto ? el('span', { 'class': 'sr', text: ' (automático)' }) : null]),
      dd
    ]);
  }

  function pintarProspecto(u, contacto) {
    var dl = G.qs('[data-prospecto-campos]');
    if (!dl) return;
    var s = typeof G.sucursal === 'function' ? G.sucursal(u.sucursal_id) : null;
    var centro = u.centro_sap || (s && s.centro_sap) || 'por asignar';
    var nombreSuc = s && s.nombre ? s.nombre : u.plaza;
    var utm = leerUtm();
    dl.textContent = '';
    var filas = [
      filaProspecto('Origen', 'Página web · sección Go On Camiones', { auto: true }),
      filaProspecto('Unidad', titulo(u) + ' · Ref. ' + u.id, { auto: true }),
      filaProspecto('Sucursal', nombreSuc + ' (donde está la unidad)', { auto: true }),
      filaProspecto('Centro SAP', String(centro), { auto: true }),
      filaProspecto('Campaña', utm.length
        ? utm.map(function (p) { return p[0] + ': ' + p[1]; }).join(' · ')
        : 'Sin UTM (visita directa)', { auto: true }),
      filaProspecto('Propietario', [el('span', { 'class': 'prospecto__vacio', text: 'Vacío' }), ' → reparto por centro ' + centro], { auto: true })
    ];
    if (contacto) {
      filas.push(filaProspecto('Nombre', contacto.nombre));
      filas.push(filaProspecto('Teléfono', enmascararTel(contacto.telefono)));
      if (contacto.correo) filas.push(filaProspecto('Correo', enmascararCorreo(contacto.correo)));
      filas.push(filaProspecto('Prefiere', contacto.prefiere));
      filas.push(filaProspecto('Financiamiento', contacto.financiamiento));
    } else {
      filas.push(filaProspecto('Contacto', 'Se llena al enviar', { pendiente: true }));
    }
    filas.forEach(function (f) { dl.appendChild(f); });
  }

  function simularUtm(u) {
    var p = G.qs('[data-prospecto-simular]');
    if (!p) return;
    var archivo = 'unidad-' + encodeURIComponent(String(u.id)) + '.html';
    var hay = leerUtm().length > 0;
    p.textContent = '';
    p.appendChild(el('a', {
      'class': 'enlace-flecha',
      href: hay ? archivo + '#solicita'
        : archivo + '?utm_source=facebook&utm_medium=paid_social&utm_campaign=go-on-camiones&utm_content=' + encodeURIComponent(String(u.id)) + '#solicita'
    }, [hay ? 'Quitar la campaña de la liga' : 'Simular llegada desde un anuncio', icono('i-flecha')]));
  }

  function errorCampo(form, nombre, mensaje) {
    var campo = form.querySelector('[data-campo="' + nombre + '"]');
    if (!campo) return null;
    var input = campo.querySelector('.campo__control');
    var p = campo.querySelector('[data-error]');
    campo.classList.toggle('campo--error', !!mensaje);
    if (input) {
      if (mensaje) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    if (p) { p.textContent = mensaje || ''; p.hidden = !mensaje; }
    return mensaje ? input : null;
  }

  function solicita(u) {
    var form = G.qs('[data-solicita]');
    if (!form) return;
    var msg = form.querySelector('[data-solicita-mensaje]');
    if (msg && !msg.value) msg.value = G.wa && G.wa.mensaje ? G.wa.mensaje(u) : '';
    pintarProspecto(u, null);
    simularUtm(u);

    form.addEventListener('input', function (ev) {
      var campo = ev.target && ev.target.closest ? ev.target.closest('[data-campo]') : null;
      if (campo && campo.classList.contains('campo--error')) errorCampo(form, campo.getAttribute('data-campo'), '');
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var nombre = String(form.elements.nombre.value || '').replace(/\s+/g, ' ').trim();
      var telefono = telefonoLimpio(form.elements.telefono.value);
      var correo = String(form.elements.correo.value || '').trim();
      var primero = null;
      var e1 = errorCampo(form, 'nombre', nombre.length < 2 ? 'Escribe tu nombre.' : '');
      var e2 = errorCampo(form, 'telefono', telefono.length !== 10 ? 'Escribe un celular de 10 dígitos.' : '');
      var e3 = errorCampo(form, 'correo', correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) ? 'Revisa el correo: falta algo antes o después de la @.' : '');
      primero = e1 || e2 || e3;
      if (primero) { primero.focus(); return; }

      var sel = function (n) { var r = form.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : '—'; };
      pintarProspecto(u, {
        nombre: nombre.slice(0, 80), telefono: telefono, correo: correo,
        prefiere: sel('contacto'), financiamiento: sel('financiamiento')
      });
      var caja = G.qs('[data-prospecto]');
      if (caja) caja.setAttribute('data-estado', 'enviado');
      var etiqueta = G.qs('[data-prospecto-etiqueta]');
      if (etiqueta) etiqueta.textContent = 'Modo demo · no se envió nada';
      var tit = G.qs('[data-prospecto-titulo]');
      if (tit) tit.textContent = 'Prospecto que recibiría Salesforce';
      var s = typeof G.sucursal === 'function' ? G.sucursal(u.sucursal_id) : null;
      var centro = u.centro_sap || (s && s.centro_sap) || '';
      var estado = G.qs('[data-prospecto-estado]');
      if (estado) {
        estado.textContent = 'Listo. En la versión publicada esta solicitud entraría directo a Salesforce' +
          (centro ? ' y se repartiría al equipo del centro ' + centro : '') + '. Aquí no se guardó ni se envió nada.';
      }
      G.evento('lead_form_demo', { formulario: 'ficha_unidad', sucursal_id: u.sucursal_id || null, unidad_id: String(u.id) });
      if (tit) {
        try { tit.focus({ preventScroll: true }); } catch (e) { tit.focus(); }
        var aside = G.qs('.solicita__prospecto');
        if (aside && aside.getBoundingClientRect) {
          var r = aside.getBoundingClientRect();
          var alto = root.innerHeight || 800;
          if (r.top < 0 || r.top > alto * 0.6) {
            try { aside.scrollIntoView({ block: 'start', behavior: movReducido() ? 'auto' : 'smooth' }); } catch (e2) { aside.scrollIntoView(); }
          }
        }
      }
    });
  }

  function movReducido() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // ---------------------------------------------------------------------------
  // Similares y «siguen disponibles»
  // ---------------------------------------------------------------------------
  function grupos(excluirId, excluirLote) {
    var t = T();
    var cat = root.GOON_CATALOGO || {};
    var lista = Array.isArray(cat.unidades) ? cat.unidades : [];
    var vistos = {};
    var salida = [];
    lista.forEach(function (x) {
      if (!x || String(x.id) === String(excluirId)) return;
      var l = loteDe(x);
      if (l && excluirLote && l.id === excluirLote) return;
      var clave = l ? 'L:' + l.id : 'U:' + x.id;
      if (vistos[clave]) return;
      vistos[clave] = true;
      var rep = l ? l.representante : x;
      var info = t ? t.foto(rep) : { tipo: 'dibujo' };
      salida.push({ rep: rep, lote: l, conFoto: info.tipo !== 'dibujo' });
    });
    return salida;
  }

  function firma(g) { return [g.rep.marca, g.rep.modelo, g.rep.anio, g.rep.sucursal_id].join('|'); }

  function comparador(u) {
    return function (a, b) {
      if (!!b.lote !== !!a.lote) return b.lote ? 1 : -1;       // lotes primero
      if (b.conFoto !== a.conFoto) return b.conFoto ? 1 : -1;   // con foto primero
      var da = Math.abs((numero(a.rep.anio) || 0) - (numero(u.anio) || 0));
      var db = Math.abs((numero(b.rep.anio) || 0) - (numero(u.anio) || 0));
      if (da !== db) return da - db;
      return Math.abs((numero(a.rep.precio) || 0) - (numero(u.precio) || 0)) -
        Math.abs((numero(b.rep.precio) || 0) - (numero(u.precio) || 0));
    };
  }

  function elegirSimilares(u, lt) {
    var todos = grupos(u.id, lt ? lt.id : null);
    var mismoModelo = function (g) { return g.rep.marca === u.marca && g.rep.modelo === u.modelo; };
    var mismaPlaza = function (g) { return g.rep.sucursal_id === u.sucursal_id; };
    var cmp = comparador(u);
    var A = todos.filter(function (g) { return mismoModelo(g) && mismaPlaza(g); }).sort(cmp);
    var B = todos.filter(function (g) { return mismoModelo(g) && !mismaPlaza(g); }).sort(cmp);
    var C = todos.filter(function (g) { return !mismoModelo(g) && mismaPlaza(g); }).sort(cmp);
    var D = todos.filter(function (g) { return !mismoModelo(g) && !mismaPlaza(g); }).sort(cmp);
    var elegidos = [];
    var firmas = {};
    function tomar(g) {
      if (elegidos.length >= MAX_SIMILARES || firmas[firma(g)]) return false;
      firmas[firma(g)] = true;
      elegidos.push(g);
      return true;
    }
    A.forEach(tomar);
    var iB = 0;
    var iC = 0;
    while (elegidos.length < MAX_SIMILARES && (iB < B.length || iC < C.length)) {
      while (iB < B.length && !tomar(B[iB++])) { /* salta repetidos */ }
      while (iC < C.length && !tomar(C[iC++])) { /* salta repetidos */ }
    }
    // Relleno con «características parecidas» (año y precio cercanos): la entrada lo dice.
    var antes = elegidos.length;
    D.forEach(tomar);
    elegidos.amplia = elegidos.length > antes;
    return elegidos;
  }

  function elegirDisponibles() {
    var todos = grupos(null, null);
    var porPlaza = {};
    var conteos = (((root.GOON_CATALOGO || {}).meta || {}).conteos || {}).por_sucursal || {};
    var cmp = function (a, b) {
      if (b.conFoto !== a.conFoto) return b.conFoto ? 1 : -1;
      if (!!b.lote !== !!a.lote) return b.lote ? 1 : -1;
      return (numero(b.rep.anio) || 0) - (numero(a.rep.anio) || 0);
    };
    todos.slice().sort(cmp).forEach(function (g) {
      var s = g.rep.sucursal_id;
      if (!porPlaza[s]) porPlaza[s] = g;
    });
    return Object.keys(porPlaza).map(function (s) { return porPlaza[s]; }).sort(function (a, b) {
      var c = cmp(a, b);
      if (c) return c;
      return (conteos[b.rep.sucursal_id] || 0) - (conteos[a.rep.sucursal_id] || 0);
    }).slice(0, MAX_DISPONIBLES);
  }

  /** «Go On» nunca se parte en dos renglones (espacio duro en los textos de la tarjeta). */
  function goOnDuro(raiz) {
    if (!raiz || !doc.createTreeWalker) return;
    var w = doc.createTreeWalker(raiz, 4 /* NodeFilter.SHOW_TEXT */, null, false);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeValue && n.nodeValue.indexOf('Go On') !== -1) n.nodeValue = n.nodeValue.replace(/Go On/g, 'Go\u00a0On');
    }
  }

  /** El carrusel de celular es enfocable solo cuando de verdad desborda (si no, sería una parada de tabulador vacía). */
  function vigilarDesborde(cont) {
    if (!cont) return;
    function medir() {
      var desborda = cont.scrollWidth > cont.clientWidth + 2;
      if (desborda) cont.setAttribute('tabindex', '0');
      else cont.removeAttribute('tabindex');
    }
    medir();
    var espera = null;
    root.addEventListener('resize', function () {
      if (espera) root.clearTimeout(espera);
      espera = root.setTimeout(medir, 150);
    });
  }

  function pintarTarjetas(cont, lista, origen) {
    var t = T();
    if (!cont || !t) return;
    lista.forEach(function (g) {
      var o = { origen: origen };
      if (g.lote) { o.variante = 'lote'; o.lote = g.lote.id; }
      var tarjeta = t.render(g.rep, o);
      if (tarjeta) { goOnDuro(tarjeta); cont.appendChild(tarjeta); }
    });
    if (!cont.children.length) {
      var marco = cont.closest ? cont.closest('section') : null;
      if (marco) marco.hidden = true;
      return;
    }
    vigilarDesborde(cont);
  }

  // ---------------------------------------------------------------------------
  // Cromo del shell en la ficha y frases con conteo
  // ---------------------------------------------------------------------------
  /** En la ficha, el WhatsApp de la banda de cierre ya pregunta por la unidad: que lo diga. */
  function bandaDeFicha() {
    var wa = G.qs('.banda-cierre [data-wa-pagina]');
    if (!wa) return;
    for (var i = wa.childNodes.length - 1; i >= 0; i--) {
      var n = wa.childNodes[i];
      if (n.nodeType === 3 && /\S/.test(n.nodeValue)) { n.nodeValue = 'Preguntar por esta unidad'; return; }
    }
  }

  /** Frases con el conteo del catálogo: nacen ocultas y se muestran solo si el conteo existe. */
  function frasesConConteo() {
    var conteos = ((root.GOON_CATALOGO || {}).meta || {}).conteos || {};
    var hay = typeof conteos.go_on === 'number' && isFinite(conteos.go_on) && conteos.go_on > 0;
    G.qsa('[data-fuera-con-conteo]').forEach(function (n) { n.hidden = !hay; });
    G.qsa('[data-fuera-sin-conteo]').forEach(function (n) { n.hidden = hay; });
  }

  // ---------------------------------------------------------------------------
  // Montaje
  // ---------------------------------------------------------------------------
  function montarVigente(raiz) {
    var id = raiz.getAttribute('data-unidad-id');
    var u = G.unidad(id);
    if (!u) {
      if (root.console && root.console.warn) root.console.warn('[GOON] ficha: la unidad ' + id + ' no está en GOON_CATALOGO');
      return;
    }
    var lt = loteDe(u);
    pintarCampos(u);
    cabeza(u, lt);
    montarGaleria(u, lt);
    compra(u);
    bloqueLote(u, lt);
    medicion(u);
    especificaciones(u);
    sucursal(u);
    solicita(u);
    bandaDeFicha();
    var similares = elegirSimilares(u, lt);
    if (similares.amplia) {
      var entrada = G.qs('[data-similares-entrada]');
      if (entrada) entrada.textContent = ENTRADA_SIMILARES_AMPLIA;
    }
    pintarTarjetas(G.qs('[data-similares]'), similares, 'ficha_similares');
  }

  function montarFuera() {
    frasesConConteo();
    pintarTarjetas(G.qs('[data-disponibles]'), elegirDisponibles(), 'baja_disponibles');
  }

  G.listo(function () {
    var raiz = G.qs('[data-ficha]');
    if (!raiz) return;
    var modo = raiz.getAttribute('data-ficha');
    try {
      if (modo === 'vigente') montarVigente(raiz);
      else montarFuera();
    } catch (e) {
      // Un error aquí no debe dejar la página a medias: la plantilla ya trae el texto base.
      if (root.console && root.console.error) root.console.error('[GOON] ficha: ' + (e && e.message ? e.message : e));
    }
  });

  G.ficha = { similares: elegirSimilares, disponibles: elegirDisponibles };
})(window);
