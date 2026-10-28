# Prints every html/*.html transcript to a PDF next to this script with headless Microsoft Edge.
# Edge does not write reliably to paths with spaces/apostrophes, so it prints in a temp folder first. Each file
# gets its own browser profile and a time limit (a headless instance occasionally stalls), with one retry.
# Usage: python generate_transcripts.py; powershell -ExecutionPolicy Bypass -File print_pdfs.ps1
$edge = @("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "C:\Program Files\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
$tmp = Join-Path ([System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "Temp"))) "tx-print"
New-Item -ItemType Directory -Force $tmp | Out-Null
Get-ChildItem $tmp -File | Remove-Item -Force -Confirm:$false -ErrorAction SilentlyContinue
Copy-Item (Join-Path $PSScriptRoot "html\*.html") $tmp -Force
$i = 0
foreach ($html in Get-ChildItem $tmp -Filter *.html) {
  $pdf = Join-Path $tmp ($html.BaseName + ".pdf")
  foreach ($attempt in 1..2) {
    $i++
    $p = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList '--headless=new', '--disable-gpu', "--user-data-dir=$tmp-profile-$i",
      '--no-pdf-header-footer', "--print-to-pdf=$pdf", ("file:///" + ($html.FullName -replace '\\', '/'))
    if (-not $p.WaitForExit(45000)) { try { $p.Kill() } catch {} }
    if ((Test-Path $pdf) -and (Get-Item $pdf).Length -gt 0) { break }
  }
}
Copy-Item "$tmp\*.pdf" $PSScriptRoot -Force
Get-ChildItem $PSScriptRoot -Filter *.pdf | ForEach-Object { $_.Name }
