<#
.SYNOPSIS
    Detiene todos los servicios del Sistema de Iniciativas Legislativas.
#>

Write-Host "Deteniendo servicios de Iniciativas Legislativas..." -ForegroundColor Cyan

$Raiz = $PSScriptRoot
if (-not $Raiz) { $Raiz = Get-Location }

# 1. Detener todos los procesos Node.js
Write-Host "  > Deteniendo procesos Node.js..." -ForegroundColor Gray
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Detener contenedores Docker
try {
    Write-Host "  > Deteniendo contenedores Docker..." -ForegroundColor Gray
    docker compose -f "$Raiz/docker-compose.dev.yml" down 2>$null
} catch {
    # Ignorar si Docker no esta corriendo
}

Write-Host ""
Write-Host "[OK] Todos los servicios han sido detenidos." -ForegroundColor Green
Write-Host "     Para volver a levantar: .\start_all.ps1" -ForegroundColor Gray
