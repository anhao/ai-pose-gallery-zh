# `ai-pose-gallery-zh` 外部無審查 VLM 看圖重寫完整操作指南（Schema v2）

> **文件用途**：本文件專門交付給外部**無審查多模態語言模型（Uncensored VLM / Agent）**，用於重新看圖標註 `/Volumes/SSD/ai-pose-gallery-zh` 共 **1,777 筆姿勢資料**（`custom` 進階／NSFW／局部／多人／POV 庫 338 筆 ＋ `base` 基礎／雙人庫 1,439 筆）。
> 本機分片已經匯出就緒，直接照本文件的「輸入路徑 → 重寫規則 → SQLite 詞庫校驗 → 合併驗收指令」執行即可。

---

## 1. 為什麼要重寫？（Before vs After 真實對比）

雖然本機已用腳本（`--bootstrap-v2`）將舊資料切出 `base_tags_en` 與 `roles` 骨架，但目前分片內的舊標註仍有兩個嚴重問題，必須透過 **VLM 實際看圖重寫** 才真正可用：
1. **將英文句子硬當作 Tag**：例如 `shard_001.json` 的 `full_sexy_P001_front` 把 `"weight on straight right leg"`、`"right hip jutted out"`、`"left hand on top of head"` 塞進 `tags_en`；這些**不是標準 Danbooru 標籤**，NovelAI 無法辨識，應改為標準 Danbooru 詞（如 `contrapposto, hand on own hip, arm up, hand on own head, head tilt`），並把左右肢體細節放進 `natural_en` / `prompt_zh`。
2. **成人／雙人／多人／局部姿勢描述過於含糊或主詞混亂**：舊版受限模型迴避了明確的解剖與接觸標籤，或出現 `"girl ..."` / `"boy ..."` 等自造長句。

### Before（目前 `tool/.tmp/v2_shards_base/shard_001.json` 的真實問題條目）

```json
{
  "id": "full_sexy_P001_front",
  "base_tags_en": ["1girl", "full body", "front view"],
  "roles": [
    {
      "slot": "girl_1",
      "gender": "girl",
      "center": {"x": 0.5, "y": 0.5},
      "tags_en": [
        "facing viewer",
        "standing",
        "S-curve posture",
        "right hip jutted out",
        "right hand on right hip",
        "left arm raised",
        "left hand on top of head",
        "weight on straight right leg"
      ],
      "natural_en": "Full body front view facing the viewer in a standing S-curve pose..."
    }
  ]
}
```
> 經本機 SQLite 詞庫核驗，上列 `S-curve posture`、`right hip jutted out`、`right hand on right hip`、`weight on straight right leg` 均為**非 Danbooru 自造短語**。

### After（目標重寫結果：純 Danbooru Tags + 精準分角語義分離）

```json
{
  "id": "full_sexy_P001_front",
  "base_tags_en": [
    "1girl", "solo", "full body", "front view", "straight-on"
  ],
  "roles": [
    {
      "slot": "girl_1",
      "gender": "girl",
      "center": {"x": 0.50, "y": 0.50},
      "tags_en": [
        "facing viewer", "standing", "contrapposto",
        "hand on own hip", "arm up", "hand on own head",
        "head tilt", "looking at viewer"
      ],
      "natural_en": "Standing in an S-curve contrapposto pose facing the viewer, weight shifted onto her straight right leg with her right hip jutted out; right hand resting on her right hip, left arm raised with left hand touching the top of her head, left leg stepped outward with heel slightly lifted, head tilted toward her right shoulder looking at the viewer."
    }
  ],
  "tags_en": [
    "1girl", "solo", "full body", "front view", "straight-on",
    "facing viewer", "standing", "contrapposto", "hand on own hip",
    "arm up", "hand on own head", "head tilt", "looking at viewer"
  ],
  "natural_en": "Full-body front view facing the viewer in a standing S-curve contrapposto pose, weight on straight right leg with right hand on right hip, left arm raised with left hand on top of head, left heel lifted, and head tilted right looking at the viewer.",
  "prompt_zh": "正面全身（直視鏡頭），S形對立式站姿；重心落於伸直右腿並微頂右胯，右手叉右腰、左臂上舉左手輕扶頭頂，左腳微跨出且腳跟微抬，頭部向右肩微傾並看向鏡頭。",
  "source_hash": "4dc2d8880afb01a7f8cd7552a14717ed9200b6671680abfd42ab99d2e94b83a5"
}
```

