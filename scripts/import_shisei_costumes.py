"""从固定快照重建中国历代服装目录；--download-shisei 下载 CC0 图片。

python scripts/import_shisei_costumes.py [--download-shisei]
快照更新须审核新提交及其图片授权后手动替换。
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import base64
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHISEI_REVISION = "8f61ceab10e45f8d3afd254900903733a0ba76ee"
SHISEI_RAW = f"https://raw.githubusercontent.com/wquguru/shisei/{SHISEI_REVISION}/"
LABELS = {"front": "正面", "diag": "斜侧", "side": "侧面", "back": "背面"}
SNAPSHOT_HASHES = {
    "shisei/costumes.json": "af7287a57998a5437f3666e9c22ee25208eb61c11a16afba01f30754d93deda2",
}


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-shisei", action="store_true")
    parser.add_argument("--github-cli", help="可选 gh 可执行文件路径，以认证 GitHub API 下载固定版本")
    args = parser.parse_args()
    for path, expected in SNAPSHOT_HASHES.items():
        if sha(ROOT / "data" / path) != expected:
            raise ValueError(f"快照哈希不符，请审核上游修订: {path}")
    snapshot = ROOT / "data/shisei/costumes.json"
    rows = json.loads(snapshot.read_text(encoding="utf-8"))["items"]
    outfits, downloads = [], []
    for row in rows:
        if row["cat"] != "HC":
            continue
        views = []
        for view, filename in row["views"].items():
            if not filename:
                continue
            if view not in LABELS or not re.fullmatch(r"costume_C\d{3}_" + view + r"\.webp", filename):
                raise ValueError(f"意外视角文件: {filename}")
            thumb = f"thumbs/costumes/shisei/{filename}"
            image = f"img/costumes/shisei/{filename}"
            views.append(dict(id=view, label=LABELS[view], 缩略图=thumb, 预览图=image, 原图=image))
            downloads.extend([(thumb, SHISEI_RAW + "images/costume/grey/w300/" + filename),
                              (image, SHISEI_RAW + "images/costume/grey/w900/" + filename)])
        if not views:
            continue
        default = next((v for v in views if v["id"] == "front"), views[0])
        name = row["era_zh"] + " · " + row["name_zh"]
        outfits.append(dict(id="shisei-" + row["id"], source="shisei", 一级分类="现实", 分类="中国历代",
                            服装名称=name, 标签=[row["era_zh"], "男装" if row["gender"] == "M" else "女装"],
                            关键词=row["desc_en"], 缩略图=default["缩略图"], 预览图=default["预览图"], 原图=default["原图"],
                            selectedView=default["id"], views=views, 来源="Shisei · wquguru", 来源地址="https://github.com/wquguru/shisei",
                            检索=f"shisei {row['id']} 中国历代 {name} {row['desc_en']}"))
    if len(outfits) != 57 or sum(len(r["views"]) for r in outfits) != 227:
        raise ValueError("中国历代快照数量变化，请审核")
    write_json(ROOT / "data/costume-shisei-zh.json", outfits)
    if args.download_shisei:
        def download(entry):
            path, url = entry
            target = ROOT / path
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                if args.github_cli:
                    remote = url.split(SHISEI_RAW, 1)[1]
                    content = subprocess.run([args.github_cli, "api", f"repos/wquguru/shisei/contents/{remote}?ref={SHISEI_REVISION}",
                                              "-H", "Accept: application/vnd.github+json"], check=True, capture_output=True, timeout=60).stdout
                    content = base64.b64decode(json.loads(content)["content"])
                else:
                    with urllib.request.urlopen(url, timeout=30) as response:
                        content = response.read(2_000_001)
                if len(content) > 2_000_000 or content[:4] != b"RIFF" or content[8:12] != b"WEBP":
                    raise ValueError(f"非法WebP: {path}")
                target.write_bytes(content)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(download, downloads))
    manifest = []
    for path, url in downloads:
        target = ROOT / path
        if target.exists():
            manifest.append(dict(path=path, source=url, bytes=target.stat().st_size, sha256=sha(target)))
    write_json(ROOT / "data/shisei/source.json", {
        "repository": "https://github.com/wquguru/shisei", "revision": SHISEI_REVISION,
        "path": "data/costumes.json", "snapshot_sha256": sha(snapshot),
        "snapshot_git_blob": "4cc07d1e4bd4cbc36f95e8d0bae88f44e668f70f",
        "license_sha256": sha(ROOT / "data/shisei/LICENSE-images"),
        "notice_sha256": sha(ROOT / "data/shisei/NOTICE"),
        "count": len(outfits), "views": 227, "license": "CC0-1.0", "attribution": "Shisei / wquguru"})
    write_json(ROOT / "data/shisei/images-manifest.json", manifest)
    print(f"shisei={len(outfits)}; views=227; local_files={len(manifest)}; bytes={sum(r['bytes'] for r in manifest)}")


if __name__ == "__main__":
    main()
