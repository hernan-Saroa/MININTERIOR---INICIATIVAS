# Iniciativas Legislativas — aplicación React

Interfaz para el sistema de seguimiento de iniciativas legislativas del
Viceministerio para el Diálogo Social y los Derechos Humanos.

Una sola aplicación con dos zonas de rutas: el tablero en `/` y la
administración en `/admin`. La separación se logra por rutas y permisos,
no manteniendo dos proyectos.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
npm run check      # revisa tipos
```

## Estructura

```
src/
├── main.tsx            rutas y proveedores
├── estilos.css         tokens de diseño (solo administración)
├── tablero-aprobado.css DISEÑO APROBADO — portado literal, no modificar
├── api/
│   ├── tipos.ts        tipos del dominio, espejo de los procedimientos
│   └── cliente.ts      cliente de API + backend simulado
├── ui/
│   ├── base.tsx        piezas del sistema de diseño
│   ├── riel.tsx        el riel de estados
│   └── estructura.tsx  navegación responsive
└── rutas/
    ├── tablero.tsx     el diseño aprobado + panel de flujo
    ├── usuarios.tsx    directorio y aprobación de registros
    ├── roles.tsx       roles y catálogo de permisos
    ├── flujo.tsx       estados, visibilidad y responsables
    └── estadisticas.tsx indicadores del trámite
```

## Conectar con el servidor real

En `src/api/cliente.ts`, cambiar:

```ts
const USAR_SIMULADO = true;   // → false
```

Las firmas de `api.*` no cambian: el resto de la aplicación no se entera.
Faltan por escribir los endpoints `/api/admin/*` que exponen las
migraciones 06 y 07 (roles, permisos, estados, responsables, historial).
Las rutas que espera el cliente están anotadas en cada método.

## El diseño del tablero está bloqueado

`src/tablero-aprobado.css` es el CSS de `frontend/index.html` portado
literalmente. Es la fuente de verdad del aspecto que ve el usuario final
y **no se modifica desde aquí**: cualquier ajuste visual se acuerda con
el Viceministerio y se aplica en los dos lados.

Por eso el tablero es una página completa con su propia franja
institucional, y no vive dentro del menú lateral de administración: son
dos estructuras distintas. Se pasa de una a otra por el enlace
«Administración» de la franja y por «Volver al tablero» del menú.

Tres puntos donde el diseño aprobado y el motor de flujo se tocan, y cómo
se resolvieron sin alterar la página:

**El estado dejaba saltar a cualquier valor.** Era un `<select>` libre;
con transiciones configuradas eso salta el trámite. Ahora la píldora
conserva su geometría exacta pero abre el panel de acciones.

**El color del estado estaba escrito por nombre** (`[data-v="Radicado"]`),
así que los estados nuevos del catálogo salían sin color. Se añadió
`.estado-btn[data-color=…]` con la misma paleta: para los cinco estados
originales el resultado es idéntico.

**Mover, acotar e historial no tenían lugar en la composición.** Viven
en un panel que se abre encima, no en la página.

## Decisiones

**Sin dos aplicaciones separadas.** Dos proyectos implicarían duplicar
autenticación, sistema de diseño y despliegue. Las rutas de `/admin`
van en su propio subárbol y se filtran por permiso.

**TypeScript estricto sobre el dominio.** Los estados y prioridades son
enumeraciones cerradas en la base: al tiparlas, un valor mal escrito
falla al compilar y no en producción.

**TanStack Query para el estado del servidor.** El tablero guarda campo
por campo; caché, reintentos e invalidación no se escriben a mano.

**El riel de estados** es la pieza distintiva: dibuja el flujo
configurado y se reutiliza en el tablero, en configuración y en
estadísticas.

## Accesibilidad

Foco visible en todo lo interactivo, áreas tocables de 44 px en móvil,
`prefers-reduced-motion` respetado y navegación por teclado en los
diálogos. Si aplica la Resolución 1519 de 2020 del MinTIC (WCAG 2.1 AA),
falta una auditoría formal con lector de pantalla.

## Enrutamiento y entornos sin origen

`main.tsx` elige el enrutador según el protocolo: `createBrowserRouter`
cuando hay una URL `http(s)` y `createMemoryRouter` en cualquier otro
caso. Sin ese respaldo, abrir el archivo desde el disco o dentro de un
iframe sin origen (`file:`, `about:srcdoc`, `blob:`) hace que React
Router intente construir una URL inválida y la aplicación no monte.

## Pruebas

```bash
node prueba-humo.mjs      # 22 comprobaciones: tablero, flujo y administración
node prueba-entorno.mjs   # monta con y sin URL navegable
```

Las tres requieren un build previo en formato IIFE (`vite.test.config.ts`),
porque jsdom no ejecuta módulos ES.

**Cuidado al escribir aserciones:** el bundle se inyecta dentro del
`<body>`, así que `document.body.textContent` incluye el código fuente
completo y cualquier comprobación de texto pasa por accidente. Hay que
leer siempre `#raiz`. Y con un diálogo abierto, los campos del
formulario de fondo siguen en el DOM: las consultas deben acotarse a
`[role="dialog"]`.

Monta la aplicación en un DOM simulado y comprueba que arranca, navega
entre las cinco pantallas, abre el detalle de una iniciativa con su
historial y muestra la alerta de estados sin responsables.
