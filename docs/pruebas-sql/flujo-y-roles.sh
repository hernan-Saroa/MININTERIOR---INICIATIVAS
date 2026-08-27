#!/bin/bash
cd $(git rev-parse --show-toplevel 2>/dev/null || pwd)
mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld
mariadbd --user=mysql > /tmp/mysql.log 2>&1 &
for i in $(seq 1 30); do mariadb -e "SELECT 1" >/dev/null 2>&1 && break; sleep 1; done
mariadb -e "DROP DATABASE IF EXISTS iniciativas_legislativas;"
for f in db/[0-9][0-9]_*.sql; do mariadb --default-character-set=utf8mb4 < "$f" >/dev/null 2>&1; done
mariadb -e "SELECT 1" >/dev/null 2>&1 || { echo "no arrancó la base"; exit 1; }
M="mariadb --default-character-set=utf8mb4 -D iniciativas_legislativas"
q(){ $M -e "$1"; }
esperar_error(){ # $1 = etiqueta, $2 = SQL que debe fallar
  if $M -e "$2" >/dev/null 2>/tmp/err; then echo "  ✗ $1 — NO falló (debería)";
  else echo "  ✓ $1 — $(grep -o 'ERROR.*' /tmp/err | head -1 | cut -c1-95)"; fi
}

echo "### 1. Catálogo de permisos y roles sembrados"
q "SELECT grupo, COUNT(*) AS permisos FROM permisos GROUP BY grupo;"
q "SELECT clave, es_sistema, (SELECT COUNT(*) FROM rol_permisos rp WHERE rp.rol_id=r.id) AS permisos FROM roles r ORDER BY id;"

echo
echo "### 2. Usuarios migrados del ENUM a rol_id"
$M -e "CALL sp_crear_usuario('Carlos Mejía','carlos@mininterior.gov.co',NULL,'viceministro');" >/dev/null
$M -e "CALL sp_crear_usuario('Ana Restrepo','ana@mininterior.gov.co','ddhh','editor');" >/dev/null
$M -e "CALL sp_crear_usuario('Sofía Guerrero','sofia@mininterior.gov.co','consulta','lector');" >/dev/null
q "UPDATE usuarios u JOIN roles r ON r.clave=u.rol SET u.rol_id=r.id WHERE u.rol_id IS NULL;"
q "SELECT u.correo, u.rol AS enum_viejo, r.clave AS rol_nuevo FROM usuarios u JOIN roles r ON r.id=u.rol_id;"

echo
echo "### 3. Permisos efectivos por usuario"
for c in carlos ana sofia; do
  echo -n "  $c: "
  $M -N -e "CALL sp_permisos_de_usuario((SELECT id FROM usuarios WHERE correo='$c@mininterior.gov.co'));" | tr '\n' ' '; echo
done

echo
echo "### 4. Crear un rol nuevo desde la pantalla"
$M -e "CALL sp_guardar_rol(NULL,'Secretaría Jurídica','Revisa conceptos jurídicos','iniciativas.ver,iniciativas.ver_todas,flujo.acotar,flujo.ver_historial,estadisticas.ver');" >/dev/null
q "SELECT clave, nombre, es_sistema, permisos FROM (SELECT r.clave, r.nombre, r.es_sistema, (SELECT GROUP_CONCAT(p.clave) FROM rol_permisos rp JOIN permisos p ON p.id=rp.permiso_id WHERE rp.rol_id=r.id) AS permisos FROM roles r WHERE r.clave='secretaría_jurídica') t;"

