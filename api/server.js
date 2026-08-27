require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const sesion = require('./auth/sesion');
const { identifica, requiereSesion } = require('./auth/middleware');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const app = express();

// Detrás de Nginx/IIS/Tailscale: necesario para que la cookie "secure"
// y la IP del cliente se resuelvan bien.
app.set('trust proxy', 1);

// Con sesión por cookie, el origen ya no puede ser abierto.
app.use(cors({
  origin: process.env.ORIGEN_PERMITIDO || true,
  credentials: true
}));

app.use(express.json({ limit: '100kb' }));
app.use(sesion);

// Publica req.usuario cuando hay sesión, sin exigirla. Tiene que ir
// inmediatamente después de la sesión y antes de cualquier ruta: las
// guardas de escritura leen req.usuario, y sin esto era siempre
// undefined, así que toda escritura respondía 500 en lugar de 401.
app.use(identifica);

// Páginas públicas: el login y el tablero. El tablero consulta sin
// sesión —la consulta ciudadana por código depende de eso— pero toda
// escritura y toda la administración sí la exigen (ver más abajo).
// Los archivos estáticos los sirve Nginx (ver docker/nginx.conf), así que la
// API no los toca. En una instalación manual sin proxy delante se puede
// apuntar una carpeta con RUTA_ESTATICOS.
if (process.env.RUTA_ESTATICOS) {
  app.use(express.static(path.resolve(process.env.RUTA_ESTATICOS)));
}

// Salud, y la fecha del servidor. El tablero la usa como fecha de corte del
// documento que se imprime: si saliera del reloj del navegador, un equipo mal
// puesto en hora produciría un documento oficial mal fechado.
app.get('/api/salud', (req, res) => res.json({ ok: true, fecha: new Date().toISOString() }));
app.use('/api/auth', require('./rutas/auth'));

// Público: formulario de propuesta y autorregistro (no exigen sesión).
app.use('/api/publico', require('./rutas/publico'));

// Lectura de catálogo y tablero
app.use('/api/direcciones', require('./rutas/direcciones'));
app.use('/api/iniciativas', require('./rutas/iniciativas'));
// Sin rutas: el borrado de documentos vive bajo /api/iniciativas, donde sí
// se valida la dirección. Ver el comentario en rutas/documentos.js.
app.use('/api/documentos', require('./rutas/documentos'));

// Administración: usuarios, roles, permisos, estados y responsables.
// Exige sesión en el montaje, no ruta por ruta: son diecisiete rutas y
// hasta ahora ninguna tenía guarda, así que cualquiera con la URL podía
// asignarse el rol que quisiera o cambiar la visibilidad de un estado.
// Poner la guarda aquí hace imposible olvidarla al agregar una ruta.
app.use('/api/admin', requiereSesion, require('./rutas/admin'));

// Reportes: /estadisticas y /exportar-csv. Exigen sesión desde dentro
// del router (ver rutas/reportes.js): montar la guarda sobre el prefijo
// «/api» a secas convertiría en 401 cualquier ruta inexistente.
app.use('/api', require('./rutas/reportes'));

app.use('/api', noEncontrado);
app.use(manejadorErrores);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de iniciativas legislativas escuchando en el puerto ${PORT}`);
});