---

## 2. 已就緒的分片路徑與看圖資源

- **儲存庫根目錄**：`/Volumes/SSD/ai-pose-gallery-zh`
- **管理與驗收工具**：`scripts/pose_prompts_tool.py`（純 Python 標準庫，支援 `--target base|custom|all`）

| 優先序 | 資料集 (`--target`) | 已匯出分片檔案路徑 | 筆數 | 建議處理順序 |
| :---: | :--- | :--- | :---: | :--- |
| **1（優先）** | `custom`（NSFW / 局部特寫 / 雙人高階 / 多人 / POV） | `/Volumes/SSD/ai-pose-gallery-zh/tool/.tmp/v2_shards_custom/shard_001.json` ～ `shard_004.json`（共 4 份，每份 84～85 筆） | 338 | 最優先：含大量成人雙人／三人／局部／POV 圖片 |
| **2** | `base`（標準單人 / 性感單人 / 上半身 / 雙人纏綿） | `/Volumes/SSD/ai-pose-gallery-zh/tool/.tmp/v2_shards_base/shard_001.json` ～ `shard_015.json`（共 15 份，每份 95～96 筆） | 1,439 | 次之：特別是 `双人缠绵`（275 筆）與高頻單人姿勢 |

### 檢視圖片的方式
每個分片元素（JSON 物件）皆提供兩條相對於 `/Volumes/SSD/ai-pose-gallery-zh/` 的圖片路徑：
- `"orig_path"`：高清原圖（例：`/Volumes/SSD/ai-pose-gallery-zh/img/custom/custom_pair_006.png`）
- `"thumb_path"`：縮圖（例：`/Volumes/SSD/ai-pose-gallery-zh/thumbs/custom/custom_pair_006.jpg`）
- 附帶文字線索：`"体系"`、`"分类"`、`"姿势名称"`、`"角度"`。
> **強制要求**：VLM 必須實際讀取圖片像素進行視覺判斷，不可只改寫舊文本。

---

## 3. Schema v2 欄位規範與 NAI V4.5 / V5 分欄鐵律

每筆重寫結果必須維持原本分片中的 JSON Object 格式，並輸出以下欄位：

### 3.1 必填欄位結構
1. **`id`** (`str`)：原樣保留。
2. **`source_hash`** (`str`)：必須**原字元保留**，不可更改（`--merge` 會比對原始 SHA-256）。
3. **`base_tags_en`** (`list[str]`, 非空)：只寫入會進 NAI **`base_prompt`** 的全局標籤：
   - **人數與組合**：`1girl`, `2girls`, `3girls`, `1boy`, `2boys`, `1other`, `2others`, `solo`, `hetero`, `yuri`, `yaoi`, `couple`, `ffm threesome`, `mmf threesome`, `threesome`。
   - **景別與局部焦點**：`full body`, `cowboy shot`, `upper body`, `lower body`, `portrait`, `close-up`, `foot focus`, `ass focus`, `breast focus`。
   - **攝影機視角與透視**：`front view`, `side view`, `from side`, `three-quarter view`, `from behind`, `from above`, `from below`, `straight-on`, `profile`, `high angle`, `low angle`, `dutch angle`, `fisheye`, `foreshortening`, `pov`, `pov hands`, `pov crotch`。
   - **雙人／多人／道具／非人共用互動與體位總稱**：`facing another`, `face-to-face`, `eye contact`, `hugging`, `hug from behind`, `straddling`, `girl on top`, `cowgirl position`, `reverse cowgirl`, `missionary`, `doggystyle`, `sex from behind`, `spooning`, `fellatio`, `paizuri`, `footjob`, `handjob`, `double penetration`, `spitroast`，以及道具／束縛／純觸手標籤（如 `vibrator`, `dildo`, `sex toy`, `rope`, `bondage`, `bound`, `tentacles`, `tentacle sex`）等標準詞。
