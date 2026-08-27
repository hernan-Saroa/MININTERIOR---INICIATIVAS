// =====================================================================
// Este router ya no expone ninguna ruta, a propósito.
//
// Tenía un `DELETE /api/documentos/:id` con una sola guarda,
// `puedeEscribir`, que solo exige sesión y rol distinto de «lector». No
// comprobaba ni la dirección ni la propiedad: pasaba el id recibido
// directamente a `sp_eliminar_documento`, que es un DELETE pelado sin
// historial. Es decir, quien editaba en una dirección podía recorrer ids y
// borrar los soportes documentales de las iniciativas de otra —consulta
// previa, garantías a personas defensoras— sin dejar rastro.
//
// El borrado con las guardas correctas ya existe en rutas/iniciativas.js:
//
//     DELETE /api/iniciativas/:id/documentos/:docId
//
// que pasa por `puedeEditarIniciativa` y por tanto valida la dirección
// antes de tocar la base. Esa es la que debe usar la interfaz.
//
// Se deja el archivo, y no se borra, para que quede constancia de por qué
// desapareció la ruta y nadie la reponga por parecer que falta.
// =====================================================================
const express = require('express');

const router = express.Router();

module.exports = router;
