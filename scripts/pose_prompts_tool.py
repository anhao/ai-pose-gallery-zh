#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Manage pose prompt annotations for data/pose-zh.json -> data/pose-prompts-zh.json.

Pure Python stdlib tool (zero network/LLM calls) supporting:
  --status
  --export-shards <num_shards> --out-dir <dir>
  --merge <file_or_glob...>
  --verify
"""

from __future__ import annotations

import argparse
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

SCHEMA_VERSION = 1
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


def utc_now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def compute_source_hash(entry: dict[str, Any]) -> str:
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


def load_pose_source(pose_path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
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
    return {
        "_meta": {
            "schema_version": SCHEMA_VERSION,
            "generator": DEFAULT_GENERATOR,
            "updated_at": utc_now_iso(),
        },
        "items": {},
    }


def load_prompts_doc(prompts_path: Path) -> dict[str, Any]:
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
    hits: list[str] = []
    for term, pattern in BANNED_PATTERNS:
        if pattern.search(text):
            hits.append(term)
    return hits


def validate_item(
    item_id: str,
    item: Any,
    expected_hashes: dict[str, str],
) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    if item_id not in expected_hashes:
        errors.append(f"[{item_id}] unknown id not in pose-zh.json")
        return None, errors
    if not isinstance(item, dict):
        errors.append(f"[{item_id}] item must be an object, got {type(item).__name__}")
        return None, errors

    tags_en = item.get("tags_en")
    if not isinstance(tags_en, list) or not tags_en:
        errors.append(f"[{item_id}] 'tags_en' must be a non-empty list of strings")
        clean_tags: list[str] = []
    else:
        clean_tags = []
        for idx, tag in enumerate(tags_en):
            if not isinstance(tag, str) or not tag.strip():
                errors.append(f"[{item_id}] 'tags_en[{idx}]' must be a non-empty string")
            else:
                clean_tags.append(tag.strip())
        if not clean_tags and not errors:
            errors.append(f"[{item_id}] 'tags_en' has no valid tags")

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

    # Check banned non-pose words in English outputs
    banned_hits: set[str] = set()
    for tag in clean_tags:
        banned_hits.update(find_banned_words(tag))
    if clean_natural:
        banned_hits.update(find_banned_words(clean_natural))
    if banned_hits:
        errors.append(
            f"[{item_id}] banned non-pose words detected: {', '.join(sorted(banned_hits))}"
        )

    if errors:
        return None, errors

    return {
        "tags_en": clean_tags,
        "natural_en": clean_natural,
        "prompt_zh": clean_zh,
        "source_hash": expected_hash,
    }, []


def cmd_status(pose_path: Path, prompts_path: Path) -> int:
    entries, by_id = load_pose_source(pose_path)
    doc = load_prompts_doc(prompts_path)
    items = doc["items"]

    total = len(entries)
    completed = sum(1 for eid in by_id if eid in items)
    remaining = total - completed
    extra = [eid for eid in items if eid not in by_id]

    print(f"pose-zh.json total: {total}")
    print(f"pose-prompts-zh.json completed: {completed}")
    print(f"remaining: {remaining}")
    if extra:
        print(f"unknown/extra ids in pose-prompts-zh.json: {len(extra)}")
    return 0


def cmd_export_shards(
    pose_path: Path,
    prompts_path: Path,
    num_shards: int,
    out_dir: Path,
) -> int:
    if num_shards <= 0:
        print("Error: --export-shards must be a positive integer", file=sys.stderr)
        return 1

    entries, _ = load_pose_source(pose_path)
    doc = load_prompts_doc(prompts_path)
    items = doc["items"]

    pending: list[dict[str, Any]] = []
    for entry in entries:
        eid = entry["id"]
        expected_hash = compute_source_hash(entry)
        existing = items.get(eid)
        if isinstance(existing, dict) and existing.get("source_hash") == expected_hash:
            continue
        pending.append(
            {
                "id": eid,
                "体系": entry.get("体系", ""),
                "分类": entry.get("分类", ""),
                "姿势名称": entry.get("姿势名称", ""),
                "角度": entry.get("角度", ""),
                "thumb_path": entry.get("缩略图", ""),
                "source_hash": expected_hash,
            }
        )

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

    print(
        f"Exported {n_pending} pending entries into {num_shards} shards in {out_dir}"
    )
    if written_files:
        print(f"First shard: {written_files[0]} ({len(pending[: base + (1 if rem > 0 else 0)])} items)")
    return 0


def resolve_merge_inputs(patterns: list[str]) -> list[Path]:
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


def cmd_merge(pose_path: Path, prompts_path: Path, patterns: list[str]) -> int:
    entries, by_id = load_pose_source(pose_path)
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

    # Order items deterministically following pose-zh.json order
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
        f"Merged {len(staged)} item(s) from {len(files)} file(s) into {prompts_path} "
        f"(added={added}, updated={updated}, total={len(ordered_items)}/{len(entries)})"
    )
    return 0


def cmd_verify(pose_path: Path, prompts_path: Path) -> int:
    entries, by_id = load_pose_source(pose_path)
    expected_hashes = {eid: compute_source_hash(entry) for eid, entry in by_id.items()}

    if not prompts_path.exists():
        print(f"Verify failed: {prompts_path} does not exist", file=sys.stderr)
        return 1

    doc = load_prompts_doc(prompts_path)
    meta = doc["_meta"]
    items = doc["items"]

    errors: list[str] = []
    if meta.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"_meta.schema_version must be {SCHEMA_VERSION}, got {meta.get('schema_version')!r}")
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
        print(f"Verify failed with {len(errors)} error(s):", file=sys.stderr)
        for err in errors[:50]:
            print(f"  - {err}", file=sys.stderr)
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more", file=sys.stderr)
        return 1

    print(
        f"Verify passed: {len(items)}/{len(entries)} entries (100% coverage, valid schema, zero banned-word violations)."
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage pose prompt annotations for data/pose-zh.json."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--status",
        action="store_true",
        help="Print total entries in pose-zh.json, completed count, and remaining count.",
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
        help="Validate and atomically merge shard output JSON files into data/pose-prompts-zh.json.",
    )
    mode.add_argument(
        "--verify",
        action="store_true",
        help="Verify 100%% coverage of pose-zh.json, schema validity, and zero banned-word violations.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        help="Output directory for --export-shards.",
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
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.export_shards is not None and args.out_dir is None:
        parser.error("--export-shards requires --out-dir")

    if args.status:
        return cmd_status(args.pose_file, args.prompts_file)
    if args.export_shards is not None:
        return cmd_export_shards(args.pose_file, args.prompts_file, args.export_shards, args.out_dir)
    if args.merge is not None:
        return cmd_merge(args.pose_file, args.prompts_file, args.merge)
    if args.verify:
        return cmd_verify(args.pose_file, args.prompts_file)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