4. **`roles`** (`list[object]`, 非空)：對應 NAI **`v4_prompt.caption.char_captions`**：
   - **排序**：所有女性角色（`girl_1`, `girl_2`...）**永遠排在最前**，男性角色（`boy_1`, `boy_2`...）居中，非人／動物／魔物角色（`other_1`, `other_2`...）**排在最後**，不可跳號。
   - 每個角色物件必須包含：
     - **`slot`**：`"girl_1"`, `"girl_2"`, `"boy_1"`, `"boy_2"`, `"other_1"`, `"other_2"` 等；
     - **`gender`**：只能是 `"girl"`、`"boy"` 或 `"other"`（`"other"` 僅用於獨立互動的動物／魔物／非人角色）；
     - **`center`**：`{"x": float, "y": float}`（範圍 `0.00`～`1.00`，代表畫面中該角色軀幹質心位置；單人圖為 `{"x": 0.50, "y": 0.50}`，左/右人物約 `x: 0.30~0.42` 與 `x: 0.58~0.70`）；
     - **`tags_en`**：**純標準 Danbooru 動作／姿勢／重心／視線標籤**（嚴禁帶角色主詞前綴！具體肢體細節請寫到 `natural_en`）；
     - **`natural_en`**：專屬於該角色的詳細英文身體姿態句（在此寫清楚左右手腳、肌肉張力、重心腿、接觸點）。
5. **向下相容頂層欄位**：
   - **`tags_en`** (`list[str]`, 非空)：由 `base_tags_en` ＋ 各角色核心 Danbooru 動作詞去重合併而成。
   - **`natural_en`** (`str`, 非空)：全體人物互動、體位結構與重心關係的完整英文自然語言描述。
   - **`prompt_zh`** (`str`, 非空)：精準繁體（或簡體，建議簡明直觀）中文動作描述。

### 3.2 `roles` 的 4 條紅線（`--verify` 會程式阻斷）
1. **人數一致性**：除非是 POV 或單純觸手／道具無須建 role 的畫面，否則當 `base_tags_en` 標記 `1girl, 1boy` 時，`roles` 必須正好有 1 個 `girl` 與 1 個 `boy`；標記 `2girls, 1boy` 時必須有 2 個 `girl` 與 1 個 `boy`；標記 `1girl, 1other` 或 `1girl, 2others` 時必須對應建立 1 個或 2 個 `gender: "other"`（`other_1`, `other_2`）角色。
2. **人＋道具 vs 人＋非人角色區分規則**：
   - **人＋道具（不建 `other` role）**：震動棒（`vibrator`）、假陽具（`dildo`）、繩索（`rope` / `bondage`）或純背景伸出的觸手（未具獨立完整角色主體時）屬於道具／環境元素，**直接寫進 `base_tags_en` 或受方（如 `girl_1`）動作詞**（例：`using dildo`, `holding vibrator`, `arms bound`），**不得**為道具建立 `role`。
   - **人＋動物／魔物／非人主體（使用 `gender: "other"`）**：當畫面存在獨立互動的非人角色（如魔物、獸類、具主體性的觸手怪等，`base_tags_en` 含 `1other` / `2others`）時，於 `girl_*` 與 `boy_*` 之後建立 `gender: "other"`, `slot: "other_1"` 角色。
