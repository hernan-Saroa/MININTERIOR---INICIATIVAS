# Pendientes

> **Documento histórico (notas de trabajo).** Refleja el estado durante el
> desarrollo del monolito y usa rutas antiguas (`api/rutas/…`). Para el estado
> **actual** de calidad y lo que queda por hacer, ver **`docs/auditoria-qa.md`**.
> Se conserva como registro de decisiones, no como fuente autorizada.

---


En orden de dependencia: cada bloque habilita el siguiente.

## 1. Endpoints `/api/admin/*` — RESUELTO

Esta sección describía como pendiente que ninguna ruta expusiera los
veintitrés procedimientos de las migraciones 06 y 07. Ya no es cierto:
**las veinte rutas de aquella tabla existen**, cada una con su permiso,
y se comprobaron una por una contra `api/rutas/admin.js`,
`api/rutas/iniciativas.js` y `api/rutas/publico.js`.

También se cumplieron las dos advertencias que traía:

- El middleware se reescribió: resuelve permisos con
  `sp_permisos_de_usuario` y una caché de 30 s que `invalidarPermisos()`
  vacía en cuanto cambia un rol.
- Todo cambio de configuración llama a `sp_registrar_configuracion`.

Lo que faltaba de verdad no era escribir las rutas, sino que
**funcionaran**: tres de ellas devolvían 500 en todos los casos. Está en
la Ola 7, al final de este documento.

## 2. Retirar las columnas de compatibilidad

`usuarios.rol` e `iniciativas.estado` siguen existiendo para poder volver
atrás. Cuando el sistema lleve algunas semanas estable en producción, una
migración 08 las retira. Antes hay que confirmar que ningún procedimiento las
lea — hoy `sp_mover_iniciativa` todavía escribe en `iniciativas.estado`.

## 3. Recuperación de contraseña — RESUELTA a medias

Esta sección decía que no existía. Sí existe:
`POST /api/auth/solicitar-recuperacion` genera un token con
`crypto.randomBytes(24)`, `POST /api/auth/restablecer-contrasena` lo
consume, y la respuesta es genérica siempre —no revela si el correo está
registrado, que es lo que permitiría enumerar cuentas—.

Lo que **falta** es el último tramo: no hay envío de correo. El enlace
solo se devuelve en la respuesta cuando `MOSTRAR_ENLACE` está activo, que
es una ayuda de desarrollo, no un canal. Hoy sigue haciendo falta que un
administrador entregue el enlace por otro medio.

Falta además la pantalla de cambio de contraseña: ver la Ola 7.

## 4. Captcha en el formulario público

El endpoint de propuestas escribe sin credenciales. Hay límite por IP —diez
propuestas y tres registros cada quince minutos, solo para anónimos— pero eso
detiene un script casero, no una campaña deliberada. Si la URL termina siendo
pública en internet, hace falta captcha.

## 5. Auditoría de accesibilidad

Si aplica la Resolución 1519 de 2020 del MinTIC (WCAG 2.1 nivel AA para
entidades del Estado), hay que confirmarlo con la oficina jurídica del
Ministerio. Lo que ya está: foco visible en todo lo interactivo, áreas
tocables de 44 px en móvil, `prefers-reduced-motion` respetado, etiquetas en
los diálogos, y el **contraste comprobado automáticamente** en 31 pares
(`node scripts/verificar-contraste.js`, dentro de `npm run prueba`).

Lo que falta: una auditoría real con lector de pantalla y una persona
usándolo. Eso no lo sustituye ninguna comprobación automática.

## 6. Edición concurrente

Si dos personas editan la misma iniciativa, gana la última en guardar. Con
seis direcciones trabajando cada una sobre lo suyo es aceptable. Si empieza a
molestar, la salida es un campo de versión y un `409` cuando no coincide.

## Verificaciones pendientes del lado del servidor

**Cómo está publicado el sitio.** Quedó sin confirmar si es
`tailscale serve` (solo el tailnet del Ministerio) o `tailscale funnel`
(alcanzable desde internet). Un `sudo tailscale serve status` lo aclara. La
diferencia importa: se decidió que quien no tiene cuenta ve el tablero
completo, y con `funnel` eso significa exposición pública de los trámites de
consulta previa y de garantías a personas defensoras.

**Las tildes en producción.** Abrir el tablero y mirar las pestañas: si dice
`DiÃ¡logo Social`, la carga inicial se hizo con el charset equivocado y hay
que recargar `db/03_datos_iniciales.sql` con
`--default-character-set=utf8mb4`. Ese mismo problema impide guardar los
estados con tilde.

## Piso de navegador impuesto por Tailwind 4

`web/package.json` usa `tailwindcss@4`. Su salida incluye 28 reglas
`@property`, 38 `color-mix()` y colores en `oklch`, y ninguna se puede
polifillar. El piso real de la aplicación es **Chrome 111+, Safari 16.4+ y
Firefox 128+** (marzo de 2023 en adelante). Por eso el compilador emite las
consultas de medios en sintaxis de rango —`@media (width<=860px)`— y ningún
ajuste de `build` ni de `browserslist` lo cambia.

Importa porque el tablero se consulta desde celulares de gama baja: en un
equipo anterior a esa fecha no se aplica el diseño móvil y se ve el de
escritorio comprimido.

El tablero en sí no necesita Tailwind: `tablero-aprobado.css` es CSS llano y
funciona en navegadores muy anteriores. El piso lo imponen `/admin` y las dos
franjas superiores que se añadieron con Tailwind. Tres salidas posibles, en
orden de coste:

1. Dejarlo como está y declarar el requisito en la documentación de uso.
2. Servir el tablero público sin Tailwind —volver a CSS llano las dos franjas—
   y dejar Tailwind solo en `/admin`, que lo usan funcionarios con equipo de
   dotación.
3. Bajar a Tailwind 3, que no usa esas construcciones.

Es una decisión de producto, no técnica: confirmar con el Viceministerio qué
parque de dispositivos hay que soportar.

