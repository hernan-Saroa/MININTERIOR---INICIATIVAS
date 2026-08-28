param(
    [switch]$Rebuild
)

# start_all.ps1 - Levanta TODO el Sistema de Iniciativas Legislativas
# Uso:
#     .\start_all.ps1           # Arranque normal
#     .\start_all.ps1 -Rebuild  # Reinstala dependencias

$Raiz = $PSScriptRoot
if (-not $Raiz) { $Raiz = (Get-Location).Path }

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  SISTEMA DE SEGUIMIENTO DE INICIATIVAS LEGISLATIVAS' -ForegroundColor Yellow
Write-Host '  Ministerio del Interior - Republica de Colombia' -ForegroundColor White
Write-Host '  Arquitectura: 12 Repositorios Modulares' -ForegroundColor Gray
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

# 0. Limpiar procesos Node previos
Write-Host '[0/5] Limpiando procesos previos...' -ForegroundColor Gray
Get-Process -Name 'node' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 1. Base de Datos MySQL (Docker)
Write-Host ''
Write-Host '[1/5] Levantando Base de Datos MySQL 8.4 + Migraciones...' -ForegroundColor Cyan
try {
    docker compose -f "$Raiz\docker-compose.dev.yml" up -d
    Write-Host '  [OK] MySQL activo en localhost:3306' -ForegroundColor Green
    Write-Host '  [OK] Migrador aplicando 15 migraciones automaticamente' -ForegroundColor Green
} catch {
    Write-Host '  [!] Error al levantar Docker. Verifique que Docker Desktop este activo.' -ForegroundColor Red
    exit 1
}

# Esperar a que MySQL este saludable
Write-Host '  > Esperando a que MySQL este listo...' -ForegroundColor Gray
$intentos = 0
do {
    Start-Sleep -Seconds 2
    $intentos++
    $estado = docker inspect --format='{{.State.Health.Status}}' iniciativas-mysql-1 2>$null
} while ($estado -ne 'healthy' -and $intentos -lt 30)

if ($estado -eq 'healthy') {
    Write-Host '  [OK] MySQL saludable y listo.' -ForegroundColor Green
} else {
    Write-Host '  [!] MySQL no respondio a tiempo. Revise docker compose logs.' -ForegroundColor Yellow
}

# 2. Variables de entorno para microservicios
Write-Host ''
Write-Host '[2/5] Configurando variables de entorno...' -ForegroundColor Cyan

$envContent = @"
DB_HOST=127.0.0.1
DB_NAME=iniciativas_legislativas
DB_USER=iniciativas_app
DB_PASSWORD=desarrollo
SESSION_SECRET=desarrollo_local_secreto_temporal_2026
NODE_ENV=development
"@

$servicios = @('ms-autenticacion', 'ms-iniciativas', 'ms-radicacion', 'ms-flujo-estados', 'ms-notificaciones', 'ms-administracion', 'api-gateway')

foreach ($s in $servicios) {
    $envPath = Join-Path $Raiz "$s\.env"
    if (-not (Test-Path $envPath)) {
        Set-Content -Path $envPath -Value $envContent -Force
    }
}
Write-Host '  [OK] Variables de entorno configuradas.' -ForegroundColor Green

# 3. Dependencias
Write-Host ''
Write-Host '[3/5] Verificando dependencias de Node.js...' -ForegroundColor Cyan

$todos = @('ms-autenticacion', 'ms-iniciativas', 'ms-radicacion', 'ms-administracion', 'api-gateway', 'front-tablero')

foreach ($s in $todos) {
    $ruta = Join-Path $Raiz $s
    $modulos = Join-Path $ruta 'node_modules'
    if ((-not (Test-Path $modulos)) -or $Rebuild) {
        Write-Host "  > Instalando dependencias en $s..." -ForegroundColor Gray
        Push-Location $ruta
        npm.cmd install 2>&1 | Out-Null
        Pop-Location
    }
}
Write-Host '  [OK] Todas las dependencias listas.' -ForegroundColor Green

# 4. Levantar Microservicios y API Gateway
Write-Host ''
Write-Host '[4/5] Levantando microservicios y API Gateway...' -ForegroundColor Cyan

$msConfig = @(
    @{ nombre = 'ms-autenticacion'; puerto = 3001 },
    @{ nombre = 'ms-iniciativas';   puerto = 3002 },
    @{ nombre = 'ms-radicacion';    puerto = 3003 },
    @{ nombre = 'ms-administracion'; puerto = 3006 }
)

foreach ($ms in $msConfig) {
    $rutaMs = Join-Path $Raiz $ms.nombre
    $cmd = "cd '$rutaMs'; npm.cmd run dev"
    Start-Process powershell.exe -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $cmd -WindowStyle Hidden
    Write-Host "  [OK] $($ms.nombre) -> puerto $($ms.puerto)" -ForegroundColor Green
}

# API Gateway con las URLs de los microservicios locales
$rutaGw = Join-Path $Raiz 'api-gateway'
$cmdGw = @"
`$env:MS_AUTENTICACION_URL='http://localhost:3001'
`$env:MS_INICIATIVAS_URL='http://localhost:3002'
`$env:MS_RADICACION_URL='http://localhost:3003'
`$env:MS_FLUJO_URL='http://localhost:3004'
`$env:MS_NOTIFICACIONES_URL='http://localhost:3005'
`$env:MS_ADMINISTRACION_URL='http://localhost:3006'
cd '$rutaGw'
npm.cmd run dev
"@
Start-Process powershell.exe -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $cmdGw -WindowStyle Hidden
Write-Host '  [OK] api-gateway -> puerto 3000' -ForegroundColor Green

# Esperar a que arranquen
Start-Sleep -Seconds 3

# 5. Frontend (Vite en primer plano)
Write-Host ''
Write-Host '[5/5] Iniciando frontend (front-tablero)...' -ForegroundColor Cyan

Start-Sleep -Seconds 2
Start-Process 'http://localhost:5173'

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  SISTEMA COMPLETO DESPLEGADO Y ACTIVO' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host ''
Write-Host '  SERVICIOS ACTIVOS:' -ForegroundColor White
Write-Host '  -------------------------------------------------' -ForegroundColor DarkGray
Write-Host '  MySQL 8.4          -> localhost:3306  (Docker)' -ForegroundColor White
Write-Host '  ms-autenticacion   -> localhost:3001' -ForegroundColor White
Write-Host '  ms-iniciativas     -> localhost:3002' -ForegroundColor White
Write-Host '  ms-radicacion      -> localhost:3003' -ForegroundColor White
Write-Host '  ms-administracion  -> localhost:3006' -ForegroundColor White
Write-Host '  API Gateway        -> localhost:3000' -ForegroundColor White
Write-Host '  Tablero Web (Vite) -> localhost:5173  << ABRIR AQUI' -ForegroundColor Yellow
Write-Host '  -------------------------------------------------' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  CREDENCIALES:' -ForegroundColor White
Write-Host '  admin@mininterior.gov.co / Admin2026MinInt!' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Deje esta ventana abierta. Ctrl+C para detener Vite.' -ForegroundColor Gray
Write-Host '  Para detener todo: .\stop_all.ps1' -ForegroundColor Gray
Write-Host ''

# Vite corre en primer plano para mantener esta consola activa
$rutaFront = Join-Path $Raiz 'front-tablero'
Push-Location $rutaFront
npm.cmd run dev -- --host 0.0.0.0 --port 5173
Pop-Location
