# Sicherheits-Prüfung für das ÖFFENTLICHE App-Repo.
# Sucht nach Zugriffstoken und Kundendaten in allen Dateien, die zu GitHub hochgeladen würden.
# Aufruf: Rechtsklick > "Mit PowerShell ausführen" oder:  powershell -ExecutionPolicy Bypass -File werkzeuge\pruefen.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$probleme = @()

$dateien = git ls-files --cached --others --exclude-standard
foreach ($d in $dateien) {
  if ($d -match '\.(jpe?g|heic|pdf)$' -or $d -match '(^|/)besichtigungen/' -or $d -match '(^|/)(daten|kunden)\.json$') {
    $probleme += "Verdaechtige Datei: $d"
    continue
  }
  if ($d -match '\.(png|ico)$') { continue }
  $inhalt = Get-Content -Raw -LiteralPath $d -ErrorAction SilentlyContinue
  if ($inhalt -and $inhalt -match '(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,})') {
    $probleme += "Moeglicher Zugriffstoken in: $d"
  }
}

if ($probleme.Count -eq 0) {
  Write-Host 'OK: Keine Token und keine Kundendaten gefunden.' -ForegroundColor Green
  exit 0
} else {
  Write-Host 'ACHTUNG - bitte NICHT hochladen:' -ForegroundColor Red
  $probleme | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}
