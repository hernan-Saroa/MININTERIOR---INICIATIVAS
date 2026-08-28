# scripts

Utilidades de verificación de la plataforma. Se ejecutan con Node 20+.

| Script | Qué hace |
|--------|----------|
| `prueba-e2e.mjs` | Prueba de humo + contrato del gateway + flujo ciudadano, contra la plataforma ya levantada. La misma que corre la integración continua. |
| `verificar-contraste.js` | Comprueba el contraste de color (WCAG 2.1 AA) sobre las hojas de estilo reales de `front-tablero`. Exigido por la Resolución 1519 de 2020 del MinTIC. |

## Uso

```bash
# Prueba end-to-end (con la plataforma corriendo)
node scripts/prueba-e2e.mjs
BASE_URL=http://localhost:8080 node scripts/prueba-e2e.mjs

# Contraste de color
node scripts/verificar-contraste.js
```

Ambos salen con código distinto de cero si algo falla, de modo que sirven en CI.

> Los scripts del monolito anterior (`instalar-base-de-datos.sh`,
> `verificar-instalacion.sh`, `aplicar-migraciones.js`, `verificar-flujo.js`) se
> retiraron: la base y las migraciones las gestiona el servicio `migrador` de
> Docker (ver `docs/migraciones.md`), y la verificación de flujo la cubre la
> prueba end-to-end.
