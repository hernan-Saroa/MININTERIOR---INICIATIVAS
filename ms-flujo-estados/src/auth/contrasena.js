// ---------------------------------------------------------------------
// Cifrado de contraseñas con scrypt (módulo 'crypto' nativo de Node).
// No requiere dependencias externas ni compilación nativa, y scrypt es
// uno de los algoritmos recomendados por OWASP para almacenar claves.
// ---------------------------------------------------------------------
const { scrypt, randomBytes, timingSafeEqual } = require('node:crypto');

const PARAMS = { N: 16384, r: 8, p: 1 };
const LARGO_CLAVE = 64;

function derivar(contrasena, salt, params) {
  return new Promise((resolve, reject) => {
    scrypt(
      contrasena.normalize('NFKC'), salt, LARGO_CLAVE,
      { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 },
      (err, clave) => (err ? reject(err) : resolve(clave))
    );
  });
}

// Formato almacenado:  scrypt$N$r$p$salt_base64$hash_base64
async function hashear(contrasena) {
  const salt = randomBytes(16);
  const clave = await derivar(contrasena, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p,
          salt.toString('base64'), clave.toString('base64')].join('$');
}

async function verificar(contrasena, almacenado) {
  if (!almacenado) return false;
  const partes = String(almacenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const params = { N: Number(partes[1]), r: Number(partes[2]), p: Number(partes[3]) };
  const salt = Buffer.from(partes[4], 'base64');
  const esperado = Buffer.from(partes[5], 'base64');

  const calculado = await derivar(contrasena, salt, params);
  if (calculado.length !== esperado.length) return false;
  return timingSafeEqual(calculado, esperado);
}

// Se ejecuta cuando el correo no existe, para que un atacante no pueda
// distinguir "usuario inexistente" de "contraseña incorrecta" midiendo
// el tiempo de respuesta.
async function gastarTiempo() {
  await derivar('contrasena-inexistente', randomBytes(16), PARAMS);
}

// Reglas mínimas. Ajustar según la política del Ministerio.
function validarFortaleza(contrasena) {
  const errores = [];
  if (typeof contrasena !== 'string' || contrasena.length < 12) {
    errores.push('debe tener al menos 12 caracteres');
  }
  if (!/[a-záéíóúñ]/i.test(contrasena)) errores.push('debe incluir letras');
  if (!/[0-9]/.test(contrasena)) errores.push('debe incluir al menos un número');
  if (/^(.)\1+$/.test(contrasena)) errores.push('no puede ser un solo carácter repetido');
  return errores;
}

module.exports = { hashear, verificar, gastarTiempo, validarFortaleza };
