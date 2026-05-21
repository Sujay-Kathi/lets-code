$ErrorActionPreference = "Stop"

# Load .env file into current session so all child processes inherit these vars
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Write-Host "Loading environment variables from .env..." -ForegroundColor Gray
    Get-Content $envFile | ForEach-Object {
        $_ = $_.Trim()
        if ($_ -and -not $_.StartsWith("#") -and $_ -match "^([^=]+)=(.*)$") {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $val, "Process")
            Write-Host "  [env] $key = $($val.Substring(0, [Math]::Min(12, $val.Length)))..." -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "WARNING: .env file not found. AI evaluation will not work." -ForegroundColor Yellow
}

# Add Docker to PATH if not already present
$dockerPath = "C:\Program Files\Docker\Docker\resources\bin"
if ($env:PATH -notlike "*$dockerPath*") {
    $env:PATH += ";$dockerPath"
}

Write-Host "Checking for Docker..." -ForegroundColor Cyan
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not running." -ForegroundColor Red
    Write-Host "Please install Docker Desktop for Windows: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Write-Host "After installing and starting Docker, run this script again."
    exit 1
}

Write-Host "1. Starting Redis Container..." -ForegroundColor Cyan
$containerId = docker ps -aq -f "name=^rce-redis$"
if ($containerId) {
    Write-Host "Starting existing rce-redis container..." -ForegroundColor Gray
    docker start rce-redis > $null 2>&1
} else {
    Write-Host "Creating and starting new rce-redis container..." -ForegroundColor Gray
    docker run -d --name rce-redis -p 6379:6379 redis:alpine > $null
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start Redis container." -ForegroundColor Red
    exit 1
}

Write-Host "2. Docker Sandbox Image (rce-worker)..." -ForegroundColor Cyan
# Check if image already exists - skip build if so (use --force-rebuild flag to override)
$existingImage = docker images rce-worker --format "{{.ID}}" 2>$null
if ($existingImage -and -not $args -contains "--force-rebuild") {
    Write-Host "  Image already exists. Skipping build. (use --force-rebuild to rebuild)" -ForegroundColor Green
} else {
    Write-Host "  Building image..." -ForegroundColor Gray
    Set-Location worker
    $buildAttempts = 0
    $buildSuccess = $false
    while ($buildAttempts -lt 3 -and -not $buildSuccess) {
        $buildAttempts++
        Write-Host "  Build attempt $buildAttempts/3..." -ForegroundColor Gray
        docker build -t rce-worker . 2>&1
        if ($LASTEXITCODE -eq 0) {
            $buildSuccess = $true
        } else {
            Write-Host "  Build attempt $buildAttempts failed. Retrying in 5s..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
    Set-Location ..
    if (-not $buildSuccess) {
        Write-Host "WARNING: Docker sandbox build failed after 3 attempts." -ForegroundColor Red
        Write-Host "Code execution will fail. Check Docker Desktop and internet connectivity." -ForegroundColor Yellow
        Write-Host "You can rebuild later with: cd worker; docker build -t rce-worker ." -ForegroundColor Gray
    }
}

# Build env var string to inject into sub-processes
$envSetCommands = @()
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $_ = $_.Trim()
        if ($_ -and -not $_.StartsWith("#") -and $_ -match "^([^=]+)=(.*)$") {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()
            $envSetCommands += "`$env:$key='$val'"
        }
    }
}
$envBlock = ($envSetCommands -join "; ")

Write-Host "3. Starting FastAPI Backend..." -ForegroundColor Cyan
# Start in a new window with env vars injected
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; $envBlock; .\.venv\Scripts\Activate.ps1; uvicorn main:app --host 0.0.0.0 --port 8000"

Write-Host "4. Starting Celery Worker..." -ForegroundColor Cyan
# Celery on Windows requires the 'solo' pool. Env vars injected for AI evaluator.
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; $envBlock; .\.venv\Scripts\Activate.ps1; celery -A worker.celery_app worker --pool=solo --loglevel=info"

# Detect WiFi IP for network access
$wifiIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" -ErrorAction SilentlyContinue).IPAddress
if (-not $wifiIP) {
    $wifiIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback|Bluetooth' } | Select-Object -First 1).IPAddress
}
$hostAddr = if ($wifiIP) { $wifiIP } else { "0.0.0.0" }

Write-Host "5. Starting Next.js Frontend (on $hostAddr)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev -- --hostname $hostAddr"

Write-Host "=====================================================" -ForegroundColor Green
Write-Host "All services are starting up in separate windows!" -ForegroundColor Green
Write-Host ""
Write-Host "  Local:    http://localhost:3000" -ForegroundColor White
if ($wifiIP) {
    Write-Host "  Phone:    http://${wifiIP}:3000" -ForegroundColor Yellow
}
Write-Host "=====================================================" -ForegroundColor Green
