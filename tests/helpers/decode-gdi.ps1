param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
# Official PreparedPlayerFrame.Create decodes a MemoryStream into a Bitmap.
# OcrPixels.ReadRgba locks Format32bppArgb and swaps B/R after reading each row.
$encoded=[System.IO.File]::ReadAllBytes($InputPath)
$stream=[System.IO.MemoryStream]::new($encoded,$false)
$bitmap=[System.Drawing.Bitmap]::new($stream)
$locked=$null
try {
  $rectangle=[System.Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height)
  $locked=$bitmap.LockBits($rectangle,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $rowBytes=$bitmap.Width*4
  $pixels=[byte[]]::new($rowBytes*$bitmap.Height)
  for($row=0;$row -lt $bitmap.Height;$row++) {
    [System.Runtime.InteropServices.Marshal]::Copy([IntPtr]::Add($locked.Scan0,$row*$locked.Stride),$pixels,$row*$rowBytes,$rowBytes)
  }
  $file=[System.IO.File]::Open($OutputPath,[System.IO.FileMode]::CreateNew)
  $writer=[System.IO.BinaryWriter]::new($file)
  try {$writer.Write([int]$bitmap.Width);$writer.Write([int]$bitmap.Height);$writer.Write($pixels)}
  finally {$writer.Dispose();$file.Dispose()}
} finally {
  if($null -ne $locked){$bitmap.UnlockBits($locked)}
  $bitmap.Dispose();$stream.Dispose()
}