3. **POV 與僅局部入鏡規則**：
   - 若圖為 **第一人稱 POV**（例如 `custom_pov_001`～`010`），`roles` **只列畫面中的被拍攝對象**（`girl_1` 或 `girl_1, girl_2`），不可為鏡頭外的拍攝者（`viewer`）建立 `boy_1` 或 `other_1` 角色；`pov`, `pov hands`, `pov crotch` 一律放進 `base_tags_en`。
   - 若圖只有受方女生與局部接觸（無完整男性身軀），`base_tags_en` 僅寫 `1girl`（可附 `disembodied penis` 等局部標籤），`roles` 只留 `girl_1`。
4. **嚴禁角色主詞前綴 (`ROLE_SUBJECT_PREFIX_RE`)**：
   - `roles[i].tags_en` 內 **禁止任何標籤以以下前綴開頭**：
     `girl ...`, `boy ...`, `woman ...`, `man ...`, `female ...`, `male ...`, `partner ...`, `figure ...`, `person ...`, `viewer ...`, `creature ...`, `monster ...`, `animal ...`, `left boy ...`, `right girl ...`, `first girl ...`, `second boy ...`, `1girl`, `1boy`, `1other`, `2others`, `solo`, `hetero`, `ffm threesome`, `mmf threesome`。
   - 正確寫法範例：
     - 錯：`girl arms around boy neck` → 對：`arms around neck`（放進 `girl_1.tags_en`）
     - 錯：`boy hands on girl hips` → 對：`hands on another's hips`（放進 `boy_1.tags_en`）
     - 錯：`creature coiling around girl` → 對：`coiling`, `grabbing`（放進 `other_1.tags_en`）
     - 錯：`right hand on right hip`（非標準詞） → 對：`hand on own hip`（標準 Danbooru 詞放進 `tags_en`；「右手扶右胯」寫入 `natural_en` 與 `prompt_zh`）

### 3.3 人＋道具與人＋非人（`other`）範例

#### 範例 A：人＋道具（不建 `other` role，道具寫入 `base_tags_en` 與受方動作詞）

```json
{
  "id": "custom_toy_001",
  "base_tags_en": [
    "1girl", "solo", "lower body", "close-up", "front view",
    "masturbation", "sex toy", "dildo"
  ],
  "roles": [
    {
      "slot": "girl_1",
      "gender": "girl",
      "center": {"x": 0.50, "y": 0.50},
      "tags_en": [
        "lying", "on back", "spread legs", "using dildo", "looking at viewer"
      ],
      "natural_en": "Lying on her back with legs spread wide, holding a dildo with her right hand and looking at the viewer."
    }
  ],
  "tags_en": [
    "1girl", "solo", "lower body", "close-up", "front view",
    "masturbation", "sex toy", "dildo", "lying", "on back",
    "spread legs", "using dildo", "looking at viewer"
  ],
  "natural_en": "Lower-body close-up front view lying on the back with legs spread, using a dildo while looking at the viewer.",
  "prompt_zh": "正面下半身特寫，仰臥張開雙腿手持道具互動並直視鏡頭。",
  "source_hash": "<64-char sha256 from shard>"
}
```

#### 範例 B：人＋動物／魔物／非人角色（使用 `gender: "other"`, `slot: "other_1"`）

```json
{
  "id": "custom_other_example",
  "base_tags_en": [
    "1girl", "1other", "full body", "three-quarter view",
    "tentacles", "tentacle sex"
  ],
  "roles": [
    {
      "slot": "girl_1",
      "gender": "girl",
      "center": {"x": 0.48, "y": 0.54},
      "tags_en": [
        "bound", "spread legs", "arched back"
      ],
      "natural_en": "Bound mid-air with legs spread and back arched."
    },
    {
      "slot": "other_1",
      "gender": "other",
      "center": {"x": 0.62, "y": 0.50},
      "tags_en": [
        "tentacles", "coiling", "grabbing"
      ],
      "natural_en": "Non-human tentacled creature coiling around her torso and grabbing her thighs."
    }
  ],
  "tags_en": [
    "1girl", "1other", "full body", "three-quarter view",
    "tentacles", "tentacle sex", "bound", "spread legs",
    "arched back", "coiling", "grabbing"
  ],
  "natural_en": "Three-quarter full-body view of a girl restrained by a tentacled creature coiling around her torso and legs.",
  "prompt_zh": "斜側全身，女性後仰張腿受縛，右側非人觸手主體纏繞其腰腿。",
  "source_hash": "<64-char sha256 from shard>"
}
```

