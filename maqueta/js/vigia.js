/*
 * Vigía (script normal en el <head>, corre antes de pintar el <body>): los revelados solo se ocultan con html.js;
 * si el JS no termina de montar (GOON_LISTO) en 3.5 s, se quita .js y la página queda visible.
 * Vive en su propio archivo y no escrito en la página para que la política de contenido
 * (Content-Security-Policy) no tenga que permitir scripts en línea.
 */
(function (d, w) {
  var h = d.documentElement;
  h.className += ' js';
  w.setTimeout(function () {
    if (!w.GOON_LISTO) { h.className = h.className.replace(/(^|\s)js(?=\s|$)/g, ' ') + ' js-fallo'; }
  }, 3500);
})(document, window);
