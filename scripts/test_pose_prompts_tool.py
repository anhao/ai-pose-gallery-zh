#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit and CLI integration tests for scripts/pose_prompts_tool.py (Schema v2)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import pose_prompts_tool as ppt  # noqa: E402


def _make_source_entry(
    eid: str,
    *,
    system: str = "全身单人・标准系",
    category: str = "站姿",
    title: str = "测试姿势",
    angle: str = "正面",
    thumb: str = "thumbs/test.jpg",
    extra: dict | None = None,
) -> dict:
    entry = {
        "id": eid,
        "体系": system,
        "姿势编号": eid,
        "分类": category,
        "姿势名称": title,
        "角度": angle,
        "缩略图": thumb,
        "原图": f"img/{eid}.png",
        "检索": f"{eid} {system} {category}",
    }
    if extra:
        entry.update(extra)
    return entry


class ValidateSchemaV2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.entry_solo = _make_source_entry("solo_001")
        self.entry_pair = _make_source_entry("pair_001", system="双人缠绵", category="立位")
        self.entry_pov = _make_source_entry("custom_pov_001", system="POV第一人称视角", category="POV视角")
        self.hashes = {
            e["id"]: ppt.compute_source_hash(e)
            for e in (self.entry_solo, self.entry_pair, self.entry_pov)
        }

    def _valid_pair_v2(self) -> dict:
        return {
            "base_tags_en": ["2people", "1girl", "1boy", "hetero", "full body", "side view", "facing each other"],
            "roles": [
                {
                    "slot": "girl_1",
                    "gender": "girl",
                    "center": {"x": 0.40, "y": 0.50},
                    "tags_en": ["standing", "standing on one leg", "arms around neck", "looking at another"],
                    "natural_en": "Standing on one leg facing right with arms around partner's neck.",
                },
                {
                    "slot": "boy_1",
                    "gender": "boy",
                    "center": {"x": 0.60, "y": 0.50},
                    "tags_en": ["standing", "holding another's waist", "looking at another"],
                    "natural_en": "Standing upright facing left holding partner's waist.",
                },
            ],
            "tags_en": ["2people", "1girl", "1boy", "full body", "side view", "standing", "facing each other"],
            "natural_en": "Full-body side view of two people standing face-to-face.",
            "prompt_zh": "双人全身侧面站立对视。",
            "source_hash": self.hashes["pair_001"],
        }

    def test_valid_pair_passes(self) -> None:
        clean, errs = ppt.validate_item("pair_001", self._valid_pair_v2(), self.hashes)
        self.assertEqual(errs, [])
        self.assertIsNotNone(clean)
        self.assertEqual([r["slot"] for r in clean["roles"]], ["girl_1", "boy_1"])

    def test_forbids_subject_and_count_prefixes_in_role_tags(self) -> None:
        bad_prefixes = [
            "girl standing",
            "boy kneeling behind",
            "left boy standing in front",
            "right boy hands on hips",
            "first girl straddling",
            "second girl kneeling",
            "woman facing left",
            "man standing",
            "viewer hands on hips",
            "1girl",
            "solo",
            "2people",
        ]
        for bad in bad_prefixes:
            item = self._valid_pair_v2()
            item["roles"][0]["tags_en"] = [bad]
            clean, errs = ppt.validate_item("pair_001", item, self.hashes)
            self.assertIsNone(clean, f"Expected failure for {bad!r}")
            self.assertTrue(
                any("forbidden subject/count prefix" in e for e in errs),
                f"Expected prefix error for {bad!r}, got {errs}",
            )

    def test_allows_legitimate_pose_tags_mentioning_viewer_or_another(self) -> None:
        item = self._valid_pair_v2()
        item["roles"][0]["tags_en"] = [
            "standing on one leg",
            "looking at viewer",
            "looking at another",
            "holding another's waist",
            "hand in hair",
            "closed eyes",
        ]
        clean, errs = ppt.validate_item("pair_001", item, self.hashes)
        self.assertEqual(errs, [])
        self.assertIsNotNone(clean)

    def test_rejects_boy_before_girl_and_bad_slot_names(self) -> None:
        item = self._valid_pair_v2()
        item["roles"] = [item["roles"][1], item["roles"][0]]
        _, errs = ppt.validate_item("pair_001", item, self.hashes)
        self.assertTrue(any("female role must appear before male roles" in e for e in errs))

        item2 = self._valid_pair_v2()
        item2["roles"][0]["slot"] = "girl_2"
        _, errs2 = ppt.validate_item("pair_001", item2, self.hashes)
        self.assertTrue(any("slot must be 'girl_1'" in e for e in errs2))

    def test_rejects_invalid_center_bounds_and_types(self) -> None:
        for bad_center in (
            {"x": -0.1, "y": 0.5},
            {"x": 1.05, "y": 0.5},
            {"x": 0.5, "y": True},
            {"x": 0.5},
        ):
            item = self._valid_pair_v2()
            item["roles"][0]["center"] = bad_center
            _, errs = ppt.validate_item("pair_001", item, self.hashes)
            self.assertTrue(errs, f"Expected error for center {bad_center!r}")

    def test_rejects_banned_words_in_role_and_base(self) -> None:
        item = self._valid_pair_v2()
        item["roles"][0]["tags_en"].append("bikini")
        _, errs = ppt.validate_item("pair_001", item, self.hashes)
        self.assertTrue(any("banned non-pose words" in e for e in errs))

        item2 = self._valid_pair_v2()
        item2["roles"][1]["natural_en"] = "Standing wearing a black suit in bedroom."
        _, errs2 = ppt.validate_item("pair_001", item2, self.hashes)
        self.assertTrue(any("banned non-pose words" in e for e in errs2))

    def test_pov_rejects_extra_boy_role_for_viewer(self) -> None:
        item = {
            "base_tags_en": ["1girl", "pov", "pov hands", "upper body", "front view"],
            "roles": [
                {
                    "slot": "girl_1",
                    "gender": "girl",
                    "center": {"x": 0.5, "y": 0.5},
                    "tags_en": ["leaning forward", "looking at viewer"],
                    "natural_en": "Girl leaning forward looking at viewer.",
                },
                {
                    "slot": "boy_1",
                    "gender": "boy",
                    "center": {"x": 0.5, "y": 0.8},
                    "tags_en": ["hands reaching forward"],
                    "natural_en": "Viewer reaching hands forward.",
                },
            ],
            "tags_en": ["1girl", "pov", "pov hands", "upper body", "front view"],
            "natural_en": "POV shot of girl leaning forward.",
            "prompt_zh": "第一人称视角。",
            "source_hash": self.hashes["custom_pov_001"],
        }
        _, errs = ppt.validate_item("custom_pov_001", item, self.hashes)
        self.assertTrue(any("POV item must only keep viewed subjects" in e for e in errs))


