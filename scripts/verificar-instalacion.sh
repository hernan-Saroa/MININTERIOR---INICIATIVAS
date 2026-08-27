#!/usr/bin/env bash
# =====================================================================
# Comprueba que una instalación quedó correcta. No modifica nada.
#   ./scripts/verificar-instalacion.sh
# =====================================================================
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
[ -f .env ] && set -a && . ./.env && set +a

DB_NAME="${DB_NAME:-iniciativas_legislativas}"
DB_USER="${DB_USER:-iniciativas_app}"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
URL="${URL_APP:-http://localhost:8080}"
CLIENTE="$(command -v mysql || command -v mariadb)"

fallos=0
ok(){ if [ "$2" = "0" ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; fallos=$((fallos+1)); fi; }

if [ -z "${DB_PASSWORD:-}" ]; then
  read -rsp "Contraseña de $DB_USER: " DB_PASSWORD; echo
fi

app(){ MYSQL_PWD="$DB_PASSWORD" "$CLIENTE" -h "$MYSQL_HOST" -u "$DB_USER" \
  --default-character-set=utf8mb4 -D "$DB_NAME" -N -B "$@"; }

echo "Base de datos"
app -e "SELECT 1" >/dev/null 2>&1; ok "la API puede conectarse" $?
# La versión esperada se DERIVA de db/, no se escribe a mano: escrita a
# mano se quedó en 7 cuando ya iban 14, así que este guion daba fallo en
# una instalación correcta y quien lo corría creía tener la base rota.
esperada="$(ls "$(dirname "$0")/../db"/[0-9][0-9]_*.sql 2>/dev/null | sed 's#.*/##' | cut -c1-2 | sort -n | tail -1 | sed 's/^0//')"
actual="$(app -e 'SELECT MAX(version) FROM schema_version;' 2>/dev/null)"
[ -n "$esperada" ] && [ "$actual" = "$esperada" ]
ok "las $esperada migraciones aplicadas (la base dice ${actual:-ninguna})" $?
[ "$(app -e "SELECT nombre_corto FROM direcciones WHERE id='dialogo';" 2>/dev/null)" = "Diálogo Social" ]
ok "las tildes se guardaron bien" $?
[ "$(app -e 'SELECT COUNT(*) FROM permisos;' 2>/dev/null)" -ge 16 ]
ok "catálogo de permisos completo" $?
app -e "DROP TABLE direcciones" >/dev/null 2>&1 && ok "el usuario NO debería poder hacer DROP" 1 || ok "permisos del usuario acotados" 0

echo
echo "Usuarios"
n="$(app -e "SELECT COUNT(*) FROM usuarios u JOIN rol_permisos rp ON rp.rol_id=u.rol_id JOIN permisos p ON p.id=rp.permiso_id WHERE u.activo AND p.clave='roles.administrar';" 2>/dev/null)"
[ "${n:-0}" -ge 1 ]; ok "hay al menos un administrador (${n:-0})" $?

echo
echo "Servicio web en $URL"
codigo="$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/salud" 2>/dev/null)"
[ "$codigo" = "200" ]; ok "/api/salud responde 200 (obtuvo ${codigo:-sin respuesta})" $?
# El listado está abierto A PROPÓSITO: se decidió que quien no tiene
# cuenta ve el tablero. Lo que la sesión protege es la identidad de quien
# radicó, el historial y toda escritura. Este guion exigía 401 y por eso
# marcaba fallo en una instalación que funciona como se acordó.
codigo="$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/iniciativas" 2>/dev/null)"
[ "$codigo" = "200" ]; ok "/api/iniciativas responde sin sesión, como se acordó (obtuvo ${codigo:-sin respuesta})" $?
codigo="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/iniciativas" 2>/dev/null)"
[ "$codigo" = "401" ]; ok "escribir SÍ exige sesión (obtuvo ${codigo:-sin respuesta})" $?
codigo="$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/exportar-csv" 2>/dev/null)"
[ "$codigo" = "401" ]; ok "exportar exige sesión (obtuvo ${codigo:-sin respuesta})" $?
codigo="$(curl -s -o /dev/null -w '%{http_code}' "$URL/" 2>/dev/null)"
[ "$codigo" = "200" ]; ok "la aplicación se sirve (obtuvo ${codigo:-sin respuesta})" $?

echo
if [ "$fallos" = "0" ]; then echo "✓ Todo en orden."; else echo "✗ $fallos comprobaciones fallaron."; exit 1; fi
