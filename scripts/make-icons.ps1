Add-Type -AssemblyName System.Drawing

$yenChar = [char]0x00A5
$chopChar = [char]0x652F

function New-RoundedRectPath([System.Drawing.RectangleF]$rect, [single]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-Ledger([System.Drawing.Graphics]$g, [int]$size, [bool]$transparent) {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    if ($transparent) {
        $g.Clear([System.Drawing.Color]::Transparent)
    } else {
        $g.Clear([System.Drawing.Color]::FromArgb(255, 247, 249, 250))
    }

    $pad = $size * 0.18
    $ticket = New-Object System.Drawing.RectangleF -ArgumentList ([single]$pad), ([single]($size * 0.30)), ([single]($size - 2 * $pad)), ([single]($size * 0.42))
    $ticketPath = New-RoundedRectPath $ticket ([single]($size * 0.06))
    $yellow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 246, 196, 69))
    $g.FillPath($yellow, $ticketPath)
    $yellow.Dispose()
    $ticketPath.Dispose()

    if (-not $transparent) {
        $hole = [single]($size * 0.035)
        $paper = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 247, 249, 250))
        for ($x = $ticket.X + $hole; $x -lt ($ticket.Right - $hole); $x += ($hole * 3.2)) {
            $g.FillEllipse($paper, $x, ($ticket.Y - $hole * 0.15), $hole, $hole)
        }
        $paper.Dispose()
    }

    $chopSize = [single]($size * 0.22)
    $cx = $ticket.Right - $chopSize - ($size * 0.06)
    $cy = $ticket.Y + ($ticket.Height - $chopSize) / 2
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 194, 58, 46), [single]([Math]::Max(2, $size * 0.012)))
    $g.DrawEllipse($pen, $cx, $cy, $chopSize, $chopSize)
    $pen.Dispose()

    $fontPx = [single]($chopSize * 0.48)
    $font = [System.Drawing.Font]::new("Microsoft YaHei", $fontPx, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 194, 58, 46))
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $chopRect = New-Object System.Drawing.RectangleF $cx, $cy, $chopSize, $chopSize
    $g.DrawString([string]$chopChar, $font, $textBrush, $chopRect, $format)

    $yenPx = [single]($ticket.Height * 0.42)
    $yenFont = [System.Drawing.Font]::new("Microsoft YaHei", $yenPx, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 26, 58, 82))
    $yenRect = New-Object System.Drawing.RectangleF $ticket.X, $ticket.Y, ($ticket.Width * 0.45), $ticket.Height
    $g.DrawString([string]$yenChar, $yenFont, $ink, $yenRect, $format)

    $format.Dispose()
    $font.Dispose()
    $yenFont.Dispose()
    $textBrush.Dispose()
    $ink.Dispose()
}

function Save-Icon([int]$size, [string]$path, [bool]$transparent) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Draw-Ledger $g $size $transparent
    $g.Dispose()
    $dir = Split-Path $path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$res = Join-Path $PSScriptRoot "..\android\app\src\main\res"
$legacy = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}
foreach ($name in $legacy.Keys) {
    $size = $legacy[$name]
    Save-Icon $size (Join-Path $res "$name\ic_launcher.png") $false
    Save-Icon $size (Join-Path $res "$name\ic_launcher_round.png") $false
}
$foreground = @{
    "mipmap-mdpi" = 108
    "mipmap-hdpi" = 162
    "mipmap-xhdpi" = 216
    "mipmap-xxhdpi" = 324
    "mipmap-xxxhdpi" = 432
}
foreach ($name in $foreground.Keys) {
    Save-Icon $foreground[$name] (Join-Path $res "$name\ic_launcher_foreground.png") $true
}

$tmp = Join-Path $env:TEMP "ledger-splash-icon.png"
Save-Icon 420 $tmp $true
$mark = [System.Drawing.Image]::FromFile($tmp)
Get-ChildItem $res -Directory | ForEach-Object {
    $path = Join-Path $_.FullName "splash.png"
    if (-not (Test-Path $path)) { return }
    $probe = [System.Drawing.Image]::FromFile($path)
    $w = $probe.Width
    $h = $probe.Height
    $probe.Dispose()
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(255, 247, 249, 250))
    $icon = [int]([Math]::Min([Math]::Min($w, $h) * 0.42, 420))
    $x = [int](($w - $icon) / 2)
    $y = [int](($h - $icon) / 2)
    $g.DrawImage($mark, $x, $y, $icon, $icon)
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}
$mark.Dispose()
Write-Host "icons written"
