from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[2] / "icon.png"
OUTPUT = HERE / "source_white.png"

source = Image.open(SOURCE).convert("RGBA")
background = Image.new("RGBA", source.size, "white")
background.alpha_composite(source)
background.convert("RGB").save(OUTPUT)
print(OUTPUT)
