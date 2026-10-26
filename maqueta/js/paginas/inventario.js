/*!
 * Go On Camiones — js/paginas/inventario.js (Inventario)
 * Script clásico (IIFE), sin red. Depende de nucleo.js, comun.js y tarjeta-unidad.js.
 *
 * Qué hace:
 *   - Catálogo completo con GOON_TARJETA.render (un solo render de tarjeta).
 *   - Filtros: sucursal, marca, año, recorrido máximo (hasta 300/500/700 mil y el tope
 *     del estándar), precio (doble control), motor, transmisión, dormitorio, «solo lotes».
 *     Conteo por opción (facetas) calculado con el resto de los filtros.
 *   - Vista inicial «Por lote»: cada lote del mismo modelo es UNA ficha, así la primera
 *     página cubre todo el corte y todas las plazas (hoy 12 fichas para 34 unidades).
 *     «Unidades» muestra una tarjeta por unidad; la de un miembro de lote dice
 *     «1 de N del lote · Ver lote».
 *   - Orden «Sugerido»: rota entre plazas y entre lotes (una unidad por turno) y no repite
 *     la misma foto dentro de una página. Otros: precio, recorrido, año.
 *   - Vista cuadrícula/lista, chips de filtros activos con «Limpiar todo», conteo en vivo
 *     y estado vacío útil (cuántas unidades verías al quitar cada filtro).
 *   - Búsquedas por aplicación: atajos que ponen filtros (capa ILUSTRATIVO). En escritorio
 *     viven en el lateral; en celular, en una fila bajo la barra.
 *   - Estado en la URL: inventario.html?sucursal=queretaro&km=700000 (funciona en file://).
 *     Claves: sucursal, marca, anio, km, pmin, pmax, motor, trans, dorm, flota, lote, app,
 *     orden, vista, agrupar. Listas separadas por coma; sin distinguir mayúsculas ni acentos
 *     (?sucursal=QUERETARO y ?sucursal=Querétaro valen lo mismo).
 *   - En celular y tableta el MISMO formulario se muda a una hoja inferior (<dialog>):
 *     Esc la cierra y el foco regresa al botón «Filtros»; la tecla P no activa el modo
 *     presentación mientras la hoja está abierta.
 *   - Paginado: 12 fichas (6 en cuadrícula de celular) y «Ver N más»; el foco pasa a la
 *     primera ficha nueva. Cualquier cambio de filtro, orden o vista vuelve a la 1.ª página.
 *   - Anexo: resumen por plaza + tabla de todas las unidades del corte (plegable) + modo P.
 *     Al imprimir salen todas las fichas y la tabla abierta; después se restaura.
 *   - Medición: filtro_inventario {filtro, valor, resultados} en cada cambio del usuario;
 *     el precio se mide una vez al terminar de ajustarlo (400 ms sin cambios).
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  var T = root.GOON_TARJETA;
  if (!G || !doc) return;

  var CAT = root.GOON_CATALOGO || { meta: {}, unidades: [] };
  var META = CAT.meta || {};
  var CONTEOS = META.conteos || {};
  var TODAS = (Array.isArray(CAT.unidades) ? CAT.unidades : []).filter(function (u) { return u && u.id !== undefined; });
  var TOTAL = TODAS.length;
  var PASO_PRECIO = 50000;
  var ESCALONES_KM = [300000, 500000, 700000];
  var MQ_LATERAL = '(min-width: 1100px)';
  var MQ_ANCHO = '(min-width: 600px)';
  var DIMS = ['sucursal', 'marca', 'anio', 'motor', 'trans', 'dorm'];

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function num(v) {
    var n = Number(v);
    return v !== null && v !== undefined && v !== '' && isFinite(n) ? n : null;
  }

  function slug(s) {
    var t = String(s === null || s === undefined ? '' : s).toLowerCase();
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* sin normalize */ }
    return t.replace(/["'’”]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

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

  function plural(n, uno, varios) { return n === 1 ? uno : varios; }
  function unidadesTexto(n) { return plural(n, 'unidad', 'unidades'); }

  function movReducido() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function nombreSucursal(id) {
    return typeof G.nombreSucursal === 'function' ? G.nombreSucursal(id) : id;
  }

  function mismaLista(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort();
    var y = b.slice().sort();
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  function quitar(lista, valor) { return lista.filter(function (v) { return v !== valor; }); }

  // ---------------------------------------------------------------------------
  // Dimensiones del catálogo y sus opciones
  // ---------------------------------------------------------------------------
  var tamLote = {};
  var LOTE_MINUS = {}; // id en minúsculas -> id tal cual (la URL no distingue mayúsculas)
  TODAS.forEach(function (u) {
    if (!u.lote) return;
    tamLote[u.lote] = (tamLote[u.lote] || 0) + 1;
    LOTE_MINUS[String(u.lote).toLowerCase()] = String(u.lote);
  });
  function enLote(u) { return !!(u && u.lote && tamLote[u.lote] >= 2); }

  /** «LT Hi Rise Euro 2022»: nombre humano de un lote (el id es un hash técnico). */
  function nombreModelo(u) { return u ? [u.modelo, u.anio].filter(Boolean).join(' ') : ''; }

  function pulgadas(v) { var m = /(\d+)/.exec(String(v || '')); return m ? m[1] : ''; }

  var DIM = {
    sucursal: { titulo: 'Sucursal', valor: function (u) { return String(u.sucursal_id || ''); },
      texto: function (v) { return nombreSucursal(v); } },
    marca: { titulo: 'Marca', valor: function (u) { return slug(u.marca); }, texto: null },
    anio: { titulo: 'Año', valor: function (u) { return String(u.anio || ''); },
      texto: function (v) { return v; }, chip: function (v) { return 'Año ' + v; } },
    motor: { titulo: 'Motor', valor: function (u) { return slug(u.motor); }, texto: null },
    trans: { titulo: 'Transmisión', valor: function (u) { return slug(u.transmision); }, texto: null },
    dorm: { titulo: 'Dormitorio', valor: function (u) { return pulgadas(u.dormitorio); },
      texto: function (v) { return v + '"'; }, chip: function (v) { return 'Dormitorio ' + v + '"'; } }
  };
  var CRUDO = { marca: 'marca', motor: 'motor', trans: 'transmision' };

  // opciones[dim] = [{valor, texto, total}]
  var OPCIONES = {};
  DIMS.forEach(function (d) {
    var mapa = {};
    var lista = [];
    TODAS.forEach(function (u) {
      var v = DIM[d].valor(u);
      if (!v) return;
      if (!mapa[v]) {
        mapa[v] = { valor: v, texto: DIM[d].texto ? DIM[d].texto(v) : String(u[CRUDO[d]] || v), total: 0 };
        lista.push(mapa[v]);
      }
      mapa[v].total++;
    });
    if (d === 'sucursal') lista.sort(function (a, b) { return b.total - a.total || a.texto.localeCompare(b.texto, 'es'); });
    else if (d === 'anio') lista.sort(function (a, b) { return Number(b.valor) - Number(a.valor); });
    else if (d === 'dorm') lista.sort(function (a, b) { return Number(a.valor) - Number(b.valor); });
    else lista.sort(function (a, b) { return a.texto.localeCompare(b.texto, 'es'); });
    OPCIONES[d] = lista;
  });

  function textoOpcion(d, v) {
    var ops = OPCIONES[d] || [];
    for (var i = 0; i < ops.length; i++) if (ops[i].valor === v) return ops[i].texto;
    return v;
  }

  // Recorrido máximo: escalones fijos + el tope del estándar (sale de hechos).
  var KM_TOPE = num(G.dato('estandar.km_max')) || num((META.regla || {}).km_max);
  var KM_OPCIONES = ESCALONES_KM.filter(function (k) { return !KM_TOPE || k < KM_TOPE; });
  if (KM_TOPE) KM_OPCIONES.push(KM_TOPE);

  // Precio: rango del catálogo redondeado al paso.
  var PRECIOS = TODAS.map(function (u) { return num(u.precio); }).filter(function (p) { return p !== null; });
  var P_MIN = PRECIOS.length ? Math.floor(Math.min.apply(null, PRECIOS) / PASO_PRECIO) * PASO_PRECIO : 0;
  var P_MAX = PRECIOS.length ? Math.ceil(Math.max.apply(null, PRECIOS) / PASO_PRECIO) * PASO_PRECIO : 0;
  var HAY_RANGO_PRECIO = P_MAX > P_MIN;

  var ORDENES = [
    { id: 'sugerido', texto: 'Sugerido' },
    { id: 'precio-asc', texto: 'Menor precio' },
    { id: 'precio-desc', texto: 'Mayor precio' },
    { id: 'km-asc', texto: 'Menos km' },
    { id: 'anio-desc', texto: 'Más reciente' }
  ];

  // Búsquedas por aplicación (ILUSTRATIVO: propuesta de clasificación, no dato del inventario).
  function valoresDe(d, prueba) {
    return (OPCIONES[d] || []).filter(function (o) { return prueba(o); }).map(function (o) { return o.valor; });
  }
  var APLICACIONES = [
    { id: 'ruta-larga', titulo: 'Ruta larga', detalle: 'Dormitorio amplio',
      filtros: { dorm: valoresDe('dorm', function (o) { return Number(o.valor) >= 56; }) } },
    { id: 'regional', titulo: 'Regional', detalle: 'Dormitorio compacto',
      filtros: { dorm: valoresDe('dorm', function (o) { return Number(o.valor) <= 48; }) } },
    { id: 'automatizada', titulo: 'Automatizada', detalle: 'Sin pedal de embrague',
      filtros: { trans: valoresDe('trans', function (o) { return /ultrashift|dt12|automat/i.test(o.texto); }) } },
    { id: 'menor-recorrido', titulo: 'Menor recorrido', detalle: 'Hasta ' + G.fmt.kmCorto(500000),
      filtros: { km: KM_OPCIONES.indexOf(500000) !== -1 ? 500000 : null } },
    { id: 'flotilla', titulo: 'Flotilla', detalle: 'Varias del mismo modelo',
      filtros: { flota: true } }
  ].filter(function (a) {
    var f = a.filtros;
    if (f.dorm) return f.dorm.length > 0;
    if (f.trans) return f.trans.length > 0;
    if ('km' in f) return f.km !== null;
    return true;
  });

  function aplicacion(id) {
    for (var i = 0; i < APLICACIONES.length; i++) if (APLICACIONES[i].id === id) return APLICACIONES[i];
    return null;
  }

  // ---------------------------------------------------------------------------
  // Estado (y su espejo en la URL)
  // ---------------------------------------------------------------------------
  // «Por lote» es la vista inicial: la primera página cubre todo el corte y todas las plazas.
  var AGRUPAR_DEFECTO = 'lotes';

  function estadoVacio() {
    return {
      sucursal: [], marca: [], anio: [], motor: [], trans: [], dorm: [],
      km: null, pmin: null, pmax: null, flota: false, lote: null,
      orden: 'sugerido', vista: 'cuadricula', agrupar: AGRUPAR_DEFECTO
    };
  }
  var estado = estadoVacio();

  function ajustarPrecio(v) {
    var n = num(v);
    if (n === null || !HAY_RANGO_PRECIO) return null;
    n = Math.round(n / PASO_PRECIO) * PASO_PRECIO;
    return Math.min(P_MAX, Math.max(P_MIN, n));
  }

  /** Valor de la URL -> valor interno de la dimensión, sin distinguir mayúsculas ni acentos. */
  function normalizarValor(d, v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (d === 'anio') { var m = /\d{4}/.exec(s); return m ? m[0] : ''; }
    if (d === 'dorm') return pulgadas(s);
    var x = slug(s);
    if (d === 'sucursal') {
      // Acepta el id («gdl-otero») o el nombre de la plaza («Guadalajara»).
      var ops = OPCIONES.sucursal || [];
      for (var i = 0; i < ops.length; i++) {
        if (ops[i].valor === x || slug(ops[i].texto) === x) return ops[i].valor;
      }
    }
    return x;
  }

  function minus(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

  function leerURL() {
    var p = typeof G.params === 'function' ? G.params() : {};
    var st = estadoVacio();
    DIMS.forEach(function (d) {
      if (!p[d]) return;
      var validos = (OPCIONES[d] || []).map(function (o) { return o.valor; });
      String(p[d]).split(',').forEach(function (v) {
        var x = normalizarValor(d, v);
        if (x && validos.indexOf(x) !== -1 && st[d].indexOf(x) === -1) st[d].push(x);
      });
    });
    var km = num(p.km);
    if (km !== null && KM_OPCIONES.indexOf(km) !== -1) st.km = km;
    st.pmin = ajustarPrecio(p.pmin);
    st.pmax = ajustarPrecio(p.pmax);
    if (st.pmin !== null && st.pmax !== null && st.pmin > st.pmax) { var t = st.pmin; st.pmin = st.pmax; st.pmax = t; }
    if (st.pmin === P_MIN) st.pmin = null;
    if (st.pmax === P_MAX) st.pmax = null;
    st.flota = p.flota === '1' || minus(p.flota) === 'si';
    var lote = LOTE_MINUS[minus(p.lote)];
    if (lote && typeof G.lote === 'function' && G.lote(lote)) st.lote = lote;
    var orden = minus(p.orden);
    if (ORDENES.some(function (o) { return o.id === orden; })) st.orden = orden;
    if (minus(p.vista) === 'lista') st.vista = 'lista';
    var agr = minus(p.agrupar);
    if (agr === 'unidades' || agr === 'lotes') st.agrupar = agr;
    var app = aplicacion(minus(p.app));
    if (app) ponerAplicacion(st, app);
    return st;
  }

  function escribirURL() {
    if (typeof G.ponerParams !== 'function') return;
    var c = {};
    DIMS.forEach(function (d) { c[d] = estado[d].length ? estado[d].join(',') : null; });
    c.km = estado.km;
    c.pmin = estado.pmin;
    c.pmax = estado.pmax;
    c.flota = estado.flota ? '1' : null;
    c.lote = estado.lote;
    c.app = null;
    c.orden = estado.orden === 'sugerido' ? null : estado.orden;
    c.vista = estado.vista === 'cuadricula' ? null : estado.vista;
    c.agrupar = estado.agrupar === AGRUPAR_DEFECTO ? null : estado.agrupar;
    G.ponerParams(c);
  }

  function ponerAplicacion(st, app) {
    var f = app.filtros;
    if (f.dorm) st.dorm = f.dorm.slice();
    if (f.trans) st.trans = f.trans.slice();
    if ('km' in f) st.km = f.km;
    if (f.flota) { st.flota = true; st.agrupar = 'lotes'; }
  }

  // Quitar el atajo quita sus filtros; la agrupación es preferencia de vista y se queda.
  function quitarAplicacion(st, app) {
    var f = app.filtros;
    if (f.dorm) st.dorm = [];
    if (f.trans) st.trans = [];
    if ('km' in f) st.km = null;
    if (f.flota) st.flota = false;
  }

  function aplicacionActiva(st, app) {
    var f = app.filtros;
    if (f.dorm && !mismaLista(st.dorm, f.dorm)) return false;
    if (f.trans && !mismaLista(st.trans, f.trans)) return false;
    if ('km' in f && st.km !== f.km) return false;
    if (f.flota && !st.flota) return false;
    return true;
  }

  function copia(st) {
    var c = {};
    for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) c[k] = Array.isArray(st[k]) ? st[k].slice() : st[k];
    return c;
  }

  // ---------------------------------------------------------------------------
  // Filtrar, ordenar, agrupar
  // ---------------------------------------------------------------------------
  function cumple(u, st, excepto) {
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i];
      if (d !== excepto && st[d].length && st[d].indexOf(DIM[d].valor(u)) === -1) return false;
    }
    if (excepto !== 'km' && st.km !== null) {
      var km = num(u.km);
      if (km === null || km > st.km) return false;
    }
    if (excepto !== 'precio') {
      var p = num(u.precio);
      if (st.pmin !== null && (p === null || p < st.pmin)) return false;
      if (st.pmax !== null && (p === null || p > st.pmax)) return false;
    }
    if (excepto !== 'flota' && st.flota && !enLote(u)) return false;
    if (excepto !== 'lote' && st.lote && String(u.lote) !== st.lote) return false;
    return true;
  }

  function filtrar(st, excepto) {
    return TODAS.filter(function (u) { return cumple(u, st, excepto); });
  }

  function srcFoto(u) {
    var f = T && typeof T.foto === 'function' ? T.foto(u) : null;
    return f && f.foto && f.foto.src ? f.foto.src : null;
  }

  function porAnioKm(a, b) {
    return (num(b.anio) || 0) - (num(a.anio) || 0) || (num(a.km) || 0) - (num(b.km) || 0) || String(a.id).localeCompare(String(b.id));
  }

  /*
   * «Sugerido»: rotación entre plazas y, dentro de cada plaza, entre lotes y unidades
   * sueltas (una unidad por turno). Así la primera página muestra todas las plazas y
   * todos los lotes, y ninguna foto se repite dentro de una misma página (tam).
   *   - Cubeta = un lote del mismo modelo (≥ 2) o una unidad suelta.
   *   - En cada plaza: primero las cubetas con foto, luego las más grandes, luego año/km.
   *   - Abre la plaza cuya mejor cubeta tiene foto; el resto, por número de unidades.
   * En «Por lote» el orden de aparición de cada cubeta es el de su primera unidad, así
   * que la misma rotación ordena también las fichas agrupadas.
   */
  function ordenSugerido(lista, tam) {
    var cubetas = {};
    var todas = [];
    lista.forEach(function (u) {
      var k = enLote(u) ? 'l:' + u.lote : 'u:' + u.id;
      if (!cubetas[k]) {
        cubetas[k] = { plaza: String(u.sucursal_id || ''), unidades: [], foto: null };
        todas.push(cubetas[k]);
      }
      cubetas[k].unidades.push(u);
    });
    var porPlaza = {};
    var plazas = [];
    var total = {};
    todas.forEach(function (c) {
      c.unidades.sort(porAnioKm);
      for (var i = 0; i < c.unidades.length && !c.foto; i++) c.foto = srcFoto(c.unidades[i]);
      if (!porPlaza[c.plaza]) { porPlaza[c.plaza] = []; plazas.push(c.plaza); total[c.plaza] = 0; }
      porPlaza[c.plaza].push(c);
      total[c.plaza] += c.unidades.length;
    });
    plazas.forEach(function (p) {
      porPlaza[p].sort(function (a, b) {
        return (b.foto ? 1 : 0) - (a.foto ? 1 : 0) || b.unidades.length - a.unidades.length || porAnioKm(a.unidades[0], b.unidades[0]);
      });
    });
    plazas.sort(function (a, b) { return total[b] - total[a] || a.localeCompare(b); });
    var abre = null;
    plazas.forEach(function (p) {
      var c = porPlaza[p][0];
      if (c.foto && (!abre || c.unidades.length > porPlaza[abre][0].unidades.length)) abre = p;
    });
    if (abre) plazas = [abre].concat(plazas.filter(function (p) { return p !== abre; }));

    var salida = [];
    var restantes = lista.length;
    var usadas = {};
    var enPagina = 0;
    var fallidas = 0;
    var relajar = false;
    var i = 0;
    tam = Math.max(1, tam || 12);
    while (restantes > 0) {
      var cola = porPlaza[plazas[i % plazas.length]];
      i++;
      var j = -1;
      for (var k = 0; k < cola.length; k++) {
        if (relajar || !cola[k].foto || !usadas[cola[k].foto]) { j = k; break; }
      }
      if (j === -1) {
        // Ninguna cubeta de esta plaza sirve en esta página; si ninguna plaza puede,
        // se relaja la regla de la foto para no atorarse.
        if (++fallidas >= plazas.length) relajar = true;
        continue;
      }
      var c = cola.splice(j, 1)[0];
      salida.push(c.unidades.shift());
      restantes--;
      fallidas = 0;
      relajar = false;
      if (c.foto) usadas[c.foto] = true;
      if (c.unidades.length) cola.push(c);
      if (++enPagina >= tam) { enPagina = 0; usadas = {}; }
    }
    return salida;
  }

  function ordenar(lista) {
    if (estado.orden === 'sugerido') return ordenSugerido(lista, tamPagina());
    return lista.sort(COMPARADORES[estado.orden] || porAnioKm);
  }

  var COMPARADORES = {
    'precio-asc': function (a, b) { return (num(a.precio) || 0) - (num(b.precio) || 0) || porAnioKm(a, b); },
    'precio-desc': function (a, b) { return (num(b.precio) || 0) - (num(a.precio) || 0) || porAnioKm(a, b); },
    'km-asc': function (a, b) { return (num(a.km) || 0) - (num(b.km) || 0) || porAnioKm(a, b); },
    'anio-desc': porAnioKm
  };

  function agrupar(lista) {
    var grupos = [];
    var porLote = {};
    lista.forEach(function (u) {
      if (enLote(u)) {
        if (!porLote[u.lote]) { porLote[u.lote] = { lote: u.lote, unidades: [] }; grupos.push(porLote[u.lote]); }
        porLote[u.lote].unidades.push(u);
      } else {
        grupos.push({ unidad: u });
      }
    });
    return grupos;
  }

  // ---------------------------------------------------------------------------
  // Referencias al DOM
  // ---------------------------------------------------------------------------
  var R = {};

  function tomarDOM() {
    R.form = G.qs('[data-inv-filtros]');
    R.ancla = G.qs('[data-inv-ancla]');
    R.resultados = G.qs('[data-inv-resultados]');
    R.vacio = G.qs('[data-inv-vacio]');
    R.cabeza = G.qs('.inv-cabeza');
    R.n = G.qs('[data-inv-n]');
    R.nTexto = G.qs('[data-inv-n-texto]');
    R.detalle = G.qs('[data-inv-detalle]');
    R.nBarra = G.qs('[data-inv-n-barra]');
    R.nBarraTexto = G.qs('[data-inv-n-barra-texto]');
    R.nFiltros = G.qs('[data-inv-n-filtros]');
    R.anuncio = G.qs('[data-inv-anuncio]');
    R.activos = G.qs('[data-inv-activos]');
    R.chips = G.qs('[data-inv-chips]');
    R.orden = G.qs('[data-inv-orden]');
    R.vista = G.qs('[data-inv-vista]');
    R.agrupar = G.qs('[data-inv-agrupar]');
    R.flota = G.qs('[data-inv-flota]');
    R.flotaN = G.qs('[data-inv-flota-n]');
    R.km = G.qs('[data-inv-km]');
    R.pmin = G.qs('[data-inv-pmin]');
    R.pmax = G.qs('[data-inv-pmax]');
    R.pminTexto = G.qs('[data-inv-pmin-texto]');
    R.pmaxTexto = G.qs('[data-inv-pmax-texto]');
    R.relleno = G.qs('[data-inv-rango-relleno]');
    R.histograma = G.qs('[data-inv-histograma]');
    R.apps = G.qsa('[data-inv-aplicaciones]'); // dos: lateral (escritorio) y fila (celular)
    R.plazas = G.qs('[data-inv-plazas]');
    R.aviso = G.qs('[data-inv-lote-aviso]');
    R.hoja = G.qs('#inv-hoja');
    R.hojaCuerpo = G.qs('[data-inv-hoja-cuerpo]');
    R.hojaConteo = G.qs('[data-inv-hoja-conteo]');
    R.hojaN = G.qs('[data-inv-hoja-n]');
    R.abrir = G.qs('[data-inv-abrir]');
    R.sugerencias = G.qs('[data-inv-sugerencias]');
    R.mas = G.qs('[data-inv-mas]');
    R.masTexto = G.qs('[data-inv-mas-texto]');
    R.masBarra = G.qs('[data-inv-mas-barra]');
    R.masAccion = G.qs('[data-inv-mas-accion]');
  }

  // ---------------------------------------------------------------------------
  // Controles del formulario
  // ---------------------------------------------------------------------------
  function opcionCaja(d, o) {
    return el('label', { 'class': 'inv-opcion', 'data-opcion': o.valor }, [
      el('input', { type: 'checkbox', name: 'inv-' + d, value: o.valor, 'data-dim': d }),
      el('span', { 'class': 'inv-opcion__caja', 'aria-hidden': 'true' }, [icono('inv-i-tick')]),
      el('span', { 'class': 'inv-opcion__texto', text: o.texto }),
      el('span', { 'class': 'inv-opcion__n' }, [el('span', { 'data-n': '' }, String(o.total)), el('span', { 'class': 'sr', text: ' unidades' })])
    ]);
  }

  function opcionChip(tipo, nombre, valor, texto, extra) {
    return el('label', { 'class': 'inv-chip', 'data-opcion': valor }, [
      el('input', { type: tipo, name: nombre, value: valor, 'data-dim': extra.dim || null, 'data-km': extra.km ? '' : null }),
      el('span', { 'class': 'inv-chip__texto', text: texto }),
      el('span', { 'class': 'inv-chip__n' }, [el('span', { 'data-n': '' }), el('span', { 'class': 'sr', text: ' unidades' })])
    ]);
  }

  function construirControles() {
    DIMS.forEach(function (d) {
      var cont = G.qs('[data-inv-opciones="' + d + '"]', R.form);
      if (!cont) return;
      cont.textContent = '';
      var chips = cont.classList.contains('inv-opciones--chips');
      OPCIONES[d].forEach(function (o) {
        cont.appendChild(chips ? opcionChip('checkbox', 'inv-' + d, o.valor, o.texto, { dim: d }) : opcionCaja(d, o));
      });
      var grupo = cont.closest('.inv-grupo');
      if (grupo && OPCIONES[d].length < 2) grupo.hidden = true;
    });
    if (R.km) {
      R.km.textContent = '';
      R.km.appendChild(opcionChip('radio', 'inv-km', '', 'Cualquiera', { km: true }));
      KM_OPCIONES.forEach(function (k) {
        R.km.appendChild(opcionChip('radio', 'inv-km', String(k), 'Hasta ' + G.fmt.kmCorto(k), { km: true }));
      });
    }
    if (R.pmin && R.pmax) {
      [R.pmin, R.pmax].forEach(function (inp) {
        inp.min = String(P_MIN);
        inp.max = String(P_MAX);
        inp.step = String(PASO_PRECIO);
      });
      var grupoPrecio = R.pmin.closest('.inv-grupo');
      if (grupoPrecio && !HAY_RANGO_PRECIO) grupoPrecio.hidden = true;
    }
    if (R.orden) {
      R.orden.textContent = '';
      ORDENES.forEach(function (o) { R.orden.appendChild(el('option', { value: o.id, text: o.texto })); });
    }
    if (R.flota) {
      var alguno = TODAS.some(enLote);
      var suelta = R.flota.closest('.inv-opcion');
      if (suelta && !alguno) suelta.hidden = true;
    }
    construirHistograma();
    construirAplicaciones();
    construirPlazas();
  }

  var BINS = 12;
  function construirHistograma() {
    if (!R.histograma || !HAY_RANGO_PRECIO) return;
    R.histograma.textContent = '';
    for (var i = 0; i < BINS; i++) R.histograma.appendChild(el('span'));
  }

  function construirAplicaciones() {
    (R.apps || []).forEach(function (cont) {
      cont.textContent = '';
      if (!APLICACIONES.length) { var caja = cont.closest('.inv-aplicaciones'); if (caja) caja.hidden = true; return; }
      APLICACIONES.forEach(function (a) {
        cont.appendChild(el('button', { type: 'button', 'class': 'inv-app', 'aria-pressed': 'false', 'data-app': a.id }, [
          el('span', { 'class': 'inv-app__titulo', text: a.titulo }),
          el('span', { 'class': 'inv-app__n', 'data-app-n': '' }),
          el('span', { 'class': 'inv-app__detalle', text: a.detalle })
        ]));
      });
    });
  }

  function construirPlazas() {
    if (!R.plazas) return;
    R.plazas.textContent = '';
    var mapa = CONTEOS.por_sucursal || {};
    Object.keys(mapa)
      .filter(function (id) { return typeof mapa[id] === 'number' && mapa[id] > 0; })
      .sort(function (a, b) { return mapa[b] - mapa[a]; })
      .forEach(function (id) {
        R.plazas.appendChild(el('button', { type: 'button', 'class': 'inv-plaza', 'aria-pressed': 'false', 'data-plaza': id }, [
          el('span', { 'class': 'inv-plaza__nombre', text: nombreSucursal(id) }),
          el('b', { 'class': 'inv-plaza__n', text: G.fmt.numero(mapa[id]) }),
          el('span', { 'class': 'sr', text: ' ' + unidadesTexto(mapa[id]) })
        ]));
      });
    if (!R.plazas.children.length) {
      var ayuda = G.qs('.inv-contador__ayuda');
      if (ayuda) ayuda.hidden = true;
      R.plazas.hidden = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Sincronizar el formulario con el estado (y las facetas)
  // ---------------------------------------------------------------------------
  function sincronizarControles() {
    G.qsa('input[data-dim]', R.form).forEach(function (inp) {
      inp.checked = estado[inp.getAttribute('data-dim')].indexOf(inp.value) !== -1;
    });
    G.qsa('input[data-km]', R.form).forEach(function (inp) {
      inp.checked = estado.km === null ? inp.value === '' : String(estado.km) === inp.value;
    });
    if (R.flota) R.flota.checked = estado.flota;
    if (R.pmin && R.pmax) {
      R.pmin.value = String(estado.pmin === null ? P_MIN : estado.pmin);
      R.pmax.value = String(estado.pmax === null ? P_MAX : estado.pmax);
      pintarRango();
    }
    marcarSegmento(R.agrupar, estado.lote ? 'unidades' : estado.agrupar);
    marcarSegmento(R.vista, estado.vista);
    if (R.orden) R.orden.value = estado.orden;
    ['motor', 'trans', 'dorm'].forEach(function (d) {
      var det = G.qs('[data-inv-plegable="' + d + '"]', R.form);
      var activo = G.qs('[data-inv-activo="' + d + '"]', R.form);
      var n = estado[d].length;
      if (activo) activo.textContent = n ? String(n) : '';
      if (det && n && !det.open) det.open = true;
    });
    if (R.agrupar) {
      G.qsa('button', R.agrupar).forEach(function (b) { b.disabled = !!estado.lote; });
    }
  }

  function marcarSegmento(cont, valor) {
    if (!cont) return;
    G.qsa('button[data-valor]', cont).forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-valor') === valor ? 'true' : 'false');
    });
  }

  function pintarFacetas() {
    DIMS.forEach(function (d) {
      var base = filtrar(estado, d);
      G.qsa('input[data-dim="' + d + '"]', R.form).forEach(function (inp) {
        var n = base.filter(function (u) { return DIM[d].valor(u) === inp.value; }).length;
        ponerN(inp, n);
      });
    });
    var baseKm = filtrar(estado, 'km');
    G.qsa('input[data-km]', R.form).forEach(function (inp) {
      var tope = num(inp.value);
      var n = tope === null ? baseKm.length : baseKm.filter(function (u) { return (num(u.km) || 0) <= tope; }).length;
      ponerN(inp, n);
    });
    if (R.flotaN) {
      var nf = filtrar(estado, 'flota').filter(enLote).length;
      R.flotaN.textContent = String(nf);
      var lab = R.flota && R.flota.closest('.inv-opcion');
      if (lab) lab.classList.toggle('es-cero', nf === 0 && !estado.flota);
    }
    pintarHistograma();
    pintarAplicaciones();
    G.qsa('[data-plaza]', R.plazas).forEach(function (b) {
      var id = b.getAttribute('data-plaza');
      b.setAttribute('aria-pressed', estado.sucursal.length === 1 && estado.sucursal[0] === id ? 'true' : 'false');
    });
  }

  function ponerN(inp, n) {
    var lab = inp.closest('label');
    if (!lab) return;
    var cifra = lab.querySelector('[data-n]');
    if (cifra) cifra.textContent = String(n);
    lab.classList.toggle('es-cero', n === 0 && !inp.checked);
  }

  function pintarHistograma() {
    if (!R.histograma || !HAY_RANGO_PRECIO) return;
    var base = filtrar(estado, 'precio');
    var cuentas = [];
    for (var i = 0; i < BINS; i++) cuentas.push(0);
    base.forEach(function (u) {
      var p = num(u.precio);
      if (p === null) return;
      var idx = Math.min(BINS - 1, Math.floor((p - P_MIN) / (P_MAX - P_MIN) * BINS));
      cuentas[Math.max(0, idx)]++;
    });
    var tope = Math.max.apply(null, cuentas.concat([1]));
    var lo = estado.pmin === null ? P_MIN : estado.pmin;
    var hi = estado.pmax === null ? P_MAX : estado.pmax;
    G.qsa('span', R.histograma).forEach(function (barra, j) {
      var ini = P_MIN + (P_MAX - P_MIN) * j / BINS;
      var fin = P_MIN + (P_MAX - P_MIN) * (j + 1) / BINS;
      barra.style.setProperty('--h', cuentas[j] ? Math.max(0.12, cuentas[j] / tope).toFixed(3) : '0');
      barra.classList.toggle('es-fuera', fin <= lo || ini > hi);
    });
  }

  function pintarAplicaciones() {
    if (!R.apps || !R.apps.length) return;
    G.qsa('[data-inv-aplicaciones] [data-app]').forEach(function (b) {
      var a = aplicacion(b.getAttribute('data-app'));
      if (!a) return;
      var activa = aplicacionActiva(estado, a);
      var prueba = copia(estado);
      ponerAplicacion(prueba, a);
      var n = filtrar(prueba).length;
      b.setAttribute('aria-pressed', activa ? 'true' : 'false');
      var cifra = b.querySelector('[data-app-n]');
      if (cifra) {
        cifra.textContent = '';
        cifra.appendChild(el('b', { text: G.fmt.numero(n) }));
        cifra.appendChild(el('span', { 'class': 'inv-app__n-texto', text: ' ' + unidadesTexto(n) }));
      }
      b.classList.toggle('es-cero', n === 0 && !activa);
    });
  }

  function pintarRango() {
    if (!R.pmin || !R.pmax || !HAY_RANGO_PRECIO) return;
    var lo = Number(R.pmin.value);
    var hi = Number(R.pmax.value);
    var span = P_MAX - P_MIN;
    if (R.relleno) {
      R.relleno.style.left = ((lo - P_MIN) / span * 100).toFixed(2) + '%';
      R.relleno.style.right = ((P_MAX - hi) / span * 100).toFixed(2) + '%';
    }
    if (R.pminTexto) R.pminTexto.textContent = G.fmt.mxn(lo);
    if (R.pmaxTexto) R.pmaxTexto.textContent = G.fmt.mxn(hi);
    R.pmin.setAttribute('aria-valuetext', G.fmt.mxn(lo));
    R.pmax.setAttribute('aria-valuetext', G.fmt.mxn(hi));
    // Si los dos controles se juntan arriba, el del mínimo queda encima para poder bajarlo.
    R.pmin.classList.toggle('es-encima', lo > P_MIN + span / 2);
  }

  // ---------------------------------------------------------------------------
  // Chips de filtros activos
  // ---------------------------------------------------------------------------
  function listaActivos() {
    var salida = [];
    if (estado.lote) {
      // Etiqueta humana («Lote: 10 × LT Hi Rise Euro 2022»); el id del lote solo va en la URL.
      var lt = typeof G.lote === 'function' ? G.lote(estado.lote) : null;
      var textoLote = lt ? 'Lote: ' + lt.n + ' × ' + nombreModelo(lt.representante) : 'Lote del mismo modelo';
      salida.push({ clave: 'lote', texto: textoLote, quitar: function (st) { st.lote = null; } });
    }
    DIMS.forEach(function (d) {
      estado[d].forEach(function (v) {
        var t = textoOpcion(d, v);
        salida.push({ clave: d, valor: v, texto: DIM[d].chip ? DIM[d].chip(v) : t,
          quitar: function (st) { st[d] = quitar(st[d], v); } });
      });
    });
    if (estado.km !== null) salida.push({ clave: 'km', texto: 'Hasta ' + G.fmt.kmCorto(estado.km), quitar: function (st) { st.km = null; } });
    if (estado.pmin !== null || estado.pmax !== null) {
      var lo = estado.pmin === null ? P_MIN : estado.pmin;
      var hi = estado.pmax === null ? P_MAX : estado.pmax;
      salida.push({ clave: 'precio', texto: G.fmt.mxn(lo) + ' a ' + G.fmt.mxn(hi), quitar: function (st) { st.pmin = null; st.pmax = null; } });
    }
    if (estado.flota) salida.push({ clave: 'flota', texto: 'Solo lotes', quitar: function (st) { st.flota = false; } });
    return salida;
  }

  function pintarChips(activos) {
    if (!R.chips || !R.activos) return;
    R.chips.textContent = '';
    activos.forEach(function (a, i) {
      R.chips.appendChild(el('li', null, [
        el('button', { type: 'button', 'class': 'inv-activo', 'data-quitar': String(i), 'aria-label': 'Quitar filtro: ' + a.texto }, [
          el('span', { text: a.texto }), icono('inv-i-quitar')
        ])
      ]));
    });
    R.activos.hidden = activos.length === 0;
    G.qsa('[data-inv-limpiar]').forEach(function (b) {
      if (b.closest('.inv-filtros__cabeza')) b.hidden = activos.length === 0;
    });
    if (R.nFiltros) {
      R.nFiltros.hidden = activos.length === 0;
      R.nFiltros.textContent = String(activos.length);
    }
    if (R.abrir) R.abrir.setAttribute('aria-label', activos.length ? 'Filtros, ' + activos.length + ' activos' : 'Filtros');
  }

  // ---------------------------------------------------------------------------
  // Resultados
  // ---------------------------------------------------------------------------
  var tituloFicha = function (u) { return [u.marca, u.modelo, u.anio].filter(Boolean).join(' '); };

  // ---------------------------------------------------------------------------
  // Ajustes TRANSITORIOS de la tarjeta
  // La tarjeta sale siempre de GOON_TARJETA.render (un solo render). La página ya le
  // pasa las opciones que pidió a tarjeta-unidad.js (fila, coinciden/total,
  // miembroLote); hoy el render las ignora sin romperse. Mientras tanto, estos
  // ajustes cubren lo mismo y se saltan solos cuando la tarjeta ya lo trae.
  // ---------------------------------------------------------------------------
  function ajustarTarjeta(t, it, enLista) {
    unirMarca(t);
    if (it.lote) marcarCoinciden(t, it.unidades.length, tamLote[it.lote] || it.unidades.length);
    else marcarMiembro(t, it.unidad);
    if (enLista && !t.classList.contains('tarjeta--fila')) { envolverFoto(t); envolverCompra(t); }
  }

  // Vista lista: foto + su leyenda en una columna, y precio + nota + acciones en otra.
  function envolverFoto(tarjeta) {
    var media = tarjeta.querySelector(':scope > .tarjeta__media');
    if (!media) return;
    var col = el('div', { 'class': 'inv-foto-col' });
    tarjeta.insertBefore(col, media);
    col.appendChild(media);
    var pie = tarjeta.querySelector(':scope > .tarjeta__pie');
    if (pie) col.appendChild(pie);
  }

  function envolverCompra(tarjeta) {
    var cuerpo = tarjeta.querySelector('.tarjeta__cuerpo');
    if (!cuerpo) return;
    var compra = el('div', { 'class': 'inv-compra' });
    ['.tarjeta__precio', '.tarjeta__nota', '.tarjeta__acciones'].forEach(function (sel) {
      var n = cuerpo.querySelector(':scope > ' + sel);
      if (n) compra.appendChild(n);
    });
    cuerpo.appendChild(compra);
  }

  // «Go On» nunca se parte en dos renglones (la línea del estándar es texto plano).
  function unirMarca(tarjeta) {
    G.qsa('.tarjeta__estandar', tarjeta).forEach(function (p) {
      for (var n = p.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 && n.nodeValue.indexOf('Go On') !== -1) n.nodeValue = n.nodeValue.replace(/Go On/g, 'Go\u00a0On');
      }
    });
  }

  function marcarCoinciden(tarjeta, coinciden, total) {
    if (coinciden >= total || tarjeta.querySelector('.tarjeta__coinciden, .inv-coinciden')) return;
    var linea = tarjeta.querySelector('.tarjeta__pictos');
    if (!linea) return;
    linea.appendChild(el('span', { 'class': 'inv-coinciden', text: coinciden + ' de ' + total + ' ' + plural(coinciden, 'coincide', 'coinciden') + ' con tus filtros' }));
  }

  // Vista «Unidades»: la tarjeta de un miembro de lote dice «1 de 10 del lote · Ver lote»
  // en lugar de «1 unidad» (el enlace lo atiende alClicPagina: filtra por ese lote).
  function marcarMiembro(tarjeta, u) {
    if (!u || !enLote(u) || estado.lote || tarjeta.querySelector('[data-lote-miembro], [data-inv-miembro]')) return;
    var linea = tarjeta.querySelector('.tarjeta__pictos');
    var cifra = linea && linea.querySelector('b');
    if (!cifra) return;
    var n = tamLote[u.lote];
    cifra.textContent = '1 de ' + n + ' del lote';
    var pictos = linea.querySelector('.pictos');
    if (pictos) for (var i = 1; i < Math.min(n, 24); i++) pictos.appendChild(el('i', { 'class': 'inv-picto-resto' }));
    linea.appendChild(el('a', {
      'class': 'inv-ver-lote', href: 'inventario.html?lote=' + encodeURIComponent(u.lote), 'data-inv-miembro': '',
      'aria-label': 'Ver el lote de ' + n + ' ' + tituloFicha(u)
    }, ['Ver lote', icono('i-flecha')]));
  }

  // Paginado: tamaño de página según vista y ancho. En escritorio «Por lote» cabe entero
  // en 12 fichas; en celular la 1.ª página (6) ya trae todas las plazas y los tres lotes.
  function tamPagina() {
    if (estado.vista === 'lista') return 12;
    var ancho = root.matchMedia ? root.matchMedia(MQ_ANCHO).matches : true;
    return ancho ? 12 : 6;
  }

  var pagina = { items: [], mostradas: 0 };

  function renderItem(it, i) {
    var enLista = estado.vista === 'lista';
    var opc = {
      origen: 'inventario',
      carga: i < 3 ? 'eager' : 'lazy',
      sizes: enLista ? '(min-width: 760px) 216px, 132px' : '(min-width: 1100px) 320px, (min-width: 600px) 50vw, 100vw',
      fila: enLista || undefined
    };
    var t;
    if (it.lote) {
      opc.variante = 'lote';
      opc.lote = it.lote;
      opc.coinciden = it.unidades.length;
      opc.total = tamLote[it.lote] || it.unidades.length;
      t = T.render(it.unidades[0], opc);
    } else {
      opc.miembroLote = (enLote(it.unidad) && !estado.lote) || undefined;
      t = T.render(it.unidad, opc);
    }
    if (!t) return null;
    ajustarTarjeta(t, it, enLista);
    t.style.setProperty('--i', String(Math.min(i - pagina.mostradas, 8)));
    return t;
  }

  function agregarFichas(hasta) {
    var cont = R.resultados;
    var frag = doc.createDocumentFragment();
    var primera = null;
    var fin = Math.min(hasta, pagina.items.length);
    for (var i = pagina.mostradas; i < fin; i++) {
      var t = renderItem(pagina.items[i], i);
      if (!t) continue;
      if (!primera) primera = t;
      frag.appendChild(t);
    }
    pagina.mostradas = fin;
    cont.appendChild(frag);
    G.refrescar(cont);
    pintarMas();
    return primera;
  }

  function pintarMas() {
    if (!R.mas) return;
    var total = pagina.items.length;
    var restan = total - pagina.mostradas;
    R.mas.hidden = restan <= 0;
    if (restan <= 0) return;
    var agrupado = estado.agrupar === 'lotes' && !estado.lote;
    var palabra = agrupado ? plural(total, 'ficha', 'fichas') : unidadesTexto(total);
    if (R.masTexto) R.masTexto.textContent = 'Ves ' + pagina.mostradas + ' de ' + total + ' ' + palabra;
    if (R.masBarra) R.masBarra.style.width = (pagina.mostradas / total * 100).toFixed(1) + '%';
    var siguiente = Math.min(tamPagina(), restan);
    if (R.masAccion) R.masAccion.textContent = 'Ver ' + siguiente + ' más';
  }

  function verMas() {
    R.resultados.classList.toggle('inv-resultados--entra', !movReducido());
    var primera = agregarFichas(pagina.mostradas + tamPagina());
    G.evento('filtro_inventario', { filtro: 'ver_mas', valor: String(pagina.mostradas), resultados: pagina.items.length });
    if (primera) {
      var enlace = primera.querySelector('.tarjeta__enlace');
      if (enlace) { try { enlace.focus({ preventScroll: true }); } catch (e) { enlace.focus(); } }
      try { primera.scrollIntoView({ behavior: movReducido() ? 'auto' : 'smooth', block: 'start' }); } catch (e2) { primera.scrollIntoView(); }
    }
  }

  function pintarResultados(lista, animar) {
    var cont = R.resultados;
    if (!cont || !T || typeof T.render !== 'function') return 0;
    cont.textContent = '';
    cont.setAttribute('data-vista', estado.vista);
    var agrupado = estado.agrupar === 'lotes' && !estado.lote;
    pagina.items = agrupado ? agrupar(lista) : lista.map(function (u) { return { unidad: u }; });
    pagina.mostradas = 0;
    cont.classList.toggle('inv-resultados--entra', !!animar && !movReducido());
    agregarFichas(tamPagina());
    return pagina.items.length;
  }

  function pintarConteos(n, fichas, activos) {
    var txt = unidadesTexto(n);
    if (R.n) R.n.textContent = G.fmt.numero(n);
    if (R.nTexto) R.nTexto.textContent = txt;
    if (R.nBarra) R.nBarra.textContent = G.fmt.numero(n);
    if (R.nBarraTexto) R.nBarraTexto.textContent = txt;
    if (R.detalle) {
      var partes = [];
      if (activos.length) partes.push('de ' + G.fmt.numero(TOTAL) + ' del corte');
      else partes.push('Califican por año modelo y kilometraje');
      if (estado.agrupar === 'lotes' && !estado.lote && n && fichas < n) partes.push('en ' + fichas + ' ' + plural(fichas, 'ficha', 'fichas') + ', con los lotes agrupados');
      R.detalle.textContent = partes.join(' · ');
    }
    if (R.hojaConteo) R.hojaConteo.textContent = G.fmt.numero(n) + ' ' + txt;
    if (R.hojaN) R.hojaN.textContent = n ? G.fmt.numero(n) + ' ' + txt : 'resultados';
  }

  function pintarVacio(n, activos) {
    if (!R.vacio) return;
    var capa = R.resultados && R.resultados.closest('.inv-resultados__capa');
    R.vacio.hidden = n > 0;
    if (capa) capa.hidden = n === 0;
    if (n > 0 || !R.sugerencias) return;
    R.sugerencias.textContent = '';
    var opciones = activos.map(function (a, i) {
      var prueba = copia(estado);
      a.quitar(prueba);
      return { i: i, texto: a.texto, n: filtrar(prueba).length };
    }).filter(function (s) { return s.n > 0; })
      .sort(function (x, y) { return y.n - x.n; })
      .slice(0, 4);
    opciones.forEach(function (s) {
      R.sugerencias.appendChild(el('li', null, [
        el('button', { type: 'button', 'class': 'inv-sugerencia', 'data-quitar': String(s.i) }, [
          el('span', { 'class': 'inv-sugerencia__quitar', text: 'Quitar «' + s.texto + '»' }),
          el('span', { 'class': 'inv-sugerencia__n', text: G.fmt.numero(s.n) + ' ' + unidadesTexto(s.n) }),
          icono('i-flecha')
        ])
      ]));
    });
    var intro = G.qs('[data-inv-sugerencias-intro]');
    if (intro) intro.hidden = !opciones.length;
  }

  function pintarAvisoLote() {
    if (!R.aviso) return;
    var lt = estado.lote && typeof G.lote === 'function' ? G.lote(estado.lote) : null;
    R.aviso.hidden = !lt;
    if (!lt) return;
    var rep = lt.representante;
    var titulo = G.qs('[data-inv-lote-titulo]', R.aviso);
    var detalle = G.qs('[data-inv-lote-detalle]', R.aviso);
    var etiqueta = G.qs('[data-inv-lote-etiqueta]', R.aviso);
    var wa = G.qs('[data-inv-lote-wa]', R.aviso);
    var esLote = lt.n >= 2;
    // Etiquetas humanas: el id del lote (hash técnico) solo se ve en modo P.
    if (etiqueta) etiqueta.textContent = esLote ? 'Lote de ' + lt.n + ' · mismo modelo' : 'Unidad del corte';
    if (titulo) titulo.textContent = (esLote ? lt.n + ' × ' : '') + tituloFicha(rep);
    var partes = [rep.plaza && rep.estado && rep.estado !== rep.plaza ? rep.plaza + ', ' + rep.estado : (rep.plaza || '')];
    partes.push(T && T.rangoKm ? T.rangoKm(lt.km_min, lt.km_max) : G.fmt.kmCorto(lt.km_min));
    partes.push(lt.precio_min === lt.precio_max ? G.fmt.mxn(lt.precio_min) + ' MXN' + (esLote ? ' c/u' : '')
      : 'desde ' + G.fmt.mxn(lt.precio_min) + ' MXN');
    if (detalle) {
      detalle.textContent = partes.filter(Boolean).join(' · ');
      detalle.appendChild(el('span', { 'class': 'solo-presentacion inv-aviso__id' }, [' · Lote ', el('span', { 'class': 'id-mono', text: lt.id })]));
    }
    if (wa) {
      wa.setAttribute('data-wa-unidad', String(rep.id));
      if (esLote) wa.setAttribute('data-wa-lote', lt.id); else wa.removeAttribute('data-wa-lote');
      var texto = wa.lastChild;
      if (texto && texto.nodeType === 3) texto.textContent = esLote ? 'Preguntar por el lote' : 'Preguntar por esta unidad';
    }
  }

  // ---------------------------------------------------------------------------
  // Aplicar (el ciclo completo)
  // ---------------------------------------------------------------------------
  var temporizadorAnuncio = null;

  function anunciar(texto) {
    if (!R.anuncio) return;
    if (temporizadorAnuncio) root.clearTimeout(temporizadorAnuncio);
    temporizadorAnuncio = root.setTimeout(function () { R.anuncio.textContent = texto; }, 350);
  }

  function aplicar(cambio) {
    var lista = ordenar(filtrar(estado));
    var activos = listaActivos();
    var fichas = pintarResultados(lista, !!cambio);
    pintarConteos(lista.length, fichas, activos);
    pintarChips(activos);
    pintarVacio(lista.length, activos);
    pintarAvisoLote();
    sincronizarControles();
    pintarFacetas();
    if (!cambio) return;
    escribirURL();
    anunciar(lista.length ? G.fmt.numero(lista.length) + ' ' + unidadesTexto(lista.length) + (activos.length ? ' con estos filtros' : ' en el corte')
      : 'Ninguna unidad con estos filtros');
    if (cambio.filtro) {
      G.evento('filtro_inventario', { filtro: cambio.filtro, valor: cambio.valor === undefined || cambio.valor === null ? null : String(cambio.valor), resultados: lista.length });
    }
    if (cambio.subir) irAResultados(null, false);
  }

  // Lleva la vista al inicio de los resultados si quedaron fuera de pantalla. Con
  // forzar=false solo sube (el usuario filtra desde abajo); con true también baja
  // (clic en una plaza de la portada o «Ver» en la hoja).
  function irAResultados(enfocar, forzar) {
    var destino = R.cabeza || R.resultados;
    if (!destino) return;
    var r = destino.getBoundingClientRect();
    var alto = root.innerHeight || 800;
    if (r.top < 0 || (forzar !== false && r.top > alto * 0.6)) {
      try { destino.scrollIntoView({ behavior: movReducido() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { destino.scrollIntoView(); }
    }
    if (enfocar && enfocar.focus) { try { enfocar.focus({ preventScroll: true }); } catch (e2) { enfocar.focus(); } }
  }

  // ---------------------------------------------------------------------------
  // Eventos de la interfaz
  // ---------------------------------------------------------------------------
  var rafPrecio = 0;
  var esperaPrecio = 0;
  var ESPERA_PRECIO_MS = 400;

  // El precio se repinta en vivo (alMoverPrecio); la URL, el anuncio y la medición
  // esperan a que el usuario deje de ajustarlo: 10 flechas seguidas = 1 evento.
  function programarPrecio() {
    if (esperaPrecio) root.clearTimeout(esperaPrecio);
    esperaPrecio = root.setTimeout(confirmarPrecio, ESPERA_PRECIO_MS);
  }

  function confirmarPrecio() {
    esperaPrecio = 0;
    var n = filtrar(estado).length;
    var activos = listaActivos();
    escribirURL();
    anunciar(n ? G.fmt.numero(n) + ' ' + unidadesTexto(n) + (activos.length ? ' con estos filtros' : ' en el corte') : 'Ninguna unidad con estos filtros');
    G.evento('filtro_inventario', {
      filtro: 'precio',
      valor: (estado.pmin === null ? P_MIN : estado.pmin) + '-' + (estado.pmax === null ? P_MAX : estado.pmax),
      resultados: n
    });
  }

  function alCambiarForm(ev) {
    var t = ev.target;
    if (!t) return;
    var dim = t.getAttribute('data-dim');
    if (dim) {
      estado[dim] = t.checked ? estado[dim].concat([t.value]) : quitar(estado[dim], t.value);
      aplicar({ filtro: dim, valor: t.checked ? t.value : 'quitar:' + t.value, subir: !hojaAbierta() });
    } else if (t.hasAttribute('data-km')) {
      estado.km = num(t.value);
      aplicar({ filtro: 'km', valor: estado.km === null ? 'cualquiera' : estado.km, subir: !hojaAbierta() });
    } else if (t === R.flota) {
      estado.flota = t.checked;
      aplicar({ filtro: 'flota', valor: t.checked ? 'si' : 'no', subir: !hojaAbierta() });
    } else if (t === R.pmin || t === R.pmax) {
      programarPrecio();
    }
  }

  function alMoverPrecio(ev) {
    var t = ev.target;
    if (t !== R.pmin && t !== R.pmax) return;
    var lo = Number(R.pmin.value);
    var hi = Number(R.pmax.value);
    if (lo > hi - PASO_PRECIO) {
      if (t === R.pmin) { lo = Math.max(P_MIN, hi - PASO_PRECIO); R.pmin.value = String(lo); }
      else { hi = Math.min(P_MAX, lo + PASO_PRECIO); R.pmax.value = String(hi); }
    }
    estado.pmin = lo <= P_MIN ? null : lo;
    estado.pmax = hi >= P_MAX ? null : hi;
    pintarRango();
    if (rafPrecio) return;
    var programar = root.requestAnimationFrame || function (f) { return root.setTimeout(f, 16); };
    rafPrecio = programar(function () {
      rafPrecio = 0;
      var lista = ordenar(filtrar(estado));
      var activos = listaActivos();
      var fichas = pintarResultados(lista, false);
      pintarConteos(lista.length, fichas, activos);
      pintarChips(activos);
      pintarVacio(lista.length, activos);
      pintarFacetas();
    });
  }

  function alClicPagina(ev) {
    var t = ev.target && ev.target.closest ? ev.target : null;
    if (!t) return;

    var quitarBtn = t.closest('[data-quitar]');
    if (quitarBtn) {
      var activos = listaActivos();
      var a = activos[Number(quitarBtn.getAttribute('data-quitar'))];
      if (a) {
        var enVacio = !!quitarBtn.closest('[data-inv-vacio]');
        a.quitar(estado);
        aplicar({ filtro: a.clave, valor: 'quitar' + (a.valor ? ':' + a.valor : '') });
        if (!enVacio && R.chips) {
          var siguiente = R.chips.querySelector('button') || R.abrir || R.form;
          if (siguiente && siguiente.offsetParent !== null) siguiente.focus();
          else if (R.cabeza) { R.cabeza.setAttribute('tabindex', '-1'); R.cabeza.focus({ preventScroll: true }); }
        } else if (R.cabeza) {
          R.cabeza.setAttribute('tabindex', '-1');
          irAResultados(R.cabeza);
        }
      }
      return;
    }

    if (t.closest('[data-inv-mas-boton]')) { verMas(); return; }

    var limpiar = t.closest('[data-inv-limpiar]');
    if (limpiar) {
      // Limpiar quita filtros; la vista, el orden y la agrupación son preferencias y se quedan.
      var vista = estado.vista;
      var orden = estado.orden;
      var agrupa = estado.agrupar;
      estado = estadoVacio();
      estado.vista = vista;
      estado.orden = orden;
      estado.agrupar = agrupa;
      aplicar({ filtro: 'limpiar', valor: 'todo' });
      if (limpiar.closest('[data-inv-vacio]') && R.cabeza) { R.cabeza.setAttribute('tabindex', '-1'); irAResultados(R.cabeza); }
      return;
    }

    var seg = t.closest('[data-inv-agrupar] button[data-valor], [data-inv-vista] button[data-valor]');
    if (seg && !seg.disabled) {
      var esVista = !!seg.closest('[data-inv-vista]');
      var valor = seg.getAttribute('data-valor');
      if (esVista) { if (estado.vista === valor) return; estado.vista = valor; }
      else { if (estado.agrupar === valor) return; estado.agrupar = valor; }
      aplicar({ filtro: esVista ? 'vista' : 'agrupar', valor: valor });
      return;
    }

    var app = t.closest('[data-app]');
    if (app) {
      var ap = aplicacion(app.getAttribute('data-app'));
      if (!ap) return;
      var activa = aplicacionActiva(estado, ap);
      if (activa) quitarAplicacion(estado, ap); else ponerAplicacion(estado, ap);
      aplicar({ filtro: 'aplicacion', valor: activa ? 'quitar:' + ap.id : ap.id });
      return;
    }

    var plaza = t.closest('[data-plaza]');
    if (plaza) {
      var id = plaza.getAttribute('data-plaza');
      var sola = estado.sucursal.length === 1 && estado.sucursal[0] === id;
      estado.sucursal = sola ? [] : [id];
      estado.lote = sola ? estado.lote : null;
      aplicar({ filtro: 'sucursal', valor: sola ? 'quitar:' + id : id });
      if (!sola) irAResultados();
      return;
    }

    var verLote = t.closest('a[href^="inventario.html?lote="]');
    if (verLote && R.resultados && R.resultados.contains(verLote)) {
      ev.preventDefault();
      var loteId = '';
      try { loteId = decodeURIComponent(verLote.getAttribute('href').split('lote=')[1] || ''); } catch (e) { loteId = ''; }
      if (!loteId || !G.lote(loteId)) return;
      var previo = estado;
      estado = estadoVacio();
      estado.vista = previo.vista;
      estado.orden = previo.orden;
      estado.agrupar = previo.agrupar;
      estado.lote = loteId;
      aplicar({ filtro: 'lote', valor: loteId });
      irAResultados(R.aviso);
      return;
    }

    if (t.closest('[data-inv-quitar-lote]')) {
      estado.lote = null;
      aplicar({ filtro: 'lote', valor: 'quitar' });
      if (R.cabeza) { R.cabeza.setAttribute('tabindex', '-1'); R.cabeza.focus({ preventScroll: true }); }
    }
  }

  function alCambiarOrden() {
    estado.orden = R.orden.value;
    aplicar({ filtro: 'orden', valor: estado.orden });
  }

  // ---------------------------------------------------------------------------
  // Hoja inferior de filtros (celular y tableta)
  // ---------------------------------------------------------------------------
  var mqLateral = root.matchMedia ? root.matchMedia(MQ_LATERAL) : null;

  function hojaAbierta() { return !!(R.hoja && (R.hoja.open || R.hoja.hasAttribute('open'))); }

  function abrirHoja() {
    if (!R.hoja || !R.hojaCuerpo || !R.form) return;
    R.hojaCuerpo.appendChild(R.form);
    doc.body.classList.add('con-dialogo');
    if (R.abrir) R.abrir.setAttribute('aria-expanded', 'true');
    if (typeof R.hoja.showModal === 'function') {
      if (!R.hoja.open) R.hoja.showModal();
    } else {
      R.hoja.setAttribute('open', '');
      doc.body.classList.add('sin-scroll');
    }
    var cerrar = G.qs('[data-inv-cerrar]', R.hoja);
    if (cerrar) cerrar.focus();
  }

  function cerrarHoja() {
    if (!R.hoja) return;
    if (typeof R.hoja.close === 'function' && R.hoja.open) R.hoja.close();
    else if (R.hoja.hasAttribute('open')) { R.hoja.removeAttribute('open'); alCerrarHoja(); }
  }

  function alCerrarHoja() {
    if (R.ancla && R.form && R.form.parentNode !== R.ancla) R.ancla.appendChild(R.form);
    doc.body.classList.remove('con-dialogo');
    doc.body.classList.remove('sin-scroll');
    if (R.abrir) {
      R.abrir.setAttribute('aria-expanded', 'false');
      if (R.abrir.offsetParent !== null) { try { R.abrir.focus({ preventScroll: true }); } catch (e) { R.abrir.focus(); } }
    }
  }

  function prepararHoja() {
    if (!R.hoja) return;
    if (R.abrir) {
      R.abrir.setAttribute('aria-expanded', 'false');
      R.abrir.addEventListener('click', abrirHoja);
    }
    R.hoja.addEventListener('close', alCerrarHoja);
    R.hoja.addEventListener('keydown', function (ev) {
      // La tecla P del modo presentación no debe activarse detrás de la hoja abierta:
      // el atajo lo escucha el documento, así que aquí se detiene su propagación.
      if ((ev.key === 'p' || ev.key === 'P') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.stopPropagation(); return; }
      if (ev.key === 'Escape' && typeof R.hoja.showModal !== 'function') { ev.preventDefault(); cerrarHoja(); }
    });
    R.hoja.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-inv-cerrar]')) { cerrarHoja(); return; }
      if (ev.target.closest('[data-inv-ver]')) {
        cerrarHoja();
        irAResultados();
        return;
      }
      if (ev.target === R.hoja) {
        var r = R.hoja.getBoundingClientRect();
        if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) cerrarHoja();
      }
    });
    if (mqLateral) {
      var alCambiarMq = function () { if (mqLateral.matches && hojaAbierta()) cerrarHoja(); };
      if (mqLateral.addEventListener) mqLateral.addEventListener('change', alCambiarMq);
      else if (mqLateral.addListener) mqLateral.addListener(alCambiarMq);
    }
  }

  // ---------------------------------------------------------------------------
  // Anexo verificable y datos del modo P
  // ---------------------------------------------------------------------------
  var ESTADO_FOTO = {
    lote: { texto: 'Foto del lote', clase: 'lote' },
    representativa: { texto: 'Foto del modelo', clase: 'modelo' },
    propia: { texto: 'Foto propia', clase: 'propia' },
    dibujo: { texto: 'En proceso', clase: 'proceso' }
  };

  function tipoFoto(u) {
    var f = T && typeof T.foto === 'function' ? T.foto(u) : null;
    return f && ESTADO_FOTO[f.tipo] ? f.tipo : 'dibujo';
  }

  /*
   * Roles ARIA explícitos: en celular las tablas del anexo se acomodan como bloques
   * (display: grid en cada renglón) y algunos lectores de pantalla pierden la
   * semántica de tabla al cambiar el display. Con los roles la conservan.
   */
  function fijarRoles(tabla) {
    if (!tabla) return;
    tabla.setAttribute('role', 'table');
    G.qsa('thead, tbody, tfoot', tabla).forEach(function (g) { g.setAttribute('role', 'rowgroup'); });
    G.qsa('tr', tabla).forEach(function (tr) { tr.setAttribute('role', 'row'); });
    G.qsa('th', tabla).forEach(function (th) {
      var sc = th.getAttribute('scope');
      th.setAttribute('role', sc === 'col' ? 'columnheader' : 'rowheader');
    });
    G.qsa('td', tabla).forEach(function (td) { td.setAttribute('role', 'cell'); });
  }

  function construirAnexo() {
    var tbodyBase = G.qs('[data-inv-anexo-filas]');
    if (!tbodyBase) return;
    var tabla = tbodyBase.closest('table');
    // Idempotente: si el HTML ya trae renglones (p. ej. estampados en el build), se rehacen.
    G.qsa('tbody', tabla).forEach(function (tb) { if (tb !== tbodyBase) tb.parentNode.removeChild(tb); });
    var mapa = CONTEOS.por_sucursal || {};
    var plazas = OPCIONES.sucursal.map(function (o) { return o.valor; })
      .sort(function (a, b) { return (mapa[b] || 0) - (mapa[a] || 0); });
    var primero = true;
    plazas.forEach(function (id) {
      var filas = TODAS.filter(function (u) { return String(u.sucursal_id) === id; }).sort(porAnioKm);
      if (!filas.length) return;
      var tb = primero ? tbodyBase : el('tbody');
      if (!primero) tabla.insertBefore(tb, tabla.tFoot || null);
      primero = false;
      tb.textContent = '';
      tb.appendChild(el('tr', { 'class': 'inv-tabla__grupo' }, [
        el('th', { scope: 'rowgroup', colspan: '7' }, [
          el('span', { text: nombreSucursal(id) }),
          el('span', { 'class': 'inv-tabla__grupo-n', text: filas.length + ' ' + unidadesTexto(filas.length) })
        ])
      ]));
      filas.forEach(function (u) {
        var tf = ESTADO_FOTO[tipoFoto(u)];
        var nLote = enLote(u) ? tamLote[u.lote] : 0;
        tb.appendChild(el('tr', null, [
          el('th', { scope: 'row', 'class': 'inv-c-ref' }, [
            el('a', { 'class': 'id-mono inv-tabla__ref', href: 'unidad-' + encodeURIComponent(String(u.id)) + '.html',
              'data-event': 'ver_unidad', 'data-event-unidad-id': String(u.id), 'data-event-origen': 'inventario_anexo',
              'aria-label': 'Ficha ' + tituloFicha(u) + ', referencia ' + u.id, text: String(u.id) })
          ]),
          el('td', { 'class': 'inv-c-unidad' }, [el('span', { 'class': 'inv-tabla__marca', text: u.marca || '' }), ' ', el('span', { text: u.modelo || '' })]),
          el('td', { 'class': 'num inv-c-anio', text: String(u.anio || '—') }),
          el('td', { 'class': 'num inv-c-km', text: G.fmt.kmCorto(u.km) }),
          el('td', { 'class': 'num inv-c-precio', text: G.fmt.mxn(u.precio) }),
          // Etiqueta humana («De 10»); el id del lote queda en mono pequeño, solo aquí.
          el('td', { 'class': 'inv-c-lote' }, nLote ? [
            el('span', { 'class': 'inv-tabla__lote-n', text: 'De ' + nLote }),
            el('span', { 'class': 'id-mono inv-tabla__lote', text: u.lote })
          ] : '—'),
          el('td', { 'class': 'inv-c-foto' }, [el('span', { 'class': 'inv-foto inv-foto--' + tf.clase, text: tf.texto })])
        ]));
      });
    });
    fijarRoles(tabla);

    construirResumen(plazas);

    var resumen = G.qs('[data-inv-anexo-resumen]');
    if (resumen) {
      resumen.textContent = '';
      var nPlazas = plazas.filter(function (id) { return (mapa[id] || 0) > 0; }).length;
      resumen.appendChild(el('b', { text: G.fmt.numero(TOTAL) + ' ' + unidadesTexto(TOTAL) }));
      resumen.appendChild(doc.createTextNode(' en ' + nPlazas + ' ' + plural(nPlazas, 'plaza', 'plazas') + ' · ' +
        plazas.filter(function (id) { return (mapa[id] || 0) > 0; }).map(function (id) { return nombreSucursal(id) + ' ' + mapa[id]; }).join(' · ')));
      var conFoto = TODAS.filter(function (u) { return tipoFoto(u) !== 'dibujo'; }).length;
      var sinFoto = TOTAL - conFoto;
      resumen.appendChild(el('span', { 'class': 'solo-presentacion inv-anexo__fotos',
        text: ' · ' + conFoto + ' con foto representativa · ' + sinFoto + ' con fotografía en proceso' }));
    }

    var anio = G.qs('[data-inv-anio-min]');
    var anioTexto = G.qs('[data-inv-anio-texto]');
    var anioMin = num((META.regla || {}).anio_modelo_min);
    if (anio && anioMin !== null) {
      anio.textContent = String(anioMin);
      if (anioTexto) anioTexto.hidden = false;
    }

    var boton = G.qs('[data-inv-anexo-boton]');
    var cuerpo = G.qs('#inv-anexo-cuerpo');
    if (boton && cuerpo) {
      boton.addEventListener('click', function () { abrirAnexo(boton.getAttribute('aria-expanded') !== 'true'); });
    }

    var cert = G.qs('[data-inv-certificacion]');
    if (cert) {
      var mc = CONTEOS.en_certificacion_por_sucursal || {};
      Object.keys(mc).filter(function (id) { return mc[id] > 0; })
        .sort(function (a, b) { return mc[b] - mc[a]; })
        .forEach(function (id) { cert.appendChild(el('li', null, [el('span', { text: nombreSucursal(id) }), el('b', { text: G.fmt.numero(mc[id]) })])); });
    }

    var bajas = Array.isArray(META.bajas_desde_corte_anterior) ? META.bajas_desde_corte_anterior : [];
    var nBajas = G.qs('[data-inv-bajas-n]');
    if (nBajas) nBajas.textContent = G.fmt.numero(bajas.length);
    var listaBajas = G.qs('[data-inv-bajas]');
    if (listaBajas) {
      bajas.forEach(function (b) {
        listaBajas.appendChild(el('li', null, [el('span', { 'class': 'id-mono', text: 'Ref. ' + b.id }), el('b', { text: b.categoria || 'Baja' })]));
      });
    }

    var prop = G.qs('[data-inv-proporcion]');
    var goOn = num(CONTEOS.go_on);
    var red = num(CONTEOS.red);
    if (prop) {
      if (goOn !== null && red) prop.style.width = (Math.min(1, goOn / red) * 100).toFixed(2) + '%';
      else { var barra = prop.parentNode; if (barra) barra.hidden = true; }
    }
  }

  function rango(lista, clave, fmt) {
    var v = lista.map(function (u) { return num(u[clave]); }).filter(function (x) { return x !== null; });
    if (!v.length) return '—';
    var a = Math.min.apply(null, v);
    var b = Math.max.apply(null, v);
    if (clave === 'km' && T && T.rangoKm) return T.rangoKm(a, b);
    return a === b ? fmt(a) : fmt(a) + '–' + fmt(b);
  }

  // data-etiqueta: en celular cada renglón se apila y la celda muestra su rótulo.
  function filaResumen(etiqueta, lista) {
    var n = lista.length;
    return el('tr', null, [
      el('th', { scope: 'row', 'class': 'inv-c-plaza' }, etiqueta),
      el('td', { 'class': 'num inv-c-n', 'data-etiqueta': unidadesTexto(n) }, G.fmt.numero(n)),
      el('td', { 'class': 'num inv-c-anio', 'data-etiqueta': 'Año' }, rango(lista, 'anio', String)),
      el('td', { 'class': 'num inv-c-km' }, rango(lista, 'km')),
      el('td', { 'class': 'num inv-c-precio', 'data-etiqueta': 'Precio' }, rango(lista, 'precio', G.fmt.mxn))
    ]);
  }

  function construirResumen(plazas) {
    var cuerpo = G.qs('[data-inv-resumen-filas]');
    var pie = G.qs('[data-inv-resumen-total]');
    if (!cuerpo) return;
    cuerpo.textContent = '';
    plazas.forEach(function (id) {
      var lista = TODAS.filter(function (u) { return String(u.sucursal_id) === id; });
      if (lista.length) cuerpo.appendChild(filaResumen(nombreSucursal(id), lista));
    });
    if (pie) {
      pie.textContent = '';
      pie.appendChild(filaResumen('Total del corte', TODAS));
    }
    fijarRoles(cuerpo.closest('table'));
  }

  function abrirAnexo(abrir) {
    var boton = G.qs('[data-inv-anexo-boton]');
    var cuerpo = G.qs('#inv-anexo-cuerpo');
    if (!boton || !cuerpo) return;
    boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    cuerpo.hidden = !abrir;
    var accion = boton.querySelector('[data-inv-anexo-accion]');
    if (accion) accion.textContent = abrir ? 'Ocultar' : 'Ver';
  }

  // ---------------------------------------------------------------------------
  // Impresión / PDF: todas las fichas y la tabla abierta; después se restaura la tabla.
  // ---------------------------------------------------------------------------
  function prepararImpresion() {
    var anexoAntes = null;
    root.addEventListener('beforeprint', function () {
      var cuerpo = G.qs('#inv-anexo-cuerpo');
      anexoAntes = cuerpo ? !cuerpo.hidden : null;
      abrirAnexo(true);
      if (R.resultados) R.resultados.classList.remove('inv-resultados--entra');
      if (pagina.mostradas < pagina.items.length) agregarFichas(pagina.items.length);
    });
    root.addEventListener('afterprint', function () {
      if (anexoAntes === null) return;
      abrirAnexo(anexoAntes);
      anexoAntes = null;
    });
  }

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  G.listo(function () {
    tomarDOM();
    if (!R.form || !R.resultados) return;
    if (!T || typeof T.render !== 'function') {
      var cargando = G.qs('[data-inv-cargando]');
      if (cargando) cargando.textContent = 'No se pudo mostrar el catálogo.';
      return;
    }
    // Los contadores del catálogo nacen con el total del corte (data-conteo: comun.js y,
    // sin JS, el build). Desde aquí los lleva la página: muestran el conteo filtrado.
    [R.n, R.nBarra].forEach(function (n) { if (n) n.removeAttribute('data-conteo'); });

    // Peldaño de la opción de valor: si su detalle ya está confirmado, sobra el respaldo.
    var respaldo = G.qs('[data-inv-selectrucks-respaldo]');
    var detalleSel = G.dato('escalera.selectrucks.detalle');
    if (respaldo && typeof detalleSel === 'string' && detalleSel && !G.porConfirmar('escalera.selectrucks.detalle')) respaldo.hidden = true;

    construirControles();
    construirAnexo();
    estado = leerURL();
    aplicar(null);

    R.form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    R.form.addEventListener('change', alCambiarForm);
    R.form.addEventListener('input', alMoverPrecio);
    if (R.orden) R.orden.addEventListener('change', alCambiarOrden);
    doc.addEventListener('click', alClicPagina);
    prepararHoja();
    prepararImpresion();
  });
})(window);
