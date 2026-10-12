# Локальная разработка: онлайн-лобби, без NFC, Vite proxy к server:8080
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:NFC_MODE = "off"
$env:TABLETOP_MODE = "0"
$env:PORT = "8080"

if (-not (Test-Path "server\node_modules")) {
  Push-Location server; npm install; Pop-Location
}
if (-not (Test-Path "front\node_modules")) {
  Push-Location front; npm install; Pop-Location
}

Write-Host "[run-dev] starting server (online, NFC off) on :8080"
Start-Process -WorkingDirectory "$Root\server" -FilePath "npm" -ArgumentList "run","dev" -NoNewWindow

Start-Sleep -Seconds 2
Write-Host "[run-dev] starting Vite on :5173 (proxy /ws → :8080)"
Set-Location front
npm run dev
