# Запуск из корня проекта: .\deploy\scripts\backup-sqlite.ps1
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..") | Select-Object -ExpandProperty Path
Set-Location $Root
$db = if ($env:SQLITE_PATH) { $env:SQLITE_PATH } else { "server/data/app.db" }
if (-not (Test-Path $db)) {
    Write-Error "Файл БД не найден: $db"
    exit 1
}
$null = New-Item -ItemType Directory -Force -Path "backups"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $db "backups/app-$ts.db"
Write-Host "OK: backups/app-$ts.db"
