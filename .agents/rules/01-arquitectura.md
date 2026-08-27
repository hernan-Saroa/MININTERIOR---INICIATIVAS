# Arquitectura

Tres capas, con la lógica de datos en procedimientos almacenados.

```
Navegador (React)  →  Nginx  →  Express  →  MySQL (procedimientos)
```

## Por qué la API es un pasamanos

`api/rutas/*.js` solo hace `CALL sp_x(?)` con parámetros ligados. Ventajas
que hay que preservar:

- Inmune a inyección SQL por construcción: no hay dónde concatenar.
- El DBA del Ministerio puede auditar las reglas sin leer JavaScript.

Costo aceptado: la lógica vive en dos lenguajes. Para entender un endpoint
hay que leer el router y la migración correspondiente.

## Capas del backend

```
api/
├── server.js            monta middlewares, nada más
├── auth/
│   ├── contrasena.js    scrypt del módulo crypto nativo
│   ├── sesion.js        cookie httpOnly, almacén en MySQL
│   └── middleware.js    requiereSesion, permisos por rol y dirección
├── middleware/errores.js  traduce códigos MySQL a HTTP
├── rutas/               un archivo por recurso
└── scripts/             alta de usuarios desde consola
```

Los errores de negocio se lanzan desde los procedimientos con
`SIGNAL SQLSTATE '45000'` y el middleware los devuelve como `409` con el
mensaje tal cual: está escrito para el usuario final.

## Frontend

Una sola aplicación con dos estructuras distintas:

- `/` y `/publico` → el tablero, diseño aprobado, página completa con su
  propia franja institucional.
- `/admin/*` → menú lateral en escritorio, pestañas inferiores en móvil.

No son dos aplicaciones separadas: eso duplicaría autenticación, sistema de
diseño y despliegue. Tampoco es una sola estructura: el tablero aprobado
ocupa la página entera y no cabe dentro del menú.

Estado del servidor con TanStack Query. No escribir caché, reintentos ni
invalidación a mano.

## Autenticación

Sesión en cookie `httpOnly` + `SameSite=Lax`, almacén en la tabla `sesiones`.
No JWT en `localStorage`: la cookie no es accesible desde JavaScript, así que
un XSS no puede robar la sesión. El id de sesión se regenera al autenticar
para evitar fijación.

Si algún día el backend se parte en varios servicios, esto cambia: haría
falta un token firmado que cada servicio verifique sin llamar al de
autenticación.