## Estado de la autorización en /api/admin — RESUELTO

Las diecisiete rutas exigen ahora **sesión** (montada en `server.js`) y
**permiso** (`tienePermiso(...)` ruta por ruta, en `rutas/admin.js`):

| Rutas | Permiso |
|---|---|
| `GET /usuarios` | `usuarios.ver` |
| `PUT /usuarios/:id`, `GET|PUT /configuracion` | `usuarios.administrar` |
| `GET /permisos`, `GET|POST|PUT|DELETE /roles` | `roles.administrar` |
| `GET|POST|PUT|DELETE /estados`, responsables | `flujo.configurar` |
| `GET /estadisticas/flujo` | `estadisticas.ver` |

Dos decisiones de diseño que conviene no deshacer:

**Los permisos se resuelven contra la base, no contra la sesión.**
`auth/middleware.js` los consulta con `sp_permisos_de_usuario` y los guarda
en una caché de 30 segundos por usuario, que `invalidarPermisos()` vacía en
cuanto cambia un rol. Si se leyeran de la lista que viaja en la sesión, una
revocación no surtiría efecto hasta que la persona cerrara sesión: con roles
editables desde pantalla, eso es una revocación que no revoca. Verificado:
quitar un permiso y repetir la petición con la misma cookie da 403.

**Todo cambio de configuración deja constancia** con
`sp_registrar_configuracion` (roles, estados, responsables, visibilidad y la
política de aprobación). Antes ese procedimiento existía y no lo llamaba
nadie.

Queda pendiente, ya menor: `usuarios.aprobar` no lo exige ninguna ruta
—la aprobación se hace hoy con `PUT /usuarios/:id`, que pide
`usuarios.administrar`—. Si se separan las dos acciones, ese permiso es el
que corresponde a la de aprobar.

## Contraste de la paleta — RESUELTO en la Ola 9

Esta sección pedía llevar el contraste a mesa con el Viceministerio, porque
los colores estaban bloqueados por la regla 02. Esa regla se retiró: el
contraste es una obligación legal —Resolución 1519 de 2020 del MinTIC— y no
una preferencia estética que haya que acordar.

Corregido, y con dos correcciones a lo que esta sección afirmaba:

- **Eran ocho incumplimientos, no cinco.** La mitad estaban en `/admin`,
  que ninguna auditoría había mirado porque su paleta vive en
  `estilos.css` y su mapa de colores nombra clases de Tailwind.
- **`#a4690b` no alcanza**, como esta sección ya advertía, pero el ratio
  medido es 4,15:1, no 4,10:1. Y era el tono que `/admin` ya usaba.

Los tonos que quedaron y el detalle de cada par están en la Ola 9, más
abajo. `node scripts/verificar-contraste.js` los comprueba y falla si
alguno vuelve a bajar del mínimo.

## Ola 5 aplicada — trazabilidad y aspecto perdido en el portado

**Migración 10.** `historial_iniciativa` no podía registrar ediciones: su
`tipo` era un ENUM sin `'edicion'` y no había ninguna columna que dijera
*qué* campo cambió. Se añadieron ambas, y `sp_actualizar_iniciativa` recibe
ahora el autor y escribe un asiento por cada campo que cambió de verdad
(comparando con `<=>`, para que vaciar o rellenar también quede registrado).
El contrato de la migración 08 no se tocó: sigue siendo NULL = no tocar,
`''` = vaciar.

**El PUT ya no acepta `estado`.** Lo escribía en la columna de compatibilidad
sin tocar `estado_id`, y la fila quedaba diciendo dos cosas distintas: la
píldora mostraba un estado y el flujo calculaba transiciones desde el otro.
El estado se mueve por `/:id/mover`, que valida la transición.

**Aspecto aprobado que el portado nunca aplicó.** El CSS definía
`.docs-panel`, `.docs-list`, `.doc-icon`, `.doc-name`, `.docs-empty`,
`.docs-note`, `.doc-del`, `.docs-btn.has-docs` y `.prior-sel[data-v]`, y el
JSX no usaba ninguna: usaba `.clip` y `.docs-hint`, que no existen en ningún
CSS. Consecuencias visibles: los enlaces a documentos no se veían como
enlaces, el «sin documentos» parecía un documento más, no se distinguía qué
iniciativas tienen soporte, y quien podía editar era el único que perdía el
color de la prioridad.

**Lo que sigue esperando al Viceministerio:**

1. **Contraste de la paleta** — cinco combinaciones bajo AA, con los tonos
   alternativos ya calculados más arriba.
2. **`estado_visibilidad`** — configurable en `/admin/flujo` y no aplicada en
   ninguna consulta.
3. **Tarjetas del resumen pulsables** para filtrar — toca `.stat`, que está
   en el bloque bloqueado.
4. **Indicador de guardado en la franja navy** (`.sync-dot`) — reponerlo
   exige recuperar `.navy-bar`, que el portado sustituyó por dos franjas
   Tailwind. Es cambio de composición.

## Ver la identidad de quien radicó — resuelto con un permiso

La revisión de las olas 4 y 5 señaló que el filtro se apoyaba en «hay
sesión», y eso no es una autorización: `POST /api/publico/registrar` crea
cuentas sin aprobación previa, así que cualquiera se hacía una en medio
minuto y volvía a ver el nombre de todas las personas que han radicado.

Se resolvió con un permiso propio, `iniciativas.ver_proponente`
(migración 12), y **no** reutilizando `iniciativas.editar`: atarlo a la
edición confundiría «puede trabajar el expediente» con «puede ver quién lo
radicó», y dejaría al Viceministerio sin forma de separarlas sin tocar
código.

Reparto inicial, modificable desde `/admin/roles`:

| Rol | ¿Ve la identidad? | Por qué |
|---|---|---|
| Editor, Director, Viceministro | **Sí** | atienden el trámite y pueden necesitar contactar |
| Secretaría Jurídica | No | revisa el concepto, no el remitente |
| Administrador | No | administra roles y cuentas, no casos |
| Lector | No | es el rol con el que nacen las cuentas autorregistradas |

