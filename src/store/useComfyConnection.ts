import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { comfyFetch, normalizeComfyBase } from '@/services/aiGenerator'

export type ComfyConnectionState = {
  status: 'notconfigured' | 'unchecked' | 'checking' | 'connected' | 'error' | 'offline'
  checkedAt?: number
  info?: string
  error?: string
}

export const COMFY_CONNECTION_LABELS: Record<ComfyConnectionState['status'], string> = {
  notconfigured: '未配置地址', unchecked: '尚未检测', checking: '检测中…', connected: 'HTTP 可达', error: '连接失败', offline: '浏览器离线',
}
const TOAST_ID = 'comfy-connection-test'
const isOffline = () => navigator.onLine === false

// 根 Provider 持有唯一检测器，页面只注册是否需要检测，不影响生成任务的 WebSocket。
export function useComfyConnection(baseUrl: string, apiKey: string, enabled: boolean) {
  const scope = useMemo(() => Symbol(baseUrl ? apiKey ? 'authenticated-endpoint' : 'anonymous-endpoint' : 'unconfigured-endpoint'), [baseUrl, apiKey])
  const [saved, setSaved] = useState<{ scope: symbol; value: ComfyConnectionState }>()
  const request = useRef<{ controller: AbortController; epoch: number; manual: boolean } | null>(null)
  const epoch = useRef(0)
  const initialStatus = !baseUrl.trim() ? 'notconfigured' : isOffline() ? 'offline' : 'unchecked'
  const connection: ComfyConnectionState = saved?.scope === scope ? saved.value : { status: initialStatus }

  const abort = useCallback(() => {
    epoch.current += 1
    request.current?.controller.abort()
    if (request.current?.manual) toast.dismiss(TOAST_ID)
    request.current = null
    setSaved((previous) => previous?.value.status === 'checking' ? { ...previous, value: { ...previous.value, status: 'unchecked' } } : previous)
  }, [])

  const checkConnection = useCallback(async (manual = false) => {
    if (!enabled || document.visibilityState !== 'visible') return
    if (request.current && !manual) return
    abort()
    if (!baseUrl.trim() || isOffline()) {
      const value: ComfyConnectionState = { status: !baseUrl.trim() ? 'notconfigured' : 'offline' }
      setSaved({ scope, value })
      if (manual) toast.error(COMFY_CONNECTION_LABELS[value.status], { id: TOAST_ID })
      return
    }
    const controller = new AbortController()
    const startedEpoch = epoch.current
    request.current = { controller, epoch: startedEpoch, manual }
    setSaved((previous) => ({ scope, value: { ...(previous?.scope === scope ? previous.value : {}), status: 'checking', error: undefined } }))
    if (manual) toast.loading('正在检测 ComfyUI HTTP 连接…', { id: TOAST_ID })
    const timeout = setTimeout(() => controller.abort('timeout'), 8000)
    const publish = (value: ComfyConnectionState) => {
      if (epoch.current !== startedEpoch) return
      setSaved({ scope, value })
      if (manual) {
        if (value.status === 'connected') toast.success(`HTTP 连接成功：${value.info}`, { id: TOAST_ID })
        else toast.error(value.error || COMFY_CONNECTION_LABELS[value.status], { id: TOAST_ID, duration: 10000 })
      }
    }
    try {
      const response = await comfyFetch(normalizeComfyBase(baseUrl), '/system_stats', { signal: controller.signal }, apiKey, 8000)
      if (!response.ok) {
        publish({ status: 'error', checkedAt: Date.now(), error: response.status === 401 || response.status === 403 ? `鉴权失败（HTTP ${response.status}），请检查 API Key / 鉴权设置` : `HTTP ${response.status}，请检查 ComfyUI 服务与代理` })
        return
      }
      const data = await response.json()
      controller.signal.throwIfAborted()
      if (!data?.system || typeof data.system !== 'object' || Array.isArray(data.system)) {
        publish({ status: 'error', checkedAt: Date.now(), error: '响应不是 ComfyUI system_stats 格式，请检查地址' })
        return
      }
      // 只展示允许的版本字符，避免后端响应或错误文本带出凭据。
      const version = typeof data.system.comfyui_version === 'string' && /^[\d.a-zA-Z_-]{1,40}$/.test(data.system.comfyui_version) && (!apiKey.trim() || !data.system.comfyui_version.includes(apiKey.trim())) ? data.system.comfyui_version : '未知版本'
      publish({ status: 'connected', checkedAt: Date.now(), info: `ComfyUI ${version}` })
    } catch {
      publish({ status: isOffline() ? 'offline' : 'error', checkedAt: Date.now(), error: controller.signal.reason === 'timeout' ? '连接检测超时（8 秒），请检查 ComfyUI 是否忙碌或无响应' : '无法读取 ComfyUI 状态，请检查服务、地址、跨域和本地网络访问权限' })
    } finally {
      clearTimeout(timeout)
      if (request.current?.epoch === startedEpoch) request.current = null
    }
  }, [enabled, baseUrl, apiKey, scope, abort])

  useEffect(() => {
    const activate = () => {
      if (document.visibilityState === 'visible') void checkConnection()
      else abort()
    }
    const offline = () => { abort(); setSaved({ scope, value: { status: baseUrl.trim() ? 'offline' : 'notconfigured' } }) }
    if (!enabled) return abort
    activate()
    const interval = setInterval(activate, 30_000)
    window.addEventListener('online', activate)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', activate)
    return () => {
      abort()
      clearInterval(interval)
      window.removeEventListener('online', activate)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', activate)
    }
  }, [enabled, baseUrl, scope, checkConnection, abort])

  return { comfyConnection: connection, checkComfyConnection: checkConnection }
}
