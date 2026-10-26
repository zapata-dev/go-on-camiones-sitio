/*!
 * Go On Camiones — contacto.js (página «Contacto»)
 * Script clásico (IIFE), sin red. Depende de nucleo.js y comun.js.
 *
 * Qué hace:
 *   - Horario general de la red (el horario confirmado más común de GOON_SUCURSALES).
 *   - Formulario demo (nombre, teléfono, sucursal, interés) que NO envía ni guarda:
 *     arma, mientras escribes, el prospecto que recibiría Salesforce: origen, campaña
 *     (UTM de la URL), sucursal elegida, su centro SAP y el propietario VACÍO (lo
 *     asignaría el reparto por centro). El teléfono se muestra enmascarado.
 *   - Al enviar: valida, mide lead_form_demo {formulario, sucursal_id, unidad_id}
 *     (nunca nombre ni teléfono) y marca la vista previa como «simulada».
 *   - Parámetros de URL: ?sucursal=<id> preselecciona; ?unidad=<id> agrega la unidad
 *     de interés (y su sucursal); utm_* llenan «Campaña».
 *   - Celular: bajo el selector de sucursal, una línea de ruteo en vivo («Llega a …»)
 *     que remite a la vista previa completa (que en celular queda más abajo).
 *   - WhatsApp demo: el botón del formulario pregunta a la sucursal elegida
 *     (data-wa-sucursal). Un escucha en captura pone en el detalle de «goon:wa-demo»
 *     el mensaje que nombra la sucursal (whatsapp.mensaje_sucursal de hechos si
 *     existe; si no, MENSAJE_SUCURSAL), antes de que presentacion.js lo lea: la
 *     burbuja y el texto copiado coinciden. Después se precisan sucursal y centro.
 *   - Sin JS: «Enviar mis datos» nace deshabilitado (nada viaja en la URL); este
 *     script lo habilita.
 * Lo por confirmar de una sucursal (GOON_SUCURSALES[].por_confirmar) no se muestra
 * fuera del modo P:
 *   - centro SAP por confirmar: «Se asigna con la sucursal» (público) o «Por
 *     confirmar» con contorno (modo P); nunca «Por asignar».
 *   - sucursal con la venta de camiones seminuevos por confirmar: no aparece en el
 *     selector público; en modo P sí, marcada «por confirmar».
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;

  var NBSP = ' ';
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var INTERES = {
    unidad: 'Una unidad del inventario',
    financiamiento: 'Financiamiento',
    visita: 'Visitar una sucursal',
    otra: 'Otra consulta'
  };

  // Respaldo si hechos aún no trae whatsapp.mensaje_sucursal (se pidió en hechos_canonicos.json).
  var MENSAJE_SUCURSAL = 'Hola, me interesa conocer el inventario de camiones seminuevos de Go On en la sucursal {sucursal}. ¿Me pueden dar más información?';

  var SUC = Array.isArray(root.GOON_SUCURSALES) ? root.GOON_SUCURSALES : [];
  var CAT = root.GOON_CATALOGO || {};
  var POR_SUC = (CAT.meta && CAT.meta.conteos && CAT.meta.conteos.por_sucursal) || {};

  var form = null;
  var unidadId = null;
  var enviado = false;

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
    [].concat(hijos || []).forEach(function (h) {
      if (h === null || h === undefined || h === false) return;
      n.appendChild(typeof h === 'string' ? doc.createTextNode(h) : h);
    });
    return n;
  }

  function icono(id) {
    var s = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'icono');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var u = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }

  function confirmado(s, campo) {
    var lista = s && Array.isArray(s.por_confirmar) ? s.por_confirmar : [];
    return lista.indexOf(campo) === -1;
  }

  function tiene(s, campo) {
    var v = s ? s[campo] : null;
    return v !== null && v !== undefined && v !== '';
  }

  function movReducido() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function sucursal(id) {
    return id && typeof G.sucursal === 'function' ? G.sucursal(id) : null;
  }

  function nombreLargo(s) {
    if (!s) return '';
    return s.nombre + (s.estado && s.estado !== s.nombre ? ', ' + s.estado : '');
  }

  function centroDe(s) {
    return s && tiene(s, 'centro_sap') && confirmado(s, 'centro_sap') ? String(s.centro_sap) : null;
  }

  function presentacion() {
    return doc.documentElement.classList.contains('modo-presentacion');
  }

  // Texto del centro cuando no está confirmado: neutral en público, marcado en modo P.
  function centroPendiente() {
    return presentacion() ? 'Por confirmar' : 'Se asigna con la sucursal';
  }

  function vende(s) {
    return !!s && s.vende_camiones_seminuevos === true && confirmado(s, 'vende_camiones_seminuevos');
  }

  // ¿Aparece en el selector? En público solo si su venta de camiones está confirmada.
  function elegible(s) {
    if (!s || s.vende_camiones_seminuevos === false) return false;
    return vende(s) || presentacion();
  }

  function mensajeSucursal(s) {
    var plantilla = null;
    try { plantilla = typeof G.dato === 'function' ? G.dato('whatsapp.mensaje_sucursal') : null; } catch (e) { plantilla = null; }
    if (plantilla && typeof plantilla === 'object' && typeof plantilla.valor === 'string') plantilla = plantilla.valor;
    if (typeof plantilla !== 'string' || !plantilla) plantilla = MENSAJE_SUCURSAL;
    return plantilla.replace(/\{sucursal\}/g, s.nombre);
  }

  function unidades(n) {
    return n + ' ' + (n === 1 ? 'unidad Go' : 'unidades Go') + NBSP + 'On';
  }

  function tituloUnidad(u) {
    return [u.marca, u.modelo, u.anio].filter(function (x) { return x !== null && x !== undefined && x !== ''; }).join(' ');
  }

  function telefonoLimpio(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.slice(0, 2) === '52') d = d.slice(2);
    else if (d.length === 13 && d.slice(0, 3) === '521') d = d.slice(3);
    return d;
  }

  // En pantalla (y en una proyección) el teléfono nunca sale completo.
  function enmascararTel(d) {
    if (d.length !== 10) return null;
    return d.slice(0, 3) + ' ••• ••' + d.slice(8);
  }

  function leerUtm() {
    var p = typeof G.params === 'function' ? G.params() : {};
    var salida = [];
    UTM.forEach(function (k) {
      if (p[k]) salida.push([k.replace('utm_', ''), String(p[k]).slice(0, 80)]);
    });
    return salida;
  }

  function dos(n) { return (n < 10 ? '0' : '') + n; }

  function ahora() {
    var d = new Date();
    var iso = d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
    return G.fmt.fecha(iso, 'corta') + ', ' + dos(d.getHours()) + ':' + dos(d.getMinutes()) + ' h';
  }

  // ---------------------------------------------------------------------------
  // Horario general
  // ---------------------------------------------------------------------------
  function horarioComun() {
    var cuenta = {};
    var mejor = null;
    SUC.forEach(function (s) {
      if (!s || !tiene(s, 'horario') || !confirmado(s, 'horario')) return;
      cuenta[s.horario] = (cuenta[s.horario] || 0) + 1;
      if (!mejor || cuenta[s.horario] > cuenta[mejor]) mejor = s.horario;
    });
    return mejor;
  }

  function pintarHorario() {
    var dl = G.qs('[data-js-horario]');
    var texto = horarioComun();
    if (!dl) return;
    if (!texto) { dl.hidden = true; return; }
    String(texto).split(/\s*·\s*/).forEach(function (t) {
      var i = t.indexOf(':');
      var dia = i === -1 ? t.trim() : t.slice(0, i).trim();
      var horas = i === -1 ? '' : t.slice(i + 1).trim();
      if (!dia) return;
      horas = horas ? horas.charAt(0).toUpperCase() + horas.slice(1) : '';
      dl.appendChild(el('div', { 'class': /cerrad/i.test(horas) ? 'es-cerrado' : null }, [
        el('dt', { text: dia }), el('dd', { text: horas })
      ]));
    });
  }

  // ---------------------------------------------------------------------------
  // Formulario
  // ---------------------------------------------------------------------------
  function llenarSucursales(select) {
    var previa = select.value;
    var grupos = select.querySelectorAll('optgroup');
    for (var g = 0; g < grupos.length; g++) select.removeChild(grupos[g]);
    var con = [];
    var sin = [];
    SUC.forEach(function (s) {
      if (!s || !s.id || !elegible(s)) return;
      var n = typeof POR_SUC[s.id] === 'number' ? POR_SUC[s.id] : 0;
      (n > 0 ? con : sin).push({ s: s, n: n });
    });
    con.sort(function (a, b) { return (b.n - a.n) || a.s.nombre.localeCompare(b.s.nombre, 'es'); });
    sin.sort(function (a, b) { return a.s.nombre.localeCompare(b.s.nombre, 'es'); });
    function grupo(etiqueta, lista) {
      if (!lista.length) return;
      var og = el('optgroup', { label: etiqueta });
      lista.forEach(function (x) {
        og.appendChild(el('option', {
          value: x.s.id,
          text: nombreLargo(x.s) + (x.n > 0 ? ' · ' + unidades(x.n) : '') + (vende(x.s) ? '' : ' (por confirmar)')
        }));
      });
      select.appendChild(og);
    }
    grupo('Con unidades Go' + NBSP + 'On', con);
    grupo('Resto de la red', sin);
    select.value = previa && elegible(sucursal(previa)) ? previa : '';
  }

  function valorRadio(nombre) {
    var r = form.querySelector('input[name="' + nombre + '"]:checked');
    return r ? r.value : '';
  }

  function datos() {
    var id = String(form.elements.sucursal.value || '');
    return {
      nombre: String(form.elements.nombre.value || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      telefono: telefonoLimpio(form.elements.telefono.value),
      sucursal: elegible(sucursal(id)) ? id : '',
      interes: valorRadio('interes')
    };
  }

  function filaProspecto(etiqueta, valor, opciones) {
    var o = opciones || {};
    return el('div', { 'class': 'con-prospecto__fila' + (o.auto ? ' con-prospecto__fila--auto' : '') + (o.vacio ? ' es-vacio' : '') }, [
      el('dt', null, [etiqueta, o.auto ? el('span', { 'class': 'con-prospecto__auto', text: 'Automático' }) : null]),
      el('dd', { 'class': o.pendiente && presentacion() ? 'es-por-confirmar' : null }, valor)
    ]);
  }

  function pintarProspecto() {
    var dl = G.qs('[data-js-prospecto-campos]');
    if (!dl || !form) return;
    var d = datos();
    var s = sucursal(d.sucursal);
    var centro = centroDe(s);
    var u = unidadId && typeof G.unidad === 'function' ? G.unidad(unidadId) : null;
    var utm = leerUtm();
    var tel = enmascararTel(d.telefono);
    var FALTA = '—';

    dl.textContent = '';
    [
      filaProspecto('Origen', 'Sitio web · Go' + NBSP + 'On Camiones · Contacto', { auto: true }),
      filaProspecto('Campaña', utm.length
        ? utm.map(function (p) { return p[0] + ': ' + p[1]; }).join(' · ')
        : 'Visita directa (sin anuncio)', { auto: true }),
      filaProspecto('Nombre', d.nombre || FALTA, { vacio: !d.nombre }),
      filaProspecto('Teléfono', tel || FALTA, { vacio: !tel }),
      filaProspecto('Interés', d.interes ? INTERES[d.interes] : FALTA, { vacio: !d.interes }),
      u ? filaProspecto('Unidad', tituloUnidad(u) + ' · Ref. ' + u.id) : null,
      filaProspecto('Sucursal', s ? nombreLargo(s) : FALTA, { vacio: !s }),
      filaProspecto('Centro SAP', s ? (centro || centroPendiente()) : FALTA, { auto: true, vacio: !s, pendiente: !!s && !centro }),
      filaProspecto('Propietario', [
        el('span', { 'class': 'con-prospecto__vacio', text: 'Vacío' }),
        ' → reparto por centro' + (centro ? ' ' + centro : '')
      ], { auto: true })
    ].forEach(function (f) { if (f) dl.appendChild(f); });

    var rc = G.qs('[data-js-ruta-centro]');
    var rs = G.qs('[data-js-ruta-sucursal]');
    if (rc) rc.textContent = s ? (centro ? 'Centro ' + centro : (presentacion() ? 'Centro por confirmar' : 'Centro de la sucursal')) : 'Centro SAP';
    if (rs) rs.textContent = s ? s.nombre : 'Sucursal elegida';
    var paso = G.qs('.con-ruta__paso--centro');
    if (paso) paso.classList.toggle('es-listo', !!s);
    pintarRuteoVivo(s, centro);
  }

  // Celular: la vista previa queda debajo del formulario; esta línea muestra el
  // ruteo mientras se captura y remite a la vista previa completa.
  function pintarRuteoVivo(s, centro) {
    var p = G.qs('[data-js-ruteo-vivo]');
    if (!p) return;
    p.textContent = '';
    if (!s) { p.hidden = true; return; }
    p.appendChild(el('span', { 'class': 'con-ruteo-vivo__texto' }, [
      el('b', { text: 'Llega a: ' }),
      s.nombre + ' · ' + (centro ? 'centro ' + centro : (presentacion() ? 'centro por confirmar' : 'centro de la sucursal')) + ' · propietario vacío'
    ]));
    p.appendChild(el('a', { 'class': 'con-ruteo-vivo__enlace', href: '#con-prospecto-titulo' }, ['Ver la vista previa', icono('i-abajo')]));
    p.hidden = false;
  }

  function actualizarWa() {
    var a = G.qs('[data-js-wa-sucursal]');
    var t = G.qs('[data-js-wa-texto]');
    var id = form.elements.sucursal.value;
    var s = elegible(sucursal(id)) ? sucursal(id) : null;
    if (!a) return;
    if (unidadId) {
      // Con unidad de interés, WhatsApp pregunta por esa unidad (mensaje y ruteo de la unidad).
      a.setAttribute('data-wa-unidad', unidadId);
      a.removeAttribute('data-wa-sucursal');
      a.setAttribute('data-event-sucursal-id', (G.unidad(unidadId) || {}).sucursal_id || '');
      if (t) t.textContent = 'Preguntar por esta unidad';
      return;
    }
    a.removeAttribute('data-wa-unidad');
    if (s) {
      a.setAttribute('data-wa-sucursal', s.id);
      a.setAttribute('data-event-sucursal-id', s.id);
      if (t) t.textContent = 'Preguntar en ' + s.nombre;
    } else {
      a.removeAttribute('data-wa-sucursal');
      a.removeAttribute('data-event-sucursal-id');
      if (t) t.textContent = 'Escríbenos por WhatsApp';
    }
  }

  function volverABorrador() {
    if (!enviado) return;
    enviado = false;
    var caja = G.qs('[data-js-prospecto]');
    if (caja) caja.setAttribute('data-estado', 'borrador');
    var etiqueta = G.qs('[data-js-prospecto-etiqueta]');
    if (etiqueta) etiqueta.textContent = 'Vista previa · se llena con tus datos';
    var estado = G.qs('[data-js-prospecto-estado]');
    if (estado) estado.textContent = '';
  }

  function errorCampo(nombre, mensaje) {
    var campo = form.querySelector('[data-campo="' + nombre + '"]');
    if (!campo) return null;
    var controles = campo.querySelectorAll('.campo__control, input[type="radio"]');
    var p = campo.querySelector('[data-error]');
    campo.classList.toggle('campo--error', !!mensaje);
    for (var i = 0; i < controles.length; i++) {
      if (mensaje) controles[i].setAttribute('aria-invalid', 'true');
      else controles[i].removeAttribute('aria-invalid');
    }
    if (p) { p.textContent = mensaje || ''; p.hidden = !mensaje; }
    return mensaje ? controles[0] || null : null;
  }

  function limpiarErrores() {
    ['nombre', 'telefono', 'sucursal', 'interes'].forEach(function (n) { errorCampo(n, ''); });
  }

  // Marca de página: con unidad de interés, la cabecera, el menú, la banda y la
  // barra móvil ([data-wa-pagina]) también preguntan por ella (comun.js).
  function marcarPagina(u) {
    var main = G.qs('#contenido');
    var marca = G.qs('#contenido [data-unidad-pagina]');
    if (u) {
      if (!marca && main) {
        marca = el('div', { hidden: true });
        main.appendChild(marca);
      }
      if (marca) marca.setAttribute('data-unidad-pagina', String(u.id));
      G.qsa('[data-wa-pagina]').forEach(function (n) { n.setAttribute('data-wa-unidad', String(u.id)); });
      return;
    }
    if (marca && marca.parentNode) marca.parentNode.removeChild(marca);
    G.qsa('[data-wa-pagina]').forEach(function (n) {
      n.removeAttribute('data-wa-unidad');
      n.removeAttribute('data-wa-lote');
    });
  }

  function ponerUnidad(id) {
    var u = id && typeof G.unidad === 'function' ? G.unidad(id) : null;
    unidadId = u ? String(u.id) : null;
    marcarPagina(u);
    var caja = G.qs('[data-js-unidad]');
    var texto = G.qs('[data-js-unidad-texto]');
    if (caja) caja.hidden = !u;
    if (texto) texto.textContent = u ? tituloUnidad(u) + ' · Ref. ' + u.id : '';
    return u;
  }

  function aplicarParams() {
    var pedida = typeof G.param === 'function' ? G.param('sucursal') : null;
    var u = ponerUnidad(typeof G.param === 'function' ? G.param('unidad') : null);
    var select = form.elements.sucursal;
    var id = u && elegible(sucursal(u.sucursal_id)) ? u.sucursal_id : (elegible(sucursal(pedida)) ? pedida : '');
    if (id) select.value = id;
    if (u) {
      var r = form.querySelector('input[name="interes"][value="unidad"]');
      if (r) r.checked = true;
    }
  }

  function simularUtm() {
    var p = G.qs('[data-js-simular]');
    if (!p) return;
    var hay = leerUtm().length > 0;
    var extra = [];
    var params = typeof G.params === 'function' ? G.params() : {};
    ['sucursal', 'unidad'].forEach(function (k) { if (params[k]) extra.push(k + '=' + encodeURIComponent(params[k])); });
    var base = 'contacto.html';
    var consulta = hay ? extra : extra.concat(['utm_source=facebook', 'utm_medium=paid_social', 'utm_campaign=go-on-camiones']);
    p.textContent = '';
    p.appendChild(el('a', {
      'class': 'enlace-flecha',
      href: base + (consulta.length ? '?' + consulta.join('&') : '') + '#con-formulario'
    }, [hay ? 'Quitar la campaña de la liga' : 'Simular llegada desde un anuncio', icono('i-flecha')]));
  }

  function alEnviar(ev) {
    ev.preventDefault();
    var d = datos();
    var e1 = errorCampo('nombre', d.nombre.length < 2 ? 'Escribe tu nombre.' : '');
    var e2 = errorCampo('telefono', d.telefono.length !== 10 ? 'Escribe un celular de 10 dígitos.' : '');
    var e3 = errorCampo('sucursal', !elegible(sucursal(d.sucursal)) ? 'Elige una sucursal.' : '');
    var e4 = errorCampo('interes', !d.interes ? 'Elige qué te interesa.' : '');
    var primero = e1 || e2 || e3 || e4;
    if (primero) { primero.focus(); return; }

    pintarProspecto();
    enviado = true;
    var s = sucursal(d.sucursal);
    var centro = centroDe(s);
    var caja = G.qs('[data-js-prospecto]');
    if (caja) caja.setAttribute('data-estado', 'enviado');
    var etiqueta = G.qs('[data-js-prospecto-etiqueta]');
    if (etiqueta) etiqueta.textContent = 'Simulado · ' + ahora() + ' · no se envió nada';
    var estado = G.qs('[data-js-prospecto-estado]');
    if (estado) {
      estado.textContent = 'Listo. En la versión publicada esta solicitud entra directo a Salesforce' +
        (centro ? ' y se reparte al equipo del centro ' + centro + ' (' + s.nombre + ')' : ' y se reparte a la sucursal ' + s.nombre) +
        '. Aquí no se guardó ni se envió nada.';
    }
    G.evento('lead_form_demo', { formulario: 'contacto', sucursal_id: s.id, unidad_id: unidadId });

    var tit = G.qs('#con-prospecto-titulo');
    var aside = G.qs('.con-prospecto-col');
    if (tit) {
      try { tit.focus({ preventScroll: true }); } catch (e) { tit.focus(); }
    }
    if (aside && aside.getBoundingClientRect) {
      var r = aside.getBoundingClientRect();
      var alto = root.innerHeight || 800;
      if (r.top < 0 || r.top > alto * 0.6) {
        try { aside.scrollIntoView({ block: 'start', behavior: movReducido() ? 'auto' : 'smooth' }); } catch (e2) { aside.scrollIntoView(); }
      }
    }
  }

  function prepararFormulario() {
    form = G.qs('[data-js-form]');
    if (!form) return;
    var enviar = G.qs('[data-js-enviar]');
    if (enviar) enviar.disabled = false; // nace deshabilitado: sin JS no se envía nada
    var select = form.elements.sucursal;
    if (select) llenarSucursales(select);
    aplicarParams();
    actualizarWa();
    pintarProspecto();
    simularUtm();

    form.addEventListener('input', function (ev) {
      var campo = ev.target && ev.target.closest ? ev.target.closest('[data-campo]') : null;
      if (campo && campo.classList.contains('campo--error')) errorCampo(campo.getAttribute('data-campo'), '');
      volverABorrador();
      pintarProspecto();
    });
    form.addEventListener('change', function (ev) {
      var campo = ev.target && ev.target.closest ? ev.target.closest('[data-campo]') : null;
      if (campo && campo.classList.contains('campo--error')) errorCampo(campo.getAttribute('data-campo'), '');
      if (ev.target === select) actualizarWa();
      volverABorrador();
      pintarProspecto();
    });
    form.addEventListener('submit', alEnviar);
    form.addEventListener('reset', function () {
      // El reset nativo limpia los controles después de este evento.
      root.setTimeout(function () {
        limpiarErrores();
        aplicarParams();
        actualizarWa();
        volverABorrador();
        pintarProspecto();
      }, 0);
    });
    var quitar = G.qs('[data-js-unidad-quitar]');
    if (quitar) {
      quitar.addEventListener('click', function () {
        ponerUnidad(null);
        actualizarWa();
        pintarProspecto();
        var foco = form.elements.sucursal;
        if (foco) foco.focus();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // WhatsApp por sucursal (modo demo).
  //  1) En captura (antes que presentacion.js): mensaje que nombra la sucursal.
  //  2) Después (presentacion.js ya llenó el modal): sucursal, centro y nota.
  // ---------------------------------------------------------------------------
  function sucursalDelDisparador(d) {
    var disparador = d && d.disparador;
    if (!disparador || d.unidad || d.lote || !disparador.getAttribute) return null;
    return sucursal(disparador.getAttribute('data-wa-sucursal'));
  }

  function alPrepararWa(ev) {
    var d = ev && ev.detail;
    var s = sucursalDelDisparador(d);
    if (!s) return;
    d.mensaje = mensajeSucursal(s);
    if (G.wa && typeof G.wa.numero === 'function') {
      d.url = 'https://wa.me/' + G.wa.numero() + '?text=' + encodeURIComponent(d.mensaje);
    }
  }

  function alVistaPreviaWa(ev) {
    var dialogo = G.qs('#wa-demo');
    if (!dialogo) return;
    var nodoCentro = dialogo.querySelector('[data-wa-demo-centro]');
    if (nodoCentro) nodoCentro.classList.remove('es-por-confirmar');
    var d = ev && ev.detail;
    var s = sucursalDelDisparador(d);
    if (!s) return;
    function llenar(sel, texto) {
      var n = dialogo.querySelector(sel);
      if (n) n.textContent = texto;
    }
    var centro = centroDe(s);
    llenar('[data-wa-demo-mensaje]', d.mensaje || mensajeSucursal(s));
    llenar('[data-wa-demo-unidad]', 'Consulta a la sucursal');
    llenar('[data-wa-demo-sucursal]', nombreLargo(s));
    llenar('[data-wa-demo-centro]', centro || centroPendiente());
    if (nodoCentro && !centro && presentacion()) nodoCentro.classList.add('es-por-confirmar');
    var nota = dialogo.querySelector('[data-wa-demo-nota]');
    if (nota) {
      nota.textContent = '';
      nota.appendChild(el('b', { text: 'Modo demo' }));
      nota.appendChild(doc.createTextNode(
        'No se abre WhatsApp. En la versión publicada este mensaje abre WhatsApp y el prospecto llega a la sucursal ' +
        s.nombre + (centro ? ' (centro ' + centro + ')' : '') + '.'));
    }
  }

  // Modo P: el selector suma las sucursales por confirmar y los centros cambian de texto.
  function alCambiarModo() {
    if (!form) return;
    var select = form.elements.sucursal;
    if (select) llenarSucursales(select);
    // Si la sucursal pedida en la URL ahora es elegible (modo P), se preselecciona.
    var pedida = typeof G.param === 'function' ? G.param('sucursal') : null;
    if (select && !select.value && !unidadId && elegible(sucursal(pedida))) select.value = pedida;
    actualizarWa();
    pintarProspecto();
  }

  G.listo(function () {
    pintarHorario();
    prepararFormulario();
    doc.addEventListener('goon:wa-demo', alPrepararWa, true);
    doc.addEventListener('goon:wa-demo', alVistaPreviaWa);
    doc.addEventListener('goon:modo', alCambiarModo);
  });
})(window);
