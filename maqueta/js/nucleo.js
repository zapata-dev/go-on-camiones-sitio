/*!
 * Go On Camiones — núcleo JS (window.GOON)
 * Script clásico (IIFE): sin módulos, sin fetch/XHR, abre desde file://.
 * Lee los datos de los globales window.GOON_HECHOS, window.GOON_HECHOS_META
 * y window.GOON_CATALOGO; si no existen, degrada sin romper.
 *
 * API (contrato 7):
 *   GOON.fmt.{mxn, km, kmCorto, numero, pct, fecha}
 *   GOON.dato(ruta) · GOON.porConfirmar(ruta) · GOON.aplicarDatos(raiz)
 *   GOON.wa.{mensaje(unidad, lote?), url(unidad, lote?), numero(), modo()}
 *   GOON.evento(nombre, props) · GOON.qs · GOON.qsa · GOON.listo(fn)
 *   GOON.copiar(texto) -> Promise<boolean>
 *   Extras: GOON.unidad(id) · GOON.lote(id) · GOON.modoPresentacion(bool?)
 *           GOON.enlazarWhatsApp(raiz) · GOON.EVENTOS (catálogo de eventos)
 *
 * Atributos HTML que entiende:
 *   data-dato="ruta.punteada"            texto desde GOON_HECHOS
 *   data-formato="mxn|km|kmCorto|numero|pct|fecha"
 *   data-dato-attr="aria-label"          escribe en ese atributo en vez del texto
 *   data-dato-ocultar="selector"         si está por confirmar, oculta el ancestro
 *                                        más cercano que cumpla el selector
 *   data-event="nombre" + data-event-*   clic medido (props en snake_case)
 *   data-wa-unidad="<id>" | data-wa      botón/enlace de WhatsApp
 *   data-wa-lote="<lote>"                (con data-wa-unidad) pregunta por el lote
 *   data-wa-sucursal="<id>"              sin unidad ni lote: pregunta a esa sucursal
 *                                        (whatsapp.mensaje_sucursal, {sucursal} = nombre)
 *   data-wa-tema="<tema>"                sin unidad, lote ni sucursal: whatsapp.mensaje_<tema>
 *                                        (p. ej. data-wa-tema="garantia" -> mensaje_garantia)
 *   Prioridad del mensaje: lote > unidad > sucursal > tema > general.
 *
 * Catálogo único de eventos (GOON.EVENTOS). Toda medición de la maqueta usa
 * uno de estos nombres; un nombre fuera del catálogo se registra igual pero deja
 * un aviso en la consola (una vez por nombre). Props en snake_case; nunca datos
 * personales, rutas locales ni la URL de la página (en file:// trae el usuario).
 *   page_view          carga de página (estándar GA4)        {pagina}
 *   vista_pagina       contexto de negocio de la página       {pagina, corte, unidades_go_on, unidad_id?}
 *   vista_seccion      una sección [data-seccion] entra a la vista {pagina, seccion}
 *   ver_unidad         clic hacia una ficha                   {unidad_id, origen, lote?}
 *   whatsapp_click     clic a WhatsApp (lo emite este núcleo) {origen, unidad_id, lote?, sucursal_id, plaza, tema?, modo}
 *   whatsapp_copiar    copió el mensaje en la vista previa    {ok, unidad_id?}
 *   cotizar            simulación de mensualidad              {unidad_id?, precio, plazo, enganche_pct, mensualidad}
 *   lead_form_demo     envío de formulario en modo demo       {formulario, sucursal_id?, unidad_id?}
 *   filtro_inventario  cambio de filtro u orden               {filtro, valor, resultados}
 *   tel_click          clic a teléfono de sucursal            {sucursal_id, origen}
 *   mapa_click         clic a «Cómo llegar»                   {sucursal_id, origen}
 *   cta_ver_inventario clic a «Ver inventario»                {origen}
 *   menu_clic          clic en el menú                        {destino}
 *   estandar_detalle   abre el detalle del estándar/sistema   {sistema?}
 *   submarca_clic      clic hacia Selectrucks Zapata          {origen}
 *   descarga_demo      botón de descarga (reporte de muestra) {documento}
 * El modo presentación NO es un evento: no llega a dataLayer (se avisa con el
 * CustomEvent «goon:modo» en document).
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var MAX_EVENTOS = 50;
  var FALTANTE = '—'; // raya larga
  var CLASE_POR_CONFIRMAR = 'es-por-confirmar';
  var CLASE_FALTANTE = 'es-dato-faltante';
  var CLASE_PRESENTACION = 'modo-presentacion';
  var MARCA_OCULTO = 'data-goon-oculto';
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // Catálogo único de eventos (ver la cabecera). Valor = props esperadas.
  var EVENTOS = {
    page_view: ['pagina'],
    vista_pagina: ['pagina', 'corte', 'unidades_go_on', 'unidad_id'],
    vista_seccion: ['pagina', 'seccion'],
    ver_unidad: ['unidad_id', 'origen', 'lote'],
    whatsapp_click: ['origen', 'unidad_id', 'lote', 'sucursal_id', 'plaza', 'tema', 'modo'],
    whatsapp_copiar: ['ok', 'unidad_id'],
    cotizar: ['unidad_id', 'precio', 'plazo', 'enganche_pct', 'mensualidad'],
    lead_form_demo: ['formulario', 'sucursal_id', 'unidad_id'],
    filtro_inventario: ['filtro', 'valor', 'resultados'],
    tel_click: ['sucursal_id', 'origen'],
    mapa_click: ['sucursal_id', 'origen'],
    cta_ver_inventario: ['origen'],
    menu_clic: ['destino'],
    estandar_detalle: ['sistema'],
    submarca_clic: ['origen'],
    descarga_demo: ['documento']
  };
  var avisadosFueraDeCatalogo = {};

  // ---------------------------------------------------------------------------
  // Formatos (es-MX)
  // ---------------------------------------------------------------------------
  var cacheFormatos = {};

  function agrupar(n, decimales) {
    var d = decimales || 0;
    var clave = 'd' + d;
    try {
      if (!cacheFormatos[clave]) {
        cacheFormatos[clave] = new Intl.NumberFormat('es-MX', {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
          useGrouping: true
        });
      }
      return cacheFormatos[clave].format(n);
    } catch (e) {
      // Respaldo sin Intl: 1234567.891 -> "1,234,567.89"
      var partes = Math.abs(n).toFixed(d).split('.');
      partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (n < 0 ? '-' : '') + partes.join('.');
    }
  }

  function aNumero(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') {
      var limpio = v.replace(/[$,\s]/g, '');
      if (/^-?\d+(\.\d+)?$/.test(limpio)) return Number(limpio);
    }
    return NaN;
  }

  function valido(n) {
    return typeof n === 'number' && isFinite(n);
  }

  var fmt = {
    /** 1200000 -> "$1,200,000"; mxn(1234.5, 2) -> "$1,234.50" */
    mxn: function (valor, decimales) {
      var n = aNumero(valor);
      if (!valido(n)) return FALTANTE;
      var d = decimales || 0;
      var redondeado = d ? n : Math.round(n);
      var texto = agrupar(Math.abs(redondeado), d);
      return (redondeado < 0 ? '-$' : '$') + texto;
    },
    /** 645000 -> "645,000 km" */
    km: function (valor) {
      var n = aNumero(valor);
      if (!valido(n)) return FALTANTE;
      return agrupar(Math.round(n), 0) + ' km';
    },
    /** 645000 -> "645 mil km"; 1200000 -> "1.2 millones de km"; 850 -> "850 km" */
    kmCorto: function (valor) {
      var n = aNumero(valor);
      if (!valido(n)) return FALTANTE;
      var abs = Math.abs(n);
      var signo = n < 0 ? '-' : '';
      if (abs < 1000) return signo + agrupar(Math.round(abs), 0) + ' km';
      if (Math.round(abs / 1000) < 1000) {
        return signo + agrupar(Math.round(abs / 1000), 0) + ' mil km';
      }
      var millones = Math.round(abs / 100000) / 10; // 1 decimal
      var entero = millones % 1 === 0;
      var texto = agrupar(millones, entero ? 0 : 1);
      return signo + texto + (millones === 1 ? ' millón de km' : ' millones de km');
    },
    /** 1234 -> "1,234"; numero(3.14159, 2) -> "3.14" */
    numero: function (valor, decimales) {
      var n = aNumero(valor);
      if (!valido(n)) return FALTANTE;
      return agrupar(decimales ? n : Math.round(n), decimales || 0);
    },
    /** 0.149 -> "14.9%"; 0.2 -> "20%" (fracción, no porcentaje) */
    pct: function (valor, decimales) {
      var n = aNumero(valor);
      if (!valido(n)) return FALTANTE;
      var p = n * 100;
      var d = decimales;
      if (d === undefined || d === null) d = Math.abs(p - Math.round(p)) < 1e-9 ? 0 : 1;
      return agrupar(Number(p.toFixed(d)), d) + '%';
    },
    /**
     * Fecha ISO (AAAA-MM-DD, con o sin hora) en español, sin depender de Intl ni
     * de la zona horaria (se leen los dígitos, no se construye un Date):
     *   fecha('2026-09-24')           -> "24 sep 2026"            (estilo 'corta', defecto)
     *   fecha('2026-09-24', 'larga')  -> "24 de septiembre de 2026"
     *   fecha('2026-09-24', 'dia-mes')-> "24 sep"
     *   fecha('2026-09-24', 'mes')    -> "septiembre de 2026"
     * Inválida -> "—".
     */
    fecha: function (valor, estilo) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor === null || valor === undefined ? '' : valor).trim());
      if (!m) return FALTANTE;
      var anio = m[1];
      var mes = Number(m[2]);
      var dia = Number(m[3]);
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return FALTANTE;
      var largo = MESES_LARGOS[mes - 1];
      var corto = MESES_CORTOS[mes - 1];
      if (estilo === 'larga') return dia + ' de ' + largo + ' de ' + anio;
      if (estilo === 'dia-mes') return dia + ' ' + corto;
      if (estilo === 'mes') return largo + ' de ' + anio;
      return dia + ' ' + corto + ' ' + anio;
    }
  };

  // ---------------------------------------------------------------------------
  // Datos: rutas punteadas sobre GOON_HECHOS
  // ---------------------------------------------------------------------------
  /** "a.b[0].c" -> ["a","b","0","c"] */
  function partirRuta(ruta) {
    if (Array.isArray(ruta)) return ruta.map(String);
    if (ruta === null || ruta === undefined) return [];
    return String(ruta)
      .replace(/\[(\w+)\]/g, '.$1')
      .split('.')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ''; });
  }

  function normalizarRuta(ruta) {
    return partirRuta(ruta).join('.');
  }

  /** Lee `ruta` en `fuente` (por defecto window.GOON_HECHOS). undefined si no existe. */
  function dato(ruta, fuente) {
    var actual = fuente === undefined ? root.GOON_HECHOS : fuente;
    var partes = partirRuta(ruta);
    if (!partes.length) return undefined;
    for (var i = 0; i < partes.length; i++) {
      if (actual === null || actual === undefined) return undefined;
      var clave = partes[i];
      if (Array.isArray(actual) && /^-?\d+$/.test(clave)) {
        var idx = Number(clave);
        if (idx < 0) idx = actual.length + idx;
        actual = actual[idx];
      } else if (typeof actual === 'object' && Object.prototype.hasOwnProperty.call(actual, clave)) {
        actual = actual[clave];
      } else {
        return undefined;
      }
    }
    return actual;
  }

  function coincideSegmentos(patron, ruta) {
    // patron es prefijo de ruta, con "*" como comodín de un segmento
    if (patron.length > ruta.length) return false;
    for (var i = 0; i < patron.length; i++) {
      if (patron[i] !== '*' && patron[i] !== ruta[i]) return false;
    }
    return true;
  }

  /**
   * true si `ruta` (o alguno de sus prefijos) está en GOON_HECHOS_META.por_confirmar.
   * "garantia" marca también "garantia.km"; admite "*" como comodín de segmento.
   */
  function porConfirmar(ruta, meta) {
    var m = meta === undefined ? root.GOON_HECHOS_META : meta;
    var lista = m && Array.isArray(m.por_confirmar) ? m.por_confirmar : null;
    if (!lista || !lista.length) return false;
    var objetivo = partirRuta(ruta);
    if (!objetivo.length) return false;
    for (var i = 0; i < lista.length; i++) {
      var patron = partirRuta(lista[i]);
      if (patron.length && coincideSegmentos(patron, objetivo)) return true;
    }
    return false;
  }

  function formatear(valor, formato) {
    if (formato && fmt[formato]) return fmt[formato](valor);
    if (Array.isArray(valor)) {
      return valor.filter(function (v) { return v !== null && v !== undefined && typeof v !== 'object'; }).join(', ');
    }
    // Sin data-formato: enteros >= 10,000 se agrupan; el resto va tal cual
    // (así un año como 1956 no sale "1,956"). Para cifras de dinero o km,
    // usar data-formato="mxn|km|kmCorto|numero".
    if (typeof valor === 'number') {
      return valor % 1 === 0 && Math.abs(valor) >= 10000 ? fmt.numero(valor) : String(valor);
    }
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    return String(valor);
  }

  function enModoPresentacion() {
    var html = doc && doc.documentElement;
    return !!(html && html.classList && html.classList.contains(CLASE_PRESENTACION));
  }

  function objetivoOcultable(el) {
    var sel = el.getAttribute && el.getAttribute('data-dato-ocultar');
    if (sel && el.closest) {
      try {
        var cont = el.closest(sel);
        if (cont) return cont;
      } catch (e) { /* selector inválido: se oculta el propio elemento */ }
    }
    return el;
  }

  function escribir(el, texto) {
    var attr = el.getAttribute && el.getAttribute('data-dato-attr');
    if (attr) el.setAttribute(attr, texto);
    else el.textContent = texto;
  }

  /** Deshace lo que una pasada anterior puso (clases y hidden propio). */
  function reiniciarUno(el) {
    el.classList.remove(CLASE_FALTANTE);
    el.classList.remove(CLASE_POR_CONFIRMAR);
    var ocultable = objetivoOcultable(el);
    if (ocultable.hasAttribute && ocultable.hasAttribute(MARCA_OCULTO)) {
      ocultable.removeAttribute(MARCA_OCULTO);
      ocultable.hidden = false;
      if (ocultable.removeAttribute) ocultable.removeAttribute('hidden');
    }
  }

  function aplicarUno(el, presentacion) {
    var ruta = el.getAttribute('data-dato');
    if (!ruta) return;
    var valor = dato(ruta);
    var ocultable = objetivoOcultable(el);

    var faltante = valor === undefined || valor === null ||
      (typeof valor === 'object' && !Array.isArray(valor));
    if (faltante) {
      escribir(el, FALTANTE);
      el.classList.add(CLASE_FALTANTE);
      if (root.console && root.console.warn) {
        root.console.warn('[GOON] dato faltante: "' + ruta + '"' +
          (valor && typeof valor === 'object' ? ' (es un objeto, no un valor)' : ''));
      }
    } else {
      escribir(el, formatear(valor, el.getAttribute('data-formato')));
    }

    if (porConfirmar(ruta)) {
      el.classList.add(CLASE_POR_CONFIRMAR);
      if (!presentacion && !ocultable.hidden) {
        ocultable.hidden = true;
        if (ocultable.setAttribute) {
          ocultable.setAttribute('hidden', '');
          ocultable.setAttribute(MARCA_OCULTO, '');
        }
      }
    }
  }

  /**
   * Rellena todo [data-dato] dentro de `raiz` (por defecto document).
   * Por confirmar -> clase es-por-confirmar + hidden (salvo html.modo-presentacion).
   * Ruta inexistente -> "—", clase es-dato-faltante y console.warn.
   * Devuelve {total, faltantes, por_confirmar}.
   */
  function aplicarDatos(raiz) {
    var base = raiz || doc;
    var resumen = { total: 0, faltantes: 0, por_confirmar: 0 };
    if (!base) return resumen;
    var presentacion = enModoPresentacion();
    var nodos = qsa('[data-dato]', base);
    if (base.matches && base.getAttribute && base.getAttribute('data-dato') !== null &&
        nodos.indexOf(base) === -1) {
      nodos.unshift(base);
    }
    // Dos pasadas: primero se reinicia todo y luego se aplica, para que un
    // elemento no des-oculte el contenedor que otro del mismo grupo ocultó.
    var j;
    for (j = 0; j < nodos.length; j++) reiniciarUno(nodos[j]);
    for (var i = 0; i < nodos.length; i++) {
      aplicarUno(nodos[i], presentacion);
      resumen.total++;
      if (nodos[i].classList.contains(CLASE_FALTANTE)) resumen.faltantes++;
      if (nodos[i].classList.contains(CLASE_POR_CONFIRMAR)) resumen.por_confirmar++;
    }
    return resumen;
  }

  // ---------------------------------------------------------------------------
  // Catálogo
  // ---------------------------------------------------------------------------
  function unidades() {
    var cat = root.GOON_CATALOGO;
    return cat && Array.isArray(cat.unidades) ? cat.unidades : [];
  }

  function unidad(id) {
    if (id === null || id === undefined) return null;
    var lista = unidades();
    var buscado = String(id);
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && String(lista[i].id) === buscado) return lista[i];
    }
    return null;
  }

  /**
   * Lote del catálogo: {id, n, unidades (orden por km), representante (la de
   * menos km), km_min, km_max, precio_min, precio_max}. null si no existe.
   */
  function lote(id) {
    if (id === null || id === undefined || id === '') return null;
    var buscado = String(id);
    var lista = unidades().filter(function (u) { return u && String(u.lote) === buscado; });
    if (!lista.length) return null;
    lista.sort(function (a, b) { return (Number(a.km) || 0) - (Number(b.km) || 0); });
    var kms = lista.map(function (u) { return Number(u.km); }).filter(valido);
    var precios = lista.map(function (u) { return Number(u.precio); }).filter(valido);
    return {
      id: buscado,
      n: lista.length,
      unidades: lista,
      representante: lista[0],
      km_min: kms.length ? Math.min.apply(null, kms) : null,
      km_max: kms.length ? Math.max.apply(null, kms) : null,
      precio_min: precios.length ? Math.min.apply(null, precios) : null,
      precio_max: precios.length ? Math.max.apply(null, precios) : null
    };
  }

  // ---------------------------------------------------------------------------
  // WhatsApp
  // ---------------------------------------------------------------------------
  var MENSAJE_UNIDAD = 'Hola, me interesa el {marca} {modelo} {anio} (ID {id}) que está en {plaza}. ¿Sigue disponible?';
  var MENSAJE_LOTE = 'Hola, me interesa el lote de {n} {modelo} {anio} (lote {lote}) que está en {plaza}. ¿Sigue disponible?';
  var MENSAJE_GENERAL = 'Hola, me interesa conocer el inventario de camiones seminuevos de Go On.';
  var MENSAJE_SUCURSAL = 'Hola, me interesa conocer el inventario de camiones seminuevos de Go On en la sucursal {sucursal}. ¿Me pueden dar más información?';
  // Claves de whatsapp.* que NO son temas (data-wa-tema no puede pedirlas).
  var NO_TEMAS = { base: 1, lote: 1, sucursal: 1, general: 1 };

  function hechosWa() {
    var w = dato('whatsapp');
    return w && typeof w === 'object' ? w : {};
  }

  /** Sucursal de window.GOON_SUCURSALES por id (objeto) o null. */
  function sucursalPorId(s) {
    if (s && typeof s === 'object') return s;
    if (s === null || s === undefined || s === '') return null;
    var lista = Array.isArray(root.GOON_SUCURSALES) ? root.GOON_SUCURSALES : [];
    for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === String(s)) return lista[i];
    return null;
  }

  /** Plantilla whatsapp.mensaje_<tema> si existe, es texto y no está por confirmar. */
  function mensajeTema(tema) {
    var t = String(tema || '');
    if (!/^[a-z0-9_]+$/.test(t) || NO_TEMAS[t]) return null;
    var v = hechosWa()['mensaje_' + t];
    return typeof v === 'string' && v && !porConfirmar('whatsapp.mensaje_' + t) ? v : null;
  }

  function resolverUnidad(u) {
    if (u && typeof u === 'object') return u;
    if (u === null || u === undefined || u === '') return null;
    return unidad(u);
  }

  function sustituir(plantilla, u) {
    var texto = String(plantilla).replace(/\{(\w+)\}/g, function (m, campo) {
      var v = u ? u[campo] : undefined;
      if (v === null || v === undefined || typeof v === 'object') return '';
      if (campo === 'precio') return fmt.mxn(v);
      if (campo === 'km') return fmt.km(v);
      return String(v);
    });
    // limpia huecos que dejó un campo vacío: "el  2020", "(ID )", " ."
    return texto
      .replace(/\(\s*ID\s*\)/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([.,;:?!])/g, '$1')
      .trim();
  }

  function resolverLote(l, u) {
    if (l && typeof l === 'object') return l;
    if (l === null || l === undefined || l === '') return null;
    var obj = lote(l);
    // Un «lote» de una sola unidad no se presenta como lote.
    if (!obj || obj.n < 2) return null;
    if (u && String(u.lote) !== obj.id) return null;
    return obj;
  }

  var wa = {
    /** Número solo con dígitos (formato wa.me), o "" si no hay. */
    numero: function () {
      var n = hechosWa().numero;
      return n === null || n === undefined ? '' : String(n).replace(/\D/g, '');
    },
    /**
     * 'demo' (default seguro) | 'produccion'. Candado: aunque hechos diga
     * 'produccion', mientras el número esté por confirmar (o no haya número)
     * se queda en 'demo': la maqueta nunca abre wa.me con un número sin validar.
     */
    modo: function () {
      var m = hechosWa().modo;
      if (m !== 'produccion') return 'demo';
      if (!wa.numero() || porConfirmar('whatsapp.numero')) return 'demo';
      return 'produccion';
    },
    /**
     * Texto prellenado para la unidad (objeto o id). Con `l` (id de lote u objeto
     * de GOON.lote) pregunta por el lote completo. Sin unidad ni lote, `extra`
     * decide: {sucursal: id|objeto} -> whatsapp.mensaje_sucursal; {tema: 'garantia'}
     * -> whatsapp.mensaje_garantia. Si no, mensaje general.
     */
    mensaje: function (u, l, extra) {
      var obj = resolverUnidad(u);
      var w = hechosWa();
      var lt = resolverLote(l, obj);
      var x = extra && typeof extra === 'object' ? extra : {};
      if (lt) {
        var base = obj || lt.representante;
        var datos = {};
        for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) datos[k] = base[k];
        datos.n = lt.n;
        datos.lote = lt.id;
        return sustituir(w.mensaje_lote || MENSAJE_LOTE, datos);
      }
      if (obj) return sustituir(w.mensaje_base || MENSAJE_UNIDAD, obj);
      var suc = sucursalPorId(x.sucursal);
      if (suc && suc.nombre) {
        var plantilla = typeof w.mensaje_sucursal === 'string' && w.mensaje_sucursal &&
          !porConfirmar('whatsapp.mensaje_sucursal') ? w.mensaje_sucursal : MENSAJE_SUCURSAL;
        return sustituir(plantilla, { sucursal: suc.nombre });
      }
      var deTema = mensajeTema(x.tema);
      if (deTema) return sustituir(deTema, null);
      return sustituir(w.mensaje_general || MENSAJE_GENERAL, null);
    },
    /** https://wa.me/<numero>?text=<mensaje codificado> */
    url: function (u, l, extra) {
      return 'https://wa.me/' + wa.numero() + '?text=' + encodeURIComponent(wa.mensaje(u, l, extra));
    }
  };

  // ---------------------------------------------------------------------------
  // Medición: dataLayer + búfer + CustomEvent
  // ---------------------------------------------------------------------------
  function crearEvento(nombre, detalle, cancelable) {
    var Ctor = root.CustomEvent;
    if (typeof Ctor === 'function') {
      try {
        return new Ctor(nombre, { detail: detalle, bubbles: false, cancelable: !!cancelable });
      } catch (e) { /* cae al respaldo */ }
    }
    if (doc && doc.createEvent) {
      try {
        var ev = doc.createEvent('CustomEvent');
        ev.initCustomEvent(nombre, false, !!cancelable, detalle);
        return ev;
      } catch (e2) { /* sin eventos */ }
    }
    return null;
  }

  /** Despacha en document; devuelve true si alguien llamó preventDefault(). */
  function despachar(nombre, detalle, cancelable) {
    if (!doc || !doc.dispatchEvent) return false;
    var ev = crearEvento(nombre, detalle, cancelable);
    if (!ev) return false;
    try {
      return doc.dispatchEvent(ev) === false;
    } catch (e) {
      return false;
    }
  }

  function evento(nombre, props) {
    var entrada = { event: String(nombre) };
    if (!Object.prototype.hasOwnProperty.call(EVENTOS, entrada.event) && !avisadosFueraDeCatalogo[entrada.event]) {
      avisadosFueraDeCatalogo[entrada.event] = true;
      if (root.console && root.console.warn) {
        root.console.warn('[GOON] evento fuera del catálogo: "' + entrada.event + '" (ver GOON.EVENTOS en nucleo.js)');
      }
    }
    if (props && typeof props === 'object') {
      for (var k in props) {
        if (Object.prototype.hasOwnProperty.call(props, k) && k !== 'event' && k !== 'ts') {
          entrada[k] = props[k];
        }
      }
    }
    entrada.ts = new Date().toISOString();

    if (!Array.isArray(root.dataLayer)) {
      root.dataLayer = root.dataLayer && typeof root.dataLayer.push === 'function' ? root.dataLayer : [];
    }
    root.dataLayer.push(entrada);

    if (!Array.isArray(root.GOON_EVENTOS)) root.GOON_EVENTOS = [];
    root.GOON_EVENTOS.push(entrada);
    if (root.GOON_EVENTOS.length > MAX_EVENTOS) {
      root.GOON_EVENTOS.splice(0, root.GOON_EVENTOS.length - MAX_EVENTOS);
    }

    despachar('goon:evento', entrada, false);
    return entrada;
  }

  /** data-event-unidad-id="X" -> {unidad_id: "X"} */
  function propsDeAtributos(el) {
    var props = {};
    var attrs = el && el.attributes;
    if (!attrs) return props;
    for (var i = 0; i < attrs.length; i++) {
      var nombre = attrs[i].name;
      if (nombre.indexOf('data-event-') === 0 && nombre.length > 11) {
        props[nombre.slice(11).replace(/-/g, '_')] = attrs[i].value;
      }
    }
    return props;
  }

  // ---------------------------------------------------------------------------
  // DOM utilitario
  // ---------------------------------------------------------------------------
  function qs(sel, raiz) {
    var base = raiz || doc;
    return base && base.querySelector ? base.querySelector(sel) : null;
  }

  function qsa(sel, raiz) {
    var base = raiz || doc;
    if (!base || !base.querySelectorAll) return [];
    return Array.prototype.slice.call(base.querySelectorAll(sel));
  }

  function listo(fn) {
    if (typeof fn !== 'function') return;
    if (!doc) return;
    if (doc.readyState === 'loading') {
      var disparado = false;
      doc.addEventListener('DOMContentLoaded', function once() {
        if (disparado) return;
        disparado = true;
        doc.removeEventListener('DOMContentLoaded', once);
        fn();
      });
    } else {
      fn();
    }
  }

  function cercano(el, sel) {
    var actual = el;
    // el objetivo del clic puede ser un nodo de texto
    while (actual && actual.nodeType && actual.nodeType !== 1) actual = actual.parentNode;
    return actual && actual.closest ? actual.closest(sel) : null;
  }

  // ---------------------------------------------------------------------------
  // Portapapeles (file:// no es contexto seguro: respaldo con execCommand)
  // ---------------------------------------------------------------------------
  function copiarRespaldo(texto, contenedor) {
    if (!doc || !doc.createElement || !doc.body) return false;
    // Dentro de un <dialog> modal el resto del documento es inerte: el área
    // temporal va dentro del contenedor que se indique (p. ej. el propio dialog).
    var destino = contenedor && contenedor.appendChild ? contenedor : doc.body;
    var area = doc.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.left = '-1000px';
    area.style.opacity = '0';
    destino.appendChild(area);
    var ok = false;
    try {
      area.select();
      if (area.setSelectionRange) area.setSelectionRange(0, texto.length);
      ok = !!(doc.execCommand && doc.execCommand('copy'));
    } catch (e) {
      ok = false;
    }
    destino.removeChild(area);
    return ok;
  }

  /** Copia al portapapeles. contenedor (opcional): dónde montar el respaldo execCommand. */
  function copiar(texto, contenedor) {
    var t = texto === null || texto === undefined ? '' : String(texto);
    var nav = root.navigator;
    var P = root.Promise;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function' && root.isSecureContext !== false) {
      return nav.clipboard.writeText(t).then(
        function () { return true; },
        function () { return copiarRespaldo(t, contenedor); }
      );
    }
    return P.resolve(copiarRespaldo(t, contenedor));
  }

  // ---------------------------------------------------------------------------
  // Clics delegados: [data-wa*] y [data-event]
  // ---------------------------------------------------------------------------
  var SEL_WA = '[data-wa-unidad],[data-wa]';

  function idWa(el) {
    var id = el.getAttribute('data-wa-unidad');
    if (id === null || id === '') id = el.getAttribute('data-wa');
    return id === null || id === '' ? null : id;
  }

  function contextoWa(el) {
    var id = idWa(el);
    var u = id ? unidad(id) : null;
    if (id && !u && root.console && root.console.warn) {
      root.console.warn('[GOON] WhatsApp: unidad "' + id + '" no está en GOON_CATALOGO; se usa mensaje general.');
    }
    var idLote = el.getAttribute ? el.getAttribute('data-wa-lote') : null;
    var lt = idLote ? resolverLote(idLote, u) : null;
    if (lt && !u) u = lt.representante;
    // Sin unidad ni lote: la sucursal o el tema del botón deciden el mensaje.
    var suc = !u && el.getAttribute ? sucursalPorId(el.getAttribute('data-wa-sucursal')) : null;
    var tema = el.getAttribute ? el.getAttribute('data-wa-tema') : null;
    var extra = { sucursal: suc, tema: tema };
    return { id: id, unidad: u, lote: lt, sucursal: suc, tema: tema || null,
      mensaje: wa.mensaje(u, lt, extra), url: wa.url(u, lt, extra) };
  }

  /**
   * Prepara los <a> de WhatsApp. Producción: href = wa.me + target _blank.
   * Demo: NO pone la URL real (un clic medio no debe abrir wa.me durante la
   * presentación); si el <a> no tiene href le pone "#" para que siga siendo
   * enfocable con teclado. Devuelve cuántos elementos WhatsApp encontró.
   */
  function enlazarWhatsApp(raiz) {
    var nodos = qsa(SEL_WA, raiz);
    var produccion = wa.modo() === 'produccion';
    for (var i = 0; i < nodos.length; i++) {
      var el = nodos[i];
      if (String(el.tagName).toUpperCase() !== 'A') continue;
      if (produccion) {
        el.setAttribute('href', contextoWa(el).url);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      } else if (!el.getAttribute('href')) {
        el.setAttribute('href', '#');
      }
    }
    return nodos.length;
  }

  function manejarWa(el, ev) {
    var ctx = contextoWa(el);
    var modo = wa.modo();
    var props = propsDeAtributos(el);
    props.unidad_id = ctx.unidad ? String(ctx.unidad.id) : (ctx.id || null);
    if (ctx.lote) props.lote = ctx.lote.id;
    if (ctx.unidad) {
      props.sucursal_id = ctx.unidad.sucursal_id || null;
      props.plaza = ctx.unidad.plaza || null;
    } else if (ctx.sucursal) {
      props.sucursal_id = ctx.sucursal.id || null;
    }
    if (ctx.tema) props.tema = ctx.tema;
    props.modo = modo;
    evento('whatsapp_click', props);

    if (modo === 'demo') {
      if (ev && ev.preventDefault) ev.preventDefault();
      var detalle = { url: ctx.url, mensaje: ctx.mensaje, unidad: ctx.unidad, lote: ctx.lote,
        sucursal: ctx.sucursal, tema: ctx.tema,
        unidad_id: props.unidad_id, origen: props.origen || null, numero: wa.numero(), disparador: el };
      var atendido = despachar('goon:wa-demo', detalle, true);
      if (!atendido && root.console && root.console.info) {
        root.console.info('[GOON] WhatsApp (demo, no se abre): ' + ctx.url);
      }
      return;
    }
    // producción: el <a> con href ya abre solo; cualquier otro elemento abre ventana.
    var esEnlace = String(el.tagName).toUpperCase() === 'A' && el.getAttribute('href');
    if (esEnlace) {
      el.setAttribute('href', ctx.url);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
      return;
    }
    if (ev && ev.preventDefault) ev.preventDefault();
    if (typeof root.open === 'function') root.open(ctx.url, '_blank', 'noopener');
  }

  function alHacerClic(ev) {
    var objetivo = ev && ev.target;
    if (!objetivo) return;
    var elWa = cercano(objetivo, SEL_WA);
    if (elWa) {
      manejarWa(elWa, ev);
      return;
    }
    var elEv = cercano(objetivo, '[data-event]');
    if (elEv) {
      var nombre = elEv.getAttribute('data-event');
      if (nombre) evento(nombre, propsDeAtributos(elEv));
    }
  }

  // Un solo listener por documento aunque el script se incluya dos veces:
  // el listener delega en la versión vigente de GOON (la última cargada).
  function instalar() {
    if (!doc || !doc.addEventListener) return;
    if (root.__GOON_CLIC_INSTALADO) return;
    root.__GOON_CLIC_INSTALADO = true;
    doc.addEventListener('click', function (ev) {
      var vigente = root.GOON && root.GOON._interno && root.GOON._interno.alHacerClic;
      (typeof vigente === 'function' ? vigente : alHacerClic)(ev);
    }, false);
  }

  // ---------------------------------------------------------------------------
  // Modo presentación (lo usa la capa de presentación del 13-oct)
  // ---------------------------------------------------------------------------
  function modoPresentacion(activar) {
    var html = doc && doc.documentElement;
    if (!html || !html.classList) return false;
    if (activar === undefined) return html.classList.contains(CLASE_PRESENTACION);
    if (activar) html.classList.add(CLASE_PRESENTACION);
    else html.classList.remove(CLASE_PRESENTACION);
    aplicarDatos(doc);
    despachar('goon:modo', { presentacion: !!activar }, false);
    return !!activar;
  }

  // ---------------------------------------------------------------------------
  // Publicación
  // ---------------------------------------------------------------------------
  var GOON = root.GOON && typeof root.GOON === 'object' ? root.GOON : {};
  GOON.version = '1.2.0';
  GOON.fmt = fmt;
  GOON.dato = dato;
  GOON.porConfirmar = porConfirmar;
  GOON.aplicarDatos = aplicarDatos;
  GOON.unidad = unidad;
  GOON.lote = lote;
  GOON.EVENTOS = EVENTOS;
  GOON.wa = wa;
  GOON.evento = evento;
  GOON.qs = qs;
  GOON.qsa = qsa;
  GOON.listo = listo;
  GOON.copiar = copiar;
  GOON.enlazarWhatsApp = enlazarWhatsApp;
  GOON.modoPresentacion = modoPresentacion;
  GOON._interno = { partirRuta: partirRuta, normalizarRuta: normalizarRuta, alHacerClic: alHacerClic, propsDeAtributos: propsDeAtributos };
  root.GOON = GOON;
  if (!Array.isArray(root.GOON_EVENTOS)) root.GOON_EVENTOS = [];

  instalar();
  listo(function () {
    aplicarDatos(doc);
    enlazarWhatsApp(doc);
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = GOON;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
