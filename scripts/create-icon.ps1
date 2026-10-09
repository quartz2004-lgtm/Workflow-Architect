$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetPath = Join-Path $PSScriptRoot '../desktop/assets'
[System.IO.Directory]::CreateDirectory($assetPath) | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(16, 18, 22))
$line = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(109, 130, 148)), 9
$graphics.DrawLine($line, 72, 78, 128, 174)
$graphics.DrawLine($line, 184, 78, 128, 174)
$graphics.DrawLine($line, 72, 78, 184, 78)
$surface = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28, 34, 41))
$accent = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(102, 215, 190)), 7
foreach ($point in @(@(72, 78), @(184, 78), @(128, 174))) {
  $graphics.FillEllipse($surface, ($point[0] - 26), ($point[1] - 26), 52, 52)
  $graphics.DrawEllipse($accent, ($point[0] - 26), ($point[1] - 26), 52, 52)
}
$png = New-Object System.IO.MemoryStream
$bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
[System.IO.File]::WriteAllBytes((Join-Path $assetPath 'icon.png'), $png.ToArray())
$file = [System.IO.File]::Create((Join-Path $assetPath 'icon.ico'))
$writer = New-Object System.IO.BinaryWriter $file
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32)
$writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
$writer.Write($png.ToArray())
$writer.Dispose(); $png.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
$line.Dispose(); $surface.Dispose(); $accent.Dispose()
