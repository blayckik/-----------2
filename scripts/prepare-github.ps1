#requires -Version 5.1
<#
.SYNOPSIS
  Безопасно уменьшает рабочую папку FUNBOX перед загрузкой на GitHub.

.DESCRIPTION
  Удаляет только регенерируемые артефакты:
    node_modules/, apps/*/node_modules/, apps/*/dist/, .data/, screens/
  Исходники, миграции, .env, документация и изображения НЕ удаляются.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/prepare-github.ps1 -Force
#>
param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (& git rev-parse --show-toplevel 2>$null)
if (-not $root) {
  throw 'Запустите скрипт внутри git-репозитория FUNBOX.'
}
Set-Location $root

$before = (Get-ChildItem . -Recurse -File -Force -ErrorAction SilentlyContinue |
  Measure-Object Length -Sum).Sum
Write-Host ("Размер до очистки: {0:N1} MB" -f ($before / 1MB))

$targets = @(
  'node_modules',
  'apps/api/node_modules',
  'apps/bot/node_modules',
  'apps/web/node_modules',
  'apps/api/dist',
  'apps/bot/dist',
  'apps/web/dist',
  '.data',
  'screens'
)

if (-not $Force) {
  Write-Host 'Будут удалены только регенерируемые папки:'
  $targets | ForEach-Object { Write-Host "  - $_" }
  $answer = Read-Host 'Продолжить? [y/N]'
  if ($answer -notin @('y', 'Y', 'yes', 'YES')) {
    Write-Host 'Отменено.'
    exit 0
  }
}

foreach ($relative in $targets) {
  $full = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $full)) { continue }

  # rmdir корректно обрабатывает pnpm-симлинки на Windows; Remove-Item
  # иногда падает с "tag mismatch" на reparse point.
  Write-Host "Удаление $relative"
  cmd /c "rmdir /s /q `"$full`"" | Out-Null
  if (Test-Path -LiteralPath $full) {
    Write-Warning "Не удалось полностью удалить $relative"
  }
}

$after = (Get-ChildItem . -Recurse -File -Force -ErrorAction SilentlyContinue |
  Measure-Object Length -Sum).Sum
$gitSize = (Get-ChildItem .git -Recurse -File -Force -ErrorAction SilentlyContinue |
  Measure-Object Length -Sum).Sum
Write-Host ("Размер после очистки: {0:N1} MB" -f ($after / 1MB))
Write-Host ("Из них .git: {0:N1} MB" -f ($gitSize / 1MB))
Write-Host ''
Write-Host 'Восстановление локального запуска:'
Write-Host '  pnpm install'
Write-Host '  pnpm db:start'
Write-Host '  pnpm db:push'
Write-Host '  pnpm db:seed'
Write-Host '  pnpm dev'
