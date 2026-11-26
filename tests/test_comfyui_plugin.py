"""Dependency-free plugin locale/schema/route checks: python -m unittest discover -s tests -p 'test_comfyui_plugin.py'."""
import asyncio
import sys
import types
import unittest
from unittest.mock import patch

from comfyui_plugin import nodes, routes
from comfyui_plugin.i18n import ERROR_TRANSLATIONS, error_message


class PluginTests(unittest.TestCase):
    def test_error_locale_and_substitutions(self):
        for chinese, vietnamese in ERROR_TRANSLATIONS.items():
            suffix = "原始-ID/path" if chinese.endswith(": ") else ""
            error = ValueError(chinese + suffix)
            for language in ("vi", "vi-VN,zh;q=0.9", "VI-vn", "", "zh-CN,vi;q=0.9", "en-US", "vietnamese"):
                self.assertEqual(error_message(error, language), vietnamese + suffix)
        self.assertEqual(error_message(OSError("disk error"), ""), "Không thể xử lý yêu cầu. disk error")

    def test_machine_schema_and_prompts_are_unchanged(self):
        self.assertEqual(list(nodes.NODE_CLASS_MAPPINGS), [
            "PoseGalleryNode", "CostumeGalleryNode", "PortraitGalleryNode", "CharacterRecipeNode"])
        self.assertEqual(nodes.RESIZE_MODES, ["原图尺寸", "指定尺寸（居中裁剪）", "指定尺寸（留白填充）"])
        for cls in nodes.NODE_CLASS_MAPPINGS.values():
            self.assertEqual(cls.CATEGORY, "AI角色三合一参考图集")
            self.assertIn("resize_mode", cls.INPUT_TYPES()["required"])
        self.assertEqual(nodes.PoseGalleryNode.RETURN_NAMES, ("姿势图", "图片ID", "姿势提示词"))
        self.assertEqual(nodes.NODE_DISPLAY_NAME_MAPPINGS["PoseGalleryNode"], "AI 姿势参考图 (Pose Gallery)")
        self.assertEqual(nodes._build_pose_prompts({"姿势名称": "坐姿", "分类": "坐", "体系": "单人"}),
                         ("正面视角，动作：坐姿（单人·坐）", "正面 view, pose: 坐姿 (坐)"))
        self.assertEqual(nodes.CharacterRecipeNode.INPUT_TYPES()["required"]["style_preset"][0], list(nodes.STYLE_PRESETS))

    def test_route_errors_are_request_local_and_keep_status_and_keys(self):
        handlers = {}

        class Registry:
            def get(self, path):
                def register(handler):
                    handlers[path] = handler
                    return handler
                return register

        class Redirect(Exception):
            pass

        web = types.SimpleNamespace(json_response=lambda body, **kwargs: (body, kwargs), HTTPRedirection=Redirect)
        server = types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=Registry())))
        with patch.dict(sys.modules, {"aiohttp": types.SimpleNamespace(web=web), "server": server}):
            routes.register_routes()
        request = types.SimpleNamespace(query={"library": "pose"}, headers={"Accept-Language": "vi"})
        body, options = asyncio.run(handlers["/pose_character_atlas/catalogue"](request))
        self.assertIs(body["items"], routes.load_library("pose"))
        self.assertEqual(body["items"][0]["姿势名称"], "S形站姿・胯部侧顶")
        dictionary, options = asyncio.run(handlers["/pose_character_atlas/i18n/vi"](request))
        self.assertEqual(set(dictionary), {"terms", "poses", "costumes"})
        self.assertEqual(dictionary["terms"]["站姿"], "Tư thế đứng")
        self.assertIn("max-age=300", options["headers"]["Cache-Control"])
        with patch("builtins.open", side_effect=FileNotFoundError("missing dictionary")):
            body, options = asyncio.run(handlers["/pose_character_atlas/i18n/vi"](request))
        self.assertEqual(options["status"], 400)
        self.assertIn("error", body)
        for language, prefix in (("vi-VN", "Loại thư viện không xác định: "), ("zh", "Loại thư viện không xác định: "), ("", "Loại thư viện không xác định: ")):
            for endpoint, query, status in (("catalogue", {"library": "invalid"}, 400),
                                             ("image", {"library": "invalid", "id": "123"}, 404)):
                request = types.SimpleNamespace(query=query, headers={"Accept-Language": language})
                body, options = asyncio.run(handlers["/pose_character_atlas/" + endpoint](request))
                self.assertEqual(body, {"error": prefix + "invalid"})
                self.assertEqual(options["status"], status)

    def test_path_validation_and_execution_errors_keep_chinese_default(self):
        with self.assertRaisesRegex(ValueError, "非法图片路径"):
            routes.resolve_safe_image_path("../private.txt")
        with self.assertRaisesRegex(ValueError, "未知图库类型: invalid"):
            routes.load_library("invalid")


if __name__ == "__main__":
    unittest.main()
