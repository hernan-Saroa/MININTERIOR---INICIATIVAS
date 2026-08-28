# Despliegue de la capa de autenticación

> **Nota operativa puntual (histórica).** Describe cómo se activó la
> autenticación sobre una instalación ya existente. Para el despliegue completo
> y actual de la plataforma, ver **`docs/GUIA_DESPLIEGUE_CLOUD.md`**.

---


Guía para pasar el tablero de acceso abierto a acceso con correo y contraseña,
sobre una instalación que ya está funcionando y con datos cargados.

Tiempo estimado: 20 minutos. Requiere una ventana de mantenimiento corta
(el servicio se reinicia una vez).

---

## Antes de empezar

**Respalde la base de datos.** La migración altera la tabla `usuarios`.

```bash
mysqldump -u root -p --default-character-set=utf8mb4 \
  --routines --triggers --events --single-transaction \
  iniciativas_legislativas > respaldo_$(date +%Y%m%d).sql
```

> **`--routines` no es opcional.** `mysqldump` no incluye los
> procedimientos almacenados si no se le pide, y esta API no construye
> SQL: cada endpoint hace `CALL sp_x(...)`. Un respaldo sin esa opción
> trae los datos y **cero** de los 43 procedimientos, así que al
> restaurarlo toda la aplicación responde «Error interno del servidor»,
> incluido el ingreso. Comprobado sobre la base viva: sin `--routines` el
> volcado no tiene ni un `CREATE PROCEDURE`; con él, los tiene todos.

**Verifique si tiene el problema de las tildes.** Abra el tablero y mire las
pestañas de las direcciones:

- Dice `Diálogo Social` → la base está bien, siga al paso 1.
- Dice `DiÃ¡logo Social` → la carga inicial se hizo con el charset equivocado.
  Recargue solo el catálogo de direcciones antes de continuar:

  ```bash
  mysql --default-character-set=utf8mb4 -u root -p < db/03_datos_iniciales.sql
  ```

  Los tres scripts de `db/` ahora traen `SET NAMES utf8mb4` para que no vuelva
  a ocurrir. Este problema también impedía guardar los estados con tilde
  (*En comisión*, *En formulación*).

---

## 1. Migración de base de datos

```bash
mysql --default-character-set=utf8mb4 -u root -p < db/04_autenticacion.sql
```

Es idempotente: si la ejecuta dos veces no rompe nada ni pierde datos.

Agrega a `usuarios` las columnas `contrasena_hash`, `debe_cambiar`,
`intentos_fallidos`, `bloqueado_hasta` y `ultimo_ingreso`; crea la tabla
`sesiones`; y crea la tabla `schema_version` para llevar el control de
migraciones de aquí en adelante.

Permisos del usuario de aplicación (los que ya tiene son suficientes):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
  ON iniciativas_legislativas.* TO 'iniciativas_app'@'%';
```

## 2. Dependencias

```bash
cd backend
npm install
```

Se agregan `express-session` y `express-mysql-session`. Las contraseñas usan
`scrypt` del módulo `crypto` de Node, así que no hay dependencias de cifrado
ni compilación nativa que pueda fallar en el servidor.

## 3. Variables de entorno

Agregue al `.env` que ya tiene:

```bash
# Genere una cadena única para ESTE servidor:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

```
SESSION_SECRET=<la cadena generada>
NODE_ENV=production
ORIGEN_PERMITIDO=https://mininterior.taildcdd19.ts.net
```

`SESSION_SECRET` firma la cookie de sesión. Si lo cambia, se cierran todas las
sesiones abiertas. No lo suba al repositorio.

`NODE_ENV=production` hace que la cookie exija HTTPS. **Si el tablero se sirve
por HTTP plano, nadie podrá entrar** — en ese caso deje `NODE_ENV` sin definir
mientras resuelve el certificado, y anótelo como pendiente.

## 4. Crear el primer usuario

```bash
cd backend
npm run crear-usuario
```

Pregunta nombre, correo, dirección y rol, y pide una contraseña provisional que
no se muestra en pantalla ni queda en el historial de bash. El usuario está
obligado a cambiarla en su primer ingreso.

Cree primero una cuenta con rol `viceministro` para tener acceso a todas las
direcciones, y luego una por cada dirección.

## 5. Reiniciar

```bash
npm start     # o: pm2 restart iniciativas / systemctl restart ...
```