Verificado: una cuenta creada por autoservicio no ve la identidad ni el
historial; un editor sí; un administrador no. `CALL
sp_diagnostico_ver_proponente()` lista en cualquier momento qué roles lo
tienen y cuántas personas hay en cada uno — conviene revisarlo tras
cualquier cambio de roles.

**Queda una pregunta abierta para el Despacho:** hoy un editor de Asuntos
Religiosos con `iniciativas.ver_todas` puede ver quién radicó un trámite de
Consulta Previa. Acotar la identidad a la propia dirección es posible, pero
cambia quién ve qué y por eso no se decidió aquí.

## Cierre de los huecos del crítico de completitud

Aplicado todo lo que no requería decisión del Viceministerio:

**Se retiró el control de suplantación de identidad.** `/admin` mostraba un
desplegable «Ver la aplicación como» con la lista de usuarios, sin filtrar por
ningún permiso. Además `api.cambiarUsuario` era el único método del cliente sin
rama contra la API real: operaba sobre los datos del simulador, no encontraba
al usuario y reventaba al leer su rol. Y aunque hubiera funcionado, reescribía
la sesión solo en el navegador. Suplantar para depurar es legítimo, pero
necesita soporte del servidor y quedar en la bitácora de configuración; hasta
entonces no hay control. Los dos botones que lo abrían pasaron a texto.

**Borrar un rol pide confirmación en dos pasos,** y dice cuántas personas
quedarán sin permisos. Antes era un clic, sin deshacer, con el botón a
distancia de pulgar del de «Cancelar» en el pie del móvil.

**La pestaña y la consulta viven en la URL** (`?direccion=` y `?q=`). Ahora se
puede compartir un enlace a una iniciativa, guardar en favoritos la consulta de
un código, y el botón «atrás» deshace el filtro en vez de sacar del sitio.
Cubierto por `web/prueba-url.mjs`.

**Metadatos y favicon.** El `<head>` tenía charset, viewport y título. El canal
por el que un ciudadano recibe este enlace es WhatsApp, y llegaba como tarjeta
gris sin imagen ni resumen. Se añadieron `description`, `og:*`, `theme-color` y
un favicon SVG **deliberadamente neutro** —un expediente, no el escudo—: un
icono que imite la identidad institucional haría parecer publicación oficial
cualquier cosa que se comparta. Y `robots: noindex`, porque el tablero muestra
trámites de consulta previa.

**Hoja de impresión.** No había ninguna regla `@media print` y el documento va
dirigido al Despacho. Se oculta lo que no es contenido, la tabla se ajusta a
A4, el encabezado se repite por hoja, ninguna fila se parte, y los enlaces a
documentos imprimen su URL.

**La fecha de corte sale del servidor** (`GET /api/salud` la devuelve). Salía
del reloj del navegador: un equipo mal puesto en hora fechaba mal un documento
que se imprime y se radica.

**El enlace «EN» se retiró.** Era un `<span>` con cursor de mano y subrayado al
pasar, sin `onClick` ni `href`, y no hay ninguna infraestructura de idioma en
el proyecto.

### Dos cosas que NO se hicieron, y por qué

**Los logos no se cambiaron por el JPG.** Una recomendación anterior decía
servir `logo-govco.jpg` (32 KB) en vez del PNG (163 KB). Al comprobarlo, los
dos PNG tienen **canal alfa**, y van sobre la barra azul: el JPG rompería la
transparencia. El problema real es otro: `logo-govco.png` es de 960×400 px y se
muestra a 32 px de alto —**12,5 veces más grande**—, y `logo-mininterior.png`
es 428×432 para 36-56 px. Redimensionarlos con una herramienta de imagen
ahorraría unos 180 KB de la primera carga. Se añadieron `width` y `height`
reales para que el navegador reserve el hueco y la franja no salte al cargar.

**El paquete no se partió.** `vite.config.ts` usa `viteSingleFile()`, que
inlinea todo en un único HTML de 826 KB. `React.lazy` no ayuda: con
`viteSingleFile` el código igual acaba en el mismo archivo. Partirlo exige
renunciar al archivo único, y eso rompe el escenario que prueba
`prueba-entorno.mjs` —abrir la aplicación desde el disco, sin servidor—. Es una
decisión de producto: si ese escenario ya no hace falta, se puede partir el
paquete y aislar `recharts`, que solo usa `/admin/estadisticas`.

## El tiempo visible y las tarjetas como filtros

Dos cambios de diseño, hechos por instrucción expresa después de advertir que
el segundo toca `.stat`, que está en el bloque bloqueado.

**El tiempo.** Un rastreador de trámites tiene que decir si algo se está
moviendo, y la pantalla mostraba una fecha cruda. Ahora bajo cada píldora de
estado aparece cuánto lleva así, y las filas que merecen atención llevan
franja.

La migración 13 añade `desde_estado` al listado: la fecha del último
movimiento que **cambió** el estado, excluyendo `acotar` y `edicion` porque
corregir una tilde no debe reiniciar el contador. Es NULL mientras no haya
historial, y la interfaz cae entonces a `fecha_actualizacion` **cambiando las
palabras**: «43 d en comisión» es un hecho del sistema; «hace 4 semanas» es lo
más que se puede afirmar de una fecha que teclea una persona.

El umbral está en una constante, `DIAS_PARA_ATENCION = 60` en `tablero.tsx`.
No sale de ninguna norma y **no se ajustó a los datos de demostración**: con
los datos actuales la iniciativa más antigua lleva 57 días, así que el aviso
«X trámites llevan más de 60 días sin moverse» todavía no aparece. Eso es
correcto. Cuando el historial acumule medidas propias de cuánto tarda cada
etapa, ese número se cambia en un solo sitio.

**Las tarjetas.** Las cinco cifras del resumen son ahora los filtros: estado
y prioridad se acumulan, así que «¿qué tengo en comisión con prioridad alta?»
—la consulta diaria— se responde con dos toques. Los filtros viajan en la URL,
como la pestaña y la consulta.

