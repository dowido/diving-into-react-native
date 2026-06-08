Add-Type -AssemblyName System.Drawing

function Convert-Icon($srcPath, $dstPath, $size) {
    $src = [System.Drawing.Bitmap]::FromFile($srcPath)
    $dst = [System.Drawing.Bitmap]::new($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    $src.Dispose()
    
    # Make background transparent and icon white
    for ($x = 0; $x -lt $size; $x++) {
        for ($y = 0; $y -lt $size; $y++) {
            $p = $dst.GetPixel($x, $y)
            # If the pixel is dark (background), make it transparent
            if ($p.R -lt 120 -and $p.G -lt 120 -and $p.B -lt 120) {
                $dst.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
            } else {
                # Keep it white/bright but scale transparency based on brightness
                $alpha = $p.R
                $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
            }
        }
    }
    $dst.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()
}

$srcStandings = "C:\Users\user\.gemini\antigravity-ide\brain\490648b1-254b-4f90-8c34-f6a4a4d853c8\f1_standings_raw_icon_1780915996732.png"
$srcReplay = "C:\Users\user\.gemini\antigravity-ide\brain\490648b1-254b-4f90-8c34-f6a4a4d853c8\f1_replay_raw_icon_1780916018359.png"
$dstDir = "C:\Users\user\.gemini\antigravity-ide\scratch\my-expo-app\assets\images\tabIcons"

# Convert standings
Convert-Icon $srcStandings (Join-Path $dstDir "standings.png") 32
Convert-Icon $srcStandings (Join-Path $dstDir "standings@2x.png") 64
Convert-Icon $srcStandings (Join-Path $dstDir "standings@3x.png") 96

# Convert replay
Convert-Icon $srcReplay (Join-Path $dstDir "replay.png") 32
Convert-Icon $srcReplay (Join-Path $dstDir "replay@2x.png") 64
Convert-Icon $srcReplay (Join-Path $dstDir "replay@3x.png") 96

Write-Output "Icon processing complete"
