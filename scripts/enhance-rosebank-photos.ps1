param(
  [string]$ArchivePath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Rosebank-20261124T122456Z-1-001.zip'),
  [string]$OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Rosebank-enhanced'),
  [int]$Limit = 0,
  [switch]$Force,
  [switch]$Resume
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
  throw "Rosebank photo archive not found: $ArchivePath"
}

$processorSource = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

public static class RosebankPhotoEnhancer
{
    private static byte Tone(byte value, double brightness, double contrast)
    {
        double adjusted = ((value - 127.5) * contrast) + 127.5 + brightness;
        return (byte)Math.Max(0, Math.Min(255, Math.Round(adjusted)));
    }

    private static byte Sharpen(byte center, byte left, byte right, byte up, byte down, double amount)
    {
        double value = center + amount * (4.0 * center - left - right - up - down);
        return (byte)Math.Max(0, Math.Min(255, Math.Round(value)));
    }

    public static void Enhance(Stream input, string outputPath)
    {
        using (Image decoded = Image.FromStream(input, true, true))
        {
            try
            {
                PropertyItem orientation = decoded.GetPropertyItem(0x0112);
                int value = BitConverter.ToUInt16(orientation.Value, 0);
                RotateFlipType rotation = RotateFlipType.RotateNoneFlipNone;
                switch (value)
                {
                    case 2: rotation = RotateFlipType.RotateNoneFlipX; break;
                    case 3: rotation = RotateFlipType.Rotate180FlipNone; break;
                    case 4: rotation = RotateFlipType.Rotate180FlipX; break;
                    case 5: rotation = RotateFlipType.Rotate90FlipX; break;
                    case 6: rotation = RotateFlipType.Rotate90FlipNone; break;
                    case 7: rotation = RotateFlipType.Rotate270FlipX; break;
                    case 8: rotation = RotateFlipType.Rotate270FlipNone; break;
                }
                if (rotation != RotateFlipType.RotateNoneFlipNone)
                    decoded.RotateFlip(rotation);
            }
            catch (ArgumentException) { }
            catch (ExternalException) { }

            using (Bitmap source = new Bitmap(decoded.Width, decoded.Height, PixelFormat.Format32bppArgb))
            {
                using (Graphics graphics = Graphics.FromImage(source))
                    graphics.DrawImage(decoded, new Rectangle(0, 0, decoded.Width, decoded.Height));

                Rectangle bounds = new Rectangle(0, 0, source.Width, source.Height);
                BitmapData data = source.LockBits(bounds, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
                byte[] pixels;
                try
                {
                    if (data.Stride <= 0)
                        throw new InvalidOperationException("Unsupported image row layout.");
                    int width = source.Width;
                    int height = source.Height;
                    int stride = data.Stride;
                    int byteCount = checked(stride * height);
                    pixels = new byte[byteCount];
                    Marshal.Copy(data.Scan0, pixels, 0, byteCount);
                    Parallel.For(0, height, y =>
                    {
                        int row = y * stride;
                        for (int x = 0; x < width; x++)
                        {
                            int offset = row + x * 4;
                            pixels[offset] = Tone(pixels[offset], 3.0, 1.06);
                            pixels[offset + 1] = Tone(pixels[offset + 1], 3.0, 1.06);
                            pixels[offset + 2] = Tone(pixels[offset + 2], 3.0, 1.06);
                        }
                    });
                    Marshal.Copy(pixels, 0, data.Scan0, byteCount);
                }
                finally
                {
                    source.UnlockBits(data);
                }

                using (Bitmap output = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
                {
                    BitmapData sourceData = source.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                    BitmapData outputData = output.LockBits(bounds, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                    try
                    {
                        int width = source.Width;
                        int height = source.Height;
                        int sourceStride = sourceData.Stride;
                        int outputStride = outputData.Stride;
                        int sourceBytes = checked(sourceStride * height);
                        int outputBytes = checked(outputStride * height);
                        byte[] adjusted = new byte[sourceBytes];
                        byte[] sharpened = new byte[outputBytes];
                        Marshal.Copy(sourceData.Scan0, adjusted, 0, sourceBytes);
                        Parallel.For(0, height, y =>
                        {
                            int row = y * sourceStride;
                            int outRow = y * outputStride;
                            for (int x = 0; x < width; x++)
                            {
                                int center = row + x * 4;
                                int destination = outRow + x * 4;
                                if (x == 0 || y == 0 || x == width - 1 || y == height - 1)
                                {
                                    Buffer.BlockCopy(adjusted, center, sharpened, destination, 4);
                                    continue;
                                }
                                for (int channel = 0; channel < 3; channel++)
                                {
                                    sharpened[destination + channel] = Sharpen(
                                        adjusted[center + channel],
                                        adjusted[center - 4 + channel],
                                        adjusted[center + 4 + channel],
                                        adjusted[center - sourceStride + channel],
                                        adjusted[center + sourceStride + channel],
                                        0.12);
                                }
                                sharpened[destination + 3] = adjusted[center + 3];
                            }
                        });
                        Marshal.Copy(sharpened, 0, outputData.Scan0, outputBytes);
                    }
                    finally
                    {
                        source.UnlockBits(sourceData);
                        output.UnlockBits(outputData);
                    }

                    ImageCodecInfo jpeg = null;
                    foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
                        if (codec.MimeType == "image/jpeg") jpeg = codec;
                    if (jpeg == null)
                        throw new InvalidOperationException("Windows JPEG encoder is unavailable.");
                    using (EncoderParameters parameters = new EncoderParameters(1))
                    {
                        parameters.Param[0] = new EncoderParameter(Encoder.Quality, 92L);
                        output.Save(outputPath, jpeg, parameters);
                    }
                }
            }
        }
    }
}
'@

Add-Type -TypeDefinition $processorSource -ReferencedAssemblies System.Drawing

$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath).Path)
$manifest = [Collections.Generic.List[object]]::new()
try {
  $entries = @(
    $archive.Entries |
      Where-Object {
        $_.FullName -match '^Rosebank/' -and
        [IO.Path]::GetExtension($_.FullName) -match '^\.(jpg|jpeg)$'
      } |
      Sort-Object FullName
  )

  if ($entries.Count -eq 0) {
    throw 'No Rosebank JPEG images were found in the archive.'
  }
  if ($Limit -gt 0) {
    $entries = @($entries | Select-Object -First $Limit)
  }
  if ($Force -and $Resume) {
    throw 'Use either -Force or -Resume, not both.'
  }
  if ((Test-Path -LiteralPath $OutputPath) -and -not $Force -and -not $Resume) {
    throw "Output folder already exists. Use -Force to overwrite or -Resume to continue: $OutputPath"
  }
  if (-not (Test-Path -LiteralPath $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath | Out-Null
  }

  for ($index = 0; $index -lt $entries.Count; $index++) {
    $entry = $entries[$index]
    $relative = $entry.FullName.Substring('Rosebank/'.Length).Replace('/', '\')
    $relativeDirectory = Split-Path $relative -Parent
    $baseName = [IO.Path]::GetFileNameWithoutExtension($relative)
    $targetDirectory = if ($relativeDirectory) {
      Join-Path (Join-Path $OutputPath 'Rosebank') $relativeDirectory
    } else {
      Join-Path $OutputPath 'Rosebank'
    }
    $target = Join-Path $targetDirectory ($baseName + '_enhanced.jpg')
    if (-not (Test-Path -LiteralPath $targetDirectory)) {
      New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    }

    if (-not ($Resume -and (Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -gt 0)) {
      $input = $entry.Open()
      try {
        [RosebankPhotoEnhancer]::Enhance($input, $target)
      }
      finally {
        $input.Dispose()
      }
    }

    $manifest.Add([pscustomobject]@{
      SourcePath = $entry.FullName
      EnhancedPath = $target
      SourceBytes = $entry.Length
      EnhancedBytes = (Get-Item -LiteralPath $target).Length
    })
    if (($index + 1) % 10 -eq 0 -or $index + 1 -eq $entries.Count) {
      Write-Progress -Activity 'Enhancing Rosebank photos' `
        -Status "$($index + 1) / $($entries.Count)" `
        -PercentComplete ((($index + 1) / $entries.Count) * 100)
    }
  }

  $manifestPath = Join-Path $OutputPath 'enhancement-manifest.csv'
  $manifest | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8
  Write-Progress -Activity 'Enhancing Rosebank photos' -Completed
  "Enhanced $($manifest.Count) photos. Originals in the ZIP were not changed."
  "Output: $OutputPath"
  "Manifest: $manifestPath"
}
finally {
  $archive.Dispose()
}
