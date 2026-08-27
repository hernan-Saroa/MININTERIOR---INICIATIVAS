# Referencia — solo lectura

Estos archivos son la aplicación original que está corriendo en producción.
No forman parte del build ni se despliegan desde aquí.

- `tablero-aprobado.html` — **el registro de la versión original sin React.**
  `web/src/tablero-aprobado.css` nació como su CSS portado literalmente.
  Ya **no** es una autoridad que congele el diseño: el proyecto puede y debe
  mejorarse. Conviene reflejar aquí los cambios visuales para que siga
  sirviendo de punto de comparación, pero las diferencias no son un defecto:
  `node referencia/comparar-diseno.mjs` las informa sin exigir que sean cero.
  Última sincronización: 2026-08-26 (el rediseño con Inter, tokens de sombra
  y radio de 12px). El detalle de qué se igualó y qué no está en el
  comentario de cabecera del propio archivo.
- `login.html` — pantalla de ingreso de la versión original.
- `proponer.html` — formulario público de la versión original.
- `README-original.md` — instrucciones de la instalación anterior.

Sirven para dos cosas: comparar que el diseño no derivó, y poder volver a la
versión sin React si hiciera falta.
