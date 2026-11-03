"""从固定快照重建ギア动漫元数据；不下载或镜像图片。"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANIME_ORIGIN = "https://ai-costume-anime-gallery.pages.dev/"


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if sha(ROOT / "data/gia-anime/costume-anime.json") != "7a6b353c2a57ed6064863553fb122d6cc732e4f390d6babd46d0e81f14d47f87":
        raise ValueError("快照哈希不符，请先审核上游修订")
    base = {r["id"]: r for r in json.loads((ROOT / "data/costume-zh.json").read_text(encoding="utf-8"))}
    snapshot = ROOT / "data/gia-anime/costume-anime.json"
    rows = json.loads(snapshot.read_text(encoding="utf-8"))
    if len(rows) != 1320 or len({r["id"] for r in rows}) != 1320:
        raise ValueError("动漫快照必须为1320个唯一ID")
    anime = []
    for row in rows:
        rid = row["id"]
        local = base[rid]
        item = dict(local, id=f"gia-anime-{rid}", source="gia-anime", 一级分类="二次元",
                    来源="ギア · 动漫服装", 来源地址=ANIME_ORIGIN)
        for field, original, prefix, ext in [("缩略图", "サムネ", "thumbs", "webp"), ("预览图", "画像", "img", "webp"), ("原图", "原寸", "png", "png")]:
            expected = f"{prefix}/{rid}.{ext}"
            if row[original] != expected:
                raise ValueError(f"意外图片路径: {rid}")
            item[field] = ANIME_ORIGIN + expected
        item["检索"] += f" gia-anime {rid} ギア 动漫"
        anime.append(item)
    write_json(ROOT / "data/costume-gia-anime-zh.json", anime)
    write_json(ROOT / "data/gia-anime/source.json", {
        "origin": ANIME_ORIGIN, "repository": "https://github.com/hongye007/open-pose-costume",
        "revision": "f08f2e48675caeec85f091dde308cd906582b50f",
        "path": "data/source/costume-anime.json", "snapshot_sha256": sha(snapshot),
        "snapshot_git_blob": "ec79027e34b5c1492462f4879b01966d1934b427",
        "count": len(anime), "images": "remote-only; no image mirroring"})
    print(f"anime={len(anime)}; images=remote-only")


if __name__ == "__main__":
    main()
