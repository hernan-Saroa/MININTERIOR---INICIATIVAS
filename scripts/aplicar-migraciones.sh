#!/usr/bin/env bash
# =====================================================================
# Aplica TODAS las migraciones de los microservicios a una base MySQL,
# en el orden correcto y sin duplicar. Misma lógica que el servicio
# `migrador` de infra-iniciativas, pero como script suelto para aplicarlas
# a mano en cualquier entorno (desarrollo local, un servidor, etc.).
#
# Las migraciones viven repartidas en ms-*/migraciones/NN_*.sql y se
# numeran de forma GLOBAL. El orden lo da el número del archivo, no el
# repositorio. La 06 está duplicada (auth y administración): se aplica una
# sola vez. Todas son idempotentes: volver a correr no rompe nada.
#
# Uso (desde cualquier carpeta):
#
#   # Contra una base accesible por red (requiere el cliente `mysql`):
#   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD=... \
#     ./scripts/aplicar-migraciones.sh
#
#   # Contra una base que corre en un contenedor Docker (no requiere
#   # tener el cliente `mysql` instalado en la máquina):
#   DB_CONTAINER=iniciativas-mysql-1 DB_USER=root DB_PASSWORD=desarrollo \
#     ./scripts/aplicar-migraciones.sh
#
# Variables (con sus valores por defecto):
#   DB_NAME=iniciativas_legislativas
#   DB_HOST=127.0.0.1   DB_PORT=3306   DB_USER=root   DB_PASSWORD=(vacío)
#   DB_CONTAINER=(vacío)  -> si se define, se usa `docker exec` en vez del
#                            cliente `mysql` local.
# =====================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

DB_NAME="${DB_NAME:-iniciativas_legislativas}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_CONTAINER="${DB_CONTAINER:-}"

# Ejecuta el SQL que llega por stdin contra la base, siempre en utf8mb4.
correr_mysql() {
  if [ -n "$DB_CONTAINER" ]; then
    docker exec -i "$DB_CONTAINER" \
      mysql --default-character-set=utf8mb4 -u"$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME"
  else
    mysql --default-character-set=utf8mb4 \
      -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME"
  fi
}

echo "Aplicando migraciones a '$DB_NAME'${DB_CONTAINER:+ (contenedor $DB_CONTAINER)}…"

# Orden global por nombre de archivo, deduplicando por nombre (la 06).
ARCHIVOS=$(for p in ms-*/migraciones/*.sql; do echo "$(basename "$p")|$p"; done \
  | sort | awk -F'|' '!v[$1]++{print $2}')

if [ -z "$ARCHIVOS" ]; then
  echo "No se encontraron migraciones (ms-*/migraciones/*.sql). ¿Se corrió desde el repositorio con los submódulos?" >&2
  exit 1
fi

n=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  printf '  -> %-40s ' "$(basename "$f")"
  if correr_mysql < "$f" >/dev/null 2>/tmp/mig-err.$$; then
    echo "OK"
  else
    echo "ERROR"
    cat /tmp/mig-err.$$ >&2
    rm -f /tmp/mig-err.$$
    exit 1
  fi
  n=$((n + 1))
done <<< "$ARCHIVOS"
rm -f /tmp/mig-err.$$ 2>/dev/null || true

echo "Listo: $n migraciones aplicadas (idempotentes)."
