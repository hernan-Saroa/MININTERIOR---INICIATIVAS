require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS
app.use(cors({
  origin: process.env.ORIGEN_PERMITIDO || true,
  credentials: true,
}));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Health check del gateway
app.get('/api/salud', (req, res) => {
  res.json({ servicio: 'api-gateway', ok: true, fecha: new Date().toISOString() });
});

// =====================================================================
// Tabla de enrutamiento a microservicios
//
// Cada ruta se reenvía al microservicio correspondiente. El gateway no
// contiene lógica de negocio: solo enruta, valida CORS y limita tráfico.
// =====================================================================

const servicios = {
  '/api/auth':           process.env.MS_AUTENTICACION_URL || 'http://ms-autenticacion:3001',
  '/api/iniciativas':    process.env.MS_INICIATIVAS_URL   || 'http://ms-iniciativas:3002',
  '/api/direcciones':    process.env.MS_INICIATIVAS_URL   || 'http://ms-iniciativas:3002',
  '/api/documentos':     process.env.MS_INICIATIVAS_URL   || 'http://ms-iniciativas:3002',
  '/api/exportar-csv':   process.env.MS_INICIATIVAS_URL   || 'http://ms-iniciativas:3002',
  '/api/radicacion':     process.env.MS_RADICACION_URL    || 'http://ms-radicacion:3003',
  '/api/publico':        process.env.MS_RADICACION_URL    || 'http://ms-radicacion:3003',
  '/api/flujo':          process.env.MS_FLUJO_URL         || 'http://ms-flujo-estados:3004',
  '/api/notificaciones': process.env.MS_NOTIFICACIONES_URL || 'http://ms-notificaciones:3005',
  '/api/admin':          process.env.MS_ADMINISTRACION_URL || 'http://ms-administracion:3006',
  '/api/estadisticas':   process.env.MS_ADMINISTRACION_URL || 'http://ms-administracion:3006',
};

for (const [ruta, destino] of Object.entries(servicios)) {
  app.use(ruta, createProxyMiddleware({
    target: destino,
    changeOrigin: true,
    // Reescribir la ruta para que el microservicio reciba su ruta local
    pathRewrite: { [`^${ruta}`]: ruta },
    onError: (err, req, res) => {
      console.error(`Error al enrutar ${req.url} → ${destino}:`, err.message);
      res.status(502).json({
        error: 'El servicio no está disponible en este momento',
        servicio: ruta,
      });
    },
  }));
}

// 404 para rutas no mapeadas
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`API Gateway escuchando en el puerto ${PORT}`);
  console.log('Servicios configurados:');
  for (const [ruta, destino] of Object.entries(servicios)) {
    console.log(`  ${ruta} → ${destino}`);
  }
});
