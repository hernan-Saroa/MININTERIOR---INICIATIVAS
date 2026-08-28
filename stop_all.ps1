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

# 2. Detener la plataforma en Docker (modo por defecto y modo dev)
try {
    Write-Host "  > Deteniendo contenedores..." -ForegroundColor Gray
    Push-Location $Raiz
    docker compose down 2>$null
    docker compose -f "docker-compose.dev.yml" down 2>$null
    Pop-Location
} catch {
    # Ignorar si docker no esta corriendo
}

Write-Host "[OK] Todos los servicios han sido detenidos correctamente." -ForegroundColor Green
