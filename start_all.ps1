param(
    [switch]$Rebuild,
    [switch]$Dev
)

<#
.SYNOPSIS
    Arranque del Sistema de Iniciativas Legislativas (arquitectura multi-repositorio).
    Ministerio del Interior - Republica de Colombia

.DESCRIPTION
    Por defecto levanta la PLATAFORMA COMPLETA en Docker (3 frontends + API
    Gateway + 6 microservicios + base migrada), que es la forma probada de
    correrla. La base de datos se migra sola al arrancar (servicio migrador).

      .\start_all.ps1            # plataforma completa en Docker
      .\start_all.ps1 -Rebuild   # reconstruye las imagenes
      .\start_all.ps1 -Dev       # modo desarrollo (ver abajo)

    -Dev levanta solo la base (ya migrada) y deja los microservicios y el
    frontend para correrlos en caliente con 'npm run dev'. Antes, el arranque
    por defecto solo levantaba el Vite del tablero y ningun backend, asi que
    la aplicacion no funcionaba. Ver docs/auditoria-qa.md (F-01).
#>

$Raiz = $PSScriptRoot
if (-not $Raiz) { $Raiz = (Get-Location).Path }

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  SISTEMA DE SEGUIMIENTO DE INICIATIVAS LEGISLATIVAS' -ForegroundColor Yellow
Write-Host '  Ministerio del Interior - Republica de Colombia' -ForegroundColor White
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

# Comprobacion de requisitos comunes
try {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'docker-no-disponible' }
} catch {
    Write-Host '[ERROR] Docker no esta disponible. Inicie Docker Desktop y reintente.' -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------
# Modo DESARROLLO: solo la base migrada; los servicios se corren a mano.
# ---------------------------------------------------------------------
if ($Dev) {
    Write-Host '[MODO DEV] Levantando base de datos de desarrollo (con migraciones)...' -ForegroundColor Magenta
    Push-Location $Raiz
    try {
        docker compose -f 'docker-compose.dev.yml' up -d
    } finally {
        Pop-Location
    }
    Write-Host ''
    Write-Host '[OK] Base de desarrollo lista en 127.0.0.1:3306 (base: iniciativas_legislativas).' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Ahora, en terminales separadas, arranque cada servicio en caliente:' -ForegroundColor Yellow
    Write-Host '  cd ms-autenticacion  ; npm install ; npm run dev   (y cada ms-*)' -ForegroundColor Gray
    Write-Host '  cd api-gateway       ; npm install ; npm run dev' -ForegroundColor Gray
    Write-Host '  cd front-tablero     ; npm install ; npm run dev' -ForegroundColor Gray
    Write-Host ''
    Write-Host 'Cada servicio necesita su .env (copie el .env.example y complete DB_*,' -ForegroundColor Gray
    Write-Host 'SESSION_SECRET y ORIGEN_PERMITIDO). Ver INSTALACION.md.' -ForegroundColor Gray
    Write-Host ''
    exit 0
}

# ---------------------------------------------------------------------
# Modo por defecto: plataforma completa en Docker.
# ---------------------------------------------------------------------
Write-Host '[DOCKER] Desplegando la plataforma completa...' -ForegroundColor Magenta

if (-not (Test-Path "$Raiz\.env")) {
    Write-Host '[ERROR] Falta el archivo .env en la raiz.' -ForegroundColor Red
    Write-Host '        Copie .env.example a .env y complete DB_ROOT_PASSWORD, DB_PASSWORD,' -ForegroundColor Gray
    Write-Host '        SESSION_SECRET, SERVICIO_TOKEN y ORIGEN_PERMITIDO.' -ForegroundColor Gray
    exit 1
}

Push-Location $Raiz
try {
    if ($Rebuild) {
        Write-Host '  > Reconstruyendo imagenes (--no-cache)...' -ForegroundColor Gray
        docker compose build --no-cache
    }
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[ERROR] docker compose fallo. Revise la salida anterior.' -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

Start-Sleep -Seconds 3
Start-Process 'http://localhost:8080'

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  PLATAFORMA DESPLEGADA' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green
Write-Host '  * Tablero:     http://localhost:8080' -ForegroundColor White
Write-Host '  * Radicacion:  http://localhost:8081' -ForegroundColor White
Write-Host '  * Admin:       http://localhost:8082' -ForegroundColor White
Write-Host '  Para detener:  .\stop_all.ps1' -ForegroundColor Gray
Write-Host '=================================================================' -ForegroundColor Green
Write-Host ''
