import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { resolve } from 'node:path';

// =====================================================================
// Build solo para las pruebas.
//
// prueba-humo.mjs y prueba-entorno.mjs esperan un archivo en
// dist-test/app.js, y jsdom no ejecuta módulos ES: hace falta un paquete
// IIFE que se pueda inyectar dentro de un <script> y corra tal cual. El
// build normal (vite.config.ts) produce un módulo, así que no sirve.
//
// Este archivo faltaba en el repositorio y por eso `node prueba-humo.mjs`
// terminaba en ENOENT aunque AGENTS.md lo documentara como comando.
//   npm run build:pruebas   genera dist-test/app.js
//   npm run prueba          genera y corre las dos pruebas
// =====================================================================
const raiz = process.cwd();

export default defineConfig({
  root: raiz,
  plugins: [react(), tailwind()],
  build: {
    outDir: resolve(raiz, 'dist-test'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(raiz, 'src/main.tsx'),
      formats: ['iife'],
      name: 'AppIniciativas',
      fileName: () => 'app.js',
    },
  },
  define: {
    // React elige su build de desarrollo o producción por esta variable, y
    // en el contexto de biblioteca no se define sola.
    'process.env.NODE_ENV': '"production"',
    // Las pruebas corren en jsdom, sin servidor: se usa el simulador en
    // memoria y se siembra una sesión, para que las pantallas que exigen
    // permisos se dibujen y se puedan comprobar. Producción no lleva
    // ninguna de las dos (ver vite.config.ts).
    'import.meta.env.VITE_SIMULADO': '"1"',
    'import.meta.env.VITE_SESION_PRUEBA': '"1"',
  },
});
