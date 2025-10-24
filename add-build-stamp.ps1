param(
  [Parameter(Mandatory=$true)][string[]]$Files,
  [string]$Title = "",
  [string]$RepoName = "ui-good",
  [string]$VercelProject = "homerates-next",
  [switch]$NoBackup
)

$stamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss zzz")
$headerStart = "// === Build Marker START ==="
$headerEnd   = "// === Build Marker END ==="
$backupDir = ".backup_live_edits"
if (-not $NoBackup) { New-Item -ItemType Directory -Force -Path $backupDir | Out-Null }

foreach ($f in $Files) {
  if (-not (Test-Path $f)) { Write-Warning "Skip (not found): $f"; continue }
  $name = Split-Path $f -Leaf
  $titleLine = if ($Title) { $Title } else { "Auto Build Stamp" }
  $header = @(
    $headerStart
    "// File: $f"
    "// Title: $titleLine"
    "// Updated: $stamp"
    "// Repo: $RepoName | Vercel Project: $VercelProject"
    $headerEnd
    ""
  ) -join "`r`n"

  $content = Get-Content $f -Raw
  if (-not $NoBackup) {
    $bak = Join-Path $backupDir "$($name).$((Get-Date).ToString('yyyyMMdd-HHmmss')).bak"
    Set-Content -Path $bak -Value $content -Encoding UTF8
    Write-Host "Backed up -> $bak"
  }

  if ($content -match [regex]::Escape($headerStart)) {
    $pattern = [regex]::Escape($headerStart) + "(?s).*?" + [regex]::Escape($headerEnd)
    $new = [regex]::Replace(
      $content,
      $pattern,
      ($headerStart + "`r`n// File: $f`r`n// Title: $titleLine`r`n// Updated: $stamp`r`n// Repo: $RepoName | Vercel Project: $VercelProject`r`n" + $headerEnd),
      1
    )
    Set-Content -Path $f -Value $new -Encoding UTF8
  } else {
    Set-Content -Path $f -Value ($header + $content) -Encoding UTF8
  }
  Write-Host "Stamped -> $f"
}
