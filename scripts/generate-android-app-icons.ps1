param(
  [string]$LogoPath = (Join-Path $PSScriptRoot '..\src\assets\OCO-Stacked-Logo-White-300px.png'),
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\google-play-assets')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$resolvedLogo = (Resolve-Path -LiteralPath $LogoPath).Path
$logo = [System.Drawing.Image]::FromFile($resolvedLogo)
try {
  function New-BrandBackground([int]$Size) {
    $bitmap = [System.Drawing.Bitmap]::new(
      $Size,
      $Size,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $bounds = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
      $background = [System.Drawing.SolidBrush]::new(
        [System.Drawing.Color]::FromArgb(13, 18, 28)
      )
      try {
        $graphics.FillRectangle($background, $bounds)
      }
      finally {
        $background.Dispose()
      }
    }
    finally {
      $graphics.Dispose()
    }
    return $bitmap
  }

  function New-LogoLayer([int]$Size, [bool]$Transparent) {
    $bitmap = if ($Transparent) {
      [System.Drawing.Bitmap]::new(
        $Size,
        $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
      )
    } else {
      New-BrandBackground $Size
    }

    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

      $logoHeight = if ($Transparent) {
        [int][Math]::Round($Size * 0.60)
      } else {
        [int][Math]::Round($Size * 0.72)
      }
      $logoWidth = [int][Math]::Round($logo.Width * ($logoHeight / $logo.Height))
      $logoBounds = [System.Drawing.Rectangle]::new(
        [int][Math]::Round(($Size - $logoWidth) / 2.0),
        [int][Math]::Round(($Size - $logoHeight) / 2.0) - [int]($Size * 0.025),
        $logoWidth,
        $logoHeight
      )
      $graphics.DrawImage($logo, $logoBounds)
    }
    finally {
      $graphics.Dispose()
    }
    return $bitmap
  }

  function Save-Png([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  }

  $root = [System.IO.Path]::GetFullPath($OutputPath)

  $playIconMaster = New-LogoLayer 1024 $false
  try {
    Save-Png $playIconMaster (Join-Path $root 'play-store-icon-1024.png')
  }
  finally {
    $playIconMaster.Dispose()
  }

  $playIcon = New-LogoLayer 512 $false
  try {
    Save-Png $playIcon (Join-Path $root 'play-store-icon-512.png')
  }
  finally {
    $playIcon.Dispose()
  }

  $adaptiveSize = 432
  $background = New-BrandBackground $adaptiveSize
  try {
    Save-Png $background (Join-Path $root 'android\res\drawable-nodpi\ic_launcher_background.png')
  }
  finally {
    $background.Dispose()
  }

  $foreground = New-LogoLayer $adaptiveSize $true
  try {
    Save-Png $foreground (Join-Path $root 'android\res\drawable-nodpi\ic_launcher_foreground.png')
  }
  finally {
    $foreground.Dispose()
  }

  $monochrome = [System.Drawing.Bitmap]::new(
    $logo.Width,
    $logo.Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  try {
    for ($y = 0; $y -lt $logo.Height; $y++) {
      for ($x = 0; $x -lt $logo.Width; $x++) {
        $alpha = $logo.GetPixel($x, $y).A
        $monochrome.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
      }
    }

    $monoLayer = [System.Drawing.Bitmap]::new(
      $adaptiveSize,
      $adaptiveSize,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($monoLayer)
      try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $logoHeight = [int][Math]::Round($adaptiveSize * 0.60)
        $logoWidth = [int][Math]::Round($logo.Width * ($logoHeight / $logo.Height))
        $graphics.DrawImage(
          $monochrome,
          [System.Drawing.Rectangle]::new(
            [int][Math]::Round(($adaptiveSize - $logoWidth) / 2.0),
            [int][Math]::Round(($adaptiveSize - $logoHeight) / 2.0) - [int]($adaptiveSize * 0.025),
            $logoWidth,
            $logoHeight
          )
        )
      }
      finally {
        $graphics.Dispose()
      }
      Save-Png $monoLayer (Join-Path $root 'android\res\drawable-nodpi\ic_launcher_monochrome.png')
    }
    finally {
      $monoLayer.Dispose()
    }
  }
  finally {
    $monochrome.Dispose()
  }

  $densitySizes = @(
    @{ Name = 'mdpi'; Size = 48 },
    @{ Name = 'hdpi'; Size = 72 },
    @{ Name = 'xhdpi'; Size = 96 },
    @{ Name = 'xxhdpi'; Size = 144 },
    @{ Name = 'xxxhdpi'; Size = 192 }
  )
  foreach ($density in $densitySizes) {
    $icon = New-LogoLayer $density.Size $false
    try {
      $folder = Join-Path $root "android\res\mipmap-$($density.Name)"
      Save-Png $icon (Join-Path $folder 'ic_launcher.png')
      Save-Png $icon (Join-Path $folder 'ic_launcher_round.png')
    }
    finally {
      $icon.Dispose()
    }
  }

  $adaptiveDirectory = Join-Path $root 'android\res\mipmap-anydpi-v26'
  New-Item -ItemType Directory -Path $adaptiveDirectory -Force | Out-Null
  $adaptiveXml = @'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
'@
  Set-Content -LiteralPath (Join-Path $adaptiveDirectory 'ic_launcher.xml') -Value $adaptiveXml -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $adaptiveDirectory 'ic_launcher_round.xml') -Value $adaptiveXml -Encoding UTF8

  $iconPath = Join-Path $root 'play-store-icon-512.png'
  $iconFile = Get-Item -LiteralPath $iconPath
  if ($iconFile.Length -gt 1MB) {
    throw "Google Play icon exceeds the 1 MB limit: $($iconFile.Length) bytes."
  }
  "Generated Play Store icon (512x512, $($iconFile.Length) bytes) and Android launcher assets in $root."
}
finally {
  $logo.Dispose()
}