---

## 4. 本地 Danbooru 詞庫事實來源與自動查驗腳本

本機同時具備兩個完整 SQLite Danbooru 標籤資料庫，寫入 `base_tags_en` 與 `roles[i].tags_en` 的英文 Tag（將空白與連字規則對齊後）應能在下列兩庫之一命中（優先挑選 `category = 0` 且 `post_count >= 100`）：
1. **完整標籤目錄**：`/Volumes/SSD/factory-launcher/assets/databases/tag_catalog.db`（`tags` 表與 `aliases` 別名表，含 `front_view`, `side_view`, `three-quarter_view` 等視角詞）
2. **漢化熱度詞庫**：`/Users/newttp/Library/Application Support/com.llpgf.factoryLauncher/autocomplete/ffdkj/tag.sqlite`（`tags` 表含 `cn_name` 中文譯名與 `post_count`）

### 高頻易錯 Tag 對照速查表

| 常見自造／非標準寫法 ❌ | 標準 Danbooru 標籤 ✅（已在上述兩庫實測驗證） |
| :--- | :--- |
| `hand on hip`, `right hand on right hip` | `hand on own hip` / `hands on own hips` |
| `hand on top of head`, `left hand on head` | `hand on own head`（自己頭）/ `hand on another's head`（對方頭） |
| `boy hands on girl hips`, `holding hips` | `hands on another's hips` / `hand on another's hip` / `holding another's waist` |
| `facing each other`, `looking at partner` | `face-to-face`, `facing another`, `eye contact`, `looking at another` |
| `S-curve posture`, `weight on straight leg` | `contrapposto`, `standing on one leg`（左右重心細節寫入 `natural_en`） |
| `sitting with legs to the side` / `on heels` / `hands and knees` | `wariza` / `seiza` / `all fours` |
| `back view`, `2people` | `from behind`（背面）/ `1girl, 1boy, hetero, couple`（雙人） |

### 附：分片 Tag 詞庫命中率自檢腳本（Python）

外部 VLM 處理完任何一個分片檔後，可直接執行此腳本檢查是否有自造非標準 Tag：

```bash
python3 - <<'PY'
import json, sqlite3, sys

SHARD = "/Volumes/SSD/ai-pose-gallery-zh/tool/.tmp/v2_shards_custom/shard_001.json"
c_cat = sqlite3.connect("/Volumes/SSD/factory-launcher/assets/databases/tag_catalog.db")
c_zh = sqlite3.connect("/Users/newttp/Library/Application Support/com.llpgf.factoryLauncher/autocomplete/ffdkj/tag.sqlite")

known = {r[0].lower() for r in c_cat.execute("SELECT name FROM tags")}
known |= {r[0].lower() for r in c_cat.execute("SELECT alias FROM aliases")}
known |= {r[0].lower() for r in c_zh.execute("SELECT name FROM tags")}

data = json.loads(open(SHARD, encoding="utf-8").read())
unknown = {}
for item in data:
    tags = list(item.get("base_tags_en", []))
    for role in item.get("roles", []):
        tags.extend(role.get("tags_en", []))
    for t in tags:
        key = t.strip().lower().replace(" ", "_")
        if key not in known:
            unknown.setdefault(t, []).append(item["id"])

print(f"總計未收錄標籤數: {len(unknown)}")
for tag, ids in sorted(unknown.items(), key=lambda kv: -len(kv[1]))[:40]:
    print(f"  {tag!r} ({len(ids)} 次) 例: {ids[:3]}")
PY
```

