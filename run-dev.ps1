# ARCHEI Companion - avvio dev WS + Web (PowerShell)
# Salva questo file nella cartella del repo e avvialo con tasto destro -> Esegui con PowerShell

# Vai nella cartella dello script (root repo)
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "==> Verifica Node e PNPM..."
try {
  $nodev = (& node -v) 2>$null
} catch { $nodev = $null }
if (-not $nodev) {
  Write-Host "ERRORE: Node non trovato. Installa Node 20.18.0." -ForegroundColor Red
  exit 1
}
Write-Host "Node: $nodev"

# Attiva PNPM via Corepack (usa la versione richiesta)
try {
  corepack enable | Out-Null
} catch {}
corepack prepare pnpm@10.18.3 --activate

# Install (solo se manca node_modules alla root)
if (-not (Test-Path -Path ".\node_modules")) {
  Write-Host "==> Install workspace (pnpm -w install)..."
  pnpm -w install
}

# Avvia WS in nuova finestra
Write-Host "==> Avvio Realtime WS (porta 8787)..."
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit","-Command","pnpm dev:ws" -WorkingDirectory (Get-Location) -WindowStyle Normal

# Avvia Web in nuova finestra
Write-Host "==> Avvio Web (Next.js su http://localhost:3000)..."
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit","-Command","pnpm dev:web" -WorkingDirectory (Get-Location) -WindowStyle Normal

Write-Host ""
Write-Host "Tutto pronto!"
Write-Host "➡ Web: http://localhost:3000"
Write-Host "➡ WS : ws://localhost:8787"
Write-Host ""
Write-Host "Se PowerShell blocca lo script: apri una console e lancia:"
Write-Host "  Set-ExecutionPolicy -Scope Process Bypass"