## 6. Verificar

```bash
# Debe responder 401
curl -s -o /dev/null -w "%{http_code}\n" https://<su-url>/api/direcciones

# Debe responder 200
curl -s -o /dev/null -w "%{http_code}\n" https://<su-url>/login.html
```

En el navegador: abrir el tablero debe redirigir al login; después de entrar,
el nombre y el rol aparecen arriba a la derecha con el botón de cerrar sesión.

---

## Qué cambió

### Estructura

`server.js` pasó de 200 líneas con los 11 handlers en línea a 35 líneas que
solo montan middlewares. Los handlers viven ahora en `rutas/`, agrupados por
recurso. Las rutas, los métodos y las respuestas son las mismas de antes.

```
backend/
├── server.js              montaje de middlewares
├── auth/
│   ├── contrasena.js      cifrado y validación de fortaleza
│   ├── sesion.js          cookie de sesión con almacén en MySQL
│   └── middleware.js      requiereSesion, permisos por rol y dirección
├── rutas/                 los 11 endpoints, por recurso
├── middleware/errores.js  manejo centralizado de errores
└── scripts/crear-usuario.js
```

### Seguridad

- **Toda la API exige sesión.** Un solo `app.use('/api', requiereSesion)`;
  las únicas rutas públicas son `/api/salud` y `/api/auth/*`.
- **Contraseñas con scrypt**, salt aleatorio por usuario. En la base solo queda
  el hash: `scrypt$16384$8$1$…`.
- **Sin filtración de usuarios**: correo inexistente y contraseña incorrecta
  devuelven el mismo mensaje y tardan lo mismo.
- **Bloqueo temporal** de 15 minutos al quinto intento fallido.
- **Sesión en cookie `httpOnly`**, no accesible desde JavaScript. El id de
  sesión se regenera al autenticar para evitar fijación de sesión.
- **CORS restringido** al origen configurado (antes aceptaba cualquiera).
- **Enlaces de documentos validados**: solo `http` y `https`. Antes se podía
  guardar un `javascript:` que se ejecutaba al hacer clic desde el tablero.
- **Cuerpo de petición limitado** a 100 KB.

### Permisos (fase 3, ya incluida)

| Rol | Alcance |
|---|---|
| `lector` | Solo consulta |
| `editor` | Escribe en su dirección |
| `director` | Escribe en su dirección, consulta todas |
| `viceministro` | Todo |

Todos pueden **consultar** todas las direcciones — el tablero es de vista
compartida. La restricción es sobre la escritura.

### Correcciones incluidas

- `SET NAMES utf8mb4` en los tres scripts SQL originales.
- Estadísticas devuelven `0` en vez de `null` con la base vacía.
- Fecha del CSV en formato `AAAA-MM-DD` en vez de la fecha larga de JavaScript.
- BOM en el CSV para que Excel en Windows no rompa las tildes.
- Validación de estado, prioridad y fecha antes de llegar a MySQL: ahora
  devuelve `400` con el detalle en vez de `500 Error al actualizar`.

---

## Pendientes conocidos

**El `PUT` sigue reemplazando, no actualizando.** Una petición que omita
`objeto`, `numero_proyecto` o `fecha_actualizacion` deja esos campos vacíos.
El tablero siempre envía el registro completo, así que no se manifiesta, pero
sigue siendo una trampa para integraciones futuras. No se cambió a propósito:
corregirlo eliminaría la posibilidad de borrar un campo dejándolo en blanco,
que es como funciona hoy la edición en pantalla.

**No hay recuperación de contraseña.** Si alguien olvida la suya, un
administrador debe reasignarla con `npm run crear-usuario` usando el mismo
correo. Para ~30 usuarios es manejable; si crece, conviene el envío por correo.

**Sin auditoría de cambios.** Ya hay identidad, así que registrar quién cambió
el estado de cada iniciativa es el siguiente paso natural y de bajo costo.

**Sin edición concurrente controlada.** Si dos personas editan la misma
iniciativa, gana la última en guardar.

**Docker sigue sin servir el frontend.** `server.js` busca los estáticos en
`../frontend` y el `docker-compose.yml` los monta en `/app/frontend`. La
instalación manual no se ve afectada.

**Pendiente de endurecimiento**: `helmet`, quitar el mapeo del puerto 3306 en
`docker-compose.yml` y rotar las contraseñas de ejemplo que trae ese archivo.
