#!/bin/bash
cd $(git rev-parse --show-toplevel 2>/dev/null || pwd)
C=/tmp/galletas.txt; rm -f $C

echo "### Base de datos limpia + las 4 migraciones"
mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld
mariadbd --user=mysql > /tmp/mysql.log 2>&1 &
for i in $(seq 1 30); do mariadb -e "SELECT 1" >/dev/null 2>&1 && break; sleep 1; done
mariadb -e "DROP DATABASE IF EXISTS iniciativas_legislativas;"
for f in db/01_schema.sql db/02_procedimientos.sql db/03_datos_iniciales.sql db/04_autenticacion.sql; do
  mariadb --default-character-set=utf8mb4 < "$f" 2>/tmp/e && echo "  OK  $f" || { echo "  FALLA $f"; cat /tmp/e; }
done
echo "-- migración aplicada dos veces (debe ser idempotente):"
mariadb --default-character-set=utf8mb4 < db/04_autenticacion.sql 2>&1 | head -2 && echo "  OK  reejecutable"
mariadb -e "CREATE USER IF NOT EXISTS 'iniciativas_app'@'%' IDENTIFIED BY 'clave_prueba'; GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON iniciativas_legislativas.* TO 'iniciativas_app'@'%'; FLUSH PRIVILEGES;"
mariadb --default-character-set=utf8mb4 -D iniciativas_legislativas -e "SELECT version, descripcion FROM schema_version;"

echo
echo "### Alta de dos usuarios (simulando el script interactivo)"
cd backend
cat > .env <<EOF
DB_HOST=127.0.0.1
DB_USER=iniciativas_app
DB_PASSWORD=clave_prueba
DB_NAME=iniciativas_legislativas
PORT=3000
SESSION_SECRET=secreto-de-prueba-no-usar-en-produccion
EOF
node -e "
const pool=require('./db'); const {hashear}=require('./auth/contrasena');
(async()=>{
  for(const u of [['Ana Restrepo','ana@mininterior.gov.co','ddhh','editor','ClaveProvisional9'],
                  ['Carlos Mejía','carlos@mininterior.gov.co',null,'viceministro','ClaveProvisional9']]){
    await pool.query('CALL sp_crear_usuario(?,?,?,?)',[u[0],u[1],u[2],u[3]]);
    await pool.query('CALL sp_guardar_contrasena(?,?,?)',[u[1],await hashear(u[4]),true]);
    console.log('  creado:',u[1],'·',u[3]);
  }
  await pool.end();
})();"

node server.js > /tmp/api.log 2>&1 &
for i in $(seq 1 20); do curl -s localhost:3000/api/salud >/dev/null 2>&1 && break; sleep 1; done

echo
printf '{"direccion_id":"ddhh","nombre":"X"}' > /tmp/nueva.json
echo "### 1. Sin sesión, la API debe rechazar todo"
for r in /api/direcciones /api/iniciativas /api/estadisticas /api/exportar-csv; do
  printf "  %-22s -> HTTP %s\n" "$r" "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000$r)"
done
printf "  %-22s -> HTTP %s (crear sin sesión)\n" "POST /api/iniciativas" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/iniciativas -H 'Content-Type: application/json' -d @/tmp/nueva.json)"
printf "  %-22s -> HTTP %s (login sigue público)\n" "GET /login.html" \
  "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/login.html)"

echo
echo "### 2. Contraseña incorrecta"
curl -s -X POST localhost:3000/api/auth/ingresar -H 'Content-Type: application/json' \
  -d '{"correo":"ana@mininterior.gov.co","contrasena":"equivocada"}'; echo
echo "-- correo inexistente (mismo mensaje, sin filtrar quién existe):"
curl -s -X POST localhost:3000/api/auth/ingresar -H 'Content-Type: application/json' \
  -d '{"correo":"nadie@mininterior.gov.co","contrasena":"equivocada"}'; echo

echo
echo "### 3. Bloqueo tras 5 intentos"
for i in 1 2 3 4; do curl -s -o /dev/null -X POST localhost:3000/api/auth/ingresar \
  -H 'Content-Type: application/json' -d '{"correo":"ana@mininterior.gov.co","contrasena":"mala"}'; done
echo -n "  intento 6: "; curl -s -X POST localhost:3000/api/auth/ingresar -H 'Content-Type: application/json' \
  -d '{"correo":"ana@mininterior.gov.co","contrasena":"ClaveProvisional9"}'; echo
mariadb -D iniciativas_legislativas -e "UPDATE usuarios SET intentos_fallidos=0, bloqueado_hasta=NULL;"
echo "  (desbloqueada para seguir la prueba)"

echo
echo "### 4. Ingreso correcto con contraseña provisional"
curl -s -c $C -X POST localhost:3000/api/auth/ingresar -H 'Content-Type: application/json' \
  -d '{"correo":"ana@mininterior.gov.co","contrasena":"ClaveProvisional9"}'; echo