echo
echo "### 5. Guardas de roles"
esperar_error "no se borra un rol del sistema" "CALL sp_eliminar_rol((SELECT id FROM roles WHERE clave='editor'));"
echo -n "  reasignar sin admin en el sistema: "
$M -e "CALL sp_asignar_rol((SELECT id FROM usuarios WHERE correo='sofia@mininterior.gov.co'),(SELECT id FROM roles WHERE clave='secretaría_jurídica'));" && echo "✓ permitido"
# Ahora sí hay un administrador: la guarda debe activarse
$M -e "CALL sp_crear_usuario('Admin Sistema','admin@mininterior.gov.co',NULL,'lector');" >/dev/null
$M -e "CALL sp_asignar_rol((SELECT id FROM usuarios WHERE correo='admin@mininterior.gov.co'),(SELECT id FROM roles WHERE clave='administrador'));" >/dev/null
esperar_error "quitarle el rol al único administrador" "CALL sp_asignar_rol((SELECT id FROM usuarios WHERE correo='admin@mininterior.gov.co'),(SELECT id FROM roles WHERE clave='lector'));"
esperar_error "no se borra un rol con usuarios" "CALL sp_eliminar_rol((SELECT id FROM roles WHERE clave='secretaría_jurídica'));"
echo -n "  rol vacío sí se borra: "
$M -e "CALL sp_guardar_rol(NULL,'Rol Temporal','x','iniciativas.ver');" >/dev/null
$M -e "CALL sp_eliminar_rol((SELECT id FROM roles WHERE clave='rol_temporal'));" && echo "✓"

echo
echo "### 6. Estados sembrados y transiciones"
q "SELECT clave, nombre, orden, es_inicial, es_final FROM estados ORDER BY orden;"
$M -e "SELECT o.nombre AS desde, t.tipo, d.nombre AS hacia, t.requiere_motivo AS motivo FROM transiciones t JOIN estados o ON o.id=t.estado_origen JOIN estados d ON d.id=t.estado_destino ORDER BY o.orden, t.tipo;"

echo
echo "### 7. Iniciativas migradas del ENUM a estado_id"
$M -e "CALL sp_crear_iniciativa('ddhh','Proyecto de ley de garantías','Objeto original y amplio','PL 214/2026C','Radicado','Alta','2026-08-19',TRUE);" >/dev/null
$M -e "UPDATE iniciativas i JOIN estados e ON e.nombre=i.estado SET i.estado_id=e.id WHERE i.estado_id IS NULL;" 
q "SELECT i.id, i.estado AS texto_viejo, e.clave AS estado_nuevo FROM iniciativas i JOIN estados e ON e.id=i.estado_id;"

echo
echo "### 8. Responsables por persona"
$M -e "
CALL sp_guardar_responsable((SELECT id FROM estados WHERE clave='radicado'),(SELECT id FROM usuarios WHERE correo='ana@mininterior.gov.co'),TRUE,TRUE,FALSE,FALSE,FALSE);
CALL sp_guardar_responsable((SELECT id FROM estados WHERE clave='radicado'),(SELECT id FROM usuarios WHERE correo='carlos@mininterior.gov.co'),TRUE,TRUE,TRUE,TRUE,TRUE);
CALL sp_guardar_responsable((SELECT id FROM estados WHERE clave='comision'),(SELECT id FROM usuarios WHERE correo='carlos@mininterior.gov.co'),TRUE,TRUE,TRUE,TRUE,TRUE);" >/dev/null
echo "  acciones disponibles para Ana (solo avanzar y devolver):"
$M -e "CALL sp_transiciones_disponibles(1,(SELECT id FROM usuarios WHERE correo='ana@mininterior.gov.co'));"
echo "  acciones disponibles para Sofía (no es responsable):"
$M -e "CALL sp_transiciones_disponibles(1,(SELECT id FROM usuarios WHERE correo='sofia@mininterior.gov.co'));"

