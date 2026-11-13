# Rebuild assets/icon.ico from vector geometry. No external image tools required.
# Run from repository root: powershell -File scripts/generate-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class ClockCounterIcon {
  static byte[] Render(int size) {
    using (var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb))
    using (var graphics = Graphics.FromImage(bitmap)) {
      graphics.Clear(Color.Transparent);
      graphics.SmoothingMode = SmoothingMode.AntiAlias;
      float s = size / 256f;
      var black = Color.FromArgb(255, 5, 5, 5);
      var white = Color.FromArgb(255, 247, 247, 244);
      var red = Color.FromArgb(255, 242, 11, 20);
      using (var background = new SolidBrush(black))
      using (var paper = new SolidBrush(white))
      using (var face = new SolidBrush(red))
      using (var border = new Pen(white, 13 * s)) {
        graphics.FillRectangle(background, 0, 0, size, size);
        graphics.DrawRectangle(border, 7*s, 7*s, 242*s, 242*s);
        graphics.FillRectangle(paper, 115*s, 18*s, 26*s, 19*s);
        graphics.FillRectangle(paper, 104*s, 12*s, 48*s, 10*s);
        var rect = new RectangleF(37*s, 46*s, 182*s, 182*s);
        graphics.FillEllipse(background, rect);
        graphics.FillPie(face, rect.X, rect.Y, rect.Width, rect.Height, -90f, 333f);
        graphics.DrawEllipse(border, rect);
        using (var marks = new Pen(white, 5 * s)) {
          for (int i = 0; i < 12; i += 3) {
            double a = (i * 30 - 90) * Math.PI / 180;
            float cx = 128*s; float cy = 137*s;
            var x1 = cx + (float)Math.Cos(a) * 76*s;
            var y1 = cy + (float)Math.Sin(a) * 76*s;
            var x2 = cx + (float)Math.Cos(a) * 88*s;
            var y2 = cy + (float)Math.Sin(a) * 88*s;
            graphics.DrawLine(marks, x1, y1, x2, y2);
          }
        }
        graphics.FillRectangle(background, 87*s, 120*s, 82*s, 32*s);
        using (var numberFont = new Font("Consolas", 20*s, FontStyle.Bold, GraphicsUnit.Pixel)) {
          graphics.DrawString("30", numberFont, paper, new PointF(111*s, 123*s));
        }
      }
      using (var stream = new MemoryStream()) {
        bitmap.Save(stream, ImageFormat.Png);
        return stream.ToArray();
      }
    }
  }
  public static void Create(string output) {
    var sizes = new int[] {16, 24, 32, 48, 64, 128, 256};
    var icons = new byte[sizes.Length][];
    for (int i = 0; i < sizes.Length; i++) icons[i] = Render(sizes[i]);
    using (var writer = new BinaryWriter(File.Create(output))) {
      writer.Write((ushort)0);
      writer.Write((ushort)1);
      writer.Write((ushort)sizes.Length);
      int offset = 6 + 16 * sizes.Length;
      for (int i = 0; i < sizes.Length; i++) {
        writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i]));
        writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i]));
        writer.Write((byte)0);
        writer.Write((byte)0);
        writer.Write((ushort)1);
        writer.Write((ushort)32);
        writer.Write((uint)icons[i].Length);
        writer.Write((uint)offset);
        offset += icons[i].Length;
      }
      for (int i = 0; i < icons.Length; i++) writer.Write(icons[i]);
    }
  }
}
'@
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
$icon = Join-Path $assets 'icon.ico'
[ClockCounterIcon]::Create($icon)
Write-Host "Created $icon"
