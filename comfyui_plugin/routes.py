# -*- coding: utf-8 -*-
"""ComfyUI 服务端路由：为 ComfyUI 前端选图器提供本地三库 JSON 与图片文件服务。"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
THUMBS_DIR = (ROOT_DIR / "thumbs").resolve()
IMG_DIR = (ROOT_DIR / "img").resolve()

LIBRARY_FILES = {
    "pose": DATA_DIR / "pose-zh.json",
    "costume": DATA_DIR / "costume-zh.json",
    "portrait": DATA_DIR / "portrait-zh.json",
}

_CACHE: dict[str, list[dict]] = {}


def load_library(lib: str) -> list[dict]:
    if lib not in LIBRARY_FILES:
        raise ValueError(f"未知图库类型: {lib}")
    if lib not in _CACHE:
        fp = LIBRARY_FILES[lib]
        if not fp.exists():
            raise FileNotFoundError(f"未找到数据文件: {fp}")
        with open(fp, encoding="utf-8") as f:
            _CACHE[lib] = json.load(f)
    return _CACHE[lib]


def find_item(lib: str, item_id: str) -> dict:
    items = load_library(lib)
    clean_id = (item_id or "").strip()
    for it in items:
        if it.get("id") == clean_id:
            return it
    return items[0]


def resolve_safe_image_path(rel_path: str) -> Path:
    clean = (rel_path or "").strip().lstrip("/")
    candidate = (ROOT_DIR / clean).resolve()
    if not (
        str(candidate).startswith(str(THUMBS_DIR) + "/")
        or str(candidate).startswith(str(IMG_DIR) + "/")
    ):
        raise ValueError("非法图片路径")
    if not candidate.is_file():
        raise FileNotFoundError(f"图片文件不存在: {clean}")
    return candidate


def register_routes() -> None:
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        # 非 ComfyUI 运行环境（如独立脚本检查）直接跳过
        return

    if getattr(PromptServer, "instance", None) is None:
        return

    routes = PromptServer.instance.routes

    @routes.get("/pose_character_atlas/catalogue")
    async def get_catalogue(request):
        lib = request.query.get("library", "pose")
        try:
            items = load_library(lib)
            return web.json_response(
                {"library": lib, "count": len(items), "items": items},
                headers={"Cache-Control": "public, max-age=300"},
            )
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.get("/pose_character_atlas/image")
    async def get_image(request):
        rel = request.query.get("path", "")
        lib = request.query.get("library", "")
        item_id = request.query.get("id", "")
        kind = request.query.get("kind", "thumb")
        try:
            if not rel and lib and item_id:
                item = find_item(lib, item_id)
                rel = item.get("缩略图" if kind == "thumb" else "原图", "")
            path = resolve_safe_image_path(rel)
            return web.FileResponse(
                path,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "X-Content-Type-Options": "nosniff",
                },
            )
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=404)
