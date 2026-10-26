/*!
 * Go On Camiones — js/paginas/estandar.js («El Estándar Go On»)
 * Script clásico (IIFE), sin red. Depende de nucleo.js y comun.js (window.GOON).
 * Toda cifra sale de GOON_HECHOS (estandar, acondicionamiento) o del catálogo.
 *
 * Qué monta:
 *   1. Explorador del plano (firma de la página): los sistemas de estandar.lista
 *      sobre el dibujo #plano-tracto del shell. Globos = pestañas (role="tab")
 *      con los puntos de cada sistema; clic, teclado (flechas, Inicio, Fin) y
 *      hover. Al entrar en pantalla, una línea de escaneo «enciende» los globos
 *      (una sola vez; sin animación con movimiento reducido, en modo estático
 *      o al imprimir). Panel con las revisiones del sistema activo, regla de
 *      puntos y botones Anterior / Siguiente. El dibujo es un ejemplo
 *      ilustrativo: describe el estándar de la marca, no el resultado de una unidad.
 *   2. Lista del acondicionamiento (acondicionamiento.lista).
 *   3. Reporte de inspección de MUESTRA con semáforo (datos ficticios, marcado
 *      como ilustrativo) y botón de imprimir (evento descarga_demo).
 *   4. Barra de proporción Go On / red en la escalera.
 *   5. Ficha de garantía: la fila «Límites» nombra los límites que siguen por
 *      confirmar (sus filas se ocultan fuera del modo P) y remite a la póliza.
 *   6. Preferencias hacia adelante: [data-est-capa-si="tipo:id"] toma esa capa y
 *      [data-est-dato-si="ruta"] ese dato en cuanto existan en GOON_HECHOS; mientras
 *      no existan se queda lo que trae la plantilla. Hoy: el plano usa
 *      ilustrativo:reporte-muestra hasta que exista ilustrativo:plano-inspeccion
 *      (plano-tecnico es la de «Fotografía en proceso»); la foto real de unidad
 *      nueva (Fig. 02) espera ilustrativo:foto-unidad-nueva y
 *      mensajes.leyenda_unidad_nueva, y mientras tanto lleva su pie literal.
 * Línea viva (< 1100 px, donde el panel queda bajo el dibujo): repite número,
 * nombre y puntos del sistema elegido (aria-live) y salta a sus revisiones.
 * Eventos: estandar_detalle {sistema} solo al elegir un sistema real (id de
 * estandar.lista); descarga_demo {documento}.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var G = root.GOON;
  if (!G || !doc) return;
  var html = doc.documentElement;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var NBSP = ' ';

  // Lienzo del plano: viewBox 0 0 1000 ALTO; el dibujo baja OY para dejar sitio
  // a las dos filas de globos (arriba y abajo) sin que toquen el camión.
  var ALTO = 660;
  var OY = 125;
  var FILA_ARRIBA = 50;
  var FILA_ABAJO = 610;
  var PLEGAR_DESDE = 9; // en celular, listas más largas se muestran plegadas
  var VISIBLES_PLEGADA = 6;

  function circ(cx, cy, r) {
    return 'M' + (cx - r) + ' ' + cy + ' a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0 Z';
  }

  // Geometría por sistema en coordenadas del símbolo #plano-tracto (1000 × 410):
  //   a = ancla sobre el componente · z = zona que se ilumina
  //   g = globo [x, fila] en el lienzo (1000 × ALTO)
  var GEO = {
    'interior-cabina': { a: [345, 192], g: [400, FILA_ARRIBA], z: 'M296 170 L352 94 Q358 90 366 90 L420 88 L420 296 L296 296 Z' },
    'area-motor': { a: [190, 246], g: [235, FILA_ARRIBA], z: 'M104 204 H274 V286 H104 Z' },
    'postratamiento': { a: [485, 320], g: [450, FILA_ABAJO], z: 'M438 302 H532 V338 H438 Z' },
    'eje-delantero': { a: [205, 342], g: [150, FILA_ABAJO], z: circ(205, 342, 56) },
    'transmision': { a: [342, 289], g: [300, FILA_ABAJO], z: 'M290 270 H394 V308 H290 Z' },
    'eje-cardan': { a: [668, 330], g: [600, FILA_ABAJO], z: 'M392 294 L724 330 L722 344 L390 308 Z' },
    'eje-trasero-1': { a: [725, 342], g: [750, FILA_ABAJO], z: circ(725, 342, 56) },
    'eje-trasero-2': { a: [855, 342], g: [900, FILA_ABAJO], z: circ(855, 342, 56) },
    'sistema-neumatico': { a: [680, 214], g: [720, FILA_ARRIBA], z: 'M542 304 H650 V336 H542 Z M662 126 H700 V298 H662 Z' },
    'sistema-luces': { a: [82, 236], g: [80, FILA_ARRIBA], z: 'M60 220 H102 V250 H60 Z M944 300 H968 V330 H944 Z' }
  };

  // Semáforo de la MUESTRA (ficticio). Lo que no aparece aquí sale «conforme».
  var MUESTRA = {
    'sistema-luces': { estado: 'observacion', punto: 3 },
    'eje-trasero-2': { estado: 'no-aplica' }
  };
  var ESTADOS = {
    conforme: 'Conforme',
    observacion: 'Observación',
    correccion: 'Requiere corrección',
    'no-aplica': 'No aplica'
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function el(tag, attrs, hijos) {
    var n = doc.createElement(tag);
    poner(n, attrs);
    anexar(n, hijos);
    return n;
  }
  function sv(tag, attrs) {
    var n = doc.createElementNS(SVGNS, tag);
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
      else n.setAttribute(k, String(v));
    }
  }
  function anexar(n, hijos) {
    [].concat(hijos || []).forEach(function (h) {
      if (h === null || h === undefined || h === false) return;
      n.appendChild(typeof h === 'string' ? doc.createTextNode(h) : h);
    });
  }
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function movReducido() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function estatico() { return html.classList.contains('goon-estatico'); }
  function nombreCorto(nombre) {
    return String(nombre || '').split(' (')[0].split(' & ')[0].trim();
  }
  function sistemas() {
    var l = G.dato('estandar.lista');
    return Array.isArray(l) ? l.filter(function (s) { return s && typeof s === 'object'; }) : [];
  }
  function totalPuntos(lista) {
    var t = num(G.dato('estandar.puntos'));
    if (t) return t;
    return lista.reduce(function (a, s) { return a + num(s.puntos); }, 0);
  }
  /** Columnas para repartir n cuadros en filas parejas con un tope por fila. */
  function columnas(n, tope) {
    if (n <= tope) return Math.max(1, n);
    return Math.ceil(n / Math.ceil(n / tope));
  }
  function geo(s, i) {
    var g = s && GEO[s.id];
    if (g) return g;
    // Sistema nuevo sin geometría: globo en la fila de abajo, sin zona.
    var x = 80 + (i % 10) * 92;
    return { a: [x, 300], g: [x, FILA_ABAJO], z: '' };
  }

  // ---------------------------------------------------------------------------
  // 1. Explorador del plano
  // ---------------------------------------------------------------------------
  function montarExplorador() {
    var raiz = G.qs('[data-est-explorador]');
    if (!raiz) return;
    var lista = sistemas();
    if (!lista.length) return;
    var total = totalPuntos(lista);

    var caja = G.qs('[data-est-caja]', raiz);
    var gZonas = G.qs('[data-est-zonas]', raiz);
    var gGuias = G.qs('[data-est-guias]', raiz);
    var gAnclas = G.qs('[data-est-anclas]', raiz);
    var contGlobos = G.qs('[data-est-globos]', raiz);
    var contRegla = G.qs('[data-est-regla]', raiz);
    var panel = G.qs('[data-est-panel]', raiz);
    var cuerpo = G.qs('[data-est-panel-cuerpo]', raiz);
    var pos = G.qs('[data-est-pos]', raiz);
    var botonesPaso = G.qsa('[data-est-paso]', raiz);
    var vivo = G.qs('[data-est-vivo]', raiz);
    var vivoTexto = G.qs('[data-est-vivo-texto]', raiz);
    var vivoIr = G.qs('[data-est-vivo-ir]', raiz);
    var vivoIrTexto = G.qs('[data-est-vivo-ir-texto]', raiz);
    if (!caja || !contGlobos || !panel || !cuerpo) return;

    var zonas = [], guias = [], anclas = [], globos = [], segmentos = [];
    var activo = -1;

    lista.forEach(function (s, i) {
      var g = geo(s, i);
      var ax = g.a[0], ay = g.a[1] + OY;
      var aplica = !!s.si_aplica;

      var z = sv('path', { d: g.z || 'M0 0', transform: 'translate(0 ' + OY + ')', 'class': 'est-zona' + (aplica ? ' est-zona--aplica' : '') });
      gZonas.appendChild(z);
      zonas.push(z);

      var l = sv('line', { x1: g.g[0], y1: g.g[1], x2: ax, y2: ay, 'class': 'est-guia' });
      gGuias.appendChild(l);
      guias.push(l);

      var c = sv('g', { 'class': 'est-ancla', transform: 'translate(' + ax + ' ' + ay + ')' });
      c.appendChild(sv('circle', { r: 11, 'class': 'est-ancla__halo' }));
      c.appendChild(sv('circle', { r: 5, 'class': 'est-ancla__punto' }));
      gAnclas.appendChild(c);
      anclas.push(c);

      var etiqueta = 'Sistema ' + dos(i + 1) + ', ' + s.nombre + ': ' + num(s.puntos) + ' puntos' + (aplica ? ', si aplica' : '');
      var b = el('button', {
        type: 'button',
        role: 'tab',
        id: 'est-tab-' + i,
        'class': 'est-globo' + (aplica ? ' est-globo--aplica' : '') + (g.g[1] === FILA_ARRIBA ? ' est-globo--arriba' : ' est-globo--abajo'),
        'aria-selected': 'false',
        'aria-controls': 'est-panel',
        'aria-label': etiqueta,
        tabindex: '-1',
        'data-i': i,
        style: 'left:' + (g.g[0] / 10) + '%;top:' + (g.g[1] / ALTO * 100).toFixed(3) + '%'
      }, [
        el('span', { 'class': 'est-globo__circulo', 'aria-hidden': 'true' }, [
          el('span', { 'class': 'est-globo__n', text: String(num(s.puntos)) })
        ]),
        el('span', { 'class': 'est-globo__rotulo', 'aria-hidden': 'true' }, [
          el('span', { 'class': 'est-globo__sis', text: dos(i + 1) }),
          el('span', { 'class': 'est-globo__nombre', text: nombreCorto(s.nombre) })
        ])
      ]);
      contGlobos.appendChild(b);
      globos.push(b);

      if (contRegla) {
        var seg = el('span', { 'class': 'est-regla__seg' + (aplica ? ' est-regla__seg--aplica' : ''), style: 'flex-grow:' + Math.max(1, num(s.puntos)) });
        for (var k = 0; k < num(s.puntos); k++) seg.appendChild(el('i'));
        contRegla.appendChild(seg);
        segmentos.push(seg);
      }
    });
    if (contRegla) {
      contRegla.appendChild(el('span', { 'class': 'est-regla__total' }, [
        el('b', { text: String(total) }), NBSP + 'puntos'
      ]));
    }

    function pintarPanel(i) {
      var s = lista[i];
      var aplica = !!s.si_aplica;
      var revisiones = Array.isArray(s.revisiones) ? s.revisiones : [];
      cuerpo.textContent = '';
      var cabeza = el('div', { 'class': 'est-panel__cabeza' }, [
        el('p', { 'class': 'etiqueta' }, [
          el('span', { 'class': 'punto', 'aria-hidden': 'true' }),
          'Sistema ' + dos(i + 1) + ' de ' + dos(lista.length)
        ]),
        aplica ? el('span', { 'class': 'chip est-chip-aplica', text: 'Si aplica' }) : null
      ]);
      var titulo = el('h3', { 'class': 'est-panel__titulo', id: 'est-panel-titulo', text: s.nombre });
      var pct = total ? Math.round(num(s.puntos) / total * 1000) / 10 : 0;
      var cifra = el('div', { 'class': 'est-panel__cifra' }, [
        el('p', { 'class': 'est-panel__n', text: String(num(s.puntos)) }),
        el('p', { 'class': 'est-panel__de' }, [
          el('span', { 'class': 'est-panel__de-1', text: num(s.puntos) === 1 ? 'punto de revisión' : 'puntos de revisión' }),
          el('span', { 'class': 'est-panel__de-2', text: 'de los ' + total + ' del estándar' })
        ]),
        el('span', { 'class': 'est-panel__barra', 'aria-hidden': 'true', style: '--pct:' + pct + '%' }, [el('span')])
      ]);
      var nota = null;
      if (aplica) {
        var ico = sv('svg', { 'class': 'icono', 'aria-hidden': 'true', focusable: 'false' });
        ico.appendChild(sv('use', { href: '#i-info' }));
        nota = el('p', { 'class': 'est-panel__aplica' }, [ico, 'Se revisa cuando la unidad cuenta con este sistema.']);
      }
      var plegable = revisiones.length >= PLEGAR_DESDE;
      var ol = el('ol', {
        'class': 'est-revisiones' + (revisiones.length > 8 ? ' est-revisiones--dos' : '') + (plegable ? ' est-revisiones--plegada' : ''),
        id: 'est-revisiones',
        'aria-label': 'Revisiones de ' + s.nombre
      });
      revisiones.forEach(function (r, k) {
        ol.appendChild(el('li', null, [
          el('span', { 'class': 'est-revisiones__n', 'aria-hidden': 'true', text: dos(k + 1) }),
          el('span', { 'class': 'est-revisiones__t', text: String(r) })
        ]));
      });
      var mas = null;
      if (plegable) {
        var icoMas = sv('svg', { 'class': 'icono', 'aria-hidden': 'true', focusable: 'false' });
        icoMas.appendChild(sv('use', { href: '#i-abajo' }));
        var textoMas = el('span', { text: 'Ver las ' + revisiones.length + ' revisiones' });
        mas = el('button', { type: 'button', 'class': 'enlace-flecha est-revisiones__mas', 'aria-expanded': 'false', 'aria-controls': 'est-revisiones' }, [textoMas, icoMas]);
        mas.addEventListener('click', function () {
          var abrir = mas.getAttribute('aria-expanded') !== 'true';
          mas.setAttribute('aria-expanded', abrir ? 'true' : 'false');
          ol.classList.toggle('est-revisiones--plegada', !abrir);
          textoMas.textContent = abrir ? 'Ver menos' : 'Ver las ' + revisiones.length + ' revisiones';
        });
      }
      anexar(cuerpo, [cabeza, titulo, cifra, nota, ol, mas]);
      if (pos) pos.textContent = dos(i + 1) + ' / ' + dos(lista.length);
      pintarVivo(i, revisiones.length);
      botonesPaso.forEach(function (bt) {
        var paso = Number(bt.getAttribute('data-est-paso'));
        var destino = (i + paso + lista.length) % lista.length;
        bt.setAttribute('aria-label', (paso < 0 ? 'Anterior: ' : 'Siguiente: ') + lista[destino].nombre);
      });
    }

    function pintarVivo(i, nRevisiones) {
      if (!vivo || !vivoTexto) return;
      var s = lista[i];
      var n = num(s.puntos);
      vivoTexto.textContent = '';
      anexar(vivoTexto, [
        el('span', { 'class': 'est-vivo__n' }, [el('span', { 'class': 'sr', text: 'Sistema ' }), dos(i + 1)]),
        el('span', { 'class': 'est-vivo__nombre', text: s.nombre }),
        el('span', { 'class': 'est-vivo__puntos', text: n + (n === 1 ? ' punto' : ' puntos') + (s.si_aplica ? ' · si aplica' : '') })
      ]);
      if (vivoIrTexto) {
        vivoIrTexto.textContent = nRevisiones ? 'Ver ' + (nRevisiones === 1 ? 'la revisión' : 'las ' + nRevisiones + ' revisiones') : 'Ver el sistema';
      }
      if (vivo.hidden) {
        vivo.hidden = false;
        vivo.removeAttribute('hidden');
      }
      // Se anuncia a partir del segundo cambio: la primera pintura no interrumpe.
      if (!vivoTexto.hasAttribute('aria-live')) {
        root.setTimeout(function () { vivoTexto.setAttribute('aria-live', 'polite'); }, 0);
      }
    }

    function activar(i, opciones) {
      var o = opciones || {};
      if (i < 0 || i >= lista.length) return;
      var cambio = i !== activo;
      activo = i;
      for (var k = 0; k < lista.length; k++) {
        var on = k === i;
        zonas[k].classList.toggle('is-activo', on);
        guias[k].classList.toggle('is-activo', on);
        anclas[k].classList.toggle('is-activo', on);
        globos[k].classList.toggle('is-activo', on);
        globos[k].setAttribute('aria-selected', on ? 'true' : 'false');
        globos[k].setAttribute('tabindex', on ? '0' : '-1');
        if (segmentos[k]) segmentos[k].classList.toggle('is-activo', on);
      }
      panel.setAttribute('aria-labelledby', 'est-tab-' + i);
      if (cambio || o.forzar) pintarPanel(i);
      if (o.foco) globos[i].focus();
      if (o.medir && cambio) G.evento('estandar_detalle', { sistema: lista[i].id });
    }

    function resaltar(i, on) {
      if (!zonas[i]) return;
      zonas[i].classList.toggle('is-hover', on);
      guias[i].classList.toggle('is-hover', on);
      anclas[i].classList.toggle('is-hover', on);
    }

    contGlobos.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.est-globo') : null;
      if (!b) return;
      encenderTodo();
      activar(Number(b.getAttribute('data-i')), { medir: true });
    });
    contGlobos.addEventListener('keydown', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.est-globo') : null;
      if (!b) return;
      var i = Number(b.getAttribute('data-i'));
      var n = lista.length;
      var destino = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') destino = (i + 1) % n;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') destino = (i - 1 + n) % n;
      else if (ev.key === 'Home') destino = 0;
      else if (ev.key === 'End') destino = n - 1;
      if (destino === null) return;
      ev.preventDefault();
      encenderTodo();
      activar(destino, { foco: true, medir: true });
    });
    globos.forEach(function (b, i) {
      b.addEventListener('mouseenter', function () { resaltar(i, true); });
      b.addEventListener('mouseleave', function () { resaltar(i, false); });
      b.addEventListener('focus', function () { resaltar(i, true); });
      b.addEventListener('blur', function () { resaltar(i, false); });
    });
    botonesPaso.forEach(function (bt) {
      bt.addEventListener('click', function () {
        var paso = Number(bt.getAttribute('data-est-paso')) || 1;
        encenderTodo();
        activar((activo + paso + lista.length) % lista.length, { medir: true });
      });
    });

    // Salto de la línea viva al panel: respeta el movimiento reducido y deja el
    // foco en el panel (sus revisiones) sin un segundo desplazamiento.
    if (vivoIr) {
      vivoIr.addEventListener('click', function (ev) {
        ev.preventDefault();
        var suave = !(movReducido() || estatico());
        try {
          panel.scrollIntoView({ block: 'start', behavior: suave ? 'smooth' : 'auto' });
        } catch (e) { panel.scrollIntoView(true); }
        try { panel.focus({ preventScroll: true }); } catch (e2) { panel.focus(); }
      });
    }

    // Encendido con scroll: escaneo de izquierda a derecha, una sola vez.
    var encendidos = false;
    var temporizadores = [];
    function encenderTodo() {
      if (encendidos) return;
      encendidos = true;
      temporizadores.forEach(function (t) { root.clearTimeout(t); });
      temporizadores = [];
      caja.classList.remove('is-escaneando');
      caja.classList.add('is-encendido');
      globos.forEach(function (b, k) {
        b.classList.add('is-on');
        guias[k].classList.add('is-on');
        anclas[k].classList.add('is-on');
      });
    }
    function escanear() {
      if (encendidos) return;
      if (estatico() || movReducido()) { encenderTodo(); return; }
      var DUR = 1500;
      caja.classList.add('is-escaneando');
      lista.forEach(function (s, k) {
        var x = geo(s, k).a[0];
        temporizadores.push(root.setTimeout(function () {
          globos[k].classList.add('is-on');
          guias[k].classList.add('is-on');
          anclas[k].classList.add('is-on');
        }, Math.round(120 + (x / 1000) * DUR)));
      });
      temporizadores.push(root.setTimeout(encenderTodo, DUR + 260));
    }

    activar(0, { forzar: true });

    if (estatico() || movReducido() || !('IntersectionObserver' in root)) {
      encenderTodo();
    } else {
      var io = new root.IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.disconnect();
          escanear();
        });
      }, { threshold: 0.45 });
      io.observe(caja);
    }
    // Capturas / PDF: GOON.estatico() o impresión dejan todo encendido.
    root.addEventListener('beforeprint', encenderTodo);
    if (root.MutationObserver) {
      var mo = new root.MutationObserver(function () {
        if (estatico()) { encenderTodo(); mo.disconnect(); }
      });
      mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    }

    var fuente = G.qs('[data-est-fuente]');
    var meta = root.GOON_HECHOS_META;
    if (fuente && meta && meta.fuentes && meta.fuentes['estandar.lista']) {
      fuente.textContent = meta.fuentes['estandar.lista'];
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Acondicionamiento
  // ---------------------------------------------------------------------------
  function montarAcondicionamiento() {
    var ol = G.qs('[data-est-acond]');
    var lista = G.dato('acondicionamiento.lista');
    if (!ol || !Array.isArray(lista)) return;
    lista.forEach(function (item, i) {
      if (!item || typeof item !== 'object') return;
      ol.appendChild(el('li', { 'class': 'est-acond__item', 'data-revela': '', style: '--i:' + (i % 4) }, [
        el('span', { 'class': 'est-acond__num', 'aria-hidden': 'true', text: item.numero || dos(i + 1) }),
        el('div', { 'class': 'est-acond__cuerpo' }, [
          el('h3', { 'class': 'est-acond__nombre', text: item.nombre || '' }),
          item.detalle ? el('p', { 'class': 'est-acond__texto', text: item.detalle }) : null
        ])
      ]));
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Reporte de muestra (datos ficticios)
  // ---------------------------------------------------------------------------
  function montarReporte() {
    var tbody = G.qs('[data-est-reporte]');
    var resumen = G.qs('[data-est-resumen]');
    var lista = sistemas();
    if (!tbody || !lista.length) return;
    var total = totalPuntos(lista);
    var cuenta = { conforme: 0, observacion: 0, correccion: 0, 'no-aplica': 0 };
    var revisados = 0;

    lista.forEach(function (s, i) {
      var m = MUESTRA[s.id] || { estado: 'conforme' };
      var estado = ESTADOS[m.estado] ? m.estado : 'conforme';
      var n = num(s.puntos);
      cuenta[estado]++;
      if (estado !== 'no-aplica') revisados += n;

      // Cuadros en filas parejas (nunca un cuadro huérfano): columnas por ancho,
      // hasta 12 por fila en celular y 18 en escritorio.
      var cuadros = el('span', {
        'class': 'est-doc__cuadros',
        'aria-hidden': 'true',
        style: '--cols-m:' + columnas(n, 12) + ';--cols-d:' + columnas(n, 18)
      });
      for (var k = 0; k < n; k++) {
        var tipo = estado === 'no-aplica' ? 'no-aplica' : (estado === 'observacion' && k === (m.punto || 0) ? 'observacion' : 'conforme');
        cuadros.appendChild(el('i', { 'class': 'est-doc__cuadro est-doc__cuadro--' + tipo }));
      }
      tbody.appendChild(el('tr', { 'class': 'est-doc__fila est-doc__fila--' + estado }, [
        el('th', { scope: 'row' }, [
          el('span', { 'class': 'est-doc__celda' }, [
            el('span', { 'class': 'est-doc__n', 'aria-hidden': 'true', text: dos(i + 1) }),
            el('span', { 'class': 'est-doc__sis' }, [
              s.nombre,
              s.si_aplica ? el('span', { 'class': 'est-doc__aplica', text: ' (si aplica)' }) : null,
              // En celular la columna «Puntos» se pliega dentro de esta celda
              el('span', { 'class': 'est-doc__pts-movil', text: n + (n === 1 ? ' punto' : ' puntos') })
            ])
          ])
        ]),
        el('td', { 'class': 'est-doc__puntos', text: String(n) }),
        el('td', { 'class': 'est-doc__resultado' }, [
          el('span', { 'class': 'est-doc__res' }, [
            el('span', { 'class': 'est-foco est-foco--' + estado, 'aria-hidden': 'true' }),
            el('span', { 'class': 'est-doc__res-texto' }, [
              ESTADOS[estado],
              estado === 'observacion' ? el('span', { 'class': 'est-doc__res-extra' }, [el('span', { 'class': 'est-doc__res-sep', 'aria-hidden': 'true', text: ' · ' }), '1 punto']) : null
            ])
          ]),
          cuadros
        ])
      ]));
    });

    if (resumen) {
      var items = [];
      if (cuenta.conforme) items.push(['conforme', cuenta.conforme + (cuenta.conforme === 1 ? ' sistema conforme' : ' sistemas conformes')]);
      if (cuenta.observacion) items.push(['observacion', cuenta.observacion + ' con observación']);
      if (cuenta.correccion) items.push(['correccion', cuenta.correccion + ' requiere corrección']);
      if (cuenta['no-aplica']) items.push(['no-aplica', cuenta['no-aplica'] + ' no aplica']);
      anexar(resumen, [
        el('p', { 'class': 'est-doc__resumen-cifra' }, [
          el('b', { text: String(revisados) }),
          el('span', null, [' de ' + total + ' puntos', el('br'), 'revisados en la muestra'])
        ]),
        el('ul', { 'class': 'est-doc__resumen-lista' }, items.map(function (it) {
          return el('li', null, [el('span', { 'class': 'est-foco est-foco--' + it[0], 'aria-hidden': 'true' }), it[1]]);
        }))
      ]);
    }

    var imprimir = G.qs('[data-est-imprimir]');
    if (imprimir) {
      imprimir.addEventListener('click', function () {
        G.evento('descarga_demo', { documento: 'reporte_muestra' });
        if (typeof root.print === 'function') root.print();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Proporción Go On / red (escalera)
  // ---------------------------------------------------------------------------
  function montarProporcion() {
    var conteos = (root.GOON_CATALOGO && root.GOON_CATALOGO.meta && root.GOON_CATALOGO.meta.conteos) || {};
    var goon = num(conteos.go_on);
    var red = num(conteos.red);
    G.qsa('[data-est-proporcion]').forEach(function (barra) {
      var pct = red ? Math.max(1, Math.min(100, goon / red * 100)) : 0;
      barra.style.setProperty('--pct', pct.toFixed(2) + '%');
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Ficha de garantía: fila «Límites» con lo que se precisa en la póliza
  // ---------------------------------------------------------------------------
  var LIMITES = [
    ['garantia.km', 'recorrido'],
    ['garantia.componentes', 'componentes'],
    ['garantia.tope_mxn', 'tope']
  ];
  function montarLimites() {
    var fila = G.qs('[data-est-poliza]');
    var texto = G.qs('[data-est-poliza-texto]');
    if (!fila || !texto) return;
    var pendientes = LIMITES.filter(function (l) { return G.porConfirmar(l[0]); }).map(function (l) { return l[1]; });
    if (!pendientes.length) return; // todo confirmado: la ficha ya muestra los cuatro límites
    var frase = pendientes.length === 1 ? pendientes[0]
      : pendientes.slice(0, -1).join(', ') + ' y ' + pendientes[pendientes.length - 1];
    texto.textContent = frase.charAt(0).toUpperCase() + frase.slice(1);
    fila.hidden = false;
    fila.removeAttribute('hidden');
  }

  // ---------------------------------------------------------------------------
  // 6. Preferencias hacia adelante (capa o dato que aún no existe en hechos)
  // ---------------------------------------------------------------------------
  function capaDefinida(ficha) {
    var p = String(ficha || '').indexOf(':');
    if (p < 1) return false;
    var lista = G.dato('capas.' + ficha.slice(0, p));
    var id = ficha.slice(p + 1);
    return Array.isArray(lista) && lista.some(function (c) { return c && c.id === id; });
  }
  function aplicarPreferencias() {
    G.qsa('[data-est-capa-si]').forEach(function (n) {
      var ficha = n.getAttribute('data-est-capa-si');
      if (capaDefinida(ficha)) n.setAttribute('data-capa', ficha);
    });
    G.qsa('[data-est-dato-si]').forEach(function (n) {
      var ruta = n.getAttribute('data-est-dato-si');
      var v = G.dato(ruta);
      if (typeof v === 'string' && v) n.setAttribute('data-dato', ruta);
    });
  }

  function intentar(fn, nombre) {
    try { fn(); } catch (e) {
      if (root.console && root.console.error) root.console.error('[GOON] estandar.js · ' + nombre + ':', e);
    }
  }

  G.listo(function () {
    intentar(aplicarPreferencias, 'preferencias');
    intentar(montarExplorador, 'explorador');
    intentar(montarAcondicionamiento, 'acondicionamiento');
    intentar(montarReporte, 'reporte');
    intentar(montarProporcion, 'proporción');
    intentar(montarLimites, 'límites de la garantía');
  });
})(window);