Se resolvió de paso el hallazgo original de que «el resumen cuenta una cosa y
la tabla muestra otra»: ahora las cifras cuentan **lo que está en alcance**
(la dirección activa) y los contadores de las pestañas respetan los filtros
puestos. Un número que se puede pulsar tiene que corresponder a lo que se
obtiene al pulsarlo; eso lo comprueba `prueba-filtros.mjs` tarjeta por
tarjeta.

El aspecto aprobado se conserva: `.stat` sigue poniendo el fondo, el borde, el
borde superior azul, el radio y el relleno. Lo añadido solo neutraliza el
cromo que el navegador pone por ser un `<button>` y agrega el estado activo,
con tres señales a la vez —fondo, borde y `aria-pressed`— para no depender del
color. **No se usó `.pill-accion`**, que habría borrado el borde.

## El bloque bloqueado y la referencia — sincronizados el 2026-08-26

El bloque bloqueado venía modificado por el «rediseño premium» desde antes de
los cambios de las olas 5 y 6, y la referencia seguía en Helvetica Neue. Al
medirlo con un comparador de reglas de base —las de `@media` son
sobrescrituras y daban diferencias falsas— resultó que **divergían 22 de 22
propiedades comprobadas**: no eran tres retoques, era una reelaboración
visual completa.

Se resolvió actualizando `referencia/tablero-aprobado.html`, por instrucción
expresa. Hoy los dos lados coinciden y el comparador queda en el repositorio:

    node referencia/comparar-diseno.mjs    # sale con código 1 si divergieron

Se igualaron: `Inter`, `--radius` 12 px, cuatro tokens nuevos
(`--sombra-sutil/media/elevada`, `--transicion`), la escala de rótulos en
versalitas, los rellenos de `.stat`, `.tab`, `.export-btn` y `tbody td`,
sombra en seis estados de hover, el hover de fila y el brillo superior nuevo
de las tarjetas (`.stat::after`).

**No** se igualaron tres diferencias anteriores al rediseño y propias de la
referencia como página independiente: `.wrap` a 1240 px (el portado usa
1680 px), la posición del margen lateral y `.navy-bar .eyebrow` a 1192 px.

Lo que esto implica, y conviene que el Viceministerio lo sepa: **la
referencia era el documento que respaldaba el diseño avalado, y ahora
registra el rediseño.** Si no lo avalan, el estado anterior está recuperable
en los dos archivos y el detalle de qué cambió está en el comentario de
cabecera de la referencia.

## Ola 7 — la auditoría de seis frentes (2026-08-26)

Trece agentes independientes revisaron API, web, base, documentación,
accesibilidad y lógica de producto; cada hallazgo pasó por un refutador que
intentó tumbarlo abriendo los archivos. Sobrevivieron 40 hallazgos, y un
crítico de completitud encontró 7 huecos que ninguna lente había mirado. Dos
se descartaron por falsos.

Lo que sigue es lo aplicado y verificado contra la base y la API reales.

### Lo más grave: el flujo estaba muerto

`sp_transiciones_disponibles` decidía quién puede mover un trámite con un
JOIN **interno** contra `estado_responsables`. Esa tabla está vacía —y lo
está en cualquier instalación nueva, porque ninguna migración la siembra y
configurarla es un paso manual que no aparece en ningún documento—. El
resultado, medido antes de tocar nada: **cero transiciones para los cinco
usuarios probados, superadministrador incluido**. Las diecisiete iniciativas
activas no se podían mover, y la pantalla no lo decía: el panel simplemente
no ofrecía ninguna acción.

La migración 14 cambia la regla conservando la intención de la tabla:

- Habilita el **permiso** (`flujo.mover`, `flujo.acotar`).
- Si el estado tiene responsables configurados, solo ellos actúan, y con las
  casillas que se les hayan marcado.
- Si no tiene ninguno, basta el permiso. Un estado sin responsable es una
  configuración incompleta, no una orden de detener el trámite.

No se sembraron responsables de oficio: quién responde por cada etapa lo
decide el Viceministerio. `GET /api/admin/estados/sin-responsable` expone
ahora `sp_estados_sin_responsable()`, que existía desde la migración 07 y no
llamaba nadie. Hoy devuelve tres estados con 13 trámites entre ellos.

Verificado de extremo a extremo: un editor pasa de 0 a 2 transiciones, mueve,
el historial registra autor y estados, la transición que exige motivo lo
exige, y un lector sigue sin ver ninguna acción.

### La autorización no era la que la pantalla mostraba

`puedeEscribir` y `mismaDireccion` decidían con `usuarios.rol`, el ENUM de la
fase 2. Pero `sp_asignar_rol` escribe `rol_id`. Las dos cosas se separan en
cuanto alguien toca un rol desde /admin, y ya estaban separadas: las dos
cuentas administradoras tenían `rol_id = administrador` y la columna decía
`viceministro`, así que escribían con permisos de viceministro. Al revés es
peor: **bajar a alguien a Lector desde la pantalla no le quitaba la
escritura.** Una revocación que no revoca.

Ahora autoriza el permiso, en los dos lados: `permisosDe()` en la API y
`fn_tiene_permiso()` dentro de la base. `mismaDireccion` usa
`iniciativas.ver_todas`, así que un rol **nuevo** creado desde /admin ya no
queda encerrado en su dirección aunque se le marque ese permiso. Queda como
regla 6 de `AGENTS.md`.

### Tres rutas de /admin devolvían 500 siempre

| Ruta | Causa | Corrección |
|---|---|---|
| `PUT /admin/usuarios/:id` | llamaba a `sp_cambiar_estado_usuario`, que **no existe** (ERROR 1305) | `sp_actualizar_usuario`, una sola llamada |
| `POST` y `PUT /admin/estados` | siete argumentos contra una firma de seis, y en otro orden (ERROR 1318) | columna `descripcion` y firma de siete |
| `DELETE .../responsables/:uid` | `DELETE` crudo que se saltaba la guarda del procedimiento | usa `sp_quitar_responsable` |

