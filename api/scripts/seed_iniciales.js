#!/usr/bin/env node
// ---------------------------------------------------------------------
// Datos de demostración: las ocho cuentas institucionales, catorce
// iniciativas y sus documentos. Es lo que puebla una base recién
// migrada; las migraciones solo siembran catálogo.
//
//   node scripts/seed_iniciales.js
//   node scripts/seed_iniciales.js --reiniciar-claves
//
// Dos defectos que traía, y por qué importan:
//
// **Una sola contraseña para las ocho cuentas, escrita en claro aquí.**
// Se calculaba UN hash de 'Mininterior2026!' y se reutilizaba en el
// bucle, con `debe_cambiar = FALSE`. Eran las siete cuentas
// institucionales del Viceministerio —viceministro, una directora, tres
// editores— con la misma clave publicada en el árbol de trabajo y sin
// que el sistema se la pidiera cambiar nunca. Ahora cada cuenta recibe
// una contraseña distinta, generada al azar, se imprime UNA vez y nace
// con `debe_cambiar = TRUE`.
//
// **Reejecutarlo revertía las contraseñas ya cambiadas.** El
// `ON DUPLICATE KEY UPDATE` incluía `contrasena_hash`, así que volver a
// correr el guion —lo único que reconstruye los datos de
// demostración— devolvía en silencio la clave común a quien ya la había
// cambiado. Ahora la contraseña solo se escribe si la cuenta no tiene
// ninguna. Para reiniciarlas a propósito está `--reiniciar-claves`.
// ---------------------------------------------------------------------
require('dotenv').config();
const crypto = require('node:crypto');
const pool = require('../db');
const { hashear } = require('../auth/contrasena');

const REINICIAR_CLAVES = process.argv.includes('--reiniciar-claves');

// Una contraseña legible pero no adivinable, que cumple validarFortaleza
// (12+ caracteres, con letras y al menos un número). No se reutiliza
// entre cuentas: eso es justo lo que se está corrigiendo.
function claveNueva() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digitos = '23456789';
  const letras = Array.from({ length: 10 },
    () => alfabeto[crypto.randomInt(alfabeto.length)]).join('');
  const numeros = Array.from({ length: 4 },
    () => digitos[crypto.randomInt(digitos.length)]).join('');
  return letras + numeros;
}

