# front-radicacion — Portal de Radicación Ciudadana

Portal público donde un ciudadano puede radicar una iniciativa legislativa
y consultar el estado de su trámite con el código único (INI-2026-XXXX).

## Funcionalidades
- Wizard de radicación de 3 pasos (Información → Documentos → Confirmar)
- Consulta pública por código de trámite
- Aceptación de términos de manejo de datos (Ley 1581/2012)
- Notificaciones opcionales por correo electrónico

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:5174
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `VITE_API_GATEWAY_URL` | URL del API Gateway |
