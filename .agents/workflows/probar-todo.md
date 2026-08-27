Verificar el proyecto completo antes de entregar un cambio.

1. **Tipos:** `cd web && npm run check`. Debe salir sin errores.
2. **Build:** `cd web && npm run build`.
3. **Build de prueba:** compilar en formato IIFE, porque jsdom no ejecuta
   módulos ES. Ver `vite.test.config.ts` en `docs/pruebas-web/`.
4. **Pruebas de interfaz:**
   - `node prueba-humo.mjs` — 22 comprobaciones: diseño aprobado, panel de
     flujo, navegación administrativa y alertas.
   - `node prueba-entorno.mjs` — que monte con y sin URL navegable.
5. **Base de datos:** levantar MariaDB, aplicar las quince migraciones en
   orden, ejecutar dos veces las últimas para confirmar idempotencia, y
   correr los scripts de `docs/pruebas-sql/`.
6. **Revisar que el diseño no derivó:** comparar el tablero renderizado
   contra `referencia/tablero-aprobado.html`. Cualquier diferencia visual es
   un error, no una mejora.

Al escribir aserciones nuevas, recordar las dos trampas del arnés: leer
`#raiz` y no `body`, y acotar al `[role="dialog"]` cuando haya un modal
abierto.
