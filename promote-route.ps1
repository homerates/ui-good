# --- promote-route.ps1 ---
$old = "app/api/answers/route.ts"
$new = "app/api/answers/route.2.ts"

Write-Host " Comparing $old with $new ..."
$diff = git --no-pager diff --no-index --numstat $old $new 2>$null

if (-not $diff) {
  Write-Host " Files are identical. No action taken."
  return
}

$nums = $diff -split "`n" | ForEach-Object {
  $parts = $_ -split "`t"
  if ($parts.Length -ge 3) {
    [PSCustomObject]@{
      Added   = [int]$parts[0]
      Removed = [int]$parts[1]
      File    = $parts[2]
    }
  }
}

$added   = ($nums | Measure-Object -Property Added -Sum).Sum
$removed = ($nums | Measure-Object -Property Removed -Sum).Sum

Write-Host " Summary: $added lines added, $removed lines removed"

if ($added -lt 10 -and $removed -lt 10) {
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  Write-Host "Backing up old file to route.backup-$ts.ts ..."
  Rename-Item $old "app/api/answers/route.backup-$ts.ts"
  Write-Host "Promoting new file ..."
  Rename-Item $new $old
  Write-Host " Promotion complete. Backup saved."
} else {
  Write-Host " Larger delta  skipping automatic promotion. Review manually."
}
