# -*- coding: utf-8 -*-
"""把日文/英文数据回填为中文：
- Pose:     data/pose-zh.json / meta-zh.json
- Costume:  data/costume-zh.json / costume-meta-zh.json
- Portrait: data/portrait-zh.json / portrait-meta-zh.json
- 对照表:   data/translations.csv

用法（在仓库根目录）: python3 scripts/apply_translation.py
"""
import csv
import json
import os
import sys
from collections import Counter

import i18n

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# ==============================================================================
# 1. POSE 翻译
# ==============================================================================
with open(os.path.join(DATA, "pose.json"), encoding="utf-8") as f:
    pose_data = json.load(f)
with open(os.path.join(DATA, "meta.json"), encoding="utf-8") as f:
    pose_meta = json.load(f)

pose_maps = {
    "系統": i18n.SYSTEM,
    "分類": i18n.CATEGORY,
    "アングル": i18n.ANGLE,
    "ポーズ名": i18n.POSE,
}

missing = {k: sorted({x.get(k) for x in pose_data} - set(m)) for k, m in pose_maps.items()}
bad = {k: v for k, v in missing.items() if v}
if bad:
    print("!! Pose 缺失译词：")
    for k, v in bad.items():
        for s in v:
            print(f"  [{k}] {s}")
    sys.exit(1)

pose_out = []
for x in pose_data:
    pose_out.append({
        "id": x["id"],
        "体系": i18n.SYSTEM[x["系統"]],
        "姿势编号": x["ポーズ番号"],
        "分类": i18n.CATEGORY[x["分類"]],
        "姿势名称": i18n.POSE[x["ポーズ名"]],
        "角度": i18n.ANGLE[x["アングル"]],
        "缩略图": x["サムネ"],
        "原图": x["原寸"],
        "检索": f'{x["id"]} {i18n.SYSTEM[x["系統"]]}{i18n.CATEGORY[x["分類"]]}{i18n.POSE[x["ポーズ名"]]}{i18n.ANGLE[x["アングル"]]}',
    })
with open(os.path.join(DATA, "pose-zh.json"), "w", encoding="utf-8") as f:
    json.dump(pose_out, f, ensure_ascii=False, indent=1)

with open(os.path.join(DATA, "meta-zh.json"), "w", encoding="utf-8") as f:
    json.dump({"体系分类": [i18n.SYSTEM[s] for s in pose_meta["lines"]]}, f, ensure_ascii=False, indent=2)

