# Iniciativas Legislativas — Viceministerio para el Diálogo Social y los Derechos Humanos

Tablero de seguimiento de iniciativas legislativas de las seis direcciones vinculadas
al Viceministerio, con base de datos, procedimientos almacenados, API y frontend.

## Estructura del proyecto

```
proyecto-iniciativas-legislativas/
├── db/
│   ├── 01_schema.sql            # tablas: direcciones, iniciativas, documentos, usuarios
│   ├── 02_procedimientos.sql    # procedimientos almacenados (CRUD + estadísticas)
│   └── 03_datos_iniciales.sql   # carga de las 6 direcciones
├── backend/
│   ├── server.js                # API REST (Express) que invoca los procedimientos
│   ├── db.js                    # conexión a MySQL
│   ├── package.json
│   ├── .env.example             # plantilla de variables de entorno
│   └── Dockerfile
├── frontend/
│   └── index.html               # tablero (HTML/CSS/JS, sin dependencias externas)
├── docker-compose.yml           # levanta base de datos + backend con un solo comando
└── README.md
```

## Requisitos

- MySQL 8.0+ o MariaDB 10.5+
- Node.js 18+ (si no usa Docker)
- Docker y Docker Compose (opcional, es la vía más rápida)

## Opción A — Levantarlo con Docker (recomendado para probarlo rápido)

```bash
cd proyecto-iniciativas-legislativas
docker compose up -d
```

Esto crea la base de datos, ejecuta automáticamente los tres scripts de `db/`
(esquema, procedimientos y datos iniciales) y levanta la API en el puerto 3000.

Abra en el navegador:

```
http://localhost:3000
```

**Importante:** antes de usarlo en producción, cambie las contraseñas de ejemplo
en `docker-compose.yml` (`MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`).

## Opción B — Instalación manual (servidor propio del Ministerio)

### 1. Base de datos

Con un cliente MySQL (o phpMyAdmin/DBeaver), ejecute en este orden:

```bash
mysql -u root -p < db/01_schema.sql
mysql -u root -p < db/02_procedimientos.sql
mysql -u root -p < db/03_datos_iniciales.sql
```

Cree un usuario de aplicación con permisos sobre la base `iniciativas_legislativas`:

```sql
CREATE USER 'iniciativas_app'@'%' IDENTIFIED BY 'una_clave_segura';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON iniciativas_legislativas.* TO 'iniciativas_app'@'%';
FLUSH PRIVILEGES;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edite .env con los datos reales de su servidor MySQL
npm install
npm start
```

El servidor queda escuchando en `http://localhost:3000` (o el puerto que
configure en `.env`) y sirve tanto la API (`/api/...`) como el frontend
(`/`, el archivo `frontend/index.html`).

### 3. Publicarlo en una URL institucional

Para que el equipo lo consulte desde un enlace real:

- Despliegue el backend en un servidor interno o en la nube (IIS con proxy
  a Node, Nginx + PM2, un contenedor en el clúster del Ministerio, etc.).
- Configúrelo detrás de HTTPS y, si aplica, de la VPN o red institucional.
- Comparta la URL resultante (por ejemplo `https://iniciativas.mininterior.gov.co`)
  con las seis direcciones.

Este paso de despliegue en un servidor con nombre de dominio propio lo debe
realizar el equipo de TI del Ministerio, ya que requiere acceso a la
infraestructura institucional.

## Qué hace cada procedimiento almacenado

| Procedimiento              | Uso                                                          |
|-----------------------------|---------------------------------------------------------------|
| `sp_listar_direcciones`     | Lista las 6 direcciones con el conteo de iniciativas de cada una |
| `sp_listar_iniciativas`     | Lista las iniciativas de una dirección (o todas)              |
| `sp_crear_iniciativa`       | Crea una iniciativa nueva                                      |
| `sp_actualizar_iniciativa`  | Edita nombre, objeto, número de proyecto, estado, prioridad, fecha |
| `sp_eliminar_iniciativa`    | Baja lógica (no borra el historial)                            |
| `sp_listar_documentos`      | Documentos (enlaces) de una iniciativa                         |
| `sp_agregar_documento`      | Agrega un documento/enlace a una iniciativa                     |
| `sp_eliminar_documento`     | Elimina un documento                                            |
| `sp_resumen_estadisticas`   | Totales para las tarjetas del tablero                           |
| `sp_exportar_csv`           | Vista plana lista para el botón "Exportar CSV"                  |

## Notas

- El gestor de documentos guarda **enlaces** al repositorio institucional
  (Drive, OneDrive, gestor documental, SECOP), no archivos binarios — así
  el documento real permanece bajo el control de acceso de ese repositorio.
- Las iniciativas eliminadas no se borran físicamente (`activo = FALSE`),
  para conservar el historial del trámite.
- La tabla `usuarios` queda lista para añadir control de acceso por
  dirección/rol si su equipo de TI decide incorporar autenticación.
