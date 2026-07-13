import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUTPUTS = ROOT / "outputs"
TIMES = [0, 240, 430, 600, 760, 912, 1200]


def rgb_on_white(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    background = Image.new("RGBA", image.size, "white")
    background.alpha_composite(image)
    return background.convert("RGB")


frames = [rgb_on_white(OUTPUTS / "motion_frames" / f"frame_{time:06d}ms.png") for time in TIMES]
label_height = 28
cell_width = max(frame.width for frame in frames)
cell_height = max(frame.height for frame in frames) + label_height
strip = Image.new("RGB", (cell_width * len(frames), cell_height), "white")
draw = ImageDraw.Draw(strip)
for index, (frame, time) in enumerate(zip(frames, TIMES)):
    x = index * cell_width + (cell_width - frame.width) // 2
    strip.paste(frame, (x, label_height))
    draw.text((index * cell_width + 8, 6), f"t={time}ms", fill="#333333")
    if index:
        draw.line((index * cell_width, 0, index * cell_width, cell_height), fill="#dddddd")
strip_path = OUTPUTS / "motion_strip.png"
strip.save(strip_path)

final_frame = frames[-1]
static_frame = rgb_on_white(ROOT / "html_render.png")
same_pipeline_diff = np.abs(
    np.asarray(final_frame, dtype=np.int16) - np.asarray(static_frame, dtype=np.int16)
)

static_render = rgb_on_white(OUTPUTS / "final_render.png").resize(final_frame.size, Image.Resampling.LANCZOS)
cross_pipeline_diff = np.abs(
    np.asarray(final_frame, dtype=np.int16) - np.asarray(static_render, dtype=np.int16)
)

report = {
    "motion_strip": str(strip_path),
    "same_pipeline": {
        "mean_abs_diff": float(same_pipeline_diff.mean()),
        "max_abs_diff": int(same_pipeline_diff.max()),
        "different_pixels": int(np.any(same_pipeline_diff != 0, axis=2).sum()),
    },
    "cross_pipeline": {
        "mean_abs_diff": round(float(cross_pipeline_diff.mean()), 3),
        "max_abs_diff": int(cross_pipeline_diff.max()),
        "pct_pixels_off_by_25plus": round(
            float((cross_pipeline_diff.max(axis=2) >= 25).mean() * 100), 3
        ),
    },
}
(OUTPUTS / "motion_qa_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
