$ErrorActionPreference = "Stop"

Write-Host "Checking for Docker..." -ForegroundColor Cyan
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not running." -ForegroundColor Red
    Write-Host "Please install Docker Desktop for Windows: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Write-Host "After installing and starting Docker, run this script again."
    exit 1
}

Write-Host "1. Starting Redis Container..." -ForegroundColor Cyan
# Start a redis container named 'rce-redis' on port 6379
docker run -d --name rce-redis -p 6379:6379 redis:alpine 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Redis might already be running. Attempting to start the existing container..." -ForegroundColor Yellow
    docker start rce-redis 2>$null
}

Write-Host "2. Building Docker Sandbox Image (rce-worker)..." -ForegroundColor Cyan
cd worker
docker build -t rce-worker .
cd ..

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