class BootstrapV2Tests(unittest.TestCase):
    def test_bootstrap_single_role(self) -> None:
        meta = _make_source_entry("solo_test")
        raw = {
            "tags_en": ["1girl", "solo", "full body", "front view", "standing", "hand on hip", "looking at viewer"],
            "natural_en": "Full body front view standing with one hand on hip looking at viewer.",
            "prompt_zh": "正面全身站姿叉腰。",
            "source_hash": ppt.compute_source_hash(meta),
        }
        v2 = ppt.bootstrap_item_to_v2("solo_test", raw, meta)
        self.assertEqual(v2["base_tags_en"], ["1girl", "solo", "full body", "front view"])
        self.assertEqual(len(v2["roles"]), 1)
        self.assertEqual(v2["roles"][0]["slot"], "girl_1")
        self.assertEqual(v2["roles"][0]["center"], {"x": 0.5, "y": 0.5})
        self.assertEqual(v2["roles"][0]["tags_en"], ["standing", "hand on hip", "looking at viewer"])

    def test_bootstrap_threesome_strips_prefixes_and_orders_girls_before_boys(self) -> None:
        meta = _make_source_entry("custom_group_003", system="三人/多人NSFW・互动", category="三人互动", angle="侧面")
        raw = {
            "tags_en": [
                "3people",
                "1girl",
                "2boys",
                "full body",
                "side view",
                "standing",
                "girl in center",
                "girl facing left",
                "left boy standing in front",
                "right boy standing behind",
                "girl arms around left boy neck",
                "right boy hands on girl hips",
            ],
            "natural_en": (
                "Full-body side profile of three standing figures in line: "
                "the girl stands in the middle facing left with her arms looped around the front boy's neck, "
                "while the boy on the right stands tightly behind her gripping her hips."
            ),
            "prompt_zh": "侧面全身三人立位：女性居于正中面向左方；右侧男性站于身后扶胯。",
        }
        v2 = ppt.bootstrap_item_to_v2("custom_group_003", raw, meta)
        clean, errs = ppt.validate_item("custom_group_003", v2, {"custom_group_003": ppt.compute_source_hash(meta)})
        self.assertEqual(errs, [], msg=f"Unexpected validation errors: {errs}")
        self.assertIsNotNone(clean)
        self.assertEqual([r["slot"] for r in clean["roles"]], ["girl_1", "boy_1", "boy_2"])
        self.assertEqual(clean["roles"][0]["center"]["x"], 0.5)
        self.assertLess(clean["roles"][1]["center"]["x"], clean["roles"][0]["center"]["x"])
        self.assertGreater(clean["roles"][2]["center"]["x"], clean["roles"][0]["center"]["x"])
        for role in clean["roles"]:
            for tag in role["tags_en"]:
                self.assertFalse(ppt.has_forbidden_role_prefix(tag), f"Forbidden prefix left in {tag!r}")

    def test_bootstrap_pov_keeps_only_viewed_subjects(self) -> None:
        meta = _make_source_entry("custom_pov_009", system="POV第一人称视角", category="POV视角", angle="仰视")
        raw = {
            "tags_en": [
                "2girls",
                "pov",
                "upper body",
                "from below",
                "low angle",
                "both girls leaning over viewer",
                "left girl looking down right",
                "right girl looking down left",
                "hands reaching toward foreground",
            ],
            "natural_en": (
                "First-person POV low-angle view looking up at two girls leaning down closely "
                "from the left and right sides of the frame, both looking down at the viewer."
            ),
            "prompt_zh": "第一人称POV仰视双女视角。",
        }
        v2 = ppt.bootstrap_item_to_v2("custom_pov_009", raw, meta)
        clean, errs = ppt.validate_item("custom_pov_009", v2, {"custom_pov_009": ppt.compute_source_hash(meta)})
        self.assertEqual(errs, [])
        self.assertEqual([r["slot"] for r in clean["roles"]], ["girl_1", "girl_2"])
        self.assertIn("leaning over viewer", clean["roles"][0]["tags_en"])
        self.assertIn("leaning over viewer", clean["roles"][1]["tags_en"])
        self.assertLess(clean["roles"][0]["center"]["x"], clean["roles"][1]["center"]["x"])

    def test_bootstrap_unprefixed_pair_uses_clauses(self) -> None:
        meta = _make_source_entry("pair60_P049_high", system="双人缠绵", category="立位", angle="俯视")
        raw = {
            "tags_en": [
                "2people",
                "1boy",
                "1girl",
                "full body",
                "from above",
                "three-quarter view",
                "standing",
                "both arms around partner's neck",
                "standing on right leg",
                "left leg raised",
                "right hand on partner's waist",
            ],
            "natural_en": (
                "Full-body high-angle three-quarter view of a couple standing in a close hug. "
                "On the left, the woman faces right, standing on her right leg with her left leg bent and wrapped against his thigh and both arms around his neck; "
                "on the right, the man faces left with his right hand on her waist."
            ),
            "prompt_zh": "俯视双人相拥。",
        }
        v2 = ppt.bootstrap_item_to_v2("pair60_P049_high", raw, meta)
        clean, errs = ppt.validate_item("pair60_P049_high", v2, {"pair60_P049_high": ppt.compute_source_hash(meta)})
        self.assertEqual(errs, [])
        self.assertEqual(clean["roles"][0]["center"]["x"], 0.35)
        self.assertEqual(clean["roles"][1]["center"]["x"], 0.65)
        self.assertIn("right hand on partner's waist", clean["roles"][1]["tags_en"])


