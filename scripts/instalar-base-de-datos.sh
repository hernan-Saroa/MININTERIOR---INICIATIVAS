#!/usr/bin/env bash
# =====================================================================
# Instala la base de datos completa: la crea, aplica las siete
# migraciones en orden y deja el usuario de aplicación con sus permisos.
#
#   ./scripts/instalar-base-de-datos.sh
#
# Es idempotente: se puede volver a correr sobre una base que ya existe
# sin perder datos. Lee la configuración de .env si está presente.
# =====================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

# --- Configuración ---------------------------------------------------
[ -f .env ] && set -a && . ./.env && set +a

DB_NAME="${DB_NAME:-iniciativas_legislativas}"
DB_USER="${DB_USER:-iniciativas_app}"
DB_HOST_APP="${DB_HOST_APP:-%}"        # '%' para Docker, 'localhost' si es local
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_ADMIN="${MYSQL_ADMIN:-root}"

# El cliente puede ser mysql o mariadb
CLIENTE="$(command -v mysql || command -v mariadb || true)"
if [ -z "$CLIENTE" ]; then
  echo "✗ No encuentro el cliente mysql ni mariadb en el PATH." >&2
  exit 1
fi

# --- Contraseñas -----------------------------------------------------
# No se pasan por argumento: quedarían en el historial del shell y en la
# lista de procesos.
if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  read -rsp "Contraseña de $MYSQL_ADMIN en MySQL: " MYSQL_ROOT_PASSWORD
  echo
fi
if [ -z "${DB_PASSWORD:-}" ]; then
  read -rsp "Contraseña que tendrá $DB_USER: " DB_PASSWORD
  echo
  read -rsp "Repítala: " DB_PASSWORD2
  echo
  [ "$DB_PASSWORD" = "$DB_PASSWORD2" ] || { echo "✗ No coinciden." >&2; exit 1; }
fi
[ ${#DB_PASSWORD} -ge 12 ] || { echo "✗ La contraseña de $DB_USER debe tener al menos 12 caracteres." >&2; exit 1; }

# El charset explícito no es opcional: un cliente en latin1 guarda las
# tildes doble-codificadas y crea los parámetros de los procedimientos en
# latin1, con lo que fallan los ENUM con acento ("En comisión").
admin() {
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$CLIENTE" \
    -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_ADMIN" \
    --default-character-set=utf8mb4 "$@"
}

echo
echo "Base:     $DB_NAME"
echo "Servidor: $MYSQL_HOST:$MYSQL_PORT"
echo "Usuario:  $DB_USER@$DB_HOST_APP"
echo

# --- 1. Conexión ------------------------------------------------------
echo "1/4 · Comprobando la conexión"
if ! admin -e "SELECT VERSION();" >/dev/null 2>&1; then
  echo "    ✗ No pude conectar. Revise host, puerto y contraseña." >&2
  exit 1
fi
echo "    ✓ $(admin -N -B -e 'SELECT VERSION();')"

# --- 2. Migraciones ---------------------------------------------------
echo "2/4 · Aplicando migraciones"
for archivo in db/[0-9][0-9]_*.sql; do
  printf '    %-28s ' "$(basename "$archivo")"
  if admin < "$archivo" >/dev/null 2>/tmp/error_migracion; then
    echo "✓"
  else
    echo "✗"
    echo "--- error ---" >&2
    head -5 /tmp/error_migracion >&2
    exit 1
  fi
done

# --- 3. Usuario de aplicación ----------------------------------------
# Solo los permisos que la API necesita: no tiene ALTER ni DROP, así que
# un fallo en el código no puede alterar el esquema.
echo "3/4 · Usuario de aplicación"
admin <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'${DB_HOST_APP}' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'${DB_HOST_APP}' IDENTIFIED BY '${DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
  ON \`${DB_NAME}\`.* TO '${DB_USER}'@'${DB_HOST_APP}';
FLUSH PRIVILEGES;
SQL
echo "    ✓ ${DB_USER}@${DB_HOST_APP} con SELECT, INSERT, UPDATE, DELETE y EXECUTE"

# --- 4. Verificación --------------------------------------------------
echo "4/4 · Verificando"
admin -D "$DB_NAME" -N -B -e "
SELECT 'Tablas', COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();
SELECT 'Procedimientos', COUNT(*) FROM information_schema.routines WHERE routine_schema = DATABASE();
SELECT 'Direcciones', COUNT(*) FROM direcciones;
SELECT 'Estados del flujo', COUNT(*) FROM estados;
SELECT 'Permisos', COUNT(*) FROM permisos;
SELECT 'Roles', COUNT(*) FROM roles;
SELECT 'Última migración', MAX(version) FROM schema_version;
" | while IFS=$'\t' read -r etiqueta valor; do
  printf '    %-24s %s\n' "$etiqueta" "$valor"
done

# Prueba de tildes: si el charset se aplicó mal, esto sale con basura
NOMBRE="$(admin -D "$DB_NAME" -N -B -e "SELECT nombre_corto FROM direcciones WHERE id='dialogo';")"
printf '    %-24s %s ' "Prueba de tildes" "$NOMBRE"
if [ "$NOMBRE" = "Diálogo Social" ]; then
  echo "✓"
else
  echo "✗"
  echo
  echo "    ⚠ Las tildes quedaron mal. Recargue el catálogo con:" >&2
  echo "      mysql --default-character-set=utf8mb4 -u root -p < db/03_datos_iniciales.sql" >&2
  exit 1
fi

echo
echo "✓ Base de datos lista."
echo
echo "Siguiente paso: crear el primer usuario administrador."
echo "  cd api && npm install && npm run crear-usuario"
