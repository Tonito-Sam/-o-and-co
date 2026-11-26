param(
  [string]$LogoPath = (Join-Path $PSScriptRoot '..\src\assets\OCO-Stacked-Logo-White-300px.png'),
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\google-play-assets\mobile-splash-lockup.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$logoFile = (Resolve-Path -LiteralPath $LogoPath).Path
$logo = [System.Drawing.Image]::FromFile($logoFile)
try {
  $size = 1024
  $bitmap = [System.Drawing.Bitmap]::new(
    $size,
    $size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

      $panel = [System.Drawing.Drawing2D.GraphicsPath]::new()
      try {
        $panelBounds = [System.Drawing.Rectangle]::new(112, 112, 800, 800)
        $radius = 52
        $diameter = $radius * 2
        $panel.AddArc($panelBounds.X, $panelBounds.Y, $diameter, $diameter, 180, 90)
        $panel.AddArc(
          $panelBounds.Right - $diameter,
          $panelBounds.Y,
          $diameter,
          $diameter,
          270,
          90
        )
        $panel.AddArc(
          $panelBounds.Right - $diameter,
          $panelBounds.Bottom - $diameter,
          $diameter,
          $diameter,
          0,
          90
        )
        $panel.AddArc(
          $panelBounds.X,
          $panelBounds.Bottom - $diameter,
          $diameter,
          $diameter,
          90,
          90
        )
        $panel.CloseFigure()

        $panelBrush = [System.Drawing.SolidBrush]::new(
          [System.Drawing.Color]::FromArgb(212, 8, 13, 23)
        )
        try {
          $graphics.FillPath($panelBrush, $panel)
        }
        finally {
          $panelBrush.Dispose()
        }

        $panelPen = [System.Drawing.Pen]::new(
          [System.Drawing.Color]::FromArgb(38, 255, 255, 255),
          2.0
        )
        try {
          $graphics.DrawPath($panelPen, $panel)
        }
        finally {
          $panelPen.Dispose()
        }
      }
      finally {
        $panel.Dispose()
      }

      $logoWidth = 470
      $logoHeight = [int][Math]::Round($logo.Height * ($logoWidth / $logo.Width))
      $logoBounds = [System.Drawing.Rectangle]::new(
        [int][Math]::Round(($size - $logoWidth) / 2.0),
        155,
        $logoWidth,
        $logoHeight
      )
      $graphics.DrawImage($logo, $logoBounds)

      $font = [System.Drawing.Font]::new(
        'Segoe UI',
        29.0,
        [System.Drawing.FontStyle]::Regular,
        [System.Drawing.GraphicsUnit]::Pixel
      )
      try {
        $tagline = 'Spaces that Inspire'
        $format = [System.Drawing.StringFormat]::new()
        try {
          $format.Alignment = [System.Drawing.StringAlignment]::Center
          $format.LineAlignment = [System.Drawing.StringAlignment]::Center
          $textBounds = [System.Drawing.RectangleF]::new(150, 824, 724, 58)
          $taglineBrush = [System.Drawing.SolidBrush]::new(
            [System.Drawing.Color]::FromArgb(235, 255, 255, 255)
          )
          try {
            $graphics.DrawString($tagline, $font, $taglineBrush, $textBounds, $format)
          }
          finally {
            $taglineBrush.Dispose()
          }
        }
        finally {
          $format.Dispose()
        }
      }
      finally {
        $font.Dispose()
      }
    }
    finally {
      $graphics.Dispose()
    }

    $destination = [System.IO.Path]::GetFullPath($OutputPath)
    $destinationFolder = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $destinationFolder -PathType Container)) {
      New-Item -ItemType Directory -Path $destinationFolder -Force | Out-Null
    }
    $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
    "Generated transparent mobile splash lockup: $destination"
  }
  finally {
    $bitmap.Dispose()
  }
}
finally {
  $logo.Dispose()
}
