param(
    [switch]$Rebuild,
    [switch]$Docker
)

<#
.SYNOPSIS
    Script de despliegue para el Sistema de Iniciativas Legislativas.
    Ministerio del Interior - Republica de Colombia
#>

$Raiz = $PSScriptRoot
if (-not $Raiz) { $Raiz = (Get-Location).Path }

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  SISTEMA DE SEGUIMIENTO DE INICIATIVAS LEGISLATIVAS' -ForegroundColor Yellow
Write-Host '  Ministerio del Interior - Republica de Colombia' -ForegroundColor White
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------------
# Modo Docker
# ---------------------------------------------------------------------
if ($Docker) {
    Write-Host '[MODO DOCKER] Desplegando en contenedores...' -ForegroundColor Magenta
    if ($Rebuild) {
        docker compose build --no-cache
    }
    docker compose up -d --force-recreate
    Start-Sleep -Seconds 3
    Start-Process 'http://localhost:8080'
    Write-Host ''
    Write-Host '[OK] Desplegado en Docker (http://localhost:8080).' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# ---------------------------------------------------------------------
# 0. Limpiar procesos previos
# ---------------------------------------------------------------------
Write-Host '  > Verificando y limpiando procesos previos...' -ForegroundColor Gray
Get-Process -Name 'node' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if ($Rebuild) {
    Write-Host '  > Limpiando cache de Vite...' -ForegroundColor Magenta
    Remove-Item -Path "$Raiz\web\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$Raiz\web\node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------
# 1. Base de Datos MySQL
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '[1/4] Verificando Base de Datos MySQL...' -ForegroundColor Cyan
try {
    $dockerCheck = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        docker compose -f "$Raiz\docker-compose.dev.yml" up -d
        Write-Host '  [OK] Base de datos activa en puerto 3306.' -ForegroundColor Green
    } else {
        Write-Host '  [!] Docker no activo. Verifique MySQL en puerto 3306.' -ForegroundColor Yellow
    }
} catch {
    Write-Host '  [!] No se pudo verificar Docker. Continuando...' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------
# 2. Dependencias
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '[2/4] Verificando dependencias de Node.js...' -ForegroundColor Cyan

if (-not (Test-Path "$Raiz\api\node_modules") -or $Rebuild) {
    Write-Host '  > Instalando dependencias de la API...' -ForegroundColor Gray
    Push-Location "$Raiz\api"
    npm.cmd install
    Pop-Location
}
Write-Host '  [OK] Dependencias API listas.' -ForegroundColor Green

if (-not (Test-Path "$Raiz\web\node_modules") -or $Rebuild) {
    Write-Host '  > Instalando dependencias Web...' -ForegroundColor Gray
    Push-Location "$Raiz\web"
    npm.cmd install
    Pop-Location
}
Write-Host '  [OK] Dependencias Web listas.' -ForegroundColor Green

# ---------------------------------------------------------------------
# 3. Compilación Inicial
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '[3/4] Compilando TypeScript y generando paquete Web...' -ForegroundColor Cyan
Push-Location "$Raiz\web"
try {
    npm.cmd run build
    Write-Host '  [OK] Compilacion completada con exito (Build Successfully).' -ForegroundColor Green
} finally {
    Pop-Location
}

# ---------------------------------------------------------------------
# 4. Iniciar Servidores y Mantener Proceso Activo
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '[4/4] Iniciando servidores...' -ForegroundColor Cyan

# Iniciar API Express en segundo plano
$ComandoApi = "cd '$Raiz\api'; npm.cmd run dev"
Start-Process powershell.exe -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $ComandoApi -WindowStyle Hidden

# Abrir el navegador en 2 segundos
Start-Sleep -Seconds 2
Start-Process 'http://localhost:5173'

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  ✓ SISTEMA DESPLEGADO Y ACTIVO EN VIVO' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  * Tablero Web:   http://localhost:5173' -ForegroundColor White
Write-Host '  * API Backend:   http://localhost:3000/api/salud' -ForegroundColor White
Write-Host '  * Base de Datos: localhost:3306 (MySQL 8.4)' -ForegroundColor White
Write-Host '=================================================================' -ForegroundColor Green
Write-Host 'Vite esta corriendo y escuchando cambios en esta consola.' -ForegroundColor Yellow
Write-Host 'Deje esta ventana abierta para mantener el sitio activo.' -ForegroundColor Yellow
Write-Host 'Para detenerlo presione Ctrl+C o ejecute .\stop_all.ps1' -ForegroundColor Gray
Write-Host ''

# Ejecutar Vite en el primer plano para que esta consola nunca se cierre y mantenga el servidor activo:
Push-Location "$Raiz\web"
npm.cmd run dev -- --host 0.0.0.0 --port 5173
Pop-Location