class CliTargetWorkflowTests(unittest.TestCase):
    def test_base_and_custom_cli_bootstrap_export_merge_verify(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)

            # 1. Base workflow
            pose_file = tmp / "pose-zh.json"
            prompts_file = tmp / "pose-prompts-zh.json"
            e1 = _make_source_entry("b1")
            pose_file.write_text(json.dumps([e1], ensure_ascii=False), encoding="utf-8")
            prompts_v1 = {
                "_meta": {"schema_version": 1, "generator": "test", "updated_at": "2026-01-01T00:00:00Z"},
                "items": {
                    "b1": {
                        "tags_en": ["1girl", "full body", "front view", "standing"],
                        "natural_en": "Standing straight facing viewer.",
                        "prompt_zh": "正面站立。",
                        "source_hash": ppt.compute_source_hash(e1),
                    }
                },
            }
            prompts_file.write_text(json.dumps(prompts_v1, ensure_ascii=False), encoding="utf-8")

            # Verify fails before v2 upgrade
            self.assertEqual(
                ppt.main(["--verify", "--target", "base", "--pose-file", str(pose_file), "--prompts-file", str(prompts_file)]),
                1,
            )
            # Bootstrap -> Verify passes
            self.assertEqual(
                ppt.main(["--bootstrap-v2", "--target", "base", "--pose-file", str(pose_file), "--prompts-file", str(prompts_file)]),
                0,
            )
            self.assertEqual(
                ppt.main(["--verify", "--target", "base", "--pose-file", str(pose_file), "--prompts-file", str(prompts_file)]),
                0,
            )
            bdoc = json.loads(prompts_file.read_text(encoding="utf-8"))
            self.assertEqual(bdoc["_meta"]["schema_version"], 2)

            base_shards_all = tmp / "base_shards_all"
            self.assertEqual(
                ppt.main(["--export-shards", "1", "--out-dir", str(base_shards_all), "--target", "base", "--pose-file", str(pose_file), "--prompts-file", str(prompts_file), "--all"]),
                0,
            )
            base_exported = json.loads((base_shards_all / "shard_001.json").read_text(encoding="utf-8"))
            self.assertEqual(len(base_exported), 1)
            for req_key in ("id", "thumb_path", "orig_path", "base_tags_en", "roles", "tags_en", "natural_en", "prompt_zh", "source_hash"):
                self.assertIn(req_key, base_exported[0])
            # Exported shard item should be directly round-trip mergeable after edits.
            self.assertEqual(
                ppt.main(["--merge", str(base_shards_all / "shard_001.json"), "--target", "base", "--pose-file", str(pose_file), "--prompts-file", str(prompts_file)]),
                0,
            )

            # 2. Custom workflow: bootstrap, export-shards --all, reject bad merge, accept valid merge
            custom_file = tmp / "pose-custom-zh.json"
            c1 = _make_source_entry(
                "c1",
                system="单人NSFW・撩人特写",
                category="跪姿",
                extra={
                    "tags_en": ["1girl", "solo", "full body", "front view", "kneeling"],
                    "natural_en": "Kneeling facing viewer.",
                    "prompt_zh": "正面跪姿。",
                    "is_nsfw": True,
                },
            )
            custom_file.write_text(json.dumps([c1], ensure_ascii=False), encoding="utf-8")

            self.assertEqual(
                ppt.main(["--bootstrap-v2", "--target", "custom", "--custom-file", str(custom_file)]),
                0,
            )
            self.assertEqual(
                ppt.main(["--verify", "--target", "custom", "--custom-file", str(custom_file)]),
                0,
            )

            # Pending shards should be 0 when already v2, and 1 with --all
            shards_pending = tmp / "shards_pending"
            self.assertEqual(
                ppt.main(["--export-shards", "1", "--out-dir", str(shards_pending), "--target", "custom", "--custom-file", str(custom_file)]),
                0,
            )
            self.assertEqual(json.loads((shards_pending / "shard_001.json").read_text(encoding="utf-8")), [])

            shards_all = tmp / "shards_all"
            self.assertEqual(
                ppt.main(["--export-shards", "1", "--out-dir", str(shards_all), "--target", "custom", "--custom-file", str(custom_file), "--all"]),
                0,
            )
            exported = json.loads((shards_all / "shard_001.json").read_text(encoding="utf-8"))
            self.assertEqual(len(exported), 1)
            self.assertEqual(exported[0]["id"], "c1")
            self.assertIn("thumb_path", exported[0])
            self.assertIn("orig_path", exported[0])
            self.assertIn("base_tags_en", exported[0])
            self.assertIn("roles", exported[0])
            self.assertIn("source_hash", exported[0])
            self.assertTrue(exported[0]["base_tags_en"])
            self.assertTrue(exported[0]["roles"])

            # Merge rejects forbidden prefix
            bad_out = tmp / "bad_out.json"
            bad_out.write_text(
                json.dumps(
                    [
                        {
                            "id": "c1",
                            "base_tags_en": ["1girl", "solo", "full body", "front view"],
                            "roles": [
                                {
                                    "slot": "girl_1",
                                    "gender": "girl",
                                    "center": {"x": 0.5, "y": 0.5},
                                    "tags_en": ["girl kneeling"],
                                    "natural_en": "Kneeling.",
                                }
                            ],
                            "tags_en": ["1girl", "solo", "full body", "front view", "kneeling"],
                            "natural_en": "Kneeling facing viewer.",
                            "prompt_zh": "正面跪姿。",
                            "source_hash": exported[0]["source_hash"],
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            self.assertEqual(
                ppt.main(["--merge", str(bad_out), "--target", "custom", "--custom-file", str(custom_file)]),
                1,
            )

            # Valid merge preserves original fields (like is_nsfw, 体系, 检索)
            good_out = tmp / "good_out.json"
            good_out.write_text(
                json.dumps(
                    [
                        {
                            "id": "c1",
                            "base_tags_en": ["1girl", "solo", "full body", "front view"],
                            "roles": [
                                {
                                    "slot": "girl_1",
                                    "gender": "girl",
                                    "center": {"x": 0.5, "y": 0.5},
                                    "tags_en": ["kneeling", "looking at viewer"],
                                    "natural_en": "Kneeling upright looking at the viewer.",
                                }
                            ],
                            "tags_en": ["1girl", "solo", "full body", "front view", "kneeling", "looking at viewer"],
                            "natural_en": "Kneeling facing viewer.",
                            "prompt_zh": "正面跪姿看镜头。",
                            "source_hash": exported[0]["source_hash"],
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            self.assertEqual(
                ppt.main(["--merge", str(good_out), "--target", "custom", "--custom-file", str(custom_file)]),
                0,
            )
            merged_custom = json.loads(custom_file.read_text(encoding="utf-8"))
            self.assertEqual(len(merged_custom), 1)
            self.assertTrue(merged_custom[0]["is_nsfw"])
            self.assertEqual(merged_custom[0]["体系"], "单人NSFW・撩人特写")
            self.assertEqual(merged_custom[0]["roles"][0]["tags_en"], ["kneeling", "looking at viewer"])


if __name__ == "__main__":
    unittest.main()