La primera era peor que un fallo limpio: `sp_asignar_rol` ya se había
ejecutado, así que el rol quedaba guardado mientras el operador leía «Error
interno del servidor», sin constancia y con la caché de permisos sin
invalidar. Y la ruta descartaba `direccion_id`, que la pantalla envía:
cambiar de dirección a alguien no hacía nada.

Cuidado al corregir la segunda a mano: no basta con quitar un argumento. El
orden también estaba cruzado —`es_final` iba antes que `orden`—, así que una
corrección ingenua guardaría el color en la columna del orden.

### El tablero pedía los estados a una ruta de administración

`tablero.tsx` consultaba `/api/admin/estados`, que exige `flujo.configurar`.
Para un editor o un director eso es 403, `estados` quedaba `undefined` y **el
panel de flujo no abría nunca**, sin mensaje: el botón no hacía nada. Ahora
usa `/api/publico/flujo`, con clave de caché propia para no pisar la lista
completa que /admin/flujo necesita —esa sí incluye los estados desactivados—.

### Seguridad

- **El formulario público guardaba enlaces sin validar el protocolo.** La
  ruta autenticada ya rechazaba `javascript:`; la que escribe **sin
  credenciales**, no. Corregido, y de paso se validan longitudes.
- **La propuesta se publicaba aunque el envío fallara a mitad.** Se creaba la
  iniciativa y después se insertaban los documentos uno a uno: un enlace
  demasiado largo bastaba para que el ciudadano recibiera un 400 y ningún
  código, creyendo que no se había radicado nada, mientras la iniciativa ya
  estaba visible en el tablero sin sus documentos. Si reintentaba, radicaba
  dos veces lo mismo. Ahora se valida todo **antes** de crear nada. No hay
  transacciones en el proyecto —la API solo llama procedimientos—, así que
  ésta es la salida.
- **El CSV no neutralizaba fórmulas**, y su contenido lo escribe cualquier
  anónimo desde el formulario público: bastaba radicar una propuesta cuyo
  nombre empiece por `=` y esperar a que un funcionario pulse «Exportar» y
  abra el archivo en su equipo del Ministerio. Ahora se antepone un apóstrofo
  a las celdas que empiezan por `= + - @` o tabulador. Y exportar exige
  `iniciativas.exportar`: antes bastaba tener sesión, es decir, bastaba
  autorregistrarse.

### Guardas que avisaban con el daño hecho

`sp_quitar_responsable` borraba la fila y **después** comprobaba si el estado
quedaba sin responsables activos. Con autocommit el borrado ya estaba en
firme: la pantalla mostraba un error y el responsable desaparecía igual. La
guarda no guardaba nada.

Conviene dejar constancia de que este mismo defecto se repitió por descuido
al escribir `sp_actualizar_usuario`, y la prueba lo destapó dejando las dos
cuentas administradoras convertidas en lector. Se restauró la base a su
estado exacto y las dos guardas pasaron a decidir **antes** de tocar la
tabla. Es la regla 7 de `AGENTS.md`.

### El respaldo documentado no servía

Los cuatro documentos ordenaban `mysqldump` **sin `--routines`**. Esa opción
no es opcional aquí: la API no construye SQL, solo hace `CALL sp_x(...)`.
Comprobado sobre la base viva: sin ella el volcado trae **0** procedimientos;
con ella, 46 y la función nueva. Restaurar desde el respaldo documentado
dejaba una base con todos los datos y ni un procedimiento, es decir, cada
endpoint respondiendo «Error interno del servidor», incluido el ingreso.
Corregido en los cuatro.

### Guiones y documentos que llevaban a error

- `scripts/verificar-instalacion.sh` exigía `schema_version = 7` y daba fallo
  en una instalación correcta. Ahora **deriva** la versión esperada del
  último archivo de `db/`, para que no vuelva a vencerse. También exigía 401
  en `GET /api/iniciativas`, que está abierto a propósito: se cambió por 200
  y se añadieron dos comprobaciones nuevas —escribir y exportar sí exigen
  sesión—.
- `docs/migraciones.md` aplicaba `db/0*.sql`, comodín que solo alcanza del 01
  al 09: desde que existe la migración 10 aplicaba **nueve de catorce** en
  silencio.
- `scripts/aplicar-migraciones.js` reaplicaba los catorce archivos siempre.
  Son idempotentes, pero las migraciones 03, 06 y 07 siembran catálogo con
  `ON DUPLICATE KEY UPDATE`: en una base en uso eso **revierte** lo
  configurado desde /admin —un estado renombrado, un color cambiado— sin
  avisar. Ahora aplica solo lo que falta según `schema_version`, con
  `--forzar` para reconstruir a propósito.
- Las cuentas de migraciones («las siete migraciones») se corrigieron en
  `README.md`, `INSTALACION.md`, `docs/instalacion.md` y
  `.agents/workflows/probar-todo.md`, y la tabla de
  `.agents/rules/03-base-de-datos.md` se completó hasta la 14.

---

## Ola 8 — los tres primeros de la lista (2026-08-27)

Migración 15, y con ella un defecto que no estaba en ninguna lista y que
solo salió a la luz al corregir el anterior.

### 8. La contraseña provisional ya se puede cambiar

`POST /api/auth/cambiar-contrasena` existía desde la migración 04 y
**ninguna pantalla lo llamaba**. Como `debe_cambiar` bloquea toda
escritura, quien recibiera una contraseña provisional quedaba en solo
lectura **permanente**; y `npm run crear-usuario` deja precisamente esa
marca, así que una instalación nueva nacía sin nadie que pudiera escribir.

Lo añadido:

- Un modo `cambiar` en `ModalAuth`, con las mismas reglas de fortaleza que
  aplica el servidor, para que el error salga antes de la ida y vuelta.
