# front-tablero — Tablero de Iniciativas Legislativas

Frontend del tablero principal donde se visualizan todas las iniciativas
legislativas por dirección. Incluye vista pública (consulta por código)
e interna (edición con sesión).

## Requisitos

- Node.js 20+
- npm 10+

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev     # http://localhost:5173
```

## Variables de entorno

```bash
cp .env.example .env
```

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_API_GATEWAY_URL` | URL del API Gateway | `http://localhost:3000` |

## Build de producción

```bash
npm run build   # Genera dist/
```

## Docker

```bash
docker build -f docker/Dockerfile -t front-tablero .
docker run -p 8080:80 front-tablero
```

## Estructura

```
src/
├── componentes/       # Componentes reutilizables del tablero
├── paginas/           # Pantallas (Tablero)
├── servicios/         # Cliente HTTP hacia el API Gateway
├── tipos/             # Copia de @mininterior/tipos
├── estilos/           # CSS del tablero
└── main.tsx           # Punto de entrada
```
