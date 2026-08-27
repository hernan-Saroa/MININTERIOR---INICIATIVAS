declare module "*.css";

// Las dos banderas que fija el build. No existen en producción: el simulador
// y la sesión sembrada solo se activan en vite.test.config.mjs.
interface ImportMetaEnv {
  readonly VITE_SIMULADO?: string;
  readonly VITE_SESION_PRUEBA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
