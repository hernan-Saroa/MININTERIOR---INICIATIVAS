// Build en formato IIFE para las pruebas: jsdom no ejecuta módulos ES.
// Copiar a web/ antes de correr las pruebas, o invocarlo con --config.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwind()],
  build: {
    outDir: 'dist-test',
    rollupOptions: {
      input: 'src/main.tsx',
      output: { format: 'iife', entryFileNames: 'app.js', assetFileNames: 'app.[ext]' },
    },
  },
});
