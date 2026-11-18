#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Manage Schema v2 pose prompt annotations for base and custom pose datasets.

Pure Python stdlib tool (zero network/LLM calls) supporting:
  --status [--target base|custom|all]
  --export-shards <num_shards> --out-dir <dir> [--target base|custom] [--all]
  --merge <file_or_glob...> [--target base|custom]
  --verify [--target base|custom|all]
  --bootstrap-v2 [--target base|custom|all] [--force]
"""

from __future__ import annotations

import argparse
import copy
import datetime
import glob
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_POSE_PATH = REPO_ROOT / "data" / "pose-zh.json"
DEFAULT_PROMPTS_PATH = REPO_ROOT / "data" / "pose-prompts-zh.json"
DEFAULT_CUSTOM_PATH = REPO_ROOT / "data" / "pose-custom-zh.json"

SCHEMA_VERSION = 2
DEFAULT_GENERATOR = "gemini-4-hydrogen-session"

# Banned non-pose words/phrases (style, clothing, appearance, background/lighting leaks).
# Checked with case-insensitive word-boundary matching so legitimate pose words
# (e.g. "closed eyes", "hand in hair", "3/4 view", "address") are allowed.
BANNED_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (term, re.compile(rf"(?<!\w){re.escape(term)}(?!\w)", re.IGNORECASE))
    for term in [
        # Style / medium
        "anime",
        "3d",
        "sketch",
        "monochrome",
        "greyscale",
        "grayscale",
        "lineart",
        "watercolor",
        "oil painting",
        "photorealistic",
        "realistic",
        "cel shading",
        "illustration",
        "manga",
        "comic",
        "chibi",
        # Clothing
        "bikini",
        "swimsuit",
        "dress",
        "uniform",
        "skirt",
        "shirt",
        "t-shirt",
        "pants",
        "jeans",
        "shorts",
        "jacket",
        "coat",
        "hoodie",
        "sweater",
        "lingerie",
        "underwear",
        "stockings",
        "thighhighs",
        # Hair / eye color appearance leaks
        "long hair",
        "short hair",
        "blonde hair",
        "black hair",
        "white hair",
        "brown hair",
        "red hair",
        "blue hair",
        "pink hair",
        "silver hair",
        "blue eyes",
        "red eyes",
        "green eyes",
        "brown eyes",
        "yellow eyes",
        "purple eyes",
        "golden eyes",
        # Background / lighting / environment
        "background",
        "sunlight",
        "moonlight",
        "outdoors",
        "indoors",
        "scenery",
        "landscape",
        "sky",
        "clouds",
        "forest",
        "beach",
        "classroom",
        "bedroom",
        "street",
        "cityscape",
    ]
]

# Subject-prefixed / count phrases forbidden inside roles[i].tags_en.
ROLE_SUBJECT_PREFIX_RE = re.compile(
    r"^(?:"
    r"(?:(?:left|right|center|centre|middle|front|rear|back|top|bottom|upper|lower|"
    r"first|second|third|fourth|1st|2nd|3rd|4th|other|another|both|each|all)\s+)?"
    r"(?:girl|girls|boy|boys|woman|women|man|men|female|male|partner|figure|figures|"
    r"person|people|viewer|creature|creatures|monster|monsters|animal|animals)"
    r"(?:'s|s')?\b"
    r"|(?:(?:left|right|first|second|third|fourth|1st|2nd|3rd|4th)\s+)?other(?:'s|s')?\b"
    r"|(?:\d+\s*(?:girl|girls|boy|boys|people|person|other|others))\b"
    r"|(?:solo|solo\s+focus|multiple\s+girls|multiple\s+boys|multiple\s+others|couple|hetero|yuri|yaoi|"
    r"ffm\s+threesome|mmf\s+threesome|threesome|group)\b"
    r")",
    re.IGNORECASE,
)

# Leading prefix stripped from role-owned tags during --bootstrap-v2.
_STRIP_ROLE_PREFIX_RE = re.compile(
    r"^(?:(?:(?:left|right|center|centre|middle|front|rear|back|top|bottom|upper|lower|"
    r"first|second|third|fourth|1st|2nd|3rd|4th|other|another|both|each|all)\s+)?"
    r"(?:girl|girls|boy|boys|woman|women|man|men|female|male|partner|figure|figures|"
    r"creature|creatures|monster|monsters|animal|animals)"
    r"(?:\s+figure)?(?:'s|s')?\s+)+",
    re.IGNORECASE,
)

_COUNT_TOKEN_RE = re.compile(
    r"^(\d+)(girl|girls|boy|boys|people|person|other|others)$", re.IGNORECASE
)

_SPATIAL_STUB_RE = re.compile(
    r"^(?:(?:in|at|on)\s+)?(?:the\s+)?(?:left|right|center|centre|middle|"
    r"center-left|center-right|top-left|top-right|bottom-left|bottom-right|"
    r"front|behind|back|top|bottom|above|below|sideways|side)$",
    re.IGNORECASE,
)

_PLURAL_GIRLS_PREFIX_RE = re.compile(r"^(?:both\s+)?girls(?:'s|s')?\s+", re.IGNORECASE)
_PLURAL_BOYS_PREFIX_RE = re.compile(r"^(?:both\s+)?boys(?:'s|s')?\s+", re.IGNORECASE)

_EXPLICIT_ROLE_PREFIX_RE = re.compile(
    r"^(?P<mod>left|right|center|centre|middle|front|rear|back|top|bottom|upper|lower|"
    r"first|second|third|fourth|1st|2nd|3rd|4th|other|another|both)?\s*"
    r"(?P<noun>girl|girls|boy|boys|woman|women|man|men|female|male|figure|figures|viewer|"
    r"creature|creatures|monster|monsters|animal|animals)\b",
    re.IGNORECASE,
)

# Exact-match global tags belonging in base_tags_en.
_BASE_EXACT_TAGS: set[str] = {
    # Counts & composition
    "solo",
    "solo focus",
    "1person",
    "1girl",
    "2girls",
    "3girls",
    "4girls",
    "1boy",
    "2boys",
    "3boys",
    "4boys",
    "1other",
    "2others",
    "3others",
    "2people",
    "3people",
    "4people",
    "multiple girls",
    "multiple boys",
    "multiple others",
    "couple",
    "hetero",
    "yuri",
    "yaoi",
    "ffm threesome",
    "mmf threesome",
    "threesome",
    "group",
    # Framing & focus
    "full body",
    "three-quarter length",
    "cowboy shot",
    "upper body",
    "lower body",
    "portrait",
    "bust shot",
    "close-up",
    "extreme close-up",
    "wide shot",
    "cropped",
    "foot focus",
    "ass focus",
    "breast focus",
    "pussy focus",
    "anus focus",
    "mouth focus",
    "hand focus",
    "armpit focus",
    "face focus",
    "eyes focus",
    # Camera angle & perspective
    "front view",
    "side view",
    "profile",
    "three-quarter view",
    "back view",
    "from behind",
    "from above",
    "from below",
    "from side",
    "high angle",
    "low angle",
    "straight-on",
    "eye-level",
    "bird's-eye view",
    "worm's-eye view",
    "dutch angle",
    "fisheye",
    "foreshortening",
    "extreme foreshortening",
    "perspective",
    "depth of field",
    "foreground",
    "pov",
    "pov hands",
    "pov crotch",
    # Mutual / scene-level interactions & sexual/act tags
    "facing each other",
    "face to face",
    "face-to-face",
    "looking at each other",
    "back-to-back",
    "back-to-chest",
    "head-to-head",
    "forehead-to-forehead",
    "foreheads touching",
    "heads close",
    "girls faces close",
    "intertwined legs",
    "legs entangled",
    "intertwined arms",
    "intertwined fingers",
    "hands holding hands",
    "holding hands",
    "arms wrapped around each other",
    "hands on each other's waist",
    "hands touching",
    "hugging",
    "hugging from behind",
    "spooning",
    "carrying",
    "straddling",
    "reverse straddling",
    "reversed orientation",
    "69 position",
    "circle formation",
    "kneeling in a row",
    "sex",
    "vaginal",
    "anal",
    "oral",
    "fellatio",
    "blowjob",
    "irrumatio",
    "deepthroat",
    "footjob",
    "handjob",
    "paizuri",
    "titjob",
    "thighjob",
    "sumata",
    "cunnilingus",
    "anilingus",
    "rimming",
    "fingering",
    "fisting",
    "masturbation",
    "penetration",
    "double penetration",
    "spitroast",
    "missionary",
    "missionary position",
    "doggystyle",
    "cowgirl position",
    "reverse cowgirl",
    "sex from behind",
    "standing sex",
    "suspended congress",
    "girl on top",
    "boy on top",
    "cooperative footjob",
    "cooperative fellatio",
    "cooperative paizuri",
    "double handjob",
    "penis",
    "erection",
    "ejaculation",
    "cum",
    "precum",
    "saliva",
    "saliva trail",
    "bondage",
    "bound",
    "rope",
    "shibari",
    "crotch rope",
    "ball gag",
    "vibrator",
    "egg vibrator",
    "dildo",
    "double dildo",
    "sex toy",
    "toy",
    "tentacles",
    "tentacle sex",
    "monster",
    "animal",
    "creature",
    "dancing",
}

_BOTH_GIRLS_BASE_TAGS: set[str] = {
    "girls faces close",
}

# Target-noun replacement rules inside stripped role tags so phrases remain valid
# role-agnostic Danbooru tags without embedded gendered nouns.
_EMBEDDED_TARGET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"\baround\s+(?:both\s+|left\s+|right\s+|first\s+|second\s+|third\s+)?"
            r"(?:girl|girls|boy|boys|woman|man|female|male|partner|creature|creatures|monster|monsters|animal|animals)(?:'s|s')?\s+"
            r"(neck|waist|shoulders?|hips?|chest)\b",
            re.IGNORECASE,
        ),
        r"around \1",
    ),
    (
        re.compile(
            r"\b(?:beside|behind|against|over|under|between|toward|towards|into|on)\s+"
            r"(?:both\s+|left\s+|right\s+|first\s+|second\s+|third\s+)?"
            r"(?:girl|girls|boy|boys|woman|man|female|male|partner|creature|creatures|monster|monsters|animal|animals)(?:'s|s')?\s+"
            r"(?=(?:neck|waist|shoulders?|hips?|chest|thighs?|legs?|knees?|ankles?|calves?|head|heads|chin|face|back|stomach|hands?|wrists?|arms?|eyes?)\b)",
            re.IGNORECASE,
        ),
        "on another's ",
    ),
    (
        re.compile(
            r"\b(holding|gripping|grabbing|hugging|lifting|caressing|touching|supporting|kissing|licking)\s+"
            r"(?:both\s+|left\s+|right\s+|first\s+|second\s+|third\s+)?"
            r"(?:girl|girls|boy|boys|woman|man|female|male|partner|creature|creatures|monster|monsters|animal|animals)(?:'s|s')?\s+",
            re.IGNORECASE,
        ),
        r"\1 another's ",
    ),
    (
        re.compile(
            r"\b(facing|straddling|against|behind|beside|hugging|kissing|looking at)\s+"
            r"(?:both\s+|left\s+|right\s+|first\s+|second\s+|third\s+)?"
            r"(?:girl|girls|boy|boys|woman|man|female|male|partner|creature|creatures|monster|monsters|animal|animals)s?(?:'s|s')?\b",
            re.IGNORECASE,
        ),
        r"\1 another",
    ),
    (
        re.compile(
            r"\b(?:girl|boy|woman|man|female|male|partner|creature|monster|animal)(?:'s|s')\b",
            re.IGNORECASE,
        ),
        "another's",
    ),
]


def utc_now_iso() -> str:
    """Return the current UTC timestamp in ISO-8601 Z format."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def compute_source_hash(entry: dict[str, Any]) -> str:
    """Compute a deterministic SHA-256 hash over immutable source metadata fields."""
    payload = {
        "id": entry.get("id", ""),
        "体系": entry.get("体系", ""),
        "分类": entry.get("分类", ""),
        "姿势名称": entry.get("姿势名称", ""),
        "角度": entry.get("角度", ""),
        "缩略图": entry.get("缩略图", ""),
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _dedup_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in items:
        clean = raw.strip()
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            out.append(clean)
    return out


def load_pose_source(pose_path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Load a list-structured pose catalog (pose-zh.json or pose-custom-zh.json)."""
    if not pose_path.exists():
        raise FileNotFoundError(f"Source pose file not found: {pose_path}")
    with pose_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON list in {pose_path}, got {type(data).__name__}")
    by_id: dict[str, dict[str, Any]] = {}
    for entry in data:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or not entry["id"]:
            raise ValueError(f"Invalid entry in {pose_path}: {entry!r}")
        eid = entry["id"]
        if eid in by_id:
            raise ValueError(f"Duplicate id in {pose_path}: {eid}")
        by_id[eid] = entry
    return data, by_id


def default_prompts_doc() -> dict[str, Any]:
    """Return an empty Schema v2 pose-prompts document."""
    return {
        "_meta": {
            "schema_version": SCHEMA_VERSION,
            "generator": DEFAULT_GENERATOR,
            "updated_at": utc_now_iso(),
        },
        "items": {},
    }


def load_prompts_doc(prompts_path: Path) -> dict[str, Any]:
    """Load an existing pose-prompts document or initialize a Schema v2 default."""
    if not prompts_path.exists():
        return default_prompts_doc()
    with prompts_path.open("r", encoding="utf-8") as f:
        doc = json.load(f)
    if not isinstance(doc, dict):
        raise ValueError(f"Expected JSON object in {prompts_path}")
    if "_meta" not in doc or not isinstance(doc["_meta"], dict):
        raise ValueError(f"Missing or invalid '_meta' in {prompts_path}")
    if "items" not in doc or not isinstance(doc["items"], dict):
        raise ValueError(f"Missing or invalid 'items' in {prompts_path}")
    return doc


def atomic_write_json(path: Path, data: Any) -> None:
    """Atomically write JSON with UTF-8 encoding and trailing newline."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.parent / f".{path.name}.tmp.{os.getpid()}"
    try:
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


def find_banned_words(text: str) -> list[str]:
    """Return any banned non-pose words matched inside text."""
    hits: list[str] = []
    for term, pattern in BANNED_PATTERNS:
        if pattern.search(text):
            hits.append(term)
    return hits


def has_forbidden_role_prefix(tag: str) -> bool:
    """Return True if a role tag starts with a forbidden subject or count prefix."""
    return bool(ROLE_SUBJECT_PREFIX_RE.match(tag.strip()))


def _clean_string_list(
    raw: Any,
    item_id: str,
    field_name: str,
    errors: list[str],
) -> list[str]:
    if not isinstance(raw, list) or not raw:
        errors.append(f"[{item_id}] '{field_name}' must be a non-empty list of strings")
        return []
    cleaned: list[str] = []
    for idx, val in enumerate(raw):
        if not isinstance(val, str) or not val.strip():
            errors.append(f"[{item_id}] '{field_name}[{idx}]' must be a non-empty string")
        else:
            cleaned.append(val.strip())
    if not cleaned and not errors:
        errors.append(f"[{item_id}] '{field_name}' has no valid tags")
    return cleaned


def _parse_base_counts(base_tags: list[str]) -> tuple[int, int, int, int, bool]:
    n_girls = 0
    n_boys = 0
    n_others = 0
    n_people = 0
    is_pov = False
    for tag in base_tags:
        low = tag.strip().lower()
        if low == "pov" or low.startswith("pov "):
            is_pov = True
        m = _COUNT_TOKEN_RE.match(low)
        if not m:
            continue
        num = int(m.group(1))
        noun = m.group(2)
        if noun in ("girl", "girls"):
            n_girls = max(n_girls, num)
        elif noun in ("boy", "boys"):
            n_boys = max(n_boys, num)
        elif noun in ("other", "others"):
            n_others = max(n_others, num)
        elif noun in ("people", "person"):
            n_people = max(n_people, num)
    return n_girls, n_boys, n_others, n_people, is_pov


def _validate_roles(
    item_id: str,
    raw_roles: Any,
    clean_base_tags: list[str],
    errors: list[str],
) -> list[dict[str, Any]]:
    if not isinstance(raw_roles, list) or not raw_roles:
        errors.append(f"[{item_id}] 'roles' must be a non-empty list of role objects")
        return []

    clean_roles: list[dict[str, Any]] = []
    seen_boy = False
    seen_other = False
    girl_idx = 0
    boy_idx = 0
    other_idx = 0
    seen_slots: set[str] = set()

    for r_idx, raw_role in enumerate(raw_roles):
        if not isinstance(raw_role, dict):
            errors.append(f"[{item_id}] roles[{r_idx}] must be an object, got {type(raw_role).__name__}")
            continue

        gender_raw = raw_role.get("gender")
        gender = gender_raw.strip().lower() if isinstance(gender_raw, str) else ""
        if gender not in ("girl", "boy", "other"):
            errors.append(
                f"[{item_id}] roles[{r_idx}].gender must be 'girl', 'boy', or 'other', got {gender_raw!r}"
            )
            continue

        if gender == "girl":
            if seen_boy:
                errors.append(f"[{item_id}] roles[{r_idx}] female role must appear before male roles")
            elif seen_other:
                errors.append(f"[{item_id}] roles[{r_idx}] female role must appear before other roles")
            girl_idx += 1
            expected_slot = f"girl_{girl_idx}"
        elif gender == "boy":
            if seen_other:
                errors.append(f"[{item_id}] roles[{r_idx}] male role must appear before other roles")
            seen_boy = True
            boy_idx += 1
            expected_slot = f"boy_{boy_idx}"
        else:
            seen_other = True
            other_idx += 1
            expected_slot = f"other_{other_idx}"

        slot_raw = raw_role.get("slot")
        slot = slot_raw.strip() if isinstance(slot_raw, str) else ""
        if not slot:
            errors.append(f"[{item_id}] roles[{r_idx}].slot must be a non-empty string")
        elif slot in seen_slots:
            errors.append(f"[{item_id}] roles[{r_idx}].slot duplicate {slot!r}")
        elif slot != expected_slot:
            errors.append(f"[{item_id}] roles[{r_idx}].slot must be {expected_slot!r}, got {slot!r}")
        seen_slots.add(slot)

        center_raw = raw_role.get("center")
        clean_center: dict[str, float] = {"x": 0.5, "y": 0.5}
        if not isinstance(center_raw, dict):
            errors.append(f"[{item_id}] roles[{r_idx}].center must be an object with x and y")
        else:
            cx = center_raw.get("x")
            cy = center_raw.get("y")
            if isinstance(cx, bool) or not isinstance(cx, (int, float)) or not (0.0 <= float(cx) <= 1.0):
                errors.append(f"[{item_id}] roles[{r_idx}].center.x must be in [0.0, 1.0], got {cx!r}")
            if isinstance(cy, bool) or not isinstance(cy, (int, float)) or not (0.0 <= float(cy) <= 1.0):
                errors.append(f"[{item_id}] roles[{r_idx}].center.y must be in [0.0, 1.0], got {cy!r}")
            if (
                not isinstance(cx, bool)
                and isinstance(cx, (int, float))
                and not isinstance(cy, bool)
                and isinstance(cy, (int, float))
            ):
                clean_center = {"x": round(float(cx), 2), "y": round(float(cy), 2)}

        role_tags = _clean_string_list(
            raw_role.get("tags_en"),
            item_id,
            f"roles[{r_idx}].tags_en",
            errors,
        )
        for t_idx, tag in enumerate(role_tags):
            if has_forbidden_role_prefix(tag):
                errors.append(
                    f"[{item_id}] roles[{r_idx}].tags_en[{t_idx}] contains forbidden subject/count prefix: {tag!r}"
                )

        nat_raw = raw_role.get("natural_en")
        if not isinstance(nat_raw, str) or not nat_raw.strip():
            errors.append(f"[{item_id}] roles[{r_idx}].natural_en must be a non-empty string")
            role_natural = ""
        else:
            role_natural = nat_raw.strip()

        clean_roles.append(
            {
                "slot": slot or expected_slot,
                "gender": gender,
                "center": clean_center,
                "tags_en": role_tags,
                "natural_en": role_natural,
            }
        )

    if clean_base_tags and clean_roles:
        n_girls, n_boys, n_others, n_people, is_pov = _parse_base_counts(clean_base_tags)
        if is_pov:
            if n_girls > 0 and girl_idx != n_girls:
                errors.append(
                    f"[{item_id}] POV roles girl count mismatch: expected {n_girls}, got {girl_idx}"
                )
            if boy_idx > 0 and n_boys == 0:
                errors.append(
                    f"[{item_id}] POV item must only keep viewed subjects in roles, got unexpected boy role(s)"
                )
            if other_idx > n_others:
                errors.append(
                    f"[{item_id}] POV roles other count mismatch: expected at most {n_others}, got {other_idx}"
                )
        elif n_girls > 0 or n_boys > 0 or n_others > 0:
            if girl_idx != n_girls or boy_idx != n_boys or other_idx != n_others:
                errors.append(
                    f"[{item_id}] roles count ({girl_idx}g/{boy_idx}b/{other_idx}o) disagrees with base_tags_en ({n_girls}g/{n_boys}b/{n_others}o)"
                )
        elif n_people > 0 and (girl_idx + boy_idx + other_idx) != n_people:
            errors.append(
                f"[{item_id}] roles count ({girl_idx + boy_idx + other_idx}) disagrees with base_tags_en {n_people}people"
            )

    return clean_roles


def validate_item(
    item_id: str,
    item: Any,
    expected_hashes: dict[str, str],
) -> tuple[dict[str, Any] | None, list[str]]:
    """Validate a single Schema v2 item and return normalized v2 fields or errors."""
    errors: list[str] = []
    if item_id not in expected_hashes:
        errors.append(f"[{item_id}] unknown id not in source dataset")
        return None, errors
    if not isinstance(item, dict):
        errors.append(f"[{item_id}] item must be an object, got {type(item).__name__}")
        return None, errors

    clean_base_tags = _clean_string_list(item.get("base_tags_en"), item_id, "base_tags_en", errors)
    clean_roles = _validate_roles(item_id, item.get("roles"), clean_base_tags, errors)
    clean_tags = _clean_string_list(item.get("tags_en"), item_id, "tags_en", errors)

    natural_en = item.get("natural_en")
    if not isinstance(natural_en, str) or not natural_en.strip():
        errors.append(f"[{item_id}] 'natural_en' must be a non-empty string")
        clean_natural = ""
    else:
        clean_natural = natural_en.strip()

    prompt_zh = item.get("prompt_zh")
    if not isinstance(prompt_zh, str) or not prompt_zh.strip():
        errors.append(f"[{item_id}] 'prompt_zh' must be a non-empty string")
        clean_zh = ""
    else:
        clean_zh = prompt_zh.strip()

    source_hash = item.get("source_hash")
    expected_hash = expected_hashes[item_id]
    if not isinstance(source_hash, str) or not source_hash.strip():
        errors.append(f"[{item_id}] 'source_hash' must be a non-empty string")
    elif source_hash.strip() != expected_hash:
        errors.append(
            f"[{item_id}] 'source_hash' mismatch: got {source_hash.strip()!r}, expected {expected_hash!r}"
        )

    banned_hits: set[str] = set()
    for tag in clean_base_tags:
        banned_hits.update(find_banned_words(tag))
    for tag in clean_tags:
        banned_hits.update(find_banned_words(tag))
    if clean_natural:
        banned_hits.update(find_banned_words(clean_natural))
    for role in clean_roles:
        for rtag in role["tags_en"]:
            banned_hits.update(find_banned_words(rtag))
        if role["natural_en"]:
            banned_hits.update(find_banned_words(role["natural_en"]))
    if banned_hits:
        errors.append(
            f"[{item_id}] banned non-pose words detected: {', '.join(sorted(banned_hits))}"
        )

    if errors:
        return None, errors

    return {
        "base_tags_en": clean_base_tags,
        "roles": clean_roles,
        "tags_en": clean_tags,
        "natural_en": clean_natural,
        "prompt_zh": clean_zh,
        "source_hash": expected_hash,
    }, []


# ---------------------------------------------------------------------------
# Deterministic Schema v1 -> Schema v2 Bootstrap Parser
# ---------------------------------------------------------------------------


def _is_pov_item(item_id: str, meta: dict[str, Any], tags_en: list[str]) -> bool:
    tags_low = [t.strip().lower() for t in tags_en]
    system = str(meta.get("体系") or "")
    return (
        any(t == "pov" or t.startswith("pov ") for t in tags_low)
        or "POV" in system.upper()
        or "pov" in item_id.lower()
    )


def _determine_roles_spec(
    item_id: str,
    meta: dict[str, Any],
    tags_en: list[str],
) -> tuple[list[tuple[str, str]], bool]:
    """Determine ordered [(slot, gender), ...] and is_pov flag for an item."""
    is_pov = _is_pov_item(item_id, meta, tags_en)
    n_girls, n_boys, n_others, n_people, _ = _parse_base_counts(tags_en)
    tags_low = {t.strip().lower() for t in tags_en}
    cat = str(meta.get("分类") or "")
    sys_name = str(meta.get("体系") or "")

    if is_pov:
        if n_girls == 0 and n_boys == 0 and n_others == 0:
            n_girls = 1
        specs = [(f"girl_{i + 1}", "girl") for i in range(n_girls)]
        specs.extend((f"boy_{i + 1}", "boy") for i in range(n_boys))
        specs.extend((f"other_{i + 1}", "other") for i in range(n_others))
        return specs, True

    if n_girls > 0 or n_boys > 0 or n_others > 0:
        specs = [(f"girl_{i + 1}", "girl") for i in range(n_girls)]
        specs.extend((f"boy_{i + 1}", "boy") for i in range(n_boys))
        specs.extend((f"other_{i + 1}", "other") for i in range(n_others))
        return specs, False

    if n_people == 2 or ("双人" in sys_name and n_people != 1):
        if "yuri" in tags_low or "百合" in cat or "2girls" in tags_low:
            return [("girl_1", "girl"), ("girl_2", "girl")], False
        if "yaoi" in tags_low:
            return [("boy_1", "boy"), ("boy_2", "boy")], False
        return [("girl_1", "girl"), ("boy_1", "boy")], False

    if n_people >= 3:
        if "yuri" in tags_low:
            return [(f"girl_{i + 1}", "girl") for i in range(n_people)], False
        if "yaoi" in tags_low:
            return [(f"boy_{i + 1}", "boy") for i in range(n_people)], False
        specs = [("girl_1", "girl")]
        specs.extend((f"boy_{i + 1}", "boy") for i in range(n_people - 1))
        return specs, False

    return [("girl_1", "girl")], False


def _strip_role_prefix_and_clean(tag: str) -> str:
    """Strip leading subject/ordinal prefix and normalize embedded target nouns."""
    stripped = _STRIP_ROLE_PREFIX_RE.sub("", tag.strip()).strip()
    if not stripped:
        return ""
    for pat, repl in _EMBEDDED_TARGET_PATTERNS:
        stripped = pat.sub(repl, stripped)
    stripped = re.sub(r"\s{2,}", " ", stripped).strip(" ,")
    if not stripped or _SPATIAL_STUB_RE.match(stripped):
        return ""
    # Leading "on top" / "on bottom" stubs left after stripping "girl "/"boy "
    if re.match(r"^on\s+bottom\s+on\s+back$", stripped, re.IGNORECASE):
        return "lying on back"
    if re.match(r"^on\s+(?:top|bottom)\s+", stripped, re.IGNORECASE):
        stripped = re.sub(r"^on\s+(?:top|bottom)\s+", "", stripped, flags=re.IGNORECASE).strip()

    # Guard against multi-layered or residual prefixes.
    if has_forbidden_role_prefix(stripped):
        stripped2 = _STRIP_ROLE_PREFIX_RE.sub("", stripped).strip()
        if not stripped2 or _SPATIAL_STUB_RE.match(stripped2) or has_forbidden_role_prefix(stripped2):
            return ""
        stripped = stripped2
    return stripped


def _is_base_tag(tag: str, is_pov: bool) -> bool:
    low = tag.strip().lower()
    if low in _BASE_EXACT_TAGS or _COUNT_TOKEN_RE.match(low):
        return True
    if low.startswith("pov ") or low == "pov":
        return True
    if is_pov and low.startswith("viewer "):
        return True
    if low in _BOTH_GIRLS_BASE_TAGS:
        return True
    return False


def _split_clauses(natural_en: str) -> list[str]:
    """Split an English description into role-attributable clauses."""
    raw = natural_en.strip()
    if not raw:
        return []
    # Split on sentence boundaries, colons introducing figure clauses, semicolons, and contrastive conjunctions.
    parts = re.split(
        r"[.;:]+|\s*,\s*(?:while|whereas|as\s+(?=(?:she|he|the|a)\b)|and\s+(?:the\s+|one\s+|his\s+|her\s+)?)\s*",
        raw,
    )
    clauses: list[str] = []
    for p in parts:
        c = p.strip()
        if c:
            clauses.append(c)
    return clauses


def _infer_figure_side_gender(side: str, natural_en: str, prompt_zh: str) -> str | None:
    """Infer whether 'left figure' or 'right figure' is male or female from prose."""
    for clause in _split_clauses(natural_en):
        low = clause.lower()
        has_side = (
            f"on the {side}" in low
            or f"{side} figure" in low
            or f"on {side}" in low
        )
        if not has_side:
            continue
        if re.search(r"\b(?:male|man|boy|his|he)\b", low) and not re.search(r"\b(?:female|woman|girl|her|she)\b", low):
            return "boy"
        if re.search(r"\b(?:female|woman|girl|her|she)\b", low) and not re.search(r"\b(?:male|man|boy|his|he)\b", low):
            return "girl"
        if re.search(r"\bhis\b", low):
            return "boy"
        if re.search(r"\bher\b", low):
            return "girl"
    if side == "left" and ("女方居左" in prompt_zh or "女性在左" in prompt_zh):
        return "girl"
    if side == "left" and ("男方居左" in prompt_zh or "男性在左" in prompt_zh):
        return "boy"
    if side == "right" and ("女方居右" in prompt_zh or "女性在右" in prompt_zh):
        return "girl"
    if side == "right" and ("男方居右" in prompt_zh or "男性在右" in prompt_zh):
        return "boy"
    return None


def _match_tag_target_slots(
    tag: str,
    roles_spec: list[tuple[str, str]],
    natural_en: str,
    prompt_zh: str,
) -> list[str] | None:
    """Return matching slot(s) if tag has an explicit subject/ordinal prefix, else None."""
    low = tag.strip().lower()

    if _PLURAL_GIRLS_PREFIX_RE.match(low):
        return [slot for slot, g in roles_spec if g == "girl"]
    if _PLURAL_BOYS_PREFIX_RE.match(low):
        return [slot for slot, g in roles_spec if g == "boy"]

    m = _EXPLICIT_ROLE_PREFIX_RE.match(low)
    if not m:
        return None
    mod = (m.group("mod") or "").lower()
    noun = m.group("noun").lower()

    if noun == "viewer":
        return []

    if noun in ("girl", "girls", "woman", "women", "female"):
        gender_slots = [slot for slot, g in roles_spec if g == "girl"]
    elif noun in ("boy", "boys", "man", "men", "male"):
        gender_slots = [slot for slot, g in roles_spec if g == "boy"]
    elif noun in ("creature", "creatures", "monster", "monsters", "animal", "animals"):
        gender_slots = [slot for slot, g in roles_spec if g == "other"]
    else:
        # "figure" / "figures"
        inferred_gender = _infer_figure_side_gender(mod, natural_en, prompt_zh) if mod in ("left", "right") else None
        if inferred_gender:
            gender_slots = [slot for slot, g in roles_spec if g == inferred_gender]
        else:
            gender_slots = [slot for slot, _ in roles_spec]

    if not gender_slots:
        return [roles_spec[0][0]]
    if len(gender_slots) == 1:
        return [gender_slots[0]]

    ordinal_map = {
        "first": 0,
        "1st": 0,
        "left": 0,
        "front": 0,
        "top": 0,
        "upper": 0,
        "second": 1,
        "2nd": 1,
        "right": -1,
        "back": -1,
        "rear": -1,
        "bottom": -1,
        "lower": -1,
        "third": 2,
        "3rd": 2,
        "fourth": 3,
        "4th": 3,
    }
    if mod in ordinal_map:
        idx = ordinal_map[mod]
        if idx == -1:
            return [gender_slots[-1]]
        if idx < len(gender_slots):
            return [gender_slots[idx]]
    if mod in ("center", "centre", "middle"):
        return [gender_slots[len(gender_slots) // 2]]
    if mod == "both":
        return gender_slots
    if any(k in low for k in ("on top", "above", "leaning over")):
        return [gender_slots[-1]]
    if any(k in low for k in ("on bottom", "below")):
        return [gender_slots[0]]
    return [gender_slots[0]]


_CLAUSE_FEMALE_SUBJ_RE = re.compile(
    r"^(?:on\s+the\s+(?:left|right),\s+)?(?:(?:the|a|an)\s+)?(?:(?:left|right|first|second|third|front|rear|lower|upper)\s+)?"
    r"(?:girl|woman|female(?:\s+figure)?|she)\b",
    re.IGNORECASE,
)
_CLAUSE_MALE_SUBJ_RE = re.compile(
    r"^(?:on\s+the\s+(?:left|right),\s+)?(?:(?:the|a|an)\s+)?(?:(?:left|right|first|second|third|front|rear|lower|upper)\s+)?"
    r"(?:boy|man|male(?:\s+figure)?|he)\b",
    re.IGNORECASE,
)
_CLAUSE_OTHER_SUBJ_RE = re.compile(
    r"^(?:on\s+the\s+(?:left|right),\s+)?(?:(?:the|a|an)\s+)?(?:(?:left|right|first|second|third|front|rear|lower|upper)\s+)?"
    r"(?:creature|monster|animal|beast|tentacles?)\b",
    re.IGNORECASE,
)
_OBJ_PRONOUN_RE = re.compile(
    r"\b(?:over|behind|beside|around|against|between|under|toward|towards|into|at|on|atop|along|from|holding|gripping|holds|grips|supporting|pulling|lifting|cupping|facing|kissing|and)\s+(?:her|him|his)\b",
    re.IGNORECASE,
)


def _clause_matches_role(
    clause: str,
    slot: str,
    gender: str,
    gender_slots: list[str],
) -> int:
    """Return a positive affinity score if clause describes this role, else 0."""
    low = clause.strip().lower()
    is_fem_subj = bool(_CLAUSE_FEMALE_SUBJ_RE.match(low))
    is_male_subj = bool(_CLAUSE_MALE_SUBJ_RE.match(low))
    is_other_subj = bool(_CLAUSE_OTHER_SUBJ_RE.match(low))

    if is_fem_subj and gender != "girl":
        return 0
    if is_male_subj and gender != "boy":
        return 0
    if is_other_subj and gender != "other":
        return 0

    # Strip object-position pronouns (e.g. "over her", "gripping her wrist") before counting gender pronouns.
    subj_view = _OBJ_PRONOUN_RE.sub(" ", low)

    score = 0
    if is_fem_subj and gender == "girl":
        score += 10
    elif is_male_subj and gender == "boy":
        score += 10
    elif is_other_subj and gender == "other":
        score += 10
    else:
        female_hits = len(re.findall(r"\b(?:girl|woman|female|she|her|hers)\b", subj_view))
        male_hits = len(re.findall(r"\b(?:boy|man|male|he|his)\b", subj_view))
        other_hits = len(re.findall(r"\b(?:creature|monster|animal|beast|tentacles?)\b", subj_view))
        if gender == "girl":
            if female_hits > 0:
                score += female_hits * 2
            if male_hits > female_hits and not re.search(r"\b(?:she|her)\b", subj_view):
                return 0
        elif gender == "boy":
            if male_hits > 0:
                score += male_hits * 2
            if female_hits > male_hits and not re.search(r"\b(?:he|his)\b", subj_view):
                return 0
        else:
            if other_hits > 0:
                score += other_hits * 2
            elif female_hits or male_hits:
                return 0

    if len(gender_slots) > 1:
        pos = gender_slots.index(slot)
        if pos == 0 and re.search(r"^(?:the\s+)?(?:first|left|lower|bottom|front)\b|\bon\s+the\s+left\b", low):
            score += 4
        elif pos == len(gender_slots) - 1 and re.search(r"^(?:the\s+)?(?:second|right|upper|top|rear)\b|\bon\s+the\s+right\b", low):
            score += 4
        elif pos == 2 and re.search(r"^(?:the\s+)?third\b", low):
            score += 4

    return score


def _extract_role_clauses(
    roles_spec: list[tuple[str, str]],
    natural_en: str,
) -> dict[str, list[str]]:
    """Map each role slot to matching English clauses from natural_en."""
    clauses = _split_clauses(natural_en)
    result: dict[str, list[str]] = {slot: [] for slot, _ in roles_spec}
    if len(roles_spec) == 1:
        result[roles_spec[0][0]] = [natural_en.strip()] if natural_en.strip() else []
        return result

    genders_by_type: dict[str, list[str]] = {"girl": [], "boy": [], "other": []}
    for slot, g in roles_spec:
        genders_by_type[g].append(slot)

    # First pass: score each clause against roles.
    unassigned_clauses: list[str] = []
    for clause in clauses:
        low = clause.lower()
        if re.match(
            r"^(?:full[- ]body|upper[- ]body|lower[- ]body|cowboy[- ]shot|side|front|three-quarter|overhead|high-angle|low-angle|close-up|first-person)\b",
            low,
        ) and not re.search(
            r"\b(?:stands?|standing|kneels?|kneeling|sits?|sitting|lies?|lying|leans?|leaning|reclin(?:e|es|ing)|straddl)\b",
            low,
        ):
            continue

        best_slots: list[str] = []
        best_score = 0
        for slot, gender in roles_spec:
            sc = _clause_matches_role(clause, slot, gender, genders_by_type[gender])
            if sc > best_score:
                best_score = sc
                best_slots = [slot]
            elif sc == best_score and sc > 0:
                best_slots.append(slot)

        if best_score > 0 and len(best_slots) == 1:
            result[best_slots[0]].append(clause)
        elif best_score == 0 and len(roles_spec) == 2:
            if re.search(
                r"^(?:the\s+)?(?:lower\s+figure|bottom\s+figure|front\s+figure|first\s+figure|left\s+figure|one\s+figure|one\s+lies|the\s+figure\s+on\s+the\s+left)\b",
                low,
            ):
                result[roles_spec[0][0]].append(clause)
            elif re.search(
                r"^(?:the\s+)?(?:upper\s+figure|top\s+figure|rear\s+figure|second\s+figure|right\s+figure|partner|the\s+other|the\s+figure\s+on\s+the\s+right)\b",
                low,
            ):
                result[roles_spec[1][0]].append(clause)
            else:
                unassigned_clauses.append(clause)
        else:
            unassigned_clauses.append(clause)

    # If one role in a 2-role item has no clauses and there is a matching unassigned clause, pair them.
    if len(roles_spec) == 2 and len(unassigned_clauses) == 1:
        empty_slots = [s for s, _ in roles_spec if not result[s]]
        if len(empty_slots) == 1:
            result[empty_slots[0]].append(unassigned_clauses[0])

    return result


def _tag_matches_clause(tag: str, clause: str) -> bool:
    """Check if an unprefixed pose tag is evidenced inside a role's natural_en clause."""
    clause_low = clause.lower()
    t_low = tag.strip().lower()
    if t_low in clause_low:
        return True
    # Stem / synonym matches for common posture verbs and body phrases
    stem_groups = [
        ("lying on back", ("lies supine", "lying supine", "lies on her back", "lies on his back", "lying on the back", "reclining on his back", "reclining on her back")),
        ("lying on stomach", ("lies prone", "lying prone", "face-down", "on stomach")),
        ("on all fours", ("all fours", "hands and knees")),
        ("kneeling over", ("leans forward over", "kneels over", "kneeling over")),
        ("leaning over", ("leans forward over", "leaning over", "leans over", "leaning forward")),
        ("kneeling", ("kneels", "kneeling")),
        ("standing", ("stands", "standing")),
        ("sitting", ("sits", "sitting", "seated")),
        ("sitting on lap", ("sits on", "sitting on", "sits atop", "on the rear figure's lap", "on his lap", "on her lap")),
        ("straddling", ("straddl", "astride")),
        ("leaning forward", ("leans forward", "leaning forward", "bent forward")),
        ("leaning back", ("leans back", "leaning back", "reclines", "reclining")),
        ("bent forward", ("bends forward", "bent forward")),
        ("inverted", ("inverted", "upside down")),
        ("arms overhead", ("arms extended overhead", "arms overhead")),
        ("arms supporting behind", ("arms extended behind for support", "arms supporting behind")),
        ("arms around neck", ("arms around", "around his neck", "around her neck", "around his shoulders")),
        ("legs wrapped around waist", ("legs around", "legs wrapped around")),
        ("legs around waist", ("legs wrapped around", "legs around")),
        ("propped on elbows", ("elbows bent", "propped on elbows", "on elbows")),
        ("propped on forearms", ("forearms", "on both forearms")),
        ("forearms on ground", ("forearms braced", "forearms on the ground")),
        ("looking down", ("looking down", "looks down")),
        ("looking up", ("looking up", "looks up")),
        ("looking at viewer", ("looking at the viewer", "looking toward the viewer", "at the viewer")),
        ("legs spread wide", ("legs spread", "spread wide", "legs apart")),
        ("legs apart", ("legs apart", "legs spread")),
        ("feet together", ("feet pressed together", "feet together")),
        ("legs on shoulders", ("legs lifted and ankles resting on", "legs on", "over the kneeling figure's shoulders", "over his shoulders")),
        ("legs over shoulders", ("hooked over the partner's shoulders", "over the partner's shoulders", "over his shoulders")),
        ("legs raised", ("legs raised", "legs lifted")),
        ("holding", ("gripping", "holding", "grasping", "wraps both arms")),
        ("hands on", ("hands on", "hand on", "hands resting on")),
    ]
    for tag_key, needles in stem_groups:
        if tag_key in t_low and any(n in clause_low for n in needles):
            return True
    tokens = [
        w
        for w in re.findall(r"[a-z0-9]+", t_low)
        if len(w) > 3 and w not in {"with", "from", "into", "over", "both", "partner", "another"}
    ]
    if len(tokens) >= 2 and all(tok in clause_low for tok in tokens):
        return True
    return False


_ANATOMY_NOUNS = (
    r"(?:leg|legs|foot|feet|knee|knees|ankle|ankles|hip|hips|arm|arms|"
    r"hand|hands|elbow|elbows|shoulder|shoulders|thigh|thighs|wrist|wrists|"
    r"toe|toes|heel|heels|cheek|cheeks|ear|ears|eye|eyes|buttock|buttocks)"
)
_POS_LEFT_RE = re.compile(
    rf"(?:^(?:left|center-left|bottom-left|top-left)\s+(?:girl|boy|woman|man|figure|creature|monster|animal|other)\b"
    rf"|\b(?:on\s+(?:the\s+)?left(?!\s+{_ANATOMY_NOUNS}\b)|at\s+(?:the\s+)?(?:bottom-left|top-left|left)(?!\s+{_ANATOMY_NOUNS}\b)|center-left|left\s+side)\b)",
    re.IGNORECASE,
)
_POS_RIGHT_RE = re.compile(
    rf"(?:^(?:right|center-right|bottom-right|top-right)\s+(?:girl|boy|woman|man|figure|creature|monster|animal|other)\b"
    rf"|\b(?:on\s+(?:the\s+)?right(?!\s+{_ANATOMY_NOUNS}\b)|at\s+(?:the\s+)?(?:bottom-right|top-right|right)(?!\s+{_ANATOMY_NOUNS}\b)|center-right|right\s+side)\b)",
    re.IGNORECASE,
)
_POS_CENTER_RE = re.compile(
    r"(?:^(?:girl|boy|woman|man|figure|creature|monster|animal|other)\s+(?:in\s+)?(?:the\s+)?(?:center|centre|middle)\b"
    r"|\b(?:in\s+(?:the\s+)?(?:center|centre|middle)|(?:girl|boy|other)\s+center)\b)(?!-(?:left|right))",
    re.IGNORECASE,
)


def _estimate_role_centers(
    roles_spec: list[tuple[str, str]],
    role_raw_cues: dict[str, list[str]],
    role_clauses: dict[str, list[str]],
    natural_en: str,
    prompt_zh: str,
) -> dict[str, dict[str, float]]:
    """Estimate normalized [0.0, 1.0] torso centroid coordinates for each role."""
    if len(roles_spec) == 1:
        return {roles_spec[0][0]: {"x": 0.5, "y": 0.5}}

    centers: dict[str, dict[str, float]] = {}
    n_roles = len(roles_spec)

    for slot, gender in roles_spec:
        cues = role_raw_cues.get(slot, [])
        clauses = role_clauses.get(slot, [])
        all_texts = cues + clauses
        blob = " ".join(all_texts).lower()
        x: float | None = None
        y: float = 0.50

        # Screen-position cues (strictly ignore anatomical left/right like "left leg" or "left hand")
        has_center_left = any("center-left" in t.lower() for t in all_texts)
        has_center_right = any("center-right" in t.lower() for t in all_texts)
        has_left = any(_POS_LEFT_RE.search(t) for t in all_texts)
        has_right = any(_POS_RIGHT_RE.search(t) for t in all_texts)
        has_center = any(_POS_CENTER_RE.search(t) for t in all_texts)

        if has_center_left:
            x = 0.38
        elif has_center_right:
            x = 0.62
        elif has_left and not has_right:
            x = 0.28 if n_roles >= 3 else 0.35
        elif has_right and not has_left:
            x = 0.72 if n_roles >= 3 else 0.65
        elif has_center:
            x = 0.50

        # Facing cues in side/facing-each-other pairs when no explicit screen-side position
        if x is None:
            if "facing right" in blob and "facing left" not in blob:
                x = 0.40
            elif "facing left" in blob and "facing right" not in blob:
                x = 0.60

        # Vertical cues
        if any(k in blob for k in ("on top", "upper figure", "straddling", "lifted", "standing behind", "sitting on lap", "astride")):
            y = 0.44
        elif any(k in blob for k in ("on bottom", "lower figure", "lying on back", "lying supine", "lying prone", "lying on stomach", "kneeling below", "bottom-left", "bottom-right")):
            y = 0.60
        elif "standing" in blob and not any(k in blob for k in ("kneeling", "sitting", "lying")):
            y = 0.46
        elif "kneeling" in blob and any("standing" in " ".join(role_raw_cues.get(s, [])) for s, _ in roles_spec if s != slot):
            y = 0.60

        if x is None:
            if gender == "girl" and "女方居左" in prompt_zh:
                x = 0.38
            elif gender == "girl" and "女方居右" in prompt_zh:
                x = 0.62
            elif gender == "boy" and "男方居左" in prompt_zh:
                x = 0.38
            elif gender == "boy" and "男方居右" in prompt_zh:
                x = 0.62

        centers[slot] = {"x": 0.50 if x is None else x, "y": y}

    # Resolve identical (x, y) collisions for multi-role layouts unless vertically separated
    coords = [(centers[s]["x"], centers[s]["y"]) for s, _ in roles_spec]
    if len(set(coords)) < len(coords):
        unplaced = [s for s, _ in roles_spec if centers[s]["x"] == 0.50 and centers[s]["y"] == 0.50]
        if len(unplaced) >= 2:
            if len(unplaced) == 2:
                xs = [0.40, 0.60]
            elif len(unplaced) == 3:
                xs = [0.25, 0.50, 0.75]
            else:
                step = 0.60 / max(1, len(unplaced) - 1)
                xs = [round(0.20 + i * step, 2) for i in range(len(unplaced))]
            for s, nx in zip(unplaced, xs):
                centers[s]["x"] = nx
        elif len(set(coords)) == 1 and n_roles == 2:
            centers[roles_spec[0][0]]["x"] = 0.40
            centers[roles_spec[1][0]]["x"] = 0.60

    for slot in centers:
        centers[slot]["x"] = round(min(0.95, max(0.05, centers[slot]["x"])), 2)
        centers[slot]["y"] = round(min(0.95, max(0.05, centers[slot]["y"])), 2)
    return centers


def _fallback_posture_tags(
    slot: str,
    gender: str,
    role_clauses: list[str],
    base_tags: list[str],
) -> list[str]:
    """Ensure every role receives at least one authentic non-empty posture tag."""
    blob = " ".join(role_clauses).lower()
    inferred: list[str] = []
    checks = [
        ("lying on back", ("supine", "on her back", "on his back", "on the back", "lying on back")),
        ("lying on stomach", ("prone", "face-down", "on stomach")),
        ("on all fours", ("all fours",)),
        ("kneeling", ("kneel",)),
        ("sitting", ("sit", "seated")),
        ("standing", ("stand",)),
        ("leaning forward", ("leaning forward", "leans forward", "bent forward")),
        ("leaning back", ("leaning back", "leans back", "reclin")),
        ("looking at another", ("looking at each other", "facing each other")),
        ("looking at viewer", ("looking at viewer", "looking at the viewer")),
    ]
    for tag, needles in checks:
        if any(n in blob for n in needles):
            inferred.append(tag)
    if not inferred:
        base_blob = " ".join(base_tags).lower()
        for tag in ("kneeling", "sitting", "standing", "straddling", "lying"):
            if tag in base_blob:
                inferred.append(tag)
                break
    if not inferred:
        inferred.append("posing")
    return _dedup_preserve(inferred)


def _clean_clause_for_role(clause: str) -> str:
    cleaned = re.sub(r"^(?:and|while|whereas)\s+", "", clause.strip(), flags=re.IGNORECASE)
    return cleaned.strip(" ,;.")


def bootstrap_item_to_v2(
    item_id: str,
    raw_item: dict[str, Any],
    meta: dict[str, Any],
) -> dict[str, Any]:
    """Deterministically convert a Schema v1 item into Schema v2 fields."""
    tags_en = [str(t).strip() for t in (raw_item.get("tags_en") or []) if str(t).strip()]
    natural_en = str(raw_item.get("natural_en") or "").strip()
    prompt_zh = str(raw_item.get("prompt_zh") or "").strip()
    expected_hash = compute_source_hash(meta)

    roles_spec, is_pov = _determine_roles_spec(item_id, meta, tags_en)
    role_clauses = _extract_role_clauses(roles_spec, natural_en)

    base_tags: list[str] = []
    role_tags: dict[str, list[str]] = {slot: [] for slot, _ in roles_spec}
    role_raw_cues: dict[str, list[str]] = {slot: [] for slot, _ in roles_spec}
    unprefixed_role_tags: list[str] = []

    for tag in tags_en:
        if _is_base_tag(tag, is_pov):
            base_tags.append(tag)
            continue

        if len(roles_spec) == 1:
            slot = roles_spec[0][0]
            role_raw_cues[slot].append(tag)
            cleaned = _strip_role_prefix_and_clean(tag)
            if cleaned:
                role_tags[slot].append(cleaned)
            elif tag.strip().lower().startswith("girl on top"):
                base_tags.append("girl on top")
            continue

        # Multi-role tag handling
        matched_slots = _match_tag_target_slots(tag, roles_spec, natural_en, prompt_zh)
        if matched_slots is not None:
            if not matched_slots:
                base_tags.append(tag)
                continue
            for s in matched_slots:
                role_raw_cues[s].append(tag)
            cleaned = _strip_role_prefix_and_clean(tag)
            if cleaned:
                for s in matched_slots:
                    role_tags[s].append(cleaned)
            else:
                low_tag = tag.strip().lower()
                if "on top" in low_tag:
                    base_tags.append("girl on top" if "girl" in low_tag else tag.strip())
            continue

        unprefixed_role_tags.append(tag)

    # Distribute unprefixed role tags in multi-role items via natural_en clauses
    for tag in unprefixed_role_tags:
        if has_forbidden_role_prefix(tag):
            cleaned = _strip_role_prefix_and_clean(tag)
            if not cleaned:
                continue
            tag = cleaned

        matched: list[str] = []
        for slot, _ in roles_spec:
            if any(_tag_matches_clause(tag, cl) for cl in role_clauses.get(slot, [])):
                matched.append(slot)
        if not matched:
            # Shared posture or primary role fallback
            low_t = tag.strip().lower()
            if low_t in ("standing", "sitting", "kneeling", "lying", "on side", "looking at viewer", "looking up", "looking down"):
                matched = [s for s, _ in roles_spec]
            else:
                matched = [roles_spec[0][0]]
        for s in matched:
            role_tags[s].append(tag)
            role_raw_cues[s].append(tag)

    if not base_tags:
        # Ensure base_tags_en is never empty
        angle = str(meta.get("角度") or "").strip()
        base_tags = ["1girl"] if len(roles_spec) == 1 else [f"{len(roles_spec)}people"]
        if angle == "正面":
            base_tags.append("front view")
        elif angle == "侧面":
            base_tags.append("side view")

    base_tags = _dedup_preserve(base_tags)
    centers = _estimate_role_centers(roles_spec, role_raw_cues, role_clauses, natural_en, prompt_zh)

    roles_out: list[dict[str, Any]] = []
    for slot, gender in roles_spec:
        r_tags = _dedup_preserve(role_tags[slot])
        if not r_tags:
            r_tags = _fallback_posture_tags(slot, gender, role_clauses.get(slot, []), base_tags)
        clauses = [_clean_clause_for_role(c) for c in role_clauses.get(slot, []) if _clean_clause_for_role(c)]
        r_nat = "; ".join(clauses) if clauses else ", ".join(r_tags)
        roles_out.append(
            {
                "slot": slot,
                "gender": gender,
                "center": centers[slot],
                "tags_en": r_tags,
                "natural_en": r_nat,
            }
        )

    return {
        "base_tags_en": base_tags,
        "roles": roles_out,
        "tags_en": tags_en,
        "natural_en": natural_en,
        "prompt_zh": prompt_zh,
        "source_hash": expected_hash,
    }


# ---------------------------------------------------------------------------
# Target Resolution & Subcommands
# ---------------------------------------------------------------------------


def _resolve_custom_path(args: argparse.Namespace) -> Path:
    if args.custom_file != DEFAULT_CUSTOM_PATH:
        return args.custom_file
    if args.prompts_file != DEFAULT_PROMPTS_PATH:
        return args.prompts_file
    return DEFAULT_CUSTOM_PATH


def _is_v2_ready(item_id: str, raw_item: Any, expected_hashes: dict[str, str]) -> bool:
    if not isinstance(raw_item, dict):
        return False
    _, errs = validate_item(item_id, raw_item, expected_hashes)
    return not errs


def cmd_status_base(pose_path: Path, prompts_path: Path) -> int:
    entries, by_id = load_pose_source(pose_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}
    doc = load_prompts_doc(prompts_path)
    items = doc["items"]

    total = len(entries)
    v2_ready = sum(1 for eid in by_id if _is_v2_ready(eid, items.get(eid), expected_hashes))
    v1_only = sum(
        1
        for eid in by_id
        if eid in items and not _is_v2_ready(eid, items.get(eid), expected_hashes)
    )
    missing = sum(1 for eid in by_id if eid not in items)
    extra = [eid for eid in items if eid not in by_id]

    print(f"[base] pose-zh.json total: {total}")
    print(f"[base] pose-prompts-zh.json v2 valid: {v2_ready}")
    print(f"[base] pose-prompts-zh.json legacy/pending v2: {v1_only + missing} (legacy={v1_only}, missing={missing})")
    if extra:
        print(f"[base] unknown/extra ids in pose-prompts-zh.json: {len(extra)}")
    return 0


def cmd_status_custom(custom_path: Path) -> int:
    entries, by_id = load_pose_source(custom_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}
    total = len(entries)
    v2_ready = sum(1 for entry in entries if _is_v2_ready(entry["id"], entry, expected_hashes))
    pending = total - v2_ready
    print(f"[custom] pose-custom-zh.json total: {total}")
    print(f"[custom] pose-custom-zh.json v2 valid: {v2_ready}")
    print(f"[custom] pose-custom-zh.json legacy/pending v2: {pending}")
    return 0


def _build_shard_entry(entry: dict[str, Any], existing: dict[str, Any] | None) -> dict[str, Any]:
    shard_item: dict[str, Any] = {
        "id": entry["id"],
        "体系": entry.get("体系", ""),
        "分类": entry.get("分类", ""),
        "姿势名称": entry.get("姿势名称", ""),
        "角度": entry.get("角度", ""),
        "thumb_path": entry.get("缩略图", ""),
        "orig_path": entry.get("原图", ""),
        "source_hash": compute_source_hash(entry),
    }
    if isinstance(existing, dict):
        for key in ("base_tags_en", "roles", "tags_en", "natural_en", "prompt_zh"):
            if existing.get(key):
                shard_item[key] = copy.deepcopy(existing[key])
    return shard_item


def _write_shards(pending: list[dict[str, Any]], num_shards: int, out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    n_pending = len(pending)
    base, rem = divmod(n_pending, num_shards)
    width = max(3, len(str(num_shards)))

    offset = 0
    written_files: list[Path] = []
    for i in range(num_shards):
        size = base + (1 if i < rem else 0)
        shard_items = pending[offset : offset + size]
        offset += size
        shard_path = out_dir / f"shard_{i + 1:0{width}d}.json"
        atomic_write_json(shard_path, shard_items)
        written_files.append(shard_path)

    print(f"Exported {n_pending} entries into {num_shards} shards in {out_dir}")
    if written_files:
        first_len = base + (1 if rem > 0 else 0)
        print(f"First shard: {written_files[0]} ({first_len} items)")
    return 0


def cmd_export_shards(
    target: str,
    pose_path: Path,
    prompts_path: Path,
    custom_path: Path,
    num_shards: int,
    out_dir: Path,
    export_all: bool = False,
) -> int:
    if num_shards <= 0:
        print("Error: --export-shards must be a positive integer", file=sys.stderr)
        return 1

    if target == "base":
        entries, by_id = load_pose_source(pose_path)
        expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}
        doc = load_prompts_doc(prompts_path)
        items = doc["items"]
        pending = []
        for entry in entries:
            eid = entry["id"]
            existing = items.get(eid)
            if not export_all and _is_v2_ready(eid, existing, expected_hashes):
                continue
            pending.append(_build_shard_entry(entry, existing if isinstance(existing, dict) else None))
        return _write_shards(pending, num_shards, out_dir)

    entries, by_id = load_pose_source(custom_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}
    pending = []
    for entry in entries:
        eid = entry["id"]
        if not export_all and _is_v2_ready(eid, entry, expected_hashes):
            continue
        pending.append(_build_shard_entry(entry, entry))
    return _write_shards(pending, num_shards, out_dir)


def resolve_merge_inputs(patterns: list[str]) -> list[Path]:
    """Expand file paths and globs into a deduplicated ordered list of existing files."""
    resolved: list[Path] = []
    seen: set[Path] = set()
    for pat in patterns:
        matches = sorted(glob.glob(pat, recursive=True))
        if not matches:
            p = Path(pat)
            if p.exists():
                matches = [str(p)]
        if not matches:
            raise FileNotFoundError(f"No files matched merge pattern: {pat}")
        for m in matches:
            mp = Path(m).resolve()
            if mp.is_file() and mp not in seen:
                seen.add(mp)
                resolved.append(mp)
    return resolved


def parse_merge_file(path: Path) -> list[tuple[str, Any]]:
    """Parse a shard/batch output JSON file into (id, raw_item) pairs."""
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    pairs: list[tuple[str, Any]] = []
    if isinstance(data, list):
        for idx, elem in enumerate(data):
            if not isinstance(elem, dict) or not isinstance(elem.get("id"), str) or not elem["id"].strip():
                raise ValueError(f"{path}: list element [{idx}] missing string 'id'")
            pairs.append((elem["id"].strip(), elem))
    elif isinstance(data, dict):
        container = data.get("items") if "items" in data and isinstance(data["items"], (dict, list)) else data
        if isinstance(container, list):
            for idx, elem in enumerate(container):
                if not isinstance(elem, dict) or not isinstance(elem.get("id"), str) or not elem["id"].strip():
                    raise ValueError(f"{path}: items[{idx}] missing string 'id'")
                pairs.append((elem["id"].strip(), elem))
        elif isinstance(container, dict):
            for k, v in container.items():
                if not isinstance(k, str) or not k.strip():
                    raise ValueError(f"{path}: invalid item key {k!r}")
                pairs.append((k.strip(), v))
        else:
            raise ValueError(f"{path}: unsupported 'items' type {type(container).__name__}")
    else:
        raise ValueError(f"{path}: expected JSON list or object, got {type(data).__name__}")
    return pairs


def cmd_merge(
    target: str,
    pose_path: Path,
    prompts_path: Path,
    custom_path: Path,
    patterns: list[str],
) -> int:
    source_path = pose_path if target == "base" else custom_path
    entries, by_id = load_pose_source(source_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}

    files = resolve_merge_inputs(patterns)
    if not files:
        print("Error: no input files to merge", file=sys.stderr)
        return 1

    staged: dict[str, dict[str, Any]] = {}
    all_errors: list[str] = []

    for fpath in files:
        try:
            pairs = parse_merge_file(fpath)
        except Exception as exc:
            all_errors.append(f"{fpath}: {exc}")
            continue
        for item_id, raw_item in pairs:
            clean_item, errs = validate_item(item_id, raw_item, expected_hashes)
            if errs:
                all_errors.extend(f"{fpath.name}: {e}" for e in errs)
            elif clean_item is not None:
                staged[item_id] = clean_item

    if all_errors:
        print(f"Merge failed with {len(all_errors)} validation error(s):", file=sys.stderr)
        for err in all_errors[:50]:
            print(f"  - {err}", file=sys.stderr)
        if len(all_errors) > 50:
            print(f"  ... and {len(all_errors) - 50} more", file=sys.stderr)
        return 1

    if target == "base":
        doc = load_prompts_doc(prompts_path)
        items = doc["items"]
        added = 0
        updated = 0
        for item_id, clean_item in staged.items():
            if item_id in items:
                updated += 1
            else:
                added += 1
            items[item_id] = clean_item

        order_index = {entry["id"]: idx for idx, entry in enumerate(entries)}
        ordered_items = dict(
            sorted(items.items(), key=lambda kv: (order_index.get(kv[0], len(entries)), kv[0]))
        )
        doc["items"] = ordered_items
        doc["_meta"]["schema_version"] = SCHEMA_VERSION
        doc["_meta"].setdefault("generator", DEFAULT_GENERATOR)
        doc["_meta"]["updated_at"] = utc_now_iso()

        atomic_write_json(prompts_path, doc)
        print(
            f"[base] Merged {len(staged)} item(s) from {len(files)} file(s) into {prompts_path} "
            f"(added={added}, updated={updated}, total={len(ordered_items)}/{len(entries)})"
        )
        return 0

    # target == "custom": preserve all existing fields and original entry ordering.
    updated_entries: list[dict[str, Any]] = []
    updated_count = 0
    for entry in entries:
        eid = entry["id"]
        merged_entry = copy.deepcopy(entry)
        if eid in staged:
            merged_entry.update(staged[eid])
            updated_count += 1
        updated_entries.append(merged_entry)

    atomic_write_json(custom_path, updated_entries)
    print(
        f"[custom] Merged {len(staged)} item(s) from {len(files)} file(s) into {custom_path} "
        f"(updated={updated_count}, total={len(updated_entries)})"
    )
    return 0


def cmd_verify_base(pose_path: Path, prompts_path: Path) -> int:
    entries, by_id = load_pose_source(pose_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}

    if not prompts_path.exists():
        print(f"[base] Verify failed: {prompts_path} does not exist", file=sys.stderr)
        return 1

    doc = load_prompts_doc(prompts_path)
    meta = doc["_meta"]
    items = doc["items"]

    errors: list[str] = []
    if meta.get("schema_version") != SCHEMA_VERSION:
        errors.append(
            f"_meta.schema_version must be {SCHEMA_VERSION}, got {meta.get('schema_version')!r}"
        )
    if not isinstance(meta.get("generator"), str) or not meta["generator"].strip():
        errors.append("_meta.generator must be a non-empty string")
    if not isinstance(meta.get("updated_at"), str) or not meta["updated_at"].strip():
        errors.append("_meta.updated_at must be a non-empty string")

    missing = [entry["id"] for entry in entries if entry["id"] not in items]
    if missing:
        errors.append(
            f"Incomplete coverage: {len(missing)}/{len(entries)} pose-zh.json entries missing "
            f"(first 5: {', '.join(missing[:5])})"
        )

    extra = [eid for eid in items if eid not in by_id]
    if extra:
        errors.append(
            f"Unknown extra ids in pose-prompts-zh.json: {len(extra)} "
            f"(first 5: {', '.join(extra[:5])})"
        )

    for item_id, raw_item in items.items():
        if item_id not in expected_hashes:
            continue
        _, item_errs = validate_item(item_id, raw_item, expected_hashes)
        errors.extend(item_errs)

    if errors:
        print(f"[base] Verify failed with {len(errors)} error(s):", file=sys.stderr)
        for err in errors[:50]:
            print(f"  - {err}", file=sys.stderr)
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more", file=sys.stderr)
        return 1

    print(
        f"[base] Verify passed: {len(items)}/{len(entries)} entries "
        "(100% coverage, Schema v2 valid, zero banned-word or role-prefix violations)."
    )
    return 0


def cmd_verify_custom(custom_path: Path) -> int:
    if not custom_path.exists():
        print(f"[custom] Verify failed: {custom_path} does not exist", file=sys.stderr)
        return 1

    entries, by_id = load_pose_source(custom_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}

    errors: list[str] = []
    for entry in entries:
        _, item_errs = validate_item(entry["id"], entry, expected_hashes)
        errors.extend(item_errs)

    if errors:
        print(f"[custom] Verify failed with {len(errors)} error(s):", file=sys.stderr)
        for err in errors[:50]:
            print(f"  - {err}", file=sys.stderr)
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more", file=sys.stderr)
        return 1

    print(
        f"[custom] Verify passed: {len(entries)}/{len(entries)} entries "
        "(100% coverage, Schema v2 valid, zero banned-word or role-prefix violations)."
    )
    return 0


def cmd_bootstrap_v2_base(
    pose_path: Path,
    prompts_path: Path,
    force: bool = False,
) -> int:
    entries, by_id = load_pose_source(pose_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}
    doc = load_prompts_doc(prompts_path)
    items = doc["items"]

    updated = 0
    skipped = 0
    missing = 0
    for entry in entries:
        eid = entry["id"]
        raw = items.get(eid)
        if not isinstance(raw, dict):
            missing += 1
            continue
        if not force and _is_v2_ready(eid, raw, expected_hashes):
            skipped += 1
            continue
        v2_fields = bootstrap_item_to_v2(eid, raw, entry)
        items[eid] = v2_fields
        updated += 1

    if missing:
        print(
            f"[base] Bootstrap error: {missing} pose-zh.json entries missing from {prompts_path}",
            file=sys.stderr,
        )
        return 1

    order_index = {entry["id"]: idx for idx, entry in enumerate(entries)}
    doc["items"] = dict(
        sorted(items.items(), key=lambda kv: (order_index.get(kv[0], len(entries)), kv[0]))
    )
    doc["_meta"]["schema_version"] = SCHEMA_VERSION
    doc["_meta"].setdefault("generator", DEFAULT_GENERATOR)
    doc["_meta"]["updated_at"] = utc_now_iso()

    atomic_write_json(prompts_path, doc)
    print(
        f"[base] Bootstrapped Schema v2 in {prompts_path}: "
        f"updated={updated}, skipped_already_v2={skipped}, total={len(doc['items'])}"
    )
    return 0


def cmd_bootstrap_v2_custom(custom_path: Path, force: bool = False) -> int:
    entries, by_id = load_pose_source(custom_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}

    updated = 0
    skipped = 0
    out_entries: list[dict[str, Any]] = []
    for entry in entries:
        eid = entry["id"]
        new_entry = copy.deepcopy(entry)
        if not force and _is_v2_ready(eid, new_entry, expected_hashes):
            skipped += 1
        else:
            v2_fields = bootstrap_item_to_v2(eid, new_entry, new_entry)
            new_entry.update(v2_fields)
            updated += 1
        out_entries.append(new_entry)

    atomic_write_json(custom_path, out_entries)
    print(
        f"[custom] Bootstrapped Schema v2 in {custom_path}: "
        f"updated={updated}, skipped_already_v2={skipped}, total={len(out_entries)}"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="Manage Schema v2 pose prompt annotations for pose-zh.json and pose-custom-zh.json."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--status",
        action="store_true",
        help="Print total, v2-valid, and pending counts for the selected target.",
    )
    mode.add_argument(
        "--export-shards",
        type=int,
        metavar="NUM_SHARDS",
        help="Split pending entries evenly into NUM_SHARDS JSON files.",
    )
    mode.add_argument(
        "--merge",
        nargs="+",
        metavar="FILE_OR_GLOB",
        help="Validate and atomically merge shard output JSON files into the target dataset.",
    )
    mode.add_argument(
        "--verify",
        action="store_true",
        help="Verify 100%% coverage, Schema v2 validity, role-prefix rules, and zero banned-word violations.",
    )
    mode.add_argument(
        "--bootstrap-v2",
        action="store_true",
        help="Deterministically populate Schema v2 base_tags_en and roles from existing v1 items.",
    )
    parser.add_argument(
        "--target",
        choices=("base", "custom", "all"),
        default="base",
        help="Target dataset: 'base' (pose-prompts-zh.json), 'custom' (pose-custom-zh.json), or 'all'.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        help="Output directory for --export-shards.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="With --export-shards, export all entries including already v2-valid items.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="With --bootstrap-v2, recompute base_tags_en and roles even for already valid v2 items.",
    )
    parser.add_argument(
        "--pose-file",
        type=Path,
        default=DEFAULT_POSE_PATH,
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--prompts-file",
        type=Path,
        default=DEFAULT_PROMPTS_PATH,
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--custom-file",
        type=Path,
        default=DEFAULT_CUSTOM_PATH,
        help=argparse.SUPPRESS,
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = build_parser()
    args = parser.parse_args(argv)
    custom_path = _resolve_custom_path(args)

    if args.export_shards is not None:
        if args.out_dir is None:
            parser.error("--export-shards requires --out-dir")
        if args.target == "all":
            parser.error("--export-shards requires --target base or --target custom")
        return cmd_export_shards(
            args.target,
            args.pose_file,
            args.prompts_file,
            custom_path,
            args.export_shards,
            args.out_dir,
            export_all=args.all,
        )

    if args.merge is not None:
        if args.target == "all":
            parser.error("--merge requires --target base or --target custom")
        return cmd_merge(args.target, args.pose_file, args.prompts_file, custom_path, args.merge)

    targets = ("base", "custom") if args.target == "all" else (args.target,)

    if args.status:
        rc = 0
        for tgt in targets:
            rc |= cmd_status_base(args.pose_file, args.prompts_file) if tgt == "base" else cmd_status_custom(custom_path)
        return rc

    if args.bootstrap_v2:
        rc = 0
        for tgt in targets:
            if tgt == "base":
                rc |= cmd_bootstrap_v2_base(args.pose_file, args.prompts_file, force=args.force)
            else:
                rc |= cmd_bootstrap_v2_custom(custom_path, force=args.force)
        return rc

    if args.verify:
        rc = 0
        for tgt in targets:
            rc |= cmd_verify_base(args.pose_file, args.prompts_file) if tgt == "base" else cmd_verify_custom(custom_path)
        return rc

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