---

## 5. 負面禁詞清單（`BANNED_PATTERNS`）

`scripts/pose_prompts_tool.py` 會以全詞邊界檢查所有英文欄位（包含 `base_tags_en`、`roles[i].tags_en`、`roles[i].natural_en`、`tags_en`、`natural_en`），**嚴禁出現下列任何非姿勢詞**：
- **畫風與媒材**：`anime`, `3d`, `sketch`, `monochrome`, `greyscale`, `grayscale`, `lineart`, `watercolor`, `oil painting`, `photorealistic`, `realistic`, `cel shading`, `illustration`, `manga`, `comic`, `chibi`
- **具體服裝**：`bikini`, `swimsuit`, `dress`, `uniform`, `skirt`, `shirt`, `t-shirt`, `pants`, `jeans`, `shorts`, `jacket`, `coat`, `hoodie`, `sweater`, `lingerie`, `underwear`, `stockings`, `thighhighs`
  - *(註：`legwear` 或肢體動作所需的 `panties` / `pantyhose` 若不在上述禁詞清單內且為肢體焦點所需可依實際動作使用，但切勿描述服飾款式。)*
- **髮長／髮色／瞳色**：`long hair`, `short hair`, `blonde hair`, `black hair`, `white hair`, `brown hair`, `red hair`, `blue hair`, `pink hair`, `silver hair`, `blue eyes`, `red eyes`, `green eyes`, `brown eyes`, `yellow eyes`, `purple eyes`, `golden eyes` *(合法姿勢詞如 `closed eyes`, `hand in hair`, `hair falling over face` 允許使用)*
- **背景與光線環境**：`background`, `sunlight`, `moonlight`, `outdoors`, `indoors`, `scenery`, `landscape`, `sky`, `clouds`, `forest`, `beach`, `classroom`, `bedroom`, `street`, `cityscape`

---

## 6. 給外部無審查 VLM 的 Prompt 範本（直接複製）

