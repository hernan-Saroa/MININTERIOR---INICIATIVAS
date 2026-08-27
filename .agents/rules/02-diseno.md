# El diseño se puede mejorar. Lo que hay debajo, no se rompe

Este archivo sustituye a `02-diseno-bloqueado.md`. **Ya no hay diseño
bloqueado.** La instrucción es explícita: el objetivo es mejorar el
proyecto, y una regla que prohíbe tocar la interfaz impide justamente eso.
Ya había cobrado su precio: el contraste de la paleta incumplía WCAG AA en
ocho combinaciones y llevaba semanas anotado como «pendiente de acordar»
porque los colores estaban congelados.

`web/src/tablero-aprobado.css` es el CSS del tablero y de la vista
pública. Se puede cambiar. `web/src/estilos.css` es el de `/admin`.

## Lo que sí es obligatorio

**1. Contraste WCAG 2.1 AA.** La Resolución 1519 de 2020 del MinTIC lo
exige a las entidades del Estado: 4,5:1 para texto normal, 3:1 para texto
grande (≥18,66 px en negrita o ≥24 px) y para componentes de interfaz.

```bash
node scripts/verificar-contraste.js     # 31 pares; falla si alguno baja
```

Antes se comprobaba a mano y quedaba escrito en un documento, así que
envejecía sin que nadie lo notara. Ahora es una comprobación que falla.
Ejecútela **siempre** que toque un color, en cualquiera de las dos hojas.

Dos advertencias que ya costaron un error:

- Las píldoras de estado son de 11 px en negrita. **No** son «texto
  grande»: el mínimo que les aplica es 4,5:1, no 3:1.
- Un color rebajado con opacidad no tiene el contraste de su color, sino
  el del resultado compuesto. `.sin-dato` al 80 % daba 3,34:1 con un tono
  que a plena intensidad daba 4,98:1.

**2. Identidad institucional.** Navy GOV.CO, azul de acción, los logos del
Ministerio. Es un sitio del Estado colombiano y tiene que parecerlo.

**3. Móvil primero y totalmente responsivo.** Bajo 860 px la tabla se
convierte en una tarjeta por iniciativa. Detalle que ya costó un error:
**hay que restablecer los anchos de columna**. Los porcentajes del
escritorio (22 %, 9 %, 8 %…) siguen aplicando sobre elementos
`display:block` y parten las palabras a mitad. Los campos van a ancho
completo y con aspecto de campo, o el área tocable es apenas el largo del
texto. Mínimo 44 px de área tocable.

**4. Accesibilidad de teclado y de lector de pantalla.** Foco visible en
todo lo interactivo, `prefers-reduced-motion` respetado, nombres
accesibles en los diálogos y en los iconos, y nada alcanzable con el ratón
que no lo sea con el teclado. Lo cubren `prueba-a11y.mjs` y
`prueba-foco.mjs`.

**5. Los nombres de clase que el JSX usa.** Renombrar una clase sin
renombrarla en el `.tsx` no rompe el build ni ninguna prueba de tipos: se
descubre mirando la pantalla. Ya pasó — el CSS definía `.docs-panel`,
`.doc-icon`, `.doc-name`, `.docs-empty` y `.doc-del`, y el JSX usaba
`.clip` y `.docs-hint`, que no existían en ningún sitio. Consecuencia: los
enlaces a documentos no se veían como enlaces y el «sin documentos»
parecía un documento más.

**6. Tailwind solo en `/admin`.** El tablero es CSS llano y funciona en
navegadores muy anteriores. El piso de Chrome 111+ / Safari 16.4+ lo impone
Tailwind 4, y el tablero se consulta desde celulares de gama baja. Ver
`docs/pendientes.md`.

## La referencia

`referencia/tablero-aprobado.html` es el **registro** de la versión
original sin React, no una autoridad que congele nada. Conviene reflejar
en él los cambios visuales para que siga sirviendo de punto de
comparación, y `node referencia/comparar-diseno.mjs` informa de las
diferencias sin exigir que sean cero.

## Composición actual, para saber qué se está moviendo

1. Franja navy con el epígrafe institucional y el estado de sincronización.
2. `header.page-head`: título, descripción y fila de metadatos
   (Dirigido a · Corte · Clasificación · Direcciones vinculadas).
3. Aviso `.notice` de tablero compartido, más el de contraseña provisional
   cuando aplica.
4. Sección **1 Resumen general** con las tarjetas `.stat`, que además son
   los filtros.
5. Sección **2 Iniciativas por dirección**: pestañas, encabezado de la
   dirección y la tabla.
6. Pie con el descargo y el botón de exportar.

## Tres roces ya resueltos, para no repetir la discusión

**El estado era un `<select>` libre.** Con transiciones configuradas,
dejar elegir cualquier valor se salta el trámite. La píldora conserva su
geometría (`.estado-btn` copia las declaraciones de `select.estado-sel`)
pero abre el panel de acciones.

**El color del estado estaba escrito por nombre**
(`.estado-sel[data-v="Radicado"]`), así que los estados nuevos del catálogo
salían sin color. Se añadió `.estado-btn[data-color=…]` con la misma
paleta.

**Los campos editables son `contentEditable`.** React no debe administrar
sus hijos: el contenido inicial se fija una vez con
`dangerouslySetInnerHTML` (escapando el texto) y los cambios externos se
sincronizan por `ref`, solo si el campo no tiene el foco. Si React
redibujara los hijos, borraría el cursor mientras alguien escribe.

## Y lo nuevo puede ir encima o intercalado

El panel de flujo (`.capa-flujo`) abre **sobre** el tablero, y ese patrón
sigue siendo bueno para acciones puntuales. Pero ya no es obligatorio:
si mejorar la pantalla pide reordenar bloques o sustituir la tabla por otra
estructura, se puede, siempre que se cumplan los seis puntos de arriba.
