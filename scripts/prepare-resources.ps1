$ErrorActionPreference = 'Stop'
function Get-Sha256([string]$LiteralPath) {
  $stream = [System.IO.File]::OpenRead($LiteralPath)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}
$root = Split-Path -Parent $PSScriptRoot
$resources = Join-Path $root 'resources'
$demo = Join-Path $resources 'demo.mp4'
$streamlinkRoot = Join-Path $resources 'streamlink\streamlink-8.6.2-1-py314-x86_64'
$streamlinkZip = Join-Path $resources 'streamlink.zip'

New-Item -ItemType Directory -Path $resources -Force | Out-Null

& node (Join-Path $PSScriptRoot 'prepare-official-ocr.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the original OCR component.' }

if (-not (Test-Path -LiteralPath $demo)) {
  $ffmpeg = Join-Path $root 'node_modules\ffmpeg-static\ffmpeg.exe'
  if (-not (Test-Path -LiteralPath $ffmpeg)) {
    throw 'Run npm install before preparing resources.'
  }
  Add-Type -AssemblyName System.Drawing
  $imagePath = Join-Path $resources 'demo.png'
  $bitmap = New-Object System.Drawing.Bitmap(1280, 720)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(241, 244, 248))
    $header = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, 42, 67))
    $ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(23, 42, 67))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 101, 125))
    $heading = New-Object System.Drawing.Font('Consolas', 26, [System.Drawing.FontStyle]::Bold)
    $caption = New-Object System.Drawing.Font('Consolas', 20)
    $code = New-Object System.Drawing.Font('Consolas', 90, [System.Drawing.FontStyle]::Bold)
    try {
      $graphics.FillRectangle($header, 0, 0, 1280, 90)
      $graphics.DrawString('FRAMECODE / LOCAL DEMO', $heading, [System.Drawing.Brushes]::White, 42, 25)
      $graphics.DrawString('ROOM CODE', $caption, $muted, 524, 240)
      $graphics.DrawString('ABC123', $code, $ink, 300, 300)
      $graphics.DrawString('OFFLINE SAMPLE', $caption, $muted, 500, 600)
    } finally {
      $header.Dispose(); $ink.Dispose(); $muted.Dispose(); $heading.Dispose(); $caption.Dispose(); $code.Dispose()
    }
    $bitmap.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  & $ffmpeg -hide_banner -loglevel error -y -loop 1 -i $imagePath -t 30 -r 30 -c:v libx264 -pix_fmt yuv420p -preset ultrafast -tune zerolatency -movflags +faststart $demo
  if ($LASTEXITCODE -ne 0) { throw 'Failed to generate the demo video.' }
}

$streamlink = Join-Path $streamlinkRoot 'bin\streamlink.exe'
if (-not (Test-Path -LiteralPath $streamlink)) {
  if (-not (Test-Path -LiteralPath $streamlinkZip)) {
    Invoke-WebRequest -UseBasicParsing `
      -Uri 'https://github.com/streamlink/windows-builds/releases/download/8.6.2-1/streamlink-8.6.2-1-py314-x86_64.zip' `
      -OutFile $streamlinkZip
  }
  $expected = '329EB05252A3DBC8D8C5B8B6857B41ACF61DF4FD818545A8EE322F3740B6CAA1'
  $actual = Get-Sha256 $streamlinkZip
  if ($actual -ne $expected) { throw "Streamlink checksum mismatch: $actual" }
  Expand-Archive -LiteralPath $streamlinkZip -DestinationPath (Join-Path $resources 'streamlink') -Force
}

Write-Host 'Resources are ready: original OCR component, demo video and Streamlink are available.'
