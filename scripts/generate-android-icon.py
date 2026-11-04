from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android/app/src/main/res"
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

def font(size):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()

def draw_icon(size=1024, transparent=False):
    scale = size / 512
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else (7, 8, 12, 255))
    d = ImageDraw.Draw(im)
    def box(coords):
        return tuple(round(v * scale) for v in coords)
    if not transparent:
        # Deep charcoal rounded-square base with a restrained cinema-red halo.
        d.rounded_rectangle(box((0, 0, 512, 512)), radius=round(112*scale), fill=(8, 9, 14, 255))
        for radius, alpha in [(175, 12), (145, 12), (115, 10)]:
            d.ellipse(box((256-radius, 226-radius, 256+radius, 226+radius)), fill=(206, 20, 53, alpha))
    # Cinematic screen housing.
    d.rounded_rectangle(box((68, 118, 444, 354)), radius=round(58*scale), fill=(14, 17, 25, 255), outline=(178, 20, 48, 255), width=max(3, round(15*scale)))
    d.rounded_rectangle(box((96, 143, 416, 324)), radius=round(38*scale), fill=(39, 8, 19, 255), outline=(255, 142, 135, 255), width=max(2, round(4*scale)))
    # Red illuminated screen.
    d.rounded_rectangle(box((119, 164, 393, 302)), radius=round(26*scale), fill=(124, 11, 34, 255))
    for y in range(round(166*scale), round(300*scale)):
        t = (y/scale - 166) / 134
        col = (int(247-75*t), int(69-42*t), int(78-20*t), 255)
        d.line((round(120*scale), y, round(392*scale), y), fill=col, width=1)
    # Cinematic light beam.
    d.polygon([box((160, 171)), box((352, 171)), box((326, 285)), box((186, 285))], fill=(255, 226, 214, 28))
    label = "IMAX"
    f = font(round(66*scale))
    bb = d.textbbox((0, 0), label, font=f, stroke_width=0)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    d.text(((size-tw)//2, round(191*scale)-bb[1]), label, font=f, fill=(255, 247, 242, 255))
    # Tiered auditorium / screen base motif.
    d.rounded_rectangle(box((124, 350, 388, 370)), radius=round(10*scale), fill=(133, 22, 43, 255))
    d.rounded_rectangle(box((160, 384, 352, 400)), radius=round(8*scale), fill=(224, 48, 67, 255))
    d.rounded_rectangle(box((194, 414, 318, 428)), radius=round(7*scale), fill=(79, 17, 30, 255))
    d.ellipse(box((246, 345, 266, 365)), fill=(255, 190, 170, 255))
    return im

# Web icon and Android legacy launcher icons.
icon = draw_icon(1024)
icon.save(ASSETS / "icon.png", optimize=True)
for density, px in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    folder = RES / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    small = icon.resize((px, px), Image.Resampling.LANCZOS)
    small.save(folder / "ic_launcher.png", optimize=True)
    small.save(folder / "ic_launcher_round.png", optimize=True)

# Adaptive launcher icon foreground: artwork stays inside Android's safe zone.
fg = draw_icon(432, transparent=True)
# Keep the artwork centered and scaled to the adaptive-icon safe area.
fg = fg.resize((300, 300), Image.Resampling.LANCZOS)
canvas = Image.new("RGBA", (432, 432), (0,0,0,0))
canvas.alpha_composite(fg, ((432-300)//2, (432-300)//2))
drawable = RES / "drawable-nodpi"
drawable.mkdir(parents=True, exist_ok=True)
canvas.save(drawable / "ic_launcher_foreground.png", optimize=True)
(RES / "drawable").mkdir(parents=True, exist_ok=True)
(RES / "drawable/ic_launcher_background.xml").write_text(
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#08090E"/></shape>\n',
    encoding="utf-8"
)
adaptive = RES / "mipmap-anydpi-v26"
adaptive.mkdir(parents=True, exist_ok=True)
xml = '''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
'''
(adaptive / "ic_launcher.xml").write_text(xml, encoding="utf-8")
(adaptive / "ic_launcher_round.xml").write_text(xml, encoding="utf-8")
print("Generated web, legacy Android, and adaptive Android launcher icons.")
