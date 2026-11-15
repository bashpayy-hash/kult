"""Blends and encodes the home page's cover loop (frames from render-hero-film.mjs).

Three shots of 6.5 s each — over the city, Arbat, Dostyk — dissolve into one
another over 0.75 s, and the last dissolves back into the first, so the loop
has no seam. Two crops: wide 16:9 for computers, tall 2:3 for phones. Each in
H.264 (MP4: smaller than VP9 here, and it plays everywhere), plus a still of the loop's first frame as the
poster. Output: public/plates/city-{wide,tall}.{mp4,webp}.

Run: python3 scripts/encode-hero-film.py
"""
import os
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design", "hero-film", "frames")
OUT = os.path.join(ROOT, "public", "plates")
SHOTS = ["air", "arbat", "dostyk"]
XF = 18  # frames of dissolve (0.75 s at 24 fps)
FPS = 24

shots = {s: sorted(f for f in os.listdir(SRC) if f.startswith(s + "-")) for s in SHOTS}
n = min(len(v) for v in shots.values())
assert n > 2 * XF, f"too few frames: {n}"


def frame(shot, i):
    return Image.open(os.path.join(SRC, shots[shot][i])).convert("RGB")


seq = []  # (shot, i) or ("blend", a, ia, b, ib, alpha)
for k, s in enumerate(SHOTS):
    nxt = SHOTS[(k + 1) % len(SHOTS)]
    seq += [(s, i) for i in range(XF, n - XF)]
    seq += [("blend", s, n - XF + j, nxt, j, (j + 1) / (XF + 1)) for j in range(XF)]

tmp = tempfile.mkdtemp(prefix="cityfilm-")
for idx, item in enumerate(seq):
    if item[0] == "blend":
        _, a, ia, b, ib, t = item
        im = Image.blend(frame(a, ia), frame(b, ib), t)
    else:
        im = frame(*item)
    im.save(os.path.join(tmp, f"{idx:05d}.png"))
print("frames", len(seq), f"({len(seq) / FPS:.1f} s)")

W = Image.open(os.path.join(tmp, "00000.png")).size[0]
crops = {
    # The range sits high in the aerial shot: the wide crop keeps the top of the frame.
    "wide": (f"crop={W}:{W * 9 // 16}:0:{W // 10}", "1280:720"),
    "tall": (f"crop={W * 2 // 3}:{W}:{W // 6}:0", "640:960"),
}
os.makedirs(OUT, exist_ok=True)
for name, (crop, size) in crops.items():
    vf = f"{crop},scale={size}:flags=lanczos,format=yuv420p"
    common = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "%05d.png"), "-vf", vf, "-an"]
    subprocess.run(common + ["-c:v", "libx264", "-preset", "slow", "-crf", "27" if name == "wide" else "28", "-movflags", "+faststart", os.path.join(OUT, f"city-{name}.mp4")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(tmp, "00000.png"), "-vf", f"{crop},scale={size}:flags=lanczos", "-q:v", "82", os.path.join(OUT, f"city-{name}.webp")], check=True)
    for ext in ("mp4", "webp"):
        p = os.path.join(OUT, f"city-{name}.{ext}")
        print(name, ext, os.path.getsize(p) // 1024, "KB")
shutil.rmtree(tmp)