- Acceso desde la barra superior. Mientras la contraseña sea provisional
  el botón se resalta en ámbar y aparece además un aviso `role="status"`
  sobre la tabla, con el camino: antes el funcionario descubría el bloqueo
  al intentar guardar, con un mensaje que no explicaba cómo salir de él.
- `debe_cambiar` en el tipo `Sesion`. Viajaba desde el ingreso y la
  interfaz no lo declaraba, así que el código `CAMBIO_REQUERIDO` llegaba a
  una pantalla que no sabía qué hacer con él.
- `req.session.save()` antes de responder, por lo mismo que en
  `/ingresar`: el almacén es MySQL y la escritura es asíncrona.

Comprobado de extremo a extremo contra la API real: ingresa, lee, no
escribe; rechaza una contraseña débil y una actual equivocada; la cambia;
y entonces sí escribe, acotado a su dirección.

### Lo que ese arreglo destapó: una cuenta nueva no servía para nada

Al probarlo, la cuenta creada por el camino documentado —rol `editor`—
seguía sin poder escribir después de cambiar la contraseña: **«Su rol no
permite modificar información»**.

La causa: `sp_crear_usuario` escribía únicamente `usuarios.rol`, el ENUM
de la fase 2, y dejaba `rol_id` en NULL. Mientras la autorización se
resolvía con el ENUM eso funcionaba por accidente; al pasar a permisos
—que es lo correcto— quedó a la vista, porque los permisos se unen por
`rol_id`. Es decir: **el único camino documentado para crear la primera
cuenta producía una cuenta sin un solo permiso.**

La migración 15 lo corrige, repara las cuentas que ya nacieron así, y de
paso hace que un rol inexistente falle con un mensaje en vez de
convertirse en «sin permisos, en silencio». `crear-usuario.js` ofrece
ahora los roles del **catálogo**, no una lista fija con los cuatro del
ENUM: antes no se podía dar de alta a nadie como Administrador ni con un
rol creado desde `/admin/roles`.

### 9. Las contraseñas compartidas

`seed_iniciales.js` calculaba **un** hash de una contraseña escrita en
claro en el archivo y lo repartía entre las ocho cuentas, con
`debe_cambiar = FALSE`. Y su `ON DUPLICATE KEY UPDATE` incluía
`contrasena_hash`, así que reejecutarlo —lo único que reconstruye los
datos de demostración— revertía en silencio cualquier contraseña que
alguien hubiera cambiado.

Ahora cada cuenta recibe una contraseña distinta, generada al azar, que se
muestra una vez y nace obligada a cambiarse; y la contraseña solo se
escribe si la cuenta no tiene ninguna. Para reiniciarlas a propósito,
`--reiniciar-claves`.

Se corrigió además un defecto vecino que apareció al probarlo: el guion
escribía los `id` a mano, y en la instalación viva el id 1 es del
administrador, así que el alta de «carlos.mejia» caía en
`ON DUPLICATE KEY` y sobreescribía su fila. Solo se evitaba porque la
cuenta del administrador va última en el arreglo y la restauraba. Los `id`
de las cuentas se retiraron: el correo es clave única y basta.

`crear_superadmin.js` traía la misma contraseña en claro, la reescribía en
cada ejecución, y **concedía los diecisiete permisos al rol
Administrador** —de ahí viene que ese rol tenga hoy
`iniciativas.ver_proponente`, que el diseño acordado le niega—. Ahora
genera la contraseña al azar, no toca la de una cuenta existente, exige el
correo por variable de entorno y concede solo los nueve permisos de
administración. Ampliarlo hay que pedirlo:
`--conceder-todos-los-permisos`.

> **Esto sigue abierto en la base viva.** Las siete cuentas
> institucionales comparten hoy la misma contraseña. Los guiones están
> corregidos para cualquier instalación nueva, pero cambiar las
> credenciales de siete personas reales no es algo que deba hacer un
> guion por su cuenta: `verificar-flujo.js` **falla a propósito** hasta
> que se decida, y dice el comando exacto.
>
> Para verlas: `CALL sp_diagnostico_cuentas();`

### 11. Retirar el acceso a alguien ahora lo retira

`usuarios.activo` se consultaba **exclusivamente** al ingresar, y la
cookie es `rolling` con ocho horas: cada petición la renueva, así que una
sesión en uso no caducaba nunca. Poner `activo = 0` a alguien que deja el
Ministerio no lo expulsaba —seguía escribiendo y exportando el CSV— y lo
mismo valía para bajarle el rol o cambiarle la dirección, porque el
middleware leía la copia congelada en la sesión.

- `identifica` revalida contra la base en cada petición, con la misma
  caché de 30 s que los permisos. Si la cuenta está inactiva o borrada, la
  sesión se destruye ahí mismo; si cambió el rol, la dirección o
  `debe_cambiar`, se refresca.
- Si la base no responde se conserva la sesión y queda constancia en el
  registro. Es deliberado: `identifica` no autoriza nada —eso lo hacen
  `tienePermiso` y `puedeEscribir`, que resuelven contra la base y fallan
  cerrados—, así que caer aquí tumbaría también la consulta pública del
  ciudadano durante una caída de MySQL.
- `sp_cerrar_sesiones_de_usuario` y
  `POST /api/admin/usuarios/:id/cerrar-sesiones` permiten cerrar la sesión
  de otra persona, con constancia. El único remedio anterior era entrar al
  contenedor y borrar filas a mano, y eso no estaba escrito en ninguna
  parte.
- Desactivar a alguien desde `/admin` cierra sus sesiones en la misma
  operación: si hay que acordarse de hacerlo aparte, tarde o temprano no
  se hace.

Comprobado: se desactivó una cuenta con sesión abierta y la petición
siguiente respondió 401. Y cerrar las sesiones de una persona no toca las
de nadie más.

### Una prueba que dependía del reloj

