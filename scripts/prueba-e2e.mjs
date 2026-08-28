// =====================================================================
// Prueba de humo + contrato + flujo, contra la plataforma ya levantada.
//
//   node scripts/prueba-e2e.mjs            # contra http://localhost:8080
//   BASE_URL=http://host:puerto node scripts/prueba-e2e.mjs
//
// No usa dependencias (fetch nativo, Node >= 18). Está pensada para CI:
// sale con código 1 si algo falla, y con 0 si todo pasa.
//
// Cubre las regresiones caras que la plataforma ya sufrió:
//   · B-04: el gateway devolvía 404 en todo el tráfico de negocio.
//   · B-05: el autorregistro ciudadano devolvía 500.
//   · servicios caídos por dependencias/arranque.
//   · el gateway enruta /api/admin al microservicio (no 404) y la guarda
//     de sesión responde 401 (no se cuela sin credenciales).
// =====================================================================

const BASE = process.env.BASE_URL || 'http://localhost:8080';

let pasadas = 0;
let fallidas = 0;

function ok(nombre) { pasadas++; console.log(`  ✓ ${nombre}`); }
function fallo(nombre, detalle) { fallidas++; console.log(`  ✗ ${nombre}\n      ${detalle}`); }

async function pedir(ruta, opciones = {}) {
  const res = await fetch(BASE + ruta, opciones);
  let cuerpo = null;
  try { cuerpo = await res.json(); } catch { /* sin cuerpo JSON */ }
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('iniciativas.sid='));
  return { estado: res.status, cuerpo, cookie };
}

async function espera(nombre, fn) {
  try {
    const r = await fn();
    if (r === true) return ok(nombre);
    fallo(nombre, r);
  } catch (err) {
    fallo(nombre, err.message);
  }
}

async function main() {
  console.log(`\nPrueba end-to-end contra ${BASE}\n`);

  console.log('Humo:');
  await espera('el gateway responde /api/salud', async () => {
    const r = await pedir('/api/salud');
    return r.estado === 200 || `esperado 200, recibido ${r.estado}`;
  });

  console.log('\nContrato del gateway (ninguna ruta de negocio debe dar 404):');
  for (const ruta of ['/api/publico/direcciones', '/api/direcciones', '/api/iniciativas']) {
    await espera(`GET ${ruta} → 200`, async () => {
      const r = await pedir(ruta);
      return r.estado === 200 || `esperado 200, recibido ${r.estado} (¿el gateway despoja el prefijo?)`;
    });
  }
  await espera('GET /api/admin/usuarios sin sesión → 401 (enruta al MS y la guarda actúa)', async () => {
    const r = await pedir('/api/admin/usuarios');
    if (r.estado === 404) return 'recibido 404: el gateway no enruta /api/admin';
    return r.estado === 401 || `esperado 401, recibido ${r.estado}`;
  });
  await espera('una ruta inexistente → 404', async () => {
    const r = await pedir('/api/no-existe-esta-ruta');
    return r.estado === 404 || `esperado 404, recibido ${r.estado}`;
  });

  console.log('\nFlujo ciudadano (autorregistro y sesión):');
  const correo = `ci_${Date.now()}@ejemplo.test`;
  let cookie = null;
  await espera('POST /api/publico/registrar → 201', async () => {
    const r = await pedir('/api/publico/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'CI Bot', correo, contrasena: 'ClaveDePruebaCI2026' }),
    });
    cookie = r.cookie;
    return r.estado === 201 || `esperado 201, recibido ${r.estado} (${JSON.stringify(r.cuerpo)})`;
  });
  await espera('la sesión del registro es válida (GET /api/auth/sesion → 200)', async () => {
    if (!cookie) return 'el registro no devolvió cookie de sesión';
    const r = await pedir('/api/auth/sesion', { headers: { Cookie: cookie } });
    return r.estado === 200 || `esperado 200, recibido ${r.estado}`;
  });

  console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas\n`);
  process.exit(fallidas ? 1 : 0);
}

main().catch((err) => { console.error('Error inesperado:', err); process.exit(1); });
