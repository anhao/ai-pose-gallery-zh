# -*- coding: utf-8 -*-
"""
ComfyUI 自定义节点入口：AI 角色三合一参考图集 (Pose + Costume + Portrait)
将本仓库克隆至 ComfyUI/custom_nodes/ai-pose-gallery-zh 即可直接在 ComfyUI 内使用。
"""

from .comfyui_plugin import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
    register_routes,
)

WEB_DIRECTORY = "./comfyui_plugin/web"

register_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