`prueba-filtros.mjs` esperaba 300 ms fijos a que un filtro se soltara. Con
dos DOM montados en el mismo proceso eso dejó de alcanzar en cuanto el
paquete creció 5 kB, y el filtro anterior seguía puesto: la tarjeta
siguiente medía dos filtros a la vez y el síntoma era «dice 5, muestra 1»
—un fallo que parece del producto y era de la prueba—.

Ahora espera la **condición**, con límite de 4 s, y comprueba
explícitamente que cada filtro quedó suelto. Son cuatro aserciones más, no
menos: verificado saboteando `alternarFiltro` para que no soltara nunca
—cinco fallos— y restaurándolo.

### Documentación

Los seis guiones de `api/scripts/` no aparecían en ningún documento, y son
los que dejan la base en un estado usable: las migraciones solo siembran
catálogo. Quedan descritos en `INSTALACION.md`, junto con la contraseña
provisional, cómo se cambia, y qué hacer si varias cuentas comparten
credencial.

## Ola 9 — se retira el diseño bloqueado, y se cobra la deuda (2026-08-27)

Instrucción expresa: **ya no puede existir nada de diseños bloqueados o que
no se puedan tocar; la idea es mejorar este proyecto.**

Se retiró `.agents/rules/02-diseno-bloqueado.md` y en su lugar está
`.agents/rules/02-diseno.md`, que dice lo contrario: el diseño se puede
mejorar, y lo que no se negocia es lo que hay **debajo** del diseño
—contraste, identidad institucional, responsividad, accesibilidad de
teclado y los nombres de clase que el JSX usa—.

Conviene dejar constancia de lo que costó el bloqueo, porque era el
argumento a favor: **el contraste incumplía WCAG AA en ocho combinaciones y
llevaba semanas anotado como «pendiente de acordar con el
Viceministerio»**, porque los colores estaban congelados y la regla exigía
acuerdo previo. Ocho incumplimientos de una obligación legal, esperando una
reunión.

### El contraste, medido y corregido

Se escribió `scripts/verificar-contraste.js`, que calcula el ratio WCAG 2.1
sobre las hojas de estilo reales —resolviendo los tokens de `:root` del
tablero y los del bloque `@theme` de Tailwind en `/admin`— y **falla** si
algún par baja del mínimo.

Lo primero que hizo fue corregir la propia lista de este documento, que
hablaba de cuatro o cinco incumplimientos. Medidos: **ocho**, y la mitad en
`/admin`, que ninguna auditoría había mirado porque su paleta vive en otro
archivo y su mapa de colores (`TONOS`, en `ui/base.tsx`) nombra clases de
Tailwind en vez de hexadecimales.

| Par | Antes | Ahora |
|---|---|---|
| Píldora **En comisión** (ámbar) | 3,02:1 | **4,62:1** |
| Prioridad **Media** (ámbar) | 3,02:1 | **4,62:1** |
| Píldora **Aprobado** (verde) | 3,89:1 | **4,65:1** |
| Aviso `.notice` (tenue sobre tinte azul) | 4,36:1 | **4,61:1** |
| Aviso de contraseña provisional (ámbar) | 4,47:1 | **4,72:1** |
| `/admin` píldora **gris** | 4,36:1 | **4,61:1** |
| `/admin` píldora **ámbar** | 4,15:1 | **4,65:1** |
| `/admin` píldora **verde** | 3,89:1 | **4,65:1** |

Tres tonos cambiaron, y el matiz se conservó moviendo **solo la
luminosidad** en HSL:

- ámbar del tablero `#c9791c` → `#9d5f16`
- verde de las dos hojas `#1f8a5f` → `#1c7c55`
- texto tenue `#69707e` → `#666c7a`, más `--color-ambar` de `/admin`
  `#a4690b` → `#99620a`

El ámbar es el único cambio perceptible (−9,8 % de luminosidad); los otros
están entre 1,6 % y 3,4 %. Se apuntó a 4,6:1 y no a 4,5:1 exacto para
tener holgura ante retoques futuros. Se comprobó además que ámbar y verde
solo se usan como fondo sólido en puntos y barras decorativas, sin texto
encima.

Un dato que corrige lo que decía este documento: `#a4690b`, que se proponía
como alternativa para el ámbar, **tampoco alcanza** —4,15:1 medido, no 4,10—
y de hecho era el que ya usaba `/admin`.

**Ahora el contraste corre en la batería**, primero y antes del build,
porque es barato y es una obligación legal: `npm run prueba` empieza por
`node ../scripts/verificar-contraste.js`. **31 pares.** Antes se comprobaba
a mano y quedaba escrito aquí, así que envejecía sin que nadie lo notara.

### Los tres puntos de accesibilidad que el bloqueo impedía tocar

**La tabla perdía su semántica en móvil.** Bajo 860 px el CSS pone
`display:block` en `table/tbody/tr/td` para convertir cada fila en tarjeta,
y eso hace que el navegador **descarte los roles implícitos de tabla**: un
lector de pantalla deja de anunciar «fila 3 de 14, columna Estado» y lee
una lista plana sin encabezados. Se añadieron `role` explícitos —`table`,
`rowgroup`, `row`, `columnheader`, `cell`—, que es la solución que
recomienda la guía de WAI. En escritorio son redundantes e inofensivos; en
móvil son lo único que conserva la estructura.

**El zoom automático de iOS.** Safari en iPhone amplía la página al enfocar
un campo cuya letra mida menos de 16 px, y **no vuelve al zoom anterior al
salir**: el funcionario se queda con la tabla desencuadrada. La regla estaba
aplicada en cuatro campos sueltos, así que faltaba en todo el ingreso, el
registro y el formulario público. Ahora es una regla única bajo 860 px que
cubre cualquier control, incluidos los que se añadan después, en las dos
hojas.

**`.sin-dato` seguía diluido.** `opacity:.8` sobre el texto tenue daba
3,49:1 sobre el panel y 3,34:1 sobre `panel-2`. Se retiró la opacidad: a
plena intensidad da 5,26:1. No es un tono nuevo, es dejar de diluir uno que
ya cumplía; la cursiva basta para distinguir «sin dato» de un dato.