async function seed() {
  console.log('Iniciando carga de datos iniciales en MySQL...');
  try {
    await pool.query('SET NAMES utf8mb4');

    // 1. Usuarios institucionales
    //
    // SIN `id` explícito, a propósito. Los traía escritos a mano y eso
    // choca con lo que ya haya en la base: en la instalación viva el id 1
    // es del administrador, así que el INSERT de 'carlos.mejia' con id 1
    // caía en ON DUPLICATE KEY y sobreescribía su fila —nombre y rol— y
    // la cuenta de Carlos no se creaba nunca. Aquí no se notó porque la
    // fila del administrador va última en esta lista y la restauraba: una
    // corrupción que solo se evitaba por el orden del arreglo.
    //
    // El `correo` es clave única y basta para que el alta sea idempotente.
    const usuarios = [
      { nombre: 'Carlos Mejía', correo: 'carlos.mejia@mininterior.gov.co', rol_id: 4, rol: 'viceministro', dir: null },
      { nombre: 'Ana Restrepo', correo: 'ana.restrepo@mininterior.gov.co', rol_id: 2, rol: 'editor', dir: 'ddhh' },
      { nombre: 'Sofía Guerrero', correo: 'sofia.guerrero@mininterior.gov.co', rol_id: 3, rol: 'director', dir: 'consulta' },
      { nombre: 'Luis Cardona', correo: 'luis.cardona@mininterior.gov.co', rol_id: 2, rol: 'editor', dir: 'dialogo' },
      { nombre: 'Marta Ospina', correo: 'marta.ospina@correo.com', rol_id: 1, rol: 'lector', dir: null },
      { nombre: 'Jorge Beltrán', correo: 'jorge.beltran@correo.com', rol_id: 1, rol: 'lector', dir: null },
      { nombre: 'Diana Salcedo', correo: 'diana.salcedo@mininterior.gov.co', rol_id: 2, rol: 'editor', dir: 'negras' },
      { nombre: 'Administrador del Sistema', correo: 'admin@mininterior.gov.co', rol_id: 5, rol: 'viceministro', dir: null },
    ];

    const clavesGeneradas = [];
    for (const u of usuarios) {
      const clave = claveNueva();

      // Se decide ANTES de escribir si esta cuenta va a recibir la
      // contraseña nueva. La primera versión lo deducía de
      // `affectedRows`, y eso está mal: en un ON DUPLICATE KEY UPDATE ese
      // número cuenta si cambió CUALQUIER columna —el nombre, el rol—, no
      // si se aplicó la contraseña. El guion imprimía seis credenciales
      // que no había escrito, y quien las entregara habría repartido
      // claves que no funcionan. Comprobado: los hashes seguían intactos
      // y la contraseña anterior seguía siendo la válida.
      const [previo] = await pool.query(
        'SELECT contrasena_hash FROM usuarios WHERE correo = ?', [u.correo]);
      const aplicaClave = REINICIAR_CLAVES
        || previo.length === 0
        || previo[0].contrasena_hash === null;

      // Ojo al orden de las asignaciones: en ON DUPLICATE KEY UPDATE cada
      // una ve el valor ya actualizado por las anteriores. `debe_cambiar`
      // consulta `contrasena_hash`, así que tiene que ir ANTES de que se
      // le asigne, o siempre leería el valor nuevo.
      await pool.query(
        `INSERT INTO usuarios (nombre, correo, contrasena_hash, direccion_id, rol, rol_id, activo, debe_cambiar, pendiente_aprobacion)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE, FALSE)
         ON DUPLICATE KEY UPDATE
           nombre = VALUES(nombre),
           rol_id = VALUES(rol_id),
           rol = VALUES(rol),
           activo = TRUE,
           debe_cambiar = IF(? OR contrasena_hash IS NULL, TRUE, debe_cambiar),
           contrasena_hash = IF(? OR contrasena_hash IS NULL, VALUES(contrasena_hash), contrasena_hash)`,
        [u.nombre, u.correo, await hashear(clave), u.dir, u.rol, u.rol_id,
         REINICIAR_CLAVES, REINICIAR_CLAVES]
      );

      // Solo se anuncia la contraseña que de verdad quedó escrita.
      if (aplicaClave) clavesGeneradas.push({ correo: u.correo, clave });
    }
    console.log('✓ Usuarios institucionales sincronizados.');

    if (clavesGeneradas.length) {
      console.log('');
      console.log('  CONTRASEÑAS PROVISIONALES — se muestran UNA sola vez.');
      console.log('  Entréguelas por un canal seguro. Cada persona debe cambiarla');
      console.log('  en su primer ingreso: hasta entonces solo puede consultar.');
      console.log('');
      for (const c of clavesGeneradas) {
        console.log('    ' + c.correo.padEnd(42) + c.clave);
      }
      console.log('');
    } else {
      console.log('  (las cuentas ya tenían contraseña; no se tocó ninguna.');
      console.log('   Para reiniciarlas a propósito: --reiniciar-claves)');
    }

    // 2. Carga de las 14 iniciativas
    const iniciativas = [
      { id: 1, dir: 'ddhh', nombre: 'Proyecto de ley de garantías para personas defensoras de derechos humanos', obj: 'Fortalecer las medidas de protección y el sistema de alertas tempranas', num: 'PL 214/2026C', est: 'Aprobado', est_id: 4, prio: 'Alta', fecha: '2026-08-19' },
      { id: 2, dir: 'ddhh', nombre: 'Acto legislativo sobre jurisdicción agraria', obj: 'Ajustes al articulado en trámite de segunda vuelta', num: 'AL 08/2026S', est: 'En comisión', est_id: 3, prio: 'Media', fecha: '2026-08-05' },
      { id: 3, dir: 'ddhh', nombre: 'Decreto reglamentario de la política pública de DD.HH. y DIH', obj: 'Reglamentación del capítulo de garantías para liderazgos sociales', num: '', est: 'Radicado', est_id: 2, prio: 'Alta', fecha: '2026-08-21' },
      { id: 4, dir: 'ddhh', nombre: 'Proyecto de ley estatutaria de protesta social', obj: 'Desarrollo del derecho a la reunión y manifestación pública', num: 'PL 073/2025C', est: 'Archivado', est_id: 5, prio: 'Baja', fecha: '2026-06-30' },
      { id: 5, dir: 'ddhh', nombre: 'Proyecto de ley de protección a líderes comunales', obj: 'Ampliar el esquema de protección a juntas de acción comunal', num: '', est: 'En formulación', est_id: 1, prio: 'Media', fecha: '2026-08-23' },
      { id: 6, dir: 'ddhh', nombre: 'Decreto de rutas de atención para denunciantes de amenazas', obj: '', num: '', est: 'En formulación', est_id: 1, prio: 'Media', fecha: '2026-08-22' },
      { id: 7, dir: 'consulta', nombre: 'Decreto de protocolización con comunidades étnicas del Pacífico', obj: 'Formalización de los acuerdos de consulta previa', num: '', est: 'Archivado', est_id: 5, prio: 'Alta', fecha: '2026-08-14' },
      { id: 8, dir: 'indigenas', nombre: 'Decreto de concertación con la Mesa Permanente de Concertación', obj: 'Ruta de protocolización con pueblos indígenas', num: 'D-1811/2026', est: 'Aprobado', est_id: 4, prio: 'Alta', fecha: '2026-08-20' },
      { id: 9, dir: 'indigenas', nombre: 'Ajuste al Decreto 1811 sobre consulta a pueblos ROM', obj: '', num: '', est: 'En formulación', est_id: 1, prio: 'Baja', fecha: '2026-07-30' },
      { id: 10, dir: 'dialogo', nombre: 'Proyecto de ley de participación ciudadana territorial', obj: '', num: '', est: 'En comisión', est_id: 3, prio: 'Media', fecha: '2026-08-11' },
      { id: 11, dir: 'dialogo', nombre: 'Mesa territorial de diálogo en el Catatumbo', obj: 'Formalización del espacio de interlocución', num: '', est: 'En formulación', est_id: 1, prio: 'Media', fecha: '2026-08-24' },
      { id: 12, dir: 'negras', nombre: 'Reforma al Capítulo IV de la Ley 70 de 1993', obj: 'Actualización de los mecanismos de participación', num: 'PL 156/2026C', est: 'En comisión', est_id: 3, prio: 'Alta', fecha: '2026-08-16' },
      { id: 13, dir: 'negras', nombre: 'Decreto de titulación colectiva en el Pacífico sur', obj: '', num: '', est: 'Radicado', est_id: 2, prio: 'Media', fecha: '2026-08-18' },
      { id: 14, dir: 'religiosos', nombre: 'Decreto del Sistema Nacional de Libertad Religiosa', obj: '', num: '', est: 'Archivado', est_id: 5, prio: 'Media', fecha: '2026-07-28' },
    ];

    for (const ini of iniciativas) {
      await pool.query(
        `INSERT INTO iniciativas (id, direccion_id, nombre, objeto, numero_proyecto, estado, estado_id, prioridad, fecha_actualizacion, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
           direccion_id = VALUES(direccion_id),
           nombre = VALUES(nombre),
           objeto = VALUES(objeto),
           numero_proyecto = VALUES(numero_proyecto),
           estado = VALUES(estado),
           estado_id = VALUES(estado_id),
           prioridad = VALUES(prioridad),
           fecha_actualizacion = VALUES(fecha_actualizacion),
           activo = TRUE`,
        [ini.id, ini.dir, ini.nombre, ini.obj || null, ini.num || null, ini.est, ini.est_id, ini.prio, ini.fecha]
      );
    }
    console.log('✓ 14 iniciativas iniciales sincronizadas en MySQL.');

      // 3. Documentos iniciales
      const documentos = [
        { id: 1, ini: 1, nombre: 'Exposición de motivos', enlace: 'https://drive.google.com/ejemplo1', fecha: '2026-08-12' },
        { id: 2, ini: 1, nombre: 'Concepto de la Secretaría Jurídica', enlace: 'https://drive.google.com/ejemplo2', fecha: '2026-08-18' },
        { id: 3, ini: 2, nombre: 'Texto radicado', enlace: 'https://drive.google.com/ejemplo3', fecha: '2026-08-05' },
        { id: 4, ini: 8, nombre: 'Acta de la Mesa Permanente', enlace: 'https://drive.google.com/ejemplo4', fecha: '2026-08-20' },
      ];

      for (const d of documentos) {
        await pool.query(
          `INSERT INTO documentos (id, iniciativa_id, nombre, enlace, fecha)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
          [d.id, d.ini, d.nombre, d.enlace, d.fecha]
        );
      }
      console.log('✓ Documentos de soporte sincronizados.');
      console.log('\n[OK] Base de datos MySQL sincronizada con datos dinámicos.');
  } catch (err) {
    console.error('Error durante la carga:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
