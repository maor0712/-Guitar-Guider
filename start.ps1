# Builds the web app and starts Guitar Guider on http://localhost:8000
$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Push-Location "$PSScriptRoot\frontend"
if (-not (Test-Path node_modules)) { npm install }
npm run build
Pop-Location

Push-Location "$PSScriptRoot\backend"
Start-Process "http://localhost:8000"
uv run guitar-guider-backend
Pop-Location
