#!/usr/bin/env python3
"""并发下载 POSE + COSTUME + PORTRAIT 三个站点的全部图片（断点续传、失败重试）。

用法（在仓库根目录）:
    python3 scripts/download.py
    WORKERS=64 python3 scripts/download.py
    DATASET=costume python3 scripts/download.py   # 仅下载指定数据集 (pose|costume|portrait|all)
"""
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

POSE_BASE = "https://ai-pose-gallery.pages.dev/"
COSTUME_BASE = "https://ai-costume-gallery.pages.dev/"
PORTRAIT_BASE = "https://ai-portrait-gallery.pages.dev/"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKERS = int(os.environ.get("WORKERS", "48"))
DATASET = os.environ.get("DATASET", "all").lower()
RETRY = 4
TIMEOUT = 60

tasks_fast = []
tasks_full = []

# 1. POSE
if DATASET in ("all", "pose"):
    pose_path = os.path.join(ROOT, "data", "pose.json")
    if os.path.exists(pose_path):
        with open(pose_path, encoding="utf-8") as f:
            for item in json.load(f):
                tasks_fast.append((POSE_BASE + item["サムネ"], os.path.join(ROOT, item["サムネ"]), POSE_BASE))
                tasks_full.append((POSE_BASE + item["原寸"], os.path.join(ROOT, item["原寸"]), POSE_BASE))

# 2. COSTUME
if DATASET in ("all", "costume"):
    costume_path = os.path.join(ROOT, "data", "costume.json")
    if os.path.exists(costume_path):
        with open(costume_path, encoding="utf-8") as f:
            for item in json.load(f):
                cid = item["id"]
                tasks_fast.append((
                    COSTUME_BASE + item["サムネ"],
                    os.path.join(ROOT, "thumbs", "costume", f"{cid}.webp"),
                    COSTUME_BASE,
                ))
                tasks_fast.append((
                    COSTUME_BASE + item["画像"],
                    os.path.join(ROOT, "img", "costume", f"{cid}.webp"),
                    COSTUME_BASE,
                ))
                tasks_full.append((
                    COSTUME_BASE + item["原寸"],
                    os.path.join(ROOT, "img", "costume", f"{cid}.png"),
                    COSTUME_BASE,
                ))

# 3. PORTRAIT
if DATASET in ("all", "portrait"):
    portrait_path = os.path.join(ROOT, "data", "portrait.json")
    if os.path.exists(portrait_path):
        with open(portrait_path, encoding="utf-8") as f:
            for item in json.load(f):
                pid = item["id"]
                tasks_fast.append((
                    PORTRAIT_BASE + item["thumb"],
                    os.path.join(ROOT, "thumbs", "portrait", f"{pid}.webp"),
                    PORTRAIT_BASE,
                ))
                tasks_full.append((
                    PORTRAIT_BASE + item["full"],
                    os.path.join(ROOT, "img", "portrait", f"{pid}.png"),
                    PORTRAIT_BASE,
                ))

# 先下载缩略图与预览图，再下载体积较大的原寸 PNG
tasks = list(dict.fromkeys(tasks_fast + tasks_full))


def fetch(url, path, referer):
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return "skip", path, os.path.getsize(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    last = None
    for attempt in range(RETRY):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": referer})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                body = r.read()
            if len(body) < 1024:
                raise IOError("too small: %d" % len(body))
            tmp = path + ".part"
            with open(tmp, "wb") as f:
                f.write(body)
            os.replace(tmp, path)
            return "ok", path, len(body)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.4 * (attempt + 1))
    return "fail", path, str(last)


t0 = time.time()
ok = skip = fail = 0
fails = []
total_bytes = 0
print(f"启动下载任务: 共 {len(tasks)} 个文件 (WORKERS={WORKERS}, DATASET={DATASET})", flush=True)
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futs = [ex.submit(fetch, u, p, ref) for u, p, ref in tasks]
    for i, fut in enumerate(as_completed(futs), 1):
        st, path, info = fut.result()
        if st == "ok":
            ok += 1
            total_bytes += info
        elif st == "skip":
            skip += 1
            if isinstance(info, int):
                total_bytes += info
        else:
            fail += 1
            fails.append((path, info))
        if i % 400 == 0 or i == len(tasks):
            el = max(time.time() - t0, 0.001)
            print(f"[{i}/{len(tasks)}] ok={ok} skip={skip} fail={fail} "
                  f"{total_bytes/1048576:.0f}MB {el:.0f}s ({i/el:.1f}/s)", flush=True)

print(f"DONE ok={ok} skip={skip} fail={fail} {time.time()-t0:.0f}s")
if fails:
    with open(os.path.join(ROOT, "download_failed.txt"), "w", encoding="utf-8") as f:
        for p, e in fails:
            f.write(f"{p}\t{e}\n")
    print("failed list -> download_failed.txt")

