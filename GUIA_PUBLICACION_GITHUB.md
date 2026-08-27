# Guía de Publicación de Repositorios en GitHub

## Requisitos previos

- Tener una cuenta de GitHub con acceso a la organización del Ministerio (o crear una).
- Tener Git instalado y configurado con su usuario:

```powershell
git config --global user.name "Su Nombre"
git config --global user.email "su.correo@mininterior.gov.co"
```

---

## Paso 1: Crear la Organización en GitHub (si no existe)

1. Ir a https://github.com/organizations/new
2. Nombre sugerido: `mininterior-iniciativas` o `viceministerio-dialogo`
3. Tipo: **Free** (para repositorios privados ilimitados)
4. Agregar a los integrantes del equipo

---

## Paso 2: Crear los 12 repositorios en GitHub

Desde la página de la organización, crear cada repositorio como **privado** y **vacío** (sin README, sin .gitignore, sin licencia):

| # | Nombre del repositorio | Descripción |
|---|---|---|
| 1 | `front-tablero` | Interfaz web principal para la visualización y seguimiento de iniciativas legislativas |
| 2 | `front-radicacion` | Portal ciudadano de radicación de propuestas legislativas y consulta pública |
| 3 | `front-admin` | Panel administrativo para usuarios, roles, flujo de estados y métricas |
| 4 | `ms-autenticacion` | Microservicio de autenticación, sesiones y recuperación de contraseñas |
| 5 | `ms-iniciativas` | Microservicio de gestión de iniciativas, documentos y exportación CSV |
| 6 | `ms-radicacion` | Microservicio de recepción de propuestas ciudadanas y consulta pública |
| 7 | `ms-flujo-estados` | Microservicio de máquina de estados, transiciones y auditoría |
| 8 | `ms-notificaciones` | Microservicio de envío de correos institucionales automatizados |
| 9 | `ms-administracion` | Microservicio de administración de usuarios, permisos y reportes |
| 10 | `api-gateway` | Punto de entrada único que enruta peticiones hacia los microservicios |
| 11 | `infra-iniciativas` | Docker Compose y configuraciones de despliegue en contenedores |
| 12 | `tipos-compartidos` | Paquete TypeScript @mininterior/tipos con contratos de datos compartidos |

---

## Paso 3: Subir cada repositorio local al remoto

Abra una terminal PowerShell en la raíz del proyecto
(`C:\Users\Hernan_Buitrago\Documents\Mininterior\Iniciativas`) y ejecute:

```powershell
# Reemplace ORGANIZACION por el nombre de su organización en GitHub
$org = "mininterior-iniciativas"

$repos = @(
  "front-tablero",
  "front-radicacion",
  "front-admin",
  "ms-autenticacion",
  "ms-iniciativas",
  "ms-radicacion",
  "ms-flujo-estados",
  "ms-notificaciones",
  "ms-administracion",
  "api-gateway",
  "infra-iniciativas",
  "tipos-compartidos"
)

foreach ($repo in $repos) {
  Write-Host "`n>>> Publicando: $repo" -ForegroundColor Cyan
  Push-Location $repo

  # Conectar con el remoto en GitHub
  git remote add origin "https://github.com/$org/$repo.git"

  # Subir la rama main
  git push -u origin main

  Pop-Location
  Write-Host "    ✓ $repo publicado" -ForegroundColor Green
}

