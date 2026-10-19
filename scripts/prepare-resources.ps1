$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$required = @(
  'resources\demo.mp4',
  'resources\streamlink\streamlink-8.6.2-1-py314-x86_64\bin\streamlink.exe',
  'resources\ocr-runtime\room-code-assistant-worker.exe',
  'resources\ocr-runtime\manifest.sha256.json'
)
foreach ($relative in $required) {
  $target = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    throw "Missing resource: $relative. Restore the complete resources directory."
  }
}
$modulePath = Join-Path $root 'src\main\ocr.cjs'
& node -e "require(process.argv[1]).verifyRuntime(process.argv[2]).then(()=>console.log('OCR resources verified.')).catch(error=>{console.error(error.message);process.exitCode=1})" $modulePath $root
if ($LASTEXITCODE -ne 0) { throw 'OCR resource validation failed.' }
Write-Host 'FrameCode resources are ready.'
