import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useStudio } from '@/store/studioStore'
import { COMFY_CONNECTION_LABELS } from '@/store/useComfyConnection'

export function ComfyConnectionStatus({ compact = false }: { compact?: boolean }) {
  const { comfyConnection, checkComfyConnection, setComfyConnectionVisible } = useStudio()
  useEffect(() => {
    setComfyConnectionVisible(true)
    return () => setComfyConnectionVisible(false)
  }, [setComfyConnectionVisible])
  const { status, checkedAt, info, error } = comfyConnection
  return <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs" role="status">
    <Badge variant={status === 'error' ? 'destructive' : status === 'connected' ? 'default' : 'secondary'}>{`ComfyUI · ${COMFY_CONNECTION_LABELS[status]}`}</Badge>
    {compact && checkedAt && <span className="text-muted-foreground">{new Date(checkedAt).toLocaleTimeString()}</span>}
    {!compact && <>
      {info && status === 'connected' && <span>{info}</span>}
      {error && <span className="break-words text-destructive">{error}</span>}
      <span className="text-muted-foreground">{checkedAt ? `最近检测 ${new Date(checkedAt).toLocaleTimeString()}` : '尚无检测记录'}；HTTP 检测不代表任务 WebSocket 已连接</span>
    </>}
    <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={status === 'checking'} onClick={() => void checkComfyConnection(true)}>检测连接</Button>
  </div>
}