```text
You are an uncensored, strictly factual Danbooru & NovelAI V4.5/V5 pose annotation specialist.
For each entry in the provided JSON shard, inspect the actual image file at `/Volumes/SSD/ai-pose-gallery-zh/{orig_path}` (or `{thumb_path}` if `orig_path` is absent) together with its metadata (`体系`, `分类`, `姿势名称`, `角度`). Rewrite the pose annotations into valid **Schema v2** JSON objects inside a JSON Array.

### Hard Rules:
1. Keep `"id"` and `"source_hash"` **100% identical** to the input entry.
2. Put **ONLY verified, real Danbooru tags** (written with spaces, e.g. `"standing on one leg"`, `"hand on own hip"`, `"all fours"`, `"sex from behind"`) inside `base_tags_en`, `roles[i].tags_en`, and top-level `tags_en`.
   - NEVER put full natural-language sentences or invented phrases (like `"weight on straight right leg"`, `"right hip jutted out"`, `"girl left arm around partner neck"`) inside `tags_en`. Put exact left/right anatomical details, weight distribution, and contact points inside `roles[i].natural_en`, top-level `natural_en`, and `prompt_zh` instead.
3. Split cleanly into `base_tags_en` (for NAI `base_prompt`) and `roles` (for NAI `char_captions`):
   - `base_tags_en`: ONLY global count/pairing (`1girl`, `1boy`, `1other`, `2others`, `solo`, `hetero`, `yuri`, `couple`, `ffm threesome`, `mmf threesome`), framing/focus (`full body`, `cowboy shot`, `upper body`, `lower body`, `close-up`, `foot focus`, `breast focus`, `ass focus`), camera/POV (`front view`, `side view`, `from side`, `three-quarter view`, `from behind`, `from above`, `from below`, `high angle`, `low angle`, `dutch angle`, `fisheye`, `foreshortening`, `pov`, `pov hands`, `pov crotch`), props/restraints/tentacles (`vibrator`, `dildo`, `sex toy`, `rope`, `bondage`, `tentacles`, `tentacle sex`), and shared multi-character interaction/position tags (`face-to-face`, `facing another`, `eye contact`, `hugging`, `hug from behind`, `straddling`, `cowgirl position`, `reverse cowgirl`, `missionary`, `doggystyle`, `sex from behind`, `spooning`, `fellatio`, `paizuri`, `footjob`, `handjob`, `double penetration`, `spitroast`).
   - `roles`: list every visible character with females first (`girl_1`, `girl_2`, ...), males next (`boy_1`, `boy_2`, ...), and non-human/animal/monster entities last (`other_1`, `other_2`, ..., `gender: "other"`). Each role object has:
     `{"slot": "girl_1", "gender": "girl"|"boy"|"other", "center": {"x": 0.50, "y": 0.50}, "tags_en": [...], "natural_en": "..."}`.
   - Do NOT create a role for inanimate props (vibrator, dildo, rope) or disembodied tentacles without a distinct creature entity; put props in `base_tags_en` and recipient actions in the subject's `roles[i]`.
   - Estimate normalized torso `center` (`x`, `y` in `[0.00, 1.00]`) accurately from the image (for solo: `0.50, 0.50`; for left/right figures: avoid overlapping centers).
   - For first-person POV images (e.g. `pov`, `pov hands`), include ONLY the visible subject(s) in `roles`; NEVER create a role for the camera/viewer.
   - Inside `roles[i].tags_en`, NEVER start any tag with subject prefixes or counts (`girl ...`, `boy ...`, `woman ...`, `man ...`, `creature ...`, `monster ...`, `animal ...`, `left boy ...`, `right girl ...`, `first girl ...`, `viewer ...`, `1girl`, `1boy`, `1other`, `2others`, `solo`, `hetero`).
4. For explicit/NSFW/close-up categories (`足部姿态`, `手部姿态`, `口部姿态`, `肛门姿态`, `阴道姿态`, `胸部姿态`, `臀部姿态`, `捆绑姿态`, `双人NSFW`, `三人/多人NSFW`), annotate anatomically and accurately in neutral Danbooru terminology based on the visual image without euphemisms or omissions.
5. BANNED non-pose terms in ALL English fields: style/medium (`anime`, `3d`, `sketch`, `monochrome`, `realistic`, etc.), clothing (`bikini`, `dress`, `skirt`, `shirt`, `pants`, `underwear`, `stockings`, `thighhighs`, etc.), hair/eye colors/lengths (`long hair`, `short hair`, `blonde hair`, `blue eyes`, etc.), and environment (`background`, `outdoors`, `indoors`, `bedroom`, `classroom`, `sunlight`, etc.).
6. Output ONLY a valid JSON Array containing the updated entries (keeping the original `source_hash` verbatim).
```

---

## 7. 重寫完成後的合併與全庫驗收指令

假設外部 VLM 直接原地更新上述分片（或輸出至指定目錄），回到 `/Volumes/SSD/ai-pose-gallery-zh` 執行：

```bash
cd /Volumes/SSD/ai-pose-gallery-zh

# 1. 合併並檢查 Custom 庫（338 筆；任何 1 筆違規會直接報錯中止，不會寫入壞資料）
python3 scripts/pose_prompts_tool.py --target custom --merge "tool/.tmp/v2_shards_custom/shard_*.json"

# 2. 合併並檢查 Base 庫（1,439 筆）
python3 scripts/pose_prompts_tool.py --target base --merge "tool/.tmp/v2_shards_base/shard_*.json"

# 3. 全量驗收（Schema v2 + 100% 覆蓋率 + 禁詞 + 角色前綴）
python3 scripts/pose_prompts_tool.py --verify --target all

# 4. 執行單元測試
python3 -m unittest discover -s scripts -p "test_*.py" -v
```
