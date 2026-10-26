# Go On Camiones — sitio para publicar

Esta es la sección de camiones seminuevos de Go On («Go On Camiones»), lista para que Marketing la monte en
**go-on.mx/camiones**. Es un sitio **estático**: puras páginas HTML, CSS, JavaScript e imágenes, sin servidor ni
base de datos.

## Qué trae este repositorio

| Carpeta o archivo | Qué es |
|---|---|
| `maqueta/` | El sitio completo: diseño, textos, imágenes y el código de las páginas. |
| `docs/requisitos-seguridad-publicacion.md` | Lo que debe cumplir el servidor donde se publique (cabeceras, caché, formularios). Lo pide Ciberseguridad. |

## Cómo verla

- **En tu computadora:** abre `maqueta/index.html` con doble clic. Funciona sin internet.
- **En un servidor de pruebas:** sube el contenido de `maqueta/` tal cual y abre `index.html`.

Las páginas son Inicio, Inventario, Estándar Go-On, Financiamiento, Sucursales, Nosotros, Contacto y una ficha
por cada unidad del inventario (`unidad-<id>.html`).

## Cómo se monta

- **Dónde:** en go-on.mx/camiones, en el mismo servidor del sitio actual.
- **Diseño, textos e imágenes:** se respetan tal cual. El código de las páginas les sirve de base y **pueden
  adaptarlo** para integrarlo a su sitio.
- **Inventario:** lo conectan a **Salesforce**, con los botones de publicación que usan hoy. Las unidades que
  trae la maqueta son solo una muestra (un corte fijo del 24 de septiembre de 2026) para ver el diseño. Si al
  conectarlo falta algún dato que hoy no llega de Salesforce, como fotos, kilometraje o sucursal, avisen a
  Ángel Juárez y se resuelve del lado de Go On Camiones.
- **Formularios:** en la maqueta son de demostración y no envían nada. En el sitio publicado, **cada solicitud
  llega a Salesforce con la sucursal de la unidad y sin asesor fijo**, para que se reparta entre los vendedores
  de esa sucursal. Se registran con las API que entrega Mario. Del lado del servidor deben llevar límite de
  envíos o CAPTCHA, validación y aviso de privacidad (ver `docs/requisitos-seguridad-publicacion.md`, sección
  «Formularios»).
- **WhatsApp:** en la maqueta los botones solo muestran una vista previa del mensaje. El número lo confirma
  Ángel Juárez antes de publicar.
- **Analítica (opcional):** la página ya registra eventos en `window.dataLayer`, como clics al menú, a
  «Ver inventario» y a cotizar, pero no carga Google Tag Manager ni Analytics. Si se agregan, hay que ampliar la
  política de seguridad de contenido (CSP), como explica el documento de requisitos.

## Antes de publicar

- Una dirección de pruebas por **HTTPS**, para que Camila revise que todo se vea igual y Ciberseguridad la
  escanee.
- Respetar las cabeceras y la caché que pide `docs/requisitos-seguridad-publicacion.md`.
- Hoy la página pide **no aparecer en buscadores**, con `robots.txt` y la etiqueta `robots`. Quitar eso al
  sustituir el sitio actual es decisión de Marketing.

## Dudas

- **Diseño y contenido:** Camila López (Cami).
- **Número de WhatsApp y datos de inventario:** Ángel Juárez.
- El área responsable es **Go On Camiones e Innovación**.

## Versiones nuevas

Este repositorio recibe una versión nueva cada vez que cambia el sitio, y cada versión reemplaza su contenido.
Hagan sus adaptaciones en su propia copia, no aquí; el historial de commits muestra qué cambió entre una versión
y otra.
