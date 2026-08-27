#!/bin/bash
cd $(git rev-parse --show-toplevel 2>/dev/null || pwd)
mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld
mariadbd --user=mysql > /tmp/mysql.log 2>&1 &
for i in $(seq 1 30); do mariadb -e "SELECT 1" >/dev/null 2>&1 && break; sleep 1; done

echo "### Migraciones (las 5)"
mariadb -e "DROP DATABASE IF EXISTS iniciativas_legislativas;"
for f in db/[0-9][0-9]_*.sql; do mariadb --default-character-set=utf8mb4 < "$f" 2>/tmp/e && echo "  OK  $f" || { echo "  FALLA $f"; cat /tmp/e; }; done
echo "-- 05 dos veces (idempotente):"
mariadb --default-character-set=utf8mb4 < db/05_propuestas.sql >/dev/null 2>&1 && echo "  OK reejecutable"
mariadb --default-character-set=utf8mb4 -D iniciativas_legislativas -e "SELECT version, descripcion FROM schema_version ORDER BY version;"
mariadb -e "CREATE USER IF NOT EXISTS 'iniciativas_app'@'%' IDENTIFIED BY 'clave_prueba';
GRANT SELECT,INSERT,UPDATE,DELETE,EXECUTE ON iniciativas_legislativas.* TO 'iniciativas_app'@'%'; FLUSH PRIVILEGES;"

cd backend
cat > .env <<'EOF'
DB_HOST=127.0.0.1
DB_USER=iniciativas_app
DB_PASSWORD=clave_prueba
DB_NAME=iniciativas_legislativas
PORT=3000
SESSION_SECRET=secreto-de-prueba
EOF
node -e "
const pool=require('./db'); const {hashear}=require('./auth/contrasena');
(async()=>{
  await pool.query('CALL sp_crear_usuario(?,?,?,?)',['Carlos Mejía','carlos@mininterior.gov.co',null,'viceministro']);
  await pool.query('CALL sp_guardar_contrasena(?,?,?)',['carlos@mininterior.gov.co',await hashear('Viceministro2026'),false]);
  await pool.end();
})();"
node server.js > /tmp/api.log 2>&1 &
for i in $(seq 1 25); do curl -s localhost:3000/api/salud >/dev/null 2>&1 && break; sleep 1; done

J='Content-Type: application/json'
echo
echo "### 1. Sin sesión: qué se puede y qué no"
printf "  %-34s HTTP %s\n" "GET /api/publico/direcciones" "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/publico/direcciones)"
printf "  %-34s HTTP %s\n" "GET /api/iniciativas (privado)" "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/iniciativas)"
printf "  %-34s HTTP %s\n" "GET /proponer.html" "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/proponer.html)"
echo -n "  direcciones expuestas: "; curl -s localhost:3000/api/publico/direcciones | head -c 110; echo

echo
echo "### 2. Propuesta anónima (sin registrarse)"
curl -s -X POST localhost:3000/api/publico/propuestas -H "$J" -d '{
  "direccion_id":"ddhh",
  "nombre":"Proyecto de ley de protección a líderes comunales",
  "objeto":"Ampliar el esquema de protección a juntas de acción comunal",
  "contacto":"Marta Ospina","correo":"marta.ospina@correo.com"}'; echo
echo "-- validaciones:"
echo -n "  nombre corto: "; curl -s -X POST localhost:3000/api/publico/propuestas -H "$J" -d '{"direccion_id":"ddhh","nombre":"corto"}'; echo
echo -n "  sin dirección: "; curl -s -X POST localhost:3000/api/publico/propuestas -H "$J" -d '{"nombre":"Una iniciativa con nombre suficiente"}'; echo
echo -n "  dirección inexistente: "; curl -s -X POST localhost:3000/api/publico/propuestas -H "$J" -d '{"direccion_id":"noexiste","nombre":"Una iniciativa con nombre suficiente"}'; echo
echo -n "  correo inválido: "; curl -s -X POST localhost:3000/api/publico/propuestas -H "$J" -d '{"direccion_id":"ddhh","nombre":"Una iniciativa con nombre suficiente","correo":"no-es-correo"}'; echo

