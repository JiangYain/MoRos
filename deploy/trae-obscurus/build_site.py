from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # The build remains functional without optional image conversion.
    Image = None


DEPLOY_DIR = Path(__file__).resolve().parent
SOURCE_HTML = DEPLOY_DIR.parent.parent / "Compass_intro_compass4trae.html"
DIST_DIR = DEPLOY_DIR / "dist"
ASSET_DIR = DIST_DIR / "assets"

DATA_URI_PATTERN = re.compile(
    r"data:(?P<mime>[^;,\"')\s]+);base64,(?P<data>[A-Za-z0-9+/=]+)"
)
IMAGE_TAG_PATTERN = re.compile(r"<img\b[^>]*>", re.IGNORECASE)

EXTENSIONS = {
    "font/woff2": "woff2",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
}


def prepare_dist() -> None:
    expected_parent = DEPLOY_DIR.resolve()
    resolved_dist = DIST_DIR.resolve()
    if resolved_dist.parent != expected_parent or resolved_dist.name != "dist":
        raise RuntimeError(f"Refusing to replace unexpected output path: {resolved_dist}")

    if resolved_dist.exists():
        shutil.rmtree(resolved_dist)
    ASSET_DIR.mkdir(parents=True)


def optimize_png(data: bytes) -> tuple[bytes, str, tuple[int, int] | None]:
    if Image is None:
        return data, "png", None

    with Image.open(io.BytesIO(data)) as image:
        dimensions = image.size
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")

        output = io.BytesIO()
        image.save(output, "WEBP", quality=90, method=6, exact=True)
        optimized = output.getvalue()

    if len(optimized) >= len(data):
        return data, "png", dimensions
    return optimized, "webp", dimensions


def enhance_image_tag(tag: str, dimensions: dict[str, tuple[int, int]]) -> str:
    source_match = re.search(r'src=["\']([^"\']+)["\']', tag, re.IGNORECASE)
    source = source_match.group(1) if source_match else ""
    attributes: list[str] = []

    if not re.search(r"\bloading=", tag, re.IGNORECASE):
        attributes.append('loading="lazy"')
    if not re.search(r"\bdecoding=", tag, re.IGNORECASE):
        attributes.append('decoding="async"')
    if source in dimensions and not re.search(r"\bwidth=", tag, re.IGNORECASE):
        width, height = dimensions[source]
        attributes.extend([f'width="{width}"', f'height="{height}"'])

    if not attributes:
        return tag
    return tag.replace("<img", f"<img {' '.join(attributes)}", 1)


def build() -> dict[str, int | bool]:
    prepare_dist()
    source = SOURCE_HTML.read_text(encoding="utf-8")
    assets: dict[str, str] = {}
    dimensions: dict[str, tuple[int, int]] = {}
    input_asset_bytes = 0
    output_asset_bytes = 0
    converted_images = 0

    def extract(match: re.Match[str]) -> str:
        nonlocal input_asset_bytes, output_asset_bytes, converted_images

        mime = match.group("mime").lower()
        raw = base64.b64decode(match.group("data"), validate=True)
        input_asset_bytes += len(raw)
        extension = EXTENSIONS.get(mime, "bin")
        output = raw
        image_dimensions: tuple[int, int] | None = None

        if mime == "image/png":
            output, extension, image_dimensions = optimize_png(raw)
            if extension == "webp":
                converted_images += 1

        digest = hashlib.sha256(output).hexdigest()[:16]
        kind = "font" if mime.startswith("font/") else "image"
        file_name = f"{kind}-{digest}.{extension}"
        relative_path = f"assets/{file_name}"

        if file_name not in assets:
            (ASSET_DIR / file_name).write_bytes(output)
            assets[file_name] = relative_path
            output_asset_bytes += len(output)
        if image_dimensions:
            dimensions[relative_path] = image_dimensions

        return relative_path

    compiled = DATA_URI_PATTERN.sub(extract, source)
    compiled = IMAGE_TAG_PATTERN.sub(
        lambda match: enhance_image_tag(match.group(0), dimensions), compiled
    )

    remaining_embedded_assets = len(DATA_URI_PATTERN.findall(compiled))
    if remaining_embedded_assets:
        raise RuntimeError(f"Found {remaining_embedded_assets} unextracted data URI assets")

    (DIST_DIR / "index.html").write_text(compiled, encoding="utf-8", newline="\n")
    shutil.copy2(DEPLOY_DIR / "robots.txt", DIST_DIR / "robots.txt")
    shutil.copy2(DEPLOY_DIR / "sitemap.xml", DIST_DIR / "sitemap.xml")

    result: dict[str, int | bool] = {
        "sourceHtmlBytes": SOURCE_HTML.stat().st_size,
        "outputHtmlBytes": (DIST_DIR / "index.html").stat().st_size,
        "assetCount": len(assets),
        "inputAssetBytes": input_asset_bytes,
        "outputAssetBytes": output_asset_bytes,
        "convertedImages": converted_images,
        "pillowAvailable": Image is not None,
    }
    return result


if __name__ == "__main__":
    print(json.dumps(build(), ensure_ascii=False, indent=2))
