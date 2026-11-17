# Generate PWA and macOS brand PNGs from the existing CLOCK COUNTER vector source.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Get-Content (Join-Path $PSScriptRoot 'generate-icon.ps1') -Raw
$match = [regex]::Match($source, "(?s)-TypeDefinition @'[\r\n]+(.*?)[\r\n]+'@")
if (-not $match.Success) { throw 'Cannot locate original clock icon vector source' }
$code = $match.Groups[1].Value
$code = $code.Replace('public static class ClockCounterIcon', 'public static class TruTimeClockPngIcon')
$insert = @'
  public static void CreatePng(string output, int size) {
    Directory.CreateDirectory(Path.GetDirectoryName(output));
    File.WriteAllBytes(output, Render(size));
  }
'@
$code = $code.Replace('  public static void Create(string output) {', $insert + [Environment]::NewLine + '  public static void Create(string output) {')
if (-not $code.Contains('CreatePng')) { throw 'Could not add PNG output method' }
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition $code
[TruTimeClockPngIcon]::CreatePng((Join-Path $root 'assets\app-icon-512.png'),512)
[TruTimeClockPngIcon]::CreatePng((Join-Path $root 'assets\app-icon-192.png'),192)
[TruTimeClockPngIcon]::CreatePng((Join-Path $root 'assets\apple-touch-icon.png'),180)
[TruTimeClockPngIcon]::CreatePng((Join-Path $root 'assets\app-icon-1024.png'),1024)
Get-Item (Join-Path $root 'assets\app-icon-512.png'),
  (Join-Path $root 'assets\app-icon-192.png'),
  (Join-Path $root 'assets\apple-touch-icon.png'),
  (Join-Path $root 'assets\app-icon-1024.png') |
  Select-Object Name, Length | Format-Table -AutoSize
