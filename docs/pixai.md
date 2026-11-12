# PixAI 三图生成

在 API 配置中选择 PixAI 并填写 API Key，返回合成台选择 Tsubaki.3 或 Tsubaki.3 Flash，准备人像、服装、姿势各一张图。默认通过本站 `/api/proxy` 上传原始图片，再提交单张生成任务。Key 会经过本站代理与 PixAI，请使用可信部署。

- Tsubaki.3：`2024383379556065549`；模型默认档位为 pro，可选 ultra（需账号支持）。
- Tsubaki.3 Flash：`2050048243034896798`；默认档位为 flash，不发送负向提示词。
- 两款模型共享三图顺序、比例、分辨率和可选 seed；不支持附加图、拼图、任意模型、LoRA 或批量输出。
- 图片每边必须小于 4000 px；超尺寸会等比例缩到最长边 3999 px，处理后每图最多 10 MiB。远程素材必须允许浏览器跨域读取，失败时可下载后上传到槽位。
- 新任务可能短暂不可查询，提交后首分钟内的 404 会退避重试。正常轮询间隔为 2 秒，网络、429 和服务错误采用退避。
- 创建任务不会自动重试。提交结果未知时请先核对 PixAI 任务；取得任务编号后可以只查询恢复，或者确认后放弃本地记录。
- 暂停仅停止本地跟踪并保留记录，不取消服务器任务；暂停状态跨刷新保存。切换渠道后仍按任务原渠道恢复。
- 结果下载成功后保存至 IndexedDB，以渠道、官方地址、任务编号去重；下载、鉴权、网络、超时和持久化错误保留恢复记录。任务和历史快照不含 Key。

开发、预览、Pages Function 与 Worker 共用代理校验。默认仅新增精确 origin `https://api.pixai.art`；不跟随上游重定向。上传缓冲受 10 MiB 限制，并以固定长度字节数组发送，Workers 自动计算 Content-Length。媒体 URL 直接无凭据下载，不开放任意媒体代理。

## 2026-11-12 验证

基准 HEAD：`488939139c69acfe078372b39d4bd0c457dc060e`。

| 环境 / 模型 | 结果 |
| --- | --- |
| Vite 浏览器 / Flash | 三图上传、创建、刷新恢复、下载、本地历史保存通过。任务 `2077568313410979079`，真实档位 flash，paidQuota 5500。 |
| Vite 浏览器 / T3 | 同一组三图生成、刷新恢复、下载与本地历史保存通过。任务 `2077568624975913757`，真实档位 pro，paidQuota 6700；创建至结束约 67 秒。 |
| Cloudflare remote preview | 真实 WebP 上传返回 200 和 media ID；查询已完成任务返回 200，响应 no-store。PixAI 接受了 Workers 固定长度请求体；未抓取上游原始请求头。 |
| 恢复故障演练 | 结果下载网络故障后任务保留；暂停后刷新不查询；切换到 Gemini 后恢复仍查询 PixAI，并成功保存；两条历史保持两个唯一 ID。 |

构建与 lint 通过；自动测试覆盖旧配置、旧 ComfyUI 任务、快照凭据排除、三图顺序、Flash 参数、缩图、代理边界、旧渠道 POST、创建不重试和恢复行为。

实测修正：T3 不接受文档示例中的 standard，返回明确的 422；因此默认不发送 mode，使用模型默认档位。Flash 的模式和负向提示词支持与 T3 有差别，未假定全部相同。

样图是定性检查：服装主要单品与坐姿可辨认；人像相似度和画风遵循仍有主观性，不能据此保证任意三图效果。未覆盖 ultra、所有比例/分辨率、直连 CORS、真实 ComfyUI 服务回归。Cloudflare 验证针对临时远程预览的代理上传和任务 GET，完整前端生成与保存是在 Vite 浏览器环境完成；没有发布到生产。

参考：[图片生成](https://platform.pixai.art/en/docs/api-v2/image/createImage)、[上传](https://platform.pixai.art/en/docs/api/media/uploadMedia)、[模型列表 API](https://api.pixai.art/v2/generation-model/search?usageType=MODEL&keyword=Tsubaki.3)、[T3 实际模式](https://api.pixai.art/v2/generation-model/2024383379556065549/inference-profiles)、[Flash 实际模式](https://api.pixai.art/v2/generation-model/2050048243034896798/inference-profiles)。
