param(
    [switch]$Rebuild,
    [switch]$Docker
)

<#
.SYNOPSIS
    Script de despliegue para el Sistema de Iniciativas Legislativas (Arquitectura Multi-Repositorio).
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
# Modo Docker (Infraestructura de Microservicios)
# ---------------------------------------------------------------------
if ($Docker) {
    Write-Host '[MODO DOCKER] Desplegando arquitectura de microservicios con infra-iniciativas...' -ForegroundColor Magenta
    Push-Location "$Raiz\infra-iniciativas"
    if ($Rebuild) {
        docker compose build --no-cache
    }
    docker compose up -d --force-recreate
    Pop-Location
    Start-Sleep -Seconds 3
    Start-Process 'http://localhost:8080'
    Write-Host ''
    Write-Host '[OK] Microservicios desplegados en Docker (Tablero: http://localhost:8080).' -ForegroundColor Green
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
    Remove-Item -Path "$Raiz\front-tablero\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$Raiz\front-tablero\node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------
# 1. Base de Datos MySQL
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '[1/3] Verificando entorno de base de datos...' -ForegroundColor Cyan
try {
    $dockerCheck = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        docker compose -f "$Raiz\docker-compose.dev.yml" up -d 2>$null
        Write-Host '  [OK] Base de datos verificada.' -ForegroundColor Green
    }
} catch {
    Write-Host '  [!] Continuando...' -ForegroundColor Gray
}

# ---------------------------------------------------------------------
# 2. Dependencias de Front-Tablero
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '[2/3] Verificando dependencias del Tablero...' -ForegroundColor Cyan

if (-not (Test-Path "$Raiz\front-tablero\node_modules") -or $Rebuild) {
    Write-Host '  > Instalando dependencias de front-tablero...' -ForegroundColor Gray
    Push-Location "$Raiz\front-tablero"
    npm.cmd install
    Pop-Location
}
Write-Host '  [OK] Dependencias listas.' -ForegroundColor Green

# ---------------------------------------------------------------------
# 3. Compilación Inicial y Arranque
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '[3/3] Compilando e iniciando frontend modular (front-tablero)...' -ForegroundColor Cyan
Push-Location "$Raiz\front-tablero"
try {
    npm.cmd run build
    Write-Host '  [OK] Compilacion completada con exito (Build Successfully).' -ForegroundColor Green
} finally {
    Pop-Location
}

# Abrir el navegador en 2 segundos
Start-Sleep -Seconds 2
Start-Process 'http://localhost:5173'

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  ✓ SISTEMA MODULAR DESPLEGADO Y ACTIVO EN VIVO' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  * Tablero Web:   http://localhost:5173 (front-tablero)' -ForegroundColor White
Write-Host '  * Arquitectura:  12 Repositorios Modulares' -ForegroundColor White
Write-Host '=================================================================' -ForegroundColor Green
Write-Host 'Vite esta corriendo y escuchando cambios en esta consola.' -ForegroundColor Yellow
Write-Host 'Deje esta ventana abierta para mantener el sitio activo.' -ForegroundColor Yellow
Write-Host 'Para detenerlo presione Ctrl+C o ejecute .\stop_all.ps1' -ForegroundColor Gray
Write-Host ''

Push-Location "$Raiz\front-tablero"
npm.cmd run dev -- --host 0.0.0.0 --port 5173
Pop-Location