echo
echo "### 3. Registro y adopción de la propuesta anterior"
C=/tmp/nuevo.txt; rm -f $C
echo -n "  clave débil: "; curl -s -X POST localhost:3000/api/publico/registrar -H "$J" -d '{"nombre":"Marta Ospina","correo":"marta.ospina@correo.com","contrasena":"corta"}'; echo
echo -n "  registro válido: "
curl -s -c $C -X POST localhost:3000/api/publico/registrar -H "$J" -d '{
  "nombre":"Marta Ospina","correo":"marta.ospina@correo.com","contrasena":"Comunales2026"}'; echo
echo -n "  correo repetido: "; curl -s -X POST localhost:3000/api/publico/registrar -H "$J" -d '{"nombre":"Otra","correo":"marta.ospina@correo.com","contrasena":"Comunales2026"}'; echo

echo
echo "### 4. Ya registrada: ve el tablero, no puede editar"
echo -n "  ve el tablero: "; curl -s -b $C localhost:3000/api/iniciativas | head -c 80; echo
echo -n "  mis propuestas: "; curl -s -b $C localhost:3000/api/auth/mis-propuestas | head -c 150; echo
echo -n "  intenta editar: "; curl -s -b $C -X PUT localhost:3000/api/iniciativas/1 -H "$J" -d '{"estado":"Aprobado"}'; echo
echo -n "  propone ya con sesión: "
curl -s -b $C -X POST localhost:3000/api/publico/propuestas -H "$J" -d '{
  "direccion_id":"dialogo","nombre":"Mesa territorial de diálogo en el Catatumbo"}'; echo
echo -n "  mis propuestas ahora: "; curl -s -b $C localhost:3000/api/auth/mis-propuestas | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d),'->',[x['nombre'][:38] for x in d])"

echo
echo "### 5. Cómo lo ve el tablero"
CV=/tmp/vice.txt; rm -f $CV
curl -s -c $CV -o /dev/null -X POST localhost:3000/api/auth/ingresar -H "$J" -d '{"correo":"carlos@mininterior.gov.co","contrasena":"Viceministro2026"}'
curl -s -b $CV "localhost:3000/api/iniciativas?direccion_id=ddhh" | python3 -c "
import sys,json
for i in json.load(sys.stdin):
    print('   %-46s origen=%-9s autor=%s' % (i['nombre'][:46], i['origen'], i['propuesta_nombre'] or '—'))"

echo
echo "### 6. Aprobación por el administrador"
mariadb --default-character-set=utf8mb4 -D iniciativas_legislativas -e "CALL sp_aprobar_usuario('marta.ospina@correo.com','ddhh','editor');"
curl -s -b $C -o /dev/null -X POST localhost:3000/api/auth/salir
rm -f $C
curl -s -c $C -o /dev/null -X POST localhost:3000/api/auth/ingresar -H "$J" -d '{"correo":"marta.ospina@correo.com","contrasena":"Comunales2026"}'
echo -n "  ahora edita en DD.HH.: "; curl -s -b $C -X PUT localhost:3000/api/iniciativas/1 -H "$J" -d '{"estado":"Radicado","prioridad":"Alta"}'; echo
echo -n "  sigue sin poder en otra dirección: "; curl -s -b $C -X PUT localhost:3000/api/iniciativas/5 -H "$J" -d '{"estado":"Aprobado"}'; echo

echo
echo "### 7. Límite de peticiones (tope 10 anónimas por 15 min)"
for i in $(seq 1 10); do curl -s -o /dev/null -X POST localhost:3000/api/publico/propuestas -H "$J" \
  -d "{\"direccion_id\":\"dialogo\",\"nombre\":\"Propuesta automatizada numero $i de prueba\"}"; done
echo -n "  intento extra: "; curl -s -X POST localhost:3000/api/publico/propuestas -H "$J" \
  -d '{"direccion_id":"dialogo","nombre":"Propuesta automatizada de desborde"}'; echo

echo
echo "### 8. Estado en la base"
mariadb --default-character-set=utf8mb4 -D iniciativas_legislativas -e "
SELECT origen, COUNT(*) AS total FROM iniciativas WHERE activo=TRUE GROUP BY origen;
SELECT correo, rol, direccion_id, pendiente_aprobacion FROM usuarios;"

echo
echo "### Errores del servidor"
grep -v "escuchando" /tmp/api.log | head -6
pkill -f "node server.js"; pkill mariadbd
echo "### FIN"
