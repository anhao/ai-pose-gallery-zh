"""更新 CharaDB 公开版服装元数据（不下载图片）。

python scripts/import_charadb.py [--revision <Git commit SHA>]
默认离线从已提交快照重建。指定 SHA 时从官方仓库更新，须先补齐中文名称。
"""
import argparse
import csv
import hashlib
import json
import re
import urllib.request
from pathlib import Path
from i18n import COSTUME_WORD_ALL

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "charadb"
ORIGIN = "https://charadb-2fi.pages.dev"
TAG_NAMES = {**COSTUME_WORD_ALL, "serafuku": "水手服", "blazer": "西装外套", "kimono": "和服", "yukata": "浴衣",
             "bikini": "比基尼", "bodysuit": "紧身衣", "armor": "护甲", "uniform": "制服", "maid": "女仆",
             "pajamas": "睡衣", "necktie": "领带", "bow": "蝴蝶结", "frills": "荷叶边", "plaid": "格纹",
             "sleeveless": "无袖", "striped": "条纹", "backless": "露背", "off-shoulder": "露肩",
             "leotard": "紧身连体衣", "thighhighs": "过膝袜", "pantyhose": "连裤袜", "corset": "束腰"}
CATEGORIES = dict(zip(
    ["制服・学生", "カジュアル(春夏)", "カジュアル(秋冬)", "きれいめ・オフィス", "ドレス・パーティ", "和服", "水着", "スポーツ・部活", "職業・コスプレ", "ファンタジー", "部屋着・パジャマ", "イベント・季節", "アイドル・ステージ", "ゴスロリ・地雷系", "ミリタリー・SF"],
    ["制服与校园风", "春夏休闲", "秋冬休闲", "通勤与职场", "礼服与派对", "和服", "泳装", "运动", "职业与角色扮演", "奇幻", "居家与睡衣", "节庆与季节", "偶像与舞台", "洛丽塔与地雷系", "军事与科幻"],
))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", help="官方仓库完整40位提交SHA")
    args = parser.parse_args()
    names = json.loads((DATA / "names-zh.json").read_text(encoding="utf-8"))
    if args.revision:
        if not re.fullmatch(r"[0-9a-f]{40}", args.revision):
            parser.error("revision 必须是完整提交 SHA")
        url = f"https://raw.githubusercontent.com/taki-ttt/charadb/{args.revision}/data/items_public.json"
        with urllib.request.urlopen(url, timeout=30) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("目录过大")
        outfits = [r for r in json.loads(raw) if r.get("set") == "outfit"]
        provenance = {"repository": "https://github.com/taki-ttt/charadb", "revision": args.revision,
                      "source": url, "source_sha256": hashlib.sha256(raw).hexdigest()}
    else:
        provenance = json.loads((DATA / "source.json").read_text(encoding="utf-8"))
        snapshot = (DATA / "outfits-public.json").read_bytes()
        if hashlib.sha256(snapshot).hexdigest() != provenance["outfits_sha256"]:
            raise ValueError("服装快照哈希不符，请从审核后的官方提交重新导入")
        outfits = json.loads(snapshot)
    ids = [r["id"] for r in outfits]
    if len(ids) != len(set(ids)) or not ids:
        raise ValueError("空目录或重复ID")
    output = []
    for row in outfits:
        rid = row["id"]
        if not re.fullmatch(r"O\d{3}", rid) or row.get("tier", "public") != "public" or row["cat"] not in CATEGORIES:
            raise ValueError(f"未知或非公开条目: {rid}")
        name = names[rid]  # 新条目必须人工翻译，不能静默漏收。
        if re.search(r"[\u3040-\u30ff]", name):
            raise ValueError(f"中文名仍含日文: {rid}")
        category = CATEGORIES[row["cat"]]
        tags = row["tags"]
        sensitive = row["cat"] == "水着" or bool(re.search(r"bikini|swimsuit|playboy bunny|cleavage|see-through|micro bikini|underwear|lingerie|succubus|naked", tags))
        labels = list(dict.fromkeys([category] + [TAG_NAMES[word] for word in re.findall(r"[a-z]+(?:-[a-z]+)*", tags) if word in TAG_NAMES]))
        item = {"id": f"charadb-{rid}", "source": "charadb", "一级分类": "二次元", "分类": category,
                "服装名称": name, "日文名称": row["jp"], "标签": labels, "关键词": tags,
                "缩略图": f"{ORIGIN}/thumb/{rid}.webp", "预览图": f"{ORIGIN}/img/{rid}.jpg",
                "原图": f"{ORIGIN}/img/{rid}.jpg", "来源": "たき AI · CharaDB", "来源地址": ORIGIN + "/",
                "敏感": sensitive, "检索": f"charadb-{rid} {name} {category} {row['jp']} {tags}"}
        output.append(item)
    snapshot = (json.dumps(outfits, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    provenance["outfits_sha256"] = hashlib.sha256(snapshot).hexdigest()
    provenance["count"] = len(output)
    (DATA / "outfits-public.json").write_bytes(snapshot)
    (DATA / "source.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "data" / "costume-anime-zh.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    catalog = ROOT / "skills" / "costume-reference-anime" / "references" / "catalog.csv"
    catalog.parent.mkdir(parents=True, exist_ok=True)
    with catalog.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["ID", "服装名称", "分类", "英文关键词", "图片URL", "敏感", "来源"])
        for row in output:
            writer.writerow([row["id"], row["服装名称"], row["分类"], row["关键词"], row["原图"], row["敏感"], row["来源地址"]])
    print(f"CharaDB: {len(output)} outfits, metadata only")


if __name__ == "__main__":
    main()
