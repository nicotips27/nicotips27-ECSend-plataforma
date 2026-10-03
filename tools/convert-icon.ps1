<#
  Convierte el logo maestro (icono\logo.jpg) a PNG y genera los tamaños que
  necesita Electron: bandeja, barra de titulo, icono de app e instalador.

  JPEG no tiene canal alfa, asi que el PNG resultante tambien es opaco. Para
  la bandeja de Windows (16-32 px sobre cualquier fondo) conviene que el logo
  tenga fondo transparente: reemplazar icono\logo.jpg por un PNG con alfa y
  este script lo respeta automaticamente.

  Uso:  powershell -File tools\convert-icon.ps1 [-Source <ruta>] [-OutDir <dir>]
#>
[CmdletBinding()]
param(
  [string]$Source = '',
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $Source) { $Source = Join-Path $root 'icono\logo.jpg' }
if (-not $OutDir) { $OutDir = Join-Path $root 'build\png' }

if (-not (Test-Path -LiteralPath $Source)) {
  throw "No se encuentra el logo maestro: $Source"
}

$sizes = @(16, 24, 32, 48, 64, 128, 256, 512, 1024)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$src = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
$written = @()

foreach ($s in $sizes) {
  # No escalar hacia arriba:retched sale borroso y pesa mas sin ganar nada.
  $target = [Math]::Min($s, $src.Width)

  $bmp = New-Object System.Drawing.Bitmap($target, $target)
  $bmp.SetResolution(96, 96)

  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    # Clear en vez de Fill: respeta el alfa si la fuente lo tiene.
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $target, $target)
  } finally {
    $g.Dispose()
  }

  $out = Join-Path $OutDir "logo-$s.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $written += [PSCustomObject]@{ Size = $s; File = $out; KB = [Math]::Round((Get-Item $out).Length / 1KB, 1) }
  $bmp.Dispose()
}

$src.Dispose()

# Copia maestra al renderer para la interfaz.
$assets = Join-Path $root 'src\renderer\assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
Copy-Item -LiteralPath $Source -Destination (Join-Path $assets ([System.IO.Path]::GetFileName($Source))) -Force

$written | Format-Table -AutoSize
Write-Output "OK $($written.Count) PNG generados en $OutDir"