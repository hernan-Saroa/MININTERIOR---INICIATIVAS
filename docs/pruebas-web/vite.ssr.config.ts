// Renderizado en servidor, solo para inspección visual de las pantallas.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({ plugins: [react(), tailwind()] });
