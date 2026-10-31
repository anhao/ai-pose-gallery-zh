# -*- coding: utf-8 -*-
"""校验：文件是否存在、大小是否正常、图片头是否合法（覆盖 Pose / Costume / Portrait）。

用法（在仓库根目录）: python3 scripts/verify.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JPEG = b"\xff\xd8\xff"
PNG = b"\x89PNG\r\n\x1a\n"
WEBP = b"RIFF"

checks = []

# 1. Pose
pose_path = os.path.join(ROOT, "data", "pose.json")
if os.path.exists(pose_path):
    with open(pose_path, encoding="utf-8") as f:
        for item in json.load(f):
            checks.append((os.path.join(ROOT, item["サムネ"]), JPEG, "thumbs"))
            checks.append((os.path.join(ROOT, item["原寸"]), PNG, "img"))

# 2. Costume
costume_path = os.path.join(ROOT, "data", "costume.json")
if os.path.exists(costume_path):
    with open(costume_path, encoding="utf-8") as f:
        for item in json.load(f):
            cid = item["id"]
            checks.append((os.path.join(ROOT, "thumbs", "costume", f"{cid}.webp"), WEBP, "thumbs"))
            checks.append((os.path.join(ROOT, "img", "costume", f"{cid}.webp"), WEBP, "img"))

# 3. Portrait
portrait_path = os.path.join(ROOT, "data", "portrait.json")
if os.path.exists(portrait_path):
    with open(portrait_path, encoding="utf-8") as f:
        for item in json.load(f):
            pid = item["id"]
            checks.append((os.path.join(ROOT, "thumbs", "portrait", f"{pid}.webp"), WEBP, "thumbs"))
            checks.append((os.path.join(ROOT, "img", "portrait", f"{pid}.webp"), WEBP, "img"))

bad = []
total = 0
size_thumbs = size_img = 0
for p, magic, bucket in checks:
    total += 1
    if not os.path.exists(p):
        bad.append((p, "MISSING"))
        continue
    sz = os.path.getsize(p)
    if sz < 1024:
        bad.append((p, f"TOO_SMALL {sz}"))
        continue
    with open(p, "rb") as fh:
        head = fh.read(12)
    if magic == WEBP:
        if not (head.startswith(b"RIFF") and head[8:12] == b"WEBP"):
            bad.append((p, f"BAD_WEBP {head[:12]!r}"))
            continue
    elif not head.startswith(magic):
        bad.append((p, f"BAD_HEADER {head[:4]!r}"))
        continue
    if bucket == "thumbs":
        size_thumbs += sz
    else:
        size_img += sz

print(f"期望文件数 {total}，异常 {len(bad)}")
print(f"thumbs 合计 {size_thumbs/1048576:.1f} MB，img 合计 {size_img/1048576:.1f} MB，"
      f"总计 {(size_thumbs+size_img)/1048576:.1f} MB")
if bad:
    for p, why in bad[:40]:
        print(" ", p, why)
    with open(os.path.join(ROOT, "verify_failed.txt"), "w", encoding="utf-8") as f:
        for p, why in bad:
            f.write(f"{p}\t{why}\n")
    print("完整清单 -> verify_failed.txt")
    sys.exit(1)
print("全部通过 ✅")