echo
echo "### 9. Mover la iniciativa"
esperar_error "Sofía no puede mover" "CALL sp_mover_iniciativa(1,(SELECT id FROM transiciones WHERE tipo='avanzar' AND estado_origen=(SELECT id FROM estados WHERE clave='radicado')),(SELECT id FROM usuarios WHERE correo='sofia@mininterior.gov.co'),NULL);"
esperar_error "devolver sin motivo" "CALL sp_mover_iniciativa(1,(SELECT id FROM transiciones WHERE tipo='devolver' AND estado_origen=(SELECT id FROM estados WHERE clave='radicado')),(SELECT id FROM usuarios WHERE correo='ana@mininterior.gov.co'),'');"
esperar_error "transición que no aplica al estado" "CALL sp_mover_iniciativa(1,(SELECT id FROM transiciones WHERE tipo='avanzar' AND estado_origen=(SELECT id FROM estados WHERE clave='comision')),(SELECT id FROM usuarios WHERE correo='carlos@mininterior.gov.co'),NULL);"
echo -n "  Ana avanza a comisión: "
$M -N -e "CALL sp_mover_iniciativa(1,(SELECT id FROM transiciones WHERE tipo='avanzar' AND estado_origen=(SELECT id FROM estados WHERE clave='radicado')),(SELECT id FROM usuarios WHERE correo='ana@mininterior.gov.co'),NULL);"
echo -n "  Carlos devuelve con motivo: "
$M -N -e "CALL sp_mover_iniciativa(1,(SELECT id FROM transiciones WHERE tipo='devolver' AND estado_origen=(SELECT id FROM estados WHERE clave='comision')),(SELECT id FROM usuarios WHERE correo='carlos@mininterior.gov.co'),'Falta el concepto de la Secretaría Jurídica');"

echo
echo "### 10. Acotar el alcance (no cambia el estado)"
esperar_error "acotar sin motivo" "CALL sp_acotar_iniciativa(1,(SELECT id FROM usuarios WHERE correo='carlos@mininterior.gov.co'),'Objeto recortado','');"
esperar_error "Ana no puede acotar" "CALL sp_acotar_iniciativa(1,(SELECT id FROM usuarios WHERE correo='ana@mininterior.gov.co'),'Objeto recortado','Motivo cualquiera');"
$M -e "CALL sp_acotar_iniciativa(1,(SELECT id FROM usuarios WHERE correo='carlos@mininterior.gov.co'),'Limitado a personas defensoras con medidas vigentes','Se excluye el capítulo presupuestal por concepto de Hacienda');" && echo "  ✓ Carlos acotó"
q "SELECT e.nombre AS estado_tras_acotar, LEFT(i.objeto,52) AS objeto FROM iniciativas i JOIN estados e ON e.id=i.estado_id WHERE i.id=1;"

echo
echo "### 11. Historial completo"
$M -e "CALL sp_historial_iniciativa(1);"

echo
echo "### 12. Alertas y estadísticas del flujo"
echo "  estados sin responsable activo:"
$M -e "CALL sp_estados_sin_responsable();"
echo "  estadísticas por estado:"
$M -e "CALL sp_estadisticas_flujo();"

echo
echo "### 13. Guardas del flujo"
esperar_error "quitar el último responsable" "CALL sp_quitar_responsable((SELECT id FROM estados WHERE clave='comision'),(SELECT id FROM usuarios WHERE correo='carlos@mininterior.gov.co'));"
esperar_error "desactivar estado con iniciativas" "CALL sp_desactivar_estado((SELECT id FROM estados WHERE clave='radicado'));"

echo
echo "### 14. Crear un estado nuevo desde la configuración"
$M -e "CALL sp_guardar_estado(NULL,'En concepto jurídico','morado',3,FALSE,'responsables');" >/dev/null
q "SELECT clave, nombre, orden, visibilidad, iniciativas, responsables_activos FROM (SELECT e.clave, e.nombre, e.orden, COALESCE(v.alcance,'autenticado') AS visibilidad, (SELECT COUNT(*) FROM iniciativas i WHERE i.estado_id=e.id AND i.activo) AS iniciativas, 0 AS responsables_activos FROM estados e LEFT JOIN estado_visibilidad v ON v.estado_id=e.id WHERE e.clave='en_concepto_jurídico') t;"

echo
echo "### 15. El listado devuelve el estado desde el catálogo"
$M -e "CALL sp_listar_iniciativas('ddhh');"

pkill mariadbd