**Y en `/admin` desde el teléfono no había forma de volver al tablero.**
«Volver al tablero» solo existía en la barra lateral, que en móvil está
oculta: había que editar la URL a mano. Se añadió a la cabecera móvil, con
36 px de alto mínimo. Se retiró de ahí el nombre de la persona —ya está en
la barra lateral y en el tablero— porque en una pantalla de 360 px los tres
controles no caben, y salir importa más que el saludo.

Las cuatro correcciones quedan cubiertas por aserciones nuevas en
`prueba-a11y.mjs`: los roles de la tabla, la regla de 16 px y la ausencia
de opacidad en `.sin-dato`.

### El comparador de diseño ahora informa, no prohíbe

`referencia/comparar-diseno.mjs` salía con código 1 ante cualquier
diferencia, porque divergir era un defecto. Ya no lo es: **sale con 0
siempre** y explica que las diferencias no son un error. Lo que sí falla es
el contraste.

`referencia/tablero-aprobado.html` deja de ser «la fuente de verdad del
diseño aprobado» y pasa a ser el **registro de la versión original sin
React**: sirve para ver de dónde viene cada decisión y para poder volver a
una versión sin dependencias. Recibió los tres tonos corregidos, para que
siga sirviendo de punto de comparación.

## Lo que queda abierto tras la Ola 9

### Necesita decisión del Viceministerio

1. ~~Contraste de la paleta.~~ **RESUELTO en la Ola 9**: eran ocho
   incumplimientos, no cuatro, y la mitad en `/admin`. Ya no necesitaba
   decisión de nadie, porque el diseño dejó de estar bloqueado y el
   contraste es una obligación legal, no una preferencia.
   `node scripts/verificar-contraste.js` comprueba 31 pares en la batería.
2. **`estado_visibilidad`** — se configura y no se aplica en ninguna
   consulta.
3. **Identidad del proponente acotada por dirección** — hoy un editor de una
   dirección ve quién radicó un trámite de otra.
4. **El rol Administrador tiene los 17 permisos**, incluido
   `iniciativas.ver_proponente`, que el diseño acordado le negaba. Se los
   concedió `crear_superadmin.js`. No se cambió aquí porque afecta a las
   cuentas administradoras vivas: es una decisión, no un descuido.
5. **Piso de navegador de Tailwind 4** (Chrome 111+, Safari 16.4+).
6. **Partir el paquete** frente a mantener el archivo único.
7. **Redimensionar los logos** — `logo-govco.png` es 960×400 para 32 px.

### Trabajo pendiente que no necesita decidir nada

8. ~~No hay pantalla para cambiar la contraseña.~~ **RESUELTO en la Ola 8**,
   y con ella el defecto que destapó: `sp_crear_usuario` dejaba `rol_id` en
   NULL, así que la cuenta creada por el camino documentado no tenía ni un
   permiso.
9. **PARCIAL.** Los guiones están corregidos en la Ola 8 —contraseñas
   distintas generadas al azar, provisionales, sin reescribir las que ya
   existen— y quedaron documentados. Pero **las siete cuentas vivas siguen
   compartiendo la misma contraseña**: corregirlo cambia las credenciales de
   siete personas reales, así que queda para decidir.

   ```bash
   cd api && node scripts/seed_iniciales.js --reiniciar-claves
   ```

   Las imprime una sola vez. `scripts/verificar-flujo.js` falla a propósito
   hasta entonces, y `CALL sp_diagnostico_cuentas()` las lista.
10. **PARCIAL.** Los seis guiones de `api/scripts/` quedaron documentados
    en `INSTALACION.md` y la cuenta que crean ya sirve. Sigue siendo cierto
    que las migraciones solo siembran catálogo: si se quiere que una
    instalación limpia quede poblada en un paso, hace falta encadenar los
    guiones en el arranque, y eso es una decisión de despliegue.
11. ~~La sesión es una foto del ingreso.~~ **RESUELTO en la Ola 8**: el
    middleware revalida contra la base en cada petición con caché de 30 s,
    desactivar a alguien cierra sus sesiones en la misma operación, y
    `POST /api/admin/usuarios/:id/cerrar-sesiones` permite cerrar la de otra
    persona con constancia.
12. **`/api/auth` no tiene límite de peticiones** y cada intento anónimo
    cuesta una derivación scrypt de unos 45 ms sobre un pool de 4 hilos. El
    formulario ciudadano sí tiene freno; el endpoint que consume CPU, no.
13. **El formulario público promete notificaciones** que el sistema no puede
    enviar: no hay envío de correo en ninguna parte.
14. **La autorización de tratamiento de datos es obligatoria para radicar y
    no queda registrada** (Ley 1581 de 2012). Se marca una casilla y no se
    guarda ni qué se aceptó ni cuándo.
15. **El interruptor de aprobación de cuentas nuevas no cambia nada** y la
    pantalla afirma lo contrario.
16. **Ninguna pantalla crea iniciativas internas**: todo entra por el
    formulario público con `origen = 'propuesta'`.
17. **Diez de los diecisiete permisos no los verifica ninguna ruta.** Esta
    ola cerró dos (`iniciativas.exportar`, y `flujo.mover` / `flujo.acotar`
    dentro de la base). Los demás siguen siendo catálogo sin código, lo que
    contradice la regla 4 de `AGENTS.md`.
18. **PARCIAL.** La Ola 9 cerró cuatro de los seis: la regla de 16 px contra
    el zoom de iOS (ahora global, en las dos hojas), `.sin-dato` a plena
    intensidad, los roles explícitos que conservan la semántica de la tabla
    en móvil, y la vuelta al tablero desde `/admin` en el teléfono.

    Siguen abiertos: el `textarea` del motivo del panel de flujo no tiene
    nombre accesible, y tres pantallas de `/admin` importan `ErrorPantalla`
    sin usarla, así que una gira sin fin y dos se ven vacías sin explicar
    por qué.
