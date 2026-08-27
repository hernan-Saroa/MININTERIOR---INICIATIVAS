const express = require('express');
const pool = require('../db');
const { requiereSesion, tienePermiso } = require('../auth/middleware');

const router = express.Router();

// Las dos rutas de este archivo entregan el tablero completo: el resumen
// de todas las direcciones y el CSV con todas las iniciativas. Exigen
// sesión. Hasta ahora no la exigían y /api/exportar-csv devolvía el
// tablero entero a cualquiera que conociera la URL.
//
// La guarda va ruta por ruta y NO con router.use: este router se monta en
// el prefijo «/api» a secas, así que un router.use se ejecutaría también
// para cualquier ruta inexistente que llegue hasta aquí y devolvería 401
// donde corresponde un 404.

// GET /api/estadisticas
router.get('/estadisticas', requiereSesion, async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_resumen_estadisticas()');
    const s = filas[0][0] || {};
    // Con la tabla vacía, SUM() devuelve NULL: se normaliza a 0 para que
    // las tarjetas del tablero no muestren "null" en una instalación nueva.
    const numero = (v) => Number(v || 0);
    res.json({
      total: numero(s.total), radicadas: numero(s.radicadas),
      en_comision: numero(s.en_comision), aprobadas: numero(s.aprobadas),
      archivadas: numero(s.archivadas), en_formulacion: numero(s.en_formulacion),
      prioridad_alta: numero(s.prioridad_alta)
    });
  } catch (err) { next(err); }
});

const soloFecha = (v) => {
  if (!v) return '';
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
};

// Una celda que empieza por = + - @ o tabulador la interpreta Excel y
// LibreOffice como FÓRMULA, no como texto. Y el contenido de estas
// columnas no lo escriben funcionarios: `iniciativa` y `objeto` salen de
// lo que cualquiera radica sin credenciales por el formulario público.
// Basta radicar una propuesta cuyo nombre empiece por «=» y esperar a
// que alguien pulse «Exportar» y abra el archivo en su equipo del
// Ministerio.
//
// El apóstrofo delante es la neutralización estándar: la hoja de cálculo
// lo trata como texto y no lo muestra en la celda.
const PELIGROSO = /^[=+\-@\t\r]/;
const celda = (v) => {
  const texto = String(v ?? '');
  const seguro = PELIGROSO.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
};

// GET /api/exportar-csv
router.get('/exportar-csv', requiereSesion, tienePermiso('iniciativas.exportar'), async (req, res, next) => {
  try {
    const [filas] = await pool.query('CALL sp_exportar_csv()');
    const datos = filas[0];
    const encabezado = 'Dirección,Iniciativa,Objeto,No. Proyecto,Estado,Prioridad,Actualización,Documentos\n';
    const cuerpo = datos.map(r => [
      r.direccion, r.iniciativa, r.objeto, r.numero_proyecto,
      r.estado, r.prioridad, soloFecha(r.fecha_actualizacion), r.documentos
    ].map(celda).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="iniciativas_legislativas.csv"');
    // El BOM hace que Excel en Windows reconozca el UTF-8 y no rompa las tildes.
    res.send('\uFEFF' + encabezado + cuerpo);
  } catch (err) { next(err); }
});

module.exports = router;
