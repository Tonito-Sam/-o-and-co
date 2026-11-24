param(
  [string]$SourceRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Rosebank-enhanced\Rosebank'),
  [string]$OutputRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'src\assets\virtual-tour\rosebank')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$photos = @(
  @{ Folder = 'Entrance_'; Source = '_IGN3163_enhanced.jpg'; Target = 'rosebank-cover-enhanced.jpg' },
  @{ Folder = 'Lobby 2_'; Source = '_IGN3053_enhanced.jpg'; Target = 'rosebank-lounge-enhanced.jpg' },
  @{ Folder = 'Reception_'; Source = '_IGN2760_enhanced.jpg'; Target = 'rosebank-reception-enhanced.jpg' },
  @{ Folder = 'Main Brdrm_'; Source = '_IGN3075_enhanced.jpg'; Target = 'rosebank-boardroom-enhanced.jpg' },
  @{ Folder = 'Main Brdrm_'; Source = '_IGN3077_enhanced.jpg'; Target = 'rosebank-boardroom-2-enhanced.jpg' },
  @{ Folder = 'Main Brdrm_'; Source = '_IGN3078_enhanced.jpg'; Target = 'rosebank-boardroom-3-enhanced.jpg' },
  @{ Folder = 'Off 107_'; Source = '_IGN2948_enhanced.jpg'; Target = 'rosebank-office-enhanced.jpg' },
  @{ Folder = 'Off 107_'; Source = '_IGN2949_enhanced.jpg'; Target = 'rosebank-office-2-enhanced.jpg' }
)

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } |
  Select-Object -First 1
if (-not $jpegCodec) {
  throw 'Windows JPEG encoder is unavailable.'
}
if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
  throw "Enhanced Rosebank photo folder not found: $SourceRoot"
}
if (-not (Test-Path -LiteralPath $OutputRoot -PathType Container)) {
  New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
}

foreach ($photo in $photos) {
  $sourcePath = Join-Path (Join-Path $SourceRoot $photo.Folder) $photo.Source
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Enhanced Rosebank tour photo not found: $sourcePath"
  }

  $sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $scale = [Math]::Min(1.0, 2048.0 / $sourceImage.Width)
    $width = [int][Math]::Round($sourceImage.Width * $scale)
    $height = [int][Math]::Round($sourceImage.Height * $scale)
    $bitmap = [System.Drawing.Bitmap]::new(
      $width,
      $height,
      [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, $width, $height)
      }
      finally {
        $graphics.Dispose()
      }

      $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
      try {
        $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
          [System.Drawing.Imaging.Encoder]::Quality,
          88L
        )
        $targetPath = Join-Path $OutputRoot $photo.Target
        $bitmap.Save($targetPath, $jpegCodec, $parameters)
      }
      finally {
        $parameters.Dispose()
      }
    }
    finally {
      $bitmap.Dispose()
    }
  }
  finally {
    $sourceImage.Dispose()
  }
}

"Prepared $($photos.Count) optimized Rosebank virtual-tour photos in $OutputRoot."