# ==============================================================================
# 2. COSTUME 翻译
# ==============================================================================
costume_path = os.path.join(DATA, "costume.json")
costume_out = []
if os.path.exists(costume_path):
    with open(costume_path, encoding="utf-8") as f:
        costume_data = json.load(f)
    with open(os.path.join(DATA, "costume-meta.json"), encoding="utf-8") as f:
        costume_meta = json.load(f)

    missing_cats = sorted({x["カテゴリ"] for x in costume_data} - set(i18n.COSTUME_CATEGORY))
    missing_words = sorted({w for x in costume_data for w in x["キーワード"].split()} - set(i18n.COSTUME_WORD_ALL))
    if missing_cats or missing_words:
        print("!! Costume 缺失译词：", missing_cats, missing_words)
        sys.exit(1)

    for x in costume_data:
        cid = x["id"]
        cat_zh = i18n.COSTUME_CATEGORY[x["カテゴリ"]]
        name_zh, tags_zh = i18n.translate_costume_keywords(x["キーワード"])
        thumb_rel = f"thumbs/costume/{cid}.webp"
        img_rel = f"img/costume/{cid}.webp"
        costume_out.append({
            "id": cid,
            "分类": cat_zh,
            "服装名称": name_zh,
            "标签": tags_zh,
            "关键词": x["キーワード"],
            "缩略图": thumb_rel,
            "预览图": img_rel,
            "原图": img_rel,
            "检索": f'{cid} {cat_zh} {name_zh} {" ".join(tags_zh)} {x["キーワード"]}',
        })

    with open(os.path.join(DATA, "costume-zh.json"), "w", encoding="utf-8") as f:
        json.dump(costume_out, f, ensure_ascii=False, indent=1)

    with open(os.path.join(DATA, "costume-meta-zh.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "total": costume_meta["total"],
                "分类列表": [i18n.COSTUME_CATEGORY[c] for c in costume_meta["cats"]],
                "各分类数量": {i18n.COSTUME_CATEGORY[k]: v for k, v in costume_meta["counts"].items()},
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

# ==============================================================================
# 3. PORTRAIT 翻译
# ==============================================================================
portrait_path = os.path.join(DATA, "portrait.json")
portrait_out = []
if os.path.exists(portrait_path):
    with open(portrait_path, encoding="utf-8") as f:
        portrait_data = json.load(f)
    with open(os.path.join(DATA, "portrait-ranking.json"), encoding="utf-8") as f:
        portrait_rank = json.load(f)

    missing_sec = sorted({x["section"] for x in portrait_data} - set(i18n.PORTRAIT_SECTION))
    missing_hair = sorted({x["hair"] for x in portrait_data} - set(i18n.PORTRAIT_HAIR))
    missing_style = sorted({x.get("style", "") for x in portrait_data} - set(i18n.PORTRAIT_STYLE))
    if missing_sec or missing_hair or missing_style:
        print("!! Portrait 缺失译词：", missing_sec, missing_hair, missing_style)
        sys.exit(1)

    rank_set = set(portrait_rank.get("top", {}).get("総合", []))
    for x in portrait_data:
        pid = x["id"]
        sec_zh = i18n.PORTRAIT_SECTION[x["section"]]
        hair_zh = i18n.PORTRAIT_HAIR[x["hair"]]
        raw_style = x.get("style", "")
        style_zh = i18n.PORTRAIT_STYLE[raw_style]
        if not raw_style:
            title_zh = f"{hair_zh}・标准款"
        elif hair_zh in style_zh:
            title_zh = style_zh
        else:
            title_zh = f"{hair_zh}・{style_zh}"
        thumb_rel = f"thumbs/portrait/{pid}.webp"
        full_rel = f"img/portrait/{pid}.webp"
        portrait_out.append({
            "id": pid,
            "分区": sec_zh,
            "发长": hair_zh,
            "发型名称": style_zh,
            "标题": title_zh,
            "宽": x["w"],
            "高": x["h"],
            "字节数": x.get("bytes", 0),
            "精选": bool(x.get("hero")),
            "热门": pid in rank_set,
            "缩略图": thumb_rel,
            "原图": full_rel,
            "检索": f"{pid} {sec_zh} {hair_zh} {style_zh}",
        })

    with open(os.path.join(DATA, "portrait-zh.json"), "w", encoding="utf-8") as f:
        json.dump(portrait_out, f, ensure_ascii=False, indent=1)

    with open(os.path.join(DATA, "portrait-meta-zh.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "total": len(portrait_out),
                "分区列表": [i18n.PORTRAIT_SECTION["face"], i18n.PORTRAIT_SECTION["styling"]],
                "发长列表": [i18n.PORTRAIT_HAIR[h] for h in ["ショート", "ミディアム", "セミロング", "ロング"]],
                "排行榜分类": [i18n.PORTRAIT_HAIR[c] for c in portrait_rank.get("cats", [])],
                "排行榜Top10": {
                    i18n.PORTRAIT_HAIR[k]: v for k, v in portrait_rank.get("top", {}).items()
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

# ==============================================================================
# 4. 导出双语对照表 translations.csv
# ==============================================================================
with open(os.path.join(DATA, "translations.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["字段", "原文", "中文译文", "出现次数"])
    for k in ["系統", "分類", "角度", "ポーズ名"]:
        field = {"系統": "系統", "分類": "分類", "角度": "アングル", "ポーズ名": "ポーズ名"}[k]
        cnt = Counter(x[field] for x in pose_data)
        for jp in sorted(pose_maps[field]):
            w.writerow([f"姿势:{k}", jp, pose_maps[field][jp], cnt[jp]])

    if costume_out:
        cat_cnt = Counter(x["カテゴリ"] for x in costume_data)
        for jp in sorted(i18n.COSTUME_CATEGORY):
            w.writerow(["服装:分类", jp, i18n.COSTUME_CATEGORY[jp], cat_cnt[jp]])
        word_cnt = Counter(w_tok for x in costume_data for w_tok in x["キーワード"].split())
        for en in sorted(i18n.COSTUME_WORD_ALL):
            w.writerow(["服装:词条", en, i18n.COSTUME_WORD_ALL[en], word_cnt[en]])

    if portrait_out:
        sec_cnt = Counter(x["section"] for x in portrait_data)
        for en in sorted(i18n.PORTRAIT_SECTION):
            w.writerow(["人像:分区", en, i18n.PORTRAIT_SECTION[en], sec_cnt[en]])
        hair_cnt = Counter(x["hair"] for x in portrait_data)
        for jp in sorted(i18n.PORTRAIT_HAIR):
            if jp in hair_cnt:
                w.writerow(["人像:发长", jp, i18n.PORTRAIT_HAIR[jp], hair_cnt[jp]])
        style_cnt = Counter(x.get("style", "") for x in portrait_data)
        for jp in sorted(i18n.PORTRAIT_STYLE):
            w.writerow(["人像:发型", jp or "(空/默认)", i18n.PORTRAIT_STYLE[jp], style_cnt[jp]])

print(f"OK 姿势记录数: {len(pose_out)}, 服装记录数: {len(costume_out)}, 人像记录数: {len(portrait_out)}")
print("OK 合计翻译记录数:", len(pose_out) + len(costume_out) + len(portrait_out))