Write-Host "`n¡Los 12 repositorios han sido publicados!" -ForegroundColor Yellow
```

> **Nota:** La primera vez le pedirá autenticarse. GitHub ya no acepta
> contraseñas por HTTPS. Use un **Personal Access Token (PAT)** o
> configure **SSH**. Instrucciones:
> https://docs.github.com/es/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

---

## Paso 4: Configurar ramas protegidas

Para cada repositorio, en GitHub vaya a:
**Settings → Branches → Add branch protection rule**

- Rama: `main`
- Activar:
  - ☑ Require a pull request before merging
  - ☑ Require approvals (1 mínimo)
  - ☑ Require status checks to pass before merging

Crear también las ramas `develop` y `staging`:

```powershell
foreach ($repo in $repos) {
  Push-Location $repo
  git checkout -b develop
  git push -u origin develop
  git checkout -b staging
  git push -u origin staging
  git checkout main
  Pop-Location
  Write-Host "Ramas creadas en: $repo"
}
```

---

## Paso 5: Configurar permisos por equipo

En la organización, crear los equipos y asignar acceso:

### Equipo: `diseño`
- `front-tablero` → **Write**
- `front-radicacion` → **Write**
- `front-admin` → **Write**
- `tipos-compartidos` → **Read**
- Sin acceso a los demás

### Equipo: `backend`
- `ms-autenticacion` → **Write**
- `ms-iniciativas` → **Write**
- `ms-radicacion` → **Write**
- `ms-flujo-estados` → **Write**
- `ms-notificaciones` → **Write**
- `ms-administracion` → **Write**
- `api-gateway` → **Write**
- `tipos-compartidos` → **Write**
- Sin acceso a `infra-iniciativas`

### Equipo: `devops`
- `infra-iniciativas` → **Admin**
- `api-gateway` → **Write**
- Todos los demás → **Read**

### Equipo: `lider-tecnico`
- Todos los repositorios → **Admin**

---

## Paso 6: Flujo de trabajo diario

### Para el equipo de diseño (frontends):

```powershell
# 1. Ir al frontend que va a modificar
cd front-tablero

# 2. Crear una rama de trabajo
git checkout develop
git pull origin develop
git checkout -b feat/mejora-filtros

# 3. Hacer cambios, probar localmente
npm install
npm run dev

# 4. Guardar los cambios
git add .
git commit -m "feat: mejorar los filtros del tablero por prioridad"

# 5. Subir y crear Pull Request
git push -u origin feat/mejora-filtros
# → Ir a GitHub y crear el Pull Request hacia develop
```

### Para el equipo de backend (microservicios):

```powershell
cd ms-iniciativas
git checkout develop
git pull origin develop
git checkout -b fix/validacion-documentos

# Hacer cambios
git add .
git commit -m "fix: validar formato de enlace antes de guardar documento"
git push -u origin fix/validacion-documentos
```

---

## Paso 7: Mantener sincronizado después de cambios

Cada vez que haga cambios en el proyecto, ejecute:

```powershell
# Desde la raíz del proyecto
foreach ($repo in $repos) {
  Push-Location $repo
  git add .
  $cambios = git status --porcelain
  if ($cambios) {
    git commit -m "chore: sincronizar cambios recientes"
    git push origin main
    Write-Host "Cambios enviados: $repo"
  } else {
    Write-Host "Sin cambios: $repo"
  }
  Pop-Location
}
```

---

## Resumen de URLs (después de crear los repos)

| Repositorio | URL |
|---|---|
| front-tablero | `https://github.com/ORGANIZACION/front-tablero` |
| front-radicacion | `https://github.com/ORGANIZACION/front-radicacion` |
| front-admin | `https://github.com/ORGANIZACION/front-admin` |
| ms-autenticacion | `https://github.com/ORGANIZACION/ms-autenticacion` |
| ms-iniciativas | `https://github.com/ORGANIZACION/ms-iniciativas` |
| ms-radicacion | `https://github.com/ORGANIZACION/ms-radicacion` |
| ms-flujo-estados | `https://github.com/ORGANIZACION/ms-flujo-estados` |
| ms-notificaciones | `https://github.com/ORGANIZACION/ms-notificaciones` |
| ms-administracion | `https://github.com/ORGANIZACION/ms-administracion` |
| api-gateway | `https://github.com/ORGANIZACION/api-gateway` |
| infra-iniciativas | `https://github.com/ORGANIZACION/infra-iniciativas` |
| tipos-compartidos | `https://github.com/ORGANIZACION/tipos-compartidos` |