echo "-- la API bloquea hasta que cambie la clave:"
curl -s -b $C localhost:3000/api/direcciones | head -c 200; echo
echo "-- contraseña nueva débil:"
curl -s -b $C -X POST localhost:3000/api/auth/cambiar-contrasena -H 'Content-Type: application/json' \
  -d '{"actual":"ClaveProvisional9","nueva":"corta"}'; echo
echo "-- contraseña nueva válida:"
curl -s -b $C -c $C -X POST localhost:3000/api/auth/cambiar-contrasena -H 'Content-Type: application/json' \
  -d '{"actual":"ClaveProvisional9","nueva":"Dialogo2026Social"}'; echo

echo
echo "### 5. Ya con sesión: el tablero funciona igual que antes"
echo -n "  direcciones: "; curl -s -b $C localhost:3000/api/direcciones | head -c 90; echo
echo -n "  estadísticas vacías (antes salía null): "; curl -s -b $C localhost:3000/api/estadisticas; echo
ID=$(curl -s -b $C -X POST localhost:3000/api/iniciativas -H 'Content-Type: application/json' \
  -d '{"direccion_id":"ddhh","nombre":"Proyecto de ley de garantías","estado":"Radicado","prioridad":"Alta","fecha_actualizacion":"2026-08-24"}' | sed 's/[^0-9]//g')
echo "  iniciativa creada id=$ID"
echo -n "  PUT con estado acentuado: "; curl -s -b $C -X PUT localhost:3000/api/iniciativas/$ID \
  -H 'Content-Type: application/json' -d '{"nombre":"Proyecto de ley de garantías","estado":"En comisión","prioridad":"Alta"}'; echo
echo -n "  estado inválido (antes daba 500): HTTP "
curl -s -b $C -o /tmp/r -w '%{http_code} ' -X PUT localhost:3000/api/iniciativas/$ID \
  -H 'Content-Type: application/json' -d '{"nombre":"X","estado":"Inventado"}'; cat /tmp/r; echo
echo -n "  enlace javascript: HTTP "
curl -s -b $C -o /tmp/r -w '%{http_code} ' -X POST localhost:3000/api/iniciativas/$ID/documentos \
  -H 'Content-Type: application/json' -d '{"nombre":"malicioso","enlace":"javascript:alert(1)"}'; cat /tmp/r; echo
echo -n "  enlace válido: "; curl -s -b $C -X POST localhost:3000/api/iniciativas/$ID/documentos \
  -H 'Content-Type: application/json' -d '{"nombre":"Exposición de motivos","enlace":"https://drive.google.com/x"}'; echo
echo "  CSV:"; curl -s -b $C localhost:3000/api/exportar-csv | sed 's/^/    /'

echo
echo "### 6. Permisos por dirección (Ana es editora de DD.HH.)"
echo -n "  crear en Consulta Previa: HTTP "
curl -s -b $C -o /tmp/r -w '%{http_code} ' -X POST localhost:3000/api/iniciativas -H 'Content-Type: application/json' \
  -d '{"direccion_id":"consulta","nombre":"Ajena"}'; cat /tmp/r; echo
echo -n "  ver iniciativas de otra dirección: HTTP "
curl -s -b $C -o /dev/null -w '%{http_code}\n' "localhost:3000/api/iniciativas?direccion_id=consulta"

echo
echo "### 7. Viceministro puede en cualquier dirección"
CV=/tmp/galletas-vice.txt; rm -f $CV
curl -s -c $CV -o /dev/null -X POST localhost:3000/api/auth/ingresar -H 'Content-Type: application/json' \
  -d '{"correo":"carlos@mininterior.gov.co","contrasena":"ClaveProvisional9"}'
curl -s -b $CV -c $CV -o /dev/null -X POST localhost:3000/api/auth/cambiar-contrasena \
  -H 'Content-Type: application/json' -d '{"actual":"ClaveProvisional9","nueva":"Viceministro2026"}'
echo -n "  crear en Consulta Previa: HTTP "
curl -s -b $CV -o /tmp/r -w '%{http_code} ' -X POST localhost:3000/api/iniciativas -H 'Content-Type: application/json' \
  -d '{"direccion_id":"consulta","nombre":"Decreto de consulta previa"}'; cat /tmp/r; echo

echo
echo "### 8. Cerrar sesión"
curl -s -b $C -c $C -X POST localhost:3000/api/auth/salir; echo
echo -n "  API después de salir: HTTP "; curl -s -b $C -o /dev/null -w '%{http_code}\n' localhost:3000/api/direcciones

echo
echo "### 9. Cookie de sesión"
grep -i "iniciativas.sid" $CV | awk '{print "  HttpOnly:", ($1 ~ /^#HttpOnly/ ? "sí" : "NO")}'
mariadb -D iniciativas_legislativas -e "SELECT COUNT(*) AS sesiones_en_bd FROM sesiones;"
echo "  ¿la contraseña queda en texto plano?"
mariadb -D iniciativas_legislativas -e "SELECT correo, LEFT(contrasena_hash, 28) AS hash FROM usuarios;"

echo
echo "### Errores del servidor"
grep -v "escuchando" /tmp/api.log | head -10
pkill -f "node server.js"; pkill mariadbd
echo "### FIN"
