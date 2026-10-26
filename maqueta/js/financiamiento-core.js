/*!
 * Go On Camiones — núcleo de la calculadora de financiamiento (window.GOON_FIN)
 * Funciones PURAS: sin DOM, sin red, sin estado propio. Script clásico (IIFE).
 * Solo si no se les pasa fecha/año leen el reloj y GOON_CATALOGO.meta.fecha_corte.
 *
 * params = objeto `financiamiento` de GOON_HECHOS:
 *   { plazos:[12,24,36,48], tasas:{"12":0.149,"24":0.154,"36":0.159,"48":0.164},
 *     enganche_min_pct:0.20, comision_pct:0.02, antiguedad_max:9, edad_mas_plazo_max:10, ... }
 * Si no se pasa params, se usa window.GOON_HECHOS.financiamiento (si existe).
 *
 * Reglas (Crédito Directo, mismas del cotizador determinista de Raúl, ADR-008):
 *   - edad = anioReferencia - anioModelo. Si edad > antiguedad_max -> no cotiza.
 *   - plazo p permitido si edad + p/12 <= edad_mas_plazo_max (recorta PLAZOS, no la tasa).
 *   - la tasa depende SOLO del plazo.
 *   - el precio incluye IVA y se financia tal cual (precio - enganche).
 *   - comisión de apertura = comision_pct del MONTO FINANCIADO; se paga en el
 *     pago inicial, NO se financia. pago_inicial = enganche + comisión.
 *   - mensualidad = anualidad (amortización francesa) con tasa_anual/12.
 *   - redondeo a centavos SOLO al final.
 *   - VIGENCIA (financing_daimler.yaml L9-10): si params trae `vigencia`
 *     (fecha de los datos de F&I) y la fecha de evaluación pasa de
 *     vigencia + vigencia_maxima_dias (365 si falta), el cotizador se APAGA:
 *     valido=false, codigo 'vigencia_vencida', motivo que deriva a F&I.
 *     Misma comparación que Raúl: vencida si fecha > vigencia + días.
 *     Fecha de evaluación = la MAYOR entre `entrada.hoy` (o el reloj del
 *     navegador si no se pasa) y GOON_CATALOGO.meta.fecha_corte: la liga
 *     puede seguir abierta meses después del corte y no debe cotizar tasas
 *     vencidas, y un reloj atrasado no la revive. `vigencia` ilegible ->
 *     'vigencia_invalida' (falla cerrada). Sin `vigencia` no se verifica.
 *   - AÑO DE REFERENCIA por defecto (si no se pasa anioReferencia): el año de
 *     `entrada.hoy` si se pasó; si no, el de GOON_CATALOGO.meta.fecha_corte
 *     (la maqueta es una foto del inventario al corte y sus cifras deben ser
 *     reproducibles); solo sin catálogo cae al reloj del navegador.
 * Golden: $1,550,000 · 2020 · ref 2026 · 48m -> pago inicial $334,800.00,
 *         mensualidad $35,396.49.
 */
