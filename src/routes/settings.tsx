import { createFileRoute, Link } from '@tanstack/react-router'
import {
  CheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  SparklesIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from '@/lib/notifications'
import { Field, Section } from '@/components/common/FormSection'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { detectComfyUi, PROVIDER_META } from '@/services/aiGenerator'
import { testSdCppConnection } from '@/services/sdcpp'
import { useStudio } from '@/store/studioStore'
import type { ImagePassMode, ImageProviderId } from '@/types/gallery'
import { ComfyConnectionStatus } from '@/components/studio/ComfyConnectionStatus'
import { COMFY_CONNECTION_LABELS } from '@/store/useComfyConnection'

export const Route = createFileRoute('/settings')({
  staticData: { title: 'API 配置' },
  component: SettingsPage,
})

const PROVIDER_ORDER: ImageProviderId[] = ['gemini', 'gpt', 'qwen', 'doubao', 'pixai', 'comfyui', 'sdcpp']

function SettingsPage() {
  const { apiConfig, updateApiConfig, updateProviderConfig, comfyConnection } = useStudio()
  const [showKey, setShowKey] = useState(false)
  const [testingComfy, setTestingComfy] = useState(false)
  const [testingSdCpp, setTestingSdCpp] = useState(false)
  const [sdCppInfo, setSdCppInfo] = useState('')

  const pid = apiConfig.activeProvider
  const meta = PROVIDER_META[pid]
  const pCfg = apiConfig.providers[pid]

  const handleDetectComfy = async () => {
    setTestingComfy(true)
    try {
      const found = await detectComfyUi(pCfg.baseUrl, pCfg.apiKey)
      if (!found) {
        toast.error('未找到可用的 ComfyUI（已尝试当前地址、127.0.0.1:8000、127.0.0.1:8188），请确认已启动并检查跨域设置', {
          duration: 10000,
        })
        return
      }
      updateProviderConfig('comfyui', { baseUrl: found.baseUrl })
      toast.success(`已识别：${found.info}（${found.baseUrl}）`)
    } finally {
      setTestingComfy(false)
    }
  }

  const handleTestSdCpp = async () => {
    setTestingSdCpp(true)
    setSdCppInfo('')
    try {
      const info = await testSdCppConnection(pCfg.baseUrl, pCfg.apiKey)
      setSdCppInfo(info)
      toast.success(`已連接：${info}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '連線失敗'
      setSdCppInfo(message)
      toast.error(message, { duration: 10000 })
    } finally {
      setTestingSdCpp(false)
    }
  }

  return (
    <>
      <PageHeader
        title="API 接口配置"
        actions={
          <Button size="sm" asChild>
            <Link to="/studio">
              <SparklesIcon className="size-4" />
              返回合成台
            </Link>
          </Button>
        }
      />

      {/* 五大协议切换标签 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
        {PROVIDER_ORDER.map((id) => {
          const itemMeta = PROVIDER_META[id]
          const isActive = pid === id
          const hasKey =
            id === 'comfyui'
              ? Boolean(apiConfig.providers.comfyui.baseUrl.trim())
              : id === 'sdcpp' ? Boolean(apiConfig.providers.sdcpp.baseUrl.trim())
              : Boolean(apiConfig.providers[id].apiKey.trim())
          return (
            <button
              key={id}
              type="button"
              onClick={() => updateApiConfig({ activeProvider: id })}
              className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                isActive
                  ? 'border-primary bg-primary/6 font-semibold shadow-xs'
                  : 'border-border/60 bg-card hover:bg-muted/40'
              }`}
            >
              <span className="min-w-0"><span className="block truncate text-sm">{itemMeta.name}</span><span className="block text-xs font-normal text-muted-foreground">{id === 'comfyui' ? COMFY_CONNECTION_LABELS[comfyConnection.status] : id === 'sdcpp' ? (hasKey ? 'Server 已設定' : '未設定 Server') : hasKey ? '已配置' : '未配置 Key'}</span></span>
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${
                  (id === 'comfyui' && comfyConnection.status === 'connected') || id === 'sdcpp' && sdCppInfo.includes('· ready ·') ? 'bg-emerald-500' : hasKey ? 'bg-amber-500' : 'bg-muted-foreground/30'
                }`}
                title={id === 'comfyui' ? COMFY_CONNECTION_LABELS[comfyConnection.status] : hasKey ? (id === 'sdcpp' ? '已設定 Server' : '已配置，尚未检测') : '未配置 Key'}
              />
            </button>
          )
        })}
      </div>

      {pid === 'comfyui' && <ComfyConnectionStatus />}

      {/* 当前厂商连接配置 */}
      <Section
        title={`${meta.name} 连接配置`}
        actions={
          <div className="flex items-center gap-1.5">
            {pid === 'comfyui' && (
              <>
                <Button variant="outline" size="sm" onClick={handleDetectComfy} disabled={testingComfy}>
                  <ScanSearchIcon className="size-3.5" />
                  自动识别
                </Button>
              </>
            )}
            {pid === 'sdcpp' && <Button variant="outline" size="sm" onClick={handleTestSdCpp} disabled={testingSdCpp}>{testingSdCpp ? '檢測中…' : '檢測連線'}</Button>}
            <Button variant="ghost" size="sm" asChild>
              <a href={meta.docUrl} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3.5" />
                文档
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                updateProviderConfig(pid, {
                  baseUrl: meta.defaultBaseUrl,
                  model: meta.models[0].value,
                })
                toast.success('已恢复默认')
              }}
            >
              <RotateCcwIcon className="size-3.5" />
              重置
            </Button>
          </div>
        }
      >
        <Field
          label={pid === 'comfyui' ? 'ComfyUI 地址 (Base URL)' : pid === 'sdcpp' ? 'sd-server 地址 (Base URL)' : 'Base URL'}
          hint={
            pid === 'comfyui'
              ? `本地运行本站时填 /comfy（同源代理，无需改跨域设置）；直连时 ComfyUI 需加启动参数 --enable-cors-header "${typeof window !== 'undefined' ? window.location.origin : '*'}"。Desktop 版默认端口 8000，便携版 8188`
              : pid === 'sdcpp' ? '本機預設 http://127.0.0.1:1234；遠端可填 LAN / HTTPS Reverse Proxy URL。Server 原生 API 沒有內建 API Key，遠端請使用 VPN 或具備認證的 Reverse Proxy。'
              : undefined
          }
        >
          <Input
            disabled={pid === 'pixai'}
            type={pid === 'comfyui' ? 'text' : 'url'}
            value={pCfg.baseUrl}
            onChange={(e) => updateProviderConfig(pid, { baseUrl: e.target.value })}
            placeholder={meta.defaultBaseUrl}
          />
        </Field>

        <Field label={pid === 'comfyui' ? 'API Key（可选，本地留空）' : pid === 'sdcpp' ? 'API Key（可選，通常留空）' : 'API Key'}>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              value={pCfg.apiKey}
              onChange={(e) => updateProviderConfig(pid, { apiKey: e.target.value })}
              placeholder={
                pid === 'comfyui'
                  ? '本地 ComfyUI 无需填写，远程鉴权可填 Token'
                  : pid === 'sdcpp' ? '可選：僅供遠端 Reverse Proxy Bearer Token'
                  : '输入 API Key（仅保存在本地浏览器）'
              }
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </Field>

        {pid !== 'comfyui' && (
          <Field label="默认模型 ID">
            <Select
              value={pCfg.model}
              onValueChange={(v) => updateProviderConfig(pid, { model: v })}
            >
              <SelectTrigger className="w-full font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meta.models.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="font-mono text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {pid !== 'comfyui' && pCfg.model === 'custom' && (
          <Field label="自定义模型 ID">
            <Input
              value={pCfg.customModel}
              onChange={(e) => updateProviderConfig(pid, { customModel: e.target.value })}
              placeholder={pid === 'doubao' ? 'ep-2026xxxx 或模型 ID' : '输入模型 ID'}
              className="font-mono text-xs"
            />
          </Field>
        )}
      </Section>

        {pid === 'comfyui' && (
          <p className="text-sm text-muted-foreground">模型由工作流决定。请返回合成台导入工作流，并设置人像、服装和姿势节点。</p>
        )}
        {pid === 'sdcpp' && (
          <div className="rounded-xl border bg-card/60 p-4 sm:p-5" aria-label="SD.cpp model resources">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold">SD.cpp · MiniMax H3 Image / P-H3-Image</div>
              <a className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline" href="https://github.com/biaggii/stable-diffusion.cpp" target="_blank" rel="noreferrer">
                SD.cpp GitHub <ExternalLinkIcon className="size-3.5" />
              </a>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">模型與權重由 sd-server 管理。Studio 在 Generate 時會自動尋找相容權重並載入所選 H3 Built-in Recipe。</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Diffusion Model</div>
                <p className="text-xs text-muted-foreground">Model 24GB · INT8 16–8GB · W4A8</p>
                <a className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline" href="https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/main/diffusion_models" target="_blank" rel="noreferrer">
                  MiniMax H3 Image · diffusion_models <ExternalLinkIcon className="size-3" />
                </a>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium">VAE</div>
                <p className="text-xs text-muted-foreground">MiniMax H3 Image 2D VAE · FP16</p>
                <a className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline break-all" href="https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/main/vae/minimax_h3_image_vae_fp16.safetensors" target="_blank" rel="noreferrer">
                  minimax_h3_image_vae_fp16.safetensors <ExternalLinkIcon className="size-3 shrink-0" />
                </a>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Text Encoder</div>
                <p className="text-xs text-muted-foreground">Model 24GB · INT8 16–8GB · W4A8</p>
                <a className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline break-all" href="https://huggingface.co/PrunaAI/P-Image-OSS-Comfy/resolve/main/text_encoders/p-h3-image_text_encoder_int8_convrot.safetensors" target="_blank" rel="noreferrer">
                  p-h3-image_text_encoder_int8_convrot.safetensors <ExternalLinkIcon className="size-3 shrink-0" />
                </a>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Character Swap LoRA</div>
                <p className="text-xs text-muted-foreground">MiniMax H3 Image / P-H3-Image · default strength 1.0</p>
                <a className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline break-all" href="https://huggingface.co/akatz-ai/MiniMax-H3-Image-Character-Swap-LoRA/resolve/main/h3_image_character_swap_v1.safetensors" target="_blank" rel="noreferrer">
                  h3_image_character_swap_v1.safetensors <ExternalLinkIcon className="size-3 shrink-0" />
                </a>
              </div>
            </div>
            {sdCppInfo && <p className="mt-4 border-t pt-3 text-sm text-muted-foreground" role="status">{sdCppInfo}</p>}
          </div>
        )}

      {/* 全局传输设置 */}
      {pid === 'pixai' && <p className="text-sm text-muted-foreground">支持 Tsubaki.3 和 Tsubaki.3 Flash，每次输出一张。人像、服装、姿势各一图，按原始图片上传；默认启用本站代理。Key 随请求发送到本站代理与 PixAI，请仅在可信部署上使用。</p>}
      {pid !== 'comfyui' && pid !== 'sdcpp' && (
        <Section title="全局请求选项">
          {pid !== 'pixai' && <Field label="参考图传参方式">
            <Select
              value={apiConfig.imagePassMode}
              onValueChange={(v) => updateApiConfig({ imagePassMode: v as ImagePassMode })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="url">传递图片 URL（免上传文件，推荐）</SelectItem>
                <SelectItem value="base64">转 Base64 编码传输</SelectItem>
              </SelectContent>
            </Select>
          </Field>}

          <Field
            label="服务端 CORS 代理 (/api/proxy)"
            hint="默认关闭（浏览器直连）；切换到阿里云百炼 (Qwen)、火山方舟 (Doubao) 或 PixAI 时会自动开启。仅支持白名单域名（可通过服务端环境变量 PROXY_ALLOWED_ORIGINS 扩展）"
          >
            <div className="flex h-9 items-center justify-between rounded-xl border bg-background px-3">
              <span className="text-xs text-muted-foreground">
                {apiConfig.useProxy ? '已启用（解决跨域限制）' : '已关闭（浏览器直连）'}
              </span>
              <Switch
                checked={apiConfig.useProxy}
                onCheckedChange={(v) => updateApiConfig({ useProxy: v })}
              />
            </div>
          </Field>
        </Section>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => toast.success('配置已保存')}>
          <CheckIcon className="size-4" />
          保存配置
        </Button>
      </div>
    </>
  )
}
