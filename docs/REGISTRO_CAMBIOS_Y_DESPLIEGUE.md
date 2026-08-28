# Registro de Cambios por Repositorio y Guía de Ejecución de Scripts

**Viceministerio para el Diálogo Social y los Derechos Humanos**  
Ministerio del Interior · República de Colombia  
**Plataforma:** Sistema de Seguimiento de Iniciativas Legislativas  
**Entorno de Producción:** `https://mininterior-iniciativas.fabricasoftware.co/`  
**Fecha:** 28 de agosto de 2026

---

## Índice

1. [Resumen de Repositorios Modificados](#1-resumen-de-repositorios-modificados)
2. [Detalle de Cambios por Repositorio](#2-detalle-de-cambios-por-repositorio)
   - 2.1 [Repositorio Principal (Agregador)](#21-repositorio-principal-agregador)
   - 2.2 [`db-iniciativas` (Base de Datos)](#22-db-iniciativas-base-de-datos)
   - 2.3 [`front-tablero` (Frontend Principal)](#23-front-tablero-frontend-principal)
   - 2.4 [`front-admin` (Frontend Administrativo)](#24-front-admin-frontend-administrativo)
   - 2.5 [`front-radicacion` (Frontend Radicación Pública)](#25-front-radicacion-frontend-radicación-pública)
   - 2.6 [`ms-administracion` (Microservicio)](#26-ms-administracion-microservicio)
   - 2.7 [`ms-flujo-estados` (Microservicio)](#27-ms-flujo-estados-microservicio)
   - 2.8 [Microservicios e Infraestructura Base](#28-microservicios-e-infraestructura-base)
3. [Guía de Scripts del Proyecto y Cómo Aplicarlos](#3-guía-de-scripts-del-proyecto-y-cómo-aplicarlos)
   - 3.1 [Scripts de Base de Datos y Migraciones SQL](#31-scripts-de-base-de-datos-y-migraciones-sql)
   - 3.2 [Scripts de Pruebas, Calidad y Accesibilidad (WCAG AA)](#32-scripts-de-pruebas-calidad-y-accesibilidad-wcag-aa)
   - 3.3 [Scripts de Generación de Documentación (HTML / PDF)](#33-scripts-de-generación-de-documentación-html--pdf)
   - 3.4 [Scripts de Despliegue y Orquestación de Contenedores](#34-scripts-de-despliegue-y-orquestación-de-contenedores)
4. [Procedimiento de Despliegue a Producción](#4-procedimiento-de-despliegue-a-producción)

---

## 1. Resumen de Repositorios Modificados

En los últimos ciclos de desarrollo se implementaron mejoras en diseño responsivo, capacidades analíticas para directivos, gestión de permisos para administradores, nuevas migraciones SQL y documentación técnica exhaustiva para entrega formal.

| Repositorio / Submódulo | Tipo | Cambios Principales |
|---|---|---|
| **`MININTERIOR---INICIATIVAS`** | Repo Principal | Documentación técnica completa (Manual v2.0 con 10 capturas, Arquitectura Técnica, Modelo de Datos ERD Nivel 3), scripts compiladores HTML y sincronización de punteros Git. |
| **`db-iniciativas`** | Base de Datos | Migración `18_flujo_mover_admin.sql` (permiso `flujo.configurar` para mover sin ser responsable) y nuevo SP de desempeño de funcionarios. |
| **`front-tablero`** | Frontend | Panel analítico ejecutivo, menú responsivo de direcciones (desplegable en `<860px`), alineación de header/footer a 2100px, rediseño de `PanelFlujo`. |
| **`front-admin`** | Frontend | Rediseño "World-Class" con menú colapsable lateral, módulo de gestión de direcciones, alta y edición de usuarios, panel de analítica ejecutiva. |
| **`front-radicacion`** | Frontend | Ajuste de ancho de contenedor (2100px), modales ampliados a `max-w-2xl` y optimización para Safari / iOS. |
| **`ms-administracion`** | Microservicio | Endpoint `GET /api/admin/estadisticas/desempeno`, CRUD de dependencias y soporte para creación de usuarios. |
| **`ms-flujo-estados`** | Microservicio | Endpoint espejo de métricas de flujo y compatibilidad con autorización de la migración 18. |
| **`infra-iniciativas` / Otros MS** | Infra / Backend | Unificación de orquestación en `docker-compose.yml`, configuración de variables de entorno seguras y salud de servicios. |

---

## 2. Detalle de Cambios por Repositorio

### 2.1. Repositorio Principal (Agregador)
*Gestión global de la plataforma, integración de submódulos y documentación de entrega.*

- **Documentos Generados y Versionados:**
  - `docs/MANUAL_USUARIO.md` y `docs/MANUAL_USUARIO.html`: Manual operativo paso a paso con 10 capturas reales embebidas en base64, catálogo de permisos, recorrido de trámite y FAQ.
  - `docs/ARQUITECTURA_TECNICA.md` y `docs/ARQUITECTURA_TECNICA.html`: Documento de ingeniería con topología de microservicios, API Gateway, matriz de dependencias, políticas de seguridad y decisiones de diseño (ADRs).
  - `docs/MODELO_DATOS_ERD.md` y `docs/MODELO_DATOS_ERD.html`: Modelo de datos físico y lógico Nivel 3, diagramas Mermaid interactivos, diccionario exhaustivo de 15 tablas y catálogo de 54 procedimientos almacenados.
- **Herramientas de Compilación:**
  - `scripts/manual-a-html.js`: Conversor de Markdown a HTML autocontenido con incrustación de imágenes.
  - `scripts/arq-a-html.js`: Compilador de arquitectura técnica a HTML listo para PDF.
  - `scripts/erd-a-html.js`: Compilador de modelo de datos con biblioteca `mermaid.js` para renderizado vectorial en navegador.

---

### 2.2. `db-iniciativas` (Base de Datos)
*Fuente única de verdad de la capa de datos y catálogo de migraciones.*

- **Migración 18 (`migraciones/18_flujo_mover_admin.sql`):**
  - Actualiza el procedimiento `sp_transiciones_disponibles` para que usuarios con el permiso `flujo.configurar` (Administradores/Superadmin) puedan visualizar y ejecutar todas las transiciones disponibles en cualquier iniciativa, sin estar obligatoriamente asignados como responsables directos del estado de origen.
- **Procedimiento de Desempeño (`sp_desempeno_funcionarios`):**
  - Cálculo de tiempos promedio de permanencia por estado y métricas de volumen atendido por cada funcionario responsable.

---

### 2.3. `front-tablero` (Frontend Principal)
*Tablero de seguimiento, visualización ejecutiva y gestión operativa de iniciativas.*

- **Filtros Responsivos "World-Class" (`src/rutas/tablero.tsx`, `src/tablero-aprobado.css`):**
  - Implementación de switch adaptativo: botones píldora en pantallas de escritorio y `<select>` estilizado en pantallas móviles (`< 860px`).
- **Alineación Visual Institucional (`src/pie-institucional.css`):**
  - Homologación de ancho máximo del contenedor principal, cabecera GOV.CO y pie de página institucional a `2100px` (`2036px` en footer compensando el padding de `64px`).
- **Panel de Detalle y Acciones (`PanelFlujo`):**
  - Botones de acción organizados por intención cromática (🟢 Avanzar, 🟡 Devolver, 🔴 Rechazar).
  - Banner de confirmación con indicación visual del movimiento de estado (`Estado Origen → Estado Destino`).
  - Campo de motivo obligatorio para devoluciones y rechazos, y opcional para avances.

---

### 2.4. `front-admin` (Frontend Administrativo)
*Consola de parametrización, seguridad y gestión de dependencias.*

- **Rediseño de Navegación Lateral:**
  - Menú lateral colapsable estilo Gmail (iconos compactos con expansión superpuesta al pasar el cursor).
- **Gestión de Direcciones y Estados:**
  - Nueva vista de Configuración con pestañas separadas para el catálogo de dependencias del Ministerio y la máquina de estados del flujo.
- **Administración de Cuentas y Roles:**
  - Alta interactiva de funcionarios con asignación de contraseña provisional y selección de roles RBAC.

---

### 2.5. `front-radicacion` (Frontend Radicación Pública)
*Portal para registro de iniciativas ciudadanas.*

- **Optimización de Experiencia de Usuario:**
  - Ventana modal de radicación ampliada en un 30% (`max-w-2xl`) para mayor legibilidad de formularios extensos.
  - Corrección de comportamiento táctil y selectores en dispositivos iOS y navegadores móviles.

---

### 2.6. `ms-administracion` (Microservicio)
- Incorporación del endpoint `GET /api/admin/estadisticas/desempeno`.
- Soporte para administración de direcciones mediante `sp_listar_direcciones_admin` y `sp_guardar_direccion`.

### 2.7. `ms-flujo-estados` (Microservicio)
- Actualización de lógica de autorización delegada en `sp_mover_iniciativa`.
- Endpoint `/api/flujo/desempeno` para consulta de productividad del flujo.

### 2.8. Microservicios e Infraestructura Base
- `ms-autenticacion`, `ms-iniciativas`, `ms-radicacion`, `ms-notificaciones`, `api-gateway`, `infra-iniciativas`, `tipos-compartidos`:
  - Estandarización de `Dockerfile` no privilegiado (`USER node`).
  - Variables de entorno centralizadas en `.env.example`.

---

## 3. Guía de Scripts del Proyecto y Cómo Aplicarlos

### 3.1. Scripts de Base de Datos y Migraciones SQL

#### A. Aplicar Migraciones Pendientes (Recomendado en Producción / Actualizaciones)
Aplica únicamente las migraciones que no se hayan registrado en la tabla `schema_version` sin tocar datos existentes:
```bash
# Desde la raíz del proyecto (requiere Node.js y MySQL en ejecución)
node scripts/aplicar-migraciones.js
```

#### B. Aplicar Migración Específica Manualmente (Ejemplo: Migración 18)
Si desea aplicar directamente la migración 18 contra el contenedor de MySQL:
```powershell
# En Windows (usando el contenedor de desarrollo o producción)
Get-Content "db-iniciativas\migraciones\18_flujo_mover_admin.sql" | docker exec -i iniciativas-mysql-1 mysql -u root -pdesarrollo iniciativas_legislativas
```

#### C. Crear Primera Cuenta Administradora (Superadmin)
```bash
# Linux / macOS / Git Bash:
SUPERADMIN_CORREO=admin@mininterior.gov.co SUPERADMIN_CONTRASENA=Admin2026! node scripts/crear_superadmin.js

# Windows PowerShell:
$env:SUPERADMIN_CORREO="admin@mininterior.gov.co"
$env:SUPERADMIN_CONTRASENA="Admin2026!"
node scripts/crear_superadmin.js
```

#### D. Sembrar Datos de Demostración (Opcional para Pruebas)
```bash
node scripts/seed_iniciales.js
```

#### E. Instalación Completa desde Cero (Entornos Nuevos)
```bash
./scripts/instalar-base-de-datos.sh
./scripts/verificar-instalacion.sh
```

---

### 3.2. Scripts de Pruebas, Calidad y Accesibilidad (WCAG AA)

#### A. Verificación de Contraste de Color WCAG 2.1 AA
Obligación legal conforme a la Resolución 1519 de 2020 del MinTIC. Comprueba 31 combinaciones cromáticas en hojas de estilo:
```bash
node scripts/verificar-contraste.js
```

#### B. Suite Completa de Pruebas Frontend (7 Suites en jsdom)
Ejecuta verificación de contraste, compila el paquete de pruebas y evalúa accesibilidad, trampas de foco, URLs y filtros:
```bash
cd front-tablero
npm run prueba
```

#### C. Verificación de Flujo y Permisos contra Base de Datos Viva
Evalúa 30 aserciones sobre reglas de negocio, transiciones y autorizaciones:
```bash
node scripts/verificar-flujo.js
```

#### D. Prueba End-to-End (E2E) de la Plataforma
```bash
node scripts/prueba-e2e.mjs
```

---

### 3.3. Scripts de Generación de Documentación (HTML / PDF)

Para compilar los documentos Markdown a versiones HTML independientes listas para visualizar o imprimir en PDF (`Ctrl + P`):

```bash
# 1. Compilar Manual de Usuario con capturas embebidas:
node scripts/manual-a-html.js
# Salida: docs/MANUAL_USUARIO.html

# 2. Compilar Documento de Arquitectura Técnica:
node scripts/arq-a-html.js
# Salida: docs/ARQUITECTURA_TECNICA.html

# 3. Compilar Modelo de Datos y Diagrama ERD (Nivel 3) con Mermaid.js:
node scripts/erd-a-html.js
# Salida: docs/MODELO_DATOS_ERD.html
```

---

### 3.4. Scripts de Despliegue y Orquestación de Contenedores

#### A. Entorno Local Rápido (Windows PowerShell)
```powershell
# Iniciar todo el ecosistema (MySQL, 6 microservicios, API Gateway y 3 frontends):
.\start_all.ps1

# Iniciar forzando la reconstrucción de imágenes Docker:
.\start_all.ps1 -Rebuild

# Detener todos los servicios y contenedores:
.\stop_all.ps1
```

#### B. Solo Base de Datos para Desarrollo Local en Caliente
```bash
# Levanta MySQL 8.4 y aplica automáticamente todas las migraciones:
docker compose -f docker-compose.dev.yml up -d

# Para detener la base de desarrollo:
docker compose -f docker-compose.dev.yml down
```

---

## 4. Procedimiento de Despliegue a Producción

Para desplegar la versión completa en el servidor de producción (`https://mininterior-iniciativas.fabricasoftware.co/`):

1. **Clonar repositorio con todos sus submódulos:**
   ```bash
   git clone --recurse-submodules https://github.com/mininterior-iniciativas/plataforma.git
   cd plataforma
   ```

2. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   # Configurar contraseñas seguras, SESSION_SECRET y ORIGEN_PERMITIDO
   ```

3. **Construir y levantar la orquestación completa:**
   ```bash
   docker compose up -d --build
   ```
   *El contenedor `migrador` aplicará automáticamente todas las migraciones SQL pendientes antes de levantar los microservicios.*

4. **Verificar el estado de salud de los servicios:**
   ```bash
   curl -I https://mininterior-iniciativas.fabricasoftware.co/
   curl -s http://localhost:3000/api/salud
   ```

---

> **Documento de Control de Versiones y Despliegue**  
> **Sistema de Seguimiento de Iniciativas Legislativas**  
> **Ministerio del Interior · República de Colombia**
