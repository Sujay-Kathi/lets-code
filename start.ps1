$ErrorActionPreference = "Stop"

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
# Stop and remove existing container if it exists
$containerId = docker ps -aq -f "name=^rce-redis$"
if ($containerId) {
    Write-Host "Cleaning up existing rce-redis container..." -ForegroundColor Gray
    docker stop rce-redis > $null 2>&1
    docker rm rce-redis > $null 2>&1
}

# Start a fresh redis container
docker run -d --name rce-redis -p 6379:6379 redis:alpine
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start Redis container." -ForegroundColor Red
    exit 1
}

Write-Host "2. Building Docker Sandbox Image (rce-worker)..." -ForegroundColor Cyan
Set-Location worker
docker build -t rce-worker .
Set-Location ..

Write-Host "3. Starting FastAPI Backend..." -ForegroundColor Cyan
# Start in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\.venv\Scripts\Activate.ps1; uvicorn main:app --host 127.0.0.1 --port 8000"

Write-Host "4. Starting Celery Worker..." -ForegroundColor Cyan
# Celery on Windows requires the 'solo' pool thread instead of default multiprocessing
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\.venv\Scripts\Activate.ps1; celery -A worker.celery_app worker --pool=solo --loglevel=info"

Write-Host "5. Starting Next.js Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "=====================================================" -ForegroundColor Green
Write-Host "All services are starting up in separate windows!" -ForegroundColor Green
Write-Host "Wait a few seconds, then open: http://localhost:3000" -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor Green
