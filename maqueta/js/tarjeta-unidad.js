/*!
 * Go On Camiones — tarjeta-unidad.js (window.GOON_TARJETA)
 * UN SOLO render de la tarjeta de unidad para Inicio, Inventario, fichas y
 * listas. Script clásico (IIFE), sin red, todo con createElement (sin innerHTML).
 * Depende de nucleo.js (GOON) y, para la mensualidad, de financiamiento-core.js.
 *
 *   GOON_TARJETA.render(unidadOId, opciones) -> <article class="tarjeta">
 *     opciones:
 *       variante   'unidad' (defecto) | 'lote' | 'compacta'
 *       lote       id del lote (variante 'lote'; defecto: unidad.lote)
 *       origen     valor de data-event-origen de los clics (defecto 'tarjeta')
 *       href       destino del enlace (defecto unidad-<id>.html)
 *       capas      true = marca la foto con data-capa (sello-go-on + fotos-lote o
 *                  plano-tecnico) para el modo P. Defecto false: en listas marca
 *                  el CONTENEDOR (ver contrato en componentes.css).
 *       medicion   'presentacion' (defecto: barras solo en modo P) | true | false
 *       nota       true/false: nota del asterisco de la mensualidad dentro de la
 *                  tarjeta (defecto true; false en 'compacta')
 *       nivel      nivel del título (defecto 3 -> <h3>)
 *       carga      'lazy' (defecto) | 'eager' (para la primera fila visible)
 *       sizes      atributo sizes de la foto
 *       fig        rótulo editorial del pie de foto, p. ej. 'Fig. 02·a'
 *       fila       true = variante en renglón para listas (.tarjeta--fila): media + pie en
 *                  .tarjeta__foto-col; precio + nota + acciones en .tarjeta__compra
 *       coinciden, total   (lote) «N de M coinciden con tus filtros» si N < M (.tarjeta__coinciden)
 *       miembroLote true = (unidad de un lote) «▮▯▯ 1 de N del lote» + enlace «Ver lote»
 *                  a inventario.html?lote=<id> ([data-lote-miembro], .tarjeta__lote-enlace)
 *   GOON_TARJETA.montar(raiz)   pinta cada [data-tarjetas="MP4646 lote:L-5095a6 sinfoto:queretaro todas"]
 *                               (+ data-tarjetas-origen / -variante / -capas="true" / -carga="eager"
 *                               / -sizes="(max-width: 599px) 330px, 400px")
 *   GOON_TARJETA.plano(unidad, {rotulo, marca})   el plano «Fotografía en proceso»
 *   GOON_TARJETA.medicion(unidad)                 barras antigüedad/recorrido vs estándar
 *   GOON_TARJETA.nota()                           <p class="nota"> del asterisco
 *   GOON_TARJETA.desde(precio, anio)              detalle de GOON_FIN.desdeDetalle o null
 *   GOON_TARJETA.foto(unidad, variante)           {tipo:'propia'|'representativa'|'lote'|'dibujo', leyenda, ruta}
 *   GOON_TARJETA.califica(unidad)                 true si año y km están dentro del estándar
 *
 * Lote: sin el hash del lote a la vista (solo en modo P, «Lote <id>»); precio «Desde $X MXN» si
 * los precios difieren y «$X MXN c/u» si son iguales. «Go On» siempre con espacio duro.
 * Reglas que cuida: sello «Go On» (sin rótulos de certificación); la unidad «califica por
 * año modelo y kilometraje»; foto representativa rotulada (lote o modelo); sin
 * foto -> plano con «Fotografía en proceso» y su pie; km con GOON.fmt.kmCorto;
 * mensualidad con GOON_FIN y su nota en la misma tarjeta; WhatsApp ≥ 48 px a lo
 * ancho con texto específico («por el lote» en lotes); nada de por confirmar.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;

  var NS = 'http://www.w3.org/2000/svg';
  var LOGO_GOON = 'assets/logos/logo-goon-blanco.webp';
  // Rutas literales: así la verificación de assets sabe qué se usa.
  var MARCAS = {
    freightliner: 'assets/marcas/freightliner.webp',
    international: 'assets/marcas/international.webp',
    kenworth: 'assets/marcas/kenworth.webp',
    mack: 'assets/marcas/mack.webp',
    'mercedes-benz': 'assets/marcas/mercedes-benz.webp',
    peterbilt: 'assets/marcas/peterbilt.webp',
    scania: 'assets/marcas/scania.webp',
    volvo: 'assets/marcas/volvo.webp'
  };
  var TEXTO = {
    representativa_unidad: 'Foto representativa del modelo; la unidad puede variar en color y detalles',
    foto_lote: 'Foto representativa del lote; la unidad puede variar en color y detalles',
    en_proceso: 'Fotografía en proceso',
    dibujo: 'Dibujo técnico de referencia; no es la foto de la unidad',
    nota_mensualidad: 'Mensualidad con enganche de {enganche} a {plazo} meses; cifra ilustrativa sujeta a aprobación de crédito.'
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function el(tag, attrs, hijos) {
    var n = doc.createElement(tag);
    poner(n, attrs);
    agregar(n, hijos);
    return n;
  }

  function poner(n, attrs) {
    if (!attrs) return n;
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.setAttribute('class', v);
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    return n;
  }

  function agregar(n, hijos) {
    if (hijos === null || hijos === undefined) return n;
    if (!Array.isArray(hijos)) hijos = [hijos];
    for (var i = 0; i < hijos.length; i++) {
      var h = hijos[i];
      if (h === null || h === undefined || h === false || h === '') continue;
      n.appendChild(typeof h === 'string' || typeof h === 'number' ? doc.createTextNode(String(h)) : h);
    }
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

  function mensaje(clave) {
    var v = G.dato('mensajes.' + clave);
    return typeof v === 'string' && v && !G.porConfirmar('mensajes.' + clave) ? v : null;
  }

  function texto(claveHechos, claveLocal) {
    return mensaje(claveHechos) || TEXTO[claveLocal];
  }

  function hechos() { return root.GOON_HECHOS || {}; }

  function anioCorte() {
    if (typeof G.anioCorte === 'function') return G.anioCorte();
    var m = /^(\d{4})/.exec(String(((root.GOON_CATALOGO || {}).meta || {}).fecha_corte || ''));
    return m ? Number(m[1]) : new Date().getFullYear();
  }

  function numero(v) { var n = Number(v); return v !== null && v !== '' && isFinite(n) ? n : null; }

  function unidadDe(u) {
    if (u && typeof u === 'object') return u;
    return G.unidad(u);
  }

  function lugar(u) {
    if (!u) return '';
    if (!u.estado || u.estado === u.plaza) return u.plaza || '';
    return (u.plaza || '') + ', ' + u.estado;
  }

  function slug(marca) {
    return String(marca || '').toLowerCase().trim().replace(/\s+/g, '-');
  }

  function hrefFicha(u) { return 'unidad-' + encodeURIComponent(String(u.id)) + '.html'; }

  function rangoKm(min, max) {
    if (min === null || max === null) return '—';
    if (min === max) return G.fmt.kmCorto(min);
    var a = G.fmt.kmCorto(min);
    var b = G.fmt.kmCorto(max);
    if (/ mil km$/.test(a) && / mil km$/.test(b)) return a.replace(/ mil km$/, '') + '–' + b;
    return a + ' – ' + b;
  }

  // ---------------------------------------------------------------------------
  // Datos derivados
  // ---------------------------------------------------------------------------
  function califica(u) {
    var e = hechos().estandar || {};
    var anios = numero(e.anios_max);
    var kmMax = numero(e.km_max);
    var anio = numero(u && u.anio);
    var km = numero(u && u.km);
    if (anios === null || kmMax === null || anio === null || km === null) return false;
    return anioCorte() - anio <= anios && km <= kmMax;
  }

  function desde(precio, anio) {
    var FIN = root.GOON_FIN;
    if (!FIN || typeof FIN.desdeDetalle !== 'function') return null;
    try {
      var d = FIN.desdeDetalle(precio, anio, anioCorte(), hechos().financiamiento);
      return d && d.valido !== false && numero(d.mensualidad) !== null ? d : null;
    } catch (e) {
      return null;
    }
  }

  function loteDe(id) {
    var l = typeof G.lote === 'function' ? G.lote(id) : null;
    return l && l.n >= 2 ? l : null;
  }

  function portada(u) { return u && u.fotos && u.fotos.portada ? u.fotos.portada : null; }

  /** Qué foto muestra la tarjeta y con qué leyenda. */
  function foto(u, variante, lote) {
    var lt = lote || (u && u.lote ? loteDe(u.lote) : null);
    var p = portada(u);
    if (!p && lt) {
      for (var i = 0; i < lt.unidades.length; i++) {
        if (portada(lt.unidades[i])) { p = portada(lt.unidades[i]); break; }
      }
    }
    if (!p) return { tipo: 'dibujo', leyenda: texto('leyenda_dibujo_tecnico', 'dibujo'), ruta: 'mensajes.leyenda_dibujo_tecnico', foto: null };
    if (variante === 'lote' || (u.foto_representativa && lt)) {
      return { tipo: 'lote', leyenda: texto('leyenda_foto_lote', 'foto_lote'), ruta: 'mensajes.leyenda_foto_lote', foto: p };
    }
    if (u.foto_representativa) {
      return { tipo: 'representativa', leyenda: texto('leyenda_foto_representativa_unidad', 'representativa_unidad'),
        ruta: 'mensajes.leyenda_foto_representativa_unidad', foto: p };
    }
    return { tipo: 'propia', leyenda: null, ruta: null, foto: p };
  }

  // ---------------------------------------------------------------------------
  // Piezas
  // ---------------------------------------------------------------------------
  function sello() {
    return el('span', { 'class': 'sello-goon' }, [
      el('img', { src: LOGO_GOON, width: 600, height: 195, alt: 'Go On', decoding: 'async' })
    ]);
  }

  function plano(u, opciones) {
    var o = opciones || {};
    var dibujo = doc.createElementNS(NS, 'svg');
    dibujo.setAttribute('class', 'plano__dibujo');
    dibujo.setAttribute('viewBox', '0 0 1000 410');
    dibujo.setAttribute('aria-hidden', 'true');
    dibujo.setAttribute('focusable', 'false');
    var uso = doc.createElementNS(NS, 'use');
    uso.setAttribute('href', '#plano-tracto');
    dibujo.appendChild(uso);
    var rutaMarca = u ? MARCAS[slug(u.marca)] : null;
    var titulo = u ? [u.marca, u.modelo, u.anio].filter(Boolean).join(' ') : '';
    var rotulo = texto('rotulo_fotografia_en_proceso', 'en_proceso');
    return el('div', { 'class': 'plano', role: 'img', 'aria-label': rotulo + (titulo ? ': ' + titulo + ' (dibujo técnico de referencia)' : '') }, [
      dibujo,
      rutaMarca && o.marca !== false ? el('img', { 'class': 'plano__marca', src: rutaMarca, alt: '', width: 811, height: 160, loading: 'lazy', decoding: 'async' }) : null,
      u && o.ref !== false ? el('span', { 'class': 'plano__ref', 'aria-hidden': 'true', text: 'Ref. ' + u.id }) : null,
      o.rotulo === false ? null : el('span', { 'class': 'plano__rotulo' }, [icono('i-camara'), rotulo])
    ]);
  }

  function medicion(u) {
    var e = hechos().estandar || {};
    var aniosMax = numero(e.anios_max);
    var kmMax = numero(e.km_max);
    var anio = numero(u && u.anio);
    var km = numero(u && u.km);
    if (aniosMax === null || kmMax === null || anio === null || km === null) return null;
    var edad = Math.max(0, anioCorte() - anio);
    function fila(nombre, valor, tope, pct) {
      var barra = el('span');
      barra.style.setProperty('--pct', (Math.max(0, Math.min(1, pct)) * 100).toFixed(1) + '%');
      return el('div', { 'class': 'medicion__fila' }, [
        el('span', { 'class': 'medicion__nombre', text: nombre }),
        el('span', { 'class': 'medicion__valor' }, [valor, el('small', { text: ' · tope ≤ ' + tope })]),
        el('span', { 'class': 'medicion__barra', 'aria-hidden': 'true' }, [barra])
      ]);
    }
    return el('div', { 'class': 'medicion', role: 'group', 'aria-label': 'Medición contra el estándar Go On' }, [
      fila('Antigüedad', edad + (edad === 1 ? ' año' : ' años'), aniosMax + ' años', edad / aniosMax),
      fila('Recorrido', G.fmt.kmCorto(km), G.fmt.kmCorto(kmMax), km / kmMax)
    ]);
  }

  function notaTexto(d) {
    var base = texto('nota_mensualidad', 'nota_mensualidad');
    return base
      .replace('{enganche}', G.fmt.pct(d.enganche_pct))
      .replace('{plazo}', String(d.plazo));
  }

  function nota(d) {
    var det = d || null;
    if (!det) {
      var fin = hechos().financiamiento || {};
      var plazos = Array.isArray(fin.plazos) ? fin.plazos : [];
      if (numero(fin.enganche_min_pct) === null || !plazos.length) return null;
      det = { enganche_pct: fin.enganche_min_pct, plazo: plazos[plazos.length - 1] };
    }
    return el('p', { 'class': 'nota tarjeta__nota' }, [
      el('span', { 'class': 'nota__marca', 'aria-hidden': 'true', text: '*' }),
      el('span', { text: notaTexto(det) })
    ]);
  }

  function filaDato(etiqueta, valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    return el('div', null, [el('dt', { text: etiqueta }), el('dd', { text: valor })]);
  }

  function linkAttrs(href, u, origen, loteId, extra) {
    var a = {
      href: href,
      'data-event': 'ver_unidad',
      'data-event-unidad-id': u ? u.id : null,
      'data-event-origen': origen,
      'data-event-lote': loteId || null
    };
    for (var k in (extra || {})) if (Object.prototype.hasOwnProperty.call(extra, k)) a[k] = extra[k];
    return a;
  }

  function mediaDe(u, info, o, href, loteId) {
    var hijos = [];
    if (info.foto) {
      var f = info.foto;
      var alt = [u.marca, u.modelo, u.anio].filter(Boolean).join(' ');
      if (info.tipo === 'lote') alt += ', foto representativa del lote';
      else if (info.tipo === 'representativa') alt += ', foto representativa del modelo';
      hijos.push(el('a', linkAttrs(href, u, o.origen, loteId, { 'class': 'tarjeta__media-enlace', tabindex: '-1', 'aria-hidden': 'true' }), [
        el('img', {
          'class': 'tarjeta__foto', src: f.src, srcset: f.srcset || null,
          sizes: o.sizes || (o.variante === 'compacta' ? '112px' : '(min-width: 1100px) 400px, (min-width: 600px) 50vw, 100vw'),
          width: f.ancho || null, height: f.alto || null,
          loading: o.carga === 'eager' ? 'eager' : 'lazy', decoding: 'async', alt: alt
        })
      ]));
    } else {
      hijos.push(el('a', linkAttrs(href, u, o.origen, loteId, { 'class': 'tarjeta__media-enlace', tabindex: '-1', 'aria-hidden': 'true' }), [
        plano(u, { rotulo: o.variante !== 'compacta', marca: o.variante !== 'compacta', ref: o.variante !== 'compacta' })
      ]));
    }
    hijos.push(sello());
    var capa = null;
    if (o.capas) {
      capa = 'se_construye:sello-go-on';
      if (info.tipo === 'dibujo') capa += ' ilustrativo:plano-tecnico';
      else if (info.tipo === 'lote' || info.tipo === 'representativa') capa += ' ilustrativo:fotos-lote';
    }
    return el('div', { 'class': 'tarjeta__media', 'data-capa': capa }, hijos);
  }

  function pieFoto(info, o) {
    if (!info.leyenda) return null;
    return el('p', { 'class': 'pie-foto tarjeta__pie' }, [
      o.fig ? el('span', { 'class': 'fig', text: o.fig }) : icono('i-info'),
      el('span', { text: info.leyenda })
    ]);
  }

  /** Precio + «Desde $X/mes*». `previo` = rótulo antes de la cifra («Desde» en un lote con precios distintos). */
  function precioDe(monto, sufijo, d, conAsterisco, previo) {
    return el('div', { 'class': 'tarjeta__precio' }, [
      el('p', { 'class': 'tarjeta__monto' }, [
        previo ? el('small', { 'class': 'tarjeta__monto-previo', text: previo + ' ' }) : null,
        G.fmt.mxn(monto), el('small', { text: ' ' + sufijo })
      ]),
      d ? el('p', { 'class': 'tarjeta__desde' }, [
        'Desde ' + G.fmt.mxn(d.mensualidad) + '/mes',
        conAsterisco ? el('sup', { 'aria-hidden': 'true', text: '*' }) : null
      ]) : null
    ]);
  }

  function botonWa(u, texto, o, loteId) {
    return el('a', {
      'class': 'btn btn--wa btn--bloque',
      href: '#',
      'data-wa-unidad': u.id,
      'data-wa-lote': loteId || null,
      'data-event-origen': o.origen,
      'data-event-variante': o.variante
    }, [el('span', { 'class': 'btn__wa', 'aria-hidden': 'true' }, [icono('i-wa')]), texto]);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function opcionesDe(opciones) {
    var o = {};
    var fuente = opciones || {};
    for (var k in fuente) if (Object.prototype.hasOwnProperty.call(fuente, k)) o[k] = fuente[k];
    o.variante = o.variante === 'lote' || o.variante === 'compacta' ? o.variante : 'unidad';
    o.origen = o.origen || 'tarjeta';
    if (o.medicion === undefined) o.medicion = 'presentacion';
    if (o.nota === undefined) o.nota = o.variante !== 'compacta';
    o.nivel = Math.min(6, Math.max(2, Number(o.nivel) || 3));
    return o;
  }

  function titulo(u, o, href, loteId) {
    return el('h' + o.nivel, { 'class': 'tarjeta__titulo' }, [
      el('a', linkAttrs(href, u, o.origen, loteId, { 'class': 'tarjeta__enlace' }), [
        el('span', null, [(u.modelo || '') + ' ', el('span', { 'class': 'tarjeta__anio', text: String(u.anio || '') })])
      ])
    ]);
  }

  /** Marca + referencia. `ref` = id de la unidad (visible); `refP` = texto que solo sale en modo P (id del lote). */
  function lineaMarca(marca, ref, refP) {
    return el('p', { 'class': 'tarjeta__marca' }, [
      el('span', { text: marca || '' }),
      ref ? el('span', { 'class': 'id-mono', text: 'Ref. ' + ref }) : null,
      refP ? el('span', { 'class': 'id-mono solo-presentacion', text: refP }) : null
    ]);
  }

  function lineaEstandar(u) {
    if (!califica(u)) return null;
    // «Go On» con espacio duro: la marca nunca se parte en dos renglones.
    return el('p', { 'class': 'tarjeta__estandar' }, [icono('i-check'), 'Año y km dentro del estándar Go\u00a0On']);
  }

  function plural(n, uno, varios) { return n === 1 ? uno : varios; }

  /**
   * «▮ 1 unidad» / «▮▮▮ 10 unidades · mismo modelo»: mismo ritmo en todas las tarjetas.
   * `huecos` agrega pictos vacíos (miembro de lote: ▮▯▯▯ 1 de 10 del lote). `extra` va al final.
   */
  function lineaUnidades(n, palabra, resto, huecos, extra) {
    var pictos = el('span', { 'class': 'pictos', 'aria-hidden': 'true' });
    for (var i = 0; i < Math.min(n, 24); i++) pictos.appendChild(el('i'));
    for (var j = 0; j < Math.min(huecos || 0, 24 - Math.min(n, 24)); j++) pictos.appendChild(el('i', { 'class': 'es-hueco' }));
    return el('p', { 'class': 'tarjeta__pictos' }, [
      pictos,
      el('span', null, [el('b', { text: n + ' ' + palabra }), resto || '']),
      extra || null
    ]);
  }

  /** «N de M coinciden con tus filtros» (lote con filtros activos); null si coinciden todas. */
  function coincidencias(o) {
    var c = numero(o.coinciden);
    var t = numero(o.total);
    if (c === null || t === null || c >= t || c < 0) return null;
    return el('span', { 'class': 'tarjeta__coinciden', text: c + ' de ' + t + ' ' + plural(c, 'coincide', 'coinciden') + ' con tus filtros' });
  }

  /** Vista por unidades: la unidad de un lote dice «1 de N del lote» y enlaza al lote. */
  function lineaMiembro(u, o, lt) {
    var titulo = [u.marca, u.modelo, u.anio].filter(Boolean).join(' ');
    var enlace = el('a', {
      'class': 'tarjeta__lote-enlace', href: 'inventario.html?lote=' + encodeURIComponent(lt.id),
      'data-lote-miembro': lt.id,
      'aria-label': 'Ver el lote de ' + lt.n + ' ' + titulo
    }, ['Ver lote', icono('i-flecha')]);
    return lineaUnidades(1, 'de ' + lt.n + ' del lote', null, lt.n - 1, enlace);
  }

  function bloqueMedicion(u, o) {
    if (o.medicion === false) return null;
    var m = medicion(u);
    if (!m) return null;
    m.classList.add('tarjeta__medicion');
    if (o.medicion !== true) m.classList.add('solo-presentacion');
    return m;
  }

  /**
   * Arma la tarjeta. Normal: media · pie · cuerpo(info + compra). Con fila:true (listas):
   * .tarjeta--fila, media + pie en .tarjeta__foto-col y precio + nota + acciones en
   * .tarjeta__compra (al final del cuerpo); el acomodo en renglón vive en componentes.css.
   */
  function armarTarjeta(art, media, pie, info, compra, o) {
    var cuerpo = el('div', { 'class': 'tarjeta__cuerpo' }, info);
    if (o.fila) {
      art.classList.add('tarjeta--fila');
      agregar(cuerpo, el('div', { 'class': 'tarjeta__compra' }, compra));
      agregar(art, [el('div', { 'class': 'tarjeta__foto-col' }, [media, pie]), cuerpo]);
    } else {
      agregar(cuerpo, compra);
      agregar(art, [media, pie, cuerpo]);
    }
    return art;
  }

  function renderUnidad(u, o) {
    var href = o.href || hrefFicha(u);
    var info = foto(u, 'unidad');
    var d = desde(u.precio, u.anio);
    var lt = o.miembroLote && u.lote ? loteDe(u.lote) : null;
    var art = el('article', {
      'class': 'tarjeta' + (info.tipo === 'dibujo' ? ' tarjeta--sin-foto' : ''),
      'data-unidad-id': u.id, 'data-variante': 'unidad', 'data-foto': info.tipo
    });
    return armarTarjeta(art, mediaDe(u, info, o, href, null), pieFoto(info, o), [
      lineaMarca(u.marca, u.id),
      titulo(u, o, href, null),
      lineaEstandar(u),
      lt ? lineaMiembro(u, o, lt) : lineaUnidades(1, 'unidad', null),
      bloqueMedicion(u, o),
      el('dl', { 'class': 'tarjeta__datos' }, [
        filaDato('Kilometraje', G.fmt.kmCorto(u.km)),
        filaDato('Motor', u.motor),
        filaDato('Transmisión', u.transmision),
        filaDato('Ubicación', lugar(u))
      ])
    ], [
      precioDe(u.precio, 'MXN', d, !!(d && o.nota)),
      d && o.nota ? nota(d) : null,
      el('div', { 'class': 'tarjeta__acciones' }, [
        botonWa(u, 'Preguntar por esta unidad', o, null),
        el('a', linkAttrs(href, u, o.origen, null, { 'class': 'tarjeta__ver', 'aria-label': 'Ver unidad: ' + [u.marca, u.modelo, u.anio].join(' ') }),
          ['Ver unidad', icono('i-flecha')])
      ])
    ], o);
  }

  function renderLote(u, o) {
    var lt = loteDe(o.lote || u.lote);
    if (!lt) return renderUnidad(u, o);
    var rep = lt.representante;
    var href = o.href || hrefFicha(rep);
    var info = foto(rep, 'lote', lt);
    var mismoPrecio = lt.precio_min === lt.precio_max;
    var d = desde(lt.precio_min, rep.anio);
    var art = el('article', {
      'class': 'tarjeta tarjeta--lote' + (info.tipo === 'dibujo' ? ' tarjeta--sin-foto' : ''),
      'data-unidad-id': rep.id, 'data-lote': lt.id, 'data-variante': 'lote', 'data-foto': info.tipo
    });
    var media = mediaDe(rep, info, o, href, lt.id);
    media.appendChild(el('span', { 'class': 'tarjeta__insignia', text: 'Lote · ' + lt.n + ' unidades' }));
    // El id del lote es un hash técnico: en público no se muestra; en modo P, sí.
    return armarTarjeta(art, media, pieFoto(info, o), [
      lineaMarca(rep.marca, null, 'Lote ' + lt.id),
      titulo(rep, o, href, lt.id),
      lineaEstandar(rep),
      lineaUnidades(lt.n, 'unidades', ' · mismo modelo', 0, coincidencias(o)),
      bloqueMedicion(rep, o),
      el('dl', { 'class': 'tarjeta__datos' }, [
        filaDato('Kilometraje', rangoKm(lt.km_min, lt.km_max)),
        filaDato('Motor', rep.motor),
        filaDato('Transmisión', rep.transmision),
        filaDato('Ubicación', lugar(rep))
      ])
    ], [
      mismoPrecio ? precioDe(lt.precio_min, 'MXN c/u', d, !!(d && o.nota))
        : precioDe(lt.precio_min, 'MXN', d, !!(d && o.nota), 'Desde'),
      d && o.nota ? nota(d) : null,
      el('div', { 'class': 'tarjeta__acciones' }, [
        botonWa(rep, 'Preguntar por el lote', o, lt.id),
        el('a', linkAttrs(o.hrefLote || ('inventario.html?lote=' + encodeURIComponent(lt.id)), rep, o.origen, lt.id,
          { 'class': 'tarjeta__ver' }), ['Ver las ' + lt.n + ' unidades', icono('i-flecha')])
      ])
    ], o);
  }

  function renderCompacta(u, o) {
    var href = o.href || hrefFicha(u);
    var info = foto(u, 'unidad');
    var d = desde(u.precio, u.anio);
    var estadoFoto = info.tipo === 'dibujo' ? texto('rotulo_fotografia_en_proceso', 'en_proceso')
      : (info.tipo === 'propia' ? null : 'Foto representativa');
    var art = el('article', {
      'class': 'tarjeta tarjeta--compacta' + (info.tipo === 'dibujo' ? ' tarjeta--sin-foto' : ''),
      'data-unidad-id': u.id, 'data-variante': 'compacta', 'data-foto': info.tipo
    });
    agregar(art, [
      mediaDe(u, info, o, href, null),
      el('div', { 'class': 'tarjeta__cuerpo' }, [
        lineaMarca(u.marca, null),
        titulo(u, o, href, null),
        el('p', { 'class': 'tarjeta__linea', text: G.fmt.kmCorto(u.km) + ' · ' + (u.plaza || '') }),
        estadoFoto ? el('p', { 'class': 'pie-foto', text: estadoFoto }) : null,
        precioDe(u.precio, 'MXN', d, !!d)
      ]),
      el('div', { 'class': 'tarjeta__acciones' }, [botonWa(u, 'Preguntar por esta unidad', o, null)])
    ]);
    return art;
  }

  function render(unidad, opciones) {
    var o = opcionesDe(opciones);
    var u = unidadDe(unidad);
    if (!u && o.variante === 'lote' && o.lote) {
      var lt = loteDe(o.lote);
      u = lt ? lt.representante : null;
    }
    if (!u) {
      if (root.console && root.console.warn) root.console.warn('[GOON_TARJETA] unidad no encontrada: ' + unidad);
      return null;
    }
    if (o.variante === 'lote') return renderLote(u, o);
    if (o.variante === 'compacta') return renderCompacta(u, o);
    return renderUnidad(u, o);
  }

  // ---------------------------------------------------------------------------
  // Montaje declarativo: <div data-tarjetas="MP4646 lote:L-5095a6 sinfoto:queretaro">
  // ---------------------------------------------------------------------------
  function primeraSinFoto(sucursalId) {
    var cat = root.GOON_CATALOGO || {};
    var lista = (Array.isArray(cat.unidades) ? cat.unidades : []).filter(function (u) {
      return u && (!sucursalId || u.sucursal_id === sucursalId) && !portada(u) && !(u.lote && loteConFoto(u.lote));
    });
    lista.sort(function (a, b) { return (numero(a.km) || 0) - (numero(b.km) || 0); });
    return lista[0] || null;
  }

  function loteConFoto(id) {
    var lt = loteDe(id);
    if (!lt) return false;
    for (var i = 0; i < lt.unidades.length; i++) if (portada(lt.unidades[i])) return true;
    return false;
  }

  function montar(raiz) {
    var hechas = 0;
    G.qsa('[data-tarjetas]', raiz || doc).forEach(function (cont) {
      if (cont.getAttribute('data-tarjetas-montado')) return;
      var fichas = String(cont.getAttribute('data-tarjetas') || '').split(/\s+/).filter(Boolean);
      var base = {
        origen: cont.getAttribute('data-tarjetas-origen') || 'tarjeta',
        variante: cont.getAttribute('data-tarjetas-variante') || undefined,
        capas: cont.getAttribute('data-tarjetas-capas') === 'true',
        carga: cont.getAttribute('data-tarjetas-carga') || undefined,
        sizes: cont.getAttribute('data-tarjetas-sizes') || undefined
      };
      var cat = root.GOON_CATALOGO || {};
      var lista = [];
      fichas.forEach(function (f) {
        var p = f.indexOf(':');
        var tipo = p === -1 ? 'unidad' : f.slice(0, p);
        var valor = p === -1 ? f : f.slice(p + 1);
        if (f === 'todas') {
          (Array.isArray(cat.unidades) ? cat.unidades : []).forEach(function (u) { lista.push([u, {}]); });
        } else if (tipo === 'lote') {
          var lt = loteDe(valor);
          if (lt) lista.push([lt.representante, { variante: 'lote', lote: valor }]);
        } else if (tipo === 'sinfoto') {
          var s = primeraSinFoto(valor);
          if (s) lista.push([s, {}]);
        } else {
          lista.push([valor, {}]);
        }
      });
      lista.forEach(function (par, i) {
        var o = {};
        for (var k in base) if (base[k] !== undefined) o[k] = base[k];
        for (var j in par[1]) o[j] = par[1][j];
        if (base.carga === 'eager' && i > 2) o.carga = 'lazy';
        var t = render(par[0], o);
        if (t) { cont.appendChild(t); hechas++; }
      });
      cont.setAttribute('data-tarjetas-montado', '1');
    });
    return hechas;
  }

  root.GOON_TARJETA = {
    version: '1.1.0',
    render: render,
    montar: montar,
    plano: plano,
    medicion: medicion,
    nota: function () { return nota(null); },
    desde: desde,
    foto: function (u, variante) { var x = unidadDe(u); return x ? foto(x, variante || 'unidad') : null; },
    califica: function (u) { return califica(unidadDe(u)); },
    rangoKm: rangoKm
  };

  G.listo(function () { montar(doc); });
})(window);
