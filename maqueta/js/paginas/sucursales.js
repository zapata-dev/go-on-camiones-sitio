/*!
 * Go On Camiones — sucursales.js (página «Sucursales»)
 * Script clásico (IIFE), sin red. Depende de nucleo.js, comun.js y de
 * assets/mapa/mexico-estados.js (window.MX_ESTADOS), que SOLO enlaza esta página.
 *
 * Qué pinta:
 *   - Mapa SVG offline de la región con presencia: estados con sucursal resaltados,
 *     un botón por sucursal (disco naranja con el número de unidades Go On al corte,
 *     de área proporcional; anillo si no tiene), etiquetas sin encimarse, guía al
 *     punto real si el marcador tuvo que moverse, recuadro de ubicación en el país,
 *     retícula geográfica y escala gráfica.
 *   - Directorio de las sucursales en dos grupos (con unidades Go On / resto de la red).
 *   - Selección sincronizada mapa <-> tarjeta (botón del mapa, «Ver en el mapa»,
 *     ?sucursal=<id> en la URL) con globo informativo y anuncio para lector de pantalla.
 *     Los marcadores siguen el orden del directorio (más unidades primero) y el globo
 *     se inserta en el DOM justo después del marcador activo (orden de tabulación).
 *   - Etiquetas: primero pegadas al marcador (en mapas angostos, arriba/abajo antes
 *     que en diagonal); si no caben, en un segundo y tercer anillo y, como último
 *     recurso, en el hueco libre más cercano (≤ 150 px). Toda etiqueta que no queda
 *     pegada lleva una guía corta a su marcador; solo se oculta si no hay hueco.
 *   - Horario general de la red (el horario confirmado más común) en «Antes de ir».
 *   - Leyenda: en público, cuántas sucursales caben en el mapa si falta alguna; en
 *     modo P, qué significa el contorno punteado (ubicación por confirmar).
 *
 * Proyección (documentada): los trazos de MX_ESTADOS (viewBox 0 0 800 460) son una
 * equirrectangular simple (placa carrée, sin corrección por coseno). Se ajustó por
 * mínimos cuadrados contra los extremos de Baja California, Quintana Roo, Chiapas,
 * Nuevo León, Jalisco, Guanajuato, Querétaro y la Ciudad de México:
 *     x = 25.1703 · lng + 2981.565        y = −25.2104 · lat + 825.774
 * Residuo máximo ≈ 1.2 unidades del viewBox (≈ 5 km): a esta escala un punto
 * ubica la ciudad, no la calle. La escala gráfica se calibra a 21° N.
 *
 * Reglas de datos:
 *   - Conteos desde GOON_CATALOGO.meta.conteos (data-conteo, los pinta comun.js).
 *   - Campo en sucursal.por_confirmar -> no se muestra fuera del modo P (en modo P
 *     aparece con contorno punteado y la marca «por confirmar»).
 *   - Coordenada por confirmar: si la ciudad está confirmada el punto se dibuja (a
 *     esta escala ubica la ciudad) y en modo P se marca «ubicación aproximada»; si
 *     tampoco la ciudad está confirmada, el punto solo aparece en modo P.
 *   - Teléfono solo si está confirmado. El centro SAP solo en modo P.
 *   - «Preguntar en …» y «Déjanos tus datos» por sucursal solo si la venta de
 *     camiones seminuevos está confirmada; si no, solo aparecen en modo P.
 *   - WhatsApp de una tarjeta: data-wa + data-wa-sucursal="<id>". En modo demo el
 *     mensaje nombra la sucursal (whatsapp.mensaje_sucursal de hechos si existe; si
 *     no, MENSAJE_SUCURSAL): un escucha en captura lo pone en el detalle de
 *     «goon:wa-demo» antes de que presentacion.js lo lea, así la burbuja y el texto
 *     copiado coinciden. Después se precisan sucursal, centro SAP y nota del ruteo.
 *     Centro por confirmar: «Se asigna con la sucursal» (público) o «Por confirmar»
 *     con contorno (modo P); nunca «Por asignar».
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;

  var NS = 'http://www.w3.org/2000/svg';
  var NBSP = ' ';
  var PROY = { ax: 25.1703, bx: 2981.565, ay: -25.2104, by: 825.774 };
  var KM_POR_UNIDAD = 4.129; // a 21° N: (1 / 25.1703)° · 111.32 km · cos 21°
  var VB = { x: 305, y: 111, w: 254, h: 272 }; // recorte: estados con presencia + margen
  var TACTIL = 44;    // objetivo táctil mínimo de cada marcador
  var SEPARA = 6;     // aire mínimo entre marcadores vecinos
  var BORDE = 24;     // margen de los marcadores dentro del mapa
  var ESCRITORIO = 1100;

  var CAMPOS = {
    ciudad: 'ciudad', direccion: 'dirección', cp: 'código postal', telefono: 'teléfono',
    horario: 'horario', maps_url: 'enlace de Maps', lat: 'ubicación', lng: 'ubicación',
    centro_sap: 'centro SAP', vende_camiones_seminuevos: 'venta de camiones seminuevos'
  };
  var DIAS_CORTOS = { 'lunes a viernes': 'Lun a vie', 'sábado': 'Sáb', 'domingo': 'Dom' };
  // Respaldo si hechos aún no trae whatsapp.mensaje_sucursal (se pidió en hechos_canonicos.json).
  var MENSAJE_SUCURSAL = 'Hola, me interesa conocer el inventario de camiones seminuevos de Go On en la sucursal {sucursal}. ¿Me pueden dar más información?';

  var SUC = Array.isArray(root.GOON_SUCURSALES) ? root.GOON_SUCURSALES : [];
  var CAT = root.GOON_CATALOGO || {};
  var CONTEOS = (CAT.meta && CAT.meta.conteos) || {};
  var POR_SUC = CONTEOS.por_sucursal || {};

  var items = [];
  var porId = {};
  var caja = null;
  var capaPines = null;
  var gGuias = null;
  var gRet = null;
  var globo = null;
  var anuncio = null;
  var actual = null;
  var escala = null;

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function el(tag, attrs, hijos) {
    var n = doc.createElement(tag);
    poner(n, attrs);
    agregar(n, hijos);
    return n;
  }

  function sv(tag, attrs) {
    var n = doc.createElementNS(NS, tag);
    poner(n, attrs);
    return n;
  }

  function poner(n, attrs) {
    for (var k in (attrs || {})) {
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
    [].concat(hijos || []).forEach(function (h) {
      if (h === null || h === undefined || h === false) return;
      n.appendChild(typeof h === 'string' ? doc.createTextNode(h) : h);
    });
    return n;
  }

  function icono(id, clase) {
    var s = sv('svg', { 'class': clase || 'icono', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(sv('use', { href: '#' + id }));
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

  function presentacion() {
    return doc.documentElement.classList.contains('modo-presentacion');
  }

  function unidadesTexto(n) {
    return (n === 1 ? 'unidad Go' : 'unidades Go') + NBSP + 'On';
  }

  // «Zapopan, Jalisco». Sin repetir: si el estado se llama igual que la sucursal y
  // no hay otra ciudad confirmada (Querétaro), no hay sobretítulo.
  function lugar(s) {
    var partes = [];
    if (tiene(s, 'ciudad') && confirmado(s, 'ciudad') && s.ciudad !== s.nombre) partes.push(s.ciudad);
    if (tiene(s, 'estado') && (partes.length || s.estado !== s.nombre)) partes.push(s.estado);
    return partes.join(', ');
  }

  // ¿Se le puede ofrecer al público contacto directo con esta sucursal?
  function vende(s) {
    return !!s && s.vende_camiones_seminuevos === true && confirmado(s, 'vende_camiones_seminuevos');
  }

  function mensajeSucursal(s) {
    var plantilla = null;
    try { plantilla = typeof G.dato === 'function' ? G.dato('whatsapp.mensaje_sucursal') : null; } catch (e) { plantilla = null; }
    if (plantilla && typeof plantilla === 'object' && typeof plantilla.valor === 'string') plantilla = plantilla.valor;
    if (typeof plantilla !== 'string' || !plantilla) plantilla = MENSAJE_SUCURSAL;
    return plantilla.replace(/\{sucursal\}/g, s.nombre);
  }

  // «Lunes a viernes: 9:00 a 18:30 · Sábado: …» -> [[día, horas], …]
  function partirHorario(texto) {
    return String(texto || '').split(/\s*·\s*/).map(function (t) {
      var i = t.indexOf(':');
      if (i === -1) return [t.trim(), ''];
      return [t.slice(0, i).trim(), t.slice(i + 1).trim()];
    }).filter(function (p) { return p[0]; });
  }

  function mayuscula(t) {
    t = String(t || '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

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

  // Horario completo (panel «Antes de ir»): <dl> con día y horas.
  function pintarHorario(dl, texto) {
    partirHorario(texto).forEach(function (par) {
      var cerrado = /cerrad/i.test(par[1]);
      dl.appendChild(el('div', { 'class': cerrado ? 'es-cerrado' : null }, [
        el('dt', { text: par[0] }),
        el('dd', { text: mayuscula(par[1]) })
      ]));
    });
    return dl;
  }

  // Horario compacto (tarjeta): tres celdas «Lun a vie / 9:00–18:30».
  function horarioCompacto(texto) {
    var ul = el('ul', { 'class': 'suc-dias' });
    partirHorario(texto).forEach(function (par) {
      var cerrado = /cerrad/i.test(par[1]);
      var dia = DIAS_CORTOS[par[0].toLowerCase()] || par[0];
      var horas = mayuscula(par[1]).replace(/\s+a\s+/, '–');
      ul.appendChild(el('li', { 'class': cerrado ? 'es-cerrado' : null }, [
        el('span', { 'class': 'suc-dias__dia', text: dia }),
        el('span', { 'class': 'suc-dias__horas', text: horas })
      ]));
    });
    return ul;
  }

  // ---------------------------------------------------------------------------
  // Modelo
  // ---------------------------------------------------------------------------
  function prepararItems() {
    SUC.forEach(function (s, i) {
      if (!s || !s.id) return;
      var n = typeof POR_SUC[s.id] === 'number' ? POR_SUC[s.id] : 0;
      var coordOk = typeof s.lat === 'number' && typeof s.lng === 'number';
      var coordConfirmada = coordOk && confirmado(s, 'lat') && confirmado(s, 'lng');
      var ciudadConfirmada = tiene(s, 'ciudad') && confirmado(s, 'ciudad');
      var trazo = !coordOk ? 'no' : (coordConfirmada ? 'exacta' : (ciudadConfirmada ? 'ciudad' : 'p'));
      var p = coordOk ? { x: PROY.ax * s.lng + PROY.bx, y: PROY.ay * s.lat + PROY.by } : null;
      // Disco de área proporcional a las unidades (1 -> 36 px, 12 -> 51 px, 20 -> 57 px).
      var d = n > 0 ? Math.round(30 + 6 * Math.sqrt(n)) : 16;
      var it = { s: s, id: s.id, n: n, orden: i, trazo: trazo, p: p, d: d, r: d / 2, medio: Math.max(TACTIL, d) / 2 };
      items.push(it);
      porId[s.id] = it;
    });
  }

  // ---------------------------------------------------------------------------
  // Mapa
  // ---------------------------------------------------------------------------
  function estadosConPresencia() {
    var set = {};
    SUC.forEach(function (s) { if (s && s.estado) set[s.estado] = true; });
    return set;
  }

  function ordenDirectorio(a, b) {
    return (b.n - a.n) || a.s.nombre.localeCompare(b.s.nombre, 'es');
  }

  function construirMapa() {
    var MX = root.MX_ESTADOS;
    caja = G.qs('[data-js-mapa-caja]');
    if (!caja || !MX || !MX.paths) return false;
    caja.style.setProperty('--suc-aspecto', VB.w + ' / ' + VB.h);

    var presencia = estadosConPresencia();
    var svg = sv('svg', {
      'class': 'suc-mapa__svg', viewBox: VB.x + ' ' + VB.y + ' ' + VB.w + ' ' + VB.h,
      preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false'
    });

    // Retícula geográfica (cada 2°), decorativa
    gRet = sv('g', { 'class': 'suc-mapa__grad' });
    [20, 22, 24, 26].forEach(function (lat) {
      var y = PROY.ay * lat + PROY.by;
      gRet.appendChild(sv('line', { x1: VB.x, x2: VB.x + VB.w, y1: y, y2: y }));
      var t = sv('text', { x: VB.x + 3, y: y - 2, 'class': 'suc-mapa__grad-texto' });
      t.textContent = lat + '° N';
      gRet.appendChild(t);
    });
    [-104, -102, -100, -98].forEach(function (lng) {
      var x = PROY.ax * lng + PROY.bx;
      gRet.appendChild(sv('line', { x1: x, x2: x, y1: VB.y, y2: VB.y + VB.h }));
      var t = sv('text', { x: x + 2, y: VB.y + VB.h - 4, 'class': 'suc-mapa__grad-texto' });
      t.textContent = Math.abs(lng) + '° O';
      gRet.appendChild(t);
    });
    svg.appendChild(gRet);

    var gEstados = sv('g', { 'class': 'suc-mapa__estados' });
    Object.keys(MX.paths).forEach(function (k) {
      var nombre = MX.names ? MX.names[k] : '';
      gEstados.appendChild(sv('path', {
        d: MX.paths[k], 'class': presencia[nombre] ? 'es-presencia' : null, 'data-estado': nombre
      }));
    });
    svg.appendChild(gEstados);

    gGuias = sv('g', { 'class': 'suc-mapa__guias' });
    svg.appendChild(gGuias);
    caja.appendChild(svg);

    // Recuadro: ubicación del recorte en el país
    var inset = sv('svg', { 'class': 'suc-mapa__inset', viewBox: MX.viewBox || '0 0 800 460', 'aria-hidden': 'true', focusable: 'false' });
    var todo = Object.keys(MX.paths).map(function (k) { return MX.paths[k]; }).join(' ');
    inset.appendChild(sv('path', { d: todo, 'class': 'suc-mapa__inset-pais' }));
    inset.appendChild(sv('rect', { x: VB.x, y: VB.y, width: VB.w, height: VB.h, 'class': 'suc-mapa__inset-marco' }));
    caja.appendChild(el('div', { 'class': 'suc-mapa__recuadro', 'aria-hidden': 'true' }, [
      inset, el('span', { 'class': 'suc-mapa__recuadro-texto', text: 'México' })
    ]));

    capaPines = el('div', { 'class': 'suc-mapa__pines' });
    // Mismo orden que el directorio: más unidades primero, luego por nombre.
    items.slice().sort(ordenDirectorio).forEach(function (it) {
      if (!it.p) return;
      var s = it.s;
      var etiquetaAria = s.nombre + (lugar(s) ? ', ' + lugar(s) : '') + ': ' +
        (it.n > 0 ? it.n + ' ' + unidadesTexto(it.n).replace(NBSP, ' ') : 'sin unidades Go On en este corte');
      var marca = el('span', { 'class': 'suc-pin__marca' });
      marca.style.setProperty('--d', it.d + 'px');
      if (it.n > 0) {
        marca.appendChild(el('span', { 'class': 'suc-pin__cifra', 'data-conteo': 'por_sucursal.' + s.id, text: String(it.n) }));
      }
      var etiqueta = el('span', { 'class': 'suc-pin__nombre', 'aria-hidden': 'true', text: s.nombre });
      var btn = el('button', {
        type: 'button',
        'class': 'suc-pin' + (it.n > 0 ? ' suc-pin--con' : ' suc-pin--sin') +
          (it.trazo === 'ciudad' ? ' es-aprox' : '') + (it.trazo === 'p' ? ' es-aprox solo-presentacion' : ''),
        'aria-expanded': 'false', 'aria-controls': 'suc-globo', 'aria-label': etiquetaAria, 'data-suc': s.id,
        title: it.trazo === 'exacta' || !presentacion() ? null : 'Ubicación aproximada: coordenada por confirmar'
      }, [marca, etiqueta]);
      btn.style.setProperty('--lado', (2 * it.medio) + 'px');
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        seleccionar(it.id === actual ? null : it.id, { origen: 'mapa' });
      });
      it.btn = btn;
      it.marca = marca;
      it.etiqueta = etiqueta;
      capaPines.appendChild(btn);
    });
    caja.appendChild(capaPines);

    // El globo vive en la capa de marcadores (misma caja de coordenadas que el mapa)
    // y se mueve justo después del marcador activo: Tab va del marcador a su globo.
    globo = el('div', { 'class': 'suc-globo', id: 'suc-globo', hidden: true, 'data-js-globo': '' });
    capaPines.appendChild(globo);

    caja.addEventListener('click', function (ev) {
      if (ev.target === caja || (ev.target.closest && ev.target.closest('.suc-mapa__svg'))) seleccionar(null, { origen: 'mapa' });
    });
    caja.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !actual) return;
      var it = porId[actual];
      ev.preventDefault();
      seleccionar(null, { origen: 'mapa' });
      if (it && it.btn) it.btn.focus();
    });

    escala = G.qs('[data-js-escala]');
    return true;
  }

  function visible(it) {
    if (!it.p || !it.btn) return false;
    return it.trazo !== 'p' || presentacion();
  }

  // Coloca marcadores (sin encimarse), guías y etiquetas.
  function acomodar() {
    if (!caja || !capaPines) return;
    var w = caja.clientWidth;
    var h = caja.clientHeight;
    if (!w || !h) return;
    var sx = w / VB.w;
    var sy = h / VB.h;
    var lista = items.filter(visible);

    // Texto de la retícula: ~12 px en pantalla, sea cual sea la escala.
    if (gRet) gRet.style.fontSize = (12 / sx).toFixed(2) + 'px';

    // En mapas angostos (celular) los discos se encogen un poco; el objetivo táctil no.
    var k = Math.max(0.78, Math.min(1, w / 560));
    lista.forEach(function (it) {
      var d = it.n > 0 ? Math.round(it.d * k) : it.d;
      it.r = d / 2;
      it.medio = Math.max(TACTIL, d) / 2;
      if (it.marca) it.marca.style.setProperty('--d', d + 'px');
      if (it.btn) it.btn.style.setProperty('--lado', (2 * it.medio) + 'px');
    });

    lista.forEach(function (it) {
      it.tx = (it.p.x - VB.x) * sx;
      it.ty = (it.p.y - VB.y) * sy;
      it.px = it.tx;
      it.py = it.ty;
    });

    // Relajación: empuja en pares hasta que ningún par de marcadores se toque.
    for (var vuelta = 0; vuelta < 160; vuelta++) {
      var movio = false;
      for (var i = 0; i < lista.length; i++) {
        for (var j = i + 1; j < lista.length; j++) {
          var a = lista[i];
          var b = lista[j];
          var dx = b.px - a.px;
          var dy = b.py - a.py;
          var d = Math.sqrt(dx * dx + dy * dy);
          var minimo = a.medio + b.medio + SEPARA;
          if (d >= minimo - 0.25) continue;
          if (d < 0.01) {
            var ang = (i + j) * 2.39996;
            dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
          }
          var empuje = (minimo - d) / 2;
          a.px -= dx / d * empuje; a.py -= dy / d * empuje;
          b.px += dx / d * empuje; b.py += dy / d * empuje;
          movio = true;
        }
      }
      lista.forEach(function (it) {
        var m = Math.max(BORDE, it.medio + 4);
        it.px = Math.max(m, Math.min(w - m, it.px));
        it.py = Math.max(m, Math.min(h - m, it.py));
      });
      if (!movio) break;
    }

    // Guías al punto real (en unidades del viewBox) y marcadores
    while (gGuias.firstChild) gGuias.removeChild(gGuias.firstChild);
    lista.forEach(function (it) {
      it.btn.style.left = (it.px - it.medio).toFixed(1) + 'px';
      it.btn.style.top = (it.py - it.medio).toFixed(1) + 'px';
      var mov = Math.sqrt(Math.pow(it.px - it.tx, 2) + Math.pow(it.py - it.ty, 2));
      if (mov > 3) {
        gGuias.appendChild(sv('line', {
          x1: it.p.x, y1: it.p.y, x2: VB.x + it.px / sx, y2: VB.y + it.py / sy,
          'class': 'suc-mapa__guia' + (it.n > 0 ? ' suc-mapa__guia--con' : ''), 'data-suc': it.id
        }));
      }
      gGuias.appendChild(sv('circle', {
        cx: it.p.x, cy: it.p.y, r: (2.2 / sx).toFixed(3),
        'class': 'suc-mapa__punto' + (it.n > 0 ? ' suc-mapa__punto--con' : ''), 'data-suc': it.id
      }));
    });

    colocarEtiquetas(lista, w, h, sx, sy);
    if (escala) {
      var barra = escala.querySelector('.suc-leyenda__barra');
      if (barra) barra.style.width = Math.round(100 / KM_POR_UNIDAD * sx) + 'px';
      escala.hidden = false;
    }
    colocarGlobo();
  }

  function choca(r, rects) {
    for (var i = 0; i < rects.length; i++) {
      var o = rects[i];
      if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) return true;
    }
    return false;
  }

  function candidatos(it, ew, eh, sep, angosto) {
    var dg = it.r * 0.72 + sep; // desplazamiento en diagonal
    var der = { x: it.px + it.r + sep, y: it.py - eh / 2, lado: 'der' };
    var izq = { x: it.px - it.r - sep - ew, y: it.py - eh / 2, lado: 'izq' };
    var arr = { x: it.px - ew / 2, y: it.py - it.r - sep - eh, lado: 'arr' };
    var aba = { x: it.px - ew / 2, y: it.py + it.r + sep, lado: 'aba' };
    var arrDer = { x: it.px + dg, y: it.py - dg - eh, lado: 'arr' };
    var abaDer = { x: it.px + dg, y: it.py + dg, lado: 'aba' };
    var arrIzq = { x: it.px - dg - ew, y: it.py - dg - eh, lado: 'arr' };
    var abaIzq = { x: it.px - dg - ew, y: it.py + dg, lado: 'aba' };
    // Al lado, pero con el texto un poco arriba o abajo del centro del marcador.
    var derAlto = { x: der.x, y: it.py - eh + 4, lado: 'der' };
    var derBajo = { x: der.x, y: it.py - 4, lado: 'der' };
    var izqAlto = { x: izq.x, y: it.py - eh + 4, lado: 'izq' };
    var izqBajo = { x: izq.x, y: it.py - 4, lado: 'izq' };
    var alOeste = it.px - it.tx < -2; // el marcador se corrió al oeste: la etiqueta, también
    if (angosto) {
      return alOeste
        ? [izq, der, izqAlto, izqBajo, derAlto, derBajo, arr, aba, arrIzq, abaIzq, arrDer, abaDer]
        : [der, izq, derAlto, derBajo, izqAlto, izqBajo, arr, aba, arrDer, abaDer, arrIzq, abaIzq];
    }
    return alOeste
      ? [izq, der, izqAlto, izqBajo, arrIzq, abaIzq, arr, aba, derAlto, derBajo, arrDer, abaDer]
      : [der, izq, derAlto, derBajo, arrDer, abaDer, arr, aba, izqAlto, izqBajo, arrIzq, abaIzq];
  }

  // Último recurso: el hueco libre más cercano al marcador (radio ≤ 150 px), con guía.
  function huecoCercano(it, ew, eh, w, h, otros) {
    var mejor = null;
    var dMejor = Infinity;
    for (var dy = -150; dy <= 150; dy += 6) {
      for (var dx = -150; dx <= 150; dx += 6) {
        var d = dx * dx + dy * dy;
        if (d >= dMejor || d > 150 * 150) continue;
        var c = { x: it.px + dx - ew / 2, y: it.py + dy - eh / 2 };
        if (c.x < 4 || c.y < 4 || c.x + ew > w - 4 || c.y + eh > h - 4) continue;
        var r = { x: c.x + 4, y: c.y + 2, w: ew - 8, h: eh - 4 };
        if (choca(r, otros)) continue;
        // Ni encima de su propio marcador.
        if (choca(r, [{ x: it.px - it.r - 4, y: it.py - it.r - 4, w: 2 * it.r + 8, h: 2 * it.r + 8 }])) continue;
        c.lado = dy < 0 ? 'arr' : 'aba';
        mejor = c;
        dMejor = d;
      }
    }
    return mejor;
  }

  function colocarEtiquetas(lista, w, h, sx, sy) {
    var angosto = w < 560;
    var ocupados = lista.map(function (it) {
      // El disco con unidades lleva un halo de 10 px: la etiqueta de un vecino no se le pega.
      var halo = it.n > 0 ? 8 : 4;
      return { x: it.px - it.r - halo, y: it.py - it.r - halo, w: 2 * (it.r + halo), h: 2 * (it.r + halo), id: it.id };
    });
    // El recuadro del país también es zona ocupada.
    var rec = caja.querySelector('.suc-mapa__recuadro');
    if (rec && rec.offsetWidth) ocupados.push({ x: rec.offsetLeft - 4, y: rec.offsetTop - 4, w: rec.offsetWidth + 8, h: rec.offsetHeight + 8, id: '_recuadro' });

    var orden = lista.slice().sort(function (a, b) { return (b.n - a.n) || (a.orden - b.orden); });
    orden.forEach(function (it) {
      var et = it.etiqueta;
      et.classList.remove('es-oculta');
      et.style.left = '0px';
      et.style.top = '0px';
      var ew = et.offsetWidth;
      var eh = et.offsetHeight;
      var otros = ocupados.filter(function (o) { return o.id !== it.id; });
      var elegido = null;
      // Anillo 0: pegada al marcador. Anillos 1 y 2: más lejos, con guía.
      for (var anillo = 0; anillo < 3 && !elegido; anillo++) {
        var cands = candidatos(it, ew, eh, 6 + anillo * 20, angosto);
        for (var k = 0; k < cands.length; k++) {
          var c = cands[k];
          if (c.x < 4 || c.y < 4 || c.x + ew > w - 4 || c.y + eh > h - 4) continue;
          // La etiqueta trae 4 px de relleno a los lados y 2 arriba/abajo: el texto es más chico que la caja.
          if (choca({ x: c.x + 4, y: c.y + 2, w: ew - 8, h: eh - 4 }, otros)) continue;
          elegido = c;
          break;
        }
      }
      if (!elegido) elegido = huecoCercano(it, ew, eh, w, h, otros);
      if (!elegido) {
        et.classList.add('es-oculta');
        return;
      }
      ocupados.push({ x: elegido.x + 2, y: elegido.y + 1, w: ew - 4, h: eh - 2, id: it.id + ':et' });
      et.style.left = (elegido.x - (it.px - it.medio)).toFixed(1) + 'px';
      et.style.top = (elegido.y - (it.py - it.medio)).toFixed(1) + 'px';
      et.setAttribute('data-lado', elegido.lado);

      // Guía corta etiqueta -> marcador cuando la etiqueta no quedó pegada
      // (diagonal o anillo exterior): del borde del marcador al borde del texto.
      var qx = Math.max(elegido.x + 4, Math.min(elegido.x + ew - 4, it.px));
      var qy = Math.max(elegido.y + 2, Math.min(elegido.y + eh - 2, it.py));
      var dx = qx - it.px;
      var dy = qy - it.py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist - it.r > 10.5) {
        var ux = dx / dist;
        var uy = dy / dist;
        gGuias.appendChild(sv('line', {
          x1: VB.x + (it.px + ux * (it.r + 3)) / sx, y1: VB.y + (it.py + uy * (it.r + 3)) / sy,
          x2: VB.x + (qx - ux * 2) / sx, y2: VB.y + (qy - uy * 2) / sy,
          'class': 'suc-mapa__guia suc-mapa__guia--et' + (it.id === actual ? ' es-elegido' : ''), 'data-suc': it.id
        }));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Globo (detalle de la sucursal elegida, dentro del mapa)
  // ---------------------------------------------------------------------------
  function llenarGlobo(it) {
    while (globo.firstChild) globo.removeChild(globo.firstChild);
    var s = it.s;
    var cerrar = el('button', { type: 'button', 'class': 'suc-globo__cerrar' }, [
      icono('i-cerrar'), el('span', { 'class': 'sr', text: 'Cerrar detalle de ' + s.nombre })
    ]);
    cerrar.addEventListener('click', function (ev) {
      ev.stopPropagation();
      seleccionar(null, { origen: 'mapa' });
      if (it.btn) it.btn.focus();
    });
    var cifra = it.n > 0
      ? el('p', { 'class': 'suc-globo__cifra' }, [
        el('b', { 'data-conteo': 'por_sucursal.' + s.id, text: String(it.n) }), ' ' + unidadesTexto(it.n) + ' al corte'
      ])
      : el('p', { 'class': 'suc-globo__cifra suc-globo__cifra--sin', text: 'Sin unidades Go' + NBSP + 'On en este corte' });
    var enlaces = el('p', { 'class': 'suc-globo__enlaces' });
    if (it.n > 0) {
      enlaces.appendChild(el('a', {
        href: 'inventario.html?sucursal=' + encodeURIComponent(s.id), 'class': 'suc-globo__enlace suc-globo__enlace--fuerte',
        'data-event': 'cta_ver_inventario', 'data-event-origen': 'sucursales_mapa', 'data-event-sucursal-id': s.id
      }, ['Ver las unidades', icono('i-flecha')]));
    }
    enlaces.appendChild(el('a', { href: '#suc-' + s.id, 'class': 'suc-globo__enlace' }, ['Datos de la sucursal', icono('i-abajo')]));
    if (s.vende_camiones_seminuevos !== false) {
      enlaces.appendChild(el('a', {
        href: 'contacto.html?sucursal=' + encodeURIComponent(s.id),
        'class': 'suc-globo__enlace' + (vende(s) ? '' : ' solo-presentacion es-por-confirmar'),
        'data-event': 'menu_clic', 'data-event-destino': 'contacto', 'data-event-origen': 'sucursales_mapa', 'data-event-sucursal-id': s.id
      }, ['Déjanos tus datos', icono('i-flecha')]));
    }
    agregar(globo, [
      el('div', { 'class': 'suc-globo__cabeza' }, [
        el('div', null, [
          lugar(s) && lugar(s) !== s.nombre ? el('p', { 'class': 'suc-globo__lugar', text: lugar(s) }) : null,
          el('p', { 'class': 'suc-globo__nombre', text: s.nombre })
        ]),
        cerrar
      ]),
      cifra,
      it.trazo !== 'exacta' ? el('p', { 'class': 'suc-globo__aprox solo-presentacion', text: 'Ubicación aproximada: coordenada por confirmar' }) : null,
      enlaces
    ]);
    globo.setAttribute('aria-label', 'Detalle: ' + s.nombre);
    globo.setAttribute('role', 'group');
  }

  function colocarGlobo() {
    if (!globo || globo.hidden || !actual) return;
    var it = porId[actual];
    if (!it || !visible(it)) { globo.hidden = true; return; }
    var w = caja.clientWidth;
    var h = caja.clientHeight;
    // Mapa angosto (celular): el globo se ancla arriba o abajo, a todo lo ancho,
    // en la mitad del mapa contraria al marcador, para no tapar los vecinos.
    var anclado = w < 560;
    globo.classList.toggle('es-anclado', anclado);
    if (anclado) {
      var alto = globo.offsetHeight;
      var arribaLibre = presentacion() ? 52 : 11; // en modo P arriba va el distintivo de la capa
      globo.style.left = '8px';
      globo.style.top = (it.py < h * 0.55 ? h - alto - 8 : arribaLibre).toFixed(1) + 'px';
      globo.removeAttribute('data-lado');
      return;
    }
    var gw = globo.offsetWidth;
    var gh = globo.offsetHeight;
    var x = Math.max(8, Math.min(w - gw - 8, it.px - gw / 2));
    var arriba = it.py - it.r - 14 - gh;
    var y = arriba >= 8 ? arriba : Math.min(h - gh - 8, it.py + it.r + 14);
    globo.style.left = x.toFixed(1) + 'px';
    globo.style.top = y.toFixed(1) + 'px';
    globo.setAttribute('data-lado', arriba >= 8 ? 'arr' : 'aba');
    globo.style.setProperty('--flecha-x', Math.max(14, Math.min(gw - 14, it.px - x)).toFixed(1) + 'px');
  }

  // ---------------------------------------------------------------------------
  // Selección sincronizada
  // ---------------------------------------------------------------------------
  function enVista(nodo) {
    if (!nodo || !nodo.getBoundingClientRect) return false;
    var r = nodo.getBoundingClientRect();
    var alto = root.innerHeight || doc.documentElement.clientHeight;
    return r.top >= 60 && r.bottom <= alto;
  }

  function desplazar(nodo, bloque) {
    if (!nodo) return;
    try {
      nodo.scrollIntoView({ behavior: movReducido() ? 'auto' : 'smooth', block: bloque || 'nearest' });
    } catch (e) { nodo.scrollIntoView(); }
  }

  function seleccionar(id, opciones) {
    var o = opciones || {};
    var it = id ? porId[id] : null;
    if (id && !it) return;
    actual = it ? it.id : null;

    var conGlobo = !!(it && globo && visible(it));
    items.forEach(function (x) {
      var activo = x.id === actual;
      if (x.btn) {
        x.btn.setAttribute('aria-expanded', activo && conGlobo ? 'true' : 'false');
        x.btn.classList.toggle('es-activa', activo);
      }
      if (x.tarjeta) x.tarjeta.classList.toggle('es-activa', activo);
      if (x.botonMapa) x.botonMapa.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
    G.qsa('.suc-mapa__estados path').forEach(function (p) {
      p.classList.toggle('es-elegido', !!(it && p.getAttribute('data-estado') === it.s.estado));
    });
    G.qsa('.suc-mapa__guias [data-suc]').forEach(function (n) {
      n.classList.toggle('es-elegido', !!(it && n.getAttribute('data-suc') === it.id));
    });

    if (globo) {
      if (conGlobo) {
        // Orden de tabulación: el globo va justo después de su marcador.
        if (it.btn.nextSibling !== globo) capaPines.insertBefore(globo, it.btn.nextSibling);
        llenarGlobo(it);
        globo.hidden = false;
        G.refrescar(globo);
        colocarGlobo();
      } else {
        globo.hidden = true;
      }
    }
    if (anuncio) {
      anuncio.textContent = it
        ? it.s.nombre + ' seleccionada: ' + (it.n > 0 ? it.n + ' ' + unidadesTexto(it.n).replace(NBSP, ' ') + '.' : 'sin unidades Go On en este corte.')
        : '';
    }
    if (typeof G.ponerParams === 'function' && o.origen !== 'url') G.ponerParams({ sucursal: actual });

    var ancho = root.innerWidth || doc.documentElement.clientWidth;
    if (it && o.origen === 'mapa' && ancho >= ESCRITORIO && it.tarjeta && !enVista(it.tarjeta)) {
      desplazar(it.tarjeta, 'center');
    }
    if (it && o.origen === 'tarjeta') {
      var mapa = G.qs('[data-js-mapa]');
      if (mapa && !enVista(caja)) desplazar(mapa, ancho >= ESCRITORIO ? 'nearest' : 'start');
    }
  }

  // ---------------------------------------------------------------------------
  // Directorio
  // ---------------------------------------------------------------------------
  function fila(nombre, contenido, pendiente, clase) {
    return el('div', { 'class': 'suc-tarjeta__fila' + (clase ? ' ' + clase : '') + (pendiente ? ' solo-presentacion es-por-confirmar' : '') }, [
      el('dt', null, [nombre, pendiente ? el('span', { 'class': 'suc-tarjeta__pendiente', text: 'por confirmar' }) : null]),
      el('dd', null, contenido)
    ]);
  }

  function tarjeta(it) {
    var s = it.s;
    var art = el('article', {
      'class': 'suc-tarjeta' + (it.n > 0 ? ' suc-tarjeta--con' : ' suc-tarjeta--sin'), id: 'suc-' + s.id,
      'data-suc': s.id, 'aria-labelledby': 'suc-' + s.id + '-nombre'
    });

    // Cabeza: lugar, nombre y «Ver en el mapa»
    var cabeza = el('header', { 'class': 'suc-tarjeta__cabeza' }, [
      el('div', { 'class': 'suc-tarjeta__titulos' }, [
        lugar(s) ? el('p', { 'class': 'suc-tarjeta__lugar', text: lugar(s) }) : null,
        el('h3', { 'class': 'suc-tarjeta__nombre', id: 'suc-' + s.id + '-nombre', text: s.nombre })
      ])
    ]);
    if (it.p) {
      var bm = el('button', {
        type: 'button', 'class': 'suc-tarjeta__mapa' + (it.trazo === 'p' ? ' solo-presentacion' : ''),
        'aria-pressed': 'false', 'aria-describedby': 'suc-' + s.id + '-nombre'
      }, [icono('i-pin'), el('span', { text: 'Ver en el mapa' })]);
      bm.addEventListener('click', function () {
        seleccionar(actual === it.id ? null : it.id, { origen: 'tarjeta' });
      });
      it.botonMapa = bm;
      cabeza.appendChild(bm);
    }
    art.appendChild(cabeza);

    // Unidades Go On al corte
    if (it.n > 0) {
      art.appendChild(el('a', {
        'class': 'suc-tarjeta__unidades', href: 'inventario.html?sucursal=' + encodeURIComponent(s.id),
        'data-event': 'cta_ver_inventario', 'data-event-origen': 'sucursales_tarjeta', 'data-event-sucursal-id': s.id
      }, [
        el('span', { 'class': 'suc-tarjeta__cifra', 'data-conteo': 'por_sucursal.' + s.id, text: String(it.n) }),
        el('span', { 'class': 'suc-tarjeta__cifra-texto' }, [
          el('b', { text: unidadesTexto(it.n) }), el('span', { text: 'Ver en el inventario' })
        ]),
        icono('i-flecha', 'icono suc-tarjeta__flecha')
      ]));
    } else {
      art.appendChild(el('p', { 'class': 'suc-tarjeta__sin' }, [
        el('span', { 'class': 'suc-tarjeta__anillo', 'aria-hidden': 'true' }), 'Sin unidades Go' + NBSP + 'On en este corte'
      ]));
    }

    // Datos
    var datos = el('dl', { 'class': 'suc-tarjeta__datos' });
    if (tiene(s, 'direccion')) {
      var dir = s.direccion + (tiene(s, 'cp') && (confirmado(s, 'cp') || !confirmado(s, 'direccion')) ? ', C.P.' + NBSP + s.cp : '');
      datos.appendChild(fila('Dirección', [dir], !confirmado(s, 'direccion')));
      if (confirmado(s, 'direccion') && tiene(s, 'cp') && !confirmado(s, 'cp')) {
        datos.appendChild(fila('Código postal', [s.cp], true));
      }
    }
    if (tiene(s, 'horario')) {
      datos.appendChild(fila('Horario', [horarioCompacto(s.horario)], !confirmado(s, 'horario'), 'suc-tarjeta__fila--horario'));
    }
    if (tiene(s, 'telefono')) {
      var tel = el('a', {
        'class': 'suc-tarjeta__tel', href: tiene(s, 'telefono_e164') ? 'tel:' + s.telefono_e164 : null,
        'data-event': 'tel_click', 'data-event-sucursal-id': s.id, 'data-event-origen': 'sucursales_tarjeta'
      }, [icono('i-tel'), el('span', { text: s.telefono })]);
      datos.appendChild(fila('Teléfono', [tel], !confirmado(s, 'telefono')));
    }
    var sapOk = tiene(s, 'centro_sap') && confirmado(s, 'centro_sap');
    datos.appendChild(el('div', { 'class': 'suc-tarjeta__fila suc-tarjeta__fila--sap solo-presentacion' + (sapOk ? '' : ' es-por-confirmar') }, [
      el('dt', null, ['Centro SAP']),
      el('dd', { text: sapOk ? s.centro_sap : 'Por confirmar' })
    ]));
    art.appendChild(datos);

    var pendientes = [];
    (s.por_confirmar || []).forEach(function (c) {
      var t = CAMPOS[c] || c;
      if (pendientes.indexOf(t) === -1) pendientes.push(t);
    });
    if (pendientes.length) {
      art.appendChild(el('p', { 'class': 'suc-tarjeta__por-confirmar solo-presentacion', text: 'Por confirmar: ' + pendientes.join(', ') + '.' }));
    }

    // Acciones. Contacto directo con la sucursal solo si su venta de camiones
    // seminuevos está confirmada; si está por confirmar, solo en modo P.
    var acciones = el('div', { 'class': 'suc-tarjeta__acciones' });
    var publicas = 0;
    var ofrece = s.vende_camiones_seminuevos !== false;
    var soloP = vende(s) ? '' : ' solo-presentacion es-por-confirmar';
    if (ofrece) {
      acciones.appendChild(el('a', {
        'class': 'btn btn--wa suc-tarjeta__wa' + soloP, href: '#', 'data-wa': '', 'data-wa-sucursal': s.id,
        'data-event-origen': 'sucursales_tarjeta', 'data-event-sucursal-id': s.id
      }, [
        el('span', { 'class': 'btn__wa', 'aria-hidden': 'true' }, [icono('i-wa')]),
        'Preguntar en ' + s.nombre
      ]));
      if (!soloP) publicas++;
    }
    if (tiene(s, 'maps_url')) {
      var mapsOk = confirmado(s, 'maps_url');
      acciones.appendChild(el('a', {
        'class': 'btn btn--secundario suc-tarjeta__llegar' + (mapsOk ? '' : ' solo-presentacion es-por-confirmar'),
        href: s.maps_url, target: '_blank', rel: 'noopener',
        'data-event': 'mapa_click', 'data-event-sucursal-id': s.id, 'data-event-origen': 'sucursales_tarjeta'
      }, ['Cómo llegar', icono('i-externo'), el('span', { 'class': 'sr', text: ' (abre Google Maps en otra pestaña)' })]));
      if (mapsOk) publicas++;
    }
    if (ofrece) {
      acciones.appendChild(el('a', {
        'class': 'suc-tarjeta__contacto' + soloP, href: 'contacto.html?sucursal=' + encodeURIComponent(s.id),
        'data-event': 'menu_clic', 'data-event-destino': 'contacto', 'data-event-origen': 'sucursales_tarjeta', 'data-event-sucursal-id': s.id
      }, ['Déjanos tus datos', el('span', { 'class': 'sr', text: ' y te contacta ' + s.nombre }), icono('i-flecha')]));
    }
    if (!publicas) acciones.classList.add('solo-presentacion');
    if (acciones.firstChild) art.appendChild(acciones);
    it.tarjeta = art;

    art.addEventListener('pointerenter', function () { if (it.btn) it.btn.classList.add('es-previa'); });
    art.addEventListener('pointerleave', function () { if (it.btn) it.btn.classList.remove('es-previa'); });
    return art;
  }

  function construirLista() {
    var cont = G.qs('[data-js-lista]');
    if (!cont) return;
    var con = items.filter(function (it) { return it.n > 0; })
      .sort(function (a, b) { return (b.n - a.n) || a.s.nombre.localeCompare(b.s.nombre, 'es'); });
    var sin = items.filter(function (it) { return it.n <= 0; })
      .sort(function (a, b) { return a.s.nombre.localeCompare(b.s.nombre, 'es'); });

    function grupo(id, titulo, texto, lista) {
      if (!lista.length) return;
      var sec = el('section', { 'class': 'suc-grupo suc-grupo--' + id, 'aria-label': titulo ? null : 'Sucursales', 'aria-labelledby': titulo ? 'suc-grupo-' + id : null });
      if (titulo) {
        sec.appendChild(el('header', { 'class': 'suc-grupo__cabeza' }, [
          el('h2', { 'class': 'suc-grupo__titulo', id: 'suc-grupo-' + id }, [
            el('span', { text: titulo }), el('span', { 'class': 'suc-grupo__cuenta', text: lista.length + ' de ' + items.length + ' sucursales' })
          ]),
          texto ? el('p', { 'class': 'suc-grupo__texto', text: texto }) : null
        ]));
      }
      var ol = el('ol', { 'class': 'suc-grupo__lista' });
      lista.forEach(function (it, i) {
        var li = el('li', { 'data-revela': '' }, [tarjeta(it)]);
        li.style.setProperty('--i', String(Math.min(i, 3)));
        ol.appendChild(li);
      });
      sec.appendChild(ol);
      cont.appendChild(sec);
    }

    // Una sola lista con todas las sucursales (primero las que tienen unidades), sin encabezados de grupo.
    grupo('todas', null, null, con.concat(sin));

    cont.appendChild(el('p', { 'class': 'suc-lista__cierre' }, [
      '¿No sabes a cuál ir? ',
      el('a', { href: 'contacto.html', 'data-event': 'menu_clic', 'data-event-destino': 'contacto' }, ['Déjanos tus datos', icono('i-flecha')]),
      ' y te contacta la sucursal que elijas.'
    ]));
  }

  function construirHorario() {
    var tabla = G.qs('[data-js-horario-tabla]');
    var nota = G.qs('[data-js-horario-nota]');
    var comun = horarioComun();
    if (!tabla) return;
    if (!comun) {
      var bloque = tabla.closest ? tabla.closest('.suc-horario') : null;
      if (bloque) bloque.classList.add('suc-horario--sin-tabla');
      tabla.hidden = true;
      return;
    }
    pintarHorario(tabla, comun);
    if (nota) nota.hidden = false;
  }

  function pintarPlazas() {
    var n = Object.keys(POR_SUC).filter(function (k) { return typeof POR_SUC[k] === 'number' && POR_SUC[k] > 0; }).length;
    G.qsa('[data-js-plazas]').forEach(function (nodo) {
      nodo.textContent = n + (n === 1 ? ' sucursal' : ' sucursales');
    });
  }

  // ---------------------------------------------------------------------------
  // WhatsApp por sucursal (modo demo).
  //  1) En captura (antes que presentacion.js): el detalle de «goon:wa-demo» lleva
  //     el mensaje que nombra la sucursal; la burbuja y «Copiar mensaje» usan ese.
  //  2) Después (presentacion.js ya llenó el modal): sucursal, centro SAP y nota.
  // Todo evento de WhatsApp limpia primero la marca «por confirmar» del centro.
  // ---------------------------------------------------------------------------
  function sucursalDelDisparador(d) {
    var disparador = d && d.disparador;
    if (!disparador || d.unidad || d.lote || !disparador.getAttribute) return null;
    var id = disparador.getAttribute('data-wa-sucursal');
    return id && typeof G.sucursal === 'function' ? G.sucursal(id) : null;
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
    var centro = tiene(s, 'centro_sap') && confirmado(s, 'centro_sap') ? String(s.centro_sap) : null;
    llenar('[data-wa-demo-mensaje]', d.mensaje || mensajeSucursal(s));
    llenar('[data-wa-demo-unidad]', 'Consulta a la sucursal');
    llenar('[data-wa-demo-sucursal]', s.nombre + (s.estado && s.estado !== s.nombre ? ', ' + s.estado : ''));
    llenar('[data-wa-demo-centro]', centro || (presentacion() ? 'Por confirmar' : 'Se asigna con la sucursal'));
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

  // Leyenda: cuántas sucursales caben en el mapa en modo público (las de
  // ubicación sin confirmar solo se dibujan en modo P).
  function pintarFueraDelMapa() {
    var nodo = G.qs('[data-js-fuera-mapa]');
    if (!nodo) return;
    var total = items.length;
    var enMapa = items.filter(function (it) { return it.p && it.trazo !== 'p'; }).length;
    if (!total || enMapa >= total) { nodo.hidden = true; return; }
    nodo.textContent = enMapa + ' de ' + total + ' sucursales en el mapa; todas están en el directorio.';
    nodo.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------------
  function observarTamano() {
    var pendiente = false;
    function programar() {
      if (pendiente) return;
      pendiente = true;
      (root.requestAnimationFrame || root.setTimeout)(function () { pendiente = false; acomodar(); });
    }
    if (typeof root.ResizeObserver === 'function') {
      new root.ResizeObserver(programar).observe(caja);
    } else {
      root.addEventListener('resize', programar);
    }
  }

  G.listo(function () {
    prepararItems();
    pintarPlazas();
    construirLista();
    construirHorario();
    anuncio = G.qs('[data-js-anuncio]');
    doc.addEventListener('goon:wa-demo', alPrepararWa, true);
    doc.addEventListener('goon:wa-demo', alVistaPreviaWa);
    if (!construirMapa()) return;
    pintarFueraDelMapa();

    var soltar = typeof G.retenerListo === 'function' ? G.retenerListo() : function () {};
    var soltado = false;
    function listo() {
      if (soltado) return;
      soltado = true;
      acomodar();
      var pedida = typeof G.param === 'function' ? G.param('sucursal') : null;
      if (pedida && porId[pedida]) seleccionar(pedida, { origen: 'url' });
      soltar();
    }
    acomodar();
    observarTamano();
    doc.addEventListener('goon:modo', function () {
      items.forEach(function (it) {
        if (it.btn) it.btn.title = it.trazo === 'exacta' || !presentacion() ? '' : 'Ubicación aproximada: coordenada por confirmar';
      });
      acomodar();
      if (actual) seleccionar(actual, { origen: 'url' });
    });
    if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') {
      doc.fonts.ready.then(listo, listo);
      root.setTimeout(listo, 1500);
    } else {
      listo();
    }
  });
})(window);