(function (root) {
  'use strict';

  var TOLERANCIA = 0.005; // medio centavo

  function num(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') {
      var limpio = v.replace(/[$,\s]/g, '');
      if (/^-?\d+(\.\d+)?$/.test(limpio)) return Number(limpio);
    }
    return NaN;
  }

  function finito(n) {
    return typeof n === 'number' && isFinite(n);
  }

  /** Acepta fracción (0.149) o porcentaje (14.9). */
  function fraccion(v) {
    var n = num(v);
    if (!finito(n)) return NaN;
    return n > 1 ? n / 100 : n;
  }

  /** Redondeo a centavos, simétrico y robusto a 0.xx4999999 por flotantes. */
  function centavos(x) {
    if (!finito(x)) return x;
    var signo = x < 0 ? -1 : 1;
    return (signo * Math.round(Math.abs(x) * 100 + 1e-7)) / 100;
  }

  function mxn(n) {
    var v = Math.round(n);
    var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-$' : '$') + s;
  }

  function pctTexto(f) {
    var p = Math.round(f * 1000) / 10;
    return (p % 1 === 0 ? String(p) : p.toFixed(1)) + '%';
  }

  // ------------------------------------------------------------------------
  // Fechas (solo 'YYYY-MM-DD' o Date; aritmética en UTC para no depender del
  // huso ni del horario de verano).
  // ------------------------------------------------------------------------
  var MS_DIA = 86400000;
  var DIAS_VIGENCIA_DEFECTO = 365;
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function dos(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** 'YYYY-MM-DD' (fecha de calendario válida) o null. Un Date se toma en hora local. */
  function fechaISO(v) {
    var y, m, d;
    if (v instanceof Date || (v && typeof v === 'object' && typeof v.getFullYear === 'function')) {
      if (!finito(v.getTime())) return null;
      y = v.getFullYear();
      m = v.getMonth() + 1;
      d = v.getDate();
    } else if (typeof v === 'string') {
      var mt = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (!mt) return null;
      y = Number(mt[1]);
      m = Number(mt[2]);
      d = Number(mt[3]);
      var t = new Date(Date.UTC(y, m - 1, d));
      if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    } else {
      return null;
    }
    return String(y) + '-' + dos(m) + '-' + dos(d);
  }

  function sumarDias(iso, dias) {
    var y = Number(iso.slice(0, 4));
    var m = Number(iso.slice(5, 7));
    var d = Number(iso.slice(8, 10));
    return new Date(Date.UTC(y, m - 1, d) + dias * MS_DIA).toISOString().slice(0, 10);
  }

  function diasEntre(desdeIso, hastaIso) {
    return Math.round((Date.parse(hastaIso + 'T00:00:00Z') - Date.parse(desdeIso + 'T00:00:00Z')) / MS_DIA);
  }

  function fechaLarga(iso) {
    return Number(iso.slice(8, 10)) + ' de ' + MESES[Number(iso.slice(5, 7)) - 1] + ' de ' + iso.slice(0, 4);
  }

  /** Fecha de hoy según el reloj del navegador (local). */
  function hoyISO() {
    return fechaISO(new Date());
  }

  /** GOON_CATALOGO.meta.fecha_corte como 'YYYY-MM-DD' o null. */
  function fechaCorte() {
    var c = root.GOON_CATALOGO;
    return c && c.meta ? fechaISO(c.meta.fecha_corte) : null;
  }

  /** Año de referencia por defecto: el del corte del catálogo; sin catálogo, el del reloj. */
  function anioReferenciaDefecto() {
    var corte = fechaCorte();
    return corte ? Number(corte.slice(0, 4)) : new Date().getFullYear();
  }

  /** Normaliza params -> {plazos, tasas, enganche_min_pct, comision_pct, antiguedad_max, edad_mas_plazo_max, vigencia...} o null. */
  function leerParams(params) {
    var p = params;
    if (!p || typeof p !== 'object') {
      var h = root.GOON_HECHOS;
      p = h && h.financiamiento && typeof h.financiamiento === 'object' ? h.financiamiento : null;
    }
    if (!p) return null;

    var tasas = {};
    var fuenteTasas = p.tasas && typeof p.tasas === 'object' ? p.tasas : {};
    for (var k in fuenteTasas) {
      if (!Object.prototype.hasOwnProperty.call(fuenteTasas, k)) continue;
      var plazoK = num(k);
      var t = fraccion(fuenteTasas[k]);
      if (finito(plazoK) && plazoK > 0 && finito(t) && t >= 0) tasas[String(Math.round(plazoK))] = t;
    }

    var lista = Array.isArray(p.plazos) && p.plazos.length ? p.plazos : Object.keys(tasas);
    var vistos = {};
    var plazos = [];
    for (var i = 0; i < lista.length; i++) {
      var pl = num(lista[i]);
      if (!finito(pl) || pl <= 0) continue;
      pl = Math.round(pl);
      if (vistos[pl] || !(String(pl) in tasas)) continue; // sin tasa no hay plazo
      vistos[pl] = true;
      plazos.push(pl);
    }
    plazos.sort(function (a, b) { return a - b; });

    var enganche = fraccion(p.enganche_min_pct);
    var comision = fraccion(p.comision_pct);
    var antig = num(p.antiguedad_max);
    var edadPlazo = num(p.edad_mas_plazo_max);

    // Vigencia de los datos de F&I. Declarada pero ilegible -> falla cerrada.
    var declarada = p.vigencia !== undefined && p.vigencia !== null && p.vigencia !== '';
    var vigIso = declarada ? fechaISO(p.vigencia) : null;
    var diasMax = num(p.vigencia_maxima_dias);
    if (!finito(diasMax) || diasMax < 0) diasMax = DIAS_VIGENCIA_DEFECTO;
    diasMax = Math.round(diasMax);

    return {
      plazos: plazos,
      tasas: tasas,
      enganche_min_pct: finito(enganche) ? enganche : 0.2,
      comision_pct: finito(comision) ? comision : 0,
      antiguedad_max: finito(antig) ? antig : Infinity,
      edad_mas_plazo_max: finito(edadPlazo) ? edadPlazo : Infinity,
      institucion: typeof p.institucion === 'string' && p.institucion.trim() ? p.institucion.trim() : 'la financiera',
      vigencia_declarada: declarada,
      vigencia: vigIso,
      vigencia_maxima_dias: diasMax,
      vigencia_hasta: vigIso ? sumarDias(vigIso, diasMax) : null
    };
  }

  /**
   * Estado de vigencia de los parámetros de financiamiento.
   * hoy: 'YYYY-MM-DD' o Date (opcional; por defecto el reloj del navegador).
   * Se evalúa a la MAYOR entre hoy y GOON_CATALOGO.meta.fecha_corte.
   * Devuelve {verificada, vigente, codigo, vigencia, vigencia_hasta,
   *   fecha_evaluacion, dias_restantes, motivo}. Sin `vigencia` en params:
   *   verificada=false y vigente=true (no hay contra qué comparar).
   */
  function vigencia(params, hoy) {
    return vigenciaNormalizada(leerParams(params), hoy);
  }

  /** Igual que vigencia(), sobre params ya normalizados por leerParams (o null). */
  function vigenciaNormalizada(p, hoy) {
    // hoy ausente o ilegible -> reloj del navegador (nunca «sin fecha» por un argumento malo).
    var hoyIso = fechaISO(hoy) || hoyISO();
    var corte = fechaCorte();
    var evaluacion = hoyIso;
    if (corte && (!evaluacion || corte > evaluacion)) evaluacion = corte;
    var r = {
      verificada: false,
      vigente: true,
      codigo: null,
      vigencia: p ? p.vigencia : null,
      vigencia_hasta: p ? p.vigencia_hasta : null,
      fecha_evaluacion: evaluacion,
      dias_restantes: null,
      motivo: null
    };
    if (!p || !p.vigencia_declarada) return r;
    r.verificada = true;
    if (!p.vigencia) {
      r.vigente = false;
      r.codigo = 'vigencia_invalida';
      r.motivo = 'La fecha de vigencia de las tasas de ' + p.institucion + ' no es legible; ' +
        'no se muestra la cotización. Consulta con F&I.';
      return r;
    }
    if (!evaluacion) {
      // Sin fecha contra la cual comparar (reloj ilegible y sin corte): falla cerrada.
      r.vigente = false;
      r.codigo = 'vigencia_vencida';
      r.motivo = 'No se pudo comprobar la vigencia de las tasas de ' + p.institucion + '. Consulta con F&I.';
      return r;
    }
    r.dias_restantes = diasEntre(evaluacion, p.vigencia_hasta);
    if (evaluacion > p.vigencia_hasta) {
      r.vigente = false;
      r.codigo = 'vigencia_vencida';
      r.motivo = 'Las tasas de ' + p.institucion + ' son del ' + fechaLarga(p.vigencia) +
        ' y estuvieron vigentes hasta el ' + fechaLarga(p.vigencia_hasta) + '. Consulta con F&I.';
    }
    return r;
  }

  /** anioReferencia explícito -> año de entrada.hoy -> año del corte -> reloj. */
  function anioReferenciaDeEntrada(e) {
    if (e.anioReferencia !== undefined && e.anioReferencia !== null && e.anioReferencia !== '') {
      return num(e.anioReferencia);
    }
    var hoy = e.hoy === undefined || e.hoy === null || e.hoy === '' ? null : fechaISO(e.hoy);
    return hoy ? Number(hoy.slice(0, 4)) : anioReferenciaDefecto();
  }

  function edadDe(anioModelo, anioReferencia) {
    var am = num(anioModelo);
    var ar = anioReferencia === undefined || anioReferencia === null ? anioReferenciaDefecto() : num(anioReferencia);
    if (!finito(am) || !finito(ar)) return NaN;
    return Math.max(0, Math.round(ar) - Math.round(am));
  }

  /**
   * Plazos (meses) permitidos para un año modelo (regla de elegibilidad; la
   * vigencia de las tasas la resuelven cotizar() y vigencia()).
   * [] si la antigüedad excede antiguedad_max o no hay parámetros.
   * Sin anioReferencia: el año del corte del catálogo (o el del reloj).
   */
  function plazosPermitidos(anioModelo, anioReferencia, params) {
    var p = leerParams(params);
    if (!p) return [];
    var edad = edadDe(anioModelo, anioReferencia);
    if (!finito(edad) || edad > p.antiguedad_max) return [];
    return p.plazos.filter(function (plazo) {
      return edad + plazo / 12 <= p.edad_mas_plazo_max + 1e-9;
    });
  }

  function mensualidadExacta(monto, tasaAnual, plazo) {
    var r = tasaAnual / 12;
    if (r === 0) return monto / plazo;
    return (monto * r) / (1 - Math.pow(1 + r, -plazo));
  }

  /**
   * Cotiza una unidad.
   * entrada: {precio, anioModelo, anioReferencia?, hoy?, plazo?, engancheMonto? | enganchePct?}
   *   - sin plazo -> el plazo máximo permitido
   *   - sin enganche -> el enganche mínimo
   *   - enganchePct acepta 0.3 o 30
   *   - hoy ('YYYY-MM-DD' o Date) = fecha de la cotización para la vigencia
   *     (por defecto el reloj); sin anioReferencia, también fija el año.
   * Devuelve {valido, motivo, codigo, precio, enganche, enganche_pct, enganche_min,
   *   monto_financiado, comision, pago_inicial, tasa_anual, plazo, mensualidad,
   *   total_mensualidades, plazos_permitidos, edad, anio_referencia,
   *   vigencia_hasta, fecha_evaluacion}.
   * `motivo` es texto listo para mostrar (null si es válido); `codigo` es la clave:
   *   sin_parametros · vigencia_vencida · vigencia_invalida · precio_invalido
   *   · anio_invalido · antiguedad · plazo_no_permitido · enganche_insuficiente
   *   · enganche_excede_precio · sin_tasa
   */
  function cotizar(entrada, params) {
    var e = entrada && typeof entrada === 'object' ? entrada : {};
    var p = leerParams(params);
    var anioRef = anioReferenciaDeEntrada(e);
    var precio = num(e.precio);
    var r = {
      valido: false,
      motivo: null,
      codigo: null,
      precio: finito(precio) ? centavos(precio) : null,
      enganche: null,
      enganche_pct: null,
      enganche_min: null,
      monto_financiado: null,
      comision: null,
      pago_inicial: null,
      tasa_anual: null,
      plazo: null,
      mensualidad: null,
      total_mensualidades: null,
      plazos_permitidos: [],
      edad: null,
      anio_referencia: finito(anioRef) ? anioRef : null,
      vigencia_hasta: null,
      fecha_evaluacion: null
    };

    function invalido(codigo, motivo) {
      r.valido = false;
      r.codigo = codigo;
      r.motivo = motivo;
      return r;
    }

    if (!p || !p.plazos.length) {
      return invalido('sin_parametros', 'No hay parámetros de financiamiento cargados.');
    }
    // Primero la vigencia (como Raúl): con tasas vencidas no se muestra ninguna cifra.
    var vig = vigenciaNormalizada(p, e.hoy);
    r.vigencia_hasta = vig.vigencia_hasta;
    r.fecha_evaluacion = vig.fecha_evaluacion;
    if (!vig.vigente) {
      return invalido(vig.codigo, vig.motivo);
    }
    if (!finito(precio) || precio <= 0) {
      return invalido('precio_invalido', 'El precio no es válido.');
    }
    var edad = edadDe(e.anioModelo, anioRef);
    if (!finito(edad)) {
      return invalido('anio_invalido', 'El año modelo no es válido.');
    }
    r.edad = edad;

    var engancheMin = precio * p.enganche_min_pct;
    r.enganche_min = centavos(engancheMin);

    var permitidos = plazosPermitidos(e.anioModelo, anioRef, params);
    r.plazos_permitidos = permitidos.slice();
    if (!permitidos.length) {
      return invalido('antiguedad',
        'Una unidad ' + Math.round(num(e.anioModelo)) + ' tiene ' + edad + ' años de antigüedad; ' +
        'el crédito aplica a unidades de hasta ' + p.antiguedad_max + ' años.');
    }

    var plazo = e.plazo === undefined || e.plazo === null || e.plazo === ''
      ? permitidos[permitidos.length - 1]
      : Math.round(num(e.plazo));
    r.plazo = finito(plazo) ? plazo : null;
    if (permitidos.indexOf(plazo) === -1) {
      return invalido('plazo_no_permitido',
        'Para un modelo ' + Math.round(num(e.anioModelo)) + ' los plazos disponibles son ' +
        permitidos.join(', ') + ' meses.');
    }

    var enganche;
    if (e.engancheMonto !== undefined && e.engancheMonto !== null && e.engancheMonto !== '') {
      enganche = num(e.engancheMonto);
    } else if (e.enganchePct !== undefined && e.enganchePct !== null && e.enganchePct !== '') {
      enganche = precio * fraccion(e.enganchePct);
    } else {
      enganche = engancheMin;
    }
    if (!finito(enganche) || enganche < 0) {
      return invalido('enganche_insuficiente',
        'El enganche mínimo es de ' + mxn(engancheMin) + ' (' + pctTexto(p.enganche_min_pct) + ' del precio).');
    }
    r.enganche = centavos(enganche);
    r.enganche_pct = enganche / precio;
    if (enganche < engancheMin - TOLERANCIA) {
      return invalido('enganche_insuficiente',
        'El enganche mínimo es de ' + mxn(engancheMin) + ' (' + pctTexto(p.enganche_min_pct) + ' del precio).');
    }
    if (enganche >= precio - TOLERANCIA) {
      return invalido('enganche_excede_precio',
        'El enganche cubre el precio completo: no queda monto por financiar.');
    }

    var tasa = p.tasas[String(plazo)];
    if (!finito(tasa)) {
      return invalido('sin_tasa', 'No hay tasa registrada para ' + plazo + ' meses.');
    }

    var monto = precio - enganche;
    var comision = monto * p.comision_pct;
    var pagoInicial = enganche + comision;
    var mensualidad = mensualidadExacta(monto, tasa, plazo);

    r.valido = true;
    r.monto_financiado = centavos(monto);
    r.comision = centavos(comision);
    r.pago_inicial = centavos(pagoInicial);
    r.tasa_anual = tasa;
    r.mensualidad = centavos(mensualidad);
    r.total_mensualidades = centavos(mensualidad * plazo);
    return r;
  }

  /** Cotizaciones válidas para cada plazo permitido (mismo enganche). */
  function opciones(entrada, params) {
    var e = entrada && typeof entrada === 'object' ? entrada : {};
    var permitidos = plazosPermitidos(e.anioModelo, anioReferenciaDeEntrada(e), params);
    var salida = [];
    for (var i = 0; i < permitidos.length; i++) {
      var copia = {};
      for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) copia[k] = e[k];
      copia.plazo = permitidos[i];
      var c = cotizar(copia, params);
      if (c.valido) salida.push(c);
    }
    return salida;
  }

  /**
   * Cotización «desde»: enganche mínimo y la mensualidad más baja entre los
   * plazos permitidos (en la práctica, el plazo máximo). null si no cotiza
   * (incluye tasas vencidas). hoy: opcional, como en cotizar().
   */
  function desdeDetalle(precio, anioModelo, anioReferencia, params, hoy) {
    var lista = opciones({ precio: precio, anioModelo: anioModelo, anioReferencia: anioReferencia, hoy: hoy }, params);
    var mejor = null;
    for (var i = 0; i < lista.length; i++) {
      if (!mejor || lista[i].mensualidad < mejor.mensualidad ||
          (lista[i].mensualidad === mejor.mensualidad && lista[i].plazo > mejor.plazo)) {
        mejor = lista[i];
      }
    }
    return mejor;
  }

  /** Mensualidad «desde» (número redondeado a centavos) o null. */
  function desde(precio, anioModelo, anioReferencia, params, hoy) {
    var d = desdeDetalle(precio, anioModelo, anioReferencia, params, hoy);
    return d ? d.mensualidad : null;
  }

  var GOON_FIN = {
    version: '1.1.0',
    cotizar: cotizar,
    plazosPermitidos: plazosPermitidos,
    desde: desde,
    desdeDetalle: desdeDetalle,
    opciones: opciones,
    vigencia: vigencia,
    anioReferencia: anioReferenciaDefecto,
    _interno: {
      leerParams: leerParams,
      centavos: centavos,
      mensualidadExacta: mensualidadExacta,
      fechaISO: fechaISO,
      sumarDias: sumarDias,
      hoyISO: hoyISO
    }
  };
  root.GOON_FIN = GOON_FIN;

  if (typeof module !== 'undefined' && module.exports) module.exports = GOON_FIN;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
