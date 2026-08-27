<#
.SYNOPSIS
    Script para detener todos los servicios del Sistema de Iniciativas Legislativas.
#>

Write-Host "Deteniendo servicios de Iniciativas Legislativas..." -ForegroundColor Cyan

$Raiz = $PSScriptRoot
if (-not $Raiz) { $Raiz = Get-Location }

# 1. Detener procesos node en puertos 3000 y 5173
Write-Host "  > Deteniendo procesos Node.js locales..." -ForegroundColor Gray
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Detener contenedor MySQL si esta activo
try {
    Write-Host "  > Deteniendo contenedor MySQL..." -ForegroundColor Gray
    docker compose -f "$Raiz/docker-compose.dev.yml" down 2>$null
    docker compose down 2>$null
} catch {
    # Ignorar si docker no esta corriendo
}

Write-Host "[OK] Todos los servicios han sido detenidos correctamente." -ForegroundColor Green
