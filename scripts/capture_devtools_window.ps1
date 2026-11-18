param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CityLifeWindowCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle,out Rect rect);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle,IntPtr hdc,int flags);
}
'@
$taskWindow=Get-Process | Where-Object { $_.MainWindowTitle -eq 'city-life-miniapp' } | Select-Object -First 1
if (-not $taskWindow) { throw 'Project IDE window not found' }
$taskRect=[CityLifeWindowCapture+Rect]::new()
if (-not [CityLifeWindowCapture]::GetWindowRect($taskWindow.MainWindowHandle,[ref]$taskRect)) { throw 'Window bounds unavailable' }
$taskBitmap=[Drawing.Bitmap]::new($taskRect.Right-$taskRect.Left,$taskRect.Bottom-$taskRect.Top)
$taskGraphics=[Drawing.Graphics]::FromImage($taskBitmap)
$taskDC=$taskGraphics.GetHdc()
try {
 if (-not [CityLifeWindowCapture]::PrintWindow($taskWindow.MainWindowHandle,$taskDC,2)) { throw 'Native window capture unavailable' }
} finally { $taskGraphics.ReleaseHdc($taskDC);$taskGraphics.Dispose() }
try { $taskBitmap.Save([IO.Path]::GetFullPath($OutputPath),[Drawing.Imaging.ImageFormat]::Png) } finally { $taskBitmap.Dispose() }
