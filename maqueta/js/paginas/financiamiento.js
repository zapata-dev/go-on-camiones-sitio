/*!
 * Go On Camiones — financiamiento.js (página «Financiamiento»)
 * Script clásico (IIFE), sin red. Depende de nucleo.js (GOON), financiamiento-core.js
 * (GOON_FIN), comun.js y tarjeta-unidad.js (GOON_TARJETA: foto y plano de la unidad).
 *
 * Simulador de crédito sobre GOON_FIN con los parámetros de GOON_HECHOS.financiamiento:
 *   - unidad del catálogo (o precio y año libres); ?id=<id> o ?lote=<lote> la preseleccionan
 *   - enganche desde el mínimo (campo en MXN + deslizador), plazos de plazosPermitidos()
 *   - resultados: mensualidad, precio, enganche, comisión, pago inicial y monto financiado
 *     (nunca la tasa ni el CAT); el DOM siempre tiene el valor final (la animación es
 *     solo un destello de ≤ 320 ms al cambiar, sin cifras intermedias)
 *   - vigencia vencida (GOON_FIN.vigencia) -> sin cifras y derivación a F&I
 *   - evento «cotizar» (con pausa, solo tras interacción: la ficha ya lo mide al llegar
 *     con ?id) y WhatsApp demo con la simulación en el mensaje (se inyecta en
 *     «goon:wa-demo» antes de que presentacion.js abra la vista previa)
 *   - ?hoy=AAAA-MM-DD fija la fecha de evaluación de la vigencia (demostración); con la
 *     vigencia vencida, body.fin-vencida apaga también las afirmaciones del resto de la página
 *   - la mensualidad siempre a la vista: en escritorio la corrida es pegajosa si cabe
 *     completa (body.fin-fijo, medido aquí); si no cabe, y siempre en celular, una franja
 *     fija con la mensualidad (body.fin-sim-en-vista esconde la barra móvil del shell)
 *   - los campos de monto validan al salir (change); mientras se teclea solo se recalcula
 *     con valores válidos y se conserva la última cotización
 * La institución financiera no se escribe aquí: la pinta data-dato solo a nivel página,
 * y con una unidad International elegida se esconde (body.fin-sin-institucion).
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  var FIN = root.GOON_FIN;
  if (!G || !doc) return;

  var TOPE_ENGANCHE_PCT = 0.7;   // tope del simulador (deslizador y campo); no es condición de crédito
  var MARGEN_TOPE_PCT = 0.2;     // si el mínimo sube, el tope queda al menos 20 pts arriba
  var PASO_DESLIZADOR = 5000;    // MXN
  var PAUSA_EVENTO = 900;        // ms sin cambios antes de medir «cotizar»
  var PAUSA_ANUNCIO = 700;       // ms antes de anunciar el resultado al lector de pantalla
  var PAUSA_TECLEO = 650;        // ms sin teclear antes de recalcular con el precio capturado
  var MARCAS_SIN_INSTITUCION = ['international'];

  var H = {};
  var raiz = null;
  var el = {};
  var estado = {
    modo: 'unidad',
    unidadId: null,
    precioLibre: null,
    anioLibre: null,
    enganche: null,         // MXN
    engPct: null,           // % elegido: se conserva al cambiar de unidad
    plazo: null,
    hoy: null,              // fecha de evaluación de la vigencia (null = reloj)
    vencerDemo: false,
    elegida: false,         // el visitante eligió algo (o llegó con ?id)
    interactuo: false
  };
  var ultima = null;          // última cotización de GOON_FIN
  var ultimoAnio = null;
  var claveEvento = '';
  var tEvento = null;
  var tAnuncio = null;
  var tPrecio = null;
  var cuadroAjuste = 0;

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function q(sel) { return raiz ? raiz.querySelector(sel) : null; }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v === null || v === undefined ? '' : v).replace(/[^\d.]/g, '');
    if (!s) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function mxn(n) { return G.fmt.mxn(n); }
  function pct(f) { return G.fmt.pct(f); }
  /** Porcentaje redondeado a entero para rótulos de escala («70%», nunca «69.8%»). */
  function pctEntero(f) { return G.fmt.pct(f, 0); }

  /** El visitante ya simuló algo: eligió unidad o precio, o movió enganche o plazo. */
  function simulo() { return !!(estado.elegida || estado.interactuo); }

  function texto(nodo, t) { if (nodo) nodo.textContent = t; }

  function crear(tag, attrs, hijos) {
    var n = doc.createElement(tag);
    var a = attrs || {};
    for (var k in a) {
      if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
      var v = a[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    [].concat(hijos || []).forEach(function (h) {
      if (h === null || h === undefined || h === false || h === '') return;
      n.appendChild(typeof h === 'string' ? doc.createTextNode(h) : h);
    });
    return n;
  }

  function icono(id) {
    var NS = 'http://www.w3.org/2000/svg';
    var s = doc.createElementNS(NS, 'svg');
    s.setAttribute('class', 'icono');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var u = doc.createElementNS(NS, 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }

  function movReducido() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function estatico() { return doc.documentElement.classList.contains('goon-estatico'); }

  /** Destello breve al cambiar un número (el texto ya es el valor final). */
  function destellar(nodo) {
    if (!nodo || movReducido() || estatico()) return;
    nodo.classList.remove('fin-cambia');
    void nodo.offsetWidth;
    nodo.classList.add('fin-cambia');
  }

  function poner(nodo, t, animar) {
    if (!nodo) return;
    if (nodo.textContent === t) return;
    nodo.textContent = t;
    if (animar) destellar(nodo);
  }

  function isoValido(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? s : null;
  }

  function diaSiguiente(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)).toISOString().slice(0, 10);
  }

  function anioRef() { return typeof G.anioCorte === 'function' ? G.anioCorte() : new Date().getFullYear(); }

  function nombreUnidad(u) { return [u.marca, u.modelo, u.anio].filter(Boolean).join(' '); }

  function lugarDe(u) {
    if (!u) return '';
    return u.estado && u.estado !== u.plaza ? u.plaza + ', ' + u.estado : (u.plaza || '');
  }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  // ---------------------------------------------------------------------------
  // Catálogo
  // ---------------------------------------------------------------------------
  function unidades() {
    var c = root.GOON_CATALOGO;
    return c && Array.isArray(c.unidades) ? c.unidades.filter(function (u) { return u && num(u.precio) && num(u.anio); }) : [];
  }

  function unidadActual() {
    return estado.modo === 'unidad' && estado.unidadId ? G.unidad(estado.unidadId) : null;
  }

  /** Unidad por defecto: la primera con foto propia o representativa; si no, la primera. */
  function unidadPorDefecto() {
    var lista = unidades();
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].fotos && lista[i].fotos.portada) return lista[i];
    }
    return lista[0] || null;
  }

  function llenarUnidades() {
    var sel = el.unidad;
    if (!sel) return;
    var grupos = {};
    var orden = [];
    unidades().forEach(function (u) {
      var k = u.sucursal_id || 'otras';
      if (!grupos[k]) { grupos[k] = []; orden.push(k); }
      grupos[k].push(u);
    });
    orden.sort(function (a, b) { return grupos[b].length - grupos[a].length; });
    orden.forEach(function (k) {
      var lista = grupos[k].slice().sort(function (a, b) {
        return (num(a.precio) - num(b.precio)) || (num(a.km) - num(b.km));
      });
      var nombre = typeof G.nombreSucursal === 'function' ? G.nombreSucursal(k) : k;
      var og = crear('optgroup', { label: nombre + ' · ' + plural(lista.length, 'unidad', 'unidades') });
      lista.forEach(function (u) {
        og.appendChild(crear('option', {
          value: u.id,
          text: nombreUnidad(u) + ' · ' + G.fmt.kmCorto(u.km) + ' · ' + mxn(u.precio) + ' · Ref. ' + u.id
        }));
      });
      sel.appendChild(og);
    });
  }

  function llenarAnios() {
    var sel = el.anio;
    if (!sel) return;
    var ref = anioRef();
    var antig = num(H.antiguedad_max);
    var tramo = antig === null ? 10 : antig + 1; // un año de más para mostrar la regla
    for (var a = ref; a >= ref - tramo; a--) {
      sel.appendChild(crear('option', { value: String(a), text: String(a) }));
    }
  }

  // ---------------------------------------------------------------------------
  // Resumen de la unidad elegida (no es una tarjeta de venta: solo contexto)
  // ---------------------------------------------------------------------------
  function pintarUnidad(u) {
    var caja = el.resumen;
    if (!caja) return;
    caja.textContent = '';
    if (!u) return;
    var T = root.GOON_TARJETA;
    var info = T && typeof T.foto === 'function' ? T.foto(u) : null;
    var media = crear('div', { 'class': 'fin-unidad__media' });
    var conFoto = !!(info && info.foto);
    if (conFoto) {
      var f = info.foto;
      var alt = nombreUnidad(u) + (info.tipo === 'lote' ? ', foto representativa del lote'
        : (info.tipo === 'representativa' ? ', foto representativa del modelo' : ''));
      media.appendChild(crear('img', {
        src: f.src, srcset: f.srcset || null, sizes: '(min-width: 600px) 184px, 112px',
        width: f.ancho || null, height: f.alto || null, alt: alt, decoding: 'async'
      }));
    } else if (T && typeof T.plano === 'function') {
      media.appendChild(T.plano(u, { rotulo: false, marca: false, ref: false }));
    }
    var rotulo = G.dato('mensajes.rotulo_fotografia_en_proceso');
    var leyenda = info ? info.leyenda : null;
    var ficha = 'unidad-' + encodeURIComponent(String(u.id)) + '.html';
    caja.appendChild(media);
    caja.appendChild(crear('div', { 'class': 'fin-unidad__cuerpo' }, [
      crear('p', { 'class': 'fin-unidad__marca' }, [crear('span', { text: u.marca || '' }), crear('span', { 'class': 'id-mono', text: 'Ref. ' + u.id })]),
      crear('p', { 'class': 'fin-unidad__titulo' }, [(u.modelo || '') + ' ', crear('span', { 'class': 'fin-unidad__anio', text: String(u.anio || '') })]),
      crear('p', { 'class': 'fin-unidad__linea', text: G.fmt.kmCorto(u.km) + ' · ' + lugarDe(u) }),
      crear('p', { 'class': 'fin-unidad__precio' }, [mxn(u.precio), crear('small', { text: ' MXN' })])
    ]));
    caja.appendChild(crear('div', { 'class': 'fin-unidad__pie' }, [
      leyenda ? crear('p', { 'class': 'pie-foto fin-unidad__leyenda' }, [
        icono(conFoto ? 'i-info' : 'i-camara'),
        crear('span', null, [
          !conFoto && typeof rotulo === 'string' ? crear('b', { text: rotulo }) : null,
          leyenda
        ])
      ]) : null,
      crear('a', {
        'class': 'fin-unidad__ficha', href: ficha,
        'data-event': 'ver_unidad', 'data-event-unidad-id': u.id, 'data-event-origen': 'financiamiento',
        'aria-label': 'Ver ficha: ' + nombreUnidad(u)
      }, ['Ver ficha', icono('i-flecha')])
    ]));
    // La institución (si la hay) no convive con unidades International en la misma página.
    var marca = String(u.marca || '').toLowerCase();
    doc.body.classList.toggle('fin-sin-institucion', MARCAS_SIN_INSTITUCION.indexOf(marca) !== -1);
  }

  function aviso(t) {
    if (!el.aviso) return;
    el.aviso.hidden = !t;
    el.aviso.textContent = t || '';
  }

  // ---------------------------------------------------------------------------
  // Entrada del simulador
  // ---------------------------------------------------------------------------
  function base() {
    var u = unidadActual();
    if (u) return { precio: num(u.precio), anio: num(u.anio), unidad: u };
    return { precio: estado.precioLibre, anio: estado.anioLibre, unidad: null };
  }

  function engancheMin(precio) {
    var p = num(H.enganche_min_pct);
    return precio ? Math.ceil(precio * (p === null ? 0.2 : p)) : null;
  }

  function topeDeslizador(precio) {
    var pMin = num(H.enganche_min_pct) || 0;
    var t = Math.max(TOPE_ENGANCHE_PCT, pMin + MARGEN_TOPE_PCT);
    return Math.max(engancheMin(precio), Math.floor((precio * t) / PASO_DESLIZADOR) * PASO_DESLIZADOR);
  }

  function entrada(plazo) {
    var b = base();
    return {
      precio: b.precio,
      anioModelo: b.anio,
      anioReferencia: anioRef(),
      hoy: estado.hoy || undefined,
      plazo: plazo === undefined ? estado.plazo : plazo,
      engancheMonto: estado.enganche
    };
  }

  /** Ajusta enganche y plazo al cambiar de unidad/precio/año conservando el % elegido. */
  function normalizar() {
    var b = base();
    if (!b.precio) return;
    var min = engancheMin(b.precio);
    if (estado.engPct === null) estado.engPct = num(H.enganche_min_pct) || 0.2;
    var deseado = Math.round(b.precio * estado.engPct);
    estado.enganche = Math.max(min, Math.min(deseado, topeDeslizador(b.precio)));
    var permitidos = FIN ? FIN.plazosPermitidos(b.anio, anioRef(), H) : [];
    if (permitidos.length && permitidos.indexOf(estado.plazo) === -1) {
      estado.plazo = permitidos[permitidos.length - 1];
    }
  }

  // ---------------------------------------------------------------------------
  // Pintar
  // ---------------------------------------------------------------------------
  function vigenciaActual() {
    if (!FIN || typeof FIN.vigencia !== 'function') return { vigente: true, verificada: false };
    return FIN.vigencia(H, estado.hoy || undefined);
  }

  function pintarDeslizador(b) {
    var r = el.rango;
    if (!r || !b.precio) return;
    var min = engancheMin(b.precio);
    var max = topeDeslizador(b.precio);
    r.min = String(min);
    r.max = String(max);
    r.step = String(PASO_DESLIZADOR);
    var v = Math.max(min, Math.min(max, estado.enganche || min));
    r.value = String(v);
    // el deslizador con step parte de min: si v no cae en la rejilla, el navegador lo redondea
    var pctLleno = max > min ? ((Number(r.value) - min) / (max - min)) * 100 : 0;
    r.style.setProperty('--lleno', pctLleno.toFixed(2) + '%');
    r.setAttribute('aria-valuetext', mxn(estado.enganche) + ', ' + pct(estado.enganche / b.precio) + ' del precio');
    texto(el.rangoMin, pctEntero(min / b.precio) + ' · ' + mxn(min));
    texto(el.rangoMax, pctEntero(max / b.precio) + ' · ' + mxn(max));
  }

  /** Nota bajo el enganche cuando el valor capturado se ajustó al mínimo o al tope. */
  function ajuste(t) {
    if (!el.ajuste) return;
    el.ajuste.hidden = !t;
    el.ajuste.textContent = t || '';
  }

  function pintarPlazos(b, vig, animar) {
    var caja = el.plazos;
    if (!caja) return;
    var permitidos = FIN && b.anio ? FIN.plazosPermitidos(b.anio, anioRef(), H) : [];
    var lista = Array.isArray(H.plazos) ? H.plazos : [];
    if (!caja.children.length) {
      lista.forEach(function (p) {
        var input = crear('input', { type: 'radio', name: 'fin-plazo', value: String(p) });
        caja.appendChild(crear('label', { 'class': 'fin-plazo', 'data-plazo': String(p) }, [
          input,
          crear('span', { 'class': 'fin-plazo__meses' }, [crear('b', { text: String(p) }), ' meses']),
          crear('span', { 'class': 'fin-plazo__monto', 'data-fin-plazo-monto': '' }),
          crear('span', { 'class': 'fin-plazo__marca', 'aria-hidden': 'true' }, [icono('i-check')])
        ]));
      });
    }
    var conMontos = false;
    G.qsa('.fin-plazo', caja).forEach(function (lab) {
      var p = Number(lab.getAttribute('data-plazo'));
      var input = lab.querySelector('input');
      var monto = lab.querySelector('[data-fin-plazo-monto]');
      var ok = permitidos.indexOf(p) !== -1;
      input.disabled = !ok;
      input.checked = ok && p === estado.plazo;
      lab.classList.toggle('es-inactivo', !ok);
      if (!ok) { poner(monto, 'No disponible', false); return; }
      if (!vig.vigente) { poner(monto, 'Con tu asesor', false); return; }
      var c = FIN.cotizar(entrada(p), H);
      if (c.valido) conMontos = true;
      poner(monto, c.valido ? mxn(c.mensualidad) + '/mes*' : '—', animar);
    });

    // Regla de antigüedad: solo si este año modelo recorta o anula los plazos.
    var regla = '';
    if (b.anio && !permitidos.length) {
      regla = 'Para un modelo ' + b.anio + ' no hay plazos: el crédito aplica a unidades de hasta ' +
        H.antiguedad_max + ' años de antigüedad.';
    } else if (b.anio && permitidos.length < lista.length) {
      regla = 'Para un modelo ' + b.anio + ' el plazo máximo es de ' + permitidos[permitidos.length - 1] +
        ' meses: la antigüedad más el plazo no pasa de ' + H.edad_mas_plazo_max + ' años.';
    }
    if (el.plazosRegla) { el.plazosRegla.hidden = !regla; texto(el.plazosRegla, regla); }

    // Nota del asterisco: siempre que haya montos «/mes*» en pantalla.
    if (el.plazosNota) {
      el.plazosNota.hidden = !conMontos;
      texto(el.plazosNotaTexto, conMontos
        ? 'Mensualidades con enganche de ' + mxn(estado.enganche) + '; cifras ilustrativas sujetas a aprobación de crédito.'
        : '');
    }
  }

  function mostrarEstado(etiqueta, titulo, cuerpo) {
    if (el.cifras) el.cifras.hidden = !!titulo;
    if (el.estado) el.estado.hidden = !titulo;
    if (titulo) {
      texto(el.estadoEtiqueta, etiqueta);
      texto(el.estadoTitulo, titulo);
      texto(el.estadoTexto, cuerpo || '');
    }
  }

  function pintarPegado(c, vig, animar) {
    var p = el.pegado;
    if (!p) return;
    var ok = vig.vigente && c && c.valido;
    p.classList.toggle('es-estado', !ok);
    if (el.pegadoLegal) el.pegadoLegal.hidden = !ok;
    if (ok) {
      texto(el.pegadoRotulo, 'Mensualidad a ' + c.plazo + ' meses');
      poner(el.pegadoMonto, mxn(c.mensualidad), animar);
      texto(el.pegadoSufijo, '/mes*');
    } else {
      texto(el.pegadoRotulo, vig.vigente ? 'Ajusta la simulación' : 'Condiciones en actualización');
      poner(el.pegadoMonto, vig.vigente ? 'Revisa los datos' : 'Consulta con tu asesor', false);
      texto(el.pegadoSufijo, '');
    }
  }

  function pintarResultado(c, b, vig, animar) {
    var u = b.unidad;
    texto(el.rUnidad, u ? nombreUnidad(u)
      : (b.precio ? 'Unidad de ' + mxn(b.precio) + ' · modelo ' + (b.anio || '—') : 'Captura un precio'));
    texto(el.rMeta, u ? 'Ref. ' + u.id + ' · ' + lugarDe(u) : (b.precio ? 'Precio capturado por ti' : ''));

    if (!vig.vigente) {
      var hasta = vig.vigencia_hasta ? G.fmt.fecha(vig.vigencia_hasta, 'larga') : null;
      mostrarEstado('Condiciones en actualización', 'Por ahora no mostramos mensualidades.',
        (hasta ? 'Las condiciones de crédito de referencia estuvieron vigentes hasta el ' + hasta + '. ' : '') +
        'Escríbenos y tu asesor te da la corrida vigente de F&I para esta unidad.');
    } else if (!c.valido) {
      var t = 'Ajusta la simulación';
      if (c.codigo === 'antiguedad') t = 'Este año modelo no aplica';
      else if (c.codigo === 'precio_invalido') t = 'Captura un precio válido';
      else if (c.codigo === 'enganche_insuficiente') t = 'El enganche es menor al mínimo';
      else if (c.codigo === 'enganche_excede_precio') t = 'El enganche cubre todo el precio';
      mostrarEstado('Ajusta la simulación', t, c.motivo || '');
    } else {
      mostrarEstado('', '', '');
      poner(el.rMensualidad, mxn(c.mensualidad), animar);
      poner(el.rPlazo, 'a ' + c.plazo + ' meses, con ' + pct(c.enganche_pct) + ' de enganche', animar);
      poner(el.rPrecio, mxn(c.precio), animar);
      poner(el.rEnganche, mxn(c.enganche), animar);
      poner(el.rComision, mxn(c.comision), animar);
      poner(el.rInicial, mxn(c.pago_inicial), animar);
      poner(el.rFinanciado, mxn(c.monto_financiado), animar);
      var fEng = Math.max(0, Math.min(1, c.enganche / c.precio));
      if (el.bEnganche) el.bEnganche.style.flexGrow = String(fEng);
      if (el.bFinanciado) el.bFinanciado.style.flexGrow = String(1 - fEng);
      texto(el.bEnganchePct, pct(fEng));
      texto(el.bFinanciadoPct, pct(1 - fEng));
    }
    pintarPegado(c, vig, animar);

    texto(el.waTexto, vig.vigente && c.valido ? 'Enviar simulación por WhatsApp' : 'Pedir la corrida por WhatsApp');
  }

  function pintarVigencia(vig) {
    var t = el.vigencia;
    if (!t) return;
    if (!vig.verificada) {
      texto(t, 'Los parámetros de crédito no traen fecha de vigencia.');
    } else if (vig.vigencia && vig.vigencia_hasta) {
      texto(t, 'Parámetros de F&I del ' + G.fmt.fecha(vig.vigencia, 'larga') + ', vigentes hasta el ' +
        G.fmt.fecha(vig.vigencia_hasta, 'larga') + '. Al vencer, el simulador deja de mostrar cifras y deriva a F&I.');
    }
    if (el.vencer) {
      el.vencer.hidden = !vig.verificada || !vig.vigencia_hasta;
      el.vencer.setAttribute('aria-pressed', estado.vencerDemo ? 'true' : 'false');
      el.vencer.textContent = estado.vencerDemo ? 'Volver a la vigencia actual' : 'Ver cómo se apaga al vencer';
    }
  }

  function pintarMatrizFila(anio) {
    if (!el.matriz) return;
    G.qsa('tbody tr', el.matriz).forEach(function (tr) {
      var actual = Number(tr.getAttribute('data-anio')) === anio;
      tr.classList.toggle('es-actual', actual);
      if (actual) tr.setAttribute('aria-current', 'true');
      else tr.removeAttribute('aria-current');
    });
  }

  function campoError(nodo, contenedor, t) {
    if (!nodo) return;
    nodo.hidden = !t;
    nodo.textContent = t || '';
    var campo = contenedor && contenedor.closest ? contenedor.closest('.campo') : null;
    if (campo) campo.classList.toggle('campo--error', !!t);
    if (contenedor) {
      if (t) contenedor.setAttribute('aria-invalid', 'true');
      else contenedor.removeAttribute('aria-invalid');
    }
  }

  /**
   * Recalcula y pinta todo. origen:
   *   'inicio' | 'rango' (deslizador) | 'tecleo-enganche' (valor válido mientras se teclea;
   *   no reescribe el campo) | 'tecleo-precio' (tras la pausa) | 'campo-fin' (al salir de un
   *   campo; conserva la nota de ajuste) | 'discreto' (unidad, año, plazo, modo).
   */
  function recalcular(origen) {
    var b = base();
    var vig = vigenciaActual();
    var animar = origen === 'discreto' || origen === 'campo-fin' || origen === 'tecleo-precio';
    var c = FIN && b.precio ? FIN.cotizar(entrada(), H)
      : { valido: false, codigo: 'precio_invalido', motivo: 'Captura el precio de la unidad para simular.' };
    ultima = c;

    doc.body.classList.toggle('fin-vencida', !vig.vigente);
    if (origen !== 'campo-fin' && origen !== 'inicio') ajuste('');
    if (b.precio) pintarDeslizador(b);
    if (el.enganche && origen !== 'tecleo-enganche') {
      el.enganche.value = estado.enganche !== null && estado.enganche !== undefined ? mxn(estado.enganche) : '';
    }
    texto(el.pct, b.precio && estado.enganche ? pct(estado.enganche / b.precio) : '—');
    campoError(el.errorEnganche, el.enganche,
      vig.vigente && (c.codigo === 'enganche_insuficiente' || c.codigo === 'enganche_excede_precio') ? c.motivo : '');

    pintarPlazos(b, vig, animar);
    pintarResultado(c, b, vig, animar);
    pintarVigencia(vig);
    if (b.anio !== ultimoAnio) { ultimoAnio = b.anio; pintarMatrizFila(b.anio); }
    enlazarWa();
    programarAnuncio(c, vig);
    if (origen !== 'inicio') programarEvento(c, vig);
  }

  // ---------------------------------------------------------------------------
  // Medición y anuncios
  // ---------------------------------------------------------------------------
  var eventoPendiente = null;

  /** Si hay un «cotizar» esperando la pausa, lo mide ya (p. ej. antes de whatsapp_click). */
  function soltarEvento() {
    if (!tEvento || !eventoPendiente) return;
    root.clearTimeout(tEvento);
    tEvento = null;
    var f = eventoPendiente;
    eventoPendiente = null;
    f();
  }

  function programarEvento(c, vig) {
    if (!estado.interactuo) return;
    if (tEvento) root.clearTimeout(tEvento);
    eventoPendiente = function () {
      if (!c || !c.valido || !vig.vigente) return;
      var u = unidadActual();
      var clave = [u ? u.id : 'libre', c.precio, c.plazo, c.enganche].join('|');
      if (clave === claveEvento) return;
      claveEvento = clave;
      G.evento('cotizar', {
        unidad_id: u ? String(u.id) : null,
        precio: c.precio,
        plazo: c.plazo,
        enganche_pct: Math.round(c.enganche_pct * 1000) / 1000,
        mensualidad: c.mensualidad
      });
    };
    tEvento = root.setTimeout(function () {
      tEvento = null;
      var f = eventoPendiente;
      eventoPendiente = null;
      if (f) f();
    }, PAUSA_EVENTO);
  }

  function programarAnuncio(c, vig) {
    if (!el.anuncio) return;
    if (tAnuncio) root.clearTimeout(tAnuncio);
    tAnuncio = root.setTimeout(function () {
      tAnuncio = null;
      var t;
      if (!vig.vigente) t = 'Por ahora no mostramos mensualidades; escríbenos para la corrida vigente.';
      else if (!c.valido) t = c.motivo || 'Ajusta la simulación.';
      else t = 'Mensualidad estimada: ' + mxn(c.mensualidad) + ' al mes durante ' + c.plazo +
        ' meses. Pago inicial: ' + mxn(c.pago_inicial) + '. Cifra ilustrativa.';
      el.anuncio.textContent = t;
    }, PAUSA_ANUNCIO);
  }

  // ---------------------------------------------------------------------------
  // WhatsApp (modo demo): la simulación viaja en el mensaje
  // ---------------------------------------------------------------------------
  function enlazarWa() {
    var u = unidadActual();
    var botones = G.qsa('[data-fin-wa="simulacion"]', raiz);
    // Cabecera, menú, banda y barra móvil llevan la simulación en cuanto el visitante simuló algo.
    if (simulo()) botones = botones.concat(G.qsa('[data-wa-pagina]'));
    botones.forEach(function (b) {
      if (u) b.setAttribute('data-wa-unidad', u.id);
      else b.removeAttribute('data-wa-unidad');
      b.removeAttribute('data-wa-lote');
    });
  }

  function sinPregunta(t) { return String(t || '').replace(/\s*¿[^¿?]*\?\s*$/, '').trim(); }

  function mensajeSimulacion() {
    var b = base();
    var u = b.unidad;
    var c = ultima;
    var vig = vigenciaActual();
    var inicio = u ? sinPregunta(G.wa.mensaje(u))
      : 'Hola, quiero cotizar el crédito de un tractocamión seminuevo Go On' +
        (b.precio && b.anio ? ' de ' + mxn(b.precio) + ', modelo ' + b.anio : '') + '.';
    if (vig.vigente && c && c.valido) {
      return inicio + ' Simulé un crédito: enganche de ' + mxn(c.enganche) + ' (' + pct(c.enganche_pct) + ') a ' +
        c.plazo + ' meses, con mensualidad estimada de ' + mxn(c.mensualidad) + '. ¿Me ayudan con la corrida oficial?';
    }
    return inicio + ' ¿Me ayudan con una corrida de financiamiento?';
  }

  var MENSAJES_FIJOS = {
    general: 'Hola, quiero información sobre el financiamiento de un tractocamión seminuevo Go On.',
    docs: 'Hola, quiero saber qué documentación necesito para tramitar el crédito de un tractocamión Go On.'
  };

  function alAbrirWa(ev) {
    var d = ev && ev.detail;
    var origen = d && d.disparador;
    if (!origen || !origen.getAttribute) return;
    var tipo = origen.getAttribute('data-fin-wa');
    if (!tipo && origen.hasAttribute('data-wa-pagina')) tipo = simulo() ? 'simulacion' : 'general';
    if (!tipo) return;
    d.mensaje = tipo === 'simulacion' ? mensajeSimulacion() : (MENSAJES_FIJOS[tipo] || d.mensaje);
  }

  // ---------------------------------------------------------------------------
  // Matriz año modelo × plazo (regla de F&I, desde GOON_FIN.plazosPermitidos)
  // ---------------------------------------------------------------------------
  function inventarioPorAnio() {
    var cuenta = {};
    unidades().forEach(function (u) {
      var a = num(u.anio);
      if (a !== null) cuenta[a] = (cuenta[a] || 0) + 1;
    });
    return cuenta;
  }

  function pintarMatriz() {
    var t = el.matriz;
    if (!t || !FIN) return;
    var plazos = Array.isArray(H.plazos) ? H.plazos : [];
    var ref = anioRef();
    var aniosGoOn = num(G.dato('estandar.anios_max'));
    var antig = num(H.antiguedad_max);
    var tramo = antig === null ? 10 : antig + 1;
    var inventario = inventarioPorAnio();

    var cabeza = crear('tr', null, [crear('th', { scope: 'col', text: 'Año modelo' })]);
    plazos.forEach(function (p) {
      cabeza.appendChild(crear('th', { scope: 'col', 'class': 'num' }, [String(p), crear('span', { 'class': 'fin-matriz__u', text: ' meses' })]));
    });
    var cuerpo = crear('tbody');
    for (var a = ref; a >= ref - tramo; a--) {
      var edad = ref - a;
      var permitidos = FIN.plazosPermitidos(a, ref, H);
      var n = inventario[a] || 0;
      var clases = [];
      if (!permitidos.length) clases.push('es-fuera');
      if (aniosGoOn !== null && edad === aniosGoOn) clases.push('es-limite');
      var th = crear('th', { scope: 'row' }, [
        crear('span', { 'class': 'fin-matriz__anio', text: String(a) }),
        n ? crear('span', { 'class': 'fin-matriz__inv', text: plural(n, 'unidad Go On', 'unidades Go On') }) : null
      ]);
      var tr = crear('tr', { 'data-anio': String(a), 'class': clases.join(' ') || null }, [th]);
      plazos.forEach(function (p) {
        var si = permitidos.indexOf(p) !== -1;
        tr.appendChild(crear('td', { 'class': 'num fin-matriz__celda' + (si ? ' es-si' : '') }, [
          crear('span', { 'class': 'fin-matriz__marca', 'aria-hidden': 'true' }),
          crear('span', { 'class': 'sr', text: si ? 'Disponible' : 'No disponible' })
        ]));
      });
      cuerpo.appendChild(tr);
    }
    t.appendChild(crear('thead', null, [cabeza]));
    t.appendChild(cuerpo);

    var leyenda = G.qs('[data-fin-matriz-leyenda]');
    if (leyenda && aniosGoOn !== null && aniosGoOn <= tramo) {
      texto(leyenda, 'Límite de edad del estándar Go On: hasta ' + aniosGoOn + ' años de antigüedad.');
      leyenda.hidden = false;
    }
    pintarAfirmacion();
  }

  /** «Las N unidades Go On del corte se pueden simular a 48 meses» (medido en el catálogo). */
  function pintarAfirmacion() {
    var af = G.qs('[data-fin-afirmacion]');
    var txt = G.qs('[data-fin-afirmacion-texto]');
    var lista = unidades();
    var plazos = Array.isArray(H.plazos) ? H.plazos : [];
    if (!af || !txt || !FIN || !lista.length || !plazos.length) return;
    var maximo = plazos[plazos.length - 1];
    var alcanzan = lista.filter(function (u) {
      return FIN.plazosPermitidos(u.anio, anioRef(), H).indexOf(maximo) !== -1;
    }).length;
    if (!alcanzan) return;
    var total = lista.length;
    texto(txt, alcanzan === total
      ? 'Por su año modelo, las ' + total + ' unidades Go On del corte se pueden simular hasta el plazo más largo: ' + maximo + ' meses.'
      : 'Por su año modelo, ' + alcanzan + ' de las ' + total + ' unidades Go On del corte se pueden simular hasta ' + maximo + ' meses.');
    af.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Condiciones sí/no desde hechos (data-fin-si="financiamiento.iva_incluido")
  // ---------------------------------------------------------------------------
  function aplicarCondiciones() {
    G.qsa('[data-fin-si]').forEach(function (n) {
      n.hidden = G.dato(n.getAttribute('data-fin-si')) !== true;
    });
  }

  // ---------------------------------------------------------------------------
  // La mensualidad siempre a la vista
  //   - body.fin-sim-en-vista: el formulario está en pantalla (en celular la franja
  //     sustituye a la barra móvil; en modo P la consola se aparta de la corrida)
  //   - body.fin-fijo: en escritorio la corrida cabe completa bajo la cabecera y es
  //     pegajosa; si no cabe (laptops bajas), la franja fija toma su lugar
  // ---------------------------------------------------------------------------
  function vigilarFormulario() {
    if (!el.form || !('IntersectionObserver' in root)) return;
    var io = new root.IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        doc.body.classList.toggle('fin-sim-en-vista', e.isIntersecting);
      });
    }, { threshold: 0 });
    io.observe(el.form);
  }

  function ajustarFijo() {
    cuadroAjuste = 0;
    if (!el.recibo) return;
    var escritorio = root.matchMedia ? root.matchMedia('(min-width: 1000px)').matches : root.innerWidth >= 1000;
    var cab = parseFloat(root.getComputedStyle(doc.documentElement).getPropertyValue('--alto-cabecera')) || 76;
    // 16 px arriba (bajo la cabecera) y 16 px de aire abajo
    var cabe = escritorio && el.recibo.offsetHeight + cab + 32 <= root.innerHeight;
    doc.body.classList.toggle('fin-fijo', cabe);
    var alto = el.pegado ? el.pegado.offsetHeight : 0;
    if (alto) doc.body.style.setProperty('--fin-pegado-alto', alto + 'px');
  }

  function programarAjuste() {
    if (cuadroAjuste) return;
    cuadroAjuste = (root.requestAnimationFrame || function (f) { return root.setTimeout(f, 16); })(ajustarFijo);
  }

  function vigilarAltura() {
    ajustarFijo();
    root.addEventListener('resize', programarAjuste);
    if ('ResizeObserver' in root) {
      var ro = new root.ResizeObserver(programarAjuste);
      if (el.recibo) ro.observe(el.recibo);
      if (el.pegado) ro.observe(el.pegado);
    }
  }

  // ---------------------------------------------------------------------------
  // Controles
  // ---------------------------------------------------------------------------
  function cambiarModo(modo, desdeUsuario) {
    estado.modo = modo === 'libre' ? 'libre' : 'unidad';
    G.qsa('[data-fin-panel]', raiz).forEach(function (p) {
      p.hidden = p.getAttribute('data-fin-panel') !== estado.modo;
    });
    G.qsa('input[name="fin-modo"]', raiz).forEach(function (r) { r.checked = r.value === estado.modo; });
    if (estado.modo === 'libre') {
      var u = estado.unidadId ? G.unidad(estado.unidadId) : null;
      if (estado.precioLibre === null) estado.precioLibre = u ? num(u.precio) : null;
      if (estado.anioLibre === null) estado.anioLibre = u ? num(u.anio) : anioRef();
      if (el.precio) el.precio.value = estado.precioLibre ? mxn(estado.precioLibre) : '';
      if (el.anio) el.anio.value = String(estado.anioLibre);
      doc.body.classList.remove('fin-sin-institucion');
    } else if (estado.unidadId) {
      pintarUnidad(G.unidad(estado.unidadId));
    }
    if (desdeUsuario) {
      estado.elegida = true;
      estado.interactuo = true;
      if (typeof G.ponerParams === 'function') {
        G.ponerParams(estado.modo === 'unidad' ? { id: estado.unidadId, lote: null } : { id: null, lote: null });
      }
    }
    normalizar();
    recalcular(desdeUsuario ? 'discreto' : 'inicio');
  }

  function elegirUnidad(id, desdeUsuario) {
    var u = G.unidad(id);
    if (!u) return false;
    estado.unidadId = String(u.id);
    if (el.unidad) el.unidad.value = estado.unidadId;
    pintarUnidad(u);
    if (desdeUsuario) {
      aviso('');
      estado.elegida = true;
      estado.interactuo = true;
      if (typeof G.ponerParams === 'function') G.ponerParams({ id: estado.unidadId, lote: null });
    }
    normalizar();
    return true;
  }

  /**
   * Enganche capturado a mano. Mientras se teclea (final=false) solo se recalcula si el
   * valor ya es válido (entre el mínimo y el tope del simulador); si no, se conserva la
   * última cotización y no se marca error. Al salir del campo (final=true) el valor se
   * ajusta al mínimo o al tope y una nota explica el ajuste.
   */
  function engancheDesdeCampo(final) {
    var b = base();
    var n = num(el.enganche.value);
    estado.interactuo = true;
    if (!b.precio) return;
    var min = engancheMin(b.precio);
    var tope = topeDeslizador(b.precio);
    if (!final) {
      if (n === null || n < min || n > tope) return;
      estado.enganche = n;
      estado.engPct = n / b.precio;
      recalcular('tecleo-enganche');
      return;
    }
    var nota = '';
    if (n === null) {
      n = estado.enganche !== null && estado.enganche !== undefined ? estado.enganche : min;
    } else if (n < min) {
      n = min;
      nota = 'El enganche mínimo es de ' + mxn(min) + ' (' + pctEntero(num(H.enganche_min_pct) || min / b.precio) +
        ' del precio); lo ajustamos a ese monto.';
    } else if (n > tope) {
      n = tope;
      nota = 'El simulador llega hasta el ' + pctEntero(tope / b.precio) + ' de enganche (' + mxn(tope) +
        '); para un enganche mayor, consulta con tu asesor.';
    }
    estado.enganche = n;
    estado.engPct = n / b.precio;
    ajuste(nota);
    recalcular('campo-fin');
  }

  /**
   * Precio libre. Mientras se teclea se espera una pausa (PAUSA_TECLEO) y solo se
   * recalcula con un precio mayor que cero; el error se muestra al salir del campo.
   */
  function precioDesdeCampo(final) {
    var n = num(el.precio.value);
    var valido = n !== null && n > 0;
    estado.interactuo = true;
    estado.elegida = true;
    if (!final) {
      if (!valido) return;
      campoError(el.errorPrecio, el.precio, '');
      estado.precioLibre = n;
      normalizar();
      recalcular('tecleo-precio');
      return;
    }
    estado.precioLibre = valido ? n : null;
    campoError(el.errorPrecio, el.precio, valido ? '' : 'Captura el precio de la unidad, en pesos.');
    if (valido) el.precio.value = mxn(n);
    normalizar();
    recalcular('campo-fin');
  }

  function enlazar() {
    G.qsa('input[name="fin-modo"]', raiz).forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) cambiarModo(r.value, true); });
    });
    if (el.unidad) {
      el.unidad.addEventListener('change', function () {
        elegirUnidad(el.unidad.value, true);
        recalcular('discreto');
      });
    }
    if (el.anio) {
      el.anio.addEventListener('change', function () {
        estado.anioLibre = num(el.anio.value);
        estado.interactuo = true;
        estado.elegida = true;
        normalizar();
        recalcular('discreto');
      });
    }
    if (el.precio) {
      el.precio.addEventListener('input', function () {
        if (tPrecio) root.clearTimeout(tPrecio);
        tPrecio = root.setTimeout(function () { tPrecio = null; precioDesdeCampo(false); }, PAUSA_TECLEO);
      });
      el.precio.addEventListener('change', function () {
        if (tPrecio) { root.clearTimeout(tPrecio); tPrecio = null; }
        precioDesdeCampo(true);
      });
    }
    if (el.enganche) {
      el.enganche.addEventListener('input', function () { engancheDesdeCampo(false); });
      el.enganche.addEventListener('change', function () { engancheDesdeCampo(true); });
      el.enganche.addEventListener('focus', function () { try { el.enganche.select(); } catch (e) { /* nada */ } });
    }
    if (el.rango) {
      el.rango.addEventListener('input', function () {
        var b = base();
        estado.interactuo = true;
        estado.enganche = Number(el.rango.value);
        if (b.precio) estado.engPct = estado.enganche / b.precio;
        recalcular('rango');
      });
      el.rango.addEventListener('change', function () { recalcular('discreto'); });
    }
    if (el.plazos) {
      el.plazos.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t || t.name !== 'fin-plazo' || !t.checked) return;
        estado.plazo = Number(t.value);
        estado.interactuo = true;
        recalcular('discreto');
      });
    }
    if (el.form) el.form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    if (el.vencer) {
      el.vencer.addEventListener('click', function () {
        var vig = FIN ? FIN.vigencia(H) : null;
        estado.vencerDemo = !estado.vencerDemo;
        estado.hoy = estado.vencerDemo && vig && vig.vigencia_hasta ? diaSiguiente(vig.vigencia_hasta) : leerHoy();
        recalcular('discreto');
      });
    }
    doc.addEventListener('goon:wa-demo', alAbrirWa, true);
    // Fase de captura: corre antes que el clic delegado de nucleo.js, así el embudo
    // queda en orden (cotizar -> whatsapp_click) aunque el clic llegue antes de la pausa.
    doc.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-wa],[data-wa-unidad]') : null;
      if (t) soltarEvento();
    }, true);
  }

  function leerHoy() { return typeof G.param === 'function' ? isoValido(G.param('hoy')) : null; }

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  function preseleccion() {
    var id = typeof G.param === 'function' ? G.param('id') : null;
    var lote = typeof G.param === 'function' ? G.param('lote') : null;
    if (id) {
      if (elegirUnidad(id, false)) { estado.elegida = true; return; }
      aviso('La unidad Ref. ' + id + ' ya no está disponible en el inventario del corte del ' +
        G.fmt.fecha(G.corte(), 'larga') + '. Elige otra unidad o escríbenos por WhatsApp.');
    } else if (lote && typeof G.lote === 'function') {
      var lt = G.lote(lote);
      if (lt && lt.representante && elegirUnidad(lt.representante.id, false)) { estado.elegida = true; return; }
    }
    var d = unidadPorDefecto();
    if (d) elegirUnidad(d.id, false);
    else cambiarModo('libre', false);
  }

  function iniciar() {
    raiz = G.qs('[data-fin-sim]');
    if (!raiz) return;
    H = G.dato('financiamiento') || {};
    var sec = G.qs('#simulador');
    el = {
      form: G.qs('#fin-form'),
      unidad: G.qs('#fin-unidad'),
      precio: G.qs('#fin-precio'),
      anio: G.qs('#fin-anio'),
      enganche: G.qs('#fin-enganche'),
      rango: q('[data-fin-rango]'),
      rangoMin: q('[data-fin-rango-min]'),
      rangoMax: q('[data-fin-rango-max]'),
      pct: q('[data-fin-pct]'),
      errorEnganche: q('[data-fin-error-enganche]'),
      errorPrecio: q('[data-fin-error-precio]'),
      aviso: q('[data-fin-aviso]'),
      resumen: q('[data-fin-unidad]'),
      plazos: q('[data-fin-plazos]'),
      plazosRegla: q('[data-fin-plazos-regla]'),
      plazosNota: q('[data-fin-plazos-nota]'),
      plazosNotaTexto: q('[data-fin-plazos-nota-texto]'),
      ajuste: q('[data-fin-ajuste]'),
      recibo: q('[data-fin-recibo]'),
      pegado: q('[data-fin-pegado]'),
      pegadoRotulo: q('[data-fin-pegado-rotulo]'),
      pegadoMonto: q('[data-fin-pegado-monto]'),
      pegadoSufijo: q('[data-fin-pegado-sufijo]'),
      pegadoLegal: q('[data-fin-pegado-legal]'),
      cifras: q('[data-fin-cifras]'),
      estado: q('[data-fin-estado]'),
      estadoEtiqueta: q('[data-fin-estado-etiqueta]'),
      estadoTitulo: q('[data-fin-estado-titulo]'),
      estadoTexto: q('[data-fin-estado-texto]'),
      rUnidad: q('[data-fin-r-unidad]'),
      rMeta: q('[data-fin-r-meta]'),
      rMensualidad: q('[data-fin-r-mensualidad]'),
      rPlazo: q('[data-fin-r-plazo]'),
      rPrecio: q('[data-fin-r-precio]'),
      rEnganche: q('[data-fin-r-enganche]'),
      rComision: q('[data-fin-r-comision]'),
      rInicial: q('[data-fin-r-inicial]'),
      rFinanciado: q('[data-fin-r-financiado]'),
      bEnganche: q('[data-fin-b-enganche]'),
      bFinanciado: q('[data-fin-b-financiado]'),
      bEnganchePct: q('[data-fin-b-enganche-pct]'),
      bFinanciadoPct: q('[data-fin-b-financiado-pct]'),
      waTexto: q('[data-fin-wa-texto]'),
      vigencia: q('[data-fin-vigencia]'),
      vencer: q('[data-fin-vencer]'),
      anuncio: sec ? sec.querySelector('[data-fin-anuncio]') : null,
      matriz: G.qs('[data-fin-matriz]')
    };
    estado.hoy = leerHoy();
    estado.engPct = num(H.enganche_min_pct);
    aplicarCondiciones();
    llenarUnidades();
    llenarAnios();
    pintarMatriz();
    enlazar();
    preseleccion();
    if (estado.modo === 'unidad') cambiarModo('unidad', false);
    vigilarFormulario();
    vigilarAltura();
  }

  G.listo(iniciar);
})(window);
