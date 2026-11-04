# Codex 本地插件

这是本项目的 Codex 桌面插件，提供姿势检索、多视角浏览、复制与导出。Python 3 是运行依赖；复制到剪贴板当前仅支持 macOS。插件包含独立界面，安装时从完整仓库复制图库素材，不在插件源码中重复提交素材。原始图片和数据的权利范围见仓库根目录 LICENSE 和 README。

## 准备与安装

在包含 `data/`、`img/`、`thumbs/` 的完整仓库中执行（目标目录必须不存在）：

```sh
python3 codex-plugin/prepare.py ~/pose-gallery-local
codex plugin marketplace add ~/pose-gallery-local
codex plugin add ai-pose-gallery-zh@ai-pose-gallery-local
```

重启 Codex，在新会话中打开 AI Pose Gallery。插件从安装包内读取数据；不需要依赖创建者的本机路径。可选 WebP 资源缺失时使用原仓库的缩略图与原图，下载仍使用原图。

## 使用和限制

输入“打开 AI Pose Gallery 中文姿势图库”，或用侧栏入口打开。复制图片依赖 macOS；其他系统可使用下载原图。插件仅监听本机回环地址，服务随 MCP 进程结束。侧栏图标实际尺寸由宿主控制。
