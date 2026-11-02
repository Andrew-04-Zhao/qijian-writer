Add-Type -AssemblyName System.Drawing
foreach ($spec in @(@('welcome.bmp',164,314),@('header.bmp',150,57))) {
  $bitmap = New-Object Drawing.Bitmap($spec[1],$spec[2])
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = 'AntiAlias'
  $rect = New-Object Drawing.Rectangle(0,0,$spec[1],$spec[2])
  $brush = New-Object Drawing.Drawing2D.LinearGradientBrush($rect,([Drawing.Color]::FromArgb(52,75,66)),([Drawing.Color]::FromArgb(116,137,118)),90)
  $graphics.FillRectangle($brush,$rect)
  $pen = New-Object Drawing.Pen(([Drawing.Color]::FromArgb(50,230,231,209)),1)
  for ($i=0;$i -lt 5;$i++) { $graphics.DrawEllipse($pen,-90+$i*18,70+$i*24,220,220) }
  $font = New-Object Drawing.Font('Segoe UI',18,([Drawing.FontStyle]::Regular))
  $graphics.DrawString('QIJIAN',$font,[Drawing.Brushes]::White,16,18)
  if ($spec[2] -gt 100) {
    $small = New-Object Drawing.Font('Segoe UI',10)
    $graphics.DrawString('A quiet place' + [Environment]::NewLine + 'for your words.',$small,[Drawing.Brushes]::WhiteSmoke,18,252)
    $small.Dispose()
  }
  $bitmap.Save((Join-Path $PSScriptRoot $spec[0]),[Drawing.Imaging.ImageFormat]::Bmp)
  $font.Dispose();$pen.Dispose();$brush.Dispose();$graphics.Dispose();$bitmap.Dispose()
}
